const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const router = express.Router();

// Секретный ключ для JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Регистрация пользователя
router.post('/register', async (req, res) => {
    try {
        const { email, username, password, confirmPassword } = req.body;

        // Валидация
        if (!email || !username || !password || !confirmPassword) {
            return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Пароли не совпадают' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
        }

        // Проверяем, существует ли пользователь
        const userExists = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }

        // Хешируем пароль
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Сохраняем пользователя в базу
        const result = await pool.query(
            `INSERT INTO users (email, username, password_hash)
             VALUES ($1, $2, $3)
                 RETURNING id, email, username, role, created_at`, // ← ДОБАВИЛИ role
            [email, username, passwordHash]
        );

        const user = result.rows[0];

        // Создаем JWT токен
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Пользователь успешно зарегистрирован',
            token: token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role // ← ДОБАВИЛИ РОЛЬ
            }
        });

    } catch (error) {
        console.error('Ошибка при регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера при регистрации' });
    }
});

// Вход пользователя
// Вход пользователя
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Валидация
        if (!email || !password) {
            return res.status(400).json({ error: 'Email и пароль обязательны' });
        }

        // Ищем пользователя в базе
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const user = result.rows[0];

        // Проверяем пароль
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // ✅ ОБНОВЛЯЕМ ВРЕМЯ ПОСЛЕДНЕГО ВХОДА
        await pool.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // Создаем JWT токен
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Получаем обновленного пользователя с last_login
        const updatedUser = await pool.query(
            'SELECT id, email, username, test_completed, avatar_url, role, last_login, created_at FROM users WHERE id = $1',
            [user.id]
        );

        res.json({
            message: 'Вход выполнен успешно',
            token: token,
            user: updatedUser.rows[0]
        });

    } catch (error) {
        console.error('Ошибка при входе:', error);
        res.status(500).json({ error: 'Ошибка сервера при входе' });
    }
});

// Проверка токена (для защищенных маршрутов)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Токен доступа отсутствует' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Недействительный токен' });
        }
        req.user = user;
        next();
    });
};

// Получить полные данные профиля пользователя с аватаром
// Получить полные данные профиля пользователя
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, email, username, avatar_url, test_completed,
                    openness, conscientiousness, extraversion,
                    agreeableness, neuroticism, role, created_at, last_login
             FROM users WHERE id = $1`,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = result.rows[0];
        res.json({
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                test_completed: user.test_completed,
                avatar_url: user.avatar_url,
                role: user.role,
                last_login: user.last_login,
                created_at: user.created_at
            }
        });

    } catch (error) {
        console.error('Ошибка при получении профиля:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
module.exports = router;