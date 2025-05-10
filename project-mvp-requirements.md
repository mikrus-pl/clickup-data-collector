# Specyfikacja Aplikacji: ClickUp Data Aggregator

## I. Przegląd

### A. Cel Aplikacji
Głównym celem aplikacji jest automatyzacja procesu pobierania danych o czasie pracy z ClickUp, ich przetwarzanie, agregacja oraz przechowywanie w lokalnej bazie danych (SQLite). Aplikacja ma stworzyć solidną i dobrze udokumentowaną bazę danych, która będzie mogła być wykorzystana przez inne narzędzia do generowania raportów dotyczących czasu pracy, kosztów osobowych per klient oraz wspierania analizy rentowności projektów. Ma zastąpić obecny, manualny proces oparty na Google Sheets i Apps Script w zakresie zbierania i strukturyzowania danych.

### B. Kluczowe Funkcje
1.  **Synchronizacja Danych z ClickUp:**
    *   Pobieranie listy użytkowników z zespołów ClickUp.
    *   Pobieranie zadań (wraz z podzadaniami) z określonych list ClickUp.
    *   Obsługa inkrementalnych aktualizacji (pobieranie tylko zmienionych/nowych danych).
2.  **Przechowywanie Danych:**
    *   Użycie lokalnej bazy danych SQLite do trwałego przechowywania zsynchronizowanych danych.
    *   Przechowywanie informacji o użytkownikach, ich stawkach godzinowych (z historią zmian), listach ClickUp, zadaniach, przypisaniach zadań do użytkowników oraz zagregowanych czasach pracy.
3.  **Przetwarzanie i Agregacja Danych:**
    *   Identyfikacja zadań "Parent" na podstawie niestandardowego pola w ClickUp.
    *   Rekurencyjne sumowanie czasu spędzonego na zadaniu "Parent" i wszystkich jego podzadaniach.
    *   Automatyczne wyciąganie nazwy miesiąca z nazwy zadania "Parent" (z obsługą literówek).
    *   Generowanie i przechowywanie zagregowanych danych czasowych per osoba i zadanie "Parent".
4.  **Zarządzanie Stawkami Godzinowymi (dla potrzeb przyszłych analiz kosztów):**
    *   Możliwość definiowania stawek godzinowych dla użytkowników poprzez CLI.
    *   Śledzenie historii zmian stawek godzinowych z datą obowiązywania.
5.  **Interfejs Linii Komend (CLI):**
    *   Umożliwienie użytkownikowi zarządzania aplikacją (konfiguracja, synchronizacja, zarządzanie stawkami, czyszczenie danych).
6.  **Logowanie Operacji:**
    *   Zapisywanie informacji o przebiegu synchronizacji (daty, liczba pobranych/zaktualizowanych elementów, ewentualne błędy).

## II. Model Danych (SQLite)

### A. Tabela: `Users`
Przechowuje informacje o użytkownikach ClickUp.

*   `clickup_user_id` (INTEGER, PRIMARY KEY) - ID użytkownika z ClickUp.
*   `username` (TEXT, NOT NULL) - Nazwa użytkownika z ClickUp.
*   `email` (TEXT) - Adres email użytkownika (jeśli dostępny).
*   `is_active` (BOOLEAN, DEFAULT TRUE) - Czy użytkownik jest nadal aktywny (do "miękkiego" usuwania).
*   `date_synced` (DATETIME, NOT NULL) - Data ostatniej synchronizacji danych tego użytkownika.

### B. Tabela: `UserHourlyRates`
Przechowuje historię stawek godzinowych dla użytkowników. Potrzebne do przyszłych obliczeń kosztów przez zewnętrzne narzędzia.

*   `rate_id` (INTEGER, PRIMARY KEY, AUTOINCREMENT) - Wewnętrzny identyfikator stawki.
*   `user_id` (INTEGER, NOT NULL, FOREIGN KEY REFERENCES Users(clickup_user_id)) - ID użytkownika.
*   `hourly_rate` (NUMERIC, NOT NULL) - Stawka godzinowa.
*   `effective_from_date` (DATE, NOT NULL) - Data, od której stawka obowiązuje (format `YYYY-MM-DD`).
*   `effective_to_date` (DATE, NULLABLE) - Data, do której stawka obowiązuje (format `YYYY-MM-DD`). `NULL` oznacza, że jest to aktualnie obowiązująca stawka.

