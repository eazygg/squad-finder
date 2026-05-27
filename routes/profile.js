// routes/profile.js
const express = require('express');
const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware для проверки токена - ДОЛЖЕН БЫТЬ ПЕРВЫМ
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Недействительный токен' });
        }
        req.user = user;
        next();
    });
};

// Middleware для проверки админских прав
const requireAdmin = (req, res, next) => {
    pool.query('SELECT role FROM users WHERE id = $1', [req.user.userId])
        .then(result => {
            if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
                return res.status(403).json({ error: 'Требуются права администратора' });
            }
            next();
        })
        .catch(error => {
            console.error('Admin check error:', error);
            res.status(500).json({ error: 'Ошибка проверки прав' });
        });
};

// ==================== АДМИНСКИЕ МАРШРУТЫ ====================


// Получить полную информацию о пользователе для просмотра профиля
// Получить полную информацию о пользователе для просмотра профиля
router.get('/full-user-info/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await pool.query(`
            SELECT
                u.id, u.username, u.email, u.avatar_url,
                u.test_completed, u.created_at, u.last_login,
                u.openness, u.conscientiousness, u.extraversion,
                u.agreeableness, u.neuroticism,
                ARRAY_AGG(ug.game_name) FILTER (WHERE ug.game_name IS NOT NULL) as games
            FROM users u
                     LEFT JOIN user_games ug ON u.id = ug.user_id
            WHERE u.id = $1
            GROUP BY u.id
        `, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const userData = result.rows[0];

        const responseData = {
            id: userData.id,
            username: userData.username,
            email: userData.email,
            avatar_url: userData.avatar_url,
            test_completed: userData.test_completed,
            created_at: userData.created_at,
            last_login: userData.last_login,  // ← Добавляем
            openness: userData.openness,
            conscientiousness: userData.conscientiousness,
            extraversion: userData.extraversion,
            agreeableness: userData.agreeableness,
            neuroticism: userData.neuroticism,
            games: userData.games || []
        };

        res.json(responseData);

    } catch (error) {
        console.error('Error fetching full user info:', error);
        res.status(500).json({ error: 'Ошибка загрузки профиля пользователя' });
    }
});


// API для получения всех пользователей (для админа)
router.get('/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, email, username, role, test_completed,
                   created_at, avatar_url
            FROM users
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// API для получения статистики (для админа)
router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE test_completed = true) as tested_users,
                (SELECT COUNT(*) FROM game_rooms) as total_rooms,
                (SELECT COUNT(*) FROM game_rooms WHERE status = 'waiting') as active_rooms,
                (SELECT COUNT(*) FROM room_messages WHERE created_at >= NOW() - INTERVAL '1 day') as messages_today
        `);
        res.json(stats.rows[0]);
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// API для получения всех комнат (для админа)
router.get('/admin/rooms', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT gr.*, u.username as creator_name,
                   COUNT(rp.user_id) as player_count
            FROM game_rooms gr
                     LEFT JOIN users u ON gr.created_by = u.id
                     LEFT JOIN room_players rp ON gr.id = rp.room_id
            GROUP BY gr.id, u.username
            ORDER BY gr.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Admin rooms error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// API для удаления пользователя (для админа)
router.delete('/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;

        await pool.query('DELETE FROM users WHERE id = $1', [userId]);

        res.json({ message: 'Пользователь успешно удален' });
    } catch (error) {
        console.error('Admin delete user error:', error);
        res.status(500).json({ error: 'Ошибка удаления пользователя' });
    }
});

// API для удаления комнаты (для админа)
router.delete('/admin/rooms/:roomId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { roomId } = req.params;

        await pool.query('DELETE FROM room_messages WHERE room_id = $1', [roomId]);
        await pool.query('DELETE FROM room_players WHERE room_id = $1', [roomId]);
        await pool.query('DELETE FROM game_rooms WHERE id = $1', [roomId]);

        res.json({ message: 'Комната успешно удалена' });
    } catch (error) {
        console.error('Admin delete room error:', error);
        res.status(500).json({ error: 'Ошибка удаления комнаты' });
    }
});

// ==================== ОБЫЧНЫЕ МАРШРУТЫ ====================

