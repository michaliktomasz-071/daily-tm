import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Najtańszy sensowny model na Groqu. Zmiana modelu = ta jedna linijka.
const MODEL = "llama-3.1-8b-instant";

// Limit znaków bloku dziennika, żeby nie wysłać absurdalnie dużego kontekstu.
const MAX_JOURNAL_CHARS = 100_000;

// Ile najtrafniejszych wpisów pobrać na pytanie + okno kontekstu czasowego (dni).
const MATCH_COUNT = 12;
const RECENT_DAYS = 7;

const SCORE_BY_MOOD: Record<string, number> = {
  very_bad: 1, bad: 2, neutral: 3, good: 4, very_good: 5,
};

const SYSTEM_PROMPT = `Jesteś empatycznym towarzyszem refleksji wbudowanym w prywatny dziennik użytkownika o nazwie „dziennik.".
Rozmawiasz po polsku — ciepło, spokojnie i bez oceniania, zwracając się do użytkownika na „ty".
Twoim zadaniem jest pomagać użytkownikowi zrozumieć siebie na podstawie JEGO WŁASNYCH WPISÓW: odpowiadać na pytania o wcześniejsze wpisy, dostrzegać wzorce, analizować zmiany nastroju w czasie i zadawać delikatne pytania pogłębiające.

Zasady:
- Opieraj się WYŁĄCZNIE na danych z dziennika podanych niżej. Jeśli czegoś tam nie ma, powiedz wprost, że nie znajdujesz tego we wpisach — nie zmyślaj.
- Podane niżej wpisy to najtrafniejsze fragmenty wyszukane pod kątem bieżącego pytania (plus kilka najnowszych) — nie jest to cały dziennik. Jeśli pytanie wymaga wpisów, których tu nie ma, powiedz, że nie widzisz ich w wynikach.
- Odwołuj się konkretnie do dat i treści wpisów, gdy to pomaga zrozumieć kontekst.
- Analizując nastrój, korzystaj z dostarczonego podsumowania liczbowego — nie przeliczaj statystyk samodzielnie.
- Odpowiadaj zwięźle i naturalnie, jak w rozmowie. Na końcu możesz (ale nie musisz) zadać jedno pytanie pogłębiające.
- NIE jesteś licencjonowanym terapeutą ani lekarzem i nie stawiasz diagnoz. Jeśli pojawiają się sygnały kryzysu, myśli samobójczych lub chęci skrzywdzenia siebie, z troską zachęć do kontaktu z bliskimi lub specjalistą, a w nagłej sytuacji w Polsce podaj numer 112 oraz całodobowe Centrum Wsparcia 800 70 2222. Rób to naturalnie i spokojnie, bez straszenia.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
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
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) return json({ error: "GROQ_API_KEY nie jest skonfigurowany" }, 500);
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return json({ error: "OPENAI_API_KEY nie jest skonfigurowany" }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Funkcja jest wdrażana z verify_jwt:true — token jest już zweryfikowany przez platformę.
  // Z tokenu wyłuskujemy user_id, żeby wyszukiwanie ograniczyć do tego użytkownika.
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: "Brak ważnej sesji użytkownika." }, 401);

  let payload: { messages?: unknown; stats?: unknown };
  try {
    payload = await req.json();
  } catch (_e) {
    return json({ error: "invalid JSON body" }, 400);
  }

  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const history = rawMessages
    .filter((m): m is { role: string; content: string } =>
      !!m && typeof m === "object" &&
      (m as any).role && typeof (m as any).content === "string" &&
      ((m as any).role === "user" || (m as any).role === "assistant"))
    .map((m) => ({ role: m.role, content: m.content }));

  if (history.length === 0) return json({ error: "brak wiadomości" }, 400);

  // Pytanie do wyszukania = ostatnia wiadomość użytkownika.
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content?.trim() || "";

  // 1) Embedding pytania (text-embedding-3-small — ten sam model co wpisy).
  let retrieved: any[] = [];
  if (lastUser) {
    try {
      const er = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-small", input: lastUser }),
      });
      if (!er.ok) return json({ error: (await er.text()) || `OpenAI HTTP ${er.status}` }, er.status);
      const emb = (await er.json())?.data?.[0]?.embedding;
      if (!Array.isArray(emb)) return json({ error: "Nie udało się wygenerować embeddingu zapytania." }, 500);

      // 2) Wyszukiwanie hybrydowe (RRF) + ostatnie dni — ograniczone do tego użytkownika.
      const { data, error } = await admin.rpc("hybrid_search", {
        query_text: lastUser,
        query_embedding: emb,
        p_user_id: user.id,
        match_count: MATCH_COUNT,
        recent_days: RECENT_DAYS,
      });
      if (error) return json({ error: error.message }, 500);
      retrieved = data || [];
    } catch (e) {
      return json({ error: (e as Error).message || "Błąd wyszukiwania kontekstu." }, 500);
    }
  }

  const stats = typeof payload.stats === "string" ? payload.stats.trim() : "";
  let journal = buildRetrievedJournal(retrieved);
  if (journal.length > MAX_JOURNAL_CHARS) journal = journal.slice(0, MAX_JOURNAL_CHARS) + "\n…(skrócono)";

  const blocks: string[] = [];
  if (stats) blocks.push(`=== PODSUMOWANIE NASTROJU (cały dziennik) ===\n${stats}`);
  blocks.push(`=== NAJTRAFNIEJSZE WPISY (wyszukane pod bieżące pytanie) ===\n${journal}`);
  const system = `${SYSTEM_PROMPT}\n\n${blocks.join("\n\n")}`;

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      max_tokens: 800,
      messages: [{ role: "system", content: system }, ...history],
    }),
  });

  if (!r.ok) {
    const errTxt = await r.text();
    return json({ error: errTxt || `Groq HTTP ${r.status}` }, r.status);
  }

  const data = await r.json();
  const reply = data?.choices?.[0]?.message?.content?.trim() || "";
  return json({ reply, model: MODEL, entries_used: retrieved.length }, 200);
});
