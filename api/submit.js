const { saveToCloud, setCors } = require('./_utils');

// Simple in-memory rate limit: max 3 submissions per IP per minute
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return false;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return true;
  }

  record.count++;
  return false;
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap) {
    if (now - record.startTime > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

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

  // Rate limiting by IP
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ success: false, message: '提交过于频繁，请稍后再试' });
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
