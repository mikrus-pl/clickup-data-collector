const { db } = require('../db/database');
const clickupService = require('../services/clickupService');
const { format, fromUnixTime } = require('date-fns');
const { extractPolishMonth } = require('../utils/monthParser'); // <--- NOWY IMPORT

const CUSTOM_FIELD_IS_PARENT = 'IsParent'; // Upewnij się, że nazwa jest dokładna
const CUSTOM_FIELD_CLIENT_LEGACY = 'CLIENT';     // Upewnij się, że nazwa jest dokładna
const CUSTOM_FIELD_CLIENT_2025 = 'CLIENT 2025'; // Nowe pole klienta
const PARENT_FLAG_VALUE = 'Parent';       // Upewnij się, że wartość jest dokładna


/**
 * Pomocnicza funkcja do znajdowania wartości pola niestandardowego.
 * ClickUp API v2: `custom_fields` to tablica obiektów.
 * Każdy obiekt ma `id`, `name`, `type`, `value`.
 * Dla 'drop_down', `value` to ID wybranej opcji. Trzeba znaleźć opcję po tym ID w `type_config.options`.
 */
function findCustomFieldValue(customFields, fieldName, expectedType = null) {
    if (!customFields || !Array.isArray(customFields)) {
      return null;
    }
    const field = customFields.find(cf => cf.name.toLowerCase() === fieldName.toLowerCase());
  
    if (!field || field.value === undefined) { // Sprawdzamy czy 'value' istnieje i nie jest undefined
      return null;
    }
    
    // Jeśli oczekujemy konkretnego typu, możemy go sprawdzić
    if (expectedType && field.type !== expectedType) {
      console.warn(`Custom field "${fieldName}" has type "${field.type}" but expected "${expectedType}". Returning raw value.`);
      // Zwróć surową wartość, jeśli typ się nie zgadza, ale wartość istnieje
      // lub null, jeśli chcemy być bardziej restrykcyjni
      return field.value; 
    }
  
    if (field.type === 'drop_down') {
      if (field.type_config && field.type_config.options && Array.isArray(field.type_config.options)) {
        // `field.value` dla dropdown to zazwyczaj `orderindex` wybranej opcji (liczba)
        // lub ID opcji (UUID string), w zależności od tego jak jest skonfigurowane pole/API.
        // Dokumentacja mówi, że `value` to ID opcji.
        // Starsze implementacje mogły używać orderindex.
        // Bezpieczniej jest szukać po `option.id` jeśli `field.value` to string UUID,
        // lub po `option.orderindex` jeśli `field.value` to liczba.
        const selectedOption = field.type_config.options.find(option => {
          // Porównaj value z option.id (jeśli value jest stringiem) lub option.orderindex (jeśli value jest liczbą)
          // Na podstawie oryginalnego skryptu Google Apps Script, było to `orderindex`
          return option.orderindex === field.value || option.id === field.value;
        });
        return selectedOption ? selectedOption.name : null;
      }
      return null; // Brak konfiguracji opcji dla dropdown
    }
    // Dla innych typów pól, np. 'short_text', 'number', 'email', 'phone', 'url', 'currency' etc.
    // wartość jest bezpośrednio w `field.value`.
    // Dla pól 'users' (przypisani), 'value' to tablica ID użytkowników.
    // Dla 'labels', 'value' to tablica ID etykiet.
    // Rozszerz w razie potrzeby.
    return field.value;
  }

/**
 * Pomocnicza funkcja do zapisu/aktualizacji zadania w bazie.
 * Na razie bez logiki pól niestandardowych.
 */
async function upsertTaskToDb(taskData, listId, trx) {
    const now = format(new Date(), "yyyy-MM-dd HH:mm:ss");
  
    // Logika dla pól niestandardowych
    const isParentValue = findCustomFieldValue(taskData.custom_fields, CUSTOM_FIELD_IS_PARENT, 'drop_down');
    const isParentFlag = isParentValue === PARENT_FLAG_VALUE;
    
    const client2025Name = findCustomFieldValue(taskData.custom_fields, CUSTOM_FIELD_CLIENT_2025, 'drop_down');
    
    let extractedMonth = null;
    if (isParentFlag && taskData.name) {
      extractedMonth = extractPolishMonth(taskData.name);
    }
  
    const taskPayload = {
      clickup_task_id: taskData.id,
      clickup_list_id: listId,
      name: taskData.name,
      parent_clickup_task_id: taskData.parent || null,
      is_parent_flag: isParentFlag, // Ustawione na podstawie pola niestandardowego
      extracted_month_from_name: extractedMonth, // Ustawione jeśli isParentFlag i znaleziono miesiąc
      // custom_field_client: clientName, // Old field, replaced
      custom_field_client_2025: client2025Name, // New field for CLIENT 2025
      status_clickup: taskData.status.status,
      time_spent_on_task_ms: taskData.time_spent || 0,
      date_created_clickup: taskData.date_created ? format(fromUnixTime(parseInt(taskData.date_created) / 1000), "yyyy-MM-dd HH:mm:ss") : null,
      date_updated_clickup: taskData.date_updated ? format(fromUnixTime(parseInt(taskData.date_updated) / 1000), "yyyy-MM-dd HH:mm:ss") : null,
      start_date: taskData.start_date ? format(fromUnixTime(parseInt(taskData.start_date) / 1000), "yyyy-MM-dd HH:mm:ss") : null,
      due_date: taskData.due_date ? format(fromUnixTime(parseInt(taskData.due_date) / 1000), "yyyy-MM-dd HH:mm:ss") : null,
      archived_clickup: taskData.archived || false,
      date_last_synced: now,
    };
  
    // Ostrzeżenie, jeśli podzadanie jest oznaczone jako Parent
    if (taskData.parent && isParentFlag) {
      console.warn(`Warning: Subtask ${taskData.id} (name: "${taskData.name}") is marked as 'Parent'. This might lead to incorrect aggregations if not handled carefully.`);
    }
  
    const result = await (trx || db)('Tasks')
      .insert(taskPayload)
      .onConflict('clickup_task_id')
      .merge()
      .returning('clickup_task_id');
    
    return result[0];
  }

