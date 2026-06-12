import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Publiczne API DAILY TM — 4 endpointy działające per-użytkownik.
// Uwierzytelnianie: długożyciowy klucz API ("dtm_…") w nagłówku
//   Authorization: Bearer dtm_…  (albo X-API-Key: dtm_…)
// Funkcja jest wdrażana z verify_jwt:false, więc SAMA waliduje klucz.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const MODEL = "llama-3.1-8b-instant"; // jak w funkcji `chat`
const MAX_JOURNAL_CHARS = 100_000;

// Skopiowane z funkcji `chat` — spójny ton asystenta. Świadomie NIE podszywa się
// pod licencjonowanego terapeutę.
const SYSTEM_PROMPT =
  `Jesteś empatycznym towarzyszem refleksji wbudowanym w prywatny dziennik użytkownika o nazwie „dziennik.".
Rozmawiasz po polsku — ciepło, spokojnie i bez oceniania, zwracając się do użytkownika na „ty".
Twoim zadaniem jest pomagać użytkownikowi zrozumieć siebie na podstawie JEGO WŁASNYCH WPISÓW: odpowiadać na pytania o wcześniejsze wpisy, dostrzegać wzorce, analizować zmiany nastroju w czasie i zadawać delikatne pytania pogłębiające.

Zasady:
- Opieraj się WYŁĄCZNIE na danych z dziennika podanych niżej. Jeśli czegoś tam nie ma, powiedz wprost, że nie znajdujesz tego we wpisach — nie zmyślaj.
- Odwołuj się konkretnie do dat i treści wpisów, gdy to pomaga zrozumieć kontekst.
- Analizując nastrój, korzystaj z dostarczonego podsumowania liczbowego — nie przeliczaj statystyk samodzielnie.
- Odpowiadaj zwięźle i naturalnie, jak w rozmowie. Na końcu możesz (ale nie musisz) zadać jedno pytanie pogłębiające.
- NIE jesteś licencjonowanym terapeutą ani lekarzem i nie stawiasz diagnoz. Jeśli pojawiają się sygnały kryzysu, myśli samobójczych lub chęci skrzywdzenia siebie, z troską zachęć do kontaktu z bliskimi lub specjalistą, a w nagłej sytuacji w Polsce podaj numer 112 oraz całodobowe Centrum Wsparcia 800 70 2222. Rób to naturalnie i spokojnie, bez straszenia.`;

// --- Faza księżyca (port z index.html: moonPhaseIndex + MOON) ---
const MOON_KEYS = [
  "new", "waxing_crescent", "first_quarter", "waxing_gibbous",
  "full", "waning_gibbous", "last_quarter", "waning_crescent",
];
function moonPhaseKey(date: Date): string {
  const synodic = 29.53058867;
  const known = Date.UTC(2000, 0, 6, 18, 14, 0) / 86400000;
  const now = date.getTime() / 86400000;
  const age = (((now - known) % synodic) + synodic) % synodic;
  const idx = Math.floor((age / synodic) * 8 + 0.5) % 8;
  return MOON_KEYS[idx];
}

// --- Nastrój: skala 1..5 ↔ klucze MOODS (index.html) ---
const MOOD_BY_SCORE: Record<number, string> = {
  1: "very_bad", 2: "bad", 3: "neutral", 4: "good", 5: "very_good",
};
const SCORE_BY_MOOD: Record<string, number> = {
  very_bad: 1, bad: 2, neutral: 3, good: 4, very_good: 5,
};

// uid jak w aplikacji (index.html:930)
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Liczba całkowita przycięta do [min, max]; wartość spoza zakresu/nie-liczba → default.
function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Zakres dnia [start, end) w UTC dla daty "YYYY-MM-DD" (lub dziś).
function dayRange(dateStr?: string): { start: string; end: string; day: string } {
  let y: number, m: number, d: number;
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    [y, m, d] = dateStr.split("-").map(Number);
  } else {
    const t = new Date();
    y = t.getUTCFullYear();
    m = t.getUTCMonth() + 1;
    d = t.getUTCDate();
  }
  const start = Date.UTC(y, m - 1, d, 0, 0, 0);
  const end = start + 86400000;
  const day = new Date(start).toISOString().slice(0, 10);
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    day,
  };
}

