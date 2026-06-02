// public/js/admin.js
class AdminPanel {
    constructor() {
        if (!this.checkAuth()) return;

        this.currentUser = null;
        this.currentOffset = 0;
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
        await this.loadDbStats();
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

    // ==================== ДОБАВЛЕННЫЕ МЕТОДЫ ДЛЯ БАЗЫ ДАННЫХ ====================

    async loadDbStats() {
        try {
            const response = await fetch('/api/profile/admin/db-stats', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const stats = await response.json();
                this.displayDbStats(stats);
            }
        } catch (error) {
            console.error('Error loading db stats:', error);
        }
    }

    displayDbStats(stats) {
        const statsContainer = document.getElementById('dbStatsContainer');
        if (!statsContainer) return;

        statsContainer.innerHTML = `
            <div class="db-stats-grid">
                <div class="db-stat-card">
                    <div class="db-stat-number">${stats.users || 0}</div>
                    <div>Пользователей</div>
                </div>
                <div class="db-stat-card">
                    <div class="db-stat-number">${stats.game_rooms || 0}</div>
                    <div>Игровых комнат</div>
                </div>
                <div class="db-stat-card">
                    <div class="db-stat-number">${stats.room_messages || 0}</div>
                    <div>Сообщений в чатах</div>
                </div>
                <div class="db-stat-card">
                    <div class="db-stat-number">${stats.private_messages || 0}</div>
                    <div>Личных сообщений</div>
                </div>
                <div class="db-stat-card">
                    <div class="db-stat-number">${stats.active_users_7days || 0}</div>
                    <div>Активных за 7 дней</div>
                </div>
                <div class="db-stat-card">
                    <div class="db-stat-number">${stats.messages_today || 0}</div>
                    <div>Сообщений сегодня</div>
                </div>
            </div>
        `;
    }

    async loadTableData() {
        const tableName = document.getElementById('tableSelect')?.value || 'users';
        const search = document.getElementById('tableSearch')?.value || '';
        const limit = 50;
        const offset = this.currentOffset || 0;

        try {
            let url = `/api/profile/admin/table-data/${tableName}?limit=${limit}&offset=${offset}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayTableData(data);
                this.updatePagination(data.pagination);

                document.getElementById('rowCount').innerHTML =
                    `<i class="fas fa-database"></i> Всего записей: ${data.pagination.total}`;
            }
        } catch (error) {
            console.error('Error loading table data:', error);
            document.getElementById('dataTable').innerHTML = '<div class="error">❌ Ошибка загрузки данных</div>';
        }
    }


    formatDateForDisplay(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).replace(',', '');
    }

    displayTableData(data) {
        const container = document.getElementById('dataTable');
        if (!container) return;

        if (!data.data || data.data.length === 0) {
            container.innerHTML = `
            <thead><tr><th>Нет данных</th></tr></thead>
            <tbody><tr><td>В таблице нет записей</td></tr></tbody>
        `;
            return;
        }

        const columns = data.columns;

        const thead = `<thead><tr>${columns.map(col =>
            `<th>${this.getColumnName(col)}</th>`
        ).join('')}</tr></thead>`;

        const tbody = `<tbody>${data.data.map(row => `
        <tr>
            ${columns.map(col => {
            let value = row[col];
            // Форматируем даты
            if (col.includes('_at') && value) {
                value = this.formatDateForDisplay(value);
            }
            // Форматируем null
            if (value === null || value === undefined) value = '-';
            // Булевы значения
            if (typeof value === 'boolean') value = value ? 'Да' : 'Нет';

            return `<td title="${this.escapeHtml(String(value))}">
                    ${this.truncateText(value)}
                </td>`;
        }).join('')}
        </tr>
    `).join('')}</tbody>`;

        container.innerHTML = thead + tbody;
    }

    getColumnName(col) {
        const names = {
            id: 'ID',
            email: 'Email',
            username: 'Имя пользователя',
            created_at: 'Создан',
            last_login: 'Последний вход',
            test_completed: 'Тест пройден',
            game_name: 'Игра',
            name: 'Название комнаты',
            message_text: 'Сообщение',
            from_user_id: 'От кого',
            to_user_id: 'Кому',
            is_read: 'Прочитано',
            question_text: 'Вопрос',
            trait: 'Черта личности',
            score: 'Балл',
            avatar_url: 'Аватар',
            status: 'Статус',
            max_players: 'Макс. игроков',
            current_players: 'Текущих игроков'
        };
        return names[col] || col;
    }

    truncateText(value) {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') return JSON.stringify(value).substring(0, 50);
        const str = String(value);
        return str.length > 50 ? str.substring(0, 47) + '...' : str;
    }

    updatePagination(pagination) {
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        const pageInfo = document.getElementById('pageInfo');

        const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
        const totalPages = Math.ceil(pagination.total / pagination.limit);

        pageInfo.textContent = `Страница ${currentPage} из ${totalPages || 1}`;

        if (prevBtn) prevBtn.disabled = currentPage <= 1;
        if (nextBtn) nextBtn.disabled = !pagination.hasMore;
    }

    async exportTable() {
        const tableName = document.getElementById('tableSelect')?.value || 'users';

        try {
            const response = await fetch(`/api/profile/admin/export/${tableName}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${tableName}_${Date.now()}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                showToast('Экспорт завершен', 'success');
            }
        } catch (error) {
            console.error('Error exporting:', error);
            showToast('Ошибка экспорта', 'error');
        }
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
        const tableSelect = document.getElementById('tableSelect');
        const tableSearch = document.getElementById('tableSearch');
        const refreshBtn = document.getElementById('refreshTableBtn');
        const exportBtn = document.getElementById('exportBtn');
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');

        if (tableSelect) {
            tableSelect.addEventListener('change', () => {
                this.currentOffset = 0;
                this.loadTableData();
            });
        }

        if (tableSearch) {
            let timeout;
            tableSearch.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.currentOffset = 0;
                    this.loadTableData();
                }, 500);
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadTableData());
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportTable());
        }

        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => {
                this.currentOffset = Math.max(0, (this.currentOffset || 0) - 50);
                this.loadTableData();
            });
        }

        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => {
                this.currentOffset = (this.currentOffset || 0) + 50;
                this.loadTableData();
            });
        }
    }


    async exportJson() {
        const tableName = document.getElementById('tableSelect')?.value || 'users';

        try {
            const response = await fetch(`/api/profile/admin/export-json/${tableName}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${tableName}_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                showToast('Экспорт JSON завершен', 'success');
            }
        } catch (error) {
            console.error('Error exporting JSON:', error);
            showToast('Ошибка экспорта', 'error');
        }
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
    document.querySelectorAll('.admin-section').forEach(section => {
        section.style.display = 'none';
    });

    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.style.display = 'block';
    }
}

// Глобальный экземпляр
let adminPanel;

document.addEventListener('DOMContentLoaded', () => {
    adminPanel = new AdminPanel();
});