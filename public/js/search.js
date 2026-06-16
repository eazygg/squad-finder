// public/js/search.js

// Временный менеджер чата (заглушка)
class ChatManager {
    constructor() {
        console.log('ChatManager инициализирован');
    }

    startPrivateChat(userId, username) {
        dialog.info(`Чат с ${username} будет доступен в следующем обновлении!`, 'В разработке');
    }
}

class UserSearch {
    constructor() {
        this.users = [];
        this.currentUser = null;
        this.init();
    }

    async init() {
        if (!this.checkAuth()) return;

        await this.loadCurrentUser();
        await this.loadAllGames();
        this.bindEvents();
        await this.searchUsers();
    }

    checkAuth() {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');

        if (!token || !user) {
            dialog.alert('Требуется авторизация');
            window.location.href = '/';
            return false;
        }

        this.currentUser = JSON.parse(user);
        return true;
    }

    async loadCurrentUser() {
        try {
            const response = await fetch('/api/auth/profile', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                localStorage.setItem('user', JSON.stringify(data.user));
            }
        } catch (error) {
            console.error('Ошибка загрузки профиля:', error);
        }
    }

    async loadAllGames() {
        try {
            const response = await fetch('/api/profile/all-games', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const games = await response.json();
                this.populateGameFilter(games);
            } else {
                // Если эндпоинт не работает, используем заглушку
                console.warn('Using fallback games list');
                this.populateGameFilter([]);
            }
        } catch (error) {
            console.error('Ошибка загрузки игр:', error);
            this.populateGameFilter([]);
        }
    }

    populateGameFilter(games) {
        const filter = document.getElementById('gameFilter');
        if (!filter) return;

        filter.innerHTML = '<option value="">Все игры</option>';
        if (games && games.length > 0) {
            games.forEach(game => {
                const option = document.createElement('option');
                option.value = game;
                option.textContent = game;
                filter.appendChild(option);
            });
        }
    }

    bindEvents() {
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.searchUsers();
            });
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/';
            });
        }

        const gameFilter = document.getElementById('gameFilter');
        const compatibilityFilter = document.getElementById('compatibilityFilter');

        if (gameFilter) {
            gameFilter.addEventListener('change', () => this.searchUsers());
        }
        if (compatibilityFilter) {
            compatibilityFilter.addEventListener('change', () => this.searchUsers());
        }
    }

    async searchUsers() {
        const gameFilter = document.getElementById('gameFilter')?.value || '';
        const compatibilityFilter = document.getElementById('compatibilityFilter')?.value || '0';

        const container = document.getElementById('resultsContainer');
        if (container) {
            container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Поиск пользователей...</div>';
        }

        try {
            let url = `/api/profile/search?minCompatibility=${compatibilityFilter}`;
            if (gameFilter) {
                url += `&game=${encodeURIComponent(gameFilter)}`;
            }

            console.log('Searching users with URL:', url);

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                this.users = await response.json();
                this.displayResults();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка поиска');
            }
        } catch (error) {
            console.error('Ошибка поиска:', error);
            if (container) {
                container.innerHTML = `<div class="error">❌ Ошибка: ${error.message}. Убедитесь, что сервер запущен.</div>`;
            }
            showToast(error.message, 'error');
        }
    }

    displayResults() {
        const container = document.getElementById('resultsContainer');
        if (!container) return;

        if (this.users.length === 0) {
            container.innerHTML = `
            <div class="no-results">
                <i class="fas fa-user-slash"></i>
                <p>Пользователи не найдены</p>
                <small>Попробуйте изменить параметры поиска</small>
            </div>
        `;
            return;
        }

        container.innerHTML = this.users.map(user => {
            const timestamp = new Date().getTime();
            // ✅ ТОЛЬКО ЭТА ЧАСТЬ ИЗМЕНЕНА
            let avatarUrl;
            if (user.avatar_url && user.avatar_url !== 'null' && user.avatar_url !== 'undefined' && user.avatar_url.trim() !== '') {
                avatarUrl = user.avatar_url + '?t=' + timestamp;
            } else {
                avatarUrl = '/uploads/default-avatar.png?t=' + timestamp;
            }

            let compatibilityClass = 'low';
            if (user.compatibility >= 80) compatibilityClass = 'high';
            else if (user.compatibility >= 60) compatibilityClass = 'medium';

            return `
            <div class="user-card">
                <div class="user-header">
                    <img src="${avatarUrl}" alt="${user.username}" class="user-avatar" 
                         onerror="this.src='/uploads/default-avatar.png?t='+Date.now()">
                    <div class="user-info">
                        <h3>${this.escapeHtml(user.username)}</h3>
                        <p>${user.games && user.games.length ? user.games.slice(0, 3).join(', ') : 'Игры не указаны'}</p>
                    </div>
                </div>
                <div class="compatibility-badge ${compatibilityClass}">
                    <i class="fas fa-chart-line"></i> Совместимость: ${user.compatibility || 0}%
                </div>
                <div class="user-games">
                    ${user.games && user.games.length ? user.games.slice(0, 5).map(game =>
                `<span class="game-tag">${this.escapeHtml(game)}</span>`
            ).join('') : '<span class="game-tag">Игры не выбраны</span>'}
                    ${user.games && user.games.length > 5 ? `<span class="game-tag">+${user.games.length - 5}</span>` : ''}
                </div>
                <div class="user-actions">
                    <button class="btn btn-primary btn-sm" onclick="window.userSearch.viewProfile(${user.id})">
                        <i class="fas fa-eye"></i> Профиль
                    </button>
                    ${!user.test_completed ? `
                        <button class="btn btn-secondary btn-sm" disabled title="Пользователь не прошел тест">
                            <i class="fas fa-brain"></i> Тест не пройден
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        }).join('');
    }

    viewProfile(userId) {
        window.open(`/user-profile.html?id=${userId}`, '_blank');
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Глобальный экземпляр - только один!
window.userSearch = null;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    // 2. Убираем const/let перед именем переменной, чтобы записать именно в глобальный объект
    window.userSearch = new UserSearch();
});