/**
 * Pomocnicza funkcja do zapisu przypisań użytkowników do zadania.
 */
async function syncTaskAssignees(taskId, assignees, trx) {
  const currentAssignees = assignees.map(a => a.id);
  
  // Usuń stare przypisania, które nie są już aktualne
  await (trx || db)('TaskAssignees')
    .where('clickup_task_id', taskId)
    .whereNotIn('clickup_user_id', currentAssignees)
    .del();

  // Dodaj nowe przypisania (ignorując konflikty, jeśli już istnieją)
  if (currentAssignees.length > 0) {
    const newAssignments = currentAssignees.map(userId => ({
      clickup_task_id: taskId,
      clickup_user_id: userId,
    }));
    // Użyj `ignore` lub `onConflict().doNothing()` dla SQLite/PostgreSQL
    // aby uniknąć błędów przy próbie wstawienia istniejących par.
    // Knex nie ma `ignore()` dla wszystkich baz, więc prostsze jest
    // nie robić niczego jeśli konflikt, lub najpierw usunąć wszystkie i wstawić nowe.
    // Dla uproszczenia, usuniemy wszystkie i wstawimy na nowo (w transakcji).
    // Alternatywa: `onConflict(['clickup_task_id', 'clickup_user_id']).ignore()` dla PostgreSQL
    // Dla SQLite: `.onConflict().doNothing()` ale to wymaga specyficznej składni.
    // Najbezpieczniej:
    // await (trx || db)('TaskAssignees').where('clickup_task_id', taskId).del(); // Usuń wszystkie
    // if (newAssignments.length > 0) await (trx || db)('TaskAssignees').insert(newAssignments); // Wstaw nowe

    // Bardziej optymalne: wstaw z ignorowaniem konfliktów
    // SQLite:
    await (trx || db)('TaskAssignees')
        .insert(newAssignments)
        .onConflict(['clickup_task_id', 'clickup_user_id']) // Klucz złożony
        .ignore(); // Dla SQLite .ignore() działa, dla PostgreSQL .doNothing()
  }
}


