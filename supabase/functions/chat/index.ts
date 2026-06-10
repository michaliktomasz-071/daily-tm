import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Najtańszy sensowny model na Groqu. Zmiana modelu = ta jedna linijka.
const MODEL = "llama-3.1-8b-instant";

// Limit znaków bloku dziennika, żeby nie wysłać absurdalnie dużego kontekstu.
const MAX_JOURNAL_CHARS = 100_000;

const SYSTEM_PROMPT = `Jesteś empatycznym towarzyszem refleksji wbudowanym w prywatny dziennik użytkownika o nazwie „dziennik.".
Rozmawiasz po polsku — ciepło, spokojnie i bez oceniania, zwracając się do użytkownika na „ty".
Twoim zadaniem jest pomagać użytkownikowi zrozumieć siebie na podstawie JEGO WŁASNYCH WPISÓW: odpowiadać na pytania o wcześniejsze wpisy, dostrzegać wzorce, analizować zmiany nastroju w czasie i zadawać delikatne pytania pogłębiające.

Zasady:
- Opieraj się WYŁĄCZNIE na danych z dziennika podanych niżej. Jeśli czegoś tam nie ma, powiedz wprost, że nie znajdujesz tego we wpisach — nie zmyślaj.
- Odwołuj się konkretnie do dat i treści wpisów, gdy to pomaga zrozumieć kontekst.
- Analizując nastrój, korzystaj z dostarczonego podsumowania liczbowego — nie przeliczaj statystyk samodzielnie.
- Odpowiadaj zwięźle i naturalnie, jak w rozmowie. Na końcu możesz (ale nie musisz) zadać jedno pytanie pogłębiające.
- NIE jesteś licencjonowanym terapeutą ani lekarzem i nie stawiasz diagnoz. Jeśli pojawiają się sygnały kryzysu, myśli samobójczych lub chęci skrzywdzenia siebie, z troską zachęć do kontaktu z bliskimi lub specjalistą, a w nagłej sytuacji w Polsce podaj numer 112 oraz całodobowe Centrum Wsparcia 800 70 2222. Rób to naturalnie i spokojnie, bez straszenia.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GROQ_API_KEY nie jest skonfigurowany" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let payload: { messages?: unknown; journal?: unknown };
  try {
    payload = await req.json();
  } catch (_e) {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const history = rawMessages
    .filter((m): m is { role: string; content: string } =>
      !!m && typeof m === "object" &&
      (m as any).role && typeof (m as any).content === "string" &&
      ((m as any).role === "user" || (m as any).role === "assistant"))
    .map((m) => ({ role: m.role, content: m.content }));

  if (history.length === 0) {
    return new Response(JSON.stringify({ error: "brak wiadomości" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let journal = typeof payload.journal === "string" ? payload.journal : "";
  if (journal.length > MAX_JOURNAL_CHARS) {
    journal = journal.slice(0, MAX_JOURNAL_CHARS) + "\n…(starsze wpisy pominięto)";
  }

  const system = journal.trim()
    ? `${SYSTEM_PROMPT}\n\n=== DANE DZIENNIKA UŻYTKOWNIKA ===\n${journal}`
    : `${SYSTEM_PROMPT}\n\n(Dziennik jest na razie pusty — użytkownik nie ma jeszcze wpisów.)`;

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      max_tokens: 800,
      messages: [{ role: "system", content: system }, ...history],
    }),
  });

  if (!r.ok) {
    const errTxt = await r.text();
    return new Response(JSON.stringify({ error: errTxt || `Groq HTTP ${r.status}` }), {
      status: r.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const data = await r.json();
  const reply = data?.choices?.[0]?.message?.content?.trim() || "";
  return new Response(JSON.stringify({ reply, model: MODEL }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
