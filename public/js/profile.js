// public/js/profile.js

// Универсальная функция для показа уведомлений
class ToastManager {
    constructor() {
        this.container = this.createContainer();
    }

    createContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    show(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        toast.innerHTML = `
            <i class="${icons[type] || icons.info} toast-icon"></i>
            <span class="toast-message">${message}</span>
            <button class="toast-close">&times;</button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.removeToast(toast));

        this.container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => this.removeToast(toast), duration);
        }

        return toast;
    }

    removeToast(toast) {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }
}

// Глобальный экземпляр менеджера уведомлений
const toastManager = new ToastManager();

// Функция для быстрого доступа
function showToast(message, type = 'info', duration = 4000) {
    return toastManager.show(message, type, duration);
}

class Profile {
    constructor() {
        if (!this.checkAuthentication()) {
            return;
        }

        this.user = null;
        this.userGames = [];
        this.availableGames = [
            // MOBA и стратегии
            'League of Legends (LoL)',
            'Dota 2',
            'Teamfight Tactics (TFT)',
            'Warcraft III: Reforged',
            'StarCraft II',
            'Age of Empires IV',
            'Dota Underlords',

            // Шутеры
            'Counter-Strike 2 / Global Offensive',
            'Valorant',
            'Overwatch 2',
            'Rainbow Six Siege',
            'Apex Legends',
            'Call of Duty: Warzone',
            'Destiny 2',
            'Escape from Tarkov',
            'Doom (2016) / Doom Eternal',
            'Call of Duty: Modern Warfare II / III',
            'Battlefield 2042',

            // Battle Royale
            'Fortnite',
            'PUBG: Battlegrounds',

            // MMORPG
            'World of Warcraft (WoW)',
            'Final Fantasy XIV',
            'Guild Wars 2',
            'The Elder Scrolls Online',
            'Warframe',

            // RPG
            'Genshin Impact',
            'Honkai: Star Rail',
            'Path of Exile',
            'Elden Ring',
            'The Witcher 3: Wild Hunt',
            'Cyberpunk 2077',
            'Baldur\'s Gate 3',
            'Diablo IV',
            'Diablo III',
            'Mass Effect: Legendary Edition',
            'BioShock Infinite',
            'Disco Elysium',
            'Monster Hunter: World / Rise',

            // Песочницы и выживание
            'Minecraft',
            'Terraria',
            'Roblox',
            'Grand Theft Auto V / GTA Online',
            'Red Dead Redemption 2 / Red Dead Online',
            'Valheim',
            'Grounded',
            'Palworld',

            // Приключения и экшены
            'The Legend of Zelda: Breath of the Wild',
            'The Legend of Zelda: Tears of the Kingdom',
            'Dark Souls',
            'Sekiro: Shadows Die Twice',
            'God of War (2018) & Ragnarök',
            'Horizon Zero Dawn / Forbidden West',
            'Marvel\'s Spider-Man 2',
            'Uncharted 4: A Thief\'s End',
            'The Last of Us Part I & II',
            'Resident Evil 4 (Remake)',
            'Resident Evil Village',

            // Инди игры
            'Hades',
            'Dead Cells',
            'Hollow Knight',
            'Stardew Valley',
            'Animal Crossing: New Horizons',
            'Hogwarts Legacy',
            'Portal 2',
            'Half-Life: Alyx',
            'It Takes Two',

            // Симуляторы
            'The Sims 4',
            'Civilization VI',
            'Crusader Kings III',
            'Europa Universalis IV',
            'XCOM 2',
            'Total War: Warhammer III',

            // Кооперативные игры
            'Payday 2',
            'Left 4 Dead 2',
            'Deep Rock Galactic',
            'Sea of Thieves',
            'Risk of Rain 2',
            'Phasmophobia',
            'Lethal Company',
            'Helldivers 2',

            // VR и другие
            'VRChat',
            'Rocket League',
            'League of Legends: Wild Rift',
            'Fallout 4 / Fallout: New Vegas',
            'Skyrim'
        ];

        this.init();
    }

    // В profile.js добавьте метод (если хотите кнопку чата в своем профиле)

    openChat() {
        if (typeof privateChat !== 'undefined' && privateChat) {
            privateChat.openChat();
        } else {
            dialog.error('Чат не инициализирован', 'Ошибка');
        }
    }

    checkAuthentication() {
        const token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');

        if (!token || !userStr) {
            dialog.alert('Для просмотра профиля необходимо авторизоваться');
            window.location.href = '/';
            return false;
        }

        try {
            this.user = JSON.parse(userStr);

            if (!this.user || !this.user.id || !this.user.email) {
                console.error('Неверные данные пользователя:', this.user);
                dialog.alert('Ошибка данных пользователя. Пожалуйста, войдите снова.');
                this.logout();
                return false;
            }

            return true;
        } catch (error) {
            console.error('Ошибка парсинга данных пользователя:', error);
            dialog.alert('Ошибка загрузки профиля. Пожалуйста, войдите снова.');
            this.logout();
            return false;
        }
    }

    async init() {
        await this.loadFreshUserData();
        await this.loadUserData();
        this.loadPsychologicalResults();
        this.loadTestHistory();
        this.renderGames(); // Это создаст список игр
        this.bindEvents();
        this.bindAvatarEvents();
        await this.loadSavedGames(); // Это покажет либо игры, либо форму выбора
    }

    async updateActivity() {
        try {
            await fetch('/api/profile/update-activity', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
        } catch (error) {
            console.error('Error updating activity:', error);
        }
    }

    async loadSavedGames() {
        try {
            const response = await fetch('/api/profile/saved-games', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displaySavedGames(data.games);
            }
        } catch (error) {
            console.error('Ошибка загрузки сохраненных игр:', error);
        }
    }

    displaySavedGames(games) {
        const savedContainer = document.getElementById('savedGamesContainer');
        const savedCard = document.getElementById('savedGamesCard');
        const selectionBlock = document.getElementById('gamesSelectionBlock');
        const saveBtn = document.getElementById('saveGamesBtn');

        console.log('displaySavedGames called with:', games);
        console.log('Elements found:', { savedCard: !!savedCard, selectionBlock: !!selectionBlock, saveBtn: !!saveBtn });

        if (games && games.length > 0) {
            // Есть сохраненные игры - показываем их, скрываем выбор
            if (savedCard) savedCard.style.display = 'block';
            if (selectionBlock) selectionBlock.style.display = 'none';
            if (saveBtn) saveBtn.style.display = 'none';

            savedContainer.innerHTML = games.map(game => `
            <div class="game-card">
                <i class="fas fa-gamepad game-icon ${this.getGameIconClass(game)}"></i>
                <h4>${this.escapeHtml(game)}</h4>
            </div>
        `).join('');
        } else {
            // Нет сохраненных игр - показываем блок выбора
            if (savedCard) savedCard.style.display = 'none';
            if (selectionBlock) selectionBlock.style.display = 'block';
            if (saveBtn) saveBtn.style.display = 'block';

            // Если нет игр, открываем список для выбора
            this.openGamesDropdown();
            this.renderGames();
        }
    }
    getGameIconClass(gameName) {
        const lowerName = gameName.toLowerCase();

        const icons = {
            'league': 'lol',
            'dota': 'dota',
            'counter-strike': 'csgo',
            'valorant': 'valorant',
            'minecraft': 'minecraft',
            'fortnite': 'fortnite',
            'warcraft': 'wow',
            'overwatch': 'overwatch',
            'apex': 'apex',
            'rainbow': 'r6',
            'destiny': 'destiny',
            'elden': 'elden',
            'witcher': 'witcher',
            'cyberpunk': 'cyberpunk',
            'diablo': 'diablo',
            'mass effect': 'mass-effect',
            'bioshock': 'bioshock'
        };

        for (const [key, value] of Object.entries(icons)) {
            if (lowerName.includes(key)) {
                return value;
            }
        }
        return '';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Добавим в класс Profile
    closeGamesDropdown() {
        const gamesListContainer = document.querySelector('.games-list-container');
        if (gamesListContainer) {
            gamesListContainer.classList.add('hidden');
        }
    }

    openGamesDropdown() {
        const gamesListContainer = document.querySelector('.games-list-container');
        if (gamesListContainer) {
            gamesListContainer.classList.add('show');
            gamesListContainer.style.display = 'block';
        }
    }

    editGames() {
        const savedCard = document.getElementById('savedGamesCard');
        const selectionBlock = document.getElementById('gamesSelectionBlock');
        const saveBtn = document.getElementById('saveGamesBtn');

        if (savedCard) savedCard.style.display = 'none';
        if (selectionBlock) selectionBlock.style.display = 'block';
        if (saveBtn) saveBtn.style.display = 'block';

        this.loadCurrentGameSelection();
    }

    hideGameSelection() {
        const savedCard = document.getElementById('savedGamesCard');
        const selectionBlock = document.getElementById('gamesSelectionBlock');
        const saveBtn = document.getElementById('saveGamesBtn');

        if (savedCard) savedCard.style.display = 'block';
        if (selectionBlock) selectionBlock.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
    }

    async loadTestHistory() {
        try {
            const response = await fetch('/api/profile/test-stats', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayTestHistory(data);
            }
        } catch (error) {
            console.error('Ошибка загрузки истории тестов:', error);
        }
    }

    displayTestHistory(data) {
        const historyCard = document.getElementById('testHistoryCard');
        const testCountBadge = document.getElementById('testCountBadge');
        const historyContainer = document.getElementById('testHistoryContainer');

        if (data.total_tests > 0) {
            historyCard.style.display = 'block';
            testCountBadge.innerHTML = `<i class="fas fa-chart-line"></i> Тестов пройдено: ${data.total_tests}`;

            if (data.history && data.history.length > 0) {
                historyContainer.innerHTML = data.history.map(test => `
                <div class="test-history-item">
                    <div class="test-history-header">
                        <span class="test-number">#${test.test_number}</span>
                        <span class="test-date">${new Date(test.created_at).toLocaleDateString('ru-RU')}</span>
                    </div>
                    <div class="test-history-scores">
                        <div class="score-item">
                            <span class="score-label">Открытость:</span>
                            <span class="score-value">${test.openness}/10</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">Добросовестность:</span>
                            <span class="score-value">${test.conscientiousness}/10</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">Экстраверсия:</span>
                            <span class="score-value">${test.extraversion}/10</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">Доброжелательность:</span>
                            <span class="score-value">${test.agreeableness}/10</span>
                        </div>
                        <div class="score-item">
                            <span class="score-label">Нейротизм:</span>
                            <span class="score-value">${test.neuroticism}/10</span>
                        </div>
                    </div>
                </div>
            `).join('');
            }
        } else {
            historyCard.style.display = 'none';
        }
    }

    async loadCurrentGameSelection() {
        try {
            const response = await fetch('/api/profile/saved-games', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();

                // Сбрасываем все чекбоксы
                document.querySelectorAll('.game-checkbox').forEach(checkbox => {
                    checkbox.checked = false;
                    checkbox.closest('.game-item')?.classList.remove('selected');
                });

                // Отмечаем сохраненные игры
                data.games.forEach(gameName => {
                    const checkbox = document.getElementById(`game-${this.hashCode(gameName)}`);
                    if (checkbox) {
                        checkbox.checked = true;
                        checkbox.closest('.game-item')?.classList.add('selected');
                    }
                });

                // Обновляем счетчик выбранных игр
                this.updateSelectedGames();
            }
        } catch (error) {
            console.error('Ошибка загрузки текущих игр:', error);
        }
    }

    // Обновим метод saveGames
    async saveGames() {
        const selectedGames = Array.from(document.querySelectorAll('.game-checkbox:checked'))
            .map(checkbox => checkbox.value);

        try {
            const saveBtn = document.getElementById('saveGamesBtn');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';
            saveBtn.disabled = true;

            const response = await fetch('/api/profile/save-games', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ games: selectedGames })
            });

            if (response.ok) {
                showToast('Список игр успешно сохранен!', 'success');

                // ЗАКРЫВАЕМ СПИСОК И ОБНОВЛЯЕМ ИНТЕРФЕЙС
                this.closeGamesDropdown();
                await this.loadSavedGames();
                this.hideGameSelection();

            } else {
                const errorData = await response.json();
                showToast('Ошибка сохранения: ' + (errorData.error || 'Неизвестная ошибка'), 'error');
            }
        } catch (error) {
            console.error('Ошибка:', error);
            showToast('Ошибка сохранения игр', 'error');
        } finally {
            const saveBtn = document.getElementById('saveGamesBtn');
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Сохранить выбор';
                saveBtn.disabled = false;
            }
        }
    }
    bindEvents() {
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        document.getElementById('saveGamesBtn').addEventListener('click', () => {
            this.saveGames();
        });

        // ОБРАБОТЧИК КЛИКА ВНЕ ОБЛАСТИ СПИСКА ИГР
        document.addEventListener('click', (e) => {
            const gamesListContainer = document.querySelector('.games-list-container');
            const gameSearch = document.getElementById('gameSearch');

            if (gamesListContainer && !gamesListContainer.classList.contains('hidden')) {
                // Проверяем, был ли клик вне контейнера списка и поля поиска
                if (!gamesListContainer.contains(e.target) &&
                    e.target !== gameSearch) {
                    this.closeGamesDropdown();
                }
            }
        });

        // ОТКРЫВАЕМ СПИСОК ПРИ ФОКУСЕ НА ПОИСКЕ
        const searchInput = document.getElementById('gameSearch');
        if (searchInput) {
            searchInput.addEventListener('focus', () => {
                this.openGamesDropdown();
            });
        }
    }
    closeGamesDropdown() {
        const gamesListContainer = document.querySelector('.games-list-container');
        if (gamesListContainer) {
            gamesListContainer.classList.remove('show');
        }
    }

    openGamesDropdown() {
        const gamesListContainer = document.querySelector('.games-list-container');
        if (gamesListContainer) {
            gamesListContainer.classList.add('show');
        }
    }

    hideGameSelection() {
        const savedCard = document.getElementById('savedGamesCard');
        const selectionCard = document.querySelector('.games-selection')?.closest('.profile-card');
        const saveBtn = document.getElementById('saveGamesBtn');

        if (savedCard) savedCard.style.display = 'block';
        if (selectionCard) selectionCard.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
    }

    async loadFreshUserData() {
        try {
            const response = await fetch('/api/auth/profile', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                localStorage.setItem('user', JSON.stringify(this.user));
                return true;
            } else {
                console.error('Ошибка загрузки данных пользователя:', response.status);
                return false;
            }
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            return false;
        }
    }

    async loadUserData() {
        try {
            document.getElementById('username').textContent = this.user.username;
            document.getElementById('userEmail').textContent = this.user.email;

            // ✅ Форматируем дату последнего входа
            let lastLoginText = 'Никогда';
            if (this.user.last_login) {
                const lastLoginDate = new Date(this.user.last_login);
                if (!isNaN(lastLoginDate.getTime())) {
                    lastLoginText = this.formatDate(lastLoginDate);
                }
            }
            document.getElementById('joinDate').textContent = lastLoginText;

            // Админ-панель
            if (this.user.role === 'admin') {
                const adminBtn = document.getElementById('adminPanelBtn');
                if (adminBtn) {
                    adminBtn.style.display = 'block';
                    adminBtn.addEventListener('click', () => {
                        window.location.href = '/admin.html';
                    });
                }
            }

            if (this.user.avatar_url) {
                this.updateAvatarDisplay(this.user.avatar_url);
            } else {
                this.updateAvatarDisplay(null);
            }

        } catch (error) {
            console.error('Ошибка загрузки данных пользователя:', error);
        }
    }

// Добавьте метод formatDate в profile.js
    formatDate(date) {
        if (!date || isNaN(date.getTime())) {
            return 'Никогда';
        }

        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) {
            return 'Только что';
        } else if (diffMins < 60) {
            return `${diffMins} мин. назад`;
        } else if (diffHours < 24) {
            return `${diffHours} ч. назад`;
        } else if (diffDays < 7) {
            return `${diffDays} дн. назад`;
        } else {
            return date.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }
// Добавьте вспомогательный метод для форматирования даты
    async loadPsychologicalResults() {
        try {
            console.log('🔄 Загружаем результаты теста...');

            const response = await fetch('/api/profile/results', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            console.log('📊 Статус ответа:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Данные получены:', data);
                this.renderPsychologicalResults(data.traits);
            } else if (response.status === 404) {
                console.log('ℹ️ Тест не пройден');
                document.getElementById('psychoResults').innerHTML = `
                    <div class="test-not-completed">
                        <p>🤔 Вы еще не прошли психологический тест</p>
                        <button class="btn btn-primary" onclick="window.location.href='/test.html'">
                            <i class="fas fa-brain"></i> Пройти тест
                        </button>
                    </div>
                `;
            } else {
                const errorText = await response.text();
                console.error('❌ Ошибка сервера:', errorText);
                document.getElementById('psychoResults').innerHTML = `
                    <div class="error">
                        <p>❌ Ошибка загрузки результатов</p>
                        <small>Статус: ${response.status}</small>
                    </div>
                `;
            }
        } catch (error) {
            console.error('💥 Полная ошибка:', error);
            document.getElementById('psychoResults').innerHTML = `
                <div class="error">
                    <p>❌ Ошибка соединения</p>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }

