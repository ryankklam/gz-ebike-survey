const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn('No POSTGRES_URL or DATABASE_URL environment variable set');
    }
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5000
    });
  }
  return pool;
}

async function query(text, params) {
  const pool = getPool();
  return pool.query(text, params);
}

async function getClient() {
  const pool = getPool();
  return pool.connect();
}

async function getSurveyByVersion(version) {
  const result = await query(
    'SELECT * FROM surveys WHERE version = $1',
    [version]
  );
  return result.rows[0] || null;
}

async function getLatestSurvey() {
  const result = await query(
    'SELECT * FROM surveys ORDER BY created_at DESC LIMIT 1'
  );
  return result.rows[0] || null;
}

async function getQuestionsWithOptions(surveyId) {
  const result = await query(
    `SELECT
      q.id,
      q.question_key,
      q.type,
      q.title,
      q.subtitle,
      q.hint,
      q.placeholder,
      q.required,
      q.max_select,
      q.sort_order,
      q.part_id,
      p.name as part_name,
      p.sort_order as part_sort_order,
      COALESCE(
        json_agg(
          json_build_object(
            'id', qo.id,
            'label', qo.label,
            'sort_order', qo.sort_order,
            'is_exclusive', qo.is_exclusive
          ) ORDER BY qo.sort_order
        ) FILTER (WHERE qo.id IS NOT NULL),
        '[]'
      ) as options
    FROM questions q
    JOIN parts p ON q.part_id = p.id
    LEFT JOIN question_options qo ON q.id = qo.question_id
    WHERE q.survey_id = $1
    GROUP BY q.id, p.id
    ORDER BY p.sort_order, q.sort_order`,
    [surveyId]
  );
  return result.rows;
}

async function getQuestionByKey(surveyId, questionKey) {
  const result = await query(
    'SELECT * FROM questions WHERE survey_id = $1 AND question_key = $2',
    [surveyId, questionKey]
  );
  return result.rows[0] || null;
}

module.exports = {
  getPool,
  query,
  getClient,
  getSurveyByVersion,
  getLatestSurvey,
  getQuestionsWithOptions,
  getQuestionByKey
};
