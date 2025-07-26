const userService = require('../services/userService');
const clickupService = require('../services/clickupService');
const { db } = require('../db/database'); // Możemy potrzebować db do logowania bezpośrednio
const { format } = require('date-fns');

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
    if (argv.verbose) {
      process.env.SYNC_USERS_VERBOSE = '1';
    }
    console.log('Starting user synchronization process...');
    let syncLogId = null;
    const syncStartTime = new Date();
    try {
      const apiKey = process.env.CLICKUP_API_KEY;
      if (!apiKey) {
        console.error('ERROR: CLICKUP_API_KEY is not defined. Cannot synchronize users.');
        process.exitCode = 1; 
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
        console.log(`Found ${clickUpUsers.length} users in ClickUp. Syncing with database...`);
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
            console.log(`Skipping user ${cuUser.username} (ID: ${cuUser.id}) with role ${userRole} (Guest).`);
          }
        }
        console.log(`Synchronization complete: ${newUsersCount} new users, ${updatedUsersCount} updated users.`);
        if (syncLogId) {
          await db('SyncLog').where('log_id', syncLogId).update({
            sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
            items_fetched_new: newUsersCount,
            items_updated: updatedUsersCount,
            status: 'SUCCESS',
          });
        }
      } else if (clickUpUsers) { 
        console.log('No users found in ClickUp teams or teams are empty.');
        if (syncLogId) {
          await db('SyncLog').where('log_id', syncLogId).update({
            sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
            status: 'SUCCESS',
            details_message: 'No users found in ClickUp teams.',
          });
        }
      } else { 
        console.error('Failed to fetch users from ClickUp. Check previous error messages from clickupService.');
        if (syncLogId) {
          await db('SyncLog').where('log_id', syncLogId).update({
            sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
            status: 'FAILURE',
            details_message: 'Failed to fetch users from ClickUp API.',
          });
        }
        process.exitCode = 1;
      }
    } catch (error) {
      console.error('Error during user synchronization command:', error);
      if (syncLogId) {
        try {
          await db('SyncLog').where('log_id', syncLogId).update({
            sync_end_time: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
            status: 'FAILURE',
            details_message: `Critical error: ${error.message}`,
          });
        } catch (logError) {
          console.error('Additionally, failed to update SyncLog for failure:', logError);
        }
      }
      process.exitCode = 1;
    } finally {
      // Zawsze próbuj zamknąć połączenie z bazą danych
      console.log('Closing database connection...');
      await db.destroy(); // <--- WAŻNE: Zamknięcie połączenia Knex
      console.log('Database connection closed.');
    }
  },
};
