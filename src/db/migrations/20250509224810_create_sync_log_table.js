/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('SyncLog', function(table) {
      table.increments('log_id').primary();
      table.datetime('sync_start_time').notNullable();
      table.datetime('sync_end_time').nullable();
      table.string('sync_type').notNullable(); // np. "USERS", "TASKS_FULL", "TASKS_INCREMENTAL", "AGGREGATES"
      table.string('target_list_id').nullable(); // ID listy ClickUp, jeśli dotyczy
      table.foreign('target_list_id').references('clickup_list_id').inTable('ClickUpLists').onDelete('SET NULL'); // Jeśli lista usunięta, log pozostaje bez powiązania
  
      table.integer('items_fetched_new').defaultTo(0);
      table.integer('items_updated').defaultTo(0);
      table.string('status').notNullable(); // 'SUCCESS', 'PARTIAL_FAILURE', 'FAILURE'
      table.text('details_message').nullable(); // Dodatkowe informacje, błędy
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function(knex) {
    return knex.schema.dropTableIfExists('SyncLog');
  };