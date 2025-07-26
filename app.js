require('dotenv').config();
const yargs = require('yargs/yargs'); // Importujemy yargs
const { hideBin } = require('yargs/helpers'); // Pomocnicza funkcja dla yargs
const { testConnection } = require('./src/db/database');

// Import logiki komend
const syncUsersCommand = require('./src/cli/syncUsersCommand');
const setupDbCommand = require('./src/cli/setupDbCommand'); // Dodaj import setupDbCommand
const userRateCommand = require('./src/cli/userRateCommand');
const syncTasksCommand = require('./src/cli/syncTasksCommand');
const generateAggregatesCommand = require('./src/cli/generateAggregatesCommand');
const fullSyncCommand = require('./src/cli/fullSyncCommand');
const purgeDataCommand = require('./src/cli/purgeDataCommand');
const purgeLogsCommand = require('./src/cli/purgeLogsCommand');

async function main() {
  // Najpierw sprawdźmy połączenie z bazą danych, zanim zaczniemy cokolwiek robić
//   try {
//     await testConnection();
//   } catch (error) {
//     // Jeśli nie można połączyć się z bazą, nie ma sensu kontynuować
//     // testConnection już loguje błąd
//     process.exit(1);
//   }

  // Konfiguracja Yargs
  yargs(hideBin(process.argv)) // hideBin(process.argv) usuwa pierwsze dwa argumenty (ścieżkę do node i skryptu)
    .scriptName("clickup-data-collector") // Nazwa naszej aplikacji w CLI
    .usage('$0 <command> [options]') // Jak wyświetlać pomoc
    
    // Rejestracja komend
    .command(syncUsersCommand)
    .command(setupDbCommand)
    .command(userRateCommand)
    .command(syncTasksCommand)
    .command(generateAggregatesCommand)
    .command(fullSyncCommand)
    .command(purgeDataCommand)
    .command(purgeLogsCommand)

    // Możesz dodać więcej globalnych opcji, np. --verbose
    // .option('verbose', {
    //   alias: 'v',
    //   type: 'boolean',
    //   description: 'Run with verbose logging'
    // })

    .demandCommand(1, 'You need to specify a command.') // Wymagaj przynajmniej jednej komendy
    .strict() // Pokazuj błąd, jeśli podano nieznaną komendę lub opcję
    .alias('h', 'help') // Alias dla pomocy
    .alias('v', 'version') // Alias dla wersji (yargs automatycznie doda obsługę --version jeśli package.json ma pole version)
    .epilog('For more information, find the documentation at https://your-docs-link.com (placeholder)') // Stopka
    .parse(); // Parsuj argumenty i wykonaj odpowiednią komendę
}

main().catch(error => {
  // Ten catch jest bardziej dla błędów w setupie `main`
  // Błędy w handlerach komend yargs powinny być łapane wewnątrz tych handlerów
  console.error("An unexpected error occurred during application startup:", error);
  process.exit(1);
});