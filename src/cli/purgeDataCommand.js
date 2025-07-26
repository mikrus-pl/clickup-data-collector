const { db } = require('../db/database');
// Będziemy potrzebować biblioteki do interaktywnego potwierdzenia
// `inquirer` jest popularny, ale dla prostego tak/nie można użyć czegoś lżejszego lub readline
// Dla uproszczenia na razie użyjemy flagi --confirm, ale warto rozważyć `inquirer` dla lepszego UX
// npm install inquirer // jeśli chcesz użyć

// Lista tabel do wyczyszczenia (w odpowiedniej kolejności ze względu na klucze obce)
// Zaczynamy od tabel, które są zależne (mają klucze obce wskazujące na inne),
// a kończymy na tych, na które inne wskazują.
// Lub po prostu usuwamy w dowolnej kolejności, jeśli SQLite poprawnie obsłuży CASCADE lub RESTRICT.
// Bezpieczniej jest jednak zachować kolejność "od dzieci do rodziców" lub po prostu
// wyłączyć sprawdzanie kluczy obcych na czas operacji (specyficzne dla SQLite).
// Knex `truncate()` powinien sobie z tym poradzić.
const TABLES_TO_PURGE = [
  'ReportedTaskAggregates', // Zależy od Tasks i Users
  'TaskAssignees',          // Zależy od Tasks i Users
  'UserHourlyRates',        // Zależy od Users
  'SyncLog',                // Zależy od ClickUpLists (nullable FK)
  // 'Tasks' musi być przed 'ClickUpLists', jeśli Tasks.clickup_list_id ma onDelete='RESTRICT'
  // Ale mamy onDelete='CASCADE' dla Tasks->ClickUpLists, więc ClickUpLists może być później.
  // Jeśli Users ma onDelete='CASCADE' na UserHourlyRates i TaskAssignees, to Users można później.
  // Kolejność dla TRUNCATE z kluczami obcymi może być ważna.
  // Bezpieczniej:
  // 1. Tabele łączące i te na końcu łańcucha zależności.
  // 2. Tabele główne.
  // LUB: dla SQLite można tymczasowo wyłączyć foreign key constraints
];

// Lista wszystkich tabel zdefiniowanych w migracjach (w kolejności, w jakiej powinny być usuwane - dzieci pierwsze)
// CommandLogs table is intentionally excluded from this list as it should persist across purges
const ALL_TABLES_IN_ORDER = [
    'ReportedTaskAggregates',  // Zależy od Tasks i Users
    'TaskAssignees',           // Zależy od Tasks i Users
    'UserHourlyRates',         // Zależy od Users
    'Tasks',                   // Zależy od ClickUpLists
    'SyncLog',                 // Zależy od ClickUpLists (ale FK jest nullable)
    'Users',                   // Tabele główne
    'ClickUpLists',            // Tabele główne
];


module.exports = {
  command: 'purge-data',
  describe: 'Deletes all data from all application tables. USE WITH CAUTION!',
  builder: (yargs) => {
    return yargs
      .option('confirm', {
        describe: 'Confirm the data purge operation. Without this flag, no action will be taken.',
        type: 'boolean',
        default: false,
      });
  },
  handler: async (argv) => {
    if (!argv.confirm) {
      console.warn('Data purge operation was not confirmed. No action taken.');
      console.warn('To purge all data, run: node app.js purge-data --confirm');
      // Nie ma potrzeby zamykać połączenia, bo go nie otworzyliśmy do operacji
      return;
    }

    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.warn('!!!                  WARNING: DATA PURGE                  !!!');
    console.warn('!!! This will delete all data from the application tables !!!');
    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('Proceeding with data purge...');

    try {
      // Dla SQLite, najprostszym sposobem na ominięcie problemów z kluczami obcymi
      // przy TRUNCATE jest usunięcie tabel i ich ponowne utworzenie przez migracje,
      // LUB wykonanie DELETE FROM dla każdej tabeli w odpowiedniej kolejności.
      // Knex `truncate()` może mieć problemy z kluczami obcymi w SQLite.

      console.log('Deleting data from tables...');
      // Usuwamy dane w kolejności od tabel z zależnościami (dzieci) do tabel nadrzędnych (rodziców)
      // aby uniknąć problemów z kluczami obcymi
      for (const tableName of ALL_TABLES_IN_ORDER) {
        console.log(`  - Deleting data from ${tableName}...`);
        await db(tableName).del(); // .del() to alias dla .delete()
      }

      // Alternatywnie, jeśli .del() ma problemy z FK w SQLite, można:
      // await db.raw('PRAGMA foreign_keys = OFF;');
      // for (const tableName of TABLES_TO_PURGE_IN_ANY_ORDER) {
      //   await db(tableName).truncate(); // truncate jest szybsze niż delete, ale resetuje auto_increment
      // }
      // await db.raw('PRAGMA foreign_keys = ON;');
      // Jednak .del() powinno działać i jest bezpieczniejsze jeśli FK są ważne.

      console.log('All data has been purged from the specified tables.');
      console.log('You might want to run "setup-db" if you also want to reset schema migrations status, but data is gone.');

    } catch (error) {
      console.error('Error during data purge operation:', error);
      process.exitCode = 1;
    } finally {
      console.log('Closing database connection (purge-data)...');
      await db.destroy();
      console.log('Database connection closed (purge-data).');
    }
  },
};