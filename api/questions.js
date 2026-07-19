const fs = require('fs');
const path = require('path');
const { setCors } = require('./_utils');

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
    const raw = fs.readFileSync(path.join(process.cwd(), 'questions.json'), 'utf8');
    const data = JSON.parse(raw);
    res.status(200).json({ version: data.version, questions: data.questions });
  } catch (err) {
    console.error('Questions API error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
