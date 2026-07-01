const crypto = require('crypto');

const BIN_ID = process.env.JSONBIN_BIN_ID || '6a44a4c3f5f4af5e294b53f1';
const MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
const ACCESS_KEY = process.env.JSONBIN_ACCESS_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'gz2024survey';
const JWT_SECRET = process.env.JWT_SECRET || 'gz-ebike-survey-secret-key-2026';

function verifyToken(token) {
  if (!token) return false;
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
  const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
    headers: { 'X-Access-Key': ACCESS_KEY }
  });
  if (!res.ok) throw new Error('Failed to fetch from JSONBin');
  const data = await res.json();
  const records = data.record || [];
  return records.filter(r => !r._init);
}

async function saveToCloud(newRecord) {
  const records = await fetchCloudData();
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
