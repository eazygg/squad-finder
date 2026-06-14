// public/js/chat.js
class PrivateChat {
    constructor() {
        this.socket = io();
        this.currentDialog = null;
        this.dialogs = [];
        this.isOpen = false;
        this.init();
    }

    init() {
        this.setupSocketEvents();
        this.loadDialogs();
        this.createChatUI();
        this.bindEvents();
    }

    setupSocketEvents() {
        const token = localStorage.getItem('token');
        if (token) {
            this.socket.emit('authenticate', token);
        }

        this.socket.on('new_private_message', (message) => {
            this.handleNewMessage(message);
        });

        this.socket.on('message_read', (data) => {
            this.handleMessageRead(data);
        });
    }

    createChatUI() {
        // Создаем HTML структуру чата, если её нет
        if (document.getElementById('privateChatContainer')) return;

        const chatHTML = `
            <div id="privateChatContainer" class="private-chat-container" style="display: none;">
                <div class="private-chat-sidebar">
                    <div class="chat-sidebar-header">
                        <h3><i class="fas fa-comments"></i> Сообщения</h3>
                        <button class="close-chat-btn" onclick="privateChat.closeChat()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="dialogsList" class="dialogs-list">
                        <div class="loading-dialogs">Загрузка диалогов...</div>
                    </div>
                </div>
                <div class="private-chat-main">
                    <div class="chat-main-header" id="chatMainHeader">
                        <div class="chat-user-info">
                            <div class="chat-user-avatar"></div>
                            <div class="chat-user-details">
                                <h4 id="chatUserName">Выберите диалог</h4>
                                <span id="chatUserStatus"></span>
                            </div>
                        </div>
                        <button class="close-chat-main-btn" onclick="privateChat.closeChat()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="chatMessages" class="chat-messages-list">
                        <div class="no-messages">Выберите диалог чтобы начать общение</div>
                    </div>
                    <div class="chat-input-area" style="display: none;">
                        <textarea id="chatMessageInput" placeholder="Введите сообщение..." rows="2"></textarea>
                        <button id="sendChatMessageBtn" class="btn btn-primary">
                            <i class="fas fa-paper-plane"></i> Отправить
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', chatHTML);
        this.addChatStyles();
    }

    addChatStyles() {
        if (document.getElementById('chatStyles')) return;

        const styles = `
            <style id="chatStyles">
                .private-chat-container {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 800px;
                    height: 550px;
                    background: var(--gradient-card);
                    border-radius: 16px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                    display: flex;
                    z-index: 10000;
                    border: 1px solid var(--border);
                    overflow: hidden;
                }

                .private-chat-sidebar {
                    width: 280px;
                    background: rgba(0,0,0,0.2);
                    border-right: 1px solid var(--border);
                    display: flex;
                    flex-direction: column;
                }

                .chat-sidebar-header {
                    padding: 15px;
                    border-bottom: 1px solid var(--border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .chat-sidebar-header h3 {
                    margin: 0;
                    font-size: 16px;
                    color: var(--text-primary);
                }

                .close-chat-btn {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    font-size: 18px;
                }

                .close-chat-btn:hover {
                    color: var(--danger);
                }

                .dialogs-list {
                    flex: 1;
                    overflow-y: auto;
                }

                .dialog-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    border-bottom: 1px solid var(--border);
                }

                .dialog-item:hover {
                    background: rgba(59, 130, 246, 0.1);
                }

                .dialog-item.active {
                    background: rgba(59, 130, 246, 0.2);
                }

                .dialog-avatar {
                    width: 45px;
                    height: 45px;
                    border-radius: 50%;
                    object-fit: cover;
                }

                .dialog-avatar-placeholder {
                    width: 45px;
                    height: 45px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 20px;
                }

                .dialog-info {
                    flex: 1;
                    min-width: 0;
                }

                .dialog-name {
                    font-weight: bold;
                    color: var(--text-primary);
                    margin-bottom: 4px;
                }

                .dialog-last-message {
                    font-size: 12px;
                    color: var(--text-muted);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .dialog-unread {
                    background: #3b82f6;
                    color: white;
                    border-radius: 50%;
                    min-width: 20px;
                    height: 20px;
                    font-size: 11px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 5px;
                }

                .private-chat-main {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }

                .chat-main-header {
                    padding: 12px 15px;
                    border-bottom: 1px solid var(--border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .chat-user-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .chat-user-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    color: white;
                }

                .chat-user-details h4 {
                    margin: 0;
                    font-size: 16px;
                    color: var(--text-primary);
                }

                .chat-user-details span {
                    font-size: 12px;
                    color: var(--text-muted);
                }

                .close-chat-main-btn {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    font-size: 18px;
                }

                .chat-messages-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 15px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .chat-message {
                    max-width: 70%;
                    padding: 10px 14px;
                    border-radius: 18px;
                    font-size: 14px;
                    word-wrap: break-word;
                }

                .chat-message.sent {
                    align-self: flex-end;
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    color: white;
                }

                .chat-message.received {
                    align-self: flex-start;
                    background: rgba(255, 255, 255, 0.1);
                    color: var(--text-primary);
                }

                .chat-message-time {
                    font-size: 10px;
                    opacity: 0.6;
                    margin-top: 5px;
                    text-align: right;
                }

                .chat-input-area {
                    padding: 15px;
                    border-top: 1px solid var(--border);
                    display: flex;
                    gap: 10px;
                }

                .chat-input-area textarea {
                    flex: 1;
                    padding: 10px;
                    background: var(--bg-input);
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    color: var(--text-primary);
                    resize: none;
                    font-family: inherit;
                    font-size: 14px;
                }

                .chat-input-area textarea:focus {
                    outline: none;
                    border-color: #3b82f6;
                }

                .no-messages {
                    text-align: center;
                    padding: 40px;
                    color: var(--text-muted);
                }

                @media (max-width: 768px) {
                    .private-chat-container {
                        width: 100%;
                        height: 100%;
                        bottom: 0;
                        right: 0;
                        border-radius: 0;
                    }
                }
            </style>
        `;
        document.head.insertAdjacentHTML('beforeend', styles);
    }

    bindEvents() {
        const sendBtn = document.getElementById('sendChatMessageBtn');
        const messageInput = document.getElementById('chatMessageInput');

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
    }

    async loadDialogs() {
        try {
            const response = await fetch('/api/profile/dialogs', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                this.dialogs = await response.json();
                this.renderDialogs();
            }
        } catch (error) {
            console.error('Error loading dialogs:', error);
        }
    }

    renderDialogs() {
        const container = document.getElementById('dialogsList');
        if (!container) return;

        if (this.dialogs.length === 0) {
            container.innerHTML = '<div class="no-messages">Нет диалогов</div>';
            return;
        }

        container.innerHTML = this.dialogs.map(dialog => `
            <div class="dialog-item" data-user-id="${dialog.user_id}" onclick="privateChat.openDialog(${dialog.user_id}, '${this.escapeHtml(dialog.username)}')">
                ${dialog.avatar_url ?
            `<img src="${dialog.avatar_url}" class="dialog-avatar" onerror="this.src='/uploads/default-avatar.png'">` :
            `<div class="dialog-avatar-placeholder"><i class="fas fa-user"></i></div>`
        }
                <div class="dialog-info">
                    <div class="dialog-name">${this.escapeHtml(dialog.username)}</div>
                    <div class="dialog-last-message">${this.escapeHtml(dialog.last_message || 'Нет сообщений')}</div>
                </div>
                ${dialog.unread_count > 0 ? `<div class="dialog-unread">${dialog.unread_count}</div>` : ''}
            </div>
        `).join('');
    }

    async openDialog(userId, username, avatarUrl = null) {
        this.currentDialog = { userId, username, avatarUrl };

        // Обновляем заголовок
        const userNameEl = document.getElementById('chatUserName');
        const userAvatarEl = document.querySelector('.chat-user-avatar');

        if (userNameEl) userNameEl.textContent = username;
        if (userAvatarEl) {
            if (avatarUrl) {
                userAvatarEl.innerHTML = `<img src="${avatarUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">`;
            } else {
                userAvatarEl.innerHTML = '<i class="fas fa-user"></i>';
            }
        }

        // Показываем поле ввода
        const inputArea = document.querySelector('.chat-input-area');
        if (inputArea) inputArea.style.display = 'flex';

        // Загружаем историю сообщений
        await this.loadMessages(userId);

        // Присоединяемся к комнате чата через Socket.IO
        this.socket.emit('join_private_chat', userId);
    }

    async loadMessages(userId) {
        try {
            const response = await fetch(`/api/profile/messages/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const messages = await response.json();
                this.renderMessages(messages);
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    renderMessages(messages) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        const currentUserId = JSON.parse(localStorage.getItem('user')).id;

        if (messages.length === 0) {
            container.innerHTML = '<div class="no-messages">Напишите первое сообщение!</div>';
            return;
        }

        container.innerHTML = messages.map(msg => `
            <div class="chat-message ${msg.from_user_id === currentUserId ? 'sent' : 'received'}">
                ${msg.message}
                <div class="chat-message-time">${new Date(msg.created_at).toLocaleTimeString()}</div>
            </div>
        `).join('');

        // Прокручиваем вниз
        container.scrollTop = container.scrollHeight;
    }

    async sendMessage() {
        const input = document.getElementById('chatMessageInput');
        const message = input?.value.trim();

        if (!message || !this.currentDialog) return;

        try {
            const response = await fetch('/api/profile/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    toUserId: this.currentDialog.userId,
                    message: message
                })
            });

            if (response.ok) {
                input.value = '';
                const currentUserId = JSON.parse(localStorage.getItem('user')).id;
                this.addMessageToChat(currentUserId, message);

                // ✅ ОБНОВЛЯЕМ СПИСОК ДИАЛОГОВ
                await this.loadDialogs();

                // ✅ ОБНОВЛЯЕМ СЧЕТЧИК УВЕДОМЛЕНИЙ
                this.updateUnreadCount();
            }
        } catch (error) {
            console.error('Error sending message:', error);
            dialog.error('Не удалось отправить сообщение', 'Ошибка');
        }
    }




