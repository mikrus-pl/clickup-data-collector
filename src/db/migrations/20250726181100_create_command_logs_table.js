/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('CommandLogs', function(table) {
    table.increments('log_id').primary(); // Auto-incrementing ID
    table.string('command_name').notNullable(); // Name of the command executed
    table.text('command_args'); // JSON string of arguments
    table.datetime('start_time').notNullable(); // When the command started
    table.datetime('end_time'); // When the command finished
    table.string('status'); // 'started', 'completed', 'failed'
    table.text('output'); // Console output (truncated if too long)
    table.text('error_message'); // Error message if command failed
    table.timestamps(true, true); // created_at and updated_at
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('CommandLogs');
};
