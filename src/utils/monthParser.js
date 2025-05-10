const levenshtein = require('fast-levenshtein'); // Potrzebna biblioteka do odległości Levenshteina
// Zainstaluj: npm install edit-distance

const POLISH_MONTHS_NOMINATIVE = [
    'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'
  ];
  
  const MONTH_CANONICAL_MAP = {};
  POLISH_MONTHS_NOMINATIVE.forEach(month => {
      MONTH_CANONICAL_MAP[month.toLowerCase()] = month;
  });
  
  function extractPolishMonth(text, maxDistance = 1) {
    if (!text || typeof text !== 'string') {
      return null;
    }
  
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/[\s\-_,.]+/);
  
    for (const word of words) {
      if (word.length < 3) continue;
  
      for (const canonicalMonth of POLISH_MONTHS_NOMINATIVE) {
        const lowerCanonicalMonth = canonicalMonth.toLowerCase();
        
        // Proste sprawdzenie `includes` dla pełnych nazw miesięcy (pozostaje bez zmian)
        if (lowerText.includes(lowerCanonicalMonth)) {
          return MONTH_CANONICAL_MAP[lowerCanonicalMonth];
        }
  
        // Sprawdzenie z odległością Levenshteina dla pojedynczych słów
        // Używamy teraz fast-levenshtein, który ma metodę .get()
        if (typeof levenshtein.get === 'function') { // <--- ZMIANA SPRAWDZENIA METODY
          const distance = levenshtein.get(word, lowerCanonicalMonth); // <--- ZMIANA WYWOŁANIA
          
          if (typeof distance === 'number' && distance <= maxDistance) {
               if (Math.abs(word.length - lowerCanonicalMonth.length) <= maxDistance + 1) { 
                  return MONTH_CANONICAL_MAP[lowerCanonicalMonth];
               }
          }
        }
      }
    }
    return null;
  }
  
  module.exports = {
    extractPolishMonth,
    POLISH_MONTHS_NOMINATIVE
  };