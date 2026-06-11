# Serwer MCP — dziennik DAILY TM

Cienka nakładka **MCP** (Model Context Protocol) nad REST API dziennika. Daje agentom AI
(Claude i innym) natywny dostęp do trzech operacji: dodawanie wpisu, pytanie do asystenta,
pobieranie wpisu — uwierzytelnianych tym samym **kluczem `dtm_…`** co REST API.

Serwer **niczego nie przelicza sam** — każde narzędzie forwarduje żądanie do Supabase
Edge Function `api`, przekazując nagłówek `Authorization: Bearer dtm_…`. Logika (walidacja
klucza, izolacja per-user, faza księżyca, Groq) zostaje po stronie Supabase.

- Transport: **MCP Streamable HTTP**, tryb bezstanowy (bez sesji/Redis).
- Runtime: **Vercel Node Serverless Function** (`api/mcp.ts`), oficjalny `@modelcontextprotocol/sdk`.
- Endpoint po wdrożeniu: `https://<twoj-projekt>.vercel.app/mcp` (rewrite na `/api/mcp`).

## Narzędzia

| Narzędzie       | Parametry                                             | Działanie                |
| --------------- | ---------------------------------------------------- | ------------------------ |
| `add_entry`     | `text` (wymagane), `mood` 1–5 (opcjonalne)           | `POST /entries`          |
| `ask_assistant` | `question` (wymagane), `date` YYYY-MM-DD (opcjonalne)| `POST /ask`              |
| `get_entry`     | `date` YYYY-MM-DD (opcjonalne)                        | `GET /entries?date=`     |

## Wdrożenie na Vercel

> Maszyna deweloperska tego projektu nie ma Node — wdrażaj przez panel Vercel
> (z repozytorium) albo `vercel` CLI na maszynie z Node.

1. **Import projektu** w Vercel z tego repo.
2. **Root Directory** ustaw na `mcp-server/` (to osobny projekt Node w monorepo).
3. (Opcjonalnie) zmienna środowiskowa **`SUPABASE_API_BASE`** — domyślnie
   `https://chcxkkcnxpwhbhhmqqjy.supabase.co/functions/v1/api`. Ustaw, jeśli zmienisz projekt Supabase.
4. Deploy. Endpoint: `https://<twoj-projekt>.vercel.app/mcp`.

Z CLI (na maszynie z Node):

```bash
cd mcp-server
npm install
vercel deploy --prod
```

## Test po wdrożeniu

Wygeneruj klucz `dtm_…` na stronie dokumentacji (`/dock`) i podstaw poniżej jako `$KEY`,
a adres serwera jako `$URL` (np. `https://twoj-projekt.vercel.app/mcp`).

### MCP Inspector (najwygodniej)

```bash
npx @modelcontextprotocol/inspector
```

W UI wybierz transport **Streamable HTTP**, URL = `$URL`, dodaj nagłówek
`Authorization: Bearer $KEY`, połącz → `tools/list` pokaże 3 narzędzia. Wywołaj `get_entry`.

### Surowy JSON-RPC (curl)

Nagłówek `Accept` **musi** zawierać oba typy (`application/json, text/event-stream`).

```bash
# initialize
curl -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'

# tools/list
curl -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# tools/call → dodaj wpis na dziś
curl -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"add_entry","arguments":{"text":"Wpis z MCP.","mood":4}}}'
```

### Podpięcie do Claude Code

```bash
claude mcp add --transport http dziennik "$URL" --header "Authorization: Bearer $KEY"
```

Następnie w sesji `/mcp` potwierdza narzędzia; poproś agenta np. „dodaj wpis na dziś".

## Konfiguracja JSON (Claude Desktop / klienci generyczni)

```json
{
  "mcpServers": {
    "dziennik": {
      "type": "http",
      "url": "https://<twoj-projekt>.vercel.app/mcp",
      "headers": { "Authorization": "Bearer dtm_twoj_klucz" }
    }
  }
}
```
