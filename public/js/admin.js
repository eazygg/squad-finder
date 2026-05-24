// public/js/admin.js
class AdminPanel {
    constructor() {
        if (!this.checkAuth()) return;

        this.currentUser = null;
        this.init();
    }

    checkAuth() {
        const token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');

        if (!token || !userStr) {
            dialog.alert('Требуется авторизация');
            window.location.href = '/';
            return false;
        }

        this.currentUser = JSON.parse(userStr);

        if (this.currentUser.role !== 'admin') {
            dialog.alert('Доступ запрещен. Требуются права администратора.');
            window.location.href = '/profile.html';
            return false;
        }

        return true;
    }

    async init() {
        await this.loadStats();
        await this.loadUsers();
        await this.loadRooms();
        this.bindEvents();
    }

    async loadStats() {
        try {
            const response = await fetch('/api/profile/admin/stats', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const stats = await response.json();
                this.displayStats(stats);
            } else {
                throw new Error('Ошибка загрузки статистики');
            }
        } catch (error) {
            console.error('Error loading stats:', error);
            document.getElementById('statsContainer').innerHTML = '<div class="error">❌ Ошибка загрузки статистики</div>';
        }
    }

    displayStats(stats) {
        const statsHtml = `
            <div class="stat-card">
                <div class="stat-number">${stats.total_users || 0}</div>
                <div><i class="fas fa-users"></i> Всего пользователей</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.tested_users || 0}</div>
                <div><i class="fas fa-brain"></i> Прошли тест</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.total_rooms || 0}</div>
                <div><i class="fas fa-door-open"></i> Всего комнат</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.active_rooms || 0}</div>
                <div><i class="fas fa-gamepad"></i> Активных комнат</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.messages_today || 0}</div>
                <div><i class="fas fa-comment"></i> Сообщений сегодня</div>
            </div>
        `;

        document.getElementById('statsContainer').innerHTML = statsHtml;
    }

    async loadUsers() {
        try {
            const response = await fetch('/api/profile/admin/users', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const users = await response.json();
                this.displayUsers(users);
            } else {
                throw new Error('Ошибка загрузки пользователей');
            }
        } catch (error) {
            console.error('Error loading users:', error);
            document.getElementById('usersContainer').innerHTML = '<div class="error">❌ Ошибка загрузки пользователей</div>';
        }
    }

    displayUsers(users) {
        if (users.length === 0) {
            document.getElementById('usersContainer').innerHTML = '<div class="no-data">📭 Пользователи не найдены</div>';
            return;
        }

        const usersHtml = users.map(user => `
            <div class="user-row">
                <div class="user-info">
                    <strong>${this.escapeHtml(user.username)}</strong><br>
                    <small>${this.escapeHtml(user.email)}</small><br>
                    <small><i class="far fa-calendar-alt"></i> Зарегистрирован: ${new Date(user.created_at).toLocaleDateString('ru-RU')}</small>
                </div>
                <div class="user-details">
                    <span class="role-badge role-${user.role}">${user.role === 'admin' ? '👑 Админ' : '👤 Пользователь'}</span><br>
                    ${user.test_completed ? '✅ Тест пройден' : '❌ Тест не пройден'}
                </div>
                <div class="action-buttons">
                    <button class="btn btn-danger" onclick="adminPanel.deleteUser(${user.id}, '${this.escapeHtml(user.username)}')">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            </div>
        `).join('');

        document.getElementById('usersContainer').innerHTML = usersHtml;
    }

    async loadRooms() {
        try {
            const response = await fetch('/api/profile/admin/rooms', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const rooms = await response.json();
                this.displayRooms(rooms);
            } else {
                throw new Error('Ошибка загрузки комнат');
            }
        } catch (error) {
            console.error('Error loading rooms:', error);
            document.getElementById('roomsContainer').innerHTML = '<div class="error">❌ Ошибка загрузки комнат</div>';
        }
    }

    displayRooms(rooms) {
        if (rooms.length === 0) {
            document.getElementById('roomsContainer').innerHTML = '<div class="no-data">📭 Комнаты не найдены</div>';
            return;
        }

        const roomsHtml = rooms.map(room => `
            <div class="room-row">
                <div class="room-info">
                    <strong>"${this.escapeHtml(room.name)}"</strong><br>
                    <small><i class="fas fa-gamepad"></i> Игра: ${this.escapeHtml(room.game_name)}</small><br>
                    <small><i class="fas fa-user"></i> Создатель: ${this.escapeHtml(room.creator_name)}</small>
                </div>
                <div class="room-details">
                    <i class="fas fa-users"></i> ${room.player_count}/${room.max_players}<br>
                    ${room.status === 'waiting' ? '<span style="color: #4CAF50;">⏳ Ожидание</span>' : '<span style="color: #ff9800;">🎮 В игре</span>'}
                </div>
                <div class="action-buttons">
                    <button class="btn btn-danger" onclick="adminPanel.deleteRoom(${room.id}, '${this.escapeHtml(room.name)}')">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                </div>
            </div>
        `).join('');

        document.getElementById('roomsContainer').innerHTML = roomsHtml;
    }

    async deleteRoom(roomId, roomName) {
        const confirmed = await dialog.confirm(`Вы уверены, что хотите удалить комнату "${roomName}"?`, 'Подтверждение удаления');
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/profile/admin/rooms/${roomId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                dialog.success('Комната успешно удалена', 'Успех');
                await this.loadRooms();
                await this.loadStats();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка удаления комнаты');
            }
        } catch (error) {
            console.error('Error deleting room:', error);
            dialog.error(error.message, 'Ошибка');
        }
    }

    async deleteUser(userId, username) {
        const confirmed = await dialog.confirm(`Вы уверены, что хотите удалить пользователя "${username}"?`, 'Подтверждение удаления');
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/profile/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                dialog.success('Пользователь успешно удален', 'Успех');
                await this.loadUsers();
                await this.loadStats();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка удаления пользователя');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            dialog.error(error.message, 'Ошибка');
        }
    }

    bindEvents() {
        // Навигация уже работает через onclick в HTML
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Вспомогательные функции
function showSection(sectionName) {
    // Скрываем все секции
    document.querySelectorAll('.admin-section').forEach(section => {
        section.style.display = 'none';
    });

    // Показываем выбранную секцию
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.style.display = 'block';
    }
}

// Глобальный экземпляр
let adminPanel;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    adminPanel = new AdminPanel();
});