// Получить все вопросы теста
router.get('/questions', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM psychological_questions ORDER BY id');
        res.json(result.rows);
    } catch (error) {
        console.error('Ошибка при получении вопросов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обработать результаты теста
router.post('/submit-test', authenticateToken, async (req, res) => {
    try {
        const { answers } = req.body;
        const userId = req.user.userId;

        const traits = {
            openness: 0,
            conscientiousness: 0,
            extraversion: 0,
            agreeableness: 0,
            neuroticism: 0
        };

        answers.forEach(answer => {
            traits[answer.trait] += answer.score;
        });

        const normalizedTraits = {};
        for (const [trait, score] of Object.entries(traits)) {
            normalizedTraits[trait] = Math.round((score / 25) * 10);
        }

        await pool.query(
            `UPDATE users
             SET openness = $1, conscientiousness = $2, extraversion = $3,
                 agreeableness = $4, neuroticism = $5, 
                 test_completed = TRUE, test_completed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [
                normalizedTraits.openness,
                normalizedTraits.conscientiousness,
                normalizedTraits.extraversion,
                normalizedTraits.agreeableness,
                normalizedTraits.neuroticism,
                userId
            ]
        );

        res.json({
            success: true,
            traits: normalizedTraits,
            message: 'Результаты теста успешно сохранены!'
        });

    } catch (error) {
        console.error('Ошибка при обработке теста:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить результаты теста пользователя
router.get('/results', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `SELECT openness, conscientiousness, extraversion, agreeableness, neuroticism
             FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = result.rows[0];

        if (user.openness === null || user.conscientiousness === null) {
            return res.status(404).json({ error: 'Результаты теста не найдены' });
        }

        res.json({
            traits: {
                openness: user.openness,
                conscientiousness: user.conscientiousness,
                extraversion: user.extraversion,
                agreeableness: user.agreeableness,
                neuroticism: user.neuroticism
            }
        });

    } catch (error) {
        console.error('Ошибка при получении результатов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});



// Создание комнаты
router.post('/create-room', authenticateToken, async (req, res) => {
    try {
        const { name, game_name, max_players = 4 } = req.body;
        const userId = req.user.userId;

        const result = await pool.query(
            `INSERT INTO game_rooms (name, game_name, max_players, created_by, current_players)
             VALUES ($1, $2, $3, $4, 1)
             RETURNING *`,
            [name, game_name, max_players, userId]
        );

        await pool.query(
            'INSERT INTO room_players (room_id, user_id) VALUES ($1, $2)',
            [result.rows[0].id, userId]
        );

        res.json({ success: true, room: result.rows[0] });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

// Поиск комнат
router.get('/rooms', authenticateToken, async (req, res) => {
    try {
        const { game_name } = req.query;

        let query = `
            SELECT gr.*, u.username as creator_name,
                   COUNT(rp.user_id) as current_players
            FROM game_rooms gr
                     JOIN users u ON gr.created_by = u.id
                     LEFT JOIN room_players rp ON gr.id = rp.room_id
            WHERE gr.status = 'waiting'
        `;
        let params = [];

        if (game_name) {
            query += ` AND gr.game_name = $1`;
            params.push(game_name);
        }

        query += ` GROUP BY gr.id, u.username, gr.created_by ORDER BY gr.created_at DESC`; // ← добавили gr.created_by

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).json({ error: 'Failed to fetch rooms' });
    }
});

// Присоединение к комнате
router.post('/join-room/:roomId', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;

        const roomResult = await pool.query(
            `SELECT max_players, current_players 
             FROM game_rooms 
             WHERE id = $1 AND status = 'waiting'`,
            [roomId]
        );

        if (roomResult.rows.length === 0) {
            return res.status(404).json({ error: 'Room not found or not available' });
        }

        const room = roomResult.rows[0];
        if (room.current_players >= room.max_players) {
            return res.status(400).json({ error: 'Room is full' });
        }

        await pool.query(
            'INSERT INTO room_players (room_id, user_id) VALUES ($1, $2)',
            [roomId, userId]
        );

        await pool.query(
            'UPDATE game_rooms SET current_players = current_players + 1 WHERE id = $1',
            [roomId]
        );

        res.json({ success: true, message: 'Joined room successfully' });
    } catch (error) {
        console.error('Error joining room:', error);
        res.status(500).json({ error: 'Failed to join room' });
    }
});

// Настройка multer и загрузка аватара
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Папка uploads создана:', uploadsDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Только изображения разрешены!'), false);
        }
    }
});

// Загрузка аватара
router.post('/upload-avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        const avatarUrl = '/uploads/' + req.file.filename;
        const userId = req.user.userId;

        console.log('📁 Файл сохранен в:', req.file.path);
        console.log('🌐 Будет доступен по:', avatarUrl);

        if (!fs.existsSync(req.file.path)) {
            console.log('❌ Файл не найден после сохранения!');
            return res.status(500).json({ error: 'Ошибка сохранения файла' });
        }

        await pool.query(
            'UPDATE users SET avatar_url = $1 WHERE id = $2',
            [avatarUrl, userId]
        );

        res.json({
            success: true,
            avatarUrl: avatarUrl,
            message: 'Аватар успешно обновлен!'
        });

    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        res.status(500).json({ error: 'Ошибка сервера при загрузке аватара' });
    }
});

