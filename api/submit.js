const { getClient, getSurveyByVersion, getLatestSurvey } = require('./_db');
const { verifyToken, setCors } = require('./_utils');

const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return false;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return true;
  }

  record.count++;
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap) {
    if (now - record.startTime > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

async function getOptionsMap(client, surveyId) {
  const result = await client.query(
    `SELECT q.question_key, qo.id, qo.label
     FROM question_options qo
     JOIN questions q ON qo.question_id = q.id
     WHERE q.survey_id = $1
     ORDER BY qo.sort_order`,
    [surveyId]
  );

  const map = {};
  for (const row of result.rows) {
    if (!map[row.question_key]) {
      map[row.question_key] = {};
    }
    map[row.question_key][row.label] = row.id;
  }
  return map;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ success: false, message: '提交过于频繁，请稍后再试' });
    return;
  }

  const client = await getClient();

  try {
    const { answers, version, submitter, userName, isTest } = req.body || {};
    if (!answers || typeof answers !== 'object') {
      res.status(400).json({ success: false, message: 'Invalid answers data' });
      return;
    }

<<<<<<< HEAD
    let survey;
    if (version) {
      survey = await getSurveyByVersion(version);
    }
    if (!survey) {
      survey = await getLatestSurvey();
    }
    if (!survey) {
      res.status(400).json({ success: false, message: 'No survey found' });
      return;
    }

    await client.query('BEGIN');

    const respondentResult = await client.query(
      `INSERT INTO respondents (survey_id, submitter_id, user_name, is_test, ip_address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [survey.id, submitter || null, userName || null, !!isTest, ip]
    );
    const respondentId = respondentResult.rows[0].id;

    const optionsMap = await getOptionsMap(client, survey.id);

    const answerKeys = Object.keys(answers);
    for (const qKey of answerKeys) {
      const answer = answers[qKey];
      if (answer === undefined || answer === null || answer === '') continue;
      if (Array.isArray(answer) && answer.length === 0) continue;

      const questionResult = await client.query(
        'SELECT id, type FROM questions WHERE survey_id = $1 AND question_key = $2',
        [survey.id, qKey]
      );
      if (questionResult.rows.length === 0) continue;

      const question = questionResult.rows[0];
      const isMulti = question.type === 'checkbox' || question.type === 'checkbox_limit';

      let textValue = null;
      if (!isMulti) {
        textValue = typeof answer === 'string' ? answer : JSON.stringify(answer);
      } else if (question.type === 'text') {
        textValue = answer;
      }

      const responseResult = await client.query(
        `INSERT INTO responses (respondent_id, question_id, text_value)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [respondentId, question.id, textValue]
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

    await client.query('COMMIT');
    res.status(200).json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Submit error:', err.code, err.message, err.stack);
    res.status(500).json({ success: false, message: 'Server error', detail: err.message });
  } finally {
    client.release();
  }
}
