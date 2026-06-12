# PRD — DAILY TM

> Dokument wymagań produktowych (Product Requirements Document)
> Wersja: 0.2 — Etap 1 (MVP) + Asystent AI
> Data: 2026-06-10

---

## 1. Wprowadzenie

**DAILY TM** to minimalistyczna aplikacja do prowadzenia osobistego dziennika
("journaling"). Użytkownik dodaje krótkie wpisy opisujące swój dzień, nastrój
oraz kontekst (tagi, faza księżyca), a następnie przegląda historię swoich
wpisów.

Inspiracją dla stylu i sposobu interakcji jest aplikacja **Stoic** —
refleksyjna, minimalistyczna, czarno-biała estetyka oparta na dużej, czytelnej
typografii i dużej ilości "oddechu" (whitespace).

### 1.1 Cel produktu
Dać użytkownikowi proste, szybkie i estetyczne miejsce do codziennej refleksji,
bez zbędnych funkcji rozpraszających uwagę.

### 1.2 Zakres tego dokumentu
Dokument opisuje **Etap 1 (MVP)** — pierwszą, działającą wersję aplikacji
z trzema ekranami. Funkcje wykraczające poza ten zakres znajdują się
w sekcji [Poza zakresem](#8-poza-zakresem-etapu-1).

---

## 2. Założenia techniczne

| Obszar              | Decyzja                                                        |
| ------------------- | ------------------------------------------------------------- |
| Platforma           | Aplikacja webowa (responsywna, działa też na ekranie telefonu)|
| Framework           | React                                                         |
| Przechowywanie      | Lokalnie na urządzeniu (`localStorage`) — bez backendu i konta|
| Styl                | Minimalistyczny, czarno-biały, duża typografia (jak Stoic)    |
| Język interfejsu    | Polski                                                        |
| Offline             | Działa w pełni offline (dane lokalne)                         |

> **Uwaga (po Etapie 1):** aplikacja zyskała logowanie i synchronizację wpisów
> przez **Supabase**, a także funkcje AI — **transkrypcję głosową** i **Asystenta**
> (sekcja [5.5](#55-asystent--rozmowa-o-wpisach)). Funkcje AI wymagają internetu i
> działają przez **Supabase Edge Functions** wołające **Groq** (model
> `llama-3.1-8b-instant` dla Asystenta, Whisper dla transkrypcji). Wpisy nadal mają
> lokalny cache, więc przeglądanie historii działa offline; same zapytania do AI — nie.

---

## 3. Persona i scenariusz użycia

**Persona:** Osoba chcąca prowadzić codzienny dziennik refleksji — ceni prostotę,
spokój wizualny i szybkość dodawania wpisu.

**Główny scenariusz:**
1. Użytkownik otwiera aplikację.
2. Dodaje nowy wpis (tytuł, treść, nastrój, tagi — data i faza księżyca dodają
   się automatycznie).
3. Zapisuje wpis.
4. Przegląda listę dotychczasowych wpisów.
5. Klika wybrany wpis, aby zobaczyć jego pełny podgląd.

---

## 4. Model danych — wpis (Entry)

Pojedynczy wpis zawiera:

| Pole          | Typ              | Źródło                | Opis                                            |
| ------------- | ---------------- | --------------------- | ----------------------------------------------- |
| `id`          | string (uuid)    | generowane            | Unikalny identyfikator wpisu                     |
| `title`       | string           | użytkownik            | Tytuł wpisu                                      |
| `content`     | string           | użytkownik            | Treść tekstowa wpisu                             |
| `mood`        | enum             | użytkownik            | Nastrój (skala 5-stopniowa, ikony jak w Stoic)  |
| `tags`        | string[]         | użytkownik            | Lista tagów/kategorii                            |
| `createdAt`   | datetime (ISO)   | automatyczne          | Data i godzina utworzenia                        |
| `moonPhase`   | enum             | automatyczne (wyliczane) | Aktualna faza księżyca w dniu utworzenia     |

### 4.0 Ustawienia aplikacji (Settings)

Przechowywane lokalnie (`localStorage`, klucz `daily_tm_settings_v1`):

| Pole         | Typ       | Domyślnie                              | Opis                                   |
| ------------ | --------- | -------------------------------------- | -------------------------------------- |
| `theme`      | enum      | `light`                                | Motyw kolorystyczny: `light` / `dark`  |
| `categories` | string[]  | `["praca","dom","zakupy","rozrywka"]`  | Lista kategorii tagów                  |

Tagi wpisu (`tags`) wybiera się wyłącznie spośród zdefiniowanych `categories`
— nie tworzy się ich już na ekranie wpisu.

### 4.1 Skala nastroju (`mood`)
Pięć stopni, prezentowane jako proste ikony (linia/łuk), spójne ze Stoic:

`very_bad` · `bad` · `neutral` · `good` · `very_good`

### 4.2 Fazy księżyca (`moonPhase`)
Wyliczane na podstawie daty wpisu (algorytm astronomiczny, bez zewnętrznego API):

`new` (nów) · `waxing_crescent` · `first_quarter` · `waxing_gibbous` ·
`full` (pełnia) · `waning_gibbous` · `last_quarter` · `waning_crescent`

Każda faza ma ikonę i nazwę po polsku.

---

## 5. Ekrany (Etap 1)

### 5.1 Ekran 1 — Dodawanie wpisu

**Cel:** szybkie utworzenie nowego wpisu.

**Elementy:**
- Nagłówek (np. „nowy wpis").
- Pole tytułu.
- Pole treści (wieloliniowe, textarea).
- Wybór nastroju (5 ikon do wyboru, pojedynczy wybór).
- Wybór tagów spośród kategorii zdefiniowanych w ustawieniach (chipy pod
  nastrojami; bez możliwości tworzenia nowych tagów tutaj).
- Informacja o automatycznie dołączanych danych: aktualna data/godzina oraz
  faza księżyca (wyświetlone, ale nieedytowalne).
- Przycisk **Zapisz**.
- Możliwość anulowania / powrotu.

**Zachowanie:**
- Po zapisaniu wpis trafia do `localStorage` i użytkownik wraca do listy wpisów.
- Walidacja: zapis możliwy, gdy istnieje przynajmniej tytuł **lub** treść.

---

### 5.2 Ekran 2 — Lista wpisów

**Cel:** przeglądanie historii wpisów.

**Elementy:**
- Nagłówek (np. „twoje wpisy" / „dziennik") z ikoną **ustawień** (prawy górny róg).
- **Belka tagów** pod nagłówkiem: chip „Wszystkie" + kategorie z ustawień;
  kliknięcie filtruje listę wpisów po wybranym tagu.
- Lista wpisów posortowana od najnowszego do najstarszego.
- Każdy element listy pokazuje: tytuł (lub fragment treści), datę, ikonę nastroju,
  ikonę fazy księżyca, ewentualnie tagi.
- Przycisk/akcja dodania nowego wpisu (przejście do Ekranu 1).
- **Sortowanie** wpisów: domyślnie od najnowszego; dodatkowo możliwość
  sortowania/grupowania po fazie księżyca.
- Stan pusty (gdy brak wpisów) — zachęta do dodania pierwszego wpisu.

**Zachowanie:**
- Kliknięcie wpisu otwiera Ekran 3 (podgląd).
- Zmiana trybu sortowania przestawia kolejność listy bez przeładowania.

---

### 5.3 Ekran 3 — Podgląd wpisu

**Cel:** pełny widok pojedynczego wpisu.

**Elementy:**
- Tytuł.
- Pełna treść.
- Nastrój (ikona + opis).
- Faza księżyca (ikona + nazwa).
- Data i godzina utworzenia.
- Tagi.
- Powrót do listy.
- Ikona **Edytuj** (ołówek) — otwiera formularz edycji wpisu.
- Przycisk **Usuń** wpis.

**Zachowanie:**
- Usunięcie wpisu prosi o potwierdzenie, usuwa go z `localStorage`
  i wraca do listy.
- Edycja otwiera ten sam formularz co dodawanie, wypełniony danymi wpisu;
  można zmienić tytuł, treść, nastrój i tagi. Data utworzenia oraz faza
  księżyca pozostają niezmienione. Po zapisaniu następuje powrót do podglądu.

---

### 5.4 Ekran 4 — Ustawienia

**Cel:** konfiguracja aplikacji.

**Elementy:**
- Powrót do listy.
- **Motyw** — przełącznik Jasny / Ciemny (z ikonami słońca/księżyca).
- **Kategorie tagów** — lista kategorii z możliwością usuwania oraz pole
  dodawania nowej kategorii.

**Zachowanie:**
- Zmiana motywu natychmiast przełącza kolorystykę całej aplikacji i jest
  zapamiętywana.
- Kategorie zasilają belkę tagów na liście oraz wybór tagów na ekranie wpisu.

---

### 5.5 Asystent — rozmowa o wpisach

**Cel:** prywatna rozmowa o własnych wpisach — odpowiadanie na pytania,
dostrzeganie wzorców i analiza zmian nastroju w czasie. Asystent pełni rolę
empatycznego towarzysza refleksji — **nie jest terapeutą ani narzędziem
medycznym**.

**Wejście:** dolny pasek **„Zapytaj asystenta…"** (mobile i desktop). Kliknięcie
otwiera nakładkę rozmowy; ikona **mikrofonu** otwiera ją i od razu rozpoczyna
dyktowanie pytania (ta sama transkrypcja głosowa Groq Whisper co w formularzu wpisu).

**Elementy nakładki:**
- Nagłówek „Asystent" + przycisk zamknięcia oraz **„Wyczyść"** (kasuje wątek).
- Krótka nota: rozmowa o wpisach, narzędzie do refleksji — **nie zastępuje
  kontaktu ze specjalistą**.
- Historia rozmowy w formie dymków (pytanie użytkownika / odpowiedź asystenta).
- Pole tekstowe + mikrofon + przycisk wysłania.

**Zachowanie:**
- Kontekst dla modelu powstaje **dwuetapowo (RAG)**: **statystyki nastroju**
  (średnia, rozkład, średnie miesięczne) liczy **klient** z całego dziennika — dzięki
  temu analiza liczbowa jest dokładna, a nie zgadywana; natomiast **wpisy** do kontekstu
  dobiera **serwer** (Edge Function `chat`) przez **wyszukiwanie hybrydowe** `hybrid_search`
  na podstawie bieżącego pytania (najtrafniejsze + ostatnie 7 dni). Wcześniej wysyłano cały
  dziennik — teraz tylko zwarte statystyki + dobrane wpisy.
- Odpowiedzi opierają się **wyłącznie** na wpisach użytkownika; przy braku danych
  asystent mówi o tym wprost (nie zmyśla).
- W razie sygnałów kryzysu asystent spokojnie kieruje do bliskich/specjalisty
  i podaje numery wsparcia (112, całodobowe Centrum Wsparcia 800 70 2222).
- Historia rozmowy jest zapamiętywana lokalnie (`localStorage`, klucz
  `daily_tm_chat_v1`) i przetrwa odświeżenie strony.
- Zapytanie idzie przez Supabase Edge Function `chat` → Groq, więc **wymaga
  internetu**. Treść wpisów opuszcza urządzenie tylko na czas wygenerowania
  odpowiedzi (zewnętrzny dostawca inferencji — Groq).

---

### 5.6 Publiczne API + strona dokumentacji (`/dock`)

**Cel:** udostępnić dziennik innym **deweloperom i agentom AI** przez proste,
działające **per-użytkownik** API, wraz z czytelną dokumentacją (dobry developer/
agent experience).

**Uwierzytelnianie:** długożyciowy **klucz API** w formacie `dtm_…`, generowany
na stronie dokumentacji po zalogowaniu (ten sam login co w aplikacji). Klucz
jednoznacznie wskazuje użytkownika — nie przekazuje się żadnego ID. Przechowywany
jest wyłącznie jako skrót (SHA-256) w tabeli `api_keys` (RLS: użytkownik widzi/usuwa
tylko własne klucze). Dołączany jako `Authorization: Bearer dtm_…`. Brak/zły klucz → `401`.

**Endpointy** (Supabase Edge Function `api`, `verify_jwt:false`, walidacja klucza
po stronie funkcji, dostęp do danych przez service role ograniczony do `user_id`):

| Metoda + ścieżka            | Opis                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `POST /entries`             | Dodaj wpis na dziś. Body: `text` (wymagane), `mood` 1–5 (opcjonalne; pominięty → nie ustawiany). Faza księżyca liczona z daty. |
| `POST /ask`                 | Zapytaj asystenta (**RAG**). Body: `question` (wymagane), `match_count` 1–50 (opc., dom. 12), `recent_days` 0–90 (opc., dom. 7). Najpierw `hybrid_search` po całej bazie pod kątem pytania, kontekstem są najtrafniejsze wpisy + ostatnie dni. Wymaga `OPENAI_API_KEY`. |
| `GET /entries?date=…`       | Pobierz wpis(y) dnia (domyślnie dziś). Brak → `404`.                  |
| `POST /search`              | Wyszukiwanie **hybrydowe**: pełnotekstowe (`tsvector` `simple`+`unaccent`) + wektorowe (pgvector, embeddingi OpenAI `text-embedding-3-small`) scalane metodą RRF w funkcji `hybrid_search`. Body: `q` (wymagane), `match_count` 1–100 (dom. 30), `recent_days` 0–90 (dom. 7). **Zawsze dokleja wpisy z ostatnich `recent_days` dni** (kontekst czasowy). Każdy wynik: `score` + `source` (`search` / `recent` / `both`). Wymaga sekretu `OPENAI_API_KEY`. |

**Strona `/dock`:** statyczna (`dock/index.html`), w stylu dokumentacji Vercela
(czarno-biała, zgodna z motywem aplikacji). Zawiera **wspólny pasek z generatorem
klucza API** oraz dwie zakładki: **API** (pełny opis 4 endpointów: parametry,
przykłady curl/JS, odpowiedzi, sekcja maszynowa OpenAPI/`llms.txt`) i **MCP**
(placeholder „wkrótce" — przyszła nakładka MCP nad tym samym API).

**Serwer MCP (dla agentów AI):** te same trzy operacje są wystawione jako narzędzia
**MCP** — `add_entry`, `ask_assistant`, `get_entry` — żeby agenci (np. Claude) mieli
natywny, „wkleić-i-działa" dostęp, bez ręcznego sklejania HTTP. Serwer to **cienka
nakładka** protokołu MCP (Streamable HTTP) nad powyższym API: każde narzędzie forwarduje
do `api` z tym samym kluczem `dtm_…`. Hosting: **Vercel** (kod w `mcp-server/`).
Zakładka **MCP** na `/dock` zawiera pole na adres serwera oraz gotowe konfiguracje
(`claude mcp add`, JSON dla Claude Desktop).

**Wejście z aplikacji:** ikona **dzienniczka** w nagłówku listy wpisów prowadzi
do `/dock`.

---

## 6. Nawigacja

```
[Lista wpisów] ──(＋ nowy)──────► [Dodawanie wpisu] ──(zapisz)──► [Lista wpisów]
       │
       ├──(klik wpis)──────────► [Podgląd wpisu]   ──(powrót)──► [Lista wpisów]
       │
       └──(ikona ustawień)─────► [Ustawienia]      ──(powrót)──► [Lista wpisów]
```

Ekran startowy aplikacji: **Lista wpisów**.

---

## 7. Wymagania niefunkcjonalne

- **Styl wizualny:** czarno-biały, minimalistyczny, duża i czytelna typografia,
  dużo whitespace (inspiracja Stoic).
- **Responsywność:** poprawne wyświetlanie na ekranie telefonu i desktopie.
- **Wydajność:** natychmiastowe działanie (dane lokalne).
- **Trwałość danych:** wpisy zachowane między sesjami (`localStorage`).
- **Brak kont/logowania** w Etapie 1.

---

## 8. Poza zakresem (Etapu 1)

Następujące elementy **nie** są częścią pierwszego etapu, ale mogą pojawić się
później:

- Wyszukiwanie i filtrowanie po nastroju (filtr po tagach oraz sortowanie po
  fazie księżyca są już w Etapie 1).
- ~~Statystyki/wykresy nastroju w czasie~~ — częściowo zrealizowane: Asystent
  ([5.5](#55-asystent--rozmowa-o-wpisach)) liczy i omawia statystyki nastroju;
  wykresy wizualne nadal poza zakresem.
- ~~Synchronizacja w chmurze, konta użytkowników~~ — zrealizowane po Etapie 1
  (Supabase: logowanie + synchronizacja wpisów).
- Powiadomienia/przypomnienia o codziennym wpisie.
- Eksport/import danych.
- Ćwiczenia, medytacje, cytaty (jak w pełnym Stoic).

---

## 9. Kryteria akceptacji Etapu 1

- [ ] Użytkownik może dodać wpis z tytułem, treścią, nastrojem i tagami.
- [ ] Data/godzina oraz faza księżyca dołączają się automatycznie.
- [ ] Wpis zapisuje się lokalnie i przetrwa odświeżenie strony.
- [ ] Lista wpisów wyświetla wszystkie wpisy posortowane od najnowszego.
- [ ] Można przełączyć sortowanie listy na grupowanie po fazie księżyca.
- [ ] Kliknięcie wpisu otwiera jego pełny podgląd.
- [ ] Można edytować wpis (treść, nastrój, tagi) z poziomu podglądu.
- [ ] Można usunąć wpis (z potwierdzeniem) z poziomu podglądu.
- [ ] Ikona ustawień otwiera ekran ustawień.
- [ ] Można przełączyć motyw jasny/ciemny (zapamiętywany).
- [ ] Można dodawać i usuwać kategorie tagów; belka tagów filtruje listę.
- [ ] Tagi wpisu wybiera się tylko spośród kategorii z ustawień.
- [ ] Interfejs jest czarno-biały, minimalistyczny i responsywny.

### Asystent (po Etapie 1)

- [ ] Pasek „Zapytaj asystenta…" otwiera nakładkę rozmowy (klik oraz mikrofon).
- [ ] Asystent odpowiada na pytania o wpisy i analizuje nastrój na podstawie
      policzonych statystyk (np. podaje średnią i rozkład).
- [ ] Odpowiedzi opierają się wyłącznie na wpisach użytkownika.
- [ ] Historia rozmowy przetrwa odświeżenie strony; „Wyczyść" ją kasuje.
- [ ] Nakładka wyświetla notę „nie zastępuje kontaktu ze specjalistą".
