const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'gz2024survey';
const JWT_SECRET = process.env.JWT_SECRET || 'gz-ebike-survey-secret-key-2026';

function generateToken() {
  const timestamp = Date.now();
  const hash = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${ADMIN_PASSWORD}:${timestamp}`)
    .digest('hex');
  return `${hash}.${timestamp}`;
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const { password } = req.body || {};

  if (password === ADMIN_PASSWORD) {
    const token = generateToken();
    res.status(200).json({ success: true, token });
  } else {
    res.status(401).json({ success: false, message: '密码错误' });
  }
}
