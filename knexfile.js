// Update with your config settings.

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: './data/app_data.sqlite3' // Ścieżka do pliku bazy danych
    },
    useNullAsDefault: true, // Zalecane dla SQLite
    migrations: {
      directory: './src/db/migrations' // Folder, gdzie będą przechowywane migracje
    },
    seeds: {
      directory: './src/db/seeds' // Folder na dane testowe (opcjonalnie)
    }
  }

};
