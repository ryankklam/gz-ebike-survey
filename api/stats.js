const { query, getSurveyByVersion, getLatestSurvey } = require('./_db');
const { verifyToken, setCors } = require('./_utils');

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const token = req.headers['x-admin-token'];
  const isPublicReport = req.query.public === '1';

  if (!verifyToken(token) && !isPublicReport) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  try {
    const version = req.query.version || null;
    const includeTest = req.query.includeTest === '1';

    let survey;
    if (version) {
      survey = await getSurveyByVersion(version);
    } else {
      survey = await getLatestSurvey();
    }

    if (!survey) {
      res.status(404).json({ success: false, message: 'Survey not found' });
      return;
    }

    const respondentsResult = await query(
      `SELECT
         r.id,
         r.submitter_id as submitter,
         r.user_name as "userName",
         r.is_test as "isTest",
         r.created_at at time zone 'Asia/Shanghai' as timestamp
       FROM respondents r
       WHERE r.survey_id = $1
         AND ($2 OR r.is_test = false)
       ORDER BY r.created_at ASC`,
      [survey.id, includeTest]
    );

    const respondentIds = respondentsResult.rows.map(r => r.id);

    let answersByRespondent = {};
    if (respondentIds.length > 0) {
      const singleAnswersResult = await query(
        `SELECT
           r.respondent_id,
           q.question_key,
           q.type,
           r.text_value
         FROM responses r
         JOIN questions q ON r.question_id = q.id
         WHERE r.respondent_id = ANY($1::int[])
           AND q.type NOT IN ('checkbox', 'checkbox_limit')`,
        [respondentIds]
      );

      for (const row of singleAnswersResult.rows) {
        if (!answersByRespondent[row.respondent_id]) {
          answersByRespondent[row.respondent_id] = {};
        }
        answersByRespondent[row.respondent_id][row.question_key] = row.text_value;
      }

      const multiAnswersResult = await query(
        `SELECT
           r.respondent_id,
           q.question_key,
           qo.label
         FROM responses r
         JOIN questions q ON r.question_id = q.id
         JOIN response_selected_options rso ON r.id = rso.response_id
         JOIN question_options qo ON rso.question_option_id = qo.id
         WHERE r.respondent_id = ANY($1::int[])
           AND q.type IN ('checkbox', 'checkbox_limit')
         ORDER BY qo.sort_order`,
        [respondentIds]
      );

      for (const row of multiAnswersResult.rows) {
        if (!answersByRespondent[row.respondent_id]) {
          answersByRespondent[row.respondent_id] = {};
        }
        if (!answersByRespondent[row.respondent_id][row.question_key]) {
          answersByRespondent[row.respondent_id][row.question_key] = [];
        }
        answersByRespondent[row.respondent_id][row.question_key].push(row.label);
      }
    }

    const data = respondentsResult.rows.map(r => ({
      timestamp: r.timestamp,
      version: survey.version,
      submitter: r.submitter || '',
      userName: r.username || '',
      isTest: r.isTest,
      answers: answersByRespondent[r.id] || {}
    }));

    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}
