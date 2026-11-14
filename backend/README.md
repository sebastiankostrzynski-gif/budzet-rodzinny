# Backend: status i zasady

`core/cash-reconciliation.js` jest kandydatem do integracji, bez operacji I/O.
Nie jest eksportem działającego projektu Google Apps Script i nie został wdrożony.
Moduł obsługuje zaobserwowane schematy KR_LEDGER_V1, KR_CASH_EMAIL_V1
oraz tabelę alertów bankomatowych. Nieznane rodzaje operacji i konflikty ID
blokują obliczenie zamiast zwracać pozornie poprawne saldo.

Adapter musi jawnie wskazać portfel docelowy wypłaty. Nie wolno automatycznie
uznać każdej wypłaty R2 za gotówkę wspólną bez weryfikacji reguły backendu.
BO oznacza początek dnia; semantyka wymaga potwierdzenia w istniejącym kodzie.
Status przypisania kategorii budżetowej nie steruje przepływem pieniędzy.

Przed podłączeniem trzeba odczytać aktualny Apps Script, rzeczywiste transfery,
anulowania, korekty, wpływy i reguły BO. Obecny adapter celowo odrzuca inne
rodzaje niż BO i WYDATEK; nie należy go podłączać do pełnego rejestru w ciemno.
Identyfikatory API i Gmail mogą być różne: wymagają trwałego, jawnego mapowania,
a nie dopasowania wyłącznie po kwocie i dniu. Konflikty z dwóch rejestrów
zatrzymują uzgadnianie. Dokładnie powtórzone zdarzenia są liczone raz.

## Docelowe wersjonowanie Apps Script

1. Pobrać aktualną treść TEST przez autoryzowane Apps Script API / clasp.
2. Oddzielić pliki źródłowe od właściwości skryptu i danych finansowych.
3. Przed publikacją do publicznego repo sprawdzić kod pod kątem sekretów
   i danych; samo dodanie .gitignore nie usuwa danych już śledzonych.
4. Zapisać oczyszczony kod oraz appsscript.json w backend/apps-script.
   Przypięcie projektów TEST/PROD przechowywać poza repozytorium.
5. Przypisać wersję aplikacji i SHA commitu do konkretnej wersji Apps Script.
6. Deployment wyłącznie z zatwierdzonego artefaktu; żadnych ręcznych poprawek
   bez późniejszego pobrania i porównania kodu.

Brak obecnie autoryzowanego narzędzia eksportu Apps Script. Nie utworzono
fikcyjnego manifestu, nie pobrano właściwości skryptu ani nie zmieniono triggerów.
