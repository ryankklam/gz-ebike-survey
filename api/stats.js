const { verifyToken, fetchCloudData, setCors } = require('./_utils');

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
    const data = await fetchCloudData();
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}
