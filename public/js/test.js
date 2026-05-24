// public/js/test.js
class PsychologicalTest {
    constructor() {
        this.isRetake = false; // Флаг перепрохождения
        if (!this.checkAuthentication()) {
            return;
        }

        this.questions = [];
        this.currentQuestionIndex = 0;
        this.answers = {};
        this.userId = null;

        this.init();
    }

    checkAuthentication() {
        const token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');

        if (!token || !userStr) {
            dialog.alert('Для прохождения теста необходимо авторизоваться');
            window.location.href = '/';
            return false;
        }

        const user = JSON.parse(userStr);
        this.userId = user.id;

        // Проверяем, перепроходим ли мы тест
        const urlParams = new URLSearchParams(window.location.search);
        this.isRetake = urlParams.get('retake') === 'true';

        if (user.test_completed && !this.isRetake) {
            dialog.confirm(
                'Вы уже проходили тест. Хотите пройти его заново?',
                'Перепрохождение теста'
            ).then((confirmed) => {
                if (confirmed) {
                    window.location.href = '/test.html?retake=true';
                } else {
                    window.location.href = '/profile.html';
                }
            });
            return false;
        }

        return true;
    }

    async init() {
        await this.loadQuestions();
        this.bindEvents();
        this.showQuestion(0);

        if (this.isRetake) {
            this.showRetakeInfo();
        }
    }

    showRetakeInfo() {
        const infoDiv = document.createElement('div');
        infoDiv.className = 'retake-info';
        infoDiv.innerHTML = `
            <div class="retake-banner">
                <i class="fas fa-sync-alt"></i>
                <span>Вы проходите тест заново. Предыдущие результаты будут сохранены в истории.</span>
            </div>
        `;
        document.getElementById('testContainer').insertBefore(infoDiv, document.getElementById('questionCard'));
    }

    async loadQuestions() {
        try {
            const response = await fetch('/api/profile/questions');
            this.questions = await response.json();
            this.initializeAnswers();
            this.updateProgress();
        } catch (error) {
            console.error('Ошибка загрузки вопросов:', error);
            dialog.error('Ошибка загрузки вопросов теста');
        }
    }

    initializeAnswers() {
        this.questions.forEach(question => {
            this.answers[question.id] = null;
        });
    }

    bindEvents() {
        document.getElementById('prevBtn').addEventListener('click', () => {
            this.previousQuestion();
        });

        document.getElementById('nextBtn').addEventListener('click', () => {
            if (this.validateCurrentQuestion()) {
                this.nextQuestion();
            }
        });

        document.getElementById('submitTestBtn').addEventListener('click', () => {
            if (this.validateAllQuestions()) {
                this.submitTest();
            }
        });

        document.getElementById('findTeamsBtn').addEventListener('click', () => {
            this.findTeams();
        });
    }

    showQuestion(index) {
        if (index < 0 || index >= this.questions.length) return;

        this.currentQuestionIndex = index;
        const question = this.questions[index];

        document.getElementById('questionText').textContent = question.question_text;
        this.renderOptions(question);
        this.updateProgress();
        this.updateNavigation();
        this.showQuestionValidation();
    }

