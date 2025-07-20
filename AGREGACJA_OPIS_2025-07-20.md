# Logika Agregacji w ClickUp Data Collector

**Data:** 2025-07-20

---

## 1. Cel procesu agregacji
Agregacja w tym projekcie służy do przetwarzania danych o zadaniach i czasie pracy pobranych z ClickUp, tak aby uzyskać czytelne, podsumowane informacje do analiz finansowych, rozliczeń z członkami zespołu oraz raportowania dla klientów. Wynik agregacji to tabela z czasem pracy przypisanym do użytkownika, zadania głównego (Parent), klienta i miesiąca.

---

## 2. Co jest agregowane? (Zakres danych)
- **Zadania główne (Parent tasks):**
  - Zadania oznaczone w ClickUp polem niestandardowym `IsParent` jako "Parent".
- **Podzadania:**
  - Wszystkie zadania podrzędne (children) powiązane z zadaniem głównym.
- **Czas pracy:**
  - Sumowany jest czas spędzony na zadaniu głównym oraz na wszystkich jego podzadaniach (rekurencyjnie).
- **Przypisania użytkowników:**
  - Każda agregacja jest liczona osobno dla każdego użytkownika przypisanego do zadania głównego.
- **Klient i miesiąc:**
  - Pobierane z pól niestandardowych zadania głównego: `CLIENT 2025` oraz z nazwy zadania (wyodrębniany miesiąc).

---

## 3. Jak przebiega agregacja? (Przepływ biznesowy)
1. **Pobranie zadań z bazy:**
   - Wszystkie zadania z tabeli `Tasks` są wczytywane do pamięci.
2. **Budowa map relacji:**
   - Tworzone są mapy: `tasksMap` (ID zadania → obiekt zadania) oraz `childrenMap` (ID rodzica → tablica ID dzieci).
3. **Wyszukanie zadań głównych:**
   - Filtrowane są zadania, które mają flagę `is_parent_flag` ustawioną na `true`.
4. **Rekurencyjne sumowanie czasu:**
   - Dla każdego zadania głównego wywoływana jest funkcja rekurencyjna, która sumuje czas własny i wszystkich podzadań.
5. **Agregacja dla przypisanych użytkowników:**
   - Dla każdego użytkownika przypisanego do zadania głównego tworzony jest osobny wpis agregacji.
6. **Zapis do bazy:**
   - Wyniki trafiają do tabeli `ReportedTaskAggregates` (z użyciem upsert – aktualizacja lub wstawienie).
7. **Logowanie:**
   - Operacja jest logowana w tabeli `SyncLog`.

---

## 4. Struktura wyniku agregacji
Każdy wpis w tabeli `ReportedTaskAggregates` zawiera:
- `clickup_parent_task_id` – ID zadania głównego (Parent)
- `reported_for_user_id` – ID użytkownika, dla którego raportujemy czas
- `parent_task_name` – Nazwa zadania głównego
- `client_name` – Nazwa klienta (z pola `CLIENT 2025`)
- `extracted_month_from_parent_name` – Wyciągnięty miesiąc z nazwy zadania
- `total_time_minutes` – Łączny czas (minuty)
- `total_time_seconds` – Pozostałe sekundy (dopełnienie do minuty)
- `last_calculated_at` – Data i czas ostatniej kalkulacji

---

## 5. Przykład działania
1. Zadanie główne "Faktura marzec 2025" (parent) ma 2 podzadania.
2. Każde z zadań (parent + podzadania) ma pole z czasem pracy (`time_spent_on_task_ms`).
3. Funkcja rekurencyjna sumuje czas parenta i podzadań.
4. Jeśli do zadania głównego przypisani są użytkownicy A i B, powstaną dwa wpisy w agregatach – osobno dla każdego.

---

## 6. Wpływ biznesowy i potencjalny cel
- **Rozliczalność:** Pozwala przypisać faktyczny czas pracy do konkretnego klienta, zadania i użytkownika.
- **Raportowanie:** Umożliwia generowanie raportów kosztowych, analizę rentowności, rozliczenia z zespołem.
- **Automatyzacja:** Cały proces jest automatyczny i powtarzalny, minimalizuje ryzyko błędów ręcznych.
- **Podstawa do dalszych analiz:** Dane z agregacji mogą być eksportowane do innych narzędzi (np. Excel, BI) lub używane do fakturowania.

---

## 7. Podsumowanie
Logika agregacji w ClickUp Data Collector jest kluczowa dla uzyskania wartościowych, zagregowanych danych o czasie pracy. Zapewnia precyzyjne rozliczenia i analizy, a jej struktura jest elastyczna i gotowa do dalszego rozwoju.

---

*Dokument wygenerowany automatycznie przez Cascade na podstawie analizy kodu projektu ClickUp Data Collector, 2025-07-20.*