### C. Tabela: `ClickUpLists`
Przechowuje informacje o listach ClickUp, z których pobierane są dane.

*   `clickup_list_id` (TEXT, PRIMARY KEY) - ID listy z ClickUp.
*   `list_name` (TEXT) - Nazwa listy (może być pobrana z API lub zdefiniowana przez użytkownika).
*   `last_successful_task_sync_timestamp` (DATETIME) - Timestamp ostatniej udanej synchronizacji zadań dla tej listy (używany do inkrementalnych pobrań).

### D. Tabela: `Tasks`
Przechowuje szczegółowe informacje o zadaniach pobranych z ClickUp.

*   `clickup_task_id` (TEXT, PRIMARY KEY) - ID zadania z ClickUp.
*   `clickup_list_id` (TEXT, NOT NULL, FOREIGN KEY REFERENCES ClickUpLists(clickup_list_id)) - ID listy, do której należy zadanie.
*   `name` (TEXT, NOT NULL) - Nazwa zadania.
*   `parent_clickup_task_id` (TEXT, NULLABLE, FOREIGN KEY REFERENCES Tasks(clickup_task_id)) - ID zadania nadrzędnego (jeśli jest to podzadanie).
*   `is_parent_flag` (BOOLEAN, DEFAULT FALSE) - Flaga wskazująca, czy zadanie jest identyfikowane jako "Parent" (na podstawie wartości "Parent" w polu niestandardowym "IsParent").
*   `extracted_month_from_name` (TEXT, NULLABLE) - Nazwa miesiąca (np. "styczeń", "luty") lub numer miesiąca (1-12) wyekstrahowany z nazwy zadania "Parent".
*   `custom_field_client` (TEXT, NULLABLE) - Wartość pola niestandardowego "CLIENT" z ClickUp.
*   `status_clickup` (TEXT) - Status zadania z ClickUp (np. "Open", "in progress", "complete").
*   `time_spent_on_task_ms` (INTEGER, DEFAULT 0) - Całkowity czas spędzony bezpośrednio na tym zadaniu (w milisekundach), pobrany z `task.time_spent` w ClickUp.
*   `date_created_clickup` (DATETIME) - Data utworzenia zadania w ClickUp (timestamp konwertowany na DATETIME).
*   `date_updated_clickup` (DATETIME) - Data ostatniej aktualizacji zadania w ClickUp (timestamp konwertowany na DATETIME).
*   `archived_clickup` (BOOLEAN, DEFAULT FALSE) - Czy zadanie jest zarchiwizowane w ClickUp.
*   `date_last_synced` (DATETIME, NOT NULL) - Data ostatniej synchronizacji tego zadania z ClickUp.

### E. Tabela: `TaskAssignees`
Tabela łącząca zadania z przypisanymi do nich użytkownikami (relacja wiele-do-wielu).

*   `clickup_task_id` (TEXT, NOT NULL, FOREIGN KEY REFERENCES Tasks(clickup_task_id))
*   `clickup_user_id` (INTEGER, NOT NULL, FOREIGN KEY REFERENCES Users(clickup_user_id))
*   PRIMARY KEY (`clickup_task_id`, `clickup_user_id`)

### F. Tabela: `ReportedTaskAggregates`
Przechowuje zagregowane dane czasowe dla zadań "Parent" w kontekście konkretnego użytkownika (przypisanego do zadania "Parent"). Jest to tabela wynikowa, którą wcześniej generował skrypt Google Sheets i która jest kluczowa dla dalszych analiz.

*   `clickup_parent_task_id` (TEXT, NOT NULL, FOREIGN KEY REFERENCES Tasks(clickup_task_id)) - ID zadania "Parent".
*   `reported_for_user_id` (INTEGER, NOT NULL, FOREIGN KEY REFERENCES Users(clickup_user_id)) - ID użytkownika, dla którego ten agregat jest raportowany (zazwyczaj przypisany do zadania "Parent").
*   `parent_task_name` (TEXT, NOT NULL) - Nazwa zadania "Parent".
*   `client_name` (TEXT, NULLABLE) - Nazwa klienta z zadania "Parent".
*   `extracted_month_from_parent_name` (TEXT, NULLABLE) - Miesiąc wyekstrahowany z nazwy zadania "Parent".
*   `total_time_minutes` (INTEGER, NOT NULL) - Sumaryczny czas (minuty) dla zadania "Parent" i jego podzadań.
*   `total_time_seconds` (INTEGER, NOT NULL) - Sumaryczny czas (sekundy pozostałe po odjęciu pełnych minut) dla zadania "Parent" i jego podzadań.
*   `last_calculated_at` (DATETIME, NOT NULL) - Data i czas ostatniego obliczenia tego agregatu.
*   PRIMARY KEY (`clickup_parent_task_id`, `reported_for_user_id`)