router.get('/my-rooms', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(`
            SELECT gr.*, u.username as creator_name,
                   COUNT(rp.user_id) as current_players,
                   EXISTS(SELECT 1 FROM room_players WHERE room_id = gr.id AND user_id = $1) as is_member
            FROM game_rooms gr
            JOIN users u ON gr.created_by = u.id
            LEFT JOIN room_players rp ON gr.id = rp.room_id
            WHERE gr.id IN (SELECT room_id FROM room_players WHERE user_id = $1)
            GROUP BY gr.id, u.username
            ORDER BY gr.created_at DESC
        `, [userId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching my rooms:', error);
        res.status(500).json({ error: 'Ошибка загрузки ваших комнат' });
    }
});

// API для выхода из комнаты
router.post('/leave-room/:roomId', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;

        // Проверяем, состоит ли пользователь в комнате
        const memberCheck = await pool.query(
            'SELECT * FROM room_players WHERE room_id = $1 AND user_id = $2',
            [roomId, userId]
        );

        if (memberCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Вы не состоите в этой комнате' });
        }

        // Удаляем пользователя из комнаты
        await pool.query(
            'DELETE FROM room_players WHERE room_id = $1 AND user_id = $2',
            [roomId, userId]
        );

        // Обновляем счетчик игроков
        await pool.query(
            'UPDATE game_rooms SET current_players = current_players - 1 WHERE id = $1',
            [roomId]
        );

        // Проверяем, остались ли игроки в комнате
        const playersCheck = await pool.query(
            'SELECT COUNT(*) FROM room_players WHERE room_id = $1',
            [roomId]
        );

        // Если комната пуста - удаляем ее
        if (parseInt(playersCheck.rows[0].count) === 0) {
            await pool.query('DELETE FROM room_messages WHERE room_id = $1', [roomId]);
            await pool.query('DELETE FROM game_rooms WHERE id = $1', [roomId]);
        }

        res.json({ success: true, message: 'Вы вышли из комнаты' });
    } catch (error) {
        console.error('Error leaving room:', error);
        res.status(500).json({ error: 'Ошибка выхода из комнаты' });
    }
});

// Сохранение игр
router.post('/save-games', authenticateToken, async (req, res) => {
    try {
        const { games } = req.body;
        const userId = req.user.userId;

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            await client.query(
                'DELETE FROM user_games WHERE user_id = $1',
                [userId]
            );

            for (const gameName of games) {
                await client.query(
                    'INSERT INTO user_games (user_id, game_name) VALUES ($1, $2)',
                    [userId, gameName]
                );
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                message: 'Игры успешно сохранены!',
                count: games.length
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Ошибка сохранения игр:', error);
        res.status(500).json({ error: 'Ошибка сервера при сохранении игр' });
    }
});

// API для удаления своей комнаты (для создателя комнаты)
router.delete('/my-rooms/:roomId', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;

        // Проверяем, является ли пользователь создателем комнаты
        const roomResult = await pool.query(
            'SELECT created_by FROM game_rooms WHERE id = $1',
            [roomId]
        );

        if (roomResult.rows.length === 0) {
            return res.status(404).json({ error: 'Комната не найдена' });
        }

        const room = roomResult.rows[0];

        if (room.created_by !== userId) {
            return res.status(403).json({ error: 'Вы можете удалять только свои комнаты' });
        }

        // Удаляем сообщения комнаты
        await pool.query('DELETE FROM room_messages WHERE room_id = $1', [roomId]);
        // Удаляем участников комнаты
        await pool.query('DELETE FROM room_players WHERE room_id = $1', [roomId]);
        // Удаляем саму комнату
        await pool.query('DELETE FROM game_rooms WHERE id = $1', [roomId]);

        res.json({ message: 'Комната успешно удалена' });
    } catch (error) {
        console.error('Error deleting room:', error);
        res.status(500).json({ error: 'Ошибка удаления комнаты' });
    }
});

