const { db } = require('../db/database');
const CommandLogger = require('../utils/commandLogger');

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
    // Initialize command logger
    const commandLogger = new CommandLogger('purge-logs');
    await commandLogger.start({
      confirm: argv.confirm
    });
    
    if (!argv.confirm) {
      const warnMsg = 'Logs purge operation was not confirmed. No action taken.';
      console.warn(warnMsg);
      await commandLogger.logOutput(warnMsg);
      console.warn('To purge all logs, run: node app.js purge-logs --confirm');
      await commandLogger.logOutput('To purge all logs, run: node app.js purge-logs --confirm');
      await commandLogger.complete();
      return;
    }

    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.warn('!!!              WARNING: LOGS PURGE                   !!!');
    console.warn('!!! This will delete all entries from the command logs !!!');
    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('Proceeding with logs purge...');
    await commandLogger.logOutput('Proceeding with logs purge...');

    try {
      console.log('Deleting all entries from CommandLogs table...');
      const deletedCount = await db('CommandLogs').del();
      console.log(`Successfully deleted ${deletedCount} log entries.`);
      await commandLogger.logOutput(`Successfully deleted ${deletedCount} log entries.`);
      const successMsg = 'Logs purge operation completed successfully.';
      console.log(successMsg);
      await commandLogger.logOutput(successMsg);
      await commandLogger.complete();
    } catch (error) {
      console.error('Error during logs purge operation:', error);
      await commandLogger.logOutput(`Error during logs purge operation: ${error.message}`);
      await commandLogger.logOutput(error.stack);
      process.exitCode = 1;
      await commandLogger.fail(error);
    } finally {
      console.log('Closing database connection (purge-logs)...');
      await db.destroy();
      console.log('Database connection closed (purge-logs).');
    }
  },
};
