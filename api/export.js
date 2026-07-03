const { query, getSurveyByVersion, getLatestSurvey } = require('./_db');
const { verifyToken, setCors } = require('./_utils');

export default async function handler(req, res) {
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
  if (!verifyToken(token)) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  try {
    const version = req.query.version || null;
    const format = req.query.format || 'json';
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

    if (format === 'csv') {
      const questionsResult = await query(
        `SELECT question_key, title, type FROM questions WHERE survey_id = $1 ORDER BY sort_order`,
        [survey.id]
      );
      const questions = questionsResult.rows;

      const headers = ['提交时间', '版本', '提交者', '用户名', '测试数据', ...questions.map(q => q.title)];

      const csvRows = [headers];
      for (const row of data) {
        const values = [
          row.timestamp,
          row.version,
          row.submitter,
          row.userName,
          row.isTest ? '是' : '否',
          ...questions.map(q => {
            const val = row.answers[q.question_key];
            if (Array.isArray(val)) return val.join('; ');
            return val || '';
          })
        ];
        csvRows.push(values.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      }

      const csvStr = '\uFEFF' + csvRows.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="survey_data_${survey.version}.csv"`);
      res.status(200).send(csvStr);
    } else {
      const jsonStr = JSON.stringify(data, null, 2);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="survey_data_${survey.version}.json"`);
      res.status(200).send(jsonStr);
    }
  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}
