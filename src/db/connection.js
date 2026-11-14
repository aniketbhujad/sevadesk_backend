import pg from 'pg';
import mysql from 'mysql2/promise';
import { config } from '../config/env.js';

let pgPool = null;
let mysqlPool = null;

// Determine if PostgreSQL (Neon) is active
export function isUsingPostgres() {
  return config.db.isPostgres || (config.db.url && (config.db.url.startsWith('postgres://') || config.db.url.startsWith('postgresql://')));
}

export function getPgPool() {
  if (!pgPool) {
    const poolConfig = config.db.url
      ? {
          connectionString: config.db.url,
          ssl: config.db.ssl,
          max: config.db.connectionLimit,
          idleTimeoutMillis: 30000,
        }
      : {
          host: config.db.host,
          port: config.db.port,
          user: config.db.user,
          password: config.db.password,
          database: config.db.name,
          ssl: config.db.ssl,
          max: config.db.connectionLimit,
        };

    pgPool = new pg.Pool(poolConfig);
  }
  return pgPool;
}

export function getMysqlPool() {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      waitForConnections: true,
      connectionLimit: config.db.connectionLimit,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      decimalNumbers: true,
      timezone: '+05:30',
    });
  }
  return mysqlPool;
}

/**
 * Adapt MySQL query syntax to PostgreSQL:
 * 1. Convert '?' placeholders to '$1, $2, ...'
 * 2. Convert CURDATE() to CURRENT_DATE
 * 3. Convert ON DUPLICATE KEY UPDATE to ON CONFLICT
 * 4. Append 'RETURNING id' to INSERT if not present
 */
function adaptSqlForPostgres(sql) {
  let paramIndex = 1;
  let adapted = sql.replace(/\?/g, () => `$${paramIndex++}`);

  // Replace MySQL specific date functions with standard SQL
  adapted = adapted.replace(/\bCURDATE\(\)/gi, 'CURRENT_DATE');

  // Handle ON DUPLICATE KEY UPDATE for settings
  if (adapted.includes('ON DUPLICATE KEY UPDATE')) {
    if (adapted.includes('settings')) {
      adapted = adapted.replace(
        /ON DUPLICATE KEY UPDATE.*$/i,
        'ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()'
      );
    } else if (adapted.includes('services')) {
      adapted = adapted.replace(
        /ON DUPLICATE KEY UPDATE.*$/i,
        'ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category, default_charge = EXCLUDED.default_charge, is_pinned = EXCLUDED.is_pinned'
      );
    }
  }

  // If INSERT statement and does not have RETURNING, append RETURNING id
  const trimmed = adapted.trim();
  if (/^INSERT\s+INTO/i.test(trimmed) && !/RETURNING\s+/i.test(trimmed)) {
    adapted = `${trimmed} RETURNING id`;
  }

  return adapted;
}

/**
 * Normalizes PostgreSQL query results so they match MySQL2 array shape
 */
function formatPgResult(pgRes, isInsert) {
  const rows = pgRes.rows || [];
  let insertId = null;

  if (rows.length > 0 && rows[0].id !== undefined) {
    insertId = Number(rows[0].id);
  }

  // Create an array that acts like MySQL row list and has insertId property
  const resultObj = [...rows];
  resultObj.insertId = insertId;
  resultObj.rowCount = pgRes.rowCount;

  // If this was an INSERT and rows had [{ id }], make sure resultObj[0] has insertId
  if (isInsert && rows.length > 0) {
    resultObj[0] = { ...rows[0], insertId };
  }

  return resultObj;
}

/**
 * Execute a parameterized query
 */
export async function query(sql, params = []) {
  if (isUsingPostgres()) {
    const pool = getPgPool();
    const isInsert = /^INSERT\s+INTO/i.test(sql.trim());
    const pgSql = adaptSqlForPostgres(sql);
    const pgRes = await pool.query(pgSql, params);
    return formatPgResult(pgRes, isInsert);
  } else {
    const pool = getMysqlPool();
    const [results] = await pool.query(sql, params);
    return results;
  }
}

/**
 * Helper to run a callback inside a managed transaction
 */
export async function withTransaction(callback) {
  if (isUsingPostgres()) {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const wrappedClient = {
        query: async (sql, params = []) => {
          const isInsert = /^INSERT\s+INTO/i.test(sql.trim());
          const pgSql = adaptSqlForPostgres(sql);
          const pgRes = await client.query(pgSql, params);
          return [formatPgResult(pgRes, isInsert)];
        },
      };

      const result = await callback(wrappedClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('PostgreSQL Rollback error:', rbErr.message);
      }
      throw err;
    } finally {
      client.release();
    }
  } else {
    const pool = getMysqlPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await callback(conn);
      await conn.commit();
      return result;
    } catch (err) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.error('MySQL Rollback error:', rbErr.message);
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}

/**
 * Health check test connection
 */
export async function testConnection() {
  try {
    if (isUsingPostgres()) {
      const pool = getPgPool();
      const res = await pool.query('SELECT 1 as health_check');
      return { ok: true, engine: 'PostgreSQL (Neon)', rows: res.rows };
    } else {
      const pool = getMysqlPool();
      const [rows] = await pool.query('SELECT 1 as health_check');
      return { ok: true, engine: 'MySQL', rows };
    }
  } catch (err) {
    return { ok: false, error: err.message, engine: isUsingPostgres() ? 'PostgreSQL (Neon)' : 'MySQL' };
  }
}
