const knex = require('knex');
const knexfile = require('../../knexfile'); // Zakładamy, że knexfile.js jest w głównym folderze projektu

// Określenie, którego środowiska konfiguracyjnego użyć.
// Można to później uzależnić od zmiennej środowiskowej NODE_ENV (np. 'development', 'production')
const environment = process.env.NODE_ENV || 'development';
const config = knexfile[environment];

if (!config) {
  throw new Error(`Knex configuration for environment "${environment}" not found in knexfile.js`);
}

const db = knex(config);

// Test połączenia (opcjonalnie, ale dobre dla weryfikacji)
// Możesz to wywołać raz przy starcie aplikacji, jeśli chcesz
async function testConnection() {
  try {
    await db.raw('SELECT 1'); // Proste zapytanie do sprawdzenia połączenia
    console.log('Successfully connected to the database.');
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    // W zależności od krytyczności, możesz chcieć zakończyć aplikację
    // process.exit(1);
  }
}

// Wyeksportuj instancję `db` oraz ewentualnie funkcję testującą
module.exports = {
  db,
  testConnection
};