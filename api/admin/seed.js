const fs = require('fs');
const path = require('path');
const { getClient, getSurveyByVersion } = require('../_db');
const { verifyToken, setCors } = require('../_utils');

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

  try {
    const questionsPath = path.join(process.cwd(), 'questions.json');
    const rawData = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
    const version = rawData.version;
    const questions = rawData.questions;

    const existing = await getSurveyByVersion(version);
    if (existing) {
      res.status(200).json({
        success: true,
        skipped: true,
        message: `Survey version ${version} already exists`,
        version
      });
      return;
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

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

      await client.query('COMMIT');

      res.status(200).json({
        success: true,
        message: 'Seed completed successfully',
        version,
        surveyId,
        partCount: partsMap.size,
        questionCount: questions.length
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Seed API error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}
