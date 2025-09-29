require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// MySQL pool (attempt to connect; fall back to in-memory storage if unavailable)
let pool = null;
const inMemoryMessages = new Map(); // groupId -> [{...message}]

async function initDbPool() {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'chat_app',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // quick ping to validate connection
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('Connected to MySQL database. Messages will be persisted.');
  } catch (err) {
    pool = null;
    console.warn('\nWarning: Unable to connect to MySQL. Running in-memory fallback.');
    console.warn(' - Error message:', err && err.message ? err.message : err);
    console.warn(' - To enable persistence start MySQL and set DB_* in .env, then restart the server.\n');
  }
}

initDbPool();

// Basic APIs
app.get('/api/messages/:groupId', async (req, res) => {
  const { groupId } = req.params;
  try {
    if (pool) {
      const [rows] = await pool.execute(
        'SELECT m.id, m.group_id, m.user_name, m.is_anon, m.message, m.created_at FROM messages m WHERE m.group_id = ? ORDER BY m.created_at ASC',
        [groupId]
      );
      res.json(rows);
    } else {
      // return in-memory messages
      res.json(inMemoryMessages.get(groupId) || []);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.get('/api/users/online/:groupId', (req, res) => {
  // placeholder - real-time via sockets
  res.json({ online: [] });
});

app.post('/api/groups/:groupId/join', async (req, res) => {
  const { groupId } = req.params;
  const { userName } = req.body;
  try {
    if (pool) {
      await pool.execute(
        'INSERT INTO group_members (group_id, user_name, joined_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE joined_at = NOW()',
        [groupId, userName]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join group' });
  }
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST']
  }
});

// In-memory user presence map: socketId -> { userName, groupId, isAnon }
const presence = new Map();

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join', async ({ groupId = 'fun_friday', userName }) => {
    socket.join(groupId);
    presence.set(socket.id, { userName, groupId, isAnon: false });
    io.to(groupId).emit('presence', getPresenceForGroup(groupId));

    // notify
    socket.to(groupId).emit('system_message', { message: `${userName} joined the group.` });
  });

  socket.on('set_anon', ({ isAnon }) => {
    const p = presence.get(socket.id);
    if (p) {
      p.isAnon = !!isAnon;
      presence.set(socket.id, p);
      io.to(p.groupId).emit('presence', getPresenceForGroup(p.groupId));
    }
  });

  socket.on('typing', ({ groupId, userName }) => {
    socket.to(groupId).emit('typing', { userName });
  });

  socket.on('stop_typing', ({ groupId, userName }) => {
    socket.to(groupId).emit('stop_typing', { userName });
  });

  socket.on('message', async ({ groupId = 'fun_friday', userName, message, isAnon = false }) => {
    try {
      const displayName = isAnon ? 'Anonymous' : userName;
      let msg = {
        id: null,
        group_id: groupId,
        user_name: displayName,
        is_anon: isAnon ? 1 : 0,
        message,
        created_at: new Date()
      };

      if (pool) {
        const [result] = await pool.execute(
          'INSERT INTO messages (group_id, user_name, is_anon, message, created_at) VALUES (?, ?, ?, ?, NOW())',
          [groupId, displayName, isAnon ? 1 : 0, message]
        );
        msg.id = result.insertId;
      } else {
        // store in memory
        const arr = inMemoryMessages.get(groupId) || [];
        arr.push(msg);
        inMemoryMessages.set(groupId, arr);
      }

      io.to(groupId).emit('message', msg);
    } catch (err) {
      console.error('Failed to persist message', err);
      socket.emit('error_message', { error: 'Failed to save message' });
    }
  });

  socket.on('disconnect', () => {
    const p = presence.get(socket.id);
    if (p) {
      presence.delete(socket.id);
      io.to(p.groupId).emit('presence', getPresenceForGroup(p.groupId));
      socket.to(p.groupId).emit('system_message', { message: `${p.userName} left the group.` });
    }
    console.log('socket disconnected', socket.id);
  });
});

function getPresenceForGroup(groupId) {
  const users = [];
  for (const [sid, info] of presence.entries()) {
    if (info.groupId === groupId) {
      users.push({ userName: info.isAnon ? 'Anonymous' : info.userName, isAnon: !!info.isAnon });
    }
  }
  return users;
}

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