module.exports = {
  command: 'sync-tasks',
  describe: 'Fetches tasks from a ClickUp list and synchronizes them with the local database.',
  builder: (yargs) => {
    return yargs
      .option('listId', {
        describe: 'ClickUp List ID to synchronize tasks from.',
        type: 'string',
        demandOption: true,
      })
      .option('full-sync', {
        describe: 'Perform a full synchronization, ignoring the last sync timestamp.',
        type: 'boolean',
        default: false,
      })
      .option('archived', {
        describe: 'Include archived tasks in the synchronization.',
        type: 'boolean',
        default: false,
      });
  },
  handler: async (argv) => {
    console.log(`Starting task synchronization for list ID: ${argv.listId}...`);
    if (argv.fullSync) console.log('Full sync mode enabled.');
    if (argv.archived) console.log('Including archived tasks.');

    const apiKey = process.env.CLICKUP_API_KEY;
    if (!apiKey) {
      console.error('ERROR: CLICKUP_API_KEY is not defined. Cannot synchronize tasks.');
      process.exitCode = 1;
      return;
    }

    let syncLogId = null;
    const syncStartTime = new Date();
    let fetchedTasksCount = 0;
    let newTasksCount = 0;
    let updatedTasksCount = 0;

    try {
      // Zapisz/aktualizuj listę w ClickUpLists
      await db('ClickUpLists')
        .insert({ clickup_list_id: argv.listId, list_name: `List ${argv.listId}` /* Można by pobrać nazwę listy */ })
        .onConflict('clickup_list_id')
        .merge({ list_name: `List ${argv.listId}` /* Można zaktualizować nazwę, jeśli się zmieniła */ });
        
      // Rozpocznij logowanie synchronizacji
      const logEntry = await db('SyncLog').insert({
        sync_start_time: format(syncStartTime, "yyyy-MM-dd HH:mm:ss"),
        sync_type: argv.fullSync ? 'TASKS_FULL' : 'TASKS_INCREMENTAL',
        target_list_id: argv.listId,
        status: 'PENDING',
      }).returning('log_id');
      syncLogId = logEntry[0].log_id || logEntry[0];

      let dateUpdatedGt = null;
      if (!argv.fullSync) {
        const listData = await db('ClickUpLists').where('clickup_list_id', argv.listId).first();
        if (listData && listData.last_successful_task_sync_timestamp) {
          // ClickUp oczekuje timestampa w milisekundach
          dateUpdatedGt = new Date(listData.last_successful_task_sync_timestamp).getTime();
          console.log(`Incremental sync: fetching tasks updated after ${new Date(dateUpdatedGt).toISOString()}`);
        } else {
            console.log('No last sync timestamp found for this list, performing a full sync for tasks instead.');
        }
      }

      const clickUpTasks = await clickupService.getTasksFromList(argv.listId, {
        date_updated_gt: dateUpdatedGt,
        archived: argv.archived,
      });

      fetchedTasksCount = clickUpTasks.length;

      if (clickUpTasks && clickUpTasks.length > 0) {
        console.log(`Fetched ${clickUpTasks.length} tasks (including subtasks) from ClickUp. Processing...`);

        // Użyj transakcji dla spójności danych
        await db.transaction(async trx => {
          for (const task of clickUpTasks) {
            const existingTask = await trx('Tasks').where('clickup_task_id', task.id).first();
            // Zapamiętaj wartości przed upsertem, jeśli zadanie istnieje, do późniejszego porównania
            let oldIsParentFlag, oldClient, oldMonth;
            if (existingTask) {
              oldIsParentFlag = existingTask.is_parent_flag;
              oldClient = existingTask.custom_field_client;
              oldMonth = existingTask.extracted_month_from_name;
            }

            await upsertTaskToDb(task, argv.listId, trx); // Zapisz/aktualizuj zadanie
            await syncTaskAssignees(task.id, task.assignees || [], trx); // Zsynchronizuj przypisanych

            if (existingTask) {
              // Po upsercie: zmiana logiki dla updatedTasksCount
              let wasUpdated = false;
              if (argv.fullSync) {
                // W trybie full-sync, jeśli zadanie istniało, uznajemy je za potencjalnie zaktualizowane o nowe pola
                wasUpdated = true;
              } else {
                // W trybie inkrementalnym, bazuj na dacie aktualizacji z ClickUp
                if (
                  task.date_updated &&
                  existingTask.date_updated_clickup !== format(fromUnixTime(parseInt(task.date_updated) / 1000), "yyyy-MM-dd HH:mm:ss")
                ) {
                  wasUpdated = true;
                }
                // Dodatkowe, bardziej precyzyjne sprawdzenie, czy faktycznie przetworzone pola się zmieniły,
                // nawet jeśli data z ClickUp nie. To wymagałoby dostępu do taskPayload lub ponownego obliczenia tutaj.
                // Na razie powyższe uproszczenie.
              }
              if (wasUpdated) {
                updatedTasksCount++;
              }
            } else {
              newTasksCount++;
            }
          }
        }); // Koniec transakcji

        console.log(`Task processing complete: ${newTasksCount} new tasks, ${updatedTasksCount} updated tasks (or tasks with updated assignees).`);
        
        // Zaktualizuj timestamp ostatniej synchronizacji dla listy TYLKO jeśli nie było błędu
        await db('ClickUpLists')
          .where('clickup_list_id', argv.listId)
          .update({ last_successful_task_sync_timestamp: format(syncStartTime, "yyyy-MM-dd HH:mm:ss") });
          // Używamy syncStartTime jako punktu odniesienia dla następnej inkrementalnej synchronizacji
          // To oznacza, że następnym razem pobierzemy wszystko co się zmieniło OD początku tej synchronizacji

      } else if (clickUpTasks) { // pusta tablica
        console.log('No tasks found in ClickUp for the given criteria.');
      } else { // null - błąd API
        throw new Error('Failed to fetch tasks from ClickUp API. Check clickupService logs.');
      }

      // Zaktualizuj log synchronizacji - sukces
      if (syncLogId) {
        await db('SyncLog').where('log_id', syncLogId).update({
          sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
          items_fetched_new: newTasksCount, // Liczba zadań dodanych po raz pierwszy
          items_updated: updatedTasksCount, // Liczba zadań, które istniały i zostały zaktualizowane
          status: 'SUCCESS',
          details_message: `Fetched ${fetchedTasksCount} raw tasks from API.`
        });
      }

    } catch (error) {
      console.error('Error during task synchronization command:', error);
      if (syncLogId) {
        await db('SyncLog').where('log_id', syncLogId).update({
          sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
          status: 'FAILURE',
          details_message: `Error: ${error.message}`,
        }).catch(logError => console.error('Additionally, failed to update SyncLog for failure:', logError));
      }
      process.exitCode = 1;
    } finally {
      await db.destroy();
    }
  },
};