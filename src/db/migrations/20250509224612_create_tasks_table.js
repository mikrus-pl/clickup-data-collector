/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('Tasks', function(table) {
      table.string('clickup_task_id').primary();
      table.string('clickup_list_id').notNullable(); // Zadanie musi należeć do listy
      // Klucz obcy do ClickUpLists. Jeśli lista zostanie usunięta, jej zadania też (CASCADE).
      table.foreign('clickup_list_id').references('clickup_list_id').inTable('ClickUpLists').onDelete('CASCADE');
  
      table.text('name').notNullable();
      table.string('parent_clickup_task_id').nullable();
      // Klucz obcy do tej samej tabeli (Tasks) dla relacji rodzic-dziecko.
      table.foreign('parent_clickup_task_id').references('clickup_task_id').inTable('Tasks').onDelete('CASCADE');
  
      table.boolean('is_parent_flag').defaultTo(false);
      table.string('extracted_month_from_name').nullable();
      table.string('custom_field_client').nullable();
      table.string('status_clickup');
      table.bigInteger('time_spent_on_task_ms').defaultTo(0);
      table.datetime('date_created_clickup');
      table.datetime('date_updated_clickup');
      table.boolean('archived_clickup').defaultTo(false);
      table.datetime('date_last_synced').notNullable();
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function(knex) {
    return knex.schema.dropTableIfExists('Tasks');
  };