/**
 * In-memory cache for formatted questions.
 * Avoids hitting the database on every /api/questions request.
 * Call invalidateQuestionsCache() after any seed / admin write.
 */

// Map<version, { version, questions }>  — formatted JSON-ready payload
const _cache = new Map();

/**
 * Get cached questions for a version, or null if not cached.
 */
function getCachedQuestions(version) {
  return _cache.get(version) || null;
}

/**
 * Store formatted questions payload in cache.
 */
function setCachedQuestions(version, payload) {
  _cache.set(version, payload);
}

/**
 * Remove a specific version from cache, or clear all.
 */
function invalidateQuestionsCache(version) {
  if (version) {
    _cache.delete(version);
  } else {
    _cache.clear();
  }
}

module.exports = {
  getCachedQuestions,
  setCachedQuestions,
  invalidateQuestionsCache
};
