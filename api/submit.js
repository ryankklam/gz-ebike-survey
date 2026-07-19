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
  if (record.count >= RATE_LIMIT_MAX) return true;
  record.count++;
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap) {
    if (now - record.startTime > RATE_LIMIT_WINDOW * 2) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

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

    // Step 1: Get survey (single query)
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

    // Step 2: Insert respondent (single query)
    const respondentResult = await client.query(
      `INSERT INTO respondents (survey_id, submitter_id, user_name, is_test, ip_address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [survey.id, submitter || null, userName || null, !!isTest, ip]
    );
    const respondentId = respondentResult.rows[0].id;

    // Step 3: Batch-load all questions for this survey (1 query instead of N)
    const questionKeys = Object.keys(answers).filter(k => {
      const v = answers[k];
      return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
    });

    const questionsResult = await client.query(
      `SELECT id, question_key, type FROM questions WHERE survey_id = $1 AND question_key = ANY($2)`,
      [survey.id, questionKeys]
    );

    // Build lookup: question_key -> {id, type}
    const qMap = {};
    for (const row of questionsResult.rows) {
      qMap[row.question_key] = row;
    }

    // Step 4: Load all options map (single query)
    const optionsResult = await client.query(
      `SELECT q.question_key, qo.id, qo.label
       FROM question_options qo
       JOIN questions q ON qo.question_id = q.id
       WHERE q.survey_id = $1`,
      [survey.id]
    );
    const optionsMap = {};
    for (const row of optionsResult.rows) {
      if (!optionsMap[row.question_key]) optionsMap[row.question_key] = {};
      optionsMap[row.question_key][row.label] = row.id;
    }

    // Step 5: Batch insert all responses using a single multi-row VALUES
    const responseData = [];
    for (const qKey of questionKeys) {
      const question = qMap[qKey];
      if (!question) continue;

      const answer = answers[qKey];
      const isMulti = question.type === 'checkbox' || question.type === 'checkbox_limit';

      let textValue = null;
      if (!isMulti) {
        textValue = typeof answer === 'string' ? answer : JSON.stringify(answer);
      } else if (question.type === 'text') {
        textValue = answer;
      }

      responseData.push([respondentId, question.id, textValue]);
    }

    // Batch insert responses
    if (responseData.length > 0) {
      const valueClauses = responseData.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
      const params = responseData.flat();
      const responsesResult = await client.query(
        `INSERT INTO responses (respondent_id, question_id, text_value)
         VALUES ${valueClauses}
         RETURNING id, question_id`,
        params
      );

      // Step 6: Batch insert selected options for checkbox questions
      const selectedOptionRows = [];
      for (let i = 0; i < responsesResult.rows.length; i++) {
        const respRow = responsesResult.rows[i];
        const question = questionsResult.rows.find(q => q.id === respRow.question_id);
        if (!question) continue;

        const qKey = question.question_key;
        const isMulti = question.type === 'checkbox' || question.type === 'checkbox_limit';
        if (!isMulti) continue;

        const answer = answers[qKey];
        if (!Array.isArray(answer)) continue;

        const qOptions = optionsMap[qKey] || {};
        for (const optLabel of answer) {
          const optionId = qOptions[optLabel];
          if (optionId) {
            selectedOptionRows.push([respRow.id, optionId]);
          }
        }
      }

      // Batch insert selected options (single query)
      if (selectedOptionRows.length > 0) {
        const optClauses = selectedOptionRows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
        const optParams = selectedOptionRows.flat();
        await client.query(
          `INSERT INTO response_selected_options (response_id, question_option_id) VALUES ${optClauses} ON CONFLICT DO NOTHING`,
          optParams
        );
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
