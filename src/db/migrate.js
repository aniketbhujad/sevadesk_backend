import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import mysql from 'mysql2/promise';
import { config } from '../config/env.js';
import { isUsingPostgres } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('🔄 Checking database connection and running migrations...');

  if (isUsingPostgres()) {
    console.log('🐘 Target Database: PostgreSQL / Neon');
    if (!config.db.url) {
      throw new Error('DATABASE_URL is required for PostgreSQL / Neon connection.');
    }

    const client = new pg.Client({
      connectionString: config.db.url,
      ssl: config.db.ssl,
    });

    try {
      await client.connect();
      console.log('✅ Connected to Neon PostgreSQL database.');

      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.postgres.sql'), 'utf-8');
      await client.query(schemaSql);
      console.log('✅ PostgreSQL / Neon schema migrations executed successfully.');
    } catch (err) {
      console.error('❌ Neon migration failed:', err.message);
      throw err;
    } finally {
      await client.end();
    }
  } else {
    console.log('🐬 Target Database: MySQL 8.x');

    let rootConn;
    try {
      rootConn = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        multipleStatements: true,
      });

      await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
      console.log(`✅ Database \`${config.db.name}\` verified.`);
    } catch (err) {
      console.error('❌ Could not connect to MySQL server:', err.message);
      throw err;
    } finally {
      if (rootConn) await rootConn.end();
    }

    const dbConn = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      multipleStatements: true,
    });

    try {
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
      await dbConn.query(schemaSql);
      console.log('✅ MySQL schema migration executed successfully.');
    } catch (err) {
      console.error('❌ Migration failed:', err.message);
      throw err;
    } finally {
      await dbConn.end();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('🎉 Migrations complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration error:', err.message);
      process.exit(1);
    });
}
