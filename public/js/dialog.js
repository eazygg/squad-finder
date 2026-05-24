// public/js/dialog.js
/**
 * Универсальная система модальных диалогов
 * Заменяет стандартные alert/confirm на красивые модальные окна
 */

class DialogManager {
    constructor() {
        this.createModalStructure();
    }

    createModalStructure() {
        // Создаем контейнер для модальных окон, если его нет
        if (document.getElementById('globalModalContainer')) return;

        const modalHTML = `
            <div id="globalModalContainer" style="display: none;">
                <div class="dialog-overlay">
                    <div class="dialog-modal">
                        <div class="dialog-header">
                            <div class="dialog-icon">
                                <i class="fas"></i>
                            </div>
                            <h3 class="dialog-title">Заголовок</h3>
                            <button class="dialog-close-btn">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div class="dialog-body">
                            <p class="dialog-message"></p>
                            <div class="dialog-input-group" style="display: none;">
                                <input type="text" class="dialog-input" placeholder="Введите значение...">
                            </div>
                        </div>
                        <div class="dialog-footer">
                            <button class="dialog-btn dialog-btn-cancel">Отмена</button>
                            <button class="dialog-btn dialog-btn-confirm">OK</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Добавляем стили
        this.addDialogStyles();

        // Запоминаем элементы
        this.container = document.getElementById('globalModalContainer');
        this.overlay = document.querySelector('.dialog-overlay');
        this.modal = document.querySelector('.dialog-modal');
        this.titleEl = document.querySelector('.dialog-title');
        this.messageEl = document.querySelector('.dialog-message');
        this.iconEl = document.querySelector('.dialog-icon i');
        this.confirmBtn = document.querySelector('.dialog-btn-confirm');
        this.cancelBtn = document.querySelector('.dialog-btn-cancel');
        this.closeBtn = document.querySelector('.dialog-close-btn');
        this.inputGroup = document.querySelector('.dialog-input-group');
        this.inputEl = document.querySelector('.dialog-input');

        // Привязываем события
        this.cancelBtn.addEventListener('click', () => this.hide());
        this.closeBtn.addEventListener('click', () => this.hide());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });

        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.container.style.display !== 'none') {
                this.hide();
            }
        });
    }

    addDialogStyles() {
        if (document.getElementById('dialogStyles')) return;

        const styles = `
            <style id="dialogStyles">
                .dialog-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    animation: fadeIn 0.2s ease;
                }

                .dialog-modal {
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 16px;
                    min-width: 320px;
                    max-width: 450px;
                    width: 90%;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    animation: slideIn 0.3s ease;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .dialog-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 20px 20px 0 20px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    padding-bottom: 15px;
                }

                .dialog-icon {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                }

                .dialog-icon i {
                    font-size: 18px;
                }

                .dialog-title {
                    flex: 1;
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    color: #fff;
                }

