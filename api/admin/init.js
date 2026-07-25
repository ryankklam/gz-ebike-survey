const fs = require('fs');
const path = require('path');
const { getClient } = require('../_db');
const { verifyToken, setCors } = require('../_utils');

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const token = req.headers['x-admin-token'];
  if (!verifyToken(token)) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  try {
    const sqlPath = path.join(process.cwd(), 'db', 'init.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Remove comment-only lines, then split into statements
    const statements = sqlContent
      .split('\n')
      .map(line => line.trim().startsWith('--') ? '' : line)
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const client = await getClient();
    try {
      await client.query('BEGIN');
      let executed = 0;
      for (const stmt of statements) {
        await client.query(stmt);
        executed++;
      }
      await client.query('COMMIT');

      // Check what tables exist now
      const tablesResult = await client.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
      );

      res.status(200).json({
        success: true,
        message: 'Database initialized successfully',
        statementsExecuted: executed,
        tables: tablesResult.rows.map(r => r.tablename)
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Init DB error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
};
