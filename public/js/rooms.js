// public/js/rooms.js
class RoomManager {
    constructor() {
        this.rooms = [];
        this.myRooms = [];
        this.currentRoom = null;
        this.currentUser = JSON.parse(localStorage.getItem('user'));
        this.socket = io();
        this.isCreatingRoom = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;

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
                this.createRoom();
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

        // ===== НОВЫЕ ОБРАБОТЧИКИ ДЛЯ ГОЛОСОВЫХ СООБЩЕНИЙ И МЕДИАФАЙЛОВ =====
        const voiceRecordBtn = document.getElementById('voiceRecordBtn');
        const attachFileBtn = document.getElementById('attachFileBtn');
        const fileInput = document.getElementById('fileInput');

        if (voiceRecordBtn) {
            voiceRecordBtn.addEventListener('click', () => {
                if (!this.isRecording) {
                    this.startVoiceRecording();
                    voiceRecordBtn.style.background = '#ef4444';
                    voiceRecordBtn.innerHTML = '<i class="fas fa-stop"></i>';
                    this.isRecording = true;
                } else {
                    this.stopVoiceRecording();
                    voiceRecordBtn.style.background = 'rgba(255,255,255,0.1)';
                    voiceRecordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                    this.isRecording = false;
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
    }

    // ===== МЕТОДЫ ДЛЯ ГОЛОСОВЫХ СООБЩЕНИЙ И МЕДИАФАЙЛОВ =====
    async startVoiceRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                stream.getTracks().forEach(track => track.stop());
                await this.sendAudioMessage(audioBlob);
            };

            this.mediaRecorder.start();
            showToast('🎙️ Запись началась...', 'info');
        } catch (error) {
            console.error('Error starting recording:', error);
            showToast('Ошибка доступа к микрофону', 'error');
        }
    }

    stopVoiceRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            showToast('⏹️ Запись остановлена, отправка...', 'info');
        }
    }

    async sendAudioMessage(audioBlob) {
        if (!this.currentRoom) return;

        const formData = new FormData();
        formData.append('file', audioBlob, 'voice-message.webm');

        try {
            const response = await fetch('/api/profile/upload-chat-media', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                const messageText = `[audio]${data.fileUrl}[/audio]`;

                // Отправляем через сокет
                this.socket.emit('send_room_message', {
                    roomId: this.currentRoom,
                    message: messageText
                });

                // ✅ Добавляем сообщение ЛОКАЛЬНО сразу (без перезагрузки)
                this.addLocalMessage(messageText, 'audio');
            }
        } catch (error) {
            console.error('Error sending audio:', error);
            showToast('Ошибка отправки голосового сообщения', 'error');
        }
    }


    async sendImageMessage(file) {
        if (!this.currentRoom) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/profile/upload-chat-media', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                const messageText = `[image]${data.fileUrl}[/image]`;

                this.socket.emit('send_room_message', {
                    roomId: this.currentRoom,
                    message: messageText
                });

                // ✅ Добавляем сообщение ЛОКАЛЬНО
                this.addLocalMessage(messageText, 'image');
            }
        } catch (error) {
            console.error('Error sending image:', error);
            showToast('Ошибка отправки изображения', 'error');
        }
    }

    addLocalMessage(messageText, type) {
        const container = document.getElementById('roomChatMessages');
        if (!container) return;

        // Убираем заглушку "Нет сообщений"
        const noMessages = container.querySelector('.no-messages');
        if (noMessages) noMessages.remove();

        let content = '';
        if (type === 'audio') {
            const audioUrl = messageText.match(/\[audio\](.*?)\[\/audio\]/)[1];
            content = `<audio controls style="max-width: 200px; height: 40px;"><source src="${audioUrl}" type="audio/webm"></audio>`;
        } else if (type === 'image') {
            const imageUrl = messageText.match(/\[image\](.*?)\[\/image\]/)[1];
            content = `<img src="${imageUrl}" style="max-width: 200px; max-height: 150px; border-radius: 8px; cursor: pointer;" onclick="window.open('${imageUrl}', '_blank')">`;
        } else {
            content = this.escapeHtml(messageText);
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message my-message`;
        messageElement.innerHTML = `
        <div class="message-sender">${this.escapeHtml(this.currentUser.username)}</div>
        <div class="message-text">${content}</div>
        <div class="message-time">${new Date().toLocaleTimeString()}</div>
    `;
        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }


    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            if (file.type.startsWith('image/')) {
                this.sendImageMessage(file);
            } else if (file.type.startsWith('audio/')) {
                this.sendAudioMessage(file);
            } else {
                showToast('Поддерживаются только изображения и аудио', 'error');
            }
        }
    }

    async createRoom() {
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

                await this.loadRooms();
                await this.loadMyRooms();

                this.hideCreateModal();
                document.getElementById('createRoomForm').reset();
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

    async leaveRoom(roomId) {
        const confirmed = await dialog.confirm('Вы уверены, что хотите покинуть комнату?');
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/profile/leave-room/${roomId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                showToast('Вы покинули комнату', 'success');
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

    async deleteMyRoom(roomId, roomName) {
        const confirmed = await dialog.confirm(`Вы уверены, что хотите удалить комнату "${roomName}"?`);
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/profile/my-rooms/${roomId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                showToast('Комната успешно удалена!', 'success');
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

    displayRooms() {
        const container = document.getElementById('roomsContainer');
        if (!container) return;

        if (this.rooms.length === 0) {
            container.innerHTML = '<div class="no-rooms">Нет доступных комнат</div>';
            return;
        }

        container.innerHTML = this.rooms.map(room => `
            <div class="room-card">
                <div class="room-header">
                    <h4>"${this.escapeHtml(room.name)}"</h4>
                    <span class="room-status ${room.status}">${room.status === 'waiting' ? '⏳ Ожидание' : '🎮 В игре'}</span>
                </div>
                <div class="room-info">
                    <p><strong>Игра:</strong> ${this.escapeHtml(room.game_name)}</p>
                    <p><strong>Игроков:</strong> ${room.current_players}/${room.max_players}</p>
                    <p><strong>Создатель:</strong> ${this.escapeHtml(room.creator_name)}</p>
                </div>
                <div class="room-actions">
                    ${room.current_players < room.max_players ?
            `<button class="btn btn-primary btn-sm" onclick="roomManager.joinRoom(${room.id}, '${this.escapeHtml(room.name).replace(/'/g, "\\'")}')">
                            Присоединиться
                        </button>` :
            `<button class="btn btn-secondary btn-sm" disabled>Комната заполнена</button>`
        }
                </div>
            </div>
        `).join('');
    }

    displayMyRooms() {
        const container = document.getElementById('myRoomsContainer');
        if (!container) return;

        if (this.myRooms.length === 0) {
            container.innerHTML = '<div class="no-rooms">У вас нет активных комнат</div>';
            return;
        }

        container.innerHTML = this.myRooms.map(room => `
            <div class="room-card my-room">
                <div class="room-header">
                    <h4>"${this.escapeHtml(room.name)}"</h4>
                    <span class="room-status ${room.status}">${room.status === 'waiting' ? '⏳ Ожидание' : '🎮 В игре'}</span>
                </div>
                <div class="room-info">
                    <p><strong>Игра:</strong> ${this.escapeHtml(room.game_name)}</p>
                    <p><strong>Игроков:</strong> ${room.current_players}/${room.max_players}</p>
                    <p><strong>Создатель:</strong> ${this.escapeHtml(room.creator_name)}</p>
                </div>
                <div class="room-actions">
                    <button class="btn btn-primary btn-sm" onclick="roomManager.openRoomChat(${room.id}, '${this.escapeHtml(room.name).replace(/'/g, "\\'")}')">
                        Открыть чат
                    </button>
                    ${room.is_member ?
            `<button class="btn btn-warning btn-sm" onclick="roomManager.leaveRoom(${room.id})">
                            Покинуть
                        </button>` : ''
        }
                    ${room.created_by === this.currentUser?.id ?
            `<button class="btn btn-danger btn-sm" onclick="roomManager.deleteMyRoom(${room.id}, '${this.escapeHtml(room.name).replace(/'/g, "\\'")}')">
                            Удалить
                        </button>` : ''
        }
                </div>
            </div>
        `).join('');
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

            if (msg.message_text.includes('[audio]')) {
                const match = msg.message_text.match(/\[audio\](.*?)\[\/audio\]/);
                if (match) {
                    const audioUrl = match[1];
                    content = `
                        <audio controls style="max-width: 200px; height: 40px;">
                            <source src="${audioUrl}" type="audio/webm">
                            Ваш браузер не поддерживает аудио
                        </audio>
                    `;
                }
            } else if (msg.message_text.includes('[image]')) {
                const match = msg.message_text.match(/\[image\](.*?)\[\/image\]/);
                if (match) {
                    const imageUrl = match[1];
                    content = `
                        <img src="${imageUrl}" style="max-width: 200px; max-height: 150px; border-radius: 8px; cursor: pointer;" 
                             onclick="window.open('${imageUrl}', '_blank')">
                    `;
                }
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

        // ✅ Добавляем локально сразу
        this.addLocalMessage(message, 'text');

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
                // Убираем заглушку
                const noMessages = container.querySelector('.no-messages');
                if (noMessages) noMessages.remove();

                let content = this.escapeHtml(messageData.message_text);

                // Обработка аудио
                if (messageData.message_text.includes('[audio]')) {
                    const match = messageData.message_text.match(/\[audio\](.*?)\[\/audio\]/);
                    if (match) {
                        content = `<audio controls style="max-width: 200px; height: 40px;"><source src="${match[1]}" type="audio/webm"></audio>`;
                    }
                }
                // Обработка изображений
                else if (messageData.message_text.includes('[image]')) {
                    const match = messageData.message_text.match(/\[image\](.*?)\[\/image\]/);
                    if (match) {
                        content = `<img src="${match[1]}" style="max-width: 200px; max-height: 150px; border-radius: 8px; cursor: pointer;" onclick="window.open('${match[1]}', '_blank')">`;
                    }
                }

                const messageClass = messageData.userId === this.currentUser?.id ? 'my-message' : 'other-message';
                const messageElement = document.createElement('div');
                messageElement.className = `message ${messageClass}`;
                messageElement.innerHTML = `
                <div class="message-sender">${this.escapeHtml(messageData.username)}</div>
                <div class="message-text">${content}</div>
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

                if (this.currentRoom) {
                    this.loadRoomPlayers(this.currentRoom);
                }
            });
        }
    }

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

    viewPlayerProfile(userId) {
        window.open(`/user-profile.html?id=${userId}`, '_blank');
    }

    sendPrivateMessage(userId, username) {
        if (typeof privateChat !== 'undefined' && privateChat) {
            privateChat.openChat();
            setTimeout(() => {
                privateChat.openDialog(userId, username);
            }, 200);
        } else {
            dialog.error('Чат загружается, попробуйте еще раз через секунду', 'Ошибка');
        }
    }

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

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Глобальный экземпляр
let roomManager;

document.addEventListener('DOMContentLoaded', () => {
    roomManager = new RoomManager();
});

function showToast(message, type = 'info', duration = 4000) {
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