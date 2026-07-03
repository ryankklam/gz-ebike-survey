const { query, getClient } = require('../../_db');
const { verifyToken, setCors } = require('../../_utils');

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

  const { id } = req.query;
  const questionId = parseInt(id, 10);
  if (isNaN(questionId)) {
    res.status(400).json({ success: false, message: 'Invalid question id' });
    return;
  }

  if (req.method === 'GET') {
    return handleGet(req, res, questionId);
  } else if (req.method === 'PUT') {
    return handlePut(req, res, questionId);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, questionId);
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}

async function handleGet(req, res, questionId) {
  try {
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
      WHERE q.id = $1
      GROUP BY q.id, p.id`,
      [questionId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }

    res.status(200).json({ success: true, question: result.rows[0] });
  } catch (err) {
    console.error('Admin question GET error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function handlePut(req, res, questionId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM questions WHERE id = $1',
      [questionId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }

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
      sort_order,
      options
    } = req.body || {};

    const current = existing.rows[0];
    const newQuestionKey = question_key !== undefined ? question_key : current.question_key;
    const newType = type !== undefined ? type : current.type;
    const newTitle = title !== undefined ? title : current.title;
    const newSubtitle = subtitle !== undefined ? subtitle : current.subtitle;
    const newHint = hint !== undefined ? hint : current.hint;
    const newPlaceholder = placeholder !== undefined ? placeholder : current.placeholder;
    const newRequired = required !== undefined ? required : current.required;
    const newMaxSelect = max_select !== undefined ? max_select : current.max_select;
    const newPartId = part_id !== undefined ? part_id : current.part_id;
    const newSortOrder = sort_order !== undefined ? sort_order : current.sort_order;

    await client.query(
      `UPDATE questions SET
        question_key = $1, type = $2, title = $3, subtitle = $4, hint = $5,
        placeholder = $6, required = $7, max_select = $8, part_id = $9,
        sort_order = $10, updated_at = NOW()
       WHERE id = $11`,
      [
        newQuestionKey, newType, newTitle, newSubtitle, newHint,
        newPlaceholder, newRequired, newMaxSelect, newPartId,
        newSortOrder, questionId
      ]
    );

    if (options !== undefined) {
      await client.query('DELETE FROM question_options WHERE question_id = $1', [questionId]);
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        await client.query(
          'INSERT INTO question_options (question_id, label, sort_order, is_exclusive) VALUES ($1, $2, $3, $4)',
          [questionId, opt.label, opt.sort_order !== undefined ? opt.sort_order : i, opt.is_exclusive || false]
        );
      }
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin question PUT error:', err.message);
    if (err.code === '23505') {
      res.status(400).json({ success: false, message: 'Question key already exists' });
    } else {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  } finally {
    client.release();
  }
}

async function handleDelete(req, res, questionId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT sort_order, part_id FROM questions WHERE id = $1',
      [questionId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }

    const { sort_order: deletedOrder, part_id: partId } = existing.rows[0];

    await client.query('DELETE FROM questions WHERE id = $1', [questionId]);

    await client.query(
      'UPDATE questions SET sort_order = sort_order - 1 WHERE part_id = $1 AND sort_order > $2',
      [partId, deletedOrder]
    );

    await client.query('COMMIT');
    res.status(200).json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin question DELETE error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
}
