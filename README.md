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

## Uruchomienie

Aplikacja nie wymaga instalacji ani kroku budowania. Wystarczy otworzyć plik
[`index.html`](index.html) w przeglądarce (podwójne kliknięcie).

> Korzysta z Reacta ładowanego z CDN, więc do **pierwszego** uruchomienia
> potrzebny jest internet (potem przeglądarka cache'uje biblioteki).

## Pliki

- `index.html` — cała aplikacja (React + style, jeden plik).
- `PRD.md` — dokument wymagań produktowych.

## Co dalej (poza Etapem 1)

Edycja wpisu, wyszukiwanie/filtrowanie po tagach i nastroju, statystyki nastroju,
synchronizacja w chmurze, przypomnienia. Szczegóły w [`PRD.md`](PRD.md).
