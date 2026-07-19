const { getSurveyByVersion, getLatestSurvey, getQuestionsWithOptions } = require('./_db');
const { getCachedQuestions, setCachedQuestions } = require('./_question-cache');
const { setCors } = require('./_utils');

function formatQuestionForFrontend(q) {
  const options = q.options || [];
  const optionLabels = options.map(o => o.label);
  const exclusiveIndexes = options
    .map((o, i) => o.is_exclusive ? i : -1)
    .filter(i => i >= 0);

  const result = {
    id: q.question_key,
    part: q.part_name,
    type: q.type,
    title: q.title,
    required: q.required
  };

  if (q.subtitle) result.subtitle = q.subtitle;
  if (q.hint) result.hint = q.hint;
  if (q.placeholder) result.placeholder = q.placeholder;
  if (q.max_select) result.maxSelect = q.max_select;

  if (q.type === 'radio' || q.type === 'checkbox' || q.type === 'checkbox_limit') {
    result.options = optionLabels;
  } else if (q.type === 'likert') {
    result.labels = optionLabels;
  }

  if (exclusiveIndexes.length > 0) {
    result.mutuallyExclusive = exclusiveIndexes;
  }

  return result;
}

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

  try {
    const version = req.query.version || null;

    // Try memory cache first
    let survey;
    if (version) {
      const cached = getCachedQuestions(version);
      if (cached) {
        res.status(200).json(cached);
        return;
      }
      survey = await getSurveyByVersion(version);
    } else {
      // No version specified — try cache for any version (latest)
      survey = await getLatestSurvey();
      if (survey) {
        const cached = getCachedQuestions(survey.version);
        if (cached) {
          res.status(200).json(cached);
          return;
        }
      }
    }

    if (!survey) {
      res.status(404).json({ success: false, message: 'Survey not found' });
      return;
    }

    // Cache miss — query database and cache result
    const questions = await getQuestionsWithOptions(survey.id);
    const formattedQuestions = questions.map(formatQuestionForFrontend);
    const payload = { version: survey.version, questions: formattedQuestions };
    setCachedQuestions(survey.version, payload);

    res.status(200).json(payload);
  } catch (err) {
    console.error('Questions API error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
