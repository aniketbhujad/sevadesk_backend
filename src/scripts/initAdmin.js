import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { query } from '../db/connection.js';

export async function initAdmin(username = 'admin', password = 'test1234', fullName = 'CSC Administrator') {
  console.log(`🔐 Initializing admin user: ${username}`);

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const existing = await query('SELECT id, username FROM users WHERE username = ?', [username]);

    if (existing.length > 0) {
      await query(
        "UPDATE users SET password_hash = ?, role = 'ADMIN', is_active = TRUE, updated_at = NOW() WHERE username = ?",
        [passwordHash, username]
      );
      console.log(`✅ Admin user '${username}' password updated successfully.`);
    } else {
      await query(
        "INSERT INTO users (username, password_hash, role, full_name, is_active) VALUES (?, ?, 'ADMIN', ?, TRUE)",
        [username, passwordHash, fullName]
      );
      console.log(`✅ Admin user '${username}' created successfully.`);
    }
  } catch (err) {
    console.error('❌ Failed to initialize admin user:', err.message);
    throw err;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const customUser = process.argv[2] || 'admin';
  const customPass = process.argv[3] || 'test1234';

  initAdmin(customUser, customPass)
    .then(() => {
      console.log('🎉 Admin initialization completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error initializing admin:', err.message);
      process.exit(1);
    });
}
