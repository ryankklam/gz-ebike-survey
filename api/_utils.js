const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

if (!ADMIN_PASSWORD || !JWT_SECRET) {
  console.error('Missing required environment variables: ADMIN_PASSWORD, JWT_SECRET');
}

function verifyToken(token) {
  if (!token || !JWT_SECRET || !ADMIN_PASSWORD) return false;
  const [hash, ts] = token.split('.');
  if (!hash || !ts) return false;
  const expected = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${ADMIN_PASSWORD}:${ts}`)
    .digest('hex');
  if (hash !== expected) return false;
  if (Date.now() - parseInt(ts) > 3600000) return false;
  return true;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
}

module.exports = { verifyToken, setCors };