    updateUnreadCount() {
        const totalUnread = this.dialogs.reduce((sum, d) => sum + (d.unread_count || 0), 0);

        // Обновляем иконку на кнопке "Сообщения" во всех навигациях
        const messageButtons = document.querySelectorAll('.nav-link-primary, .btn-primary[onclick*="privateChat.openChat"]');
        messageButtons.forEach(btn => {
            if (totalUnread > 0) {
                btn.style.position = 'relative';
                // Удаляем старый счетчик
                const oldBadge = btn.querySelector('.unread-badge');
                if (oldBadge) oldBadge.remove();
                // Добавляем новый
                const badge = document.createElement('span');
                badge.className = 'unread-badge';
                badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
                badge.style.cssText = `
                position: absolute;
                top: -8px;
                right: -8px;
                background: #ef4444;
                color: white;
                border-radius: 50%;
                padding: 2px 6px;
                font-size: 10px;
                font-weight: bold;
                min-width: 18px;
                text-align: center;
            `;
                btn.style.position = 'relative';
                btn.appendChild(badge);
            } else {
                const oldBadge = btn.querySelector('.unread-badge');
                if (oldBadge) oldBadge.remove();
            }
        });
    }


    addMessageToChat(fromUserId, message) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        // Убираем заглушку если была
        const noMessages = container.querySelector('.no-messages');
        if (noMessages) noMessages.remove();

        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${fromUserId === JSON.parse(localStorage.getItem('user')).id ? 'sent' : 'received'}`;
        messageDiv.innerHTML = `
            ${message}
            <div class="chat-message-time">${new Date().toLocaleTimeString()}</div>
        `;
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }

    handleNewMessage(message) {
        // Обновляем список диалогов
        this.loadDialogs().then(() => {
            this.updateUnreadCount();
        });

        // Если открыт диалог с этим пользователем, добавляем сообщение
        if (this.currentDialog && this.currentDialog.userId === message.from_user_id) {
            this.addMessageToChat(message.from_user_id, message.message);
        } else {
            // Показываем уведомление
            this.showNotification(message);
        }
    }
    showNotification(message) {
        // Простое уведомление (можно улучшить)
        dialog.info(`Новое сообщение от ${message.from_username}`, 'Сообщение');
    }

    handleMessageRead(data) {
        // Обновляем список диалогов
        this.loadDialogs();
    }

    openChat() {
        const container = document.getElementById('privateChatContainer');
        if (container) {
            container.style.display = 'flex';
            this.isOpen = true;
            this.loadDialogs();
        }
    }

    closeChat() {
        const container = document.getElementById('privateChatContainer');
        if (container) {
            container.style.display = 'none';
            this.isOpen = false;
            this.currentDialog = null;
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
let privateChat;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    privateChat = new PrivateChat();
    window.privateChat = privateChat;
});