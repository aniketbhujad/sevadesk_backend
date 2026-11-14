import app from './app.js';
import { config } from './config/env.js';
import { testConnection, query } from './db/connection.js';
import { initAdmin } from './scripts/initAdmin.js';

const PORT = config.port;

const server = app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 SevaDesk Server running on port ${PORT}`);
  console.log(`   Environment : ${config.env}`);
  console.log(`   Database    : ${config.db.isPostgres ? 'Neon PostgreSQL' : 'MySQL 8.x'}`);
  console.log(`   SMS Gateway : ${config.sms.enabled ? 'Live (AWS SMS Active)' : 'Mock Mode (Safe Dev, Zero AWS Cost)'}`);
  console.log(`=======================================================`);

  // Diagnostic check of DB
  try {
    const health = await testConnection();
    if (health.ok) {
      console.log(`✅ Connected to database (${health.engine}).`);

      // Check if admin user exists, if not initialize admin/test1234
      try {
        const users = await query('SELECT id FROM users LIMIT 1');
        if (!users || users.length === 0) {
          console.log('📌 No users found in database. Initializing default admin (admin / test1234)...');
          await initAdmin('admin', 'test1234');
        }
      } catch (checkErr) {
        console.warn('ℹ️ Users table not ready yet. Run `npm run migrate` and `npm run seed` to setup.');
      }
    } else {
      console.warn(`⚠️ Warning: Database not connected yet (${health.error}).`);
      console.warn(`   Target Engine: ${health.engine}`);
      console.warn(`   Please set DATABASE_URL in server/.env and run \`npm run migrate\`.`);
    }
  } catch (err) {
    console.warn(`⚠️ Database check failed: ${err.message}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server process terminated.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server process terminated.');
    process.exit(0);
  });
});
