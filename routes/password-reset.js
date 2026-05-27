// routes/password-reset.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/database');

// 1. Запрос на сброс пароля (показываем ссылку)
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await pool.query('SELECT id, username FROM users WHERE email = $1', [email]);

        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь с таким email не найден' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 3600000);

        await pool.query(
            'UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3',
            [resetToken, resetExpires, user.rows[0].id]
        );

        // ✅ ИСПРАВЛЕНО: используем FRONTEND_URL
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
        const resetUrl = `${frontendUrl}/reset-password.html?token=${resetToken}`;

        res.json({
            message: `✅ Ссылка для сброса пароля создана!\nСсылка: ${resetUrl}\nСсылка действительна 1 час.`,
            resetUrl: resetUrl
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
// 2. Проверка токена
router.post('/verify-reset-token', async (req, res) => {
    try {
        const { token } = req.body;

        const user = await pool.query(
            'SELECT id FROM users WHERE reset_token = $1 AND reset_expires > NOW()',
            [token]
        );

        if (user.rows.length === 0) {
            return res.status(400).json({ error: 'Недействительная или просроченная ссылка' });
        }

        res.json({ valid: true });

    } catch (error) {
        console.error('Verify token error:', error);
        res.status(500).json({ error: 'Ошибка проверки токена' });
    }
});

// 3. Установка нового пароля
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
        }

        const user = await pool.query(
            'SELECT id FROM users WHERE reset_token = $1 AND reset_expires > NOW()',
            [token]
        );

        if (user.rows.length === 0) {
            return res.status(400).json({ error: 'Недействительная или просроченная ссылка' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query(
            'UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires = NULL WHERE id = $2',
            [hashedPassword, user.rows[0].id]
        );

        res.json({ message: 'Пароль успешно изменен! Теперь вы можете войти' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Ошибка сброса пароля' });
    }
});

module.exports = router;