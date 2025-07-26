const { db } = require('../db/database');

module.exports = {
  command: 'purge-logs',
  describe: 'Deletes all entries from the command logs table. USE WITH CAUTION!',
  builder: (yargs) => {
    return yargs
      .option('confirm', {
        describe: 'Confirm the logs purge operation. Without this flag, no action will be taken.',
        type: 'boolean',
        default: false,
      });
  },
  handler: async (argv) => {
    if (!argv.confirm) {
      console.warn('Logs purge operation was not confirmed. No action taken.');
      console.warn('To purge all logs, run: node app.js purge-logs --confirm');
      return;
    }

    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.warn('!!!              WARNING: LOGS PURGE                   !!!');
    console.warn('!!! This will delete all entries from the command logs !!!');
    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('Proceeding with logs purge...');

    try {
      console.log('Deleting all entries from CommandLogs table...');
      const deletedCount = await db('CommandLogs').del();
      console.log(`Successfully deleted ${deletedCount} log entries.`);
    } catch (error) {
      console.error('Error during logs purge operation:', error);
      process.exitCode = 1;
    } finally {
      console.log('Closing database connection (purge-logs)...');
      await db.destroy();
      console.log('Database connection closed (purge-logs).');
    }
  },
};