### G. Tabela: `SyncLog`
Logi operacji synchronizacji.

*   `log_id` (INTEGER, PRIMARY KEY, AUTOINCREMENT) - ID logu.
*   `sync_start_time` (DATETIME, NOT NULL) - Czas rozpoczęcia synchronizacji.
*   `sync_end_time` (DATETIME, NULLABLE) - Czas zakończenia synchronizacji.
*   `sync_type` (TEXT, NOT NULL) - Typ synchronizacji (np. "USERS", "TASKS_FULL", "TASKS_INCREMENTAL").
*   `target_list_id` (TEXT, NULLABLE) - ID listy ClickUp, jeśli synchronizacja dotyczyła zadań.
*   `items_fetched_new` (INTEGER, DEFAULT 0) - Liczba nowo pobranych elementów (użytkowników/zadań).
*   `items_updated` (INTEGER, DEFAULT 0) - Liczba zaktualizowanych elementów.
*   `status` (TEXT, NOT NULL) - Status synchronizacji ('SUCCESS', 'PARTIAL_FAILURE', 'FAILURE').
*   `details_message` (TEXT, NULLABLE) - Dodatkowe informacje lub komunikat błędu.

### H. Diagram Relacji (ASCII - uproszczony)

[Users] 1--* [UserHourlyRates]
|
*
| (assignees)
*
[TaskAssignees] --1 [Tasks] 1-- [ReportedTaskAggregates] (parent task to aggregate)
| |
1 1
| |
* *
[ClickUpLists] -------* (tasks belong to list)

[SyncLog] (niezależna tabela logująca operacje)


## III. Kluczowe Elementy Logiki Aplikacji

### A. Konfiguracja
*   Aplikacja będzie korzystać z pliku `.env` do przechowywania wrażliwych danych (np. `CLICKUP_API_KEY`).
*   ID listy ClickUp do synchronizacji będzie można ustawić (np. jako zmienna środowiskowa lub argument CLI).
*   Nazwy pól niestandardowych ("IsParent", "CLIENT") oraz wartość flagi rodzica ("Parent") będą zdefiniowane jako konfigurowalne stałe w kodzie.

### B. Interakcja z ClickUp API
*   Użycie biblioteki `axios` (lub podobnej) do komunikacji z API v2 ClickUp.
*   Obsługa autoryzacji (nagłówek `Authorization` z kluczem API).
*   Obsługa paginacji przy pobieraniu list zadań.
*   Filtrowanie zadań po `date_updated_gt` dla inkrementalnych synchronizacji.
*   Mapowanie odpowiedzi API na struktury danych aplikacji.
*   Centralna obsługa błędów API (np. kody 401, 403, 429, 5xx).

### C. Proces Synchronizacji Danych

1.  **Synchronizacja Użytkowników (`sync-users`):**
    *   Pobiera listę zespołów (`/team`).
    *   Dla każdego zespołu pobiera listę członków.
    *   Tworzy unikalną listę użytkowników.
    *   Dla każdego użytkownika:
        *   Jeśli użytkownik nie istnieje w tabeli `Users`, dodaje go.
        *   Jeśli istnieje, aktualizuje jego dane (np. `username`, `email`, `is_active`).
        *   Aktualizuje `date_synced`.
    *   Loguje operację w `SyncLog`.

