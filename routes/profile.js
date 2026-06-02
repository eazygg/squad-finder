// routes/profile.js
const express = require('express');
const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ==================== MIDDLEWARE ====================
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
router.get('/full-user-info/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(`
            SELECT u.id, u.username, u.email, u.avatar_url, u.test_completed, 
                   u.created_at, u.last_login, u.openness, u.conscientiousness, 
                   u.extraversion, u.agreeableness, u.neuroticism,
                   ARRAY_AGG(ug.game_name) FILTER (WHERE ug.game_name IS NOT NULL) as games
            FROM users u
            LEFT JOIN user_games ug ON u.id = ug.user_id
            WHERE u.id = $1
            GROUP BY u.id
        `, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching full user info:', error);
        res.status(500).json({ error: 'Ошибка загрузки профиля' });
    }
});

router.get('/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, email, username, role, test_completed, created_at, avatar_url
            FROM users ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT (SELECT COUNT(*) FROM users) as total_users,
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

router.get('/admin/rooms', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT gr.*, u.username as creator_name, COUNT(rp.user_id) as player_count
            FROM game_rooms gr
            LEFT JOIN users u ON gr.created_by = u.id
            LEFT JOIN room_players rp ON gr.id = rp.room_id
            GROUP BY gr.id, u.username ORDER BY gr.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Admin rooms error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.delete('/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.userId]);
        res.json({ message: 'Пользователь успешно удален' });
    } catch (error) {
        console.error('Admin delete user error:', error);
        res.status(500).json({ error: 'Ошибка удаления пользователя' });
    }
});

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

// ==================== ПСИХОЛОГИЧЕСКИЙ ТЕСТ ====================
router.get('/questions', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM psychological_questions ORDER BY id');
        res.json(result.rows);
    } catch (error) {
        console.error('Ошибка при получении вопросов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/submit-test', authenticateToken, async (req, res) => {
    try {
        const { answers } = req.body;
        const userId = req.user.userId;

        const traits = { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0 };
        answers.forEach(answer => { traits[answer.trait] += answer.score; });

        const normalizedTraits = {};
        for (const [trait, score] of Object.entries(traits)) {
            normalizedTraits[trait] = Math.round((score / 25) * 10);
        }

        await pool.query(
            `UPDATE users SET openness = $1, conscientiousness = $2, extraversion = $3,
             agreeableness = $4, neuroticism = $5, test_completed = TRUE, 
             test_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
            [normalizedTraits.openness, normalizedTraits.conscientiousness, normalizedTraits.extraversion,
                normalizedTraits.agreeableness, normalizedTraits.neuroticism, userId]
        );

        res.json({ success: true, traits: normalizedTraits });
    } catch (error) {
        console.error('Ошибка при обработке теста:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/results', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT openness, conscientiousness, extraversion, agreeableness, neuroticism
             FROM users WHERE id = $1`,
            [req.user.userId]
        );
        if (result.rows.length === 0 || result.rows[0].openness === null) {
            return res.status(404).json({ error: 'Результаты теста не найдены' });
        }
        res.json({ traits: result.rows[0] });
    } catch (error) {
        console.error('Ошибка при получении результатов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/retake-test', authenticateToken, async (req, res) => {
    try {
        const { answers } = req.body;
        const userId = req.user.userId;

        const traits = { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0 };
        answers.forEach(answer => { traits[answer.trait] += answer.score; });

        const normalizedTraits = {};
        for (const [trait, score] of Object.entries(traits)) {
            normalizedTraits[trait] = Math.round((score / 25) * 9 + 1);
        }

        const historyCount = await pool.query('SELECT COUNT(*) as count FROM test_history WHERE user_id = $1', [userId]);
        const testNumber = historyCount.rows[0].count + 1;

        await pool.query(
            `INSERT INTO test_history (user_id, openness, conscientiousness, extraversion, agreeableness, neuroticism, test_number)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, normalizedTraits.openness, normalizedTraits.conscientiousness, normalizedTraits.extraversion,
                normalizedTraits.agreeableness, normalizedTraits.neuroticism, testNumber]
        );

        await pool.query(
            `UPDATE users SET openness = $1, conscientiousness = $2, extraversion = $3,
             agreeableness = $4, neuroticism = $5, test_completed = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
            [normalizedTraits.openness, normalizedTraits.conscientiousness, normalizedTraits.extraversion,
                normalizedTraits.agreeableness, normalizedTraits.neuroticism, userId]
        );

        res.json({ success: true, traits: normalizedTraits, testNumber });
    } catch (error) {
        console.error('Ошибка при перепрохождении теста:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/test-stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const totalResult = await pool.query('SELECT COUNT(*) as total FROM test_history WHERE user_id = $1', [userId]);
        const historyResult = await pool.query(
            `SELECT test_number, openness, conscientiousness, extraversion, agreeableness, neuroticism, created_at
             FROM test_history WHERE user_id = $1 ORDER BY test_number DESC LIMIT 10`,
            [userId]
        );
        res.json({ total_tests: parseInt(totalResult.rows[0].total), history: historyResult.rows });
    } catch (error) {
        console.error('Ошибка получения статистики тестов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/user-test-stats/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const totalResult = await pool.query('SELECT COUNT(*) as total FROM test_history WHERE user_id = $1', [userId]);
        const historyResult = await pool.query(
            `SELECT test_number, openness, conscientiousness, extraversion, agreeableness, neuroticism, created_at
             FROM test_history WHERE user_id = $1 ORDER BY test_number DESC LIMIT 10`,
            [userId]
        );
        res.json({ total_tests: parseInt(totalResult.rows[0].total), history: historyResult.rows });
    } catch (error) {
        console.error('Error fetching user test stats:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ==================== КОМНАТЫ ====================
router.post('/create-room', authenticateToken, async (req, res) => {
    try {
        const { name, game_name, max_players = 4 } = req.body;
        const userId = req.user.userId;

        const result = await pool.query(
            `INSERT INTO game_rooms (name, game_name, max_players, created_by, current_players)
             VALUES ($1, $2, $3, $4, 1) RETURNING *`,
            [name, game_name, max_players, userId]
        );

        await pool.query('INSERT INTO room_players (room_id, user_id) VALUES ($1, $2)', [result.rows[0].id, userId]);

        res.json({ success: true, room: result.rows[0] });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Failed to create room' });
    }
});

// ==================== КОМНАТЫ (ОБНОВЛЕННЫЙ МАРШРУТ) ====================
router.get('/rooms', authenticateToken, async (req, res) => {
    try {
        const { game_name } = req.query;
        const currentUserId = req.user.userId; // ID авторизованного пользователя для расчета совместимости

        // Модернизированный SQL-запрос: связываем комнаты с создателем (u) и текущим юзером (cu)
        let query = `
            SELECT 
                gr.*, 
                u.username as creator_name, 
                COUNT(rp.user_id) as current_players,
                -- Вычисляем процент психологической совместимости между текущим юзером и хостом
                CASE 
                    WHEN cu.test_completed = true AND u.test_completed = true THEN
                        ROUND(
                            ((45 - (
                                ABS(cu.openness - u.openness) +
                                ABS(cu.conscientiousness - u.conscientiousness) +
                                ABS(cu.extraversion - u.extraversion) +
                                ABS(cu.agreeableness - u.agreeableness) +
                                ABS(cu.neuroticism - u.neuroticism)
                            )) / 45.0) * 100
                        )
                    ELSE NULL 
                END AS compatibility_percent
            FROM game_rooms gr
            JOIN users u ON gr.created_by = u.id
            JOIN users cu ON cu.id = $1
            LEFT JOIN room_players rp ON gr.id = rp.room_id
            WHERE gr.status = 'waiting'
        `;

        let params = [currentUserId];
        let paramIndex = 2;

        if (game_name) {
            query += ` AND gr.game_name = $${paramIndex}`;
            params.push(game_name);
        }

        // Группируем по правильным полям, включая данные тестов и пользователей
        query += ` 
            GROUP BY gr.id, u.username, u.openness, u.conscientiousness, u.extraversion, u.agreeableness, u.neuroticism, cu.test_completed, cu.openness, cu.conscientiousness, cu.extraversion, cu.agreeableness, cu.neuroticism, u.test_completed
            ORDER BY gr.created_at DESC
        `;

        const result = await pool.query(query, params);
        res.json(result.rows);

    } catch (error) {
        console.error('Error fetching rooms with compatibility:', error);
        res.status(500).json({ error: 'Failed to fetch rooms' });
    }
});

router.post('/join-room/:roomId', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;

        const roomResult = await pool.query(
            `SELECT max_players, current_players FROM game_rooms WHERE id = $1 AND status = 'waiting'`,
            [roomId]
        );
        if (roomResult.rows.length === 0) return res.status(404).json({ error: 'Room not found' });

        const room = roomResult.rows[0];
        if (room.current_players >= room.max_players) return res.status(400).json({ error: 'Room is full' });

        await pool.query('INSERT INTO room_players (room_id, user_id) VALUES ($1, $2)', [roomId, userId]);
        await pool.query('UPDATE game_rooms SET current_players = current_players + 1 WHERE id = $1', [roomId]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error joining room:', error);
        res.status(500).json({ error: 'Failed to join room' });
    }
});

router.get('/my-rooms', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(`
            SELECT gr.*, u.username as creator_name, COUNT(rp.user_id) as current_players,
                   EXISTS(SELECT 1 FROM room_players WHERE room_id = gr.id AND user_id = $1) as is_member
            FROM game_rooms gr
            JOIN users u ON gr.created_by = u.id
            LEFT JOIN room_players rp ON gr.id = rp.room_id
            WHERE gr.id IN (SELECT room_id FROM room_players WHERE user_id = $1)
            GROUP BY gr.id, u.username ORDER BY gr.created_at DESC
        `, [userId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching my rooms:', error);
        res.status(500).json({ error: 'Ошибка загрузки ваших комнат' });
    }
});

router.post('/leave-room/:roomId', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;

        const memberCheck = await pool.query('SELECT * FROM room_players WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
        if (memberCheck.rows.length === 0) return res.status(400).json({ error: 'Вы не состоите в этой комнате' });

        await pool.query('DELETE FROM room_players WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
        await pool.query('UPDATE game_rooms SET current_players = current_players - 1 WHERE id = $1', [roomId]);

        const playersCheck = await pool.query('SELECT COUNT(*) FROM room_players WHERE room_id = $1', [roomId]);
        if (parseInt(playersCheck.rows[0].count) === 0) {
            await pool.query('DELETE FROM room_messages WHERE room_id = $1', [roomId]);
            await pool.query('DELETE FROM game_rooms WHERE id = $1', [roomId]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error leaving room:', error);
        res.status(500).json({ error: 'Ошибка выхода из комнаты' });
    }
});

router.delete('/my-rooms/:roomId', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.userId;

        const roomResult = await pool.query('SELECT created_by FROM game_rooms WHERE id = $1', [roomId]);
        if (roomResult.rows.length === 0) return res.status(404).json({ error: 'Комната не найдена' });
        if (roomResult.rows[0].created_by !== userId) return res.status(403).json({ error: 'Вы можете удалять только свои комнаты' });

        await pool.query('DELETE FROM room_messages WHERE room_id = $1', [roomId]);
        await pool.query('DELETE FROM room_players WHERE room_id = $1', [roomId]);
        await pool.query('DELETE FROM game_rooms WHERE id = $1', [roomId]);

        res.json({ message: 'Комната успешно удалена' });
    } catch (error) {
        console.error('Error deleting room:', error);
        res.status(500).json({ error: 'Ошибка удаления комнаты' });
    }
});

router.get('/room-players/:roomId', authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const result = await pool.query(`
            SELECT u.id, u.username, u.avatar_url, u.test_completed,
                   u.openness, u.conscientiousness, u.extraversion, u.agreeableness, u.neuroticism,
                   CASE WHEN gr.created_by = u.id THEN true ELSE false END as is_creator
            FROM room_players rp
            JOIN users u ON rp.user_id = u.id
            JOIN game_rooms gr ON rp.room_id = gr.id
            WHERE rp.room_id = $1
            ORDER BY CASE WHEN gr.created_by = u.id THEN 0 ELSE 1 END, rp.joined_at ASC
        `, [roomId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching room players:', error);
        res.status(500).json({ error: 'Ошибка загрузки участников' });
    }
});

// ==================== ИГРЫ ПОЛЬЗОВАТЕЛЕЙ ====================
router.post('/save-games', authenticateToken, async (req, res) => {
    try {
        const { games } = req.body;
        const userId = req.user.userId;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM user_games WHERE user_id = $1', [userId]);
            for (const gameName of games) {
                await client.query('INSERT INTO user_games (user_id, game_name) VALUES ($1, $2)', [userId, gameName]);
            }
            await client.query('COMMIT');
            res.json({ success: true, count: games.length });
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

router.get('/saved-games', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT game_name FROM user_games WHERE user_id = $1 ORDER BY created_at DESC', [req.user.userId]);
        res.json({ games: result.rows.map(row => row.game_name) });
    } catch (error) {
        console.error('Ошибка загрузки игр:', error);
        res.status(500).json({ error: 'Ошибка сервера при загрузке игр' });
    }
});

router.get('/all-games', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT game_name FROM user_games ORDER BY game_name');
        res.json(result.rows.map(row => row.game_name));
    } catch (error) {
        console.error('Error fetching all games:', error);
        res.status(500).json({ error: 'Ошибка загрузки игр' });
    }
});

// ==================== ПОИСК ПОЛЬЗОВАТЕЛЕЙ ====================
router.get('/search', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const { game, minCompatibility = 0 } = req.query;

        const currentUserResult = await pool.query(
            `SELECT openness, conscientiousness, extraversion, agreeableness, neuroticism FROM users WHERE id = $1`,
            [currentUserId]
        );
        const currentUser = currentUserResult.rows[0];

        let usersQuery = `
            SELECT u.id, u.username, u.avatar_url, u.test_completed,
                   u.openness, u.conscientiousness, u.extraversion, u.agreeableness, u.neuroticism,
                   ARRAY_AGG(ug.game_name) FILTER (WHERE ug.game_name IS NOT NULL) as games
            FROM users u
            LEFT JOIN user_games ug ON u.id = ug.user_id
            WHERE u.id != $1
        `;
        const queryParams = [currentUserId];
        let paramIndex = 2;

        if (game && game !== '') {
            usersQuery += ` AND EXISTS (SELECT 1 FROM user_games ug2 WHERE ug2.user_id = u.id AND ug2.game_name = $${paramIndex})`;
            queryParams.push(game);
            paramIndex++;
        }

        usersQuery += ` GROUP BY u.id ORDER BY u.last_login DESC NULLS LAST`;

        const result = await pool.query(usersQuery, queryParams);

        const users = result.rows.map(user => {
            let compatibility = 0;
            if (currentUser && user.test_completed && currentUser.openness !== null && user.openness !== null) {
                const traits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
                let totalDiff = 0;
                for (const trait of traits) {
                    totalDiff += Math.abs((currentUser[trait] || 5) - (user[trait] || 5));
                }
                compatibility = Math.max(0, Math.min(100, Math.round((1 - totalDiff / 50) * 100)));
            }
            return {
                id: user.id, username: user.username, avatar_url: user.avatar_url,
                test_completed: user.test_completed, compatibility, games: user.games || []
            };
        });

        const filteredUsers = users.filter(user => user.compatibility >= parseInt(minCompatibility));
        filteredUsers.sort((a, b) => b.compatibility - a.compatibility);
        res.json(filteredUsers);
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: 'Ошибка поиска пользователей' });
    }
});

router.get('/calculate-compatibility/:userId', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const { userId } = req.params;

        const currentUserResult = await pool.query(
            `SELECT openness, conscientiousness, extraversion, agreeableness, neuroticism FROM users WHERE id = $1`,
            [currentUserId]
        );
        const otherUserResult = await pool.query(
            `SELECT openness, conscientiousness, extraversion, agreeableness, neuroticism FROM users WHERE id = $1`,
            [userId]
        );

        if (currentUserResult.rows.length === 0 || otherUserResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const current = currentUserResult.rows[0];
        const other = otherUserResult.rows[0];

        if (!current.openness || !other.openness) {
            return res.status(400).json({ error: 'Один из пользователей не прошел тест' });
        }

        const traits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
        let totalDiff = 0;
        for (const trait of traits) {
            totalDiff += Math.abs(current[trait] - other[trait]);
        }

        const compatibility = Math.max(0, Math.min(100, Math.round((1 - totalDiff / 50) * 100)));
        res.json({ compatibility });
    } catch (error) {
        console.error('Error calculating compatibility:', error);
        res.status(500).json({ error: 'Ошибка расчета совместимости' });
    }
});

// ==================== АВАТАРЫ ====================
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Папка uploads создана:', uploadsDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        cb(null, 'avatar-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Только изображения разрешены!'), false);
    }
});

router.post('/upload-avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
        const avatarUrl = '/uploads/' + req.file.filename;
        await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.user.userId]);
        res.json({ success: true, avatarUrl });
    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        res.status(500).json({ error: 'Ошибка сервера при загрузке аватара' });
    }
});

// ==================== ЛИЧНЫЕ СООБЩЕНИЯ ====================
router.get('/dialogs', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(`
            SELECT DISTINCT u.id as user_id, u.username, u.avatar_url, u.last_login,
                   (SELECT COUNT(*) FROM private_messages WHERE from_user_id = u.id AND to_user_id = $1 AND is_read = false) as unread_count,
                   (SELECT message FROM private_messages WHERE (from_user_id = $1 AND to_user_id = u.id) OR (from_user_id = u.id AND to_user_id = $1) ORDER BY created_at DESC LIMIT 1) as last_message
            FROM users u
            INNER JOIN private_messages pm ON (pm.from_user_id = u.id AND pm.to_user_id = $1) OR (pm.to_user_id = u.id AND pm.from_user_id = $1)
            WHERE u.id != $1
            GROUP BY u.id, u.username, u.avatar_url, u.last_login
            ORDER BY MAX(pm.created_at) DESC
        `, [userId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching dialogs:', error);
        res.json([]);
    }
});

router.get('/messages/:userId', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const { userId } = req.params;

        await pool.query(`UPDATE private_messages SET is_read = true WHERE from_user_id = $1 AND to_user_id = $2`, [userId, currentUserId]);

        const result = await pool.query(`
            SELECT pm.*, u_from.username as from_username, u_to.username as to_username
            FROM private_messages pm
            JOIN users u_from ON pm.from_user_id = u_from.id
            JOIN users u_to ON pm.to_user_id = u_to.id
            WHERE (pm.from_user_id = $1 AND pm.to_user_id = $2) OR (pm.from_user_id = $2 AND pm.to_user_id = $1)
            ORDER BY pm.created_at ASC LIMIT 100
        `, [currentUserId, userId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Ошибка загрузки сообщений' });
    }
});

router.post('/send-message', authenticateToken, async (req, res) => {
    try {
        const fromUserId = req.user.userId;
        const { toUserId, message } = req.body;

        if (!toUserId || !message || message.trim() === '') {
            return res.status(400).json({ error: 'Неверные данные' });
        }

        const result = await pool.query(
            `INSERT INTO private_messages (from_user_id, to_user_id, message) VALUES ($1, $2, $3) RETURNING id, created_at`,
            [fromUserId, toUserId, message.trim()]
        );

        res.json({ success: true, messageId: result.rows[0].id });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Ошибка отправки сообщения' });
    }
});

// ==================== МЕДИАФАЙЛЫ ДЛЯ ЧАТА ====================
const chatUploadsDir = path.join(__dirname, '../public/uploads/chat');
if (!fs.existsSync(chatUploadsDir)) {
    fs.mkdirSync(chatUploadsDir, { recursive: true });
}

const chatStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, chatUploadsDir),
    filename: (req, file, cb) => {
        cb(null, 'chat-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const chatUpload = multer({
    storage: chatStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'audio/webm', 'audio/mp3', 'audio/mpeg'];
        allowedTypes.includes(file.mimetype) ? cb(null, true) : cb(new Error('Неподдерживаемый тип файла'), false);
    }
});

router.post('/upload-chat-media', authenticateToken, chatUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
        const fileUrl = '/uploads/chat/' + req.file.filename;
        const fileType = req.file.mimetype.startsWith('audio') ? 'audio' : 'image';
        res.json({ success: true, fileUrl, fileType, fileName: req.file.originalname });
    } catch (error) {
        console.error('Error uploading chat media:', error);
        res.status(500).json({ error: 'Ошибка загрузки файла' });
    }
});

// ==================== ОБНОВЛЕНИЕ АКТИВНОСТИ ====================
router.post('/update-activity', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [req.user.userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating activity:', error);
        res.status(500).json({ error: 'Ошибка обновления активности' });
    }
});


// ==================== АДМИНСКИЙ ЭКСПОРТ ДАННЫХ ====================

// Получить все данные из указанной таблицы
router.get('/admin/table-data/:tableName', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { tableName } = req.params;
        const { limit = 100, offset = 0, search = '' } = req.query;

        // Разрешенные таблицы (безопасность)
        const allowedTables = ['users', 'game_rooms', 'room_messages', 'private_messages', 'user_games', 'test_history'];

        if (!allowedTables.includes(tableName)) {
            return res.status(403).json({ error: 'Доступ к этой таблице запрещен' });
        }

        let query = `SELECT * FROM ${tableName}`;
        let params = [];

        // Поиск по тексту (если есть)
        if (search && tableName === 'users') {
            query += ` WHERE username ILIKE $1 OR email ILIKE $1`;
            params.push(`%${search}%`);
        } else if (search && tableName === 'game_rooms') {
            query += ` WHERE name ILIKE $1 OR game_name ILIKE $1`;
            params.push(`%${search}%`);
        }

        // Получаем общее количество
        const countQuery = `SELECT COUNT(*) FROM (${query}) as sub`;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Пагинация
        query += ` ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);

        // Получаем названия колонок
        const columns = result.rows.length > 0 ? Object.keys(result.rows[0]) : [];

        res.json({
            success: true,
            tableName,
            columns,
            data: result.rows,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: (parseInt(offset) + parseInt(limit)) < total
            }
        });

    } catch (error) {
        console.error('Error fetching table data:', error);
        res.status(500).json({ error: 'Ошибка загрузки данных' });
    }
});