    renderPsychologicalResults(traits) {
        if (!traits) {
            document.getElementById('psychoResults').innerHTML =
                '<div class="error">Пройдите психологический тест для получения результатов</div>';
            return;
        }

        const traitsHtml = `
            <div class="traits-grid">
                ${Object.entries(traits).map(([trait, score]) => `
                    <div class="trait-item">
                        <div class="trait-name">${this.getTraitName(trait)}</div>
                        <div class="trait-score">${score}/10</div>
                        <div class="trait-description">${this.getTraitDescription(trait, score)}</div>
                    </div>
                `).join('')}
            </div>
        `;

        document.getElementById('psychoResults').innerHTML = traitsHtml;
    }

    getTraitName(trait) {
        const names = {
            openness: 'Открытость опыту',
            conscientiousness: 'Добросовестность',
            extraversion: 'Экстраверсия',
            agreeableness: 'Доброжелательность',
            neuroticism: 'Нейротизм'
        };
        return names[trait] || trait;
    }

    getTraitDescription(trait, score) {
        const descriptions = {
            openness: score > 5 ? 'Склонен к экспериментам и новым тактикам' : 'Предпочитает проверенные стратегии',
            conscientiousness: score > 5 ? 'Планирует и готовится к игре' : 'Импульсивный подход к игре',
            extraversion: score > 5 ? 'Прирожденный лидер команды' : 'Предпочитает следовать указаниям',
            agreeableness: score > 5 ? 'Командный игрок, поддерживает других' : 'Конкурентный настрой',
            neuroticism: score > 5 ? 'Эмоционально реагирует на события игры' : 'Спокоен в стрессовых ситуациях'
        };
        return descriptions[trait] || '';
    }