2.  **Synchronizacja Zadań (`sync-tasks --listId <ID_LISTY>`):**
    *   **Warunek wstępny:** Użytkownicy powinni być już zsynchronizowani.
    *   Pobiera ID listy z argumentu. Dodaje listę do `ClickUpLists` jeśli nie istnieje.
    *   **Tryb `--full-sync`:** Pobiera wszystkie zadania z listy (z podzadaniami).
    *   **Tryb inkrementalny (domyślny):**
        *   Pobiera `last_successful_task_sync_timestamp` z tabeli `ClickUpLists`.
        *   Pobiera zadania z ClickUp dla danej listy, gdzie `date_updated` jest większe niż zapisany timestamp (plus mały bufor, np. kilka minut, aby uniknąć problemów z precyzją timestampów). Obejmuje to zadania, których `time_spent` lub status się zmienił.
    *   Dla każdego pobranego zadania (i podzadania):
        *   Mapuje dane z API na pola tabeli `Tasks`.
        *   **Identyfikacja `is_parent_flag`:** Sprawdza pole niestandardowe "IsParent". Jeśli wartość to "Parent", ustawia `is_parent_flag = TRUE`.
        *   **Identyfikacja `custom_field_client`:** Odczytuje wartość z pola niestandardowego "CLIENT".
        *   **Ekstrakcja `extracted_month_from_name`:** Jeśli `is_parent_flag = TRUE`, próbuje wyparować nazwę miesiąca z `Tasks.name` (szczegóły w sekcji III.D).
        *   Zapisuje/aktualizuje zadanie w tabeli `Tasks` (`date_last_synced` = current_time).
        *   Aktualizuje powiązania w `TaskAssignees` na podstawie `task.assignees`.
    *   Po pomyślnym przetworzeniu wszystkich zadań, aktualizuje `last_successful_task_sync_timestamp` w `ClickUpLists`.
    *   Loguje operację w `SyncLog`.
    *   **Opcjonalnie:** Po `sync-tasks` automatycznie uruchamia proces generowania agregatów.

3.  **Generowanie Zagregowanych Danych Czasowych (`generate-aggregates`):**
    *   Dla każdego użytkownika w tabeli `Users`:
        *   Znajdź wszystkie zadania "Parent" (`is_parent_flag = TRUE`) z tabeli `Tasks`, które są przypisane do tego użytkownika (poprzez `TaskAssignees`).
        *   Dla każdego takiego zadania "Parent":
            *   Zainicjuj `total_task_time_ms = Tasks.time_spent_on_task_ms` (czas spędzony bezpośrednio na zadaniu "Parent").
            *   Rekurencyjnie znajdź wszystkie podzadania (dzieci, wnuki itd.) tego zadania "Parent" w tabeli `Tasks`.
            *   Dodaj `Tasks.time_spent_on_task_ms` każdego podzadania do `total_task_time_ms`.
            *   Przelicz `total_task_time_ms` na minuty i sekundy.
            *   Zapisz/zaktualizuj wpis w tabeli `ReportedTaskAggregates` (`clickup_parent_task_id`, `reported_for_user_id`, `parent_task_name`, `client_name`, `extracted_month_from_parent_name`, `total_time_minutes`, `total_time_seconds`, `last_calculated_at`).
    *   Loguje operację (np. w `SyncLog` lub osobno).
    *   **Ostrzeżenie:** Jeśli podzadanie samo jest oznaczone jako "IsParent", powinno to zostać zalogowane jako potencjalny problem konfiguracyjny w ClickUp. Agregacja powinna nadal sumować jego czas, ale warto o tym poinformować.

### D. Data Enrichment: Parsowanie Miesiąca z Nazwy Zadania
*   Funkcja będzie przyjmować nazwę zadania (string).
*   Będzie miała predefiniowaną listę polskich nazw miesięcy (styczeń, luty, ..., grudzień).
*   Dla każdej nazwy miesiąca z listy:
    *   Sprawdzi (ignorując wielkość liter), czy nazwa zadania zawiera daną nazwę miesiąca.
    *   Aby obsłużyć literówki, można użyć algorytmu odległości Levenshteina. Jeśli odległość między fragmentem nazwy zadania a nazwą miesiąca jest <= 1, uznajemy to za dopasowanie.
*   Zwraca znalezioną nazwę miesiąca (np. w formie kanonicznej, np. "styczeń") lub `NULL`, jeśli nie znaleziono.
*   Wynik zapisywany w `Tasks.extracted_month_from_name` dla zadań "Parent".

