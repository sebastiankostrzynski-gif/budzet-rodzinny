# DEV: zabezpieczenia uzgadniania istniejącego inboxu

Zmiana przygotowana do podłączenia. Samo scalenie plików w GitHub **nie zmienia
projektu Apps Script ani nie uruchamia nowej logiki w aplikacji**.

## Zakres

- Przy ponownym imporcie API zachowuje decyzje i szczegółowe powiązania Gmail/API/budżet.
- Rezerwuje ręczne wpisy wykorzystane we wcześniejszych przebiegach.
- Analizuje wszystkie kandydatury przed przypisaniem: konflikt trafia do sprawdzenia.
- Pomija pozycje oznaczone POMIN, zapisane do budżetu, ujęte ręcznie i rozpoznane przez
  istniejący klasyfikator jako techniczne. API powiązane z mailem nie jest drugim zakupem.
- Korzysta z dotychczasowych reguł kwot, walut, dat i sprzedawcy eb70/eb78.
- Bez nowego magazynu, importów, wyzwalaczy, uczenia kategorii, zapisów do budżetu i U47.

## Podłączenie — wyłącznie do izolowanego backendu DEV

1. Dodać `reconciliation-guards.js` jako nowy plik skryptu Apps Script.
2. Zastąpić dokładnie dwie dotychczasowe definicje w module Alerty24 definicjami
   z `reconciliation-integration.gs`. Nie dokładać obok drugich funkcji o tych samych
   nazwach. Dodać unikalne funkcje raportu i diagnostyki z tego samego pliku.
3. W `eb20ImportTransakcjeRobocze` dodać wywołanie z patcha bezpośrednio po
   zachowaniu `v5DecisionClass`, przed `stats.keptDecisions++`.
4. Najpierw wywołać wyłącznie `eb84PodgladBezpiecznegoUzgodnieniaDevV1`.
   Zwraca liczniki; nie zapisuje statusów ani nie uruchamia importu.
5. Zapis statusów i ponowne importy sprawdzać na oddzielnym testowym inboxie
   i testowym arkuszu. Nie stosować tej instrukcji do współdzielonego produkcyjnego
   magazynu tylko dlatego, że strona frontendowa ma adres /dev/.

## Walidacja

`node --test tests/*.test.cjs`

Testy używają wyłącznie sztucznych identyfikatorów i kwot. Test integracyjny wykonuje
rzeczywiste definicje adaptera z atrapami istniejących usług, a tryb podglądu ma
zablokowane wszystkie zapisy. Brak testu na żywych danych do momentu izolacji backendu.

## Dalsze braki

Zapis budżetu (`eb35`) nadal jest blokadą kontrolną. Ten etap nie implementuje
automatycznego księgowania, trwałych identyfikatorów wierszy budżetu ani kategorii
uczących się z akceptacji. Algorytm celowo odkłada niejednoznaczne przypadki do decyzji.
