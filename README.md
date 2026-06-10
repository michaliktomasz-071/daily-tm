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

> Funkcje AI (transkrypcja, Asystent) wymagają internetu i działają przez
> **Supabase Edge Functions** wołające **Groq** — klucz API nigdy nie trafia do
> przeglądarki. Źródło funkcji `chat` jest w `supabase/functions/chat/`.

## Uruchomienie

Aplikacja nie wymaga instalacji ani kroku budowania. Wystarczy otworzyć plik
[`index.html`](index.html) w przeglądarce (podwójne kliknięcie).

> Korzysta z Reacta ładowanego z CDN, więc do **pierwszego** uruchomienia
> potrzebny jest internet (potem przeglądarka cache'uje biblioteki).

## Pliki

- `index.html` — cała aplikacja front-end (React + style, jeden plik).
- `supabase/functions/chat/` — Edge Function Asystenta (proxy do Groq).
- `PRD.md` — dokument wymagań produktowych.

## Co dalej

Wizualne wykresy nastroju, wyszukiwanie/filtrowanie po nastroju, przypomnienia
o codziennym wpisie, eksport/import danych. Szczegóły w [`PRD.md`](PRD.md).
