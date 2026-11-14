# Przejęcie techniczne — audyt wstępny 2026-11-14

## Zakres potwierdzony

Sprawdzono drzewo main, kod wszystkich tekstowych plików aplikacji, listę
gałęzi i otwartych PR, metadane arkusza TEST oraz wybrane rejestry i formuły.
Nie jest to zakończony audyt backendu, banku, Gmaila ani produkcji.
W publicznym raporcie nie zapisujemy rzeczywistych sald, operacji ani ID plików.

| Obszar | Ustalenie | Dostęp / ograniczenie |
| --- | --- | --- |
| GitHub | repozytorium publiczne, main z frontendem | narzędzie zgłasza admin/push; main bez ochrony |
| Kod backendu | brak na main | stare drafty PR #7/#8 zawierają moduły DEV, nie potwierdzony eksport działającego backendu |
| CI na main | brak plików workflow i testów | dodany kandydat workflow do testów bez deploymentu |
| TEST Sheets | odczyt metadanych i rejestrów działa | nie próbowano zapisu; nie zakładamy prawa zapisu |
| Produkcja Sheets | odnaleziony osobny plik o nazwie budżetu | nie potwierdzono przypięcia backendu; danych nie zmieniano |
| Apps Script TEST | właściciel wskazał projekt DEV z października | metadane dostępne, pobranie treści Drive: 403 |
| Triggery i logi | brak dowodów konfiguracji i wykonań | wymagają dostępu do Apps Script |
| Bank i Gmail | ślady wyników w rejestrach | brak bezpośredniej weryfikacji źródeł i harmonogramów |
| iPhone | manifest PWA, service worker, logowanie Google | brak sesji testowej i rzeczywistego urządzenia |

## Rzeczywiste połączenia widoczne w kodzie

Root index.html uruchamia kod aplikacji po logowaniu przez private-budget.js.
Logowanie Google pobiera token, sprawdza rolę przez RPC, a plik TEST jest
zakodowany w module. Publiczny adres aplikacji nie oznacza zatem odczytu
produkcyjnego arkusza. Faktyczne docelowe ID trzeba potwierdzić w backendzie.
getAccountBalances jest wywoływane przez Apps Script Execution API;
frontend jedynie formatuje row.amount. Kolejka i ręczne wydatki prowadzą
do osobnego wdrożenia /exec. DEV /dev/index.html używa jeszcze innego /dev
i mostu iframe. Nie potwierdzono, czy wszystkie te wdrożenia czytają ten sam TEST.

Rejestr kont ręcznych przechowuje JSON w kolumnie A. Oddzielny rejestr
księgowania przechowuje odniesienia do komórek kategorii i status.
Wypłaty mają rejestr JSON oraz tabelę alertów, z częściowo wspólnymi ID Gmail.
Saldo karty ma BO, zmiany, spłaty i zwroty; formuła wyłącza część powtórzonych
spłat. Sama formuła nie dowodzi poprawności parsera, źródeł ani odporności
zapisu na równoległe wyzwalacze.

## Priorytety i ustalenia

1. **P1 — gotówka:** Wykonanie 2026!U26 zawiera stałą liczbę.
   Zmiana KR_LEDGER_V1 nie przeliczy tej komórki. Nie wykazano jeszcze,
   czy getAccountBalances odczytuje U26, własny cache czy inny rejestr.
   Nie poprawiać tego kolejną ręczną liczbą. Kandydat oblicza BO + transfery
   - wydatki w groszach, z deduplikacją i kontrolą konfliktów.
2. **P1 — izolacja:** root używa TEST w module logowania, a dodatkowe funkcje
   mają różne wdrożenia. Wymagana mapa środowisko → projekt → deployment → arkusz.
3. **P1 — miesiące:** formuła konta wspólnego U28 ma daty listopada 2026
   na stałe oraz częściowy zakres tabeli wypłat. Wymaga osobnego uzgodnienia,
   zanim zmienimy daty lub zakresy; początkowe transakcje mogą być już w BO.