                .dialog-close-btn {
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.5);
                    cursor: pointer;
                    font-size: 18px;
                    padding: 5px;
                    transition: all 0.2s;
                }

                .dialog-close-btn:hover {
                    color: #fff;
                    transform: rotate(90deg);
                }

                .dialog-body {
                    padding: 20px;
                }

                .dialog-message {
                    margin: 0;
                    color: rgba(255, 255, 255, 0.9);
                    line-height: 1.5;
                    font-size: 15px;
                }

                .dialog-input-group {
                    margin-top: 15px;
                }

                .dialog-input {
                    width: 100%;
                    padding: 10px 12px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #fff;
                    font-size: 14px;
                    transition: all 0.2s;
                }

                .dialog-input:focus {
                    outline: none;
                    border-color: #6c5ce7;
                    box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.2);
                }

                .dialog-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    padding: 0 20px 20px 20px;
                }

                .dialog-btn {
                    padding: 8px 20px;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .dialog-btn-cancel {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                }

                .dialog-btn-cancel:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .dialog-btn-confirm {
                    background: linear-gradient(135deg, #6c5ce7, #a363d9);
                    color: white;
                }

                .dialog-btn-confirm:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 5px 15px rgba(108, 92, 231, 0.3);
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            </style>
        `;
        document.head.insertAdjacentHTML('beforeend', styles);
    }

    /**
     * Показать информационное сообщение
     */
    alert(message, title = 'Уведомление', icon = 'info-circle') {
        return new Promise((resolve) => {
            this.iconEl.className = `fas fa-${icon}`;
            this.titleEl.textContent = title;
            this.messageEl.textContent = message;
            this.inputGroup.style.display = 'none';
            this.confirmBtn.textContent = 'OK';
            this.cancelBtn.style.display = 'block';

            // Для alert скрываем кнопку отмены
            this.cancelBtn.style.display = 'none';

            const onConfirm = () => {
                this.hide();
                resolve(true);
            };

            this.confirmBtn.onclick = onConfirm;
            this.closeBtn.onclick = onConfirm;
            this.container.style.display = 'block';
        });
    }

    /**
     * Показать подтверждение (OK / Отмена)
     */
    confirm(message, title = 'Подтверждение', icon = 'question-circle') {
        return new Promise((resolve) => {
            this.iconEl.className = `fas fa-${icon}`;
            this.titleEl.textContent = title;
            this.messageEl.textContent = message;
            this.inputGroup.style.display = 'none';
            this.confirmBtn.textContent = 'Да';
            this.cancelBtn.textContent = 'Отмена';
            this.cancelBtn.style.display = 'block';

            this.confirmBtn.onclick = () => {
                this.hide();
                resolve(true);
            };

            this.cancelBtn.onclick = () => {
                this.hide();
                resolve(false);
            };

            this.closeBtn.onclick = () => {
                this.hide();
                resolve(false);
            };

            this.container.style.display = 'block';
        });
    }

    /**
     * Показать prompt (с полем ввода)
     */
    prompt(message, defaultValue = '', title = 'Ввод данных', icon = 'edit') {
        return new Promise((resolve) => {
            this.iconEl.className = `fas fa-${icon}`;
            this.titleEl.textContent = title;
            this.messageEl.textContent = message;
            this.inputGroup.style.display = 'block';
            this.inputEl.value = defaultValue;
            this.inputEl.focus();
            this.confirmBtn.textContent = 'OK';
            this.cancelBtn.textContent = 'Отмена';
            this.cancelBtn.style.display = 'block';

            const onConfirm = () => {
                const value = this.inputEl.value.trim();
                this.hide();
                resolve(value);
            };

            const onCancel = () => {
                this.hide();
                resolve(null);
            };

            this.confirmBtn.onclick = onConfirm;
            this.cancelBtn.onclick = onCancel;
            this.closeBtn.onclick = onCancel;

            // Enter в инпуте
            this.inputEl.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    onConfirm();
                }
            };

            this.container.style.display = 'block';
        });
    }

    /**
     * Показать ошибку
     */
    error(message, title = 'Ошибка') {
        return this.alert(message, title, 'exclamation-triangle');
    }

    /**
     * Показать успешное сообщение
     */
    success(message, title = 'Успех') {
        return this.alert(message, title, 'check-circle');
    }

    info(message, title = 'Информация') {
        return this.alert(message, title, 'info-circle');
    }

    /**
     * Скрыть диалог
     */
    hide() {
        this.container.style.display = 'none';
        // Сбрасываем обработчики
        this.confirmBtn.onclick = null;
        this.cancelBtn.onclick = null;
        this.closeBtn.onclick = null;
    }
}

// Создаем глобальный экземпляр
const dialog = new DialogManager();

// Заменяем стандартные функции
window.alert = (message) => dialog.alert(message);
window.confirm = (message) => dialog.confirm(message);
window.prompt = (message, defaultValue) => dialog.prompt(message, defaultValue);