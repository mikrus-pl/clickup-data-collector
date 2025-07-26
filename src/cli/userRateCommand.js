const { db } = require('../db/database');
const { format, subDays, isValid, parseISO } = require('date-fns'); // Potrzebujemy więcej funkcji z date-fns
const CommandLogger = require('../utils/commandLogger');

// Pomocnicza funkcja do walidacji formatu daty RRRR-MM-DD
function isValidDateString(dateString) {
  const date = parseISO(dateString); // parseISO jest bardziej elastyczne niż parse(dateString, 'yyyy-MM-dd', new Date())
  return isValid(date) && dateString.match(/^\d{4}-\d{2}-\d{2}$/);
}

module.exports = {
  command: 'user-rate <command>', // Główna komenda, która oczekuje podkomendy
  describe: 'Manage user hourly rates.',
  builder: (yargs) => {
    return yargs
      .command({
        command: 'set',
        describe: 'Set a new hourly rate for a user from a specific date.',
        builder: (yargsSet) => {
          return yargsSet
            .option('userId', {
              describe: 'ClickUp User ID',
              type: 'number',
              demandOption: true, // Wymagane
            })
            .option('rate', {
              describe: 'Hourly rate (e.g., 30.50)',
              type: 'number',
              demandOption: true,
            })
            .option('fromDate', {
              describe: 'Date from which the rate is effective (YYYY-MM-DD)',
              type: 'string',
              demandOption: true,
              coerce: (arg) => { // Walidacja i konwersja formatu daty
                if (!isValidDateString(arg)) {
                  throw new Error(`Invalid date format for fromDate: "${arg}". Please use YYYY-MM-DD.`);
                }
                return arg;
              }
            });
        },
        handler: async (argv) => {
          // Initialize command logger
          const commandLogger = new CommandLogger('user-rate set');
          await commandLogger.start({
            userId: argv.userId,
            rate: argv.rate,
            fromDate: argv.fromDate
          });
          
          console.log(`Setting hourly rate for user ID ${argv.userId} to ${argv.rate} from ${argv.fromDate}...`);
          await commandLogger.logOutput(`Setting hourly rate for user ID ${argv.userId} to ${argv.rate} from ${argv.fromDate}...`);
          const { userId, rate, fromDate } = argv;

          try {
            // Sprawdź, czy użytkownik istnieje
            const user = await db('Users').where('clickup_user_id', userId).first();
            if (!user) {
              console.error(`Error: User with ClickUp ID ${userId} not found in the database. Please sync users first.`);
              process.exitCode = 1;
              return;
            }

            // Rozpocznij transakcję, aby zapewnić atomowość operacji
            await db.transaction(async trx => {
              // 1. Zaktualizuj 'effective_to_date' dla poprzedniej aktywnej stawki (jeśli istnieje)
              //    Poprzednia aktywna stawka to ta, która ma `effective_to_date` IS NULL dla tego użytkownika.
              const previousActiveRate = await trx('UserHourlyRates')
                .where('user_id', userId)
                .whereNull('effective_to_date')
                .first();

              if (previousActiveRate) {
                // Nowa data końcowa to dzień przed 'fromDate' nowej stawki
                const newEffectiveToDate = format(subDays(parseISO(fromDate), 1), 'yyyy-MM-dd');
                
                // Upewnij się, że nowa data końcowa nie jest wcześniejsza niż data początkowa poprzedniej stawki
                if (parseISO(newEffectiveToDate) < parseISO(previousActiveRate.effective_from_date)) {
                    console.warn(`Warning: The new rate starting ${fromDate} makes a previous rate period invalid. Adjusting 'effective_to_date' of previous rate (ID: ${previousActiveRate.rate_id}) to its 'effective_from_date' effectively voiding it, or consider deleting it.`);
                    // Można by tu podjąć decyzję o usunięciu starej stawki, lub ustawieniu to_date = from_date
                    await trx('UserHourlyRates')
                      .where('rate_id', previousActiveRate.rate_id)
                      .update({ effective_to_date: previousActiveRate.effective_from_date });
                } else {
                    await trx('UserHourlyRates')
                      .where('rate_id', previousActiveRate.rate_id)
                      .update({ effective_to_date: newEffectiveToDate });
                    console.log(`Updated previous rate (ID: ${previousActiveRate.rate_id}) to end on ${newEffectiveToDate}.`);
                }
              }

              // 2. Wstaw nową stawkę
              // Sprawdź, czy już nie istnieje stawka z taką samą datą początkową dla tego użytkownika
              const existingRateForDate = await trx('UserHourlyRates')
                .where('user_id', userId)
                .where('effective_from_date', fromDate)
                .first();

              if (existingRateForDate) {
                // Jeśli istnieje, zaktualizuj ją zamiast wstawiać nową
                await trx('UserHourlyRates')
                  .where('rate_id', existingRateForDate.rate_id)
                  .update({
                    hourly_rate: rate,
                    effective_to_date: null // Upewnij się, że jest to aktywna stawka
                  });
                console.log(`Updated existing rate (ID: ${existingRateForDate.rate_id}) for date ${fromDate} with new rate ${rate}.`);
              } else {
                // Jeśli nie, wstaw nową
                await trx('UserHourlyRates').insert({
                  user_id: userId,
                  hourly_rate: rate,
                  effective_from_date: fromDate,
                  effective_to_date: null, // Nowa stawka jest aktywna
                });
                console.log(`New hourly rate ${rate} for user ID ${userId} set from ${fromDate}.`);
                await commandLogger.logOutput(`New hourly rate ${rate} for user ID ${userId} set from ${fromDate}.`);
              }
            }); // Koniec transakcji (commit lub rollback)

            console.log('Hourly rate operation completed successfully.');
            await commandLogger.logOutput('Hourly rate operation completed successfully.');
            await commandLogger.complete();

          } catch (error) {
            console.error('Error setting user hourly rate:', error);
            await commandLogger.logOutput(`Error setting user hourly rate: ${error.message}`);
            await commandLogger.logOutput(error.stack);
            process.exitCode = 1;
            await commandLogger.fail(error);
          } finally {
            await db.destroy();
          }
        },
      })
      .command({
        command: 'list',
        describe: 'List hourly rates for a user or all users.',
        builder: (yargsList) => {
          return yargsList
            .option('userId', {
              describe: 'ClickUp User ID to list rates for (optional)',
              type: 'number',
            });
        },
        handler: async (argv) => {
          // Initialize command logger
          const commandLogger = new CommandLogger('user-rate list');
          await commandLogger.start({
            userId: argv.userId
          });
          
          console.log(argv.userId ? `Listing hourly rates for user ID ${argv.userId}...` : 'Listing hourly rates for all users...');
          await commandLogger.logOutput(argv.userId ? `Listing hourly rates for user ID ${argv.userId}...` : 'Listing hourly rates for all users...');
          try {
            let query = db('UserHourlyRates')
              .join('Users', 'UserHourlyRates.user_id', '=', 'Users.clickup_user_id')
              .select(
                'UserHourlyRates.rate_id',
                'Users.username',
                'UserHourlyRates.user_id as clickup_user_id',
                'UserHourlyRates.hourly_rate',
                'UserHourlyRates.effective_from_date',
                'UserHourlyRates.effective_to_date'
              )
              .orderBy(['UserHourlyRates.user_id', 'UserHourlyRates.effective_from_date']);

            if (argv.userId) {
              query = query.where('UserHourlyRates.user_id', argv.userId);
            }

            const rates = await query;

            if (rates.length === 0) {
              console.log(argv.userId ? `No rates found for user ID ${argv.userId}.` : 'No rates found in the database.');
            } else {
              console.table(rates.map(rate => ({
                ...rate,
                // Formatowanie dat dla lepszej czytelności w konsoli
                effective_from_date: rate.effective_from_date, // Już jest stringiem YYYY-MM-DD
                effective_to_date: rate.effective_to_date || 'Current' // Już jest stringiem YYYY-MM-DD lub null
              })));
              await commandLogger.logOutput(`Found ${rates.length} hourly rates.`);
            }
            await commandLogger.complete();
          } catch (error) {
            console.error('Error listing user hourly rates:', error);
            await commandLogger.logOutput(`Error listing user hourly rates: ${error.message}`);
            await commandLogger.logOutput(error.stack);
            process.exitCode = 1;
            await commandLogger.fail(error);
          } finally {
            await db.destroy();
          }
        },
      })
      .demandCommand(1, 'You must specify a sub-command for user-rate (set or list).');
  },
};