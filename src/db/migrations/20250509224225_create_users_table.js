/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('Users', function(table) {
      table.integer('clickup_user_id').primary(); // ID użytkownika z ClickUp
      table.string('username').notNullable(); // Nazwa użytkownika z ClickUp
      table.string('email'); // Adres email użytkownika
      table.boolean('is_active').defaultTo(true); // Czy użytkownik jest aktywny
      table.datetime('date_synced').notNullable(); // Data ostatniej synchronizacji
      // Możesz dodać timestamps dla created_at i updated_at, jeśli chcesz śledzić zmiany w tej tabeli
      // table.timestamps(true, true); // Tworzy created_at i updated_at
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function(knex) {
    return knex.schema.dropTableIfExists('Users');
  };