// Экспорт таблицы в CSV
router.get('/admin/export/:tableName', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { tableName } = req.params;

        const allowedTables = ['users', 'game_rooms', 'room_messages', 'private_messages', 'user_games', 'test_history'];

        if (!allowedTables.includes(tableName)) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY id DESC`);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Нет данных для экспорта' });
        }

        // Формируем CSV
        const columns = Object.keys(result.rows[0]);
        let csv = columns.join(',') + '\n';

        result.rows.forEach(row => {
            const values = columns.map(col => {
                let val = row[col];
                if (val === null) return '';
                if (typeof val === 'object') val = JSON.stringify(val);
                if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            });
            csv += values.join(',') + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${tableName}_${Date.now()}.csv`);
        res.send(csv);

    } catch (error) {
        console.error('Error exporting table:', error);
        res.status(500).json({ error: 'Ошибка экспорта данных' });
    }
});

// Получить статистику по всем таблицам
router.get('/admin/db-stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const tables = ['users', 'game_rooms', 'room_messages', 'private_messages', 'user_games', 'test_history'];
        const stats = {};

        for (const table of tables) {
            const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
            stats[table] = parseInt(result.rows[0].count);
        }

        // Дополнительная статистика
        const activeUsers = await pool.query("SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '7 days'");
        stats.active_users_7days = parseInt(activeUsers.rows[0].count);

        const messagesToday = await pool.query("SELECT COUNT(*) FROM room_messages WHERE created_at::date = CURRENT_DATE");
        stats.messages_today = parseInt(messagesToday.rows[0].count);

        res.json(stats);

    } catch (error) {
        console.error('Error fetching db stats:', error);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});


module.exports = router;