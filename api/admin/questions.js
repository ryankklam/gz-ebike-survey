const { query, getClient, getSurveyByVersion, getLatestSurvey } = require('../_db');
const { verifyToken, setCors } = require('../_utils');
const { invalidateQuestionsCache } = require('../_question-cache');

module.exports = async function handler(req, res) {
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

  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}

async function handleGet(req, res) {
  try {
    const version = req.query.version || null;

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
      [survey.id]
    );

    res.status(200).json({
      success: true,
      survey: { id: survey.id, version: survey.version, title: survey.title },
      questions: result.rows
    });
  } catch (err) {
    console.error('Admin questions GET error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function handlePost(req, res) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      question_key,
      type,
      title,
      subtitle,
      hint,
      placeholder,
      required,
      max_select,
      part_id,
      options = []
    } = req.body || {};

    if (!question_key || !type || !title || !part_id) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, message: 'Missing required fields' });
      return;
    }

    const partResult = await client.query(
      'SELECT survey_id FROM parts WHERE id = $1',
      [part_id]
    );
    if (partResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, message: 'Part not found' });
      return;
    }
    const surveyId = partResult.rows[0].survey_id;

    const maxOrderResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM questions WHERE part_id = $1',
      [part_id]
    );
    const sortOrder = maxOrderResult.rows[0].max_order + 1;

    const questionResult = await client.query(
      `INSERT INTO questions
        (survey_id, part_id, question_key, type, title, subtitle, hint, placeholder, required, max_select, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        surveyId,
        part_id,
        question_key,
        type,
        title,
        subtitle || null,
        hint || null,
        placeholder || null,
        required !== false,
        max_select || null,
        sortOrder
      ]
    );
    const questionId = questionResult.rows[0].id;

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      await client.query(
        'INSERT INTO question_options (question_id, label, sort_order, is_exclusive) VALUES ($1, $2, $3, $4)',
        [questionId, opt.label, i, opt.is_exclusive || false]
      );
    }

    await client.query('COMMIT');
    invalidateQuestionsCache();
    res.status(201).json({ success: true, id: questionId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin questions POST error:', err.message);
    if (err.code === '23505') {
      res.status(400).json({ success: false, message: 'Question key already exists' });
    } else {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  } finally {
    client.release();
  }
}
