// public/js/voice-controller.js
class VoiceChatController {
    constructor() {
        this.isActive = false;
        this.isMuted = false;
        this.currentRoomId = null;
        this.room = null;
        this.localTrack = null;
        this.init();
    }

    init() {
        this.createUI();
        this.loadState();
        this.bindEvents();
    }

    createUI() {
        if (document.getElementById('voiceChatController')) return;

        const controllerHTML = `
            <div id="voiceChatController" style="display: none; position: fixed; top: 20px; left: 20px; z-index: 10000; background: linear-gradient(135deg, #1e293b, #0f172a); padding: 8px 16px; border-radius: 40px; color: white; font-size: 14px; font-weight: bold; box-shadow: 0 4px 15px rgba(0,0,0,0.3); backdrop-filter: blur(10px); border: 1px solid rgba(16, 185, 129, 0.5);">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i id="voiceChatIcon" class="fas fa-microphone" style="color: #10b981;"></i>
                        <span id="voiceChatStatus">Голосовой чат активен</span>
                    </div>
                    <div style="width: 1px; height: 30px; background: rgba(255,255,255,0.2);"></div>
                    <div style="display: flex; gap: 8px;">
                        <button id="globalMuteBtn" style="background: rgba(255,255,255,0.1); border: none; color: white; border-radius: 30px; padding: 6px 14px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                            <i id="globalMuteIcon" class="fas fa-microphone"></i>
                            <span id="globalMuteText">Выкл. микрофон</span>
                        </button>
                        <button id="globalStopVoiceBtn" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.5); color: #ef4444; border-radius: 30px; padding: 6px 14px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                            <i class="fas fa-stop"></i>
                            <span>Выйти из чата</span>
                        </button>
                    </div>
                </div>
            </div>
            <style>
                @keyframes voicePulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.1); }
                    100% { opacity: 1; transform: scale(1); }
                }
                #voiceChatIcon { animation: voicePulse 1.5s infinite; }
                #voiceChatController:hover { transform: scale(1.02); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
                #globalMuteBtn:hover { background: rgba(255,255,255,0.2); }
                #globalStopVoiceBtn:hover { background: rgba(239, 68, 68, 0.4); transform: scale(1.02); }
            </style>
        `;
        document.body.insertAdjacentHTML('beforeend', controllerHTML);
    }

    loadState() {
        const savedState = localStorage.getItem('voiceChatActive');
        const savedRoomId = localStorage.getItem('voiceChatRoomId');
        const savedMuteState = localStorage.getItem('voiceChatMuted');

        if (savedState === 'true' && savedRoomId) {
            this.currentRoomId = parseInt(savedRoomId);
            this.isActive = true;
            this.isMuted = savedMuteState === 'true';
            this.showController();
            this.updateMuteUI();
            setTimeout(() => this.reconnectVoiceChat(), 500);
        }
    }

    bindEvents() {
        document.getElementById('globalMuteBtn')?.addEventListener('click', () => this.toggleMute());
        document.getElementById('globalStopVoiceBtn')?.addEventListener('click', () => this.stopVoiceChat());
    }

    showController() {
        const controller = document.getElementById('voiceChatController');
        if (controller) controller.style.display = 'block';
    }

    hideController() {
        const controller = document.getElementById('voiceChatController');
        if (controller) controller.style.display = 'none';
    }

    updateMuteUI() {
        const muteIcon = document.getElementById('globalMuteIcon');
        const muteText = document.getElementById('globalMuteText');
        const muteBtn = document.getElementById('globalMuteBtn');

        if (this.isMuted) {
            if (muteIcon) muteIcon.className = 'fas fa-microphone-slash';
            if (muteText) muteText.textContent = 'Вкл. микрофон';
            if (muteBtn) {
                muteBtn.style.background = 'rgba(239, 68, 68, 0.2)';
                muteBtn.style.border = '1px solid rgba(239, 68, 68, 0.5)';
            }
            if (this.localTrack) {
                this.localTrack.setEnabled(false);
            }
        } else {
            if (muteIcon) muteIcon.className = 'fas fa-microphone';
            if (muteText) muteText.textContent = 'Выкл. микрофон';
            if (muteBtn) {
                muteBtn.style.background = 'rgba(255,255,255,0.1)';
                muteBtn.style.border = 'none';
            }
            if (this.localTrack) {
                this.localTrack.setEnabled(true);
            }
        }
    }

    toggleMute() {
        if (!this.isActive) return;
        this.isMuted = !this.isMuted;
        this.updateMuteUI();
        this.showToast(this.isMuted ? '🔇 Микрофон выключен' : '🎤 Микрофон включен', 'info');
        localStorage.setItem('voiceChatMuted', this.isMuted);
    }

