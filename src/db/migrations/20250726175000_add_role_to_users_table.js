/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('Users', function(table) {
    table.integer('role').nullable(); // Add role column to store user role from ClickUp
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('Users', function(table) {
    table.dropColumn('role'); // Remove role column if migration is rolled back
  });
};
