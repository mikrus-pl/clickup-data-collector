/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('Invoices', function(table) {
    table.text('description').nullable(); // Description of the invoice/services provided
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('Invoices', function(table) {
    table.dropColumn('description');
  });
};