### E. Logika Obliczania Kosztów (Kontekst Biznesowy dla Struktury Danych)
Mimo że ta aplikacja nie będzie bezpośrednio generować raportów kosztowych, struktura danych (`UserHourlyRates`, `ReportedTaskAggregates`) musi wspierać takie obliczenia przez zewnętrzne narzędzia. Główne założenia:
1.  **Koszt dla Osoby (Payroll):** Możliwość obliczenia na podstawie sumarycznego czasu z `ReportedTaskAggregates` i odpowiedniej stawki z `UserHourlyRates` dla danego okresu.
2.  **Koszt dla Klienta:** Możliwość agregacji kosztów poszczególnych osób pracujących dla klienta, bazując na ich czasie z `ReportedTaskAggregates` i ich stawkach z `UserHourlyRates`.

## IV. Interfejs Linii Komend (CLI)
Aplikacja będzie zarządzana przez interfejs linii komend (np. przy użyciu biblioteki `yargs` lub `commander` w Node.js).

*   **`app.js setup-db`**:
    *   Inicjalizuje bazę danych SQLite.
    *   Tworzy wszystkie tabele, jeśli nie istnieją (uruchamia migracje schematu).
*   **`app.js config-set <klucz> <wartosc>`**:
    *   Ustawia wartość konfiguracyjną (np. `CLICKUP_API_KEY`, `DEFAULT_LIST_ID`). Wartości będą przechowywane w sposób bezpieczny (np. `.env` lub dedykowany plik konfiguracyjny sqlite).
*   **`app.js config-get <klucz>`**:
    *   Wyświetla wartość podanego klucza konfiguracyjnego.
*   **`app.js sync-users`**:
    *   Uruchamia proces synchronizacji użytkowników (III.C.1).
*   **`app.js sync-tasks --listId <ID_LISTY> [--full-sync]`**:
    *   Uruchamia proces synchronizacji zadań dla podanej listy (III.C.2).
    *   Opcja `--full-sync` wymusza pełne pobranie danych, ignorując `last_successful_task_sync_timestamp`.
*   **`app.js generate-aggregates [--listId <ID_LISTY>] [--userId <ID_UZYTKOWNIKA>]`**:
    *   Uruchamia proces obliczania i zapisywania agregatów czasowych (III.C.3).
    *   Opcjonalne flagi pozwalają ograniczyć proces do konkretnej listy lub użytkownika.
*   **`app.js full-sync --listId <ID_LISTY>`**:
    *   Komenda pomocnicza, która wykonuje sekwencyjnie: `sync-users`, `sync-tasks --listId <ID_LISTY> --full-sync`, `generate-aggregates --listId <ID_LISTY>`.
*   **`app.js purge-data [--confirm]`**:
    *   Usuwa wszystkie dane ze wszystkich tabel w bazie danych.
    *   Wymaga potwierdzenia (`--confirm` lub interaktywna prośba), aby uniknąć przypadkowego usunięcia.
*   **`app.js user-rate set --userId <ID_UZYTKOWNIKA> --rate <STAWKA> --fromDate <RRRR-MM-DD>`**:
    *   Ustawia nową stawkę godzinową dla użytkownika od podanej daty. Automatycznie zamyka poprzedni okres stawki (ustawia `effective_to_date` na dzień przed `fromDate` nowej stawki).
*   **`app.js user-rate list [--userId <ID_UZYTKOWNIKA>]`**:
    *   Wyświetla historię stawek dla użytkownika lub wszystkich użytkowników.

## V. Środowisko i Technologie
*   **Język:** Node.js (JavaScript)
*   **Baza Danych:** SQLite
*   **Kluczowe Biblioteki (sugerowane):**
    *   `axios`: Do zapytań HTTP (ClickUp API).
    *   `sqlite3`: Sterownik SQLite dla Node.js.
    *   `knex.js`: Query builder i narzędzie do migracji schematu bazy danych (bardzo ułatwia pracę z SQL).
    *   `dotenv`: Do zarządzania zmiennymi środowiskowymi (np. klucz API).
    *   `yargs` lub `commander`: Do tworzenia interfejsu linii komend.
    *   `date-fns` lub `moment.js` (choć `date-fns` jest lżejsze): Do operacji na datach i czasach.
    *   `fuzzy-search` lub podobna biblioteka (albo własna implementacja z Levenshtein) do parsowania nazw miesięcy.

## VI. Przyszłe Rozważania (Opcjonalne)
*   Bardziej zaawansowany interfejs użytkownika (np. webowy) dla administracji.
*   Automatyczne uruchamianie synchronizacji (np. jako zadanie cron lub usługa systemowa).
*   Integracja z innymi systemami.
*   Obsługa wielu kont/przestrzeni ClickUp.