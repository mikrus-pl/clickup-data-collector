const { db } = require('../db/database');
const { format } = require('date-fns');

/**
 * Rekurencyjnie oblicza całkowity czas spędzony na zadaniu i jego podzadaniach.
 * @param {string} taskId ID zadania, dla którego obliczany jest czas.
 * @param {Map<string, object>} tasksMap Mapa wszystkich zadań (ID -> obiekt zadania) dla szybkiego dostępu.
 * @param {Map<string, Array<string>>} childrenMap Mapa dzieci (ID rodzica -> tablica ID dzieci).
 * @param {Set<string>} visitedTasks Zbiór już odwiedzonych zadań, aby uniknąć pętli (choć nie powinno ich być przy poprawnej strukturze rodzic-dziecko).
 * @returns {number} Całkowity czas spędzony w milisekundach.
 */
function calculateTotalTimeRecursive(taskId, tasksMap, childrenMap, visitedTasks = new Set()) {
  if (visitedTasks.has(taskId)) {
    console.warn(`Circular dependency or re-visit detected for task ID: ${taskId}. Skipping to prevent infinite loop.`);
    return 0; // Unikaj nieskończonej pętli
  }
  visitedTasks.add(taskId);

  const task = tasksMap.get(taskId);
  if (!task) {
    // console.warn(`Task ${taskId} not found in tasksMap during time calculation.`);
    return 0;
  }

  let totalTimeMs = task.time_spent_on_task_ms || 0;

  const childIds = childrenMap.get(taskId) || [];
  for (const childId of childIds) {
    totalTimeMs += calculateTotalTimeRecursive(childId, tasksMap, childrenMap, visitedTasks);
  }
  
  visitedTasks.delete(taskId); // Usuń po przetworzeniu gałęzi (ważne dla bardziej złożonych struktur, jeśli to samo podzadanie mogłoby być częścią różnych drzew)
  return totalTimeMs;
}


