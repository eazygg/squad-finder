// public/js/app.js
class SquadFinderApp {
    constructor() {
        this.init();
    }

    async init() {
        await this.checkServerStatus();
        this.bindEvents();
    }

    async checkServerStatus() {
        try {
            const response = await fetch('/api/test');
            const data = await response.json();

            const statusElement = document.getElementById('status');
            if (data.status === 'OK') {
                statusElement.innerHTML = `
                    <div class="status success">
                        <i class="fas fa-check-circle"></i>
                        <strong>✅ Сервер и база данных работают!</strong><br>
                        <small>Время в БД: ${new Date(data.databaseTime).toLocaleString('ru-RU')}</small>
                    </div>
                `;
            } else {
                statusElement.innerHTML = `
                    <div class="status error">
                        <i class="fas fa-exclamation-circle"></i>
                        <strong>⚠️ Ошибка сервера</strong><br>
                        <small>${data.error || 'Неизвестная ошибка'}</small>
                    </div>
                `;
            }
        } catch (error) {
            document.getElementById('status').innerHTML = `
                <div class="status error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>❌ Ошибка подключения к серверу</strong><br>
                    <small>${error.message}</small>
                </div>
            `;
        }
    }

    bindEvents() {
        // Обработчики для авторизации
        document.getElementById('loginBtn').addEventListener('click', () => {
            this.showModal('loginModal');
        });

        document.getElementById('registerBtn').addEventListener('click', () => {
            this.showModal('registerModal');
        });

        // Закрытие модальных окон
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                this.hideModals();
            });
        });

        // Обработка форм
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        // Закрытие по клику вне окна
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideModals();
            }
        });
    }

    showModal(modalId) {
        this.hideModals();
        document.getElementById(modalId).style.display = 'block';
    }

    hideModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
        // Очищаем сообщения об ошибках
        const loginMessage = document.getElementById('loginMessage');
        const registerMessage = document.getElementById('registerMessage');
        if (loginMessage) loginMessage.style.display = 'none';
        if (registerMessage) registerMessage.style.display = 'none';
    }

    async handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            this.showMessage('loginMessage', 'Заполните все поля', 'error');
            return;
        }

        try {
            const loginBtn = document.querySelector('#loginForm button');
            const originalText = loginBtn.innerHTML;
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Вход...';
            loginBtn.disabled = true;

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            loginBtn.innerHTML = originalText;
            loginBtn.disabled = false;

            if (response.ok) {
                this.showMessage('loginMessage', 'Успешный вход! Перенаправление...', 'success');
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));

                setTimeout(() => {
                    this.hideModals();
                    if (data.user.test_completed) {
                        window.location.href = '/profile.html';
                    } else {
                        window.location.href = '/test.html';
                    }
                }, 1500);
            } else {
                this.showMessage('loginMessage', data.error || 'Ошибка входа', 'error');
            }
        } catch (error) {
            const loginBtn = document.querySelector('#loginForm button');
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Войти';
            loginBtn.disabled = false;
            this.showMessage('loginMessage', 'Ошибка соединения с сервером', 'error');
        }
    }

    async handleRegister() {
        const email = document.getElementById('registerEmail').value;
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (!email || !username || !password || !confirmPassword) {
            this.showMessage('registerMessage', 'Заполните все поля', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.showMessage('registerMessage', 'Пароли не совпадают', 'error');
            return;
        }

        if (password.length < 6) {
            this.showMessage('registerMessage', 'Пароль должен быть минимум 6 символов', 'error');
            return;
        }

        try {
            const registerBtn = document.querySelector('#registerForm button');
            const originalText = registerBtn.innerHTML;
            registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Регистрация...';
            registerBtn.disabled = true;

            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, username, password, confirmPassword })
            });

            const data = await response.json();

            registerBtn.innerHTML = originalText;
            registerBtn.disabled = false;

            if (response.ok) {
                this.showMessage('registerMessage', 'Регистрация успешна! Перенаправление на вход...', 'success');

                setTimeout(() => {
                    this.hideModals();
                    document.getElementById('loginEmail').value = email;
                    this.showModal('loginModal');
                }, 1500);
            } else {
                this.showMessage('registerMessage', data.error || 'Ошибка регистрации', 'error');
            }
        } catch (error) {
            const registerBtn = document.querySelector('#registerForm button');
            registerBtn.innerHTML = '<i class="fas fa-user-plus"></i> Зарегистрироваться';
            registerBtn.disabled = false;
            this.showMessage('registerMessage', 'Ошибка соединения с сервером', 'error');
        }
    }

    showMessage(elementId, message, type) {
        const element = document.getElementById(elementId);
        element.textContent = message;
        element.className = type === 'success' ? 'message-success' : 'message-error';
        element.style.display = 'block';

        setTimeout(() => {
            element.style.display = 'none';
        }, 3000);
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    new SquadFinderApp();
});