const { saveToCloud, setCors } = require('./_utils');

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  try {
    const { answers } = req.body || {};
    if (!answers || typeof answers !== 'object') {
      res.status(400).json({ success: false, message: 'Invalid answers data' });
      return;
    }

    const record = {
      timestamp: new Date().toISOString(),
      answers
    };

    await saveToCloud(record);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Submit error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}
