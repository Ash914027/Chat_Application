require('dotenv').config();
const mysql = require('mysql');

async function setup() {
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  };

  console.log('Using DB host:', cfg.host);
  console.log('Using DB user:', cfg.user);
  console.log('Using DB password: ' + (cfg.password ? '********' : '(empty)'));

  const connection = await mysql.createConnection(cfg);

  const dbName = process.env.DB_NAME || 'chat_app';
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
  await connection.query(`USE \`${dbName}\`;`);

  // messages table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(191) NOT NULL,
      user_name VARCHAR(191) NOT NULL,
      is_anon TINYINT(1) DEFAULT 0,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // group_members table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS group_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id VARCHAR(191) NOT NULL,
      user_name VARCHAR(191) NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_group_user (group_id, user_name)
    ) ENGINE=InnoDB;
  `);

  console.log('Database and tables created (or already exist).');
  await connection.end();
}

setup().catch(err => {
  console.error('\nError setting up database. Possible causes:');
  console.error(' - MySQL server not running or refusing connections');
  console.error(' - Incorrect credentials in .env');
  console.error(' - MySQL configured on a non-default port or host');
  console.error('\nDetailed error:');
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
