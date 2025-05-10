/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('ReportedTaskAggregates', function(table) {
      table.string('clickup_parent_task_id').notNullable();
      table.foreign('clickup_parent_task_id').references('clickup_task_id').inTable('Tasks').onDelete('CASCADE');
  
      table.integer('reported_for_user_id').notNullable();
      table.foreign('reported_for_user_id').references('clickup_user_id').inTable('Users').onDelete('CASCADE');
  
      table.text('parent_task_name').notNullable();
      table.string('client_name').nullable();
      table.string('extracted_month_from_parent_name').nullable();
      table.integer('total_time_minutes').notNullable();
      table.integer('total_time_seconds').notNullable(); // Sekundy w zakresie 0-59
      table.datetime('last_calculated_at').notNullable();
  
      // Klucz główny złożony
      table.primary(['clickup_parent_task_id', 'reported_for_user_id']);
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function(knex) {
    return knex.schema.dropTableIfExists('ReportedTaskAggregates');
  };