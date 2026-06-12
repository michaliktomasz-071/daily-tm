# DAILY TM

Minimalistyczna aplikacja-dziennik (journaling), inspirowana stylem **Stoic** —
czarno-biała, duża typografia, dużo przestrzeni.

## Etap 1 (MVP) — co działa

- **Dodawanie wpisu** — tytuł, treść, nastrój (5 stopni), tagi.
  Data/godzina oraz **faza księżyca** dołączają się automatycznie.
- **Lista wpisów** — sortowanie *od najnowszego* lub *wg fazy księżyca*.
- **Podgląd wpisu** — pełny widok + **edycja** (treść, nastrój, tagi)
  i **usuwanie** (z potwierdzeniem).
- **Ustawienia** (ikona w prawym górnym rogu) — przełącznik motywu
  **jasny / ciemny** oraz zarządzanie **kategoriami tagów**.
- **Belka tagów** na liście filtruje wpisy; tagi wpisu wybiera się spośród
  zdefiniowanych kategorii.
- Ikony interfejsu i nastrojów pochodzą z biblioteki [Lucide](https://lucide.dev).
- Dane zapisywane lokalnie w przeglądarce (`localStorage`), działa offline.

## Po Etapie 1 — co doszło

- **Logowanie i synchronizacja** wpisów przez **Supabase** (wpisy mają też lokalny cache).
- **Transkrypcja głosowa** — dyktowanie treści wpisu (Groq Whisper).
- **Asystent** — rozmowa o własnych wpisach przez dolny pasek „Zapytaj asystenta…":
  odpowiada na pytania i analizuje zmiany nastroju w czasie (empatyczny towarzysz
  refleksji, **nie zastępuje specjalisty**). Działa na modelu Groq
  `llama-3.1-8b-instant`; historia rozmowy w `localStorage`.
- **Zdjęcia we wpisach** — opcjonalne zdjęcia (jedno lub kilka) dodawane w edytorze
  (ikona obrazka obok mikrofonu) i pokazywane **nad treścią** w podglądzie. Wpis może
  mieć samo zdjęcie, sam tekst albo oba. Pliki trzymane są w **prywatnym** buckecie
  **Supabase Storage** (`entry-photos`, dostęp tylko właściciela), zmniejszane w
  przeglądarce przed wysłaniem, a podgląd korzysta z krótkotrwałych podpisanych URL-i.

> Funkcje AI (transkrypcja, Asystent) wymagają internetu i działają przez
> **Supabase Edge Functions** wołające **Groq** — klucz API nigdy nie trafia do
> przeglądarki. Źródło funkcji `chat` jest w `supabase/functions/chat/`.

## Publiczne API + dokumentacja (`/dock`)

Dziennik wystawia proste **API REST** (per-użytkownik), żeby inni deweloperzy lub
agenci AI mogli z niego korzystać. Pełny opis jest na stronie **`/dock`** (ikona
dzienniczka w nagłówku aplikacji), w stylu dokumentacji Vercela.

- Uwierzytelnianie: długożyciowy **klucz API** `dtm_…` (generowany na `/dock` po
  zalogowaniu), nagłówek `Authorization: Bearer dtm_…`.
- `POST /entries` — dodaj wpis na dziś (`text` wymagane, `mood` 1–5 opcjonalne).
- `POST /ask` — zapytaj asystenta (RAG): najpierw **wyszukiwanie hybrydowe** po całej
  bazie pod kątem pytania, potem odpowiedź na podstawie znalezionych wpisów (`question`
  wymagane, `match_count`/`recent_days` opcjonalne).
- `GET /entries?date=YYYY-MM-DD` — pobierz wpis dnia (domyślnie dziś).
- `POST /search` — wyszukiwanie **hybrydowe** (pełnotekstowe + wektorowe, scalane RRF;
  `q` wymagane, `match_count`/`recent_days` opcjonalne). Do wyników zawsze dokleja wpisy
  z ostatnich `recent_days` dni (domyślnie 7). Każdy wynik ma `score` i `source`
  (`search` / `recent` / `both`).

Backend: Edge Function `api` (`supabase/functions/api/`), klucze w tabeli `api_keys`
(przechowywany tylko hash). Wyszukiwanie semantyczne korzysta z embeddingów OpenAI
`text-embedding-3-small` (kolumna `entries.embedding`, pgvector) i wymaga sekretu
`OPENAI_API_KEY` w Edge Functions.

### Serwer MCP (dla agentów AI)

Te same trzy operacje są też dostępne jako **narzędzia MCP** (`add_entry`,
`ask_assistant`, `get_entry`), żeby agenci (np. Claude) mieli natywny dostęp. Serwer to
cienka nakładka MCP nad powyższym API (ten sam klucz `dtm_…`), wdrażana na **Vercel** —
kod i runbook w katalogu [`mcp-server/`](mcp-server/). Instrukcja podłączenia i adres
serwera są w zakładce **MCP** na `/dock`.

## Uruchomienie

Aplikacja nie wymaga instalacji ani kroku budowania. Wystarczy otworzyć plik
[`index.html`](index.html) w przeglądarce (podwójne kliknięcie).

> Korzysta z Reacta ładowanego z CDN, więc do **pierwszego** uruchomienia
> potrzebny jest internet (potem przeglądarka cache'uje biblioteki).

## Pliki

- `index.html` — cała aplikacja front-end (React + style, jeden plik).
- `dock/index.html` — strona dokumentacji API (`/dock`).
- `supabase/functions/chat/` — Edge Function Asystenta (proxy do Groq).
- `supabase/functions/api/` — Edge Function publicznego API (4 endpointy).
- `mcp-server/` — serwer MCP (Vercel) — nakładka nad API dla agentów AI.
- `PRD.md` — dokument wymagań produktowych.

## Co dalej

Wizualne wykresy nastroju, wyszukiwanie/filtrowanie po nastroju, przypomnienia
o codziennym wpisie, eksport/import danych. Szczegóły w [`PRD.md`](PRD.md).
