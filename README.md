# ClickUp Data Collector

**Wersja:** 1.0.0 (Możesz zaktualizować, jeśli dodasz wersjonowanie w `package.json`)
**Autor:** [Twoje Imię/Nazwa Firmy]

## Spis Treści
1.  [Cel Aplikacji](#cel-aplikacji)
2.  [Kluczowe Funkcje](#kluczowe-funkcje)
3.  [Wymagania Systemowe](#wymagania-systemowe)
4.  [Instalacja](#instalacja)
5.  [Konfiguracja](#konfiguracja)
    *   [Klucz API ClickUp](#klucz-api-clickup)
    *   [Inne Zmienne Środowiskowe (Opcjonalne)](#inne-zmienne-środowiskowe-opcjonalne)
6.  [Użycie (Interfejs Linii Komend - CLI)](#użycie-interfejs-linii-komend---cli)
    *   [Ogólna Składnia](#ogólna-składnia)
    *   [Dostępne Komendy](#dostępne-komendy)
        *   [`setup-db`](#komenda-setup-db)
        *   [`sync-users`](#komenda-sync-users)
        *   [`user-rate set`](#komenda-user-rate-set)
        *   [`user-rate list`](#komenda-user-rate-list)
        *   [`sync-tasks`](#komenda-sync-tasks)
        *   [`generate-aggregates`](#komenda-generate-aggregates)
        *   [`full-sync`](#komenda-full-sync)
        *   [`purge-data`](#komenda-purge-data)
7.  [Struktura Bazy Danych](#struktura-bazy-danych)
8.  [Testowanie](#testowanie)
9.  [Rozwiązywanie Problemów](#rozwiazywanie-problemow)
10. [Potencjalne Dalsze Kroki](#potencjalne-dalsze-kroki)
11. [Licencja](#licencja)

---

## 1. Cel Aplikacji

`ClickUp Data Collector` to narzędzie linii komend (CLI) napisane w Node.js, służące do automatycznego pobierania danych dotyczących czasu pracy i zadań z platformy ClickUp. Aplikacja przetwarza te dane, agreguje je i przechowuje w lokalnej bazie danych SQLite. Głównym celem jest stworzenie solidnej i dobrze ustrukturyzowanej bazy danych, która może być następnie wykorzystana przez inne narzędzia do generowania szczegółowych raportów finansowych, analizy rentowności klientów oraz rozliczeń z członkami zespołu.

## 2. Kluczowe Funkcje

*   **Synchronizacja danych z ClickUp:** Pobieranie użytkowników, zadań (wraz z podzadaniami) z określonych list. Obsługa aktualizacji inkrementalnych.
*   **Przechowywanie danych:** Lokalna baza danych SQLite przechowująca informacje o użytkownikach, ich historycznych stawkach godzinowych, listach ClickUp, zadaniach, przypisaniach zadań oraz zagregowanych czasach pracy.
*   **Przetwarzanie i agregacja:** Identyfikacja zadań "Parent", sumowanie czasu pracy (zadanie główne + podzadania), ekstrakcja informacji o kliencie i miesiącu z zadań.
*   **Zarządzanie stawkami godzinowymi:** Możliwość definiowania i śledzenia historii stawek godzinowych dla użytkowników.
*   **Logowanie operacji:** Zapis informacji o przebiegu synchronizacji do bazy danych.

## 3. Wymagania Systemowe

*   **Node.js:** Zalecana wersja LTS (np. 18.x, 20.x lub nowsza). Można pobrać z [nodejs.org](https://nodejs.org/).
*   **npm:** (Node Package Manager) Instalowany razem z Node.js.
*   **Dostęp do API ClickUp:** Wymagany ważny klucz API (typu Personal Key).

## 4. Instalacja

1.  **Sklonuj repozytorium (lub pobierz pliki projektu):**
    ```bash
    git clone [URL_TWOJEGO_REPOZYTORIUM]
    cd clickup-data-collector
    ```
    Jeśli nie używasz Git, po prostu skopiuj folder projektu na swój komputer.

2.  **Zainstaluj zależności projektu:**
    W głównym folderze projektu (`clickup-data-collector`) uruchom w terminalu:
    ```bash
    npm install
    ```
    Ta komenda pobierze i zainstaluje wszystkie biblioteki wymienione w pliku `package.json` (m.in. `knex`, `sqlite3`, `axios`, `yargs`, `dotenv`, `date-fns`, `fast-levenshtein`).

## 5. Konfiguracja

### Klucz API ClickUp

Aplikacja wymaga klucza API ClickUp do komunikacji z platformą.

1.  **Znajdź swój klucz API ClickUp:**
    *   Zaloguj się do ClickUp.
    *   Przejdź do swoich ustawień osobistych (kliknij na swój awatar w lewym dolnym rogu, następnie "My Settings").
    *   W sekcji "My Settings" znajdź "Apps" w menu po lewej stronie.
    *   Twój klucz API (Personal API Token) będzie tam widoczny. Wygląda mniej więcej tak: `pk_1234567_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.

2.  **Skonfiguruj klucz w aplikacji:**
    *   W głównym folderze projektu znajdź plik `.env.example` (jeśli go utworzyłeś) lub stwórz nowy plik o nazwie `.env`.
    *   Dodaj do pliku `.env` następującą linię, zastępując `TWOJ_KLUCZ_API_CLICKUP` swoim rzeczywistym kluczem:
        ```env
        CLICKUP_API_KEY=pk_1234567_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        ```
    *   **Ważne:** Plik `.env` zawiera wrażliwe dane i nie powinien być dodawany do publicznych repozytoriów Git (plik `.gitignore` powinien go obejmować).

### Inne Zmienne Środowiskowe (Opcjonalne)

Możesz dodać inne zmienne do pliku `.env`, jeśli będą potrzebne w przyszłości, np.:
```env
# DEFAULT_CLICKUP_LIST_ID=twoje_domyslne_id_listy
```

Na razie jedyną wymaganą zmienną jest CLICKUP_API_KEY.

## 6. Użycie (Interfejs Linii Komend - CLI)

Wszystkie operacje aplikacji wykonuje się za pomocą komend w terminalu, będąc w głównym folderze projektu (clickup-data-collector).

### Ogólna składnia

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

### Dostępne komendy

#### Komenda setup-db

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

--userId <ID_UZYTKOWNIKA_CLICKUP>: (Wymagane) Numeryczne ID użytkownika z ClickUp.

--rate <STAWKA>: (Wymagane) Stawka godzinowa, np. 55.75.

--fromDate <RRRR-MM-DD>: (Wymagane) Data, od której nowa stawka obowiązuje, w formacie ROK-MIESIĄC-DZIEŃ.

**Przykład:**

    ```bash
    node app.js user-rate set --userId 1234567 --rate 60.50 --fromDate 2024-06-01
    ```

#### Komenda: sync-users

Pobiera listę użytkowników z Twoich zespołów w ClickUp i synchronizuje ją z lokalną bazą danych (tabela Users). Nowi użytkownicy są dodawani, istniejący aktualizowani.

    ```bash
    node app.js sync-users
    ```