const userService = require('../services/userService');
const clickupService = require('../services/clickupService');
const { db } = require('../db/database'); // Możemy potrzebować db do logowania bezpośrednio
const { format } = require('date-fns');
const CommandLogger = require('../utils/commandLogger');

module.exports = {
  command: 'sync-users',
  describe: 'Fetches users from ClickUp and synchronizes them with the local database.',
  builder: (yargs) => {
    return yargs.option('verbose', {
      alias: 'V', // Use capital V to avoid conflict with global -v (version)
      type: 'boolean',
      description: 'Enable verbose logging of all JSON requests and responses',
      default: false
    });
  },
  handler: async (argv) => {
    // Initialize command logger
    const commandLogger = new CommandLogger('sync-users');
    await commandLogger.start({
      verbose: argv.verbose,
      // Add other relevant args here
    });

    if (argv.verbose) {
      process.env.SYNC_USERS_VERBOSE = '1';
    }
    
    let syncLogId = null;
    const syncStartTime = new Date();
    
    try {
      console.log('Starting user synchronization process...');
      await commandLogger.logOutput('Starting user synchronization process...');
      
      const apiKey = process.env.CLICKUP_API_KEY;
      if (!apiKey) {
        const errorMsg = 'ERROR: CLICKUP_API_KEY is not defined. Cannot synchronize users.';
        console.error(errorMsg);
        await commandLogger.logOutput(errorMsg);
        process.exitCode = 1; 
        await commandLogger.fail(errorMsg);
        return; // Wyjście z handlera
      }
      
      // Rozpocznij logowanie synchronizacji
      const logEntry = await db('SyncLog').insert({
        sync_start_time: format(syncStartTime, "yyyy-MM-dd HH:mm:ss"),
        sync_type: 'USERS',
        status: 'PENDING', // Początkowy status
      }).returning('log_id');
      syncLogId = logEntry[0].log_id || logEntry[0];
      
      const clickUpUsers = await clickupService.getAllUsersFromTeams();
      let newUsersCount = 0;
      let updatedUsersCount = 0;
      
      if (clickUpUsers && clickUpUsers.length > 0) {
        const foundUsersMsg = `Found ${clickUpUsers.length} users in ClickUp. Syncing with database...`;
        console.log(foundUsersMsg);
        await commandLogger.logOutput(foundUsersMsg);
        
        for (const cuUser of clickUpUsers) {
          const userRole = cuUser.role; // Assuming role is directly available on cuUser

          // Define allowed roles
          const allowedRoles = [1, 2, 3]; // Owner, Admin, Member

          if (allowedRoles.includes(userRole)) {
            const existingUser = await userService.getUserById(cuUser.id);
            const userData = {
              clickup_user_id: cuUser.id,
              username: cuUser.username,
              email: cuUser.email,
              role: userRole, // Pass the role
              is_active: true
            };
            await userService.upsertUser(userData);
            // Update counts
            if (existingUser) {
              if (existingUser.username !== userData.username || existingUser.email !== userData.email || existingUser.is_active !== userData.is_active || existingUser.role !== userData.role) {
                  updatedUsersCount++;
              }
            } else {
              newUsersCount++;
            }
          } else {
            // Optionally, log skipped users
            const skipMsg = `Skipping user ${cuUser.username} (ID: ${cuUser.id}) with role ${userRole} (Guest).`;
            console.log(skipMsg);
            await commandLogger.logOutput(skipMsg);
          }
        }
        
        const completeMsg = `Synchronization complete: ${newUsersCount} new users, ${updatedUsersCount} updated users.`;
        console.log(completeMsg);
        await commandLogger.logOutput(completeMsg);
        
        if (syncLogId) {
          await db('SyncLog').where('log_id', syncLogId).update({
            sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
            items_fetched_new: newUsersCount,
            items_updated: updatedUsersCount,
            status: 'SUCCESS',
          });
        }
        
        await commandLogger.complete();
      } else if (clickUpUsers) { 
        const noUsersMsg = 'No users found in ClickUp teams or teams are empty.';
        console.log(noUsersMsg);
        await commandLogger.logOutput(noUsersMsg);
        
        if (syncLogId) {
          await db('SyncLog').where('log_id', syncLogId).update({
            sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
            status: 'SUCCESS',
            details_message: 'No users found in ClickUp teams.',
          });
        }
        
        await commandLogger.complete();
      } else { 
        const failMsg = 'Failed to fetch users from ClickUp. Check previous error messages from clickupService.';
        console.error(failMsg);
        await commandLogger.logOutput(failMsg);
        
        if (syncLogId) {
          await db('SyncLog').where('log_id', syncLogId).update({
            sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
            status: 'FAILURE',
            details_message: 'Failed to fetch users from ClickUp API.',
          });
        }
        
        process.exitCode = 1;
        await commandLogger.fail(failMsg);
      }
    } catch (error) {
      const errorMsg = `Error during user synchronization command: ${error.message}`;
      console.error(errorMsg);
      console.error(error.stack);
      await commandLogger.logOutput(errorMsg);
      await commandLogger.logOutput(error.stack);
      
      if (syncLogId) {
        try {
          await db('SyncLog').where('log_id', syncLogId).update({
            sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
            status: 'FAILURE',
            details_message: `Critical error: ${error.message}`,
          });
        } catch (logError) {
          const logErrorMsg = 'Additionally, failed to update SyncLog for failure:';
          console.error(logErrorMsg, logError);
          await commandLogger.logOutput(`${logErrorMsg} ${logError.message}`);
        }
      }
      
      process.exitCode = 1;
      await commandLogger.fail(error);
    } finally {
      // Zawsze próbuj zamknąć połączenie z bazą danych
      console.log('Closing database connection...');
      
      await db.destroy(); // <--- WAŻNE: Zamknięcie połączenia Knex
      
      console.log('Database connection closed.');
    }
  },
};
