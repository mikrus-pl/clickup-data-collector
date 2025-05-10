const axios = require('axios');
require('dotenv').config({ path: require('find-config')('.env') }); // Upewnij się, że .env jest ładowany poprawnie, nawet gdy moduł jest w podfolderze

const CLICKUP_API_BASE_URL = 'https://api.clickup.com/api/v2';
const API_KEY = process.env.CLICKUP_API_KEY;

if (!API_KEY) {
  console.error('CRITICAL: CLICKUP_API_KEY is not defined in .env file. ClickUpService will not work.');
  // Możesz rzucić błąd, aby zatrzymać aplikację, jeśli klucz jest absolutnie niezbędny
  // throw new Error('CLICKUP_API_KEY is not defined.');
}

// Instancja Axios z domyślną konfiguracją
const apiClient = axios.create({
  baseURL: CLICKUP_API_BASE_URL,
  headers: {
    'Authorization': API_KEY,
    'Content-Type': 'application/json'
  }
});

/**
 * Obsługuje błędy z API ClickUp w bardziej czytelny sposób.
 * @param {Error} error Obiekt błędu z Axios.
 * @param {string} context Opis kontekstu, w którym wystąpił błąd.
 */
function handleApiError(error, context) {
  console.error(`Error during ${context}:`);
  if (error.response) {
    // Serwer odpowiedział statusem błędu (4xx, 5xx)
    console.error('Status:', error.response.status);
    console.error('Data:', error.response.data);
    // Specyficzne komunikaty dla popularnych błędów
    if (error.response.status === 401) {
      console.error('This might be due to an invalid or missing API key.');
    }
  } else if (error.request) {
    // Żądanie zostało wysłane, ale nie otrzymano odpowiedzi
    console.error('No response received:', error.request);
  } else {
    // Coś poszło nie tak przy konfiguracji żądania
    console.error('Error setting up request:', error.message);
  }
  // Rzuć błąd dalej lub zwróć null/pustą tablicę, w zależności od strategii
  // throw error; // Jeśli chcesz, aby błąd przerwał operację
  return null; // Lub zwróć coś, co oznacza niepowodzenie
}

/**
 * Pobiera wszystkie zespoły (workspaces/teams) dostępne dla danego klucza API.
 * @returns {Promise<Array<object>|null>} Tablica obiektów zespołów lub null w przypadku błędu.
 */
async function getTeams() {
  if (!API_KEY) return null; // Nie próbuj, jeśli brakuje klucza
  try {
    const response = await apiClient.get('/team');
    return response.data.teams;
  } catch (error) {
    handleApiError(error, 'fetching teams');
    return null;
  }
}

/**
 * Pobiera listę unikalnych użytkowników ze wszystkich zespołów.
 * @returns {Promise<Array<{id: number, username: string, email: string}>|null>} Tablica obiektów użytkowników.
 */
async function getAllUsersFromTeams() {
  const teams = await getTeams();
  if (!teams) {
    console.log('No teams found or error fetching teams.');
    return []; // Zwróć pustą tablicę, jeśli nie ma zespołów
  }

  const allUsersMap = new Map(); // Użyj Map do przechowywania unikalnych użytkowników po ID

  teams.forEach(team => {
    if (team.members) {
      team.members.forEach(member => {
        if (member.user && !allUsersMap.has(member.user.id)) {
          allUsersMap.set(member.user.id, {
            id: member.user.id,
            username: member.user.username,
            email: member.user.email,
            // Możesz dodać więcej pól, jeśli są potrzebne i dostępne, np. profilePicture
          });
        }
      });
    }
  });
  
  console.log(`Fetched ${allUsersMap.size} unique users from ClickUp.`);
  return Array.from(allUsersMap.values());
}

/**
 * Pobiera zadania z danej listy ClickUp, obsługując paginację i podzadania.
 * @param {string} listId ID listy ClickUp.
 * @param {object} [options={}] Opcje filtrowania.
 * @param {number} [options.date_updated_gt] Timestamp (w milisekundach) do filtrowania zadań zaktualizowanych po tej dacie.
 * @param {boolean} [options.archived=false] Czy pobierać zarchiwizowane zadania.
 * @returns {Promise<Array<object>>} Tablica obiektów zadań z ClickUp API.
 */
async function getTasksFromList(listId, options = {}) {
    if (!API_KEY) return [];
    if (!listId) {
      console.error('List ID is required to fetch tasks.');
      return [];
    }
  
    let allTasks = [];
    let page = 0;
    let hasMorePages = true;
  
    const params = {
      subtasks: true, // Zawsze pobieraj podzadania
      page: page,
      archived: options.archived || false, // Domyślnie nie pobieraj zarchiwizowanych
      // include_closed: true, // Można rozważyć, jeśli potrzebne są też zamknięte zadania, które nie są zarchiwizowane
    };
  
    if (options.date_updated_gt) {
      params.date_updated_gt = options.date_updated_gt;
    }
    
    // Można dodać więcej filtrów przekazywanych w options, np. assignees, statuses, tags, etc.
  
    console.log(`Fetching tasks for list ID: ${listId} with params:`, params);
  
    while (hasMorePages) {
      try {
        params.page = page;
        const response = await apiClient.get(`/list/${listId}/task`, { params });
        
        if (response.data && response.data.tasks) {
          allTasks = allTasks.concat(response.data.tasks);
          console.log(`Fetched page ${page}: ${response.data.tasks.length} tasks. Total fetched so far: ${allTasks.length}`);
          
          // ClickUp API zwraca 'last_page: false' jeśli są kolejne strony,
          // lub nie zwraca 'last_page' albo 'last_page: true' jeśli to ostatnia.
          // Bezpieczniej jest sprawdzać, czy otrzymaliśmy zadania. Jeśli tak, próbujemy następną stronę.
          // Bardziej formalnie, ClickUp zwraca `last_page: false` lub `last_page: true`.
          // Jeśli `tasks` jest puste, to też koniec.
          if (response.data.last_page === true || response.data.tasks.length === 0) {
            hasMorePages = false;
          } else {
            page++;
          }
        } else {
          hasMorePages = false; // Brak zadań lub niepoprawna odpowiedź
        }
      } catch (error) {
        handleApiError(error, `fetching tasks from list ${listId}, page ${page}`);
        hasMorePages = false; // Zatrzymaj pętlę w przypadku błędu
        return []; // Zwróć pustą tablicę w przypadku błędu API
      }
    }
    console.log(`Finished fetching tasks for list ${listId}. Total tasks (including subtasks): ${allTasks.length}`);
    return allTasks;
  }

module.exports = {
  getTeams,
  getAllUsersFromTeams,
  getTasksFromList,
  // Tutaj później dodamy funkcje do pobierania zadań itp.
};