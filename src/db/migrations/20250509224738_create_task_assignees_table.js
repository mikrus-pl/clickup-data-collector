/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('TaskAssignees', function(table) {
      table.string('clickup_task_id').notNullable();
      table.foreign('clickup_task_id').references('clickup_task_id').inTable('Tasks').onDelete('CASCADE');
  
      table.integer('clickup_user_id').notNullable();
      table.foreign('clickup_user_id').references('clickup_user_id').inTable('Users').onDelete('CASCADE');
  
      // Klucz główny złożony z dwóch kolumn
      table.primary(['clickup_task_id', 'clickup_user_id']);
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function(knex) {
    return knex.schema.dropTableIfExists('TaskAssignees');
  };