4. **P1 — uprawnienia:** frontend ukrywa przyciski według roli; bez backendu
   nie potwierdzimy sprawdzania właściciela dla każdej operacji zapisu.
5. **P2 — czas:** arkusz TEST ma America/Los_Angeles. Kod frontendowy używa
   lokalnej daty urządzenia. Uzgodnić Europe/Warsaw, datę księgowania i granice
   okresów; nie przestawiać strefy bez sprawdzenia formuł i wyzwalaczy.
6. **P2 — sesje:** krótkożyjący token Google jest zapisywany w localStorage.
   Chronić przed XSS, ustalić wylogowanie, retencję cache, zakresy OAuth
   i rozdzielenie cache użytkowników oraz środowisk. Nie skopiowano tokenów.
7. **P2 — PWA:** cache-first wymaga testu aktualizacji i powrotu z tła na iOS;
   brak dowodu, że odświeżenie po ręcznym wydatku automatycznie odświeża salda.

## Plan realizacji

Etap 1: uzyskać autoryzowany odczyt backendu; sporządzić mapę wdrożeń,
właściwości (tylko nazwy, nie wartości sekretów), OAuth scopes, triggerów,
wykonań i kontraktów API. Pobrać kod i zanonimizowany opis struktury arkuszy.

Etap 2: podłączyć uzgadnianie gotówki w izolowanym TEST po potwierdzeniu BO,
źródeł wpływów, portfela docelowego i korekt. Jedno źródło prawdy dla salda
serwera i widoku. Deduplikacja po trwałym ID, blokada zapisu, jawne statusy
operacji i odtwarzanie po awarii zamiast ponownego naliczania.

Etap 3: karty, przelewy, granice miesiąca/roku, retry, równoległe wykonania,
awarie banku, brak Gmaila, duplikaty z różnych źródeł. Zweryfikować, że transfer
nie staje się wydatkiem, a przeksięgowanie kategorii nie zmienia gotówki drugi raz.

Etap 4: po stabilizacji dopracować istniejący ekran startowy i UX mobilny.
Przeanalizować passkeys/WebAuthn z weryfikacją po stronie serwera, challenge,
origin/RP ID, odzyskiwaniem dostępu i testem Safari/PWA. Obecne OAuth nie jest
uwierzytelnianiem biometrycznym. Nie obiecujemy natywnego Face ID ani lokalnej
blokady ekranu jako zabezpieczenia API.

## Proces wydania

Gałąź robocza → lokalne testy → PR/CI → kopia TEST i backup → test źródło–API–UI
→ raport wyników i zakresu zmiany → akceptacja właściciela → wersja produkcyjna.
Obecny workflow tylko testuje; nie zawiera uprawnień ani komend wdrożeniowych.
Przed produkcją: przegląd sekretów publicznego repo, wymagane checks i ochrona
main, rozdzielone projekty i dane, zapis wersji oraz plan rollbacku. Ochrona
gałęzi i środowisk nie została jeszcze ustawiona.

Rollback kodu nie cofa automatycznie operacji finansowych. Nowe zapisy muszą
mieć dziennik i procedurę wznowienia. Bez usuwania rzeczywistych transakcji.

## Faktycznie wykonane testy

34 testy rdzenia i adapterów na danych syntetycznych: wydatki, niezależność
od kategorii, duplikaty, konflikty ID, transfery, zachowanie sumy środków,
daty, miesiąc/rok, BO, przepełnienie i zgodność kontekstu V8 bez CommonJS.
2 testy integracyjne symulują źródło JSON → rdzeń → istniejące openBalances_
oraz błąd API. Nie są to testy prawdziwego banku, Gmaila ani Apps Script.

Wersja kandydująca: lokalna i gałąź robocza, bez wdrożenia TEST/PROD.
Nie zmieniono arkuszy, realnych transakcji, triggerów, endpointów ani main.
Następny warunek: autoryzowany odczyt projektu Apps Script i ustalenie, czy
wskazany projekt DEV obsługuje używany obecnie TEST.
