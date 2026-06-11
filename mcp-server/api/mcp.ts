import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// Serwer MCP dla dziennika DAILY TM.
// To CIENKA NAKŁADKA protokołu: każde narzędzie forwarduje żądanie do istniejącego
// REST API w Supabase (`api`), przekazując ten sam nagłówek Authorization: Bearer dtm_…
// Logika biznesowa (walidacja klucza, izolacja per-user, faza księżyca, Groq) zostaje
// po stronie Supabase — tu nie duplikujemy niczego.

const API_BASE =
  process.env.SUPABASE_API_BASE ||
  "https://chcxkkcnxpwhbhhmqqjy.supabase.co/functions/v1/api";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function buildServer(authHeader: string): McpServer {
  const server = new McpServer({ name: "dziennik-mcp", version: "1.0.0" });

  // Forward do Supabase `api`. Zwraca status + surowe body (JSON).
  async function callApi(
    path: string,
    init: RequestInit = {},
  ): Promise<{ status: number; text: string }> {
    const r = await fetch(API_BASE + path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: authHeader,
      },
    });
    return { status: r.status, text: await r.text() };
  }

  function result(status: number, text: string, okBelow = 400): ToolResult {
    return {
      content: [{ type: "text", text: `HTTP ${status}\n${text}` }],
      isError: status >= okBelow,
    };
  }

  server.tool(
    "add_entry",
    "Dodaj nowy wpis do dziennika na dzisiejszy dzień. Domyślnie wystarczy sam tekst; " +
      "opcjonalnie nastrój w skali 1–5. Faza księżyca liczona automatycznie.",
    {
      text: z.string().min(1).describe("Treść wpisu (wymagane). Pierwsza linia staje się tytułem."),
      mood: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe("Nastrój: 1 = bardzo źle … 5 = bardzo dobrze (opcjonalne)."),
    },
    async ({ text, mood }): Promise<ToolResult> => {
      const body: Record<string, unknown> = { text };
      if (mood !== undefined) body.mood = mood;
      const { status, text: out } = await callApi("/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return result(status, out);
    },
  );

  server.tool(
    "ask_assistant",
    "Zapytaj asystenta — empatycznego towarzysza refleksji — o wpis z danego dnia. " +
      "Odpowiada na podstawie wpisów użytkownika. Nie jest terapeutą ani narzędziem medycznym.",
    {
      question: z.string().min(1).describe("Pytanie do asystenta (wymagane)."),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Dzień, którego wpis ma być kontekstem (YYYY-MM-DD). Domyślnie dziś."),
    },
    async ({ question, date }): Promise<ToolResult> => {
      const body: Record<string, unknown> = { question };
      if (date) body.date = date;
      const { status, text: out } = await callApi("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return result(status, out);
    },
  );

  server.tool(
    "get_entry",
    "Pobierz wpis(y) z danego dnia (domyślnie dziś).",
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Dzień do pobrania (YYYY-MM-DD). Domyślnie dziś."),
    },
    async ({ date }): Promise<ToolResult> => {
      const q = date ? `?date=${encodeURIComponent(date)}` : "";
      const { status, text: out } = await callApi("/entries" + q, { method: "GET" });
      // 404 = brak wpisu na dany dzień — to informacja, nie błąd.
      return {
        content: [{ type: "text", text: `HTTP ${status}\n${out}` }],
        isError: status >= 400 && status !== 404,
      };
    },
  );

  return server;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — na wypadek klientów przeglądarkowych (ruch agent→serwer zwykle jest serwer-serwer).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, mcp-protocol-version, mcp-session-id, accept",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const authHeader = (req.headers["authorization"] as string) || "";
  const server = buildServer(authHeader);

  // Tryb bezstanowy (bez sesji/Redis): nowy transport na każde żądanie.
  // enableJsonResponse: odpowiedź jako pojedynczy application/json zamiast SSE —
  // prostsze i pewniejsze w środowisku serverless (bez długo otwartego streamu).
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    // Vercel sparsował już body (Content-Type: application/json) → przekazujemy je jawnie.
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}
