class AppStateManager {
    constructor() {
        this.listeners = [];
        this.isUpdating = false;
    }

    // Подписка на обновления состояния
    onStateUpdate(callback) {
        this.listeners.push(callback);
    }

    // Уведомление всех подписчиков об изменении
    notifyStateUpdate(action, data = null) {
        console.log(`🔄 Обновление состояния: ${action}`, data);
        this.listeners.forEach(callback => {
            try {
                callback(action, data);
            } catch (error) {
                console.error('Ошибка в обработчике обновления:', error);
            }
        });
    }

    // Выполнение действия с автоматическим обновлением
    async executeWithUpdate(actionFn, successMessage = null) {
        if (this.isUpdating) return;

        try {
            this.isUpdating = true;
            const result = await actionFn();

            if (successMessage) {
                showToast(successMessage, 'success');
            }

            return result;
        } catch (error) {
            console.error('Ошибка выполнения действия:', error);
            showToast(error.message || 'Произошла ошибка', 'error');
            throw error;
        } finally {
            this.isUpdating = false;
        }
    }
}

// Глобальный экземпляр
const appState = new AppStateManager();