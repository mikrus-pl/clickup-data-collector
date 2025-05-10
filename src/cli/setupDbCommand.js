const { db } = require('../db/database');

module.exports = {
  command: 'setup-db',
  describe: 'Initializes or updates the database schema by running the latest migrations.',
  builder: (yargs) => {
    // Ta komenda na razie nie potrzebuje specyficznych opcji
    return yargs;
  },
  handler: async (argv) => {
    console.log('Setting up database...');
    try {
      console.log('Running database migrations...');
      // `db.migrate.latest()` użyje konfiguracji z knexfile.js, którą instancja `db` już posiada.
      const [batchNo, log] = await db.migrate.latest();

      if (log.length === 0) {
        console.log('Database is already up to date.');
      } else {
        console.log(`Batch ${batchNo} run: ${log.length} migrations`);
        log.forEach(migration => console.log(`  - ${migration}`));
        console.log('Database schema updated successfully.');
      }
    } catch (error) {
      console.error('Error during database setup:', error);
      process.exitCode = 1; // Ustaw kod wyjścia na błąd
    } finally {
      // Zawsze próbuj zamknąć połączenie z bazą danych
      // console.log('Closing database connection (setup-db)...'); // Można dodać dla jasności
      await db.destroy();
      // console.log('Database connection closed (setup-db).');
    }
  },
};
