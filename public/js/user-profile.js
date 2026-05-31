// public/js/user-profile.js
class UserProfileViewer {
    constructor() {
        this.userId = this.getUserIdFromURL();
        this.currentUser = null;
        if (!this.userId) {
            this.showError('ID пользователя не указан');
            return;
        }
        this.init();
    }

    getUserIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    async init() {
        if (!this.checkAuthentication()) return;
        await this.loadCurrentUser();
        await this.loadUserProfile();
        await this.loadUserTestHistory();
        this.bindEvents();
    }

    checkAuthentication() {
        const token = localStorage.getItem('token');
        if (!token) {
            dialog.alert('Требуется авторизация');
            setTimeout(() => window.location.href = '/', 2000);
            return false;
        }
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
            }
        } catch (error) {
            console.error('Error loading current user:', error);
        }
    }

    async loadUserProfile() {
        try {
            const response = await fetch(`/api/profile/full-user-info/${this.userId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const userData = await response.json();
                this.userData = userData;
                this.displayUserProfile(userData);
            } else {
                this.showError('Пользователь не найден');
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
            this.showError('Ошибка загрузки профиля');
        }
    }

    async loadUserTestHistory() {
        try {
            const response = await fetch(`/api/profile/user-test-stats/${this.userId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayTestHistory(data);
            }
        } catch (error) {
            console.error('Error loading test history:', error);
        }
    }

    displayTestHistory(data) {
        const historyContainer = document.getElementById('userTestHistory');
        if (!historyContainer) return;

        if (data.total_tests > 0) {
            historyContainer.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <span class="total-tests-badge">
                        <i class="fas fa-chart-line"></i> Всего тестов: ${data.total_tests}
                    </span>
                </div>
                ${data.history.map(test => `
                    <div class="test-history-item">
                        <div class="test-history-header">
                            <span class="test-number">Тест #${test.test_number}</span>
                            <span class="test-date">${new Date(test.created_at).toLocaleDateString('ru-RU')} ${new Date(test.created_at).toLocaleTimeString('ru-RU')}</span>
                        </div>
                        <div class="test-scores">
                            <div class="test-score-item">
                                <span class="test-score-label">Открытость:</span>
                                <span class="test-score-value">${test.openness}/10</span>
                            </div>
                            <div class="test-score-item">
                                <span class="test-score-label">Добросовестность:</span>
                                <span class="test-score-value">${test.conscientiousness}/10</span>
                            </div>
                            <div class="test-score-item">
                                <span class="test-score-label">Экстраверсия:</span>
                                <span class="test-score-value">${test.extraversion}/10</span>
                            </div>
                            <div class="test-score-item">
                                <span class="test-score-label">Доброжелательность:</span>
                                <span class="test-score-value">${test.agreeableness}/10</span>
                            </div>
                            <div class="test-score-item">
                                <span class="test-score-label">Нейротизм:</span>
                                <span class="test-score-value">${test.neuroticism}/10</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            `;
        } else {
            historyContainer.innerHTML = '<div class="no-history">📊 Пользователь еще не проходил тест</div>';
        }
    }

    displayUserProfile(userData) {
        const container = document.getElementById('otherUserProfileContainer');

        container.innerHTML = `
            <!-- Основная информация -->
            <div class="profile-card">
                <div class="profile-info">
                    <div class="avatar-section">
    <div class="avatar-container">
        ${userData.avatar_url ?
            `<img src="${userData.avatar_url}" 
                  class="avatar-image" 
                  alt="${userData.username}" 
                  onerror="this.onerror=null; this.src='/uploads/default-avatar.png';">` :
            `<div class="avatar-placeholder"><i class="fas fa-user"></i></div>`
        }
    </div>
</div>
                    <div class="user-details">
                        <h2>${this.escapeHtml(userData.username)}</h2>
                        <p class="user-email">${this.escapeHtml(userData.email)}</p>
                        <p class="member-since">Участник с: ${new Date(userData.created_at).toLocaleDateString('ru-RU')}</p>
                    </div>
                </div>
            </div>

            <!-- Психологический портрет -->
            <div class="profile-card">
                <h3><i class="fas fa-brain"></i> Психологический портрет</h3>
                ${userData.test_completed ? this.generateTraitsHTML(userData) : `
                    <div class="test-not-completed">
                        <p>🤔 Пользователь еще не прошел психологический тест</p>
                    </div>
                `}
            </div>

            <!-- История тестов -->
            <div class="profile-card">
                <h3><i class="fas fa-history"></i> История тестов</h3>
                <div id="userTestHistory">
                    <div class="loading">Загрузка истории...</div>
                </div>
            </div>

            <!-- Игры пользователя -->
            <div class="profile-card">
                <h3><i class="fas fa-gamepad"></i> Любимые игры</h3>
                ${userData.games && userData.games.length > 0 ?
            this.generateGamesHTML(userData.games) :
            '<p>📭 Пользователь еще не выбрал игры</p>'
        }
            </div>

            <!-- Совместимость -->
            ${userData.test_completed && this.currentUser?.test_completed ? `
                <div class="profile-card">
                    <h3><i class="fas fa-chart-line"></i> Совместимость с вами</h3>
                    <div id="compatibilityResult">
                        <div class="loading">Расчет совместимости...</div>
                    </div>
                </div>
            ` : ''}

            <!-- Действия -->
            <div class="profile-view-actions">
                ${this.currentUser && this.currentUser.id != userData.id ? `
                    <button class="btn btn-primary private-chat-btn view-profile-btn" onclick="userProfileViewer.startPrivateChat(${userData.id}, '${this.escapeHtml(userData.username)}')">
                        <i class="fas fa-comment"></i> Написать сообщение
                    </button>
                    <button class="btn btn-secondary view-profile-btn" onclick="userProfileViewer.checkCompatibility(${userData.id})">
                        <i class="fas fa-chart-bar"></i> Проверить совместимость
                    </button>
                    <button class="btn btn-success view-profile-btn" onclick="userProfileViewer.inviteToRoom(${userData.id}, '${this.escapeHtml(userData.username)}')">
                        <i class="fas fa-user-plus"></i> Пригласить в комнату
                    </button>
                ` : ''}
            </div>
        `;

        // Если пользователь прошел тест и текущий пользователь тоже, рассчитываем совместимость
        if (userData.test_completed && this.currentUser?.test_completed && this.currentUser.id != userData.id) {
            this.calculateAndDisplayCompatibility(userData);
        }
    }

    async calculateAndDisplayCompatibility(userData) {
        try {
            const response = await fetch(`/api/profile/calculate-compatibility/${this.userId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayCompatibility(data.compatibility);
            } else {
                // Если нет эндпоинта, рассчитываем на клиенте
                const compatibility = this.calculateCompatibilityLocal(userData);
                this.displayCompatibility(compatibility);
            }
        } catch (error) {
            console.error('Error calculating compatibility:', error);
            const compatibility = this.calculateCompatibilityLocal(userData);
            this.displayCompatibility(compatibility);
        }
    }

    calculateCompatibilityLocal(userData) {
        // Получаем текущего пользователя из localStorage
        const currentUserStr = localStorage.getItem('user');
        if (!currentUserStr) return 0;

        const currentUser = JSON.parse(currentUserStr);

        // Получаем черты текущего пользователя
        const currentTraits = {
            openness: currentUser.openness || 5,
            conscientiousness: currentUser.conscientiousness || 5,
            extraversion: currentUser.extraversion || 5,
            agreeableness: currentUser.agreeableness || 5,
            neuroticism: currentUser.neuroticism || 5
        };

        const otherTraits = {
            openness: userData.openness || 5,
            conscientiousness: userData.conscientiousness || 5,
            extraversion: userData.extraversion || 5,
            agreeableness: userData.agreeableness || 5,
            neuroticism: userData.neuroticism || 5
        };

        // Рассчитываем совместимость (чем ближе значения, тем выше совместимость)
        let totalDiff = 0;
        const traits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

        for (const trait of traits) {
            const diff = Math.abs(currentTraits[trait] - otherTraits[trait]);
            totalDiff += diff;
        }

        // Максимальная разница 10 * 5 = 50
        const compatibility = Math.round((1 - totalDiff / 50) * 100);
        return Math.max(0, Math.min(100, compatibility));
    }

    displayCompatibility(compatibility) {
        const container = document.getElementById('compatibilityResult');
        if (!container) return;

        let description = '';
        if (compatibility >= 80) {
            description = 'Отличная совместимость! Вы идеально подходите друг другу! 🎉';
        } else if (compatibility >= 60) {
            description = 'Хорошая совместимость. У вас много общего! 👍';
        } else if (compatibility >= 40) {
            description = 'Средняя совместимость. Можете найти общий язык. 🤝';
        } else {
            description = 'Низкая совместимость. Возможны разногласия в игре. ⚠️';
        }

        container.innerHTML = `
            <div class="compatibility-result">
                <div class="compatibility-score">${compatibility}%</div>
                <div class="compatibility-bar">
                    <div class="compatibility-fill" style="width: ${compatibility}%"></div>
                </div>
                <p>${description}</p>
            </div>
        `;
    }

    generateTraitsHTML(userData) {
        const traits = {
            openness: { name: 'Открытость опыту', value: userData.openness },
            conscientiousness: { name: 'Добросовестность', value: userData.conscientiousness },
            extraversion: { name: 'Экстраверсия', value: userData.extraversion },
            agreeableness: { name: 'Доброжелательность', value: userData.agreeableness },
            neuroticism: { name: 'Нейротизм', value: userData.neuroticism }
        };

        return `
            <div class="traits-grid">
                ${Object.entries(traits).map(([key, trait]) => `
                    <div class="trait-item">
                        <div class="trait-name">${trait.name}</div>
                        <div class="trait-score">${trait.value}/10</div>
                        <div class="trait-description">${this.getTraitDescription(key, trait.value)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    generateGamesHTML(games) {
        return `
            <div class="saved-games-container">
                ${games.map(game => `
                    <div class="game-card">
                        <i class="fas fa-gamepad game-icon"></i>
                        <h4>${this.escapeHtml(game)}</h4>
                    </div>
                `).join('')}
            </div>
        `;
    }

    getTraitDescription(trait, score) {
        const descriptions = {
            openness: score > 5 ? 'Склонен к экспериментам' : 'Предпочитает проверенные методы',
            conscientiousness: score > 5 ? 'Любит планирование' : 'Спонтанный подход',
            extraversion: score > 5 ? 'Прирожденный лидер' : 'Предпочитает следовать',
            agreeableness: score > 5 ? 'Командный игрок' : 'Индивидуалист',
            neuroticism: score > 5 ? 'Эмоциональный' : 'Стрессоустойчивый'
        };
        return descriptions[trait] || '';
    }

    showError(message) {
        const container = document.getElementById('otherUserProfileContainer');
        container.innerHTML = `
            <div class="error-container">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>${message}</h3>
                <button class="btn btn-primary" onclick="window.history.back()">
                    <i class="fas fa-arrow-left"></i> Вернуться назад
                </button>
            </div>
        `;
    }

    async startPrivateChat(userId, username) {
        // Открываем чат
        if (typeof privateChat !== 'undefined' && privateChat) {
            // Закрываем чат если открыт
            if (privateChat.isOpen) {
                privateChat.closeChat();
            }
            // Открываем чат и сразу открываем диалог с этим пользователем
            privateChat.openChat();
            // Небольшая задержка для загрузки UI
            setTimeout(() => {
                privateChat.openDialog(userId, username);
            }, 100);
        } else {
            dialog.error('Чат не инициализирован. Обновите страницу.', 'Ошибка');
        }
    }
    async checkCompatibility(userId) {
        // Прокручиваем к блоку совместимости
        const compatibilityBlock = document.querySelector('#compatibilityResult');
        if (compatibilityBlock) {
            compatibilityBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
            dialog.success('Совместимость рассчитана! Смотрите выше.', 'Результат');
        } else {
            dialog.info('Для расчета совместимости оба пользователя должны пройти психологический тест.', 'Информация');
        }
    }

    async inviteToRoom(userId, username) {
        // Получаем список комнат пользователя
        try {
            const response = await fetch('/api/profile/my-rooms', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const rooms = await response.json();

                if (rooms.length === 0) {
                    dialog.alert('У вас нет активных комнат. Сначала создайте комнату!', 'Нет комнат');
                    return;
                }

                // Создаем список комнат для выбора через обычный confirm с перебором
                let roomList = 'Ваши комнаты:\n';
                rooms.forEach((room, index) => {
                    roomList += `${index + 1}. ${room.name} (${room.game_name}) - ${room.current_players}/${room.max_players} игроков\n`;
                });
                roomList += '\nВведите номер комнаты для приглашения:';

                const choice = prompt(roomList);
                if (choice && !isNaN(choice) && choice >= 1 && choice <= rooms.length) {
                    const selectedRoom = rooms[choice - 1];
                    dialog.success(`Приглашение для ${username} в комнату "${selectedRoom.name}" отправлено!`, 'Успех');
                    // Здесь позже добавим реальную отправку приглашения через Socket.IO
                }
            }
        } catch (error) {
            console.error('Error inviting to room:', error);
            dialog.error('Ошибка приглашения в комнату', 'Ошибка');
        }
    }

    bindEvents() {
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Глобальный экземпляр
let userProfileViewer;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    userProfileViewer = new UserProfileViewer();
});