// config/database.js
const { Pool } = require('pg');

// Определяем, используем ли мы продакшн (Render) или разработку (localhost)
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/squad_finder_db',
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

// Проверка подключения
pool.on('connect', () => {
    console.log('✅ Connected to database');
});

pool.on('error', (err) => {
    console.error('❌ Database error:', err.message);
});

module.exports = pool;