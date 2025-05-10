/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('UserHourlyRates', function(table) {
      table.increments('rate_id').primary(); // Wewnętrzny autoinkrementujący ID
      table.integer('user_id').notNullable();
      // Klucz obcy do tabeli Users
      table.foreign('user_id').references('clickup_user_id').inTable('Users').onDelete('CASCADE'); // CASCADE oznacza, że jeśli użytkownik zostanie usunięty, jego stawki też
      table.decimal('hourly_rate', 10, 2).notNullable(); // Stawka godzinowa, np. 10 cyfr łącznie, 2 po przecinku
      table.date('effective_from_date').notNullable(); // Data, od której stawka obowiązuje
      table.date('effective_to_date').nullable(); // Data, do której stawka obowiązuje (NULL = aktualna)
      // table.timestamps(true, true);
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function(knex) {
    return knex.schema.dropTableIfExists('UserHourlyRates');
  };