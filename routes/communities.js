// routes/communities.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware для авторизации (такой же, как в auth.js и profile.js)
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

// GET /api/communities/rooms — Получение списка всех комнат с процентом совместимости
router.get('/rooms', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId; // ID того, кто делает запрос и ищет комнаты

        // Магический SQL-запрос
        const query = `
            SELECT 
                gr.*,
                u.username AS creator_username,
                u.avatar_url AS creator_avatar,
                u.test_completed AS creator_test_completed,
                -- Вычисляем процент совместимости на основе 5 психологических шкал
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
            JOIN users u ON gr.creator_id = u.id   -- Связываем комнату с хостом (создателем)
            JOIN users cu ON cu.id = $1            -- Подтягиваем данные и тест текущего юзера
            ORDER BY gr.created_at DESC;
        `;

        const result = await pool.query(query, [currentUserId]);

        res.json({
            success: true,
            rooms: result.rows
        });

    } catch (error) {
        console.error('Ошибка в GET /rooms с расчетом совместимости:', error);
        res.status(500).json({ error: 'Ошибка сервера при получении списка комнат' });
    }
});

module.exports = router;