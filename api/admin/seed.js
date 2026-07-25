const fs = require('fs');
const path = require('path');
const { getClient, getSurveyByVersion } = require('../_db');
const { verifyToken, setCors } = require('../_utils');
const { invalidateQuestionsCache } = require('../_question-cache');

async function deleteSurveyByVersion(client, version) {
  const survey = await getSurveyByVersion(version);
  if (!survey) return null;

  await client.query('BEGIN');
  try {
    // 按外键依赖顺序删除：先子表，后父表
    await client.query(
      `DELETE FROM response_selected_options
       WHERE response_id IN (
         SELECT id FROM responses WHERE respondent_id IN (
           SELECT id FROM respondents WHERE survey_id = $1
         )
       )`,
      [survey.id]
    );
    await client.query(
      `DELETE FROM responses WHERE respondent_id IN (
         SELECT id FROM respondents WHERE survey_id = $1
       )`,
      [survey.id]
    );
    await client.query(
      'DELETE FROM respondents WHERE survey_id = $1',
      [survey.id]
    );
    await client.query(
      `DELETE FROM question_options WHERE question_id IN (
         SELECT id FROM questions WHERE survey_id = $1
       )`,
      [survey.id]
    );
    await client.query(
      'DELETE FROM questions WHERE survey_id = $1',
      [survey.id]
    );
    await client.query(
      'DELETE FROM parts WHERE survey_id = $1',
      [survey.id]
    );
    await client.query(
      'DELETE FROM surveys WHERE id = $1',
      [survey.id]
    );
    await client.query('COMMIT');
    return survey.id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function doSeed(client) {
  const questionsPath = path.join(process.cwd(), 'questions.json');
  const rawData = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  const version = rawData.version;
  const questions = rawData.questions;

  const surveyResult = await client.query(
    'INSERT INTO surveys (version, title) VALUES ($1, $2) RETURNING id',
    [version, '广州市电动自行车管理现状调研']
  );
  const surveyId = surveyResult.rows[0].id;

  const partsMap = new Map();
  let partOrder = 0;
  for (const q of questions) {
    if (!partsMap.has(q.part)) {
      const partResult = await client.query(
        'INSERT INTO parts (survey_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id',
        [surveyId, q.part, partOrder]
      );
      partsMap.set(q.part, partResult.rows[0].id);
      partOrder++;
    }
  }

  let questionOrder = 0;
  for (const q of questions) {
    const partId = partsMap.get(q.part);
    const questionResult = await client.query(
      `INSERT INTO questions
        (survey_id, part_id, question_key, type, title, subtitle, hint, placeholder, required, max_select, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        surveyId,
        partId,
        q.id,
        q.type,
        q.title,
        q.subtitle || null,
        q.hint || null,
        q.placeholder || null,
        q.required !== false,
        q.maxSelect || null,
        questionOrder
      ]
    );
    const questionId = questionResult.rows[0].id;
    questionOrder++;

    const optionList = q.options || q.labels || [];
    const exclusiveIndexes = q.mutuallyExclusive || [];
    for (let i = 0; i < optionList.length; i++) {
      await client.query(
        'INSERT INTO question_options (question_id, label, sort_order, is_exclusive) VALUES ($1, $2, $3, $4)',
        [questionId, optionList[i], i, exclusiveIndexes.includes(i)]
      );
    }
  }

  return { version, surveyId, partCount: partsMap.size, questionCount: questions.length };
}

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

  // DELETE: 删除指定版本
  if (req.method === 'DELETE') {
    const version = req.query.version || req.body?.version;
    if (!version) {
      res.status(400).json({ success: false, message: 'Missing version parameter' });
      return;
    }
    const client = await getClient();
    try {
      const deletedId = await deleteSurveyByVersion(client, version);
      if (!deletedId) {
        res.status(404).json({ success: false, message: `Survey version ${version} not found` });
        return;
      }
      res.status(200).json({ success: true, message: `Survey version ${version} deleted`, surveyId: deletedId });
      invalidateQuestionsCache(version);
    } catch (err) {
      console.error('Seed DELETE error:', err.message);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      client.release();
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  // POST: 导入（支持 force 强制重新导入）
  try {
    const questionsPath = path.join(process.cwd(), 'questions.json');
    const rawData = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
    const version = rawData.version;
    const force = req.body?.force === true || req.query.force === 'true';

    const client = await getClient();
    try {
      const existing = await getSurveyByVersion(version);

      if (existing && !force) {
        res.status(200).json({
          success: true,
          skipped: true,
          message: `Survey version ${version} already exists`,
          version
        });
        return;
      }

      if (existing && force) {
        await deleteSurveyByVersion(client, version);
      }

      const result = await doSeed(client);
      // Invalidate memory cache so next /api/questions reads fresh data
      invalidateQuestionsCache(version);
      res.status(200).json({
        success: true,
        message: force ? `Survey version ${version} re-imported (old data deleted)` : 'Seed completed successfully',
        replaced: !!force,
        ...result
      });
    } catch (err) {
      console.error('Seed POST error:', err.message);
      res.status(500).json({ success: false, message: err.message || 'Server error' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Seed API error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}
