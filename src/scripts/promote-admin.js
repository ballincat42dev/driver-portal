import { initializeDatabase, get, run } from '../db.js';

async function promoteOnlyUserToAdmin() {
  await initializeDatabase();
  const user = await get('SELECT id, name, email, role FROM users ORDER BY id ASC LIMIT 1');
  if (!user) {
    console.log('No users found. Nothing to do.');
    return;
  }
  await run('UPDATE users SET role = ? WHERE id = ?', ['admin', user.id]);
  console.log(`Promoted user ${user.email} (id=${user.id}) to admin.`);
}

promoteOnlyUserToAdmin().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});


