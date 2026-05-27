// public/js/rooms.js
class RoomManager {
    constructor() {
        this.rooms = [];
        this.myRooms = [];
        this.currentRoom = null;
        this.currentUser = JSON.parse(localStorage.getItem('user'));
        this.socket = io();
        this.isCreatingRoom = false; // ← Флаг для защиты от дублей

        this.setupSocketEvents();
        this.init();

        if (typeof appState !== 'undefined') {
            appState.onStateUpdate((action, data) => {
                this.handleStateUpdate(action, data);
            });
        }
    }









    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('✅ Connected to server');
            const token = localStorage.getItem('token');
            if (token) {
                this.socket.emit('authenticate', token);
            }
        });

        this.socket.on('new_room_message', (data) => {
            this.handleNewMessage(data);
        });

        this.socket.on('room_message_history', (messages) => {
            this.displayRoomMessages(messages);
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            showToast('Ошибка соединения', 'error');
        });
    }

    async init() {
        if (!this.checkAuthentication()) return;

        await this.loadGames();
        await this.loadRooms();
        await this.loadMyRooms();
        this.bindEvents();
    }

    checkAuthentication() {
        const token = localStorage.getItem('token');
        if (!token) {
            showToast('Требуется авторизация', 'error');
            setTimeout(() => window.location.href = '/', 2000);
            return false;
        }
        return true;
    }

    async loadGames() {
        try {
            const response = await fetch('/api/profile/saved-games', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.populateGameFilters(data.games);
            }
        } catch (error) {
            console.error('Error loading games:', error);
        }
    }

    populateGameFilters(games) {
        const roomGameSelect = document.getElementById('roomGame');
        const gameFilterSelect = document.getElementById('gameFilter');

        if (roomGameSelect) {
            roomGameSelect.innerHTML = '<option value="">Выберите игру</option>';
            games.forEach(game => {
                const option = document.createElement('option');
                option.value = game;
                option.textContent = game;
                roomGameSelect.appendChild(option);
            });
        }

        if (gameFilterSelect) {
            gameFilterSelect.innerHTML = '<option value="">Все игры</option>';
            games.forEach(game => {
                const option = document.createElement('option');
                option.value = game;
                option.textContent = game;
                gameFilterSelect.appendChild(option);
            });
        }
    }

    bindEvents() {
        // В методе bindEvents() добавьте:
        const voiceRecordBtn = document.getElementById('voiceRecordBtn');
        const attachFileBtn = document.getElementById('attachFileBtn');
        const fileInput = document.getElementById('fileInput');

        let isRecording = false;

        if (voiceRecordBtn) {
            voiceRecordBtn.addEventListener('click', () => {
                if (!isRecording) {
                    this.startVoiceRecording();
                    voiceRecordBtn.style.background = '#ef4444';
                    voiceRecordBtn.innerHTML = '<i class="fas fa-stop"></i>';
                    isRecording = true;
                } else {
                    this.stopVoiceRecording();
                    voiceRecordBtn.style.background = 'rgba(255,255,255,0.1)';
                    voiceRecordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                    isRecording = false;
                }
            });
        }

        if (attachFileBtn) {
            attachFileBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelect(e);
                    fileInput.value = '';
                }
            });
        }
        const createRoomBtn = document.getElementById('createRoomBtn');
        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', () => {
                this.showCreateModal();
            });
        }

        const createRoomForm = document.getElementById('createRoomForm');
        if (createRoomForm) {
            createRoomForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createRoom(); // ← Теперь вызывает createRoom с защитой
            });
        }

        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadRooms();
                this.loadMyRooms();
            });
        }

        const gameFilter = document.getElementById('gameFilter');
        if (gameFilter) {
            gameFilter.addEventListener('change', () => {
                this.loadRooms();
            });
        }

        document.getElementById('logoutBtn').addEventListener('click', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/';
        });

        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                this.hideCreateModal();
                this.closeChat();
            });
        });

        const sendMessageBtn = document.getElementById('sendRoomMessageBtn');
        const messageInput = document.getElementById('roomMessageInput');

        if (sendMessageBtn) {
            sendMessageBtn.addEventListener('click', () => {
                this.sendRoomMessage();
            });
        }

        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendRoomMessage();
                }
            });
        }
    }

    // ========== ИСПРАВЛЕННЫЙ МЕТОД СОЗДАНИЯ КОМНАТЫ ==========
    async createRoom() {
        // Защита от повторных кликов
        if (this.isCreatingRoom) {
            showToast('Подождите, комната уже создается...', 'warning');
            return;
        }

        const name = document.getElementById('roomName')?.value;
        const game_name = document.getElementById('roomGame')?.value;
        const max_players = document.getElementById('maxPlayers')?.value;

        if (!name || !game_name) {
            showToast('Заполните все поля', 'error');
            return;
        }

        this.isCreatingRoom = true;
        const submitBtn = document.querySelector('#createRoomForm button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Создание...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/profile/create-room', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name,
                    game_name,
                    max_players: parseInt(max_players)
                })
            });

            if (response.ok) {
                const data = await response.json();
                showToast('Комната создана!', 'success');

                // ← ГЛАВНОЕ ИСПРАВЛЕНИЕ: обновляем оба списка
                await this.loadRooms();      // Обновляем доступные комнаты
                await this.loadMyRooms();    // Обновляем мои комнаты

                this.hideCreateModal();

                // Очищаем форму
                document.getElementById('createRoomForm').reset();

                // Открываем чат в новой комнате
                this.openRoomChat(data.room.id, data.room.name);
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка создания комнаты');
            }
        } catch (error) {
            console.error('Error creating room:', error);
            showToast(error.message, 'error');
        } finally {
            this.isCreatingRoom = false;
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    // Обновляем joinRoom, чтобы тоже обновлял списки
    async joinRoom(roomId, roomName) {
        try {
            const response = await fetch(`/api/profile/join-room/${roomId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                showToast('Вы присоединились к комнате!', 'success');

                // ← Обновляем оба списка
                await this.loadRooms();
                await this.loadMyRooms();

                this.openRoomChat(roomId, roomName);
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка присоединения');
            }
        } catch (error) {
            console.error('Error joining room:', error);
            showToast(error.message, 'error');
        }
    }

    // Обновляем leaveRoom
    async leaveRoom(roomId) {
        const confirmed = await dialog.confirm('Вы уверены, что хотите покинуть комнату?');
        if (!confirmed) return;

        try {
            // ✅ Если голосовой чат активен в этой комнате, выключаем его
            if (voiceController && voiceController.isActive && voiceController.currentRoomId === roomId) {
                voiceController.stopVoiceChat();
            }

            const response = await fetch(`/api/profile/leave-room/${roomId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                showToast('Вы покинули комнату', 'success');

                // ← Обновляем оба списка
                await this.loadRooms();
                await this.loadMyRooms();

                if (this.currentRoom === roomId) {
                    this.closeChat();
                }
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка выхода из комнаты');
            }
        } catch (error) {
            console.error('Error leaving room:', error);
            showToast(error.message, 'error');
        }
    }

    // Обновляем deleteMyRoom
    async deleteMyRoom(roomId, roomName) {
        const confirmed = await dialog.confirm(`Вы уверены, что хотите удалить комнату "${roomName}"?`);
        if (!confirmed) return;

        try {
            // ✅ Если голосовой чат активен в этой комнате, выключаем его
            if (voiceController && voiceController.isActive && voiceController.currentRoomId === roomId) {
                voiceController.stopVoiceChat();
            }

            const response = await fetch(`/api/profile/my-rooms/${roomId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                showToast('Комната успешно удалена!', 'success');

                // ← Обновляем оба списка
                await this.loadRooms();
                await this.loadMyRooms();

                if (this.currentRoom === roomId) {
                    this.closeChat();
                }
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка удаления комнаты');
            }
        } catch (error) {
            console.error('Error deleting room:', error);
            showToast(error.message, 'error');
        }
    }

    // Остальные методы без изменений...
    displayRooms() {
        const container = document.getElementById('roomsContainer');
        if (!container) return;

        if (this.rooms.length === 0) {
            container.innerHTML = '<div class="no-rooms">Нет доступных комнат</div>';
            return;
        }

        container.innerHTML = this.rooms.map(room => {
            // Проверяем доступность voiceController
            const isVoiceActive = window.voiceController && window.voiceController.isActive && window.voiceController.currentRoomId === room.id;
            const voiceButtonText = isVoiceActive ? 'Выключить голос' : 'Голосовой чат';

            return `
        <div class="room-card">
            <div class="room-header">
                <h4>"${room.name}"</h4>
                <span class="room-status ${room.status}">${room.status === 'waiting' ? '⏳ Ожидание' : '🎮 В игре'}</span>
            </div>
            <div class="room-info">
                <p><strong>Игра:</strong> ${room.game_name}</p>
                <p><strong>Игроков:</strong> ${room.current_players}/${room.max_players}</p>
                <p><strong>Создатель:</strong> ${room.creator_name}</p>
            </div>
            <div class="room-actions">
                
                ${room.current_players < room.max_players ?
                `<button class="btn btn-primary btn-sm" onclick="roomManager.joinRoom(${room.id}, '${room.name.replace(/'/g, "\\'")}')">
                            Присоединиться
                        </button>` :
                `<button class="btn btn-secondary btn-sm" disabled>Комната заполнена</button>`
            }
            </div>
        </div>
    `}).join('');
    }
    displayMyRooms() {
        const container = document.getElementById('myRoomsContainer');
        if (!container) return;

        if (this.myRooms.length === 0) {
            container.innerHTML = '<div class="no-rooms">У вас нет активных комнат</div>';
            return;
        }

        container.innerHTML = this.myRooms.map(room => {
            // Проверяем доступность voiceController
            const isVoiceActive = window.voiceController && window.voiceController.isActive && window.voiceController.currentRoomId === room.id;
            const voiceButtonText = isVoiceActive ? 'Выключить голос' : 'Голосовой чат';

            return `
        <div class="room-card my-room">
            <div class="room-header">
                <h4>"${room.name}"</h4>
                <span class="room-status ${room.status}">${room.status === 'waiting' ? '⏳ Ожидание' : '🎮 В игре'}</span>
            </div>
            <div class="room-info">
                <p><strong>Игра:</strong> ${room.game_name}</p>
                <p><strong>Игроков:</strong> ${room.current_players}/${room.max_players}</p>
                <p><strong>Создатель:</strong> ${room.creator_name}</p>
            </div>
            <div class="room-actions">
              
                <button class="btn btn-primary btn-sm" onclick="roomManager.openRoomChat(${room.id}, '${room.name.replace(/'/g, "\\'")}')">
                    Открыть чат
                </button>
                ${room.is_member ?
                `<button class="btn btn-warning btn-sm" onclick="roomManager.leaveRoom(${room.id})">
                            Покинуть
                        </button>` : ''
            }
                ${room.created_by === this.currentUser?.id ?
                `<button class="btn btn-danger btn-sm" onclick="roomManager.deleteMyRoom(${room.id}, '${room.name.replace(/'/g, "\\'")}')">
                            Удалить
                        </button>` : ''
            }
            </div>
        </div>
    `}).join('');
    }
    showCreateModal() {
        const modal = document.getElementById('createRoomModal');
        if (modal) {
            modal.style.display = 'block';
        }
    }

    hideCreateModal() {
        const modal = document.getElementById('createRoomModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    openRoomChat(roomId, roomName) {
        this.currentRoom = roomId;

        const modal = document.getElementById('roomChatModal');
        const title = document.getElementById('roomChatTitle');

        if (modal && title) {
            title.textContent = `Чат: ${roomName}`;
            modal.style.display = 'block';

            this.socket.emit('join_room_chat', roomId);
        }
    }

    closeChat() {
        if (this.currentRoom) {
            this.socket.emit('leave_room_chat', this.currentRoom);
            this.currentRoom = null;
        }

        const modal = document.getElementById('roomChatModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    displayRoomMessages(messages) {
        const container = document.getElementById('roomChatMessages');
        if (!container) return;

        if (!messages || messages.length === 0) {
            container.innerHTML = '<div class="no-messages">Нет сообщений</div>';
            return;
        }

        const formatMessage = (msg) => {
            let content = this.escapeHtml(msg.message_text);

            // Обработка аудио сообщений
            if (msg.message_text.includes('[audio]')) {
                const audioUrl = msg.message_text.match(/\[audio\](.*?)\[\/audio\]/)[1];
                content = `
                <audio controls style="max-width: 200px; height: 40px;">
                    <source src="${audioUrl}" type="audio/webm">
                    Ваш браузер не поддерживает аудио
                </audio>
            `;
            }
            // Обработка изображений
            else if (msg.message_text.includes('[image]')) {
                const imageUrl = msg.message_text.match(/\[image\](.*?)\[\/image\]/)[1];
                content = `
                <img src="${imageUrl}" style="max-width: 200px; max-height: 150px; border-radius: 8px; cursor: pointer;" 
                     onclick="window.open('${imageUrl}', '_blank')">
            `;
            }

            return `
            <div class="message ${msg.user_id === this.currentUser?.id ? 'my-message' : 'other-message'}">
                <div class="message-sender">${this.escapeHtml(msg.username)}</div>
                <div class="message-text">${content}</div>
                <div class="message-time">${new Date(msg.created_at).toLocaleTimeString()}</div>
            </div>
        `;
        };

        container.innerHTML = messages.map(msg => formatMessage(msg)).join('');
        container.scrollTop = container.scrollHeight;
    }

    sendRoomMessage() {
        if (!this.currentRoom) return;

        const input = document.getElementById('roomMessageInput');
        const message = input?.value.trim();

        if (!message) return;

        this.socket.emit('send_room_message', {
            roomId: this.currentRoom,
            message: message
        }, (response) => {
            if (response && response.success) {
                input.value = '';
            } else {
                showToast('Ошибка отправки сообщения', 'error');
            }
        });
    }

    handleNewMessage(messageData) {
        if (messageData.roomId === this.currentRoom) {
            const container = document.getElementById('roomChatMessages');
            if (container) {
                const messageElement = document.createElement('div');
                messageElement.className = `message ${messageData.userId === this.currentUser?.id ? 'my-message' : 'other-message'}`;
                messageElement.innerHTML = `
                    <div class="message-sender">${this.escapeHtml(messageData.username)}</div>
                    <div class="message-text">${this.escapeHtml(messageData.message_text)}</div>
                    <div class="message-time">${new Date(messageData.created_at).toLocaleTimeString()}</div>
                `;
                container.appendChild(messageElement);
                container.scrollTop = container.scrollHeight;
            }
        }
    }

    async handleStateUpdate(action, data) {
        switch (action) {
            case 'rooms_updated':
                await this.loadRooms();
                break;
            case 'my_rooms_updated':
                await this.loadMyRooms();
                break;
            case 'all_updated':
                await this.loadRooms();
                await this.loadMyRooms();
                break;
        }
    }

    async loadRooms() {
        try {
            const gameFilter = document.getElementById('gameFilter')?.value;
            let url = '/api/profile/rooms';
            if (gameFilter) url += `?game_name=${encodeURIComponent(gameFilter)}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                this.rooms = await response.json();
                this.displayRooms();
            } else {
                console.error('Failed to load rooms:', response.status);
            }
        } catch (error) {
            console.error('Error loading rooms:', error);
            showToast('Ошибка загрузки комнат', 'error');
        }
    }


    // Добавьте эти методы в класс RoomManager в rooms.js

// Инициализация вкладок
    initChatTabs() {
        const chatTab = document.querySelector('.chat-tab[data-tab="chat"]');
        const playersTab = document.querySelector('.chat-tab[data-tab="players"]');
        const chatContent = document.getElementById('chatContent');
        const playersContent = document.getElementById('playersContent');

        if (chatTab && playersTab) {
            chatTab.addEventListener('click', () => {
                chatTab.classList.add('active');
                playersTab.classList.remove('active');
                chatContent.style.display = 'flex';
                playersContent.style.display = 'none';
            });

            playersTab.addEventListener('click', () => {
                playersTab.classList.add('active');
                chatTab.classList.remove('active');
                chatContent.style.display = 'none';
                playersContent.style.display = 'flex';

                // Загружаем участников при переключении на вкладку
                if (this.currentRoom) {
                    this.loadRoomPlayers(this.currentRoom);
                }
            });
        }
    }

// Загрузка участников комнаты
    async loadRoomPlayers(roomId) {
        try {
            const response = await fetch(`/api/profile/room-players/${roomId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const players = await response.json();
                this.displayRoomPlayers(players);
            } else {
                throw new Error('Ошибка загрузки участников');
            }
        } catch (error) {
            console.error('Error loading room players:', error);
            const playersList = document.getElementById('roomPlayersList');
            if (playersList) {
                playersList.innerHTML = '<div class="error-players">❌ Ошибка загрузки участников</div>';
            }
        }
    }

// Отображение участников комнаты
    displayRoomPlayers(players) {
        const container = document.getElementById('roomPlayersList');
        if (!container) return;

        if (!players || players.length === 0) {
            container.innerHTML = '<div class="no-players">👥 Нет участников</div>';
            return;
        }

        container.innerHTML = players.map(player => `
        <div class="player-card" data-user-id="${player.id}">
            <div class="player-avatar">
                ${player.avatar_url ?
            `<img src="${player.avatar_url}" alt="${this.escapeHtml(player.username)}" onerror="this.src='/uploads/default-avatar.png'">` :
            `<div class="avatar-placeholder-small"><i class="fas fa-user"></i></div>`
        }
            </div>
            <div class="player-info">
                <div class="player-name">
                    ${this.escapeHtml(player.username)}
                    ${player.is_creator ? '<span class="creator-badge"><i class="fas fa-crown"></i> Создатель</span>' : ''}
                </div>
                <div class="player-test-status">
                    ${player.test_completed ?
            '<span class="test-passed"><i class="fas fa-check-circle"></i> Тест пройден</span>' :
            '<span class="test-not-passed"><i class="fas fa-clock"></i> Тест не пройден</span>'
        }
                </div>
                ${player.test_completed ? `
                    <div class="player-traits-preview">
                        <span class="trait-preview" title="Открытость">O: ${player.openness || '?'}</span>
                        <span class="trait-preview" title="Добросовестность">C: ${player.conscientiousness || '?'}</span>
                        <span class="trait-preview" title="Экстраверсия">E: ${player.extraversion || '?'}</span>
                        <span class="trait-preview" title="Доброжелательность">A: ${player.agreeableness || '?'}</span>
                        <span class="trait-preview" title="Нейротизм">N: ${player.neuroticism || '?'}</span>
                    </div>
                ` : ''}
            </div>
            <div class="player-actions">
                <button class="btn-view-profile" onclick="roomManager.viewPlayerProfile(${player.id})" title="Просмотреть профиль">
                    <i class="fas fa-user-circle"></i>
                </button>
                <button class="btn-send-message" onclick="roomManager.sendPrivateMessage(${player.id}, '${this.escapeHtml(player.username).replace(/'/g, "\\'")}')" title="Написать личное сообщение">
                    <i class="fas fa-envelope"></i>
                </button>
            </div>
        </div>
    `).join('');
    }

// Просмотр профиля участника
    viewPlayerProfile(userId) {
        // Открываем профиль в новой вкладке
        window.open(`/user-profile.html?id=${userId}`, '_blank');
    }

// Отправка личного сообщения (заглушка, можно реализовать позже)
    sendPrivateMessage(userId, username) {
        if (typeof privateChat !== 'undefined' && privateChat) {
            // Закрываем текущее окно чата комнаты (опционально)
            // this.closeChat();

            // Открываем приватный чат
            privateChat.openChat();

            // Открываем диалог с выбранным пользователем
            setTimeout(() => {
                privateChat.openDialog(userId, username);
            }, 200);
        } else {
            dialog.error('Чат загружается, попробуйте еще раз через секунду', 'Ошибка');
        }
    }

// Обновляем метод openRoomChat, добавляем инициализацию вкладок
    openRoomChat(roomId, roomName) {
        this.currentRoom = roomId;

        const modal = document.getElementById('roomChatModal');
        const title = document.getElementById('roomChatTitle');

        if (modal && title) {
            title.textContent = `Чат: ${roomName}`;
            modal.style.display = 'block';

            // Сбрасываем на вкладку чата
            this.switchToChatTab();

            // Инициализируем вкладки (если еще не инициализированы)
            this.initChatTabs();

            // Присоединяемся к комнате чата
            this.socket.emit('join_room_chat', roomId);

            // Загружаем участников в фоне
            this.loadRoomPlayers(roomId);
        }
    }

// Переключение на вкладку чата
    switchToChatTab() {
        const chatTab = document.querySelector('.chat-tab[data-tab="chat"]');
        const playersTab = document.querySelector('.chat-tab[data-tab="players"]');
        const chatContent = document.getElementById('chatContent');
        const playersContent = document.getElementById('playersContent');

        if (chatTab && playersTab) {
            chatTab.classList.add('active');
            playersTab.classList.remove('active');
            if (chatContent) chatContent.style.display = 'flex';
            if (playersContent) playersContent.style.display = 'none';
        }
    }


    async loadMyRooms() {
        try {
            const response = await fetch('/api/profile/my-rooms', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                this.myRooms = await response.json();
                this.displayMyRooms();
            } else {
                console.error('Failed to load my rooms:', response.status);
            }
        } catch (error) {
            console.error('Error loading my rooms:', error);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ==================== ЗАГРУЗКА ФАЙЛОВ ДЛЯ ЧАТА ====================
// const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Создаем папку для медиафайлов чата
const chatUploadsDir = path.join(__dirname, '../public/uploads/chat');
if (!fs.existsSync(chatUploadsDir)) {
    fs.mkdirSync(chatUploadsDir, { recursive: true });
}

// Настройка multer для медиафайлов
const chatStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, chatUploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'chat-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const chatUpload = multer({
    storage: chatStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'audio/webm', 'audio/mp3', 'audio/mpeg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Неподдерживаемый тип файла'), false);
        }
    }
});

// Загрузка медиафайла в чат
router.post('/upload-chat-media', authenticateToken, chatUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        const fileUrl = '/uploads/chat/' + req.file.filename;
        let fileType = 'image';

        if (req.file.mimetype.startsWith('audio')) {
            fileType = 'audio';
        }

        res.json({
            success: true,
            fileUrl: fileUrl,
            fileType: fileType,
            fileName: req.file.originalname
        });

    } catch (error) {
        console.error('Error uploading chat media:', error);
        res.status(500).json({ error: 'Ошибка загрузки файла' });
    }
});
// Добавьте в начало файла rooms.js, после класса RoomManager

// Глобальный экземпляр
let roomManager;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    roomManager = new RoomManager();
});

// Функция уведомлений
function showToast(message, type = 'info', duration = 4000) {
    // Проверяем, существует ли уже контейнер
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

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
    closeBtn.addEventListener('click', () => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}