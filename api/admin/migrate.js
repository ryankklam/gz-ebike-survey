const { getClient } = require('../_db');
const { verifyToken, setCors } = require('../_utils');

const BIN_ID = process.env.JSONBIN_BIN_ID;
const ACCESS_KEY = process.env.JSONBIN_ACCESS_KEY;

async function fetchFromJSONBin() {
  if (!ACCESS_KEY || !BIN_ID) {
    throw new Error('JSONBIN_BIN_ID or JSONBIN_ACCESS_KEY not configured');
  }
  const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
    headers: { 'X-Access-Key': ACCESS_KEY }
  });
  if (!res.ok) throw new Error(`Failed to fetch from JSONBin: ${res.status}`);
  const data = await res.json();
  const records = data.record || [];
  return records.filter(r => !r._init);
}

async function getSurveyMap(client) {
  const result = await client.query('SELECT id, version FROM surveys');
  const map = {};
  for (const row of result.rows) {
    map[row.version] = row.id;
  }
  return map;
}

async function getQuestionMap(client, surveyId) {
  const result = await client.query(
    'SELECT id, question_key, type FROM questions WHERE survey_id = $1',
    [surveyId]
  );
  const map = {};
  for (const row of result.rows) {
    map[row.question_key] = { id: row.id, type: row.type };
  }
  return map;
}

async function getOptionsMap(client, surveyId) {
  const result = await client.query(
    `SELECT q.question_key, qo.id, qo.label
     FROM question_options qo
     JOIN questions q ON qo.question_id = q.id
     WHERE q.survey_id = $1`,
    [surveyId]
  );
  const map = {};
  for (const row of result.rows) {
    if (!map[row.question_key]) map[row.question_key] = {};
    map[row.question_key][row.label] = row.id;
  }
  return map;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const token = req.headers['x-admin-token'];
  if (!verifyToken(token)) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  if (!BIN_ID || !ACCESS_KEY) {
    res.status(400).json({
      success: false,
      message: 'JSONBIN_BIN_ID or JSONBIN_ACCESS_KEY environment variables not configured'
    });
    return;
  }

  try {
    const records = await fetchFromJSONBin();

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const surveyMap = await getSurveyMap(client);

      let migratedCount = 0;
      let skippedCount = 0;

      for (const record of records) {
        const version = record.version || 'v0.1';
        const surveyId = surveyMap[version];

        if (!surveyId) {
          skippedCount++;
          continue;
        }

        const questionMap = await getQuestionMap(client, surveyId);
        const optionsMap = await getOptionsMap(client, surveyId);

        const respondentResult = await client.query(
          `INSERT INTO respondents (survey_id, submitter_id, user_name, is_test, created_at)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            surveyId,
            record.submitter || null,
            record.userName || null,
            !!record.isTest,
            record.timestamp ? new Date(record.timestamp) : new Date()
          ]
        );
        const respondentId = respondentResult.rows[0].id;

        const answers = record.answers || {};
        for (const qKey of Object.keys(answers)) {
          const answer = answers[qKey];
          const qInfo = questionMap[qKey];

          if (!qInfo) continue;
          if (answer === undefined || answer === null || answer === '') continue;
          if (Array.isArray(answer) && answer.length === 0) continue;

          const isMulti = qInfo.type === 'checkbox' || qInfo.type === 'checkbox_limit';

          let textValue = null;
          if (!isMulti) {
            textValue = typeof answer === 'string' ? answer : JSON.stringify(answer);
          }

          const responseResult = await client.query(
            `INSERT INTO responses (respondent_id, question_id, text_value)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [respondentId, qInfo.id, textValue]
          );
          const responseId = responseResult.rows[0].id;

          if (isMulti && Array.isArray(answer)) {
            const qOptions = optionsMap[qKey] || {};
            for (const optLabel of answer) {
              const optionId = qOptions[optLabel];
              if (optionId) {
                await client.query(
                  'INSERT INTO response_selected_options (response_id, question_option_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                  [responseId, optionId]
                );
              }
            }
          }
        }

        migratedCount++;
      }

      await client.query('COMMIT');

      res.status(200).json({
        success: true,
        message: 'Migration complete',
        totalRecords: records.length,
        migrated: migratedCount,
        skipped: skippedCount
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Migrate API error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}
