const crypto = require('crypto');

const BIN_ID = process.env.JSONBIN_BIN_ID;
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
const ACCESS_KEY = process.env.JSONBIN_ACCESS_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

// Startup check: ensure all required env vars are set
if (!BIN_ID || !MASTER_KEY || !ACCESS_KEY || !ADMIN_PASSWORD || !JWT_SECRET) {
  console.error('Missing required environment variables. Please check Vercel config.');
  console.error('Required: JSONBIN_BIN_ID, JSONBIN_MASTER_KEY, JSONBIN_ACCESS_KEY, ADMIN_PASSWORD, JWT_SECRET');
}

function verifyToken(token) {
  if (!token || !JWT_SECRET || !ADMIN_PASSWORD) return false;
  const [hash, ts] = token.split('.');
  if (!hash || !ts) return false;
  const expected = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${ADMIN_PASSWORD}:${ts}`)
    .digest('hex');
  if (hash !== expected) return false;
  // Token expires in 1 hour
  if (Date.now() - parseInt(ts) > 3600000) return false;
  return true;
}

async function fetchCloudData() {
  if (!ACCESS_KEY || !BIN_ID) throw new Error('JSONBin not configured');
  const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
    headers: { 'X-Access-Key': ACCESS_KEY }
  });
  if (!res.ok) throw new Error('Failed to fetch from JSONBin');
  const data = await res.json();
  const records = data.record || [];
  return records.filter(r => !r._init);
}

async function saveToCloud(newRecord) {
  if (!MASTER_KEY || !BIN_ID) throw new Error('JSONBin not configured');
  const records = await fetchCloudData();
  // Ensure array is not empty (JSONBin rejects empty array)
  if (records.length === 0) {
    records.push({ _init: true, _note: 'placeholder' });
  }
  records.push(newRecord);
  const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': MASTER_KEY
    },
    body: JSON.stringify(records)
  });
  if (!res.ok) throw new Error('Failed to save to JSONBin');
  return true;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
}

module.exports = { verifyToken, fetchCloudData, saveToCloud, setCors };
