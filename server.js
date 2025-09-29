require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

let pool = null;
const inMemoryMessages = new Map();

async function getPhpMyAdminConfig() {
  try {
    const configPath = path.join('c:\\', 'xampp', 'phpMyAdmin', 'config.inc.php');
    if (!fs.existsSync(configPath)) return null;

    const phpConfig = fs.readFileSync(configPath, 'utf8');
    function extract(pattern, fallback) {
      const match = phpConfig.match(pattern);
      return match ? match[1] : fallback;
    }

    return {
      host: extract(/\$cfg\['Servers'\]\[\$i\]\['host'\]\s*=\s*'([^']+)'/, 'localhost'),
      user: extract(/\$cfg\['Servers'\]\[\$i\]\['user'\]\s*=\s*'([^']+)'/, 'root'),
      password: extract(/\$cfg\['Servers'\]\[\$i\]\['password'\]\s*=\s*'([^']*)'/, ''),
      port: extract(/\$cfg\['Servers'\]\[\$i\]\['port'\]\s*=\s*'([^']+)'/, '3306'),
      database: process.env.DB_NAME || 'chat_app'
    };
  } catch (err) {
    console.warn('⚠ Could not read phpMyAdmin config:', err.message);
    return null;
  }
}

async function initDbPool() {
  try {
    let cfg = await getPhpMyAdminConfig();
    if (!cfg) {
      cfg = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT || 3306,
        database: process.env.DB_NAME || 'chat_app'
      };
    }

    pool = mysql.createPool({
      ...cfg,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();

    console.log('✅ Connected to MySQL database. Messages will be persisted.');
  } catch (err) {
    pool = null;
    console.warn('\n⚠ Warning: Unable to connect to MySQL. Running in-memory fallback.');
    console.warn(' - Error message:', err && err.message ? err.message : err);
    console.warn(' - To enable persistence start MySQL and configure phpMyAdmin or .env\n');
  }
}

initDbPool();

// ---------------------- APIs ----------------------
// FIXED: Return correct field names that frontend expects
app.get('/api/messages/:groupId', async (req, res) => {
  const { groupId } = req.params;
  try {
    if (pool) {
      const [rows] = await pool.execute(
        'SELECT id, group_id, user_name AS sender, is_anon AS is_anonymous, message AS text, created_at AS timestamp FROM messages WHERE group_id = ? ORDER BY created_at ASC',
        [groupId]
      );
      res.json(rows);
    } else {
      res.json(inMemoryMessages.get(groupId) || []);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.get('/api/users/online/:groupId', (req, res) => {
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

// ---------------------- Socket.IO ----------------------
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST']
  }
});

const presence = new Map();

io.on('connection', (socket) => {
  console.log('✅ Socket connected:', socket.id);

  // FIXED: Listen for 'joinGroup' instead of 'join'
  socket.on('joinGroup', async ({ groupId, username }) => {
    console.log(`👤 ${username} joining group: ${groupId}`);
    socket.join(groupId);
    presence.set(socket.id, { username, groupId, isAnon: false });
    
    // Emit online users list
    io.to(groupId).emit('onlineUsers', getOnlineUsersForGroup(groupId));
    
    // Notify others about new user
    socket.to(groupId).emit('userJoined', { username });
  });

  // FIXED: Listen for 'sendMessage' instead of 'message'
  socket.on('sendMessage', async ({ groupId, sender, text, isAnonymous }) => {
    console.log(`💬 Message from ${sender} in ${groupId}:`, text);
    
    try {
      const displayName = isAnonymous ? 'Anonymous' : sender;
      let msg = {
        sender: displayName,
        text: text,
        timestamp: new Date(),
        is_anonymous: isAnonymous
      };

      if (pool) {
        const [result] = await pool.execute(
          'INSERT INTO messages (group_id, user_name, is_anon, message, created_at) VALUES (?, ?, ?, ?, NOW())',
          [groupId, displayName, isAnonymous ? 1 : 0, text]
        );
        msg.id = result.insertId;
      } else {
        const arr = inMemoryMessages.get(groupId) || [];
        arr.push(msg);
        inMemoryMessages.set(groupId, arr);
      }

      // FIXED: Emit 'newMessage' with correct structure
      io.to(groupId).emit('newMessage', msg);
    } catch (err) {
      console.error('❌ Failed to persist message:', err);
      socket.emit('error', { message: 'Failed to save message' });
    }
  });

  // FIXED: Listen for 'typing' with correct parameters
  socket.on('typing', ({ groupId, username, isTyping }) => {
    socket.to(groupId).emit('userTyping', { username, isTyping });
  });

  socket.on('disconnect', () => {
    const p = presence.get(socket.id);
    if (p) {
      presence.delete(socket.id);
      io.to(p.groupId).emit('onlineUsers', getOnlineUsersForGroup(p.groupId));
      socket.to(p.groupId).emit('userLeft', { username: p.username });
      console.log(`👋 ${p.username} disconnected`);
    }
  });
});

// FIXED: Return simple array of usernames
function getOnlineUsersForGroup(groupId) {
  const users = [];
  for (const [sid, info] of presence.entries()) {
    if (info.groupId === groupId) {
      users.push(info.isAnon ? 'Anonymous' : info.username);
    }
  }
  return users;
}

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready for connections`);
});