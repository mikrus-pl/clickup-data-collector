/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('ClickUpLists', function(table) {
      table.string('clickup_list_id').primary(); // ID listy z ClickUp
      table.string('list_name'); // Nazwa listy
      table.datetime('last_successful_task_sync_timestamp').nullable(); // Timestamp ostatniej synchronizacji zadań
      // table.timestamps(true, true);
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function(knex) {
    return knex.schema.dropTableIfExists('ClickUpLists');
  };