// Czysty kształt wpisu zwracany przez API (mood jako liczba 1..5).
function entryView(r: any) {
  return {
    id: r.id,
    title: r.title || "",
    content: r.content || "",
    mood: SCORE_BY_MOOD[r.mood] ?? null,
    mood_key: r.mood || null,
    tags: r.tags || [],
    moon_phase: r.moon_phase || "new",
    created_at: r.created_at,
  };
}

// Błąd embeddowania zapytania — niesie status HTTP do zwrócenia klientowi.
class EmbedError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Embedding zapytania przez OpenAI (ten sam model co wpisy: text-embedding-3-small).
async function embedQuery(openaiKey: string, text: string): Promise<number[]> {
  const er = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!er.ok) throw new EmbedError(er.status, (await er.text()) || `OpenAI HTTP ${er.status}`);
  const emb = (await er.json())?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new EmbedError(500, "Nie udało się wygenerować embeddingu zapytania.");
  return emb;
}

// Formatuje wpisy zwrócone przez hybrid_search w blok kontekstu dla modelu.
function buildRetrievedJournal(rows: any[]): string {
  if (!rows || rows.length === 0) return "(Brak pasujących wpisów w dzienniku.)";
  return rows.map((e: any) => {
    const score = SCORE_BY_MOOD[e.mood];
    const moodTxt = score ? `nastrój ${score}/5` : "nastrój nieokreślony";
    const fresh = e.source === "recent" || e.source === "both" ? " · (ostatnie dni)" : "";
    const title = e.title ? `${e.title}\n` : "";
    return `### ${e.created_at?.slice(0, 10) || "?"} — ${moodTxt}${fresh}\n${title}${e.content || ""}`;
  }).join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // --- Walidacja klucza API ---
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const token = bearer || req.headers.get("x-api-key") || "";
  if (!token || !token.startsWith("dtm_")) {
    return json({ error: "Brak klucza API. Dodaj nagłówek Authorization: Bearer dtm_…" }, 401);
  }
  const hash = await sha256hex(token);
  const { data: key, error: keyErr } = await admin
    .from("api_keys")
    .select("id, user_id, revoked")
    .eq("token_hash", hash)
    .maybeSingle();
  if (keyErr) return json({ error: "Błąd weryfikacji klucza" }, 500);
  if (!key || key.revoked) {
    return json({ error: "Nieprawidłowy lub odwołany klucz API" }, 401);
  }
  const userId = key.user_id as string;
  // last_used_at — fire-and-forget
  admin.from("api_keys").update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id).then(() => {});

  // --- Routing ---
  const path = new URL(req.url).pathname.replace(/^\/api/, "").replace(/\/+$/, "");
  const method = req.method;

  // 1) POST /api/entries — dodaj wpis na dziś
  if (method === "POST" && (path === "/entries" || path === "")) {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Nieprawidłowy JSON" }, 400); }

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return json({ error: "Pole 'text' jest wymagane." }, 400);

    const row: Record<string, unknown> = {
      id: uid(),
      user_id: userId,
      title: (text.split("\n")[0] || "").slice(0, 80),
      content: text,
      tags: [],
      moon_phase: moonPhaseKey(new Date()),
      created_at: new Date().toISOString(),
    };

    // mood opcjonalny (1..5). Gdy pominięty → nie ustawiamy (DB default 'neutral').
    if (body?.mood !== undefined && body?.mood !== null) {
      const score = Number(body.mood);
      if (!Number.isInteger(score) || score < 1 || score > 5) {
        return json({ error: "Pole 'mood' musi być liczbą całkowitą 1–5." }, 400);
      }
      row.mood = MOOD_BY_SCORE[score];
    }

    const { data, error } = await admin.from("entries").insert(row).select().single();
    if (error) return json({ error: error.message }, 500);
    return json(entryView(data), 201);
  }

  // 3) GET /api/entries — pobierz wpis(y) dnia
  if (method === "GET" && (path === "/entries" || path === "")) {
    const dateStr = new URL(req.url).searchParams.get("date") || undefined;
    const { start, end, day } = dayRange(dateStr);
    const { data, error } = await admin
      .from("entries")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    const entries = (data || []).map(entryView);
    if (entries.length === 0) {
      return json({ date: day, count: 0, entries: [], message: `Brak wpisu na ${day}.` }, 404);
    }
    return json({ date: day, count: entries.length, entries }, 200);
  }

  // 2) POST /api/ask — zapytaj asystenta. Najpierw RAG: wyszukiwanie hybrydowe po całej
  //    bazie (+ kontekst ostatnich dni), potem odpowiedź modelu na podstawie znalezionych wpisów.
  if (method === "POST" && path === "/ask") {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Nieprawidłowy JSON" }, 400); }

    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) return json({ error: "Pole 'question' jest wymagane." }, 400);

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) return json({ error: "GROQ_API_KEY nie jest skonfigurowany" }, 500);
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OPENAI_API_KEY nie jest skonfigurowany" }, 500);

    const matchCount = clampInt(body?.match_count, 1, 50, 12);
    const recentDays = clampInt(body?.recent_days, 0, 90, 7);

    // 1) Embedding pytania + wyszukiwanie hybrydowe (RRF) ograniczone do tego użytkownika.
    let emb: number[];
    try { emb = await embedQuery(openaiKey, question); }
    catch (e) { if (e instanceof EmbedError) return json({ error: e.message }, e.status); throw e; }

    const { data, error } = await admin.rpc("hybrid_search", {
      query_text: question,
      query_embedding: emb,
      p_user_id: userId,
      match_count: matchCount,
      recent_days: recentDays,
    });
    if (error) return json({ error: error.message }, 500);

    const entries = data || [];
    let journal = buildRetrievedJournal(entries);
    if (journal.length > MAX_JOURNAL_CHARS) {
      journal = journal.slice(0, MAX_JOURNAL_CHARS) + "\n…(skrócono)";
    }

    const system = `${SYSTEM_PROMPT}\n\n=== NAJTRAFNIEJSZE WPISY (wyszukiwanie hybrydowe) ===\n${journal}`;

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        max_tokens: 800,
        messages: [
          { role: "system", content: system },
          { role: "user", content: question },
        ],
      }),
    });
    if (!r.ok) {
      const errTxt = await r.text();
      return json({ error: errTxt || `Groq HTTP ${r.status}` }, r.status);
    }
    const out = await r.json();
    const reply = out?.choices?.[0]?.message?.content?.trim() || "";
    return json({ reply, model: MODEL, entries_used: entries.length }, 200);
  }

  // 4) POST /api/search — wyszukiwanie hybrydowe (FTS + wektor, scalane RRF)
  //    + zawsze doklejone wpisy z ostatnich `recent_days` dni (kontekst czasowy).
  if (method === "POST" && path === "/search") {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Nieprawidłowy JSON" }, 400); }

    const q = typeof body?.q === "string" ? body.q.trim() : "";
    if (!q) return json({ error: "Pole 'q' jest wymagane." }, 400);

    const matchCount = clampInt(body?.match_count, 1, 100, 30);
    const recentDays = clampInt(body?.recent_days, 0, 90, 7);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OPENAI_API_KEY nie jest skonfigurowany" }, 500);

    // 1) Embedding zapytania — ten sam model co wpisy (text-embedding-3-small).
    let emb: number[];
    try { emb = await embedQuery(openaiKey, q); }
    catch (e) { if (e instanceof EmbedError) return json({ error: e.message }, e.status); throw e; }

    // 2) RRF (FTS + wektor) + doklejenie ostatnich N dni — w funkcji RPC.
    const { data, error } = await admin.rpc("hybrid_search", {
      query_text: q,
      query_embedding: emb,
      p_user_id: userId,
      match_count: matchCount,
      recent_days: recentDays,
    });
    if (error) return json({ error: error.message }, 500);

    // `source`: 'search' = trafienie wyszukiwania, 'recent' = kontekst 7 dni, 'both' = oba.
    const results = (data || []).map((r: any) => ({
      ...entryView(r),
      score: Number(r.score) || 0,
      source: r.source,
    }));
    return json({ query: q, count: results.length, recent_days: recentDays, results }, 200);
  }

  return json({ error: `Nieznana ścieżka: ${method} ${path || "/"}` }, 404);
});
