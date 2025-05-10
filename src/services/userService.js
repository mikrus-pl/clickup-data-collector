const { db } = require('../db/database'); // Importujemy instancję knex
const { format } = require('date-fns'); // Do formatowania daty

const USERS_TABLE = 'Users';

/**
 * Pobiera użytkownika po jego ClickUp ID.
 * @param {number} clickupUserId ID użytkownika z ClickUp.
 * @returns {Promise<object|null>} Obiekt użytkownika lub null, jeśli nie znaleziono.
 */
async function getUserById(clickupUserId) {
  return db(USERS_TABLE).where('clickup_user_id', clickupUserId).first();
}

/**
 * Dodaje nowego użytkownika lub aktualizuje istniejącego (upsert).
 * @param {object} userData Dane użytkownika.
 * @param {number} userData.clickup_user_id
 * @param {string} userData.username
 * @param {string} [userData.email]
 * @param {boolean} [userData.is_active=true]
 * @returns {Promise<object>} Obiekt dodanego/zaktualizowanego użytkownika.
 */
async function upsertUser(userData) {
  const { clickup_user_id, username, email, is_active = true } = userData;
  const now = format(new Date(), "yyyy-MM-dd HH:mm:ss"); // Aktualny czas dla date_synced

  const userPayload = {
    clickup_user_id,
    // Jeśli username jest falsy (null, undefined, pusty string), użyj domyślnej wartości.
    username: username || `UnknownUser_${clickup_user_id}`,
    email: email || null,
    is_active,
    date_synced: now
  };

  // Sprawdzenie, czy username po podstawieniu wartości domyślnej nie jest nadal problematyczne
  if (!userPayload.username) {
      // To nie powinno się zdarzyć z powyższą logiką, ale dla pewności
      console.error(`Critical error: Username for user ID ${clickup_user_id} is still null/empty after attempting to set a default. Skipping upsert.`);
      // Możesz rzucić błąd lub zwrócić coś, co wskazuje na problem
      return null; 
  }

  // Knex nie ma wbudowanego "upsert" dla wszystkich baz danych w prosty sposób.
  // Dla SQLite możemy użyć `onConflict().merge()`.
  // Dla innych baz może być potrzebne inne podejście (np. raw SQL lub sprawdzanie istnienia).
  
  // Wersja dla SQLite:
  const result = await db(USERS_TABLE)
    .insert(userPayload)
    .onConflict('clickup_user_id') // Jeśli wystąpi konflikt na kluczu głównym 'clickup_user_id'
    .merge() // Zaktualizuj istniejący wiersz danymi z userPayload (oprócz klucza głównego)
    .returning('*'); // Zwróć wszystkie kolumny wstawionego/zaktualizowanego wiersza

  return result[0]; // insert...returning zwraca tablicę
}

/**
 * Pobiera wszystkich aktywnych użytkowników.
 * @returns {Promise<Array<object>>} Tablica obiektów użytkowników.
 */
async function getAllActiveUsers() {
  return db(USERS_TABLE).where('is_active', true).select('*');
}

module.exports = {
  getUserById,
  upsertUser,
  getAllActiveUsers,
};