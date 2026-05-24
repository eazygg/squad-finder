// routes/voice.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { AccessToken } = require('livekit-server-sdk');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Недействительный токен' });
    }
};

router.post('/livekit-token', authenticateToken, async (req, res) => {
    try {
        const { roomName, userName } = req.body;
        const userId = req.user.userId.toString();

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const wsUrl = process.env.LIVEKIT_URL || 'wss://squadfinder-2kn7agll.livekit.cloud';

        console.log('Creating token for:', { roomName, userName, userId });
        console.log('Using apiKey:', apiKey ? apiKey.substring(0, 10) + '...' : 'missing');

        if (!apiKey || !apiSecret) {
            console.error('Missing LiveKit credentials');
            return res.status(500).json({ error: 'LiveKit не настроен' });
        }

        // Правильное создание токена
        const at = new AccessToken(apiKey, apiSecret, {
            identity: userId,
            name: userName,
            ttl: 3600
        });

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true
        });

        const token = at.toJwt();
        console.log('Token created, length:', token.length);

        // Отправляем токен как строку
        res.json({
            token: token,
            wsUrl: wsUrl
        });

    } catch (error) {
        console.error('Error creating LiveKit token:', error);
        res.status(500).json({ error: 'Ошибка создания токена: ' + error.message });
    }
});

module.exports = router;