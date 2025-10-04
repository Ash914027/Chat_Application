# Fun Friday Group Chat

Real-time group chat application with anonymous mode, built with Node.js, Socket.io and MySQL.
<img width="461" height="837" alt="Screenshot 2025-09-29 172212" src="https://github.com/user-attachments/assets/f7f0ace9-015c-4874-8f6f-6ab13df10556" />


Prerequisites
- Node.js v14+
- MySQL Server

Quick start

1. Install dependencies

```bash
npm install
```

2. Configure your database in `.env` (set DB_PASSWORD)

3. Create the database and tables

```bash
npm run setup-db
```

4. Start the server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

Notes
- This project stores messages in MySQL. The `setup-database.js` script will create the `chat_app` database and required tables.
- The UI is a minimal iPhone-style chat implemented in `public/index.html`.

Troubleshooting
- If you see `ECONNREFUSED` when running `setup-db`, ensure MySQL is running and your `.env` credentials are correct.
- If `port 3000` is in use, change `PORT` in `.env`.

