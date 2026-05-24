// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
// const voiceRoutes = require('./routes/voice');

const jwt = require('jsonwebtoken'); // ← ДОБАВЬТЕ ЭТУ СТРОКУ
require('dotenv').config();
// В самом начале server.js, сразу после require('dotenv').config()
const isProduction = process.env.NODE_ENV === 'production';
console.log('Running in:', isProduction ? 'PRODUCTION' : 'DEVELOPMENT');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);

const pool = require('./config/database');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const communitiesRoutes = require('./routes/communities');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:3002",
        methods: ["GET", "POST"]
    }
});

// Создаем папку uploads в корне если ее нет
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Папка uploads создана в корне проекта');
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));


//voice
// app.use('/api/voice', voiceRoutes);

// CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:3002');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Origin, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// Логирование запросов
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Подключаем маршруты
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/communities', communitiesRoutes);

// Базовый маршрут для главной страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Тестовый маршрут для проверки БД
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as current_time');
        res.json({
            message: 'Сервер работает!',
            databaseTime: result.rows[0].current_time,
            status: 'OK'
        });
    } catch (error) {
        console.error('Ошибка при запросе к БД:', error);
        res.status(500).json({ error: 'Ошибка базы данных' });
    }
});

// Mock endpoint для тестирования
app.get('/api/test-search', (req, res) => {
    console.log('📨 Test search endpoint hit');
    res.json([
        {
            id: 999,
            username: "TestGamer",
            avatar_url: null,
            compatibility: 85,
            games: ["League of Legends", "Valorant"]
        },
        {
            id: 998,
            username: "ProPlayer",
            avatar_url: null,
            compatibility: 92,
            games: ["Minecraft", "Fortnite"]
        }
    ]);
});
const passwordResetRoutes = require('./routes/password-reset');
app.use('/api/password-reset', passwordResetRoutes);
// Инициализация базы данных
async function initializeDatabase() {
    try {
        // Таблица игровых комнат
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_rooms (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                game_name VARCHAR(255) NOT NULL,
                max_players INTEGER DEFAULT 4,
                current_players INTEGER DEFAULT 1,
                created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
                is_public BOOLEAN DEFAULT TRUE,
                status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_game', 'finished')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица участников комнат
        await pool.query(`
            CREATE TABLE IF NOT EXISTS room_players (
                id SERIAL PRIMARY KEY,
                room_id INTEGER REFERENCES game_rooms(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(room_id, user_id)
            )
        `);

        // Таблица сообщений комнат
        await pool.query(`
            CREATE TABLE IF NOT EXISTS room_messages (
                id SERIAL PRIMARY KEY,
                room_id INTEGER REFERENCES game_rooms(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                message_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Индексы для оптимизации
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_game_rooms_game ON game_rooms(game_name)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_room_players_room ON room_players(room_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_room_players_user ON room_players(user_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_room_messages_room ON room_messages(room_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_room_messages_created ON room_messages(created_at)
        `);

        console.log('✅ Все таблицы готовы к работе');

    } catch (error) {
        console.error('❌ Ошибка инициализации базы данных:', error);
    }
}

// Socket.IO логика
io.on('connection', (socket) => {
    console.log('🔗 Пользователь подключился:', socket.id);

    socket.on('authenticate', (token) => {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.userId;
            socket.join(`user_${decoded.userId}`);
            console.log(`✅ Пользователь ${decoded.userId} аутентифицирован в Socket.IO`);
        } catch (error) {
            console.error('❌ Ошибка аутентификации в Socket.IO:', error);
        }
    });

    // Присоединение к комнате сообщества
    socket.on('join_community', (communityId) => {
        socket.join(`community_${communityId}`);
        console.log(`👥 Пользователь ${socket.userId} присоединился к сообществу ${communityId}`);
    });

    // Присоединение к личному диалогу
    socket.on('join_dialog', (otherUserId) => {
        const dialogId = [socket.userId, otherUserId].sort().join('_');
        socket.join(`dialog_${dialogId}`);
        console.log(`💬 Пользователь ${socket.userId} присоединился к диалогу ${dialogId}`);
    });

    // Присоединение к комнате чата
    socket.on('join_room_chat', (roomId) => {
        socket.join(`room_${roomId}`);
        console.log(`💬 Пользователь ${socket.userId} присоединился к чату комнаты ${roomId}`);

        // Отправляем историю сообщений
        sendRoomHistory(socket, roomId);
    });

    // Отправка сообщения (личное или в сообщество)
    socket.on('send_message', async (data) => {
        try {
            if (!socket.userId) {
                return socket.emit('error', 'Требуется авторизация');
            }

            let room;
            let messageData;

            if (data.receiverId && data.isPrivate) {
                // Личное сообщение
                const dialogId = [socket.userId, data.receiverId].sort().join('_');
                room = `dialog_${dialogId}`;

                const result = await pool.query(
                    `INSERT INTO chat_messages 
                     (user_id, receiver_id, message_text, is_private, created_at) 
                     VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP) 
                     RETURNING id, created_at`,
                    [socket.userId, data.receiverId, data.message]
                );

                messageData = {
                    id: result.rows[0].id,
                    senderId: socket.userId,
                    receiverId: data.receiverId,
                    message: data.message,
                    timestamp: result.rows[0].created_at,
                    isPrivate: true
                };
            } else if (data.communityId) {
                // Сообщение в сообществе
                room = `community_${data.communityId}`;

                const result = await pool.query(
                    `INSERT INTO chat_messages 
                     (user_id, community_id, message_text, created_at) 
                     VALUES ($1, $2, $3, CURRENT_TIMESTAMP) 
                     RETURNING id, created_at`,
                    [socket.userId, data.communityId, data.message]
                );

                messageData = {
                    id: result.rows[0].id,
                    senderId: socket.userId,
                    communityId: data.communityId,
                    message: data.message,
                    timestamp: result.rows[0].created_at,
                    isPrivate: false
                };
            }

            io.to(room).emit('new_message', messageData);
            console.log(`✉️ Новое сообщение в ${room}`);

        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            socket.emit('error', 'Ошибка отправки сообщения');
        }
    });

    // Добавьте в секцию Socket.IO логики:

// Присоединение к личному чату
    socket.on('join_private_chat', (otherUserId) => {
        const roomName = [socket.userId, otherUserId].sort().join('_');
        socket.join(roomName);
        console.log(`User ${socket.userId} joined private chat room ${roomName}`);
    });

// Отправка личного сообщения
    socket.on('send_private_message', async (data, callback) => {
        try {
            const { toUserId, message } = data;
            const fromUserId = socket.userId;

            // Сохраняем в БД
            const result = await pool.query(
                `INSERT INTO private_messages (from_user_id, to_user_id, message)
             VALUES ($1, $2, $3) RETURNING id, created_at`,
                [fromUserId, toUserId, message]
            );

            // Получаем данные отправителя
            const senderResult = await pool.query(
                'SELECT username, avatar_url FROM users WHERE id = $1',
                [fromUserId]
            );

            const messageData = {
                id: result.rows[0].id,
                from_user_id: fromUserId,
                to_user_id: toUserId,
                message: message,
                created_at: result.rows[0].created_at,
                from_username: senderResult.rows[0].username,
                from_avatar: senderResult.rows[0].avatar_url,
                is_read: false
            };

            // Отправляем в комнату
            const roomName = [fromUserId, toUserId].sort().join('_');
            io.to(roomName).emit('new_private_message', messageData);

            if (callback) callback({ success: true });

        } catch (error) {
            console.error('Error sending private message:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Отправка сообщения в комнату
    socket.on('send_room_message', async (data, callback) => {
        try {
            console.log('📨 Получено сообщение:', data);

            if (!socket.userId) {
                console.error('❌ Пользователь не аутентифицирован');
                if (callback) callback({ success: false, error: 'Требуется авторизация' });
                return;
            }

            const { roomId, message } = data;

            if (!roomId || !message || message.trim() === '') {
                console.error('❌ Неверные данные сообщения');
                if (callback) callback({ success: false, error: 'Неверные данные сообщения' });
                return;
            }

            // Проверяем, существует ли комната
            const roomCheck = await pool.query(
                'SELECT id FROM game_rooms WHERE id = $1',
                [roomId]
            );

            if (roomCheck.rows.length === 0) {
                console.error('❌ Комната не найдена:', roomId);
                if (callback) callback({ success: false, error: 'Комната не найдена' });
                return;
            }

            // Сохраняем сообщение в БД
            const result = await pool.query(
                `INSERT INTO room_messages (room_id, user_id, message_text)
             VALUES ($1, $2, $3) 
             RETURNING id, created_at`,
                [roomId, socket.userId, message.trim()]
            );

            // Получаем данные пользователя
            const userResult = await pool.query(
                'SELECT username, avatar_url FROM users WHERE id = $1',
                [socket.userId]
            );

            const user = userResult.rows[0];
            const messageData = {
                id: result.rows[0].id,
                roomId: roomId,
                userId: socket.userId,
                username: user.username,
                avatar_url: user.avatar_url,
                message_text: message.trim(),
                created_at: result.rows[0].created_at
            };

            console.log('✅ Сообщение сохранено в БД:', messageData);

            // Отправляем всем в комнате
            io.to(`room_${roomId}`).emit('new_room_message', messageData);

            // Отправляем подтверждение отправителю
            if (callback) callback({ success: true, message: 'Сообщение отправлено' });

        } catch (error) {
            console.error('❌ Ошибка отправки сообщения:', error);
            if (callback) callback({ success: false, error: 'Ошибка сервера' });
        }
    });

    // Запрос истории сообщений
    socket.on('get_message_history', async (data) => {
        try {
            let query;
            let params;

            if (data.userId && data.isPrivate) {
                query = `
                    SELECT cm.*, u.username, u.avatar_url 
                    FROM chat_messages cm
                    JOIN users u ON cm.user_id = u.id
                    WHERE ((cm.user_id = $1 AND cm.receiver_id = $2) 
                           OR (cm.user_id = $2 AND cm.receiver_id = $1))
                    AND cm.is_private = TRUE
                    ORDER BY cm.created_at DESC
                    LIMIT 50
                `;
                params = [socket.userId, data.userId];
            } else if (data.communityId) {
                query = `
                    SELECT cm.*, u.username, u.avatar_url 
                    FROM chat_messages cm
                    JOIN users u ON cm.user_id = u.id
                    WHERE cm.community_id = $1
                    ORDER BY cm.created_at DESC
                    LIMIT 50
                `;
                params = [data.communityId];
            }

            const result = await pool.query(query, params);
            socket.emit('message_history', result.rows.reverse());
        } catch (error) {
            console.error('Ошибка загрузки истории:', error);
        }
    });

    // Покидание комнаты чата
    socket.on('leave_room_chat', (roomId) => {
        socket.leave(`room_${roomId}`);
        console.log(`👋 Пользователь ${socket.userId} покинул чат комнаты ${roomId}`);
    });

    socket.on('disconnect', () => {
        console.log('❌ Пользователь отключился:', socket.id);
    });
});

// Функция отправки истории сообщений комнаты
async function sendRoomHistory(socket, roomId) {
    try {
        const result = await pool.query(`
            SELECT rm.*, u.username, u.avatar_url
            FROM room_messages rm
            JOIN users u ON rm.user_id = u.id
            WHERE rm.room_id = $1
            ORDER BY rm.created_at DESC
            LIMIT 50
        `, [roomId]);

        socket.emit('room_message_history', result.rows.reverse());
    } catch (error) {
        console.error('Ошибка загрузки истории комнаты:', error);
    }
}

// Инициализация и запуск сервера
async function startServer() {
    try {
        await initializeDatabase();

        const PORT = process.env.PORT || 3002;
        server.listen(PORT, () => {
            console.log(`✅ Сервер запущен на порту ${PORT}`);
            console.log(`👉 Главная страница: http://localhost:${PORT}`);
            console.log(`👉 API тест: http://localhost:${PORT}/api/test`);
            console.log(`👉 Папка uploads: ${uploadsDir}`);
        });
    } catch (error) {
        console.error('❌ Ошибка запуска сервера:', error);
        process.exit(1);
    }
}

startServer();