    renderGames() {
        const container = document.getElementById('gamesContainer');
        const searchInput = document.getElementById('gameSearch');

        if (!container) {
            console.error('gamesContainer not found!');
            return;
        }

        const renderGamesList = (games) => {
            container.innerHTML = games.map(game => `
            <div class="game-item" data-game="${game}">
                <input type="checkbox" id="game-${this.hashCode(game)}" 
                       class="game-checkbox" value="${game}">
                <label for="game-${this.hashCode(game)}" class="game-item-label">
                    <span class="game-name">${this.escapeHtml(game)}</span>
                </label>
            </div>
        `).join('');
        };

        // Первоначальная отрисовка
        renderGamesList(this.availableGames);

        // Поиск игр
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filteredGames = this.availableGames.filter(game =>
                    game.toLowerCase().includes(searchTerm)
                );
                renderGamesList(filteredGames);
            });
        }

        // Обработка кликов
        container.addEventListener('click', (e) => {
            const gameItem = e.target.closest('.game-item');
            if (gameItem) {
                const checkbox = gameItem.querySelector('.game-checkbox');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) {
                        gameItem.classList.add('selected');
                    } else {
                        gameItem.classList.remove('selected');
                    }
                    this.updateSelectedGames();
                }
            }
        });
    }


    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    updateSelectedGames() {
        const selectedGames = Array.from(document.querySelectorAll('.game-checkbox:checked'))
            .map(checkbox => checkbox.value);

        const selectedCount = document.getElementById('selectedCount');
        const selectedList = document.getElementById('selectedGamesList');

        selectedCount.textContent = selectedGames.length;

        selectedList.innerHTML = selectedGames.map(game => `
        <div class="selected-game-tag">
            ${game}
            <button class="remove-btn" onclick="profile.removeGame('${game.replace(/'/g, "\\'")}')">×</button>
        </div>
    `).join('');

        // Обновляем визуальное состояние всех плашек
        document.querySelectorAll('.game-item').forEach(item => {
            const checkbox = item.querySelector('.game-checkbox');
            if (checkbox.checked) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    bindEvents() {
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        document.getElementById('saveGamesBtn').addEventListener('click', () => {
            this.saveGames();
        });
    }

    removeGame(gameName) {
        const checkbox = document.getElementById(`game-${this.hashCode(gameName)}`);
        if (checkbox) {
            checkbox.checked = false;
            const gameItem = checkbox.closest('.game-item');
            if (gameItem) {
                gameItem.classList.remove('selected');
            }
            this.updateSelectedGames();
        }
    }

    bindAvatarEvents() {
        const avatarInput = document.getElementById('avatarInput');
        const avatarForm = document.getElementById('avatarForm');

        if (avatarInput && avatarForm) {
            avatarInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.uploadAvatar(e.target.files[0]);
                }
            });

            avatarForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (avatarInput.files.length > 0) {
                    this.uploadAvatar(avatarInput.files[0]);
                }
            });
        }
    }

    async uploadAvatar(file) {
        try {
            const formData = new FormData();
            formData.append('avatar', file);

            const uploadBtn = document.querySelector('.avatar-upload-btn');
            const originalText = uploadBtn.innerHTML;
            uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
            uploadBtn.disabled = true;

            const response = await fetch('/api/profile/upload-avatar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                showToast('Аватар успешно обновлен!', 'success');;

                await this.loadFreshUserData();
                this.updateAvatarDisplay(data.avatarUrl);

            } else {
                showToast('Ошибка: ' + (data.error || 'Неизвестная ошибка'), 'error');
            }

            uploadBtn.innerHTML = originalText;
            uploadBtn.disabled = false;

        } catch (error) {
            console.error('Ошибка загрузки:', error);
            dialog.alert('Ошибка загрузки файла');

            const uploadBtn = document.querySelector('.avatar-upload-btn');
            uploadBtn.innerHTML = '<i class="fas fa-camera"></i> Сменить аватар';
            uploadBtn.disabled = false;
        }
    }

    updateAvatarDisplay(avatarUrl) {
        const avatarImg = document.getElementById('avatarImg');
        const avatarPlaceholder = document.getElementById('avatarPlaceholder');

        if (avatarUrl && avatarUrl !== 'null' && avatarUrl !== 'undefined' && avatarUrl.trim() !== '') {
            const timestamp = new Date().getTime();
            const avatarUrlWithTimestamp = avatarUrl + '?t=' + timestamp;

            avatarImg.src = avatarUrlWithTimestamp;
            avatarImg.style.display = 'block';
            avatarPlaceholder.style.display = 'none';

            avatarImg.onload = () => {
                console.log('Аватар успешно загружен');
            };

            avatarImg.onerror = () => {
                console.log('Ошибка загрузки аватара, показываем default-avatar.png');
                // Если аватар не загрузился - показываем default-avatar.png
                avatarImg.src = '/uploads/default-avatar.png?t=' + timestamp;
                avatarImg.onerror = () => {
                    // Если и default-avatar.png не загрузился - показываем плейсхолдер
                    avatarImg.style.display = 'none';
                    avatarPlaceholder.style.display = 'flex';
                };
            };
        } else {
            // Если нет avatar_url - пробуем загрузить default-avatar.png
            const timestamp = new Date().getTime();
            avatarImg.src = '/uploads/default-avatar.png?t=' + timestamp;
            avatarImg.style.display = 'block';
            avatarPlaceholder.style.display = 'none';

            avatarImg.onerror = () => {
                avatarImg.style.display = 'none';
                avatarPlaceholder.style.display = 'flex';
            };
        }
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
    }

    async saveGames() {
        const selectedGames = Array.from(document.querySelectorAll('.game-checkbox:checked'))
            .map(checkbox => checkbox.value);

        await appState.executeWithUpdate(async () => {
            const response = await fetch('/api/profile/save-games', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ games: selectedGames })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Неизвестная ошибка');
            }
        }, 'Список игр успешно сохранен!');

        // Обновляем интерфейс
        this.closeGamesDropdown();
        await this.loadSavedGames();
        this.hideGameSelection();
    }

    async uploadAvatar(file) {
        await appState.executeWithUpdate(async () => {
            const formData = new FormData();
            formData.append('avatar', file);

            const response = await fetch('/api/profile/upload-avatar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Неизвестная ошибка');
            }

            // Обновляем данные пользователя
            await this.loadFreshUserData();
            this.updateAvatarDisplay(data.avatarUrl);
        }, 'Аватар успешно обновлен!');
    }
}


// Глобальная переменная для доступа к методам из HTML
let profile;

// Запуск профиля
document.addEventListener('DOMContentLoaded', () => {
    profile = new Profile();
    window.profile = profile;
});