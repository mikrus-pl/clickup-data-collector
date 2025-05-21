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
    // Liczniki dla podsumowania
    let totalParentTasksFound = 0;
    let parentTasksSkippedNoAssignee = 0;
    let parentTasksSkippedUserFilter = 0;
    let aggregatesGenerated = 0; // Liczba unikalnych parent tasks z agregatem
    let aggregatesToInsert = [];

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
      console.log('Fetching all tasks from the database to build hierarchy...');
      const allDbTasks = await db('Tasks').select('*');
      if (allDbTasks.length === 0) {
        console.log('No tasks found in the database to aggregate.');
        if (syncLogId) await db('SyncLog').where('log_id', syncLogId).update({ status: 'SUCCESS', details_message: 'No tasks to aggregate.', sync_end_time: format(new Date(), 'yyyy-MM-dd HH:mm:ss')});
        await db.destroy();
        return;
      }
      console.log(`Fetched ${allDbTasks.length} tasks from DB.`);

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

      let parentTasksQuery = db('Tasks').where('is_parent_flag', true);
      if (argv.listId) {
        parentTasksQuery = parentTasksQuery.where('clickup_list_id', argv.listId);
      }
      const parentTasksToProcess = await parentTasksQuery;
      totalParentTasksFound = parentTasksToProcess.length;
      console.log(`Found ${totalParentTasksFound} parent tasks to process based on list criteria.`);

      for (const parentTask of parentTasksToProcess) {
        const assigneesQuery = db('TaskAssignees')
          .join('Users', 'TaskAssignees.clickup_user_id', '=', 'Users.clickup_user_id')
          .where('TaskAssignees.clickup_task_id', parentTask.clickup_task_id)
          .select('Users.clickup_user_id', 'Users.username');
        if (argv.userId) {
          assigneesQuery.where('Users.clickup_user_id', argv.userId);
        }
        const assignees = await assigneesQuery;

        if (assignees.length === 0) {
          if (argv.userId) {
            parentTasksSkippedUserFilter++;
          } else {
            console.warn(`Parent task ${parentTask.clickup_task_id} (Name: "${parentTask.name}") has no assignees in the database. Skipping aggregate generation for it.`);
            parentTasksSkippedNoAssignee++;
          }
          continue;
        }

        const totalTimeMs = calculateTotalTimeRecursive(parentTask.clickup_task_id, tasksMap, childrenMap, new Set());
        const totalMinutes = Math.floor(totalTimeMs / 60000);
        const totalSeconds = Math.round((totalTimeMs % 60000) / 1000);

        let generatedForThisParentTask = false;
        for (const assignee of assignees) {
          aggregatesToInsert.push({
            clickup_parent_task_id: parentTask.clickup_task_id,
            reported_for_user_id: assignee.clickup_user_id,
            parent_task_name: parentTask.name,
            client_name: parentTask.custom_field_client_2025,
            extracted_month_from_parent_name: parentTask.extracted_month_from_name,
            total_time_minutes: totalMinutes,
            total_time_seconds: totalSeconds,
            last_calculated_at: format(syncStartTime, "yyyy-MM-dd HH:mm:ss"),
          });
          generatedForThisParentTask = true;
        }
        if (generatedForThisParentTask) {
          aggregatesGenerated++;
        }
      }

      if (aggregatesToInsert.length > 0) {
        // ZMIANA LOGU: aggregatesToInsert.length to liczba wierszy do wstawienia (może być > aggregatesGenerated)
        console.log(`Preparing to insert/update ${aggregatesToInsert.length} aggregate entries (for ${aggregatesGenerated} unique parent tasks with assignees)...`);
        await db.transaction(async trx => {
          await trx('ReportedTaskAggregates')
            .insert(aggregatesToInsert)
            .onConflict(['clickup_parent_task_id', 'reported_for_user_id'])
            .merge();
        });
        console.log(`${aggregatesToInsert.length} aggregate entries processed successfully.`);
      } else {
        console.log('No new/updated aggregates to generate based on the criteria and assignees.');
      }

      // ZMIANA PODSUMOWANIA
      console.log('\n--- Aggregate Generation Summary ---');
      console.log(`Total "Parent" tasks found matching criteria: ${totalParentTasksFound}`);
      if (argv.userId) {
        console.log(`"Parent" tasks skipped (not assigned to user ID ${argv.userId}): ${parentTasksSkippedUserFilter}`);
      }
      console.log(`"Parent" tasks skipped (no assignees found in DB): ${parentTasksSkippedNoAssignee}`);
      console.log(`Unique "Parent" tasks for which aggregates were generated/updated: ${aggregatesGenerated}`);
      console.log(`Total aggregate rows written to ReportedTaskAggregates: ${aggregatesToInsert.length}`);
      console.log('------------------------------------');

      if (syncLogId) {
        await db('SyncLog').where('log_id', syncLogId).update({
          sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
          items_fetched_new: aggregatesGenerated, // Liczba unikalnych zadań Parent, dla których coś zrobiono
          items_updated: aggregatesToInsert.length - aggregatesGenerated, // Jeśli jeden parent ma wielu assignees, to te dodatkowe wpisy
          status: 'SUCCESS',
          details_message: `Total Parent Tasks: ${totalParentTasksFound}, Skipped (No Assignee): ${parentTasksSkippedNoAssignee}, Skipped (User Filter): ${parentTasksSkippedUserFilter}, Aggregates Written: ${aggregatesToInsert.length} for ${aggregatesGenerated} parent tasks.`
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