module.exports = {
  command: 'generate-aggregates',
  describe: 'Calculates total time spent on parent tasks (including subtasks) and stores them in ReportedTaskAggregates.',
  builder: (yargs) => {
    return yargs
      .option('listId', {
        describe: 'Optional ClickUp List ID to limit aggregate generation (processes all parent tasks from this list).',
        type: 'string',
      })
      .option('userId', {
        describe: 'Optional ClickUp User ID to limit aggregate generation to tasks assigned to this user.',
        type: 'number',
      });
      // Można dodać opcję --force-recalculate, aby zawsze przeliczać, nawet jeśli nic się nie zmieniło (na razie przelicza wszystko)
  },
  handler: async (argv) => {
    console.log('Starting generation of task time aggregates...');
    if (argv.listId) console.log(`Filtering for list ID: ${argv.listId}`);
    if (argv.userId) console.log(`Filtering for user ID: ${argv.userId}`);

    let syncLogId = null;
    const syncStartTime = new Date();
    let aggregatesProcessed = 0;

    try {
      // Rozpocznij logowanie operacji
      const logEntry = await db('SyncLog').insert({
        sync_start_time: format(syncStartTime, "yyyy-MM-dd HH:mm:ss"),
        sync_type: 'AGGREGATES',
        target_list_id: argv.listId || null,
        status: 'PENDING',
      }).returning('log_id');
      syncLogId = logEntry[0].log_id || logEntry[0];

      // 1. Pobierz wszystkie zadania z bazy (lub filtrowane, jeśli podano listId)
      // Potrzebujemy wszystkich zadań, aby zbudować drzewo rodzic-dziecko dla obliczeń.
      console.log('Fetching all tasks from the database to build hierarchy...');
      const allDbTasksQuery = db('Tasks').select('*');
      // Jeśli chcemy filtrować listę zadań do przetworzenia, to filtrowanie parent tasks będzie później
      // Ale dla budowy drzewa potrzebujemy potencjalnie wszystkich.
      // Jeśli jednak `listId` jest podane, to chcemy tylko zadania z tej listy i ich dzieci.
      // To jest bardziej skomplikowane, bo dzieci mogą nie być na tej samej liście.
      // Na razie uproszczenie: jeśli listId, to bierzemy tylko parenty z tej listy, ale dzieci mogą być skądkolwiek.

      const allDbTasks = await allDbTasksQuery;
      if (allDbTasks.length === 0) {
        console.log('No tasks found in the database to aggregate.');
        if (syncLogId) await db('SyncLog').where('log_id', syncLogId).update({ status: 'SUCCESS', details_message: 'No tasks to aggregate.', sync_end_time: format(new Date(), 'yyyy-MM-dd HH:mm:ss')});
        return;
      }
      console.log(`Fetched ${allDbTasks.length} tasks from DB.`);

      // 2. Zbuduj mapy dla szybkiego dostępu: tasksMap (ID -> task) i childrenMap (parentID -> [childID])
      const tasksMap = new Map();
      const childrenMap = new Map();
      allDbTasks.forEach(task => {
        tasksMap.set(task.clickup_task_id, task);
        if (task.parent_clickup_task_id) {
          if (!childrenMap.has(task.parent_clickup_task_id)) {
            childrenMap.set(task.parent_clickup_task_id, []);
          }
          childrenMap.get(task.parent_clickup_task_id).push(task.clickup_task_id);
        }
      });

      // 3. Znajdź zadania "Parent" do przetworzenia
      let parentTasksQuery = db('Tasks')
        .where('is_parent_flag', true);

      if (argv.listId) {
        parentTasksQuery = parentTasksQuery.where('clickup_list_id', argv.listId);
      }
      
      // Jeśli podano userId, musimy dołączyć TaskAssignees
      // To skomplikuje, bo jedno zadanie "Parent" może być przypisane do wielu osób,
      // a my chcemy agregat per (parent_task, reported_for_user_id)
      // Specyfikacja mówi: "w kontekście konkretnego użytkownika (przypisanego do zadania "Parent")"

      // Pobierz wszystkie zadania "Parent" spełniające kryteria (listId)
      const parentTasksToProcess = await parentTasksQuery;
      console.log(`Found ${parentTasksToProcess.length} parent tasks to process based on list criteria.`);

      const aggregatesToInsert = [];

      for (const parentTask of parentTasksToProcess) {
        // Znajdź użytkowników przypisanych do tego zadania "Parent"
        const assigneesQuery = db('TaskAssignees')
          .join('Users', 'TaskAssignees.clickup_user_id', '=', 'Users.clickup_user_id')
          .where('TaskAssignees.clickup_task_id', parentTask.clickup_task_id)
          .select('Users.clickup_user_id', 'Users.username');
        
        if (argv.userId) {
            assigneesQuery.where('Users.clickup_user_id', argv.userId);
        }
        const assignees = await assigneesQuery;

        if (assignees.length === 0 && argv.userId) {
            // Jeśli filtrowaliśmy po userID, a ten parent task nie jest do niego przypisany, pomiń
            continue;
        }
        if (assignees.length === 0 && !argv.userId) {
            // Jeśli nie filtrujemy po userID, a zadanie parent nie ma przypisanych,
            // możemy stworzyć agregat bez `reported_for_user_id` lub pominąć.
            // Na razie zakładamy, że agregat jest ZAWSZE w kontekście użytkownika.
            // Można by tu dodać logikę dla "nieprzypisanych" zadań parent.
            console.warn(`Parent task ${parentTask.clickup_task_id} has no assignees. Skipping aggregate generation for it unless a default user context is defined.`);
            continue;
        }

        const totalTimeMs = calculateTotalTimeRecursive(parentTask.clickup_task_id, tasksMap, childrenMap, new Set());
        const totalMinutes = Math.floor(totalTimeMs / 60000);
        const totalSeconds = Math.round((totalTimeMs % 60000) / 1000);

        for (const assignee of assignees) {
          aggregatesToInsert.push({
            clickup_parent_task_id: parentTask.clickup_task_id,
            reported_for_user_id: assignee.clickup_user_id, // Użytkownik przypisany do zadania Parent
            parent_task_name: parentTask.name,
            client_name: parentTask.custom_field_client,
            extracted_month_from_parent_name: parentTask.extracted_month_from_name,
            total_time_minutes: totalMinutes,
            total_time_seconds: totalSeconds,
            last_calculated_at: format(syncStartTime, "yyyy-MM-dd HH:mm:ss"), // Użyj syncStartTime dla spójności
          });
          aggregatesProcessed++;
        }
      }

      if (aggregatesToInsert.length > 0) {
        console.log(`Preparing to insert/update ${aggregatesToInsert.length} aggregate entries...`);
        // Użyj transakcji do wstawienia/aktualizacji agregatów
        // `onConflict` dla klucza złożonego (`clickup_parent_task_id`, `reported_for_user_id`)
        await db.transaction(async trx => {
          // Można najpierw usunąć stare agregaty dla przetwarzanych zadań/użytkowników, jeśli to konieczne
          // np. jeśli `listId` lub `userId` jest podane, usuń pasujące agregaty przed wstawieniem nowych.
          // Na razie proste wstawienie z `merge`.
          // SQLite: .onConflict(['col1', 'col2']).merge()
          // PostgreSQL: .onConflict('(col1, col2) DO UPDATE SET ...')
          // Knex dla SQLite powinien obsłużyć listę kolumn w onConflict.
          await trx('ReportedTaskAggregates')
            .insert(aggregatesToInsert)
            .onConflict(['clickup_parent_task_id', 'reported_for_user_id'])
            .merge(); // Zaktualizuj, jeśli istnieje konflikt na kluczu złożonym
        });
        console.log(`${aggregatesToInsert.length} aggregate entries processed successfully.`);
      } else {
        console.log('No aggregates to insert/update based on the criteria.');
      }

      // Zaktualizuj log synchronizacji - sukces
      if (syncLogId) {
        await db('SyncLog').where('log_id', syncLogId).update({
          sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
          items_fetched_new: aggregatesProcessed, // Lub inna metryka, np. liczba unikalnych zadań Parent
          status: 'SUCCESS',
        });
      }
      console.log('Aggregate generation complete.');

    } catch (error) {
      console.error('Error during aggregate generation command:', error);
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