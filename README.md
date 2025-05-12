# ClickUp Data Collector

**Wersja:** 1.0.0  
**Autor:** [Twoje Imię/Nazwa Firmy]

## Spis Treści
1. [Cel Aplikacji](#1-cel-aplikacji)
2. [Kluczowe Funkcje](#2-kluczowe-funkcje)
3. [Wymagania Systemowe](#3-wymagania-systemowe)
4. [Instalacja](#4-instalacja)
5. [Konfiguracja](#5-konfiguracja)
    * [Klucz API ClickUp](#klucz-api-clickup)
    * [Inne Zmienne Środowiskowe (Opcjonalne)](#inne-zmienne-środowiskowe-opcjonalne)
6. [Użycie (Interfejs Linii Komend - CLI)](#6-użycie-interfejs-linii-komend---cli)
    * [Ogólna Składnia](#ogólna-składnia)
    * [Dostępne Komendy](#dostępne-komendy)
        * [`setup-db`](#komenda-setup-db)
        * [`sync-users`](#komenda-sync-users)
        * [`user-rate set`](#komenda-user-rate-set)
        * [`user-rate list`](#komenda-user-rate-list)
        * [`sync-tasks`](#komenda-sync-tasks)
        * [`generate-aggregates`](#komenda-generate-aggregates)
        * [`full-sync`](#komenda-full-sync)
        * [`purge-data`](#komenda-purge-data)
7. [Struktura Bazy Danych](#7-struktura-bazy-danych)
8. [Testowanie](#8-testowanie)
9. [Rozwiązywanie Problemów](#9-rozwiązywanie-problemów)
10. [Potencjalne Dalsze Kroki](#10-potencjalne-dalsze-kroki)
11. [Licencja](#11-licencja)

---

## 1. Cel Aplikacji

`ClickUp Data Collector` to narzędzie linii komend (CLI) napisane w Node.js, służące do automatycznego pobierania danych dotyczących czasu pracy i zadań z platformy ClickUp. Aplikacja przetwarza te dane, agreguje je i przechowuje w lokalnej bazie danych SQLite. Głównym celem jest stworzenie solidnej i dobrze ustrukturyzowanej bazy danych, która może być następnie wykorzystana przez inne narzędzia do generowania szczegółowych raportów finansowych, analizy rentowności klientów oraz rozliczeń z członkami zespołu.

## 2. Kluczowe Funkcje

- **Synchronizacja danych z ClickUp:** Pobieranie użytkowników, zadań (wraz z podzadaniami) z określonych list. Obsługa aktualizacji inkrementalnych.
- **Przechowywanie danych:** Lokalna baza danych SQLite przechowująca informacje o użytkownikach, ich historycznych stawkach godzinowych, listach ClickUp, zadaniach, przypisaniach zadań oraz zagregowanych czasach pracy.
- **Przetwarzanie i agregacja:** Identyfikacja zadań "Parent", sumowanie czasu pracy (zadanie główne + podzadania), ekstrakcja informacji o kliencie i miesiącu z zadań.
- **Zarządzanie stawkami godzinowymi:** Możliwość definiowania i śledzenia historii stawek godzinowych dla użytkowników.
- **Logowanie operacji:** Zapis informacji o przebiegu synchronizacji do bazy danych.

## 3. Wymagania Systemowe

- **Node.js:** Zalecana wersja LTS (np. 18.x, 20.x lub nowsza). Można pobrać z [nodejs.org](https://nodejs.org/).
- **npm:** (Node Package Manager) Instalowany razem z Node.js.
- **Dostęp do API ClickUp:** Wymagany ważny klucz API (typu Personal Key).

## 4. Instalacja

1. **Sklonuj repozytorium (lub pobierz pliki projektu):**

    ```bash
    git clone [URL_TWOJEGO_REPOZYTORIUM]
    cd clickup-data-collector
    ```
    Jeśli nie używasz Git, po prostu skopiuj folder projektu na swój komputer.

2. **Zainstaluj zależności projektu:**

    W głównym folderze projektu (`clickup-data-collector`) uruchom w terminalu:
    
    ```bash
    npm install
    ```
    Ta komenda pobierze i zainstaluje wszystkie biblioteki wymienione w pliku `package.json` (m.in. `knex`, `sqlite3`, `axios`, `yargs`, `dotenv`, `date-fns`, `fast-levenshtein`).

## 5. Konfiguracja

### Klucz API ClickUp

Aplikacja wymaga klucza API ClickUp do komunikacji z platformą.

1. **Znajdź swój klucz API ClickUp:**
    - Zaloguj się do ClickUp.
    - Przejdź do swoich ustawień osobistych (kliknij na swój awatar w lewym dolnym rogu, następnie "My Settings").
    - W sekcji "My Settings" znajdź "Apps" w menu po lewej stronie.
    - Twój klucz API (Personal API Token) będzie tam widoczny. Wygląda mniej więcej tak: `pk_1234567_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

2. **Skonfiguruj klucz w aplikacji:**
    - W głównym folderze projektu znajdź plik `.env.example` (jeśli go utworzyłeś) lub stwórz nowy plik o nazwie `.env`.
    - Dodaj do pliku `.env` następującą linię, zastępując `TWOJ_KLUCZ_API_CLICKUP` swoim rzeczywistym kluczem:

        ```env
        CLICKUP_API_KEY=pk_1234567_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        ```
    - **Ważne:** Plik `.env` zawiera wrażliwe dane i nie powinien być dodawany do publicznych repozytoriów Git (plik `.gitignore` powinien go obejmować).

### Inne Zmienne Środowiskowe (Opcjonalne)

Możesz dodać inne zmienne do pliku `.env`, jeśli będą potrzebne w przyszłości, np.:

```env
# DEFAULT_CLICKUP_LIST_ID=twoje_domyslne_id_listy
```

Na razie jedyną wymaganą zmienną jest `CLICKUP_API_KEY`.

## 6. Użycie (Interfejs Linii Komend - CLI)

Wszystkie operacje aplikacji wykonuje się za pomocą komend w terminalu, będąc w głównym folderze projektu (`clickup-data-collector`).

### Ogólna Składnia

```bash
node app.js <komenda> [opcje]
```

Aby uzyskać pomoc dotyczącą dostępnych komend:

```bash
node app.js --help
```

Aby uzyskać pomoc dotyczącą konkretnej komendy:

```bash
node app.js <komenda> --help
```

### Dostępne Komendy

#### Komenda: setup-db

Inicjalizuje lub aktualizuje schemat bazy danych, uruchamiając najnowsze dostępne migracje. Należy ją wykonać przynajmniej raz po pierwszej instalacji.

```bash
node app.js setup-db
```

#### Komenda: sync-users

Pobiera listę użytkowników z Twoich zespołów w ClickUp i synchronizuje ją z lokalną bazą danych (tabela Users). Nowi użytkownicy są dodawani, istniejący aktualizowani.

```bash
node app.js sync-users
```

#### Komenda: user-rate set

Ustawia nową stawkę godzinową dla konkretnego użytkownika, obowiązującą od określonej daty. Automatycznie zamyka poprzedni okres obowiązywania stawki dla tego użytkownika.

```bash
node app.js user-rate set --userId <ID_UZYTKOWNIKA_CLICKUP> --rate <STAWKA> --fromDate <RRRR-MM-DD>
```

Parametry:

- `--userId <ID_UZYTKOWNIKA_CLICKUP>`: (Wymagane) Numeryczne ID użytkownika z ClickUp.
- `--rate <STAWKA>`: (Wymagane) Stawka godzinowa, np. 55.75.
- `--fromDate <RRRR-MM-DD>`: (Wymagane) Data, od której nowa stawka obowiązuje, w formacie ROK-MIESIĄC-DZIEŃ.

**Przykład:**

```bash
node app.js user-rate set --userId 1234567 --rate 60.50 --fromDate 2024-06-01
```

#### Komenda: user-rate list

Wyświetla historię stawek godzinowych dla określonego użytkownika lub dla wszystkich użytkowników, jeśli userId nie zostanie podane.

```bash
node app.js user-rate list [--userId <ID_UZYTKOWNIKA_CLICKUP>]
```

Parametry:

- `--userId <ID_UZYTKOWNIKA_CLICKUP>`: (Opcjonalne) Numeryczne ID użytkownika z ClickUp.

**Przykład:**

```bash
node app.js user-rate list --userId 1234567
node app.js user-rate list
```

#### Komenda: sync-tasks

Pobiera zadania (wraz z podzadaniami) z określonej listy ClickUp i synchronizuje je z lokalną bazą danych (tabele Tasks i TaskAssignees). Przetwarza również pola niestandardowe ("IsParent", "CLIENT") oraz ekstrahuje miesiąc z nazwy zadań "Parent".

```bash
node app.js sync-tasks --listId <ID_LISTY_CLICKUP> [--full-sync] [--archived]
```

Parametry:

- `--listId <ID_LISTY_CLICKUP>`: (Wymagane) ID listy ClickUp, z której mają być pobrane zadania.
- `--full-sync`: (Opcjonalne) Wykonuje pełną synchronizację zadań, ignorując datę ostatniej synchronizacji. Domyślnie aplikacja wykonuje synchronizację inkrementalną (pobiera tylko zadania zaktualizowane od ostatniego udanego pobrania).
- `--archived`: (Opcjonalne) Uwzględnia również zadania zarchiwizowane. Domyślnie zarchiwizowane zadania są pomijane.

**Przykład:**

```bash
node app.js sync-tasks --listId 901206975324
node app.js sync-tasks --listId 901206975324 --full-sync --archived
```

#### Komenda: generate-aggregates

Oblicza sumaryczny czas pracy dla każdego zadania "Parent" (uwzględniając czas spędzony na jego podzadaniach) w kontekście każdego przypisanego do niego użytkownika. Wyniki zapisuje do tabeli ReportedTaskAggregates. Zaleca się uruchomienie tej komendy po każdej synchronizacji zadań (`sync-tasks`).

```bash
node app.js generate-aggregates [--listId <ID_LISTY_CLICKUP>] [--userId <ID_UZYTKOWNIKA_CLICKUP>]
```

Parametry:

- `--listId <ID_LISTY_CLICKUP>`: (Opcjonalne) Ogranicza generowanie agregatów do zadań "Parent" z tej konkretnej listy.
- `--userId <ID_UZYTKOWNIKA_CLICKUP>`: (Opcjonalne) Ogranicza generowanie agregatów do zadań "Parent", do których przypisany jest ten konkretny użytkownik.

**Przykład:**

```bash
node app.js generate-aggregates
node app.js generate-aggregates --listId 901206975324
```

#### Komenda: full-sync

Wykonuje pełny cykl synchronizacji danych dla podanej listy:
- Synchronizuje użytkowników (`sync-users`).
- W pełni synchronizuje zadania z podanej listy (`sync-tasks --listId <ID_LISTY> --full-sync`).
- Generuje agregaty czasowe dla tej listy (`generate-aggregates --listId <ID_LISTY>`).

Jest to obejście z użyciem `execSync` i może być mniej wydajne niż indywidualne komendy.

```bash
node app.js full-sync --listId <ID_LISTY_CLICKUP> [--archived]
```

Parametry:

- `--listId <ID_LISTY_CLICKUP>`: (Wymagane) ID listy ClickUp.
- `--archived`: (Opcjonalne) Przekazywane do kroku `sync-tasks`.

**Przykład:**

```bash
node app.js full-sync --listId 901206975324
```

#### Komenda: purge-data

Usuwa WSZYSTKIE DANE ze wszystkich tabel aplikacji w lokalnej bazie danych. Używaj z najwyższą ostrożnością! Wymaga potwierdzenia.

```bash
node app.js purge-data --confirm
```

Parametry:

- `--confirm`: (Wymagane) Potwierdza chęć usunięcia wszystkich danych. Bez tej flagi komenda nic nie zrobi.

**Przykład (bezpieczny, nic nie robi):**

```bash
node app.js purge-data
```

**Przykład (usuwa wszystkie dane):**

```bash
node app.js purge-data --confirm
```

## 7. Struktura Bazy Danych

Aplikacja używa bazy danych SQLite przechowywanej w pliku `data/app_data.sqlite3` (ścieżka zdefiniowana w `knexfile.js`). Główne tabele to:

- **Users:** Informacje o użytkownikach ClickUp.
- **UserHourlyRates:** Historia stawek godzinowych użytkowników.
- **ClickUpLists:** Informacje o listach ClickUp, z których synchronizowane są dane.
- **Tasks:** Szczegółowe dane o zadaniach i podzadaniach z ClickUp, w tym przetworzone pola niestandardowe.
- **TaskAssignees:** Tabela łącząca zadania z przypisanymi użytkownikami.
- **ReportedTaskAggregates:** Kluczowa tabela wynikowa zawierająca zagregowany czas pracy (minuty, sekundy) dla każdego zadania "Parent" w kontekście przypisanego użytkownika, klienta i miesiąca. To jest podstawa do dalszych analiz kosztowych.
- **SyncLog:** Logi operacji synchronizacji.

Szczegółowy schemat każdej tabeli można znaleźć w plikach migracji w folderze `src/db/migrations/`.

## 8. Testowanie

**Konfiguracja:** Upewnij się, że masz poprawnie skonfigurowany plik `.env` z ważnym kluczem API ClickUp.

**Inicjalizacja bazy:**

```bash
node app.js setup-db
```

**Synchronizacja użytkowników:**

```bash
node app.js sync-users
```

Sprawdź logi konsoli i zawartość tabeli `Users` oraz `SyncLog` w bazie danych (np. używając narzędzia SQLite Browser).

**Ustawianie stawek:**

```bash
node app.js user-rate set --userId <TWOJE_TESTOWE_ID_UZYTKOWNIKA> --rate 50 --fromDate 2024-01-01
node app.js user-rate list --userId <TWOJE_TESTOWE_ID_UZYTKOWNIKA>
```

Sprawdź tabelę `UserHourlyRates`.

**Synchronizacja zadań:**

Znajdź ID listy w ClickUp, która zawiera zadania z polami niestandardowymi "IsParent" i "CLIENT" oraz zadania "Parent" z nazwami miesięcy.

```bash
node app.js sync-tasks --listId <TWOJE_TESTOWE_ID_LISTY> --full-sync
```

Sprawdź logi (w tym ostrzeżenia o podzadaniach oznaczonych jako "Parent"). Sprawdź tabele `Tasks`, `TaskAssignees`, `ClickUpLists`, `SyncLog`. Zwróć uwagę na wypełnienie kolumn `is_parent_flag`, `custom_field_client`, `extracted_month_from_name` w tabeli `Tasks`.

**Generowanie agregatów:**

```bash
node app.js generate-aggregates --listId <TWOJE_TESTOWE_ID_LISTY>
```

Sprawdź podsumowanie w konsoli oraz zawartość tabeli `ReportedTaskAggregates`. Porównaj zagregowane czasy z danymi w ClickUp dla kilku zadań "Parent".

**Pełna synchronizacja:**

```bash
node app.js full-sync --listId <TWOJE_TESTOWE_ID_LISTY>
```

**Czyszczenie danych:**  
(Ostrożnie!)

```bash
node app.js purge-data --confirm
```

Sprawdź, czy tabele są puste.

Do przeglądania bazy danych SQLite polecam darmowe narzędzie DB Browser for SQLite lub rozszerzenia dla VSCode (np. "SQLite" autorstwa alexcvzz).

## 9. Rozwiązywanie Problemów

- **Error: CLICKUP_API_KEY is not defined:** Upewnij się, że plik `.env` istnieje w głównym folderze projektu i zawiera poprawny wpis `CLICKUP_API_KEY=...`.
- **Error: Unable to acquire a connection (Knex):** Może to oznaczać, że poprzednia operacja nie zamknęła poprawnie połączenia z bazą, lub problem z konfiguracją w `knexfile.js`. Upewnij się, że ścieżka do pliku bazy w `knexfile.js` jest poprawna i folder `data` istnieje.
- **Błędy z API ClickUp (np. 401 Unauthorized):** Sprawdź poprawność klucza API. Błędy 403 mogą oznaczać brak uprawnień do danej listy/zasobu. Błędy 429 oznaczają przekroczenie limitu zapytań API (rate limiting).
- **Niepoprawne dane w ReportedTaskAggregates:** Sprawdź:
    - Czy `is_parent_flag` jest poprawnie ustawiane w tabeli `Tasks`.
    - Czy `time_spent_on_task_ms` jest poprawnie pobierane dla zadań i podzadań.
    - Czy przypisania użytkowników (`TaskAssignees`) są poprawne dla zadań "Parent".
- **Aplikacja "wisi" i nie kończy działania:** Najczęściej spowodowane przez niezamknięte połączenie z bazą danych (`db.destroy()`). Upewnij się, że każdy handler komendy CLI, który wykonuje operacje na bazie, ma blok `finally` z `await db.destroy();`.

## 10. Potencjalne Dalsze Kroki

- Refaktoryzacja komendy `full-sync` w celu uniknięcia `execSync`.
- Dodanie testów jednostkowych i integracyjnych.
- Bardziej zaawansowana obsługa błędów API ClickUp (np. ponawianie prób przy rate limiting).
- Optymalizacje wydajności dla bardzo dużych zbiorów danych.
- Możliwość konfiguracji nazw pól niestandardowych przez plik konfiguracyjny zamiast stałych w kodzie.
- Interaktywne potwierdzenie dla `purge-data` (np. z biblioteką inquirer).

## 11. Licencja

[Określ tutaj licencję projektu, np. MIT, GPL, lub "Prywatne - nie do dystrybucji"]
