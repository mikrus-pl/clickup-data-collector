// Będziemy potrzebować dostępu do handlerów innych komend lub ich logiki.
// Najprościej będzie zaimportować same obiekty komend i wywołać ich handlery.
// Jednak handlery są zaprojektowane do pracy z Yargs argv i zamykają połączenie DB.
// Lepszym podejściem może być wydzielenie logiki synchronizacji do oddzielnych funkcji,
// które mogą być wywoływane zarówno przez CLI handlery, jak i przez ten orchestrator.

// Na razie, dla uproszczenia, spróbujemy wywołać handlery,
// ale musimy uważać na zarządzanie połączeniem DB i argv.
// To podejście może być problematyczne, bo każdy handler zamknie połączenie DB.

// ALTERNATYWNE PODEJŚCIE (zalecane, ale wymaga refaktoryzacji):
// 1. Wydziel logikę z handlerów syncUsersCommand, syncTasksCommand, generateAggregatesCommand
//    do oddzielnych funkcji asynchronicznych w ich odpowiednich plikach (lub w serwisach).
//    Te funkcje przyjmowałyby parametry (np. listId, fullSync) i NIE zarządzałyby db.destroy().
// 2. Handlery CLI wywoływałyby te funkcje i zarządzały db.destroy() w bloku finally.
// 3. Komenda full-sync wywoływałaby te funkcje sekwencyjnie i zarządzała db.destroy() raz na końcu.

// PODEJŚCIE UPROSZCZONE (z potencjalnymi problemami z zarządzaniem połączeniem DB):
// To jest tylko przykład, jak NIE robić tego w produkcji bez refaktoryzacji.
// Poniżej przedstawię lepsze rozwiązanie.

// --- POCZĄTEK LEPSZEGO ROZWIĄZANIA ---
// Zakładamy, że logika została/zostanie wydzielona do funkcji np. w serwisach.
// Dla przykładu, załóżmy, że mamy:
// userService.performUserSyncLogic()
// taskService.performTaskSyncLogic(listId, options)
// aggregateService.performAggregateGenerationLogic(options)

// Na potrzeby tego kroku, zrobimy to trochę inaczej, symulując wywołanie,
// ale pamiętając, że idealnie byłoby mieć oddzielne funkcje logiki.

const { db } = require('../db/database'); // Potrzebne do zamknięcia połączenia na końcu
// Symulacja importu logiki (w rzeczywistości zaimportowalibyśmy wydzielone funkcje)
const syncUsersActualLogic = require('./syncUsersCommand').handler; // To jest nieidealne
const syncTasksActualLogic = require('./syncTasksCommand').handler; // To jest nieidealne
const generateAggregatesActualLogic = require('./generateAggregatesCommand').handler; // To jest nieidealne


module.exports = {
  command: 'full-sync',
  describe: 'Performs a full data synchronization: syncs users, fully syncs tasks for a list, and generates aggregates.',
  builder: (yargs) => {
    return yargs
      .option('listId', {
        describe: 'ClickUp List ID for task synchronization and aggregate generation.',
        type: 'string',
        demandOption: true, // Wymagane dla tej komendy
      });
  },
  handler: async (argv) => {
    const { execSync } = require('child_process');
    const { listId } = argv;
    console.log(`Starting full synchronization for list ID: ${listId}...`);
    try {
      console.log('\nStep 1: Synchronizing Users...');
      try {
        execSync('node app.js sync-users', { stdio: 'inherit' });
      } catch (err) {
        console.error('User synchronization failed:', err.message);
        throw new Error('Full sync aborted at Step 1 (users)');
      }
      console.log('User synchronization completed.');

      console.log('\nStep 2: Synchronizing Tasks (Full Sync)...');
      try {
        execSync(`node app.js sync-tasks --listId ${listId} --fullSync`, { stdio: 'inherit' });
      } catch (err) {
        console.error('Task synchronization failed:', err.message);
        throw new Error('Full sync aborted at Step 2 (tasks)');
      }
      console.log('Task synchronization completed.');

      console.log('\nStep 3: Generating Aggregates...');
      try {
        execSync(`node app.js generate-aggregates --listId ${listId}`, { stdio: 'inherit' });
      } catch (err) {
        console.error('Aggregate generation failed:', err.message);
        throw new Error('Full sync aborted at Step 3 (aggregates)');
      }
      console.log('Aggregate generation completed.');

      console.log('\nFull synchronization process completed successfully!');
    } catch (error) {
      console.error('Error during full synchronization process:', error.message);
      process.exitCode = 1;
    } finally {
      if (process.exitCode === 1) {
        console.log('Full sync finished with errors.');
      } else {
        console.log('Full sync finished successfully.');
      }
      process.exit(process.exitCode || 0);
    }
  },
};