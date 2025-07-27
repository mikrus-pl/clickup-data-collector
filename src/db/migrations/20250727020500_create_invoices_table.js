/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('Invoices', function(table) {
      table.increments('invoice_id').primary(); // Auto-incrementing ID for the invoice
      table.string('customer_name').notNullable(); // Name of the customer
      table.decimal('invoice_amount', 12, 2).notNullable(); // Invoice amount with up to 12 digits and 2 decimal places
      table.string('invoice_currency', 3).notNullable(); // Currency code (e.g., 'USD', 'EUR', 'PLN')
      table.string('month_name', 20).notNullable(); // Month name to know which month it should be assigned to
      table.datetime('entry_creation_date').notNullable(); // Entry creation date
      table.datetime('date_last_updated').defaultTo(knex.fn.now()); // Last updated timestamp
      // table.timestamps(true, true); // Alternative way to add created_at and updated_at
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function(knex) {
    return knex.schema.dropTableIfExists('Invoices');
  };