// Получение сохраненных игр
router.get('/saved-games', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            'SELECT game_name FROM user_games WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        res.json({
            games: result.rows.map(row => row.game_name)
        });

    } catch (error) {
        console.error('Ошибка загрузки игр:', error);
        res.status(500).json({ error: 'Ошибка сервера при загрузке игр' });
    }
});
// Получить информацию о пользователе для профиля
router.get('/user-info/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await pool.query(`
            SELECT id, username, email, avatar_url, test_completed,
                   openness, conscientiousness, extraversion, 
                   agreeableness, neuroticism, created_at
            FROM users WHERE id = $1
        `, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching user info:', error);
        res.status(500).json({ error: 'Ошибка загрузки профиля' });
    }
});


// Перепройти тест (с сохранением истории)
router.post('/retake-test', authenticateToken, async (req, res) => {
    try {
        const { answers } = req.body;
        const userId = req.user.userId;

        // Подсчитываем баллы
        const traits = {
            openness: 0,
            conscientiousness: 0,
            extraversion: 0,
            agreeableness: 0,
            neuroticism: 0
        };

        answers.forEach(answer => {
            traits[answer.trait] += answer.score;
        });

        // Нормализуем результаты (1-10)
        const normalizedTraits = {};
        for (const [trait, score] of Object.entries(traits)) {
            normalizedTraits[trait] = Math.round((score / 25) * 9 + 1);
        }

        // Получаем номер текущего теста
        const historyCount = await pool.query(
            'SELECT COUNT(*) as count FROM test_history WHERE user_id = $1',
            [userId]
        );
        const testNumber = historyCount.rows[0].count + 1;

        // Сохраняем в историю
        await pool.query(
            `INSERT INTO test_history 
             (user_id, openness, conscientiousness, extraversion, agreeableness, neuroticism, test_number)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                userId,
                normalizedTraits.openness,
                normalizedTraits.conscientiousness,
                normalizedTraits.extraversion,
                normalizedTraits.agreeableness,
                normalizedTraits.neuroticism,
                testNumber
            ]
        );

        // Обновляем основные данные пользователя
        await pool.query(
            `UPDATE users
             SET openness = $1, conscientiousness = $2, extraversion = $3,
                 agreeableness = $4, neuroticism = $5, 
                 test_completed = TRUE, test_completed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [
                normalizedTraits.openness,
                normalizedTraits.conscientiousness,
                normalizedTraits.extraversion,
                normalizedTraits.agreeableness,
                normalizedTraits.neuroticism,
                userId
            ]
        );

        res.json({
            success: true,
            traits: normalizedTraits,
            testNumber: testNumber,
            message: `Результаты теста #${testNumber} успешно сохранены!`
        });

    } catch (error) {
        console.error('Ошибка при перепрохождении теста:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить статистику тестов пользователя
router.get('/test-stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Получаем общее количество тестов
        const totalResult = await pool.query(
            'SELECT COUNT(*) as total FROM test_history WHERE user_id = $1',
            [userId]
        );

        // Получаем последние 10 тестов
        const historyResult = await pool.query(
            `SELECT test_number, openness, conscientiousness, extraversion, 
                    agreeableness, neuroticism, created_at
             FROM test_history 
             WHERE user_id = $1 
             ORDER BY test_number DESC 
             LIMIT 10`,
            [userId]
        );

        // Получаем текущие результаты пользователя
        const currentResult = await pool.query(
            `SELECT openness, conscientiousness, extraversion, 
                    agreeableness, neuroticism, test_completed_at
             FROM users 
             WHERE id = $1`,
            [userId]
        );

        res.json({
            total_tests: parseInt(totalResult.rows[0].total),
            current: currentResult.rows[0],
            history: historyResult.rows
        });

    } catch (error) {
        console.error('Ошибка получения статистики тестов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});


// Получить всех участников комнаты
router.get('/room-players/:roomId', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;

        const result = await pool.query(`
            SELECT 
                u.id, u.username, u.avatar_url, u.test_completed,
                u.openness, u.conscientiousness, u.extraversion, 
                u.agreeableness, u.neuroticism,
                rp.joined_at,
                CASE WHEN gr.created_by = u.id THEN true ELSE false END as is_creator
            FROM room_players rp
            JOIN users u ON rp.user_id = u.id
            JOIN game_rooms gr ON rp.room_id = gr.id
            WHERE rp.room_id = $1
            ORDER BY 
                CASE WHEN gr.created_by = u.id THEN 0 ELSE 1 END,
                rp.joined_at ASC
        `, [roomId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching room players:', error);
        res.status(500).json({ error: 'Ошибка загрузки участников' });
    }
});

// Получить статистику тестов другого пользователя
router.get('/user-test-stats/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        // Получаем общее количество тестов
        const totalResult = await pool.query(
            'SELECT COUNT(*) as total FROM test_history WHERE user_id = $1',
            [userId]
        );

        // Получаем последние 10 тестов
        const historyResult = await pool.query(
            `SELECT test_number, openness, conscientiousness, extraversion, 
                    agreeableness, neuroticism, created_at
             FROM test_history 
             WHERE user_id = $1 
             ORDER BY test_number DESC 
             LIMIT 10`,
            [userId]
        );

        res.json({
            total_tests: parseInt(totalResult.rows[0].total),
            history: historyResult.rows
        });

    } catch (error) {
        console.error('Error fetching user test stats:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Рассчитать совместимость с другим пользователем
router.get('/calculate-compatibility/:userId', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const { userId } = req.params;

        // Получаем данные текущего пользователя
        const currentUserResult = await pool.query(
            `SELECT openness, conscientiousness, extraversion, agreeableness, neuroticism 
             FROM users WHERE id = $1`,
            [currentUserId]
        );

        // Получаем данные другого пользователя
        const otherUserResult = await pool.query(
            `SELECT openness, conscientiousness, extraversion, agreeableness, neuroticism 
             FROM users WHERE id = $1`,
            [userId]
        );

        if (currentUserResult.rows.length === 0 || otherUserResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const current = currentUserResult.rows[0];
        const other = otherUserResult.rows[0];

        // Проверяем, что оба прошли тест
        if (!current.openness || !other.openness) {
            return res.status(400).json({ error: 'Один из пользователей не прошел тест' });
        }

        // Рассчитываем совместимость
        const traits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
        let totalDiff = 0;

        for (const trait of traits) {
            const diff = Math.abs(current[trait] - other[trait]);
            totalDiff += diff;
        }

        // Максимальная разница 10 * 5 = 50
        const compatibility = Math.round((1 - totalDiff / 50) * 100);

        res.json({
            compatibility: Math.max(0, Math.min(100, compatibility))
        });

    } catch (error) {
        console.error('Error calculating compatibility:', error);
        res.status(500).json({ error: 'Ошибка расчета совместимости' });
    }
});

// Получить статистику тестов другого пользователя
router.get('/user-test-stats/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        // Получаем общее количество тестов
        const totalResult = await pool.query(
            'SELECT COUNT(*) as total FROM test_history WHERE user_id = $1',
            [userId]
        );

        // Получаем последние 10 тестов
        const historyResult = await pool.query(
            `SELECT test_number, openness, conscientiousness, extraversion, 
                    agreeableness, neuroticism, created_at
             FROM test_history 
             WHERE user_id = $1 
             ORDER BY test_number DESC 
             LIMIT 10`,
            [userId]
        );

        res.json({
            total_tests: parseInt(totalResult.rows[0].total),
            history: historyResult.rows
        });

    } catch (error) {
        console.error('Error fetching user test stats:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Рассчитать совместимость с другим пользователем
router.get('/calculate-compatibility/:userId', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const { userId } = req.params;

        // Получаем данные текущего пользователя
        const currentUserResult = await pool.query(
            `SELECT openness, conscientiousness, extraversion, agreeableness, neuroticism 
             FROM users WHERE id = $1`,
            [currentUserId]
        );

        // Получаем данные другого пользователя
        const otherUserResult = await pool.query(
            `SELECT openness, conscientiousness, extraversion, agreeableness, neuroticism 
             FROM users WHERE id = $1`,
            [userId]
        );

        if (currentUserResult.rows.length === 0 || otherUserResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const current = currentUserResult.rows[0];
        const other = otherUserResult.rows[0];

        // Проверяем, что оба прошли тест
        if (current.openness === null || other.openness === null) {
            return res.status(400).json({ error: 'Один из пользователей не прошел тест' });
        }

        // Рассчитываем совместимость
        const traits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
        let totalDiff = 0;

        for (const trait of traits) {
            const diff = Math.abs(current[trait] - other[trait]);
            totalDiff += diff;
        }

        // Максимальная разница 10 * 5 = 50
        const compatibility = Math.round((1 - totalDiff / 50) * 100);

        res.json({
            compatibility: Math.max(0, Math.min(100, compatibility))
        });

    } catch (error) {
        console.error('Error calculating compatibility:', error);
        res.status(500).json({ error: 'Ошибка расчета совместимости' });
    }
});


// Поиск пользователей
router.get('/search', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const { game, minCompatibility = 0 } = req.query;

        // Получаем текущего пользователя с его чертами личности
        const currentUserResult = await pool.query(
            `SELECT openness, conscientiousness, extraversion, agreeableness, neuroticism 
             FROM users WHERE id = $1`,
            [currentUserId]
        );

        const currentUser = currentUserResult.rows[0];

        // Если текущий пользователь не прошел тест, возвращаем только базовую информацию
        let usersQuery = `
            SELECT 
                u.id, u.username, u.avatar_url, u.test_completed,
                u.openness, u.conscientiousness, u.extraversion, 
                u.agreeableness, u.neuroticism,
                ARRAY_AGG(ug.game_name) FILTER (WHERE ug.game_name IS NOT NULL) as games
            FROM users u
            LEFT JOIN user_games ug ON u.id = ug.user_id
            WHERE u.id != $1
        `;

        const queryParams = [currentUserId];
        let paramIndex = 2;

        // Фильтр по игре
        if (game && game !== '') {
            usersQuery += ` AND EXISTS (
                SELECT 1 FROM user_games ug2 
                WHERE ug2.user_id = u.id AND ug2.game_name = $${paramIndex}
            )`;
            queryParams.push(game);
            paramIndex++;
        }

        usersQuery += ` GROUP BY u.id ORDER BY u.last_login DESC NULLS LAST`;

        const result = await pool.query(usersQuery, queryParams);

        // Форматируем результаты и рассчитываем совместимость
        const users = result.rows.map(user => {
            let compatibility = 0;

            // Рассчитываем совместимость, если оба пользователя прошли тест
            if (currentUser && user.test_completed &&
                currentUser.openness !== null && user.openness !== null) {

                const traits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
                let totalDiff = 0;

                for (const trait of traits) {
                    const diff = Math.abs((currentUser[trait] || 5) - (user[trait] || 5));
                    totalDiff += diff;
                }

                compatibility = Math.round((1 - totalDiff / 50) * 100);
                compatibility = Math.max(0, Math.min(100, compatibility));
            }

            return {
                id: user.id,
                username: user.username,
                avatar_url: user.avatar_url,
                test_completed: user.test_completed,
                compatibility: compatibility,
                games: user.games || []
            };
        });

        // Фильтруем по минимальной совместимости
        const filteredUsers = users.filter(user => user.compatibility >= parseInt(minCompatibility));

        // Сортируем по совместимости (по убыванию)
        filteredUsers.sort((a, b) => b.compatibility - a.compatibility);

        res.json(filteredUsers);

    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: 'Ошибка поиска пользователей' });
    }
});

// Получить все игры всех пользователей для фильтра
router.get('/all-games', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT game_name 
            FROM user_games 
            ORDER BY game_name
        `);

        res.json(result.rows.map(row => row.game_name));
    } catch (error) {
        console.error('Error fetching all games:', error);
        res.status(500).json({ error: 'Ошибка загрузки игр' });
    }
});


// ==================== ЛИЧНЫЕ СООБЩЕНИЯ ====================

// Получить список диалогов текущего пользователя
router.get('/dialogs', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(`
            SELECT 
                u.id as user_id,
                u.username,
                u.avatar_url,
                u.last_login,
                COUNT(CASE WHEN pm.is_read = false AND pm.to_user_id = $1 THEN 1 END) as unread_count,
                MAX(pm.created_at) as last_message_time,
                (
                    SELECT message 
                    FROM private_messages 
                    WHERE (from_user_id = $1 AND to_user_id = u.id) 
                       OR (from_user_id = u.id AND to_user_id = $1)
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) as last_message
            FROM users u
            INNER JOIN private_messages pm ON (pm.from_user_id = u.id AND pm.to_user_id = $1)
                                           OR (pm.to_user_id = u.id AND pm.from_user_id = $1)
            WHERE u.id != $1
            GROUP BY u.id, u.username, u.avatar_url, u.last_login
            ORDER BY last_message_time DESC
        `, [userId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching dialogs:', error);
        res.status(500).json({ error: 'Ошибка загрузки диалогов' });
    }
});

// Получить историю переписки с конкретным пользователем
router.get('/messages/:userId', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const { userId } = req.params;

        // Помечаем сообщения как прочитанные
        await pool.query(`
            UPDATE private_messages 
            SET is_read = true 
            WHERE from_user_id = $1 AND to_user_id = $2
        `, [userId, currentUserId]);

        const result = await pool.query(`
            SELECT 
                pm.*,
                u_from.username as from_username,
                u_from.avatar_url as from_avatar,
                u_to.username as to_username,
                u_to.avatar_url as to_avatar
            FROM private_messages pm
            JOIN users u_from ON pm.from_user_id = u_from.id
            JOIN users u_to ON pm.to_user_id = u_to.id
            WHERE (pm.from_user_id = $1 AND pm.to_user_id = $2)
               OR (pm.from_user_id = $2 AND pm.to_user_id = $1)
            ORDER BY pm.created_at ASC
            LIMIT 100
        `, [currentUserId, userId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Ошибка загрузки сообщений' });
    }
});

// Отправить личное сообщение
router.post('/send-message', authenticateToken, async (req, res) => {
    try {
        const fromUserId = req.user.userId;
        const { toUserId, message } = req.body;

        if (!toUserId || !message || message.trim() === '') {
            return res.status(400).json({ error: 'Неверные данные' });
        }

        const result = await pool.query(`
            INSERT INTO private_messages (from_user_id, to_user_id, message)
            VALUES ($1, $2, $3)
            RETURNING id, created_at
        `, [fromUserId, toUserId, message.trim()]);

        // Получаем данные отправителя
        const senderResult = await pool.query(
            'SELECT username, avatar_url FROM users WHERE id = $1',
            [fromUserId]
        );

        const messageData = {
            id: result.rows[0].id,
            from_user_id: fromUserId,
            to_user_id: toUserId,
            message: message.trim(),
            created_at: result.rows[0].created_at,
            from_username: senderResult.rows[0].username,
            from_avatar: senderResult.rows[0].avatar_url,
            is_read: false
        };

        res.json({ success: true, message: messageData });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Ошибка отправки сообщения' });
    }
});

// Обновить время последней активности
router.post('/update-activity', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        await pool.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating activity:', error);
        res.status(500).json({ error: 'Ошибка обновления активности' });
    }
});

// Получить список диалогов текущего пользователя
router.get('/dialogs', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(`
            SELECT DISTINCT 
                u.id as user_id,
                u.username,
                u.avatar_url,
                u.last_login,
                (
                    SELECT COUNT(*) FROM private_messages 
                    WHERE from_user_id = u.id AND to_user_id = $1 AND is_read = false
                ) as unread_count,
                (
                    SELECT message FROM private_messages 
                    WHERE (from_user_id = $1 AND to_user_id = u.id) 
                       OR (from_user_id = u.id AND to_user_id = $1)
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) as last_message,
                (
                    SELECT created_at FROM private_messages 
                    WHERE (from_user_id = $1 AND to_user_id = u.id) 
                       OR (from_user_id = u.id AND to_user_id = $1)
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) as last_message_time
            FROM users u
            INNER JOIN private_messages pm ON (pm.from_user_id = u.id AND pm.to_user_id = $1)
                                           OR (pm.to_user_id = u.id AND pm.from_user_id = $1)
            WHERE u.id != $1
            GROUP BY u.id, u.username, u.avatar_url, u.last_login
            ORDER BY last_message_time DESC
        `, [userId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching dialogs:', error);
        // Возвращаем пустой массив вместо ошибки
        res.json([]);
    }
});



// ==================== ЛИЧНЫЕ СООБЩЕНИЯ (ПРИВАТНЫЙ ЧАТ) ====================

// 1. Получить список диалогов текущего пользователя
router.get('/dialogs', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Этот запрос получает всех пользователей, с которыми у текущего есть переписка,
        // а также последнее сообщение и количество непрочитанных.
        const result = await pool.query(`
            SELECT DISTINCT 
                u.id as user_id,
                u.username,
                u.avatar_url,
                u.last_login,
                (
                    SELECT COUNT(*) FROM private_messages 
                    WHERE from_user_id = u.id AND to_user_id = $1 AND is_read = false
                ) as unread_count,
                (
                    SELECT message FROM private_messages 
                    WHERE (from_user_id = $1 AND to_user_id = u.id) 
                       OR (from_user_id = u.id AND to_user_id = $1)
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) as last_message,
                (
                    SELECT created_at FROM private_messages 
                    WHERE (from_user_id = $1 AND to_user_id = u.id) 
                       OR (from_user_id = u.id AND to_user_id = $1)
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) as last_message_time
            FROM users u
            INNER JOIN private_messages pm ON (pm.from_user_id = u.id AND pm.to_user_id = $1)
                                           OR (pm.to_user_id = u.id AND pm.from_user_id = $1)
            WHERE u.id != $1
            GROUP BY u.id, u.username, u.avatar_url, u.last_login
            ORDER BY last_message_time DESC
        `, [userId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching dialogs:', error);
        res.status(500).json({ error: 'Ошибка загрузки списка диалогов' });
    }
});

// 2. Получить историю переписки с конкретным пользователем
router.get('/messages/:userId', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const { userId } = req.params;

        // Помечаем входящие сообщения как прочитанные
        await pool.query(`
            UPDATE private_messages 
            SET is_read = true 
            WHERE from_user_id = $1 AND to_user_id = $2
        `, [userId, currentUserId]);

        // Получаем историю сообщений между двумя пользователями
        const result = await pool.query(`
            SELECT 
                pm.*,
                u_from.username as from_username,
                u_from.avatar_url as from_avatar,
                u_to.username as to_username,
                u_to.avatar_url as to_avatar
            FROM private_messages pm
            JOIN users u_from ON pm.from_user_id = u_from.id
            JOIN users u_to ON pm.to_user_id = u_to.id
            WHERE (pm.from_user_id = $1 AND pm.to_user_id = $2)
               OR (pm.from_user_id = $2 AND pm.to_user_id = $1)
            ORDER BY pm.created_at ASC
            LIMIT 100
        `, [currentUserId, userId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Ошибка загрузки сообщений' });
    }
});

// 3. Отправить новое личное сообщение
router.post('/send-message', authenticateToken, async (req, res) => {
    try {
        const fromUserId = req.user.userId;
        const { toUserId, message } = req.body;

        if (!toUserId || !message || message.trim() === '') {
            return res.status(400).json({ error: 'Неверные данные' });
        }

        // Сохраняем сообщение в базу данных
        const result = await pool.query(`
            INSERT INTO private_messages (from_user_id, to_user_id, message)
            VALUES ($1, $2, $3)
            RETURNING id, created_at
        `, [fromUserId, toUserId, message.trim()]);

        // Отправляем уведомление через Socket.IO получателю
        const senderResult = await pool.query(
            'SELECT username, avatar_url FROM users WHERE id = $1',
            [fromUserId]
        );

        // Эмитим событие для получателя
        const io = req.app.get('io');
        if (io) {
            io.to(`user_${toUserId}`).emit('new_private_message', {
                id: result.rows[0].id,
                from_user_id: fromUserId,
                to_user_id: toUserId,
                message: message.trim(),
                created_at: result.rows[0].created_at,
                from_username: senderResult.rows[0].username,
                from_avatar: senderResult.rows[0].avatar_url,
                is_read: false
            });
        }

        res.json({ success: true, messageId: result.rows[0].id });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Ошибка отправки сообщения' });
    }
});

// ==================== ЗАГРУЗКА ФАЙЛОВ ДЛЯ ЧАТА ====================
// ==================== ЗАГРУЗКА ФАЙЛОВ ДЛЯ ЧАТА ====================
// Используем уже существующий multer, не создаём новый!

// Создаем папку для медиафайлов чата
const chatUploadsDir = path.join(__dirname, '../public/uploads/chat');
if (!fs.existsSync(chatUploadsDir)) {
    fs.mkdirSync(chatUploadsDir, { recursive: true });
}

// Настройка multer для медиафайлов (новая конфигурация)
const chatStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, chatUploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'chat-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const chatUpload = multer({
    storage: chatStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'audio/webm', 'audio/mp3', 'audio/mpeg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Неподдерживаемый тип файла'), false);
        }
    }
});

// Загрузка медиафайла в чат
router.post('/upload-chat-media', authenticateToken, chatUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        const fileUrl = '/uploads/chat/' + req.file.filename;
        let fileType = 'image';

        if (req.file.mimetype.startsWith('audio')) {
            fileType = 'audio';
        }

        console.log('File uploaded:', fileUrl, 'Type:', fileType);

        res.json({
            success: true,
            fileUrl: fileUrl,
            fileType: fileType,
            fileName: req.file.originalname
        });

    } catch (error) {
        console.error('Error uploading chat media:', error);
        res.status(500).json({ error: 'Ошибка загрузки файла' });
    }
});

module.exports = router;