# Fun Friday Group Chat

Real-time group chat application with anonymous mode, built with Node.js, Socket.io and MySQL.
<img width="1868" height="961" alt="Screenshot 2025-09-29 171456" src="https://github.com/user-attachments/assets/fcbfb165-588c-4070-a248-e112720bb5ad" />
<img width="517" height="854" alt="Screenshot 2025-09-29 171752" src="https://github.com/user-attachments/assets/1c4d246e-deeb-42a4-8030-6482192d6888" />



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

