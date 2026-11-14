import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import mysql from 'mysql2/promise';
import { config } from '../config/env.js';
import { isUsingPostgres } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runSeeds() {
  console.log('🌱 Seeding services and initial settings...');

  if (isUsingPostgres()) {
    console.log('🐘 Seeding into PostgreSQL / Neon...');
    const client = new pg.Client({
      connectionString: config.db.url,
      ssl: config.db.ssl,
    });

    try {
      await client.connect();
      const seedSql = fs.readFileSync(path.join(__dirname, 'seed.postgres.sql'), 'utf-8');
      await client.query(seedSql);
      console.log('✅ Services catalogue and default settings seeded into Neon successfully.');
    } catch (err) {
      console.error('❌ Neon seeding failed:', err.message);
      throw err;
    } finally {
      await client.end();
    }
  } else {
    console.log('🐬 Seeding into MySQL 8.x...');
    const dbConn = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      multipleStatements: true,
    });

    try {
      const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
      await dbConn.query(seedSql);
      console.log('✅ Services and default settings seeded into MySQL successfully.');
    } catch (err) {
      console.error('❌ Seeding failed:', err.message);
      throw err;
    } finally {
      await dbConn.end();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeeds()
    .then(() => {
      console.log('🎉 Seeding complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed error:', err.message);
      process.exit(1);
    });
}
