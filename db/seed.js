const fs = require('fs');
const path = require('path');
const { query, getClient } = require('../api/_db');

async function seed() {
  const questionsPath = path.join(__dirname, '..', 'questions.json');
  const rawData = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  const version = rawData.version;
  const questions = rawData.questions;

  console.log(`Seeding survey version: ${version}`);
  console.log(`Total questions: ${questions.length}`);

  const client = await getClient();

  try {
    await client.query('BEGIN');

    const existingSurvey = await client.query(
      'SELECT id FROM surveys WHERE version = $1',
      [version]
    );

    if (existingSurvey.rows.length > 0) {
      console.log(`Survey version ${version} already exists. Skipping.`);
      await client.query('ROLLBACK');
      return;
    }

    const surveyResult = await client.query(
      'INSERT INTO surveys (version, title) VALUES ($1, $2) RETURNING id',
      [version, '广州市电动自行车管理现状调研']
    );
    const surveyId = surveyResult.rows[0].id;
    console.log(`Created survey with id: ${surveyId}`);

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
        console.log(`Created part: ${q.part}`);
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

      console.log(`  Created question: ${q.id} (${q.type}) with ${optionList.length} options`);
    }

    await client.query('COMMIT');
    console.log('Seed completed successfully!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = seed;
