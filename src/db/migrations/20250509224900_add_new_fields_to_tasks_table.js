/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('Tasks', function(table) {
    table.datetime('start_date').nullable();
    table.datetime('due_date').nullable();
    table.string('custom_field_client_2025').nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('Tasks', function(table) {
    table.dropColumn('start_date');
    table.dropColumn('due_date');
    table.dropColumn('custom_field_client_2025');
  });
};