    async reconnectVoiceChat() {
        if (!this.currentRoomId) return;
        const currentUser = this.getCurrentUser();
        await this.connectToLiveKit(currentUser.username);
    }

    async connectToLiveKit(userName) {
        try {
            const roomName = `ra`; // Используем комнату из вашего токена

            console.log('Connecting to LiveKit room:', roomName);

            // Временно используем сгенерированный токен
            const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3Nzk2Mjg4NDEsImlkZW50aXR5IjoibWF4IiwiaXNzIjoiQVBJNGZDZmlBSGNXNk12IiwibmJmIjoxNzc5NjI3OTQxLCJzdWIiOiJtYXgiLCJ2aWRlbyI6eyJjYW5QdWJsaXNoIjp0cnVlLCJjYW5QdWJsaXNoRGF0YSI6dHJ1ZSwiY2FuU3Vic2NyaWJlIjp0cnVlLCJyb29tIjoicmEiLCJyb29tSm9pbiI6dHJ1ZX19.BkopQ5it5t63Ro1bnMBVwQ4yr8p36PFsQnaWjnPMgHc";

            console.log('Token length:', token.length);

            const wsUrl = 'wss://squadfinder-2kn7agll.livekit.cloud';

            // Создаем Room
            this.room = new LivekitClient.Room();

            // Обработчики
            this.room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
                console.log('Track subscribed:', track.kind, 'from:', participant.identity);
                if (track.kind === 'audio') {
                    const audioElement = new Audio();
                    audioElement.srcObject = new MediaStream([track.mediaStreamTrack]);
                    audioElement.play().catch(e => console.log('Audio play error:', e));
                }
            });

            this.room.on(LivekitClient.RoomEvent.ParticipantConnected, (participant) => {
                console.log('Participant connected:', participant.identity);
                this.showToast(`🎤 ${participant.name || participant.identity} присоединился`, 'info');
            });

            this.room.on(LivekitClient.RoomEvent.Connected, () => {
                console.log('✅ Connected to LiveKit room!');
            });

            // Подключаемся
            await this.room.connect(wsUrl, token);
            console.log('✅ Connected!');

            // Публикуем микрофон
            this.localTrack = await LivekitClient.createLocalAudioTrack();
            await this.room.localParticipant.publishTrack(this.localTrack);
            console.log('✅ Microphone published');

            if (this.isMuted) {
                this.localTrack.setEnabled(false);
            }

            this.showToast('✅ Голосовой чат подключен', 'success');

        } catch (error) {
            console.error('LiveKit connection error:', error);
            this.showToast('Ошибка подключения: ' + error.message, 'error');
            this.stopVoiceChat();
        }
    }
    getCurrentUser() {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch (e) {
                return { username: 'Player' };
            }
        }
        return { username: 'Player' };
    }

    async startVoiceChat(roomId, roomName) {
        if (this.isActive) {
            this.stopVoiceChat();
            return;
        }

        try {
            const currentUser = this.getCurrentUser();

            this.isActive = true;
            this.isMuted = false;
            this.currentRoomId = roomId;

            this.showController();
            this.updateMuteUI();

            localStorage.setItem('voiceChatActive', 'true');
            localStorage.setItem('voiceChatRoomId', this.currentRoomId);
            localStorage.setItem('voiceChatMuted', this.isMuted);

            await this.connectToLiveKit(currentUser.username);

            this.showToast('🎙️ Голосовой чат включен (LiveKit)', 'success');

        } catch (error) {
            console.error('Error starting voice chat:', error);
            this.showToast('Не удалось запустить голосовой чат', 'error');
            this.stopVoiceChat();
        }
    }

    stopVoiceChat() {
        if (this.room) {
            this.room.disconnect();
            this.room = null;
        }
        if (this.localTrack) {
            this.localTrack.stop();
            this.localTrack = null;
        }

        this.isActive = false;
        this.currentRoomId = null;
        this.hideController();

        localStorage.removeItem('voiceChatActive');
        localStorage.removeItem('voiceChatRoomId');
        localStorage.removeItem('voiceChatMuted');

        this.showToast('🔇 Голосовой чат выключен', 'info');
    }

    showToast(message, type = 'info') {
        if (typeof showToast === 'function') {
            showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    toggleVoiceChat(roomId, roomName) {
        if (this.isActive && this.currentRoomId === roomId) {
            this.stopVoiceChat();
        } else if (this.isActive && this.currentRoomId !== roomId) {
            this.stopVoiceChat();
            setTimeout(() => this.startVoiceChat(roomId, roomName), 500);
        } else {
            this.startVoiceChat(roomId, roomName);
        }
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    if (!window.voiceController) {
        window.voiceController = new VoiceChatController();
    }
});