    renderOptions(question) {
        const container = document.getElementById('optionsContainer');
        container.innerHTML = '';

        const options = [
            { score: 1, text: 'Совершенно не согласен' },
            { score: 2, text: 'Не согласен' },
            { score: 3, text: 'Нейтрален' },
            { score: 4, text: 'Согласен' },
            { score: 5, text: 'Полностью согласен' }
        ];

        options.forEach(option => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `option-btn ${this.answers[question.id] === option.score ? 'selected' : ''}`;
            button.innerHTML = `
                ${option.text}
                <span class="score">${option.score}</span>
            `;

            button.addEventListener('click', () => {
                this.selectAnswer(question.id, option.score);
                this.hideQuestionValidation();
            });

            container.appendChild(button);
        });
    }

    selectAnswer(questionId, score) {
        this.answers[questionId] = score;
        this.renderOptions(this.questions[this.currentQuestionIndex]);
        this.updateNavigation();

        setTimeout(() => {
            if (this.currentQuestionIndex < this.questions.length - 1) {
                this.nextQuestion();
            } else {
                this.updateNavigation();
            }
        }, 300);
    }

    validateCurrentQuestion() {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        const isAnswered = this.answers[currentQuestion.id] !== null;

        if (!isAnswered) {
            this.showQuestionValidation();
            return false;
        }

        return true;
    }

    validateAllQuestions() {
        return Object.values(this.answers).every(answer => answer !== null);
    }

    showQuestionValidation() {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        const isAnswered = this.answers[currentQuestion.id] !== null;

        let validationElement = document.getElementById('questionValidation');
        if (!validationElement) {
            validationElement = document.createElement('div');
            validationElement.id = 'questionValidation';
            validationElement.className = 'validation-message';
            document.getElementById('questionCard').appendChild(validationElement);
        }

        if (!isAnswered) {
            validationElement.innerHTML = '<div class="validation-error"><i class="fas fa-exclamation-circle"></i> Пожалуйста, выберите ответ</div>';
            validationElement.style.display = 'block';
        } else {
            validationElement.style.display = 'none';
        }
    }

    hideQuestionValidation() {
        const validationElement = document.getElementById('questionValidation');
        if (validationElement) {
            validationElement.style.display = 'none';
        }
    }

    updateProgress() {
        const answeredCount = Object.values(this.answers).filter(answer => answer !== null).length;
        const totalCount = this.questions.length;

        const progress = this.currentQuestionIndex === totalCount - 1 ? 100 : (answeredCount / totalCount) * 100;

        document.getElementById('progressFill').style.width = `${progress}%`;
        document.getElementById('progressStats').textContent = `Отвечено: ${this.currentQuestionIndex === totalCount - 1 ? totalCount : answeredCount}/${totalCount}`;
        document.getElementById('currentQuestion').textContent = this.currentQuestionIndex + 1;
        document.getElementById('totalQuestions').textContent = totalCount;
    }

    updateNavigation() {
        const currentQuestion = this.questions[this.currentQuestionIndex];
        const isAnswered = this.answers[currentQuestion.id] !== null;

        document.getElementById('prevBtn').style.display = this.currentQuestionIndex > 0 ? 'block' : 'none';
        document.getElementById('nextBtn').style.display = 'none';

        const isLastQuestion = this.currentQuestionIndex === this.questions.length - 1;
        document.getElementById('submitTestBtn').style.display = isLastQuestion && isAnswered ? 'block' : 'none';

        if (isLastQuestion) {
            const allAnswered = Object.values(this.answers).every(answer => answer !== null);
            document.getElementById('submitTestBtn').disabled = !allAnswered;
        }
    }

    nextQuestion() {
        if (this.validateCurrentQuestion() && this.currentQuestionIndex < this.questions.length - 1) {
            this.showQuestion(this.currentQuestionIndex + 1);
        }
    }

    previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.showQuestion(this.currentQuestionIndex - 1);
        }
    }

    async submitTest() {
        if (!this.validateAllQuestions()) {
            return;
        }

        try {
            document.getElementById('progressStats').textContent = `Отвечено: 25/25`;

            const formattedAnswers = Object.entries(this.answers).map(([questionId, score]) => ({
                questionId: parseInt(questionId),
                score: score,
                trait: this.questions.find(q => q.id === parseInt(questionId)).trait
            }));

            document.getElementById('submitTestBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправка...';
            document.getElementById('submitTestBtn').disabled = true;

            // Выбираем нужный эндпоинт
            const endpoint = this.isRetake ? '/api/profile/retake-test' : '/api/profile/submit-test';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    answers: formattedAnswers
                })
            });

            const results = await response.json();

            if (response.ok) {
                if (this.isRetake) {
                    dialog.success(results.message || 'Результаты сохранены!', 'Тест пройден');
                } else {
                    dialog.success('Тест успешно пройден!', 'Поздравляем!');
                }
                this.showResults(results.traits, results.testNumber);
            } else {
                dialog.error(results.error || 'Ошибка отправки результатов');
                document.getElementById('submitTestBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Отправить результаты';
                document.getElementById('submitTestBtn').disabled = false;
            }
        } catch (error) {
            console.error('Ошибка:', error);
            dialog.error('Ошибка соединения с сервером');
            document.getElementById('submitTestBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Отправить результаты';
            document.getElementById('submitTestBtn').disabled = false;
        }
    }

    showResults(traits, testNumber = null) {
        document.getElementById('testContainer').style.display = 'none';
        document.getElementById('resultsContainer').style.display = 'block';

        const container = document.getElementById('traitsResults');
        container.innerHTML = '';

        const traitNames = {
            openness: 'Открытость опыту',
            conscientiousness: 'Добросовестность',
            extraversion: 'Экстраверсия',
            agreeableness: 'Доброжелательность',
            neuroticism: 'Нейротизм'
        };

        const traitDescriptions = {
            openness: score => score > 5 ? 'Склонен к экспериментам' : 'Предпочитает проверенные методы',
            conscientiousness: score => score > 5 ? 'Любит планирование' : 'Спонтанный подход',
            extraversion: score => score > 5 ? 'Прирожденный лидер' : 'Предпочитает следовать',
            agreeableness: score => score > 5 ? 'Командный игрок' : 'Индивидуалист',
            neuroticism: score => score > 5 ? 'Эмоциональный' : 'Стрессоустойчивый'
        };

        for (const [trait, score] of Object.entries(traits)) {
            const card = document.createElement('div');
            card.className = 'trait-card';
            card.innerHTML = `
                <div class="trait-name">${traitNames[trait]}</div>
                <div class="trait-score">${score}/10</div>
                <div class="trait-description">${traitDescriptions[trait](score)}</div>
            `;
            container.appendChild(card);
        }

        // Добавляем кнопку для просмотра истории
        const historyBtn = document.createElement('button');
        historyBtn.className = 'btn btn-secondary';
        historyBtn.style.marginTop = '20px';
        historyBtn.innerHTML = '<i class="fas fa-history"></i> Посмотреть историю тестов';
        historyBtn.onclick = () => {
            window.location.href = '/profile.html?showHistory=true';
        };
        document.getElementById('resultsContainer').appendChild(historyBtn);
    }

    findTeams() {
        window.location.href = '/profile.html';
    }
}

// Запуск теста
document.addEventListener('DOMContentLoaded', () => {
    new PsychologicalTest();
});