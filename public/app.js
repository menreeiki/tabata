const socket = io();

let currentRoomId = null;
let currentLang = 'kk';
let isHost = false;

// Защита от повторного клика по карте
let isCardClickLocked = false;


// ======================================================
// ПЕРЕВОДЫ
// ======================================================

const translations = {

    kk: {

        createTitle: "Жаңа бөлме құру",
        joinTitle: "Бөлмеге қосылу",

        btnCreate: "Бөлме ашу",
        btnJoin: "Қосылу",

        waitingTitle: "Ойыншылар күтілуде...",

        roomCodeLabel: "Бөлме коды:",

        centerTitle: "Ортадағы карточка (теңдеу):",

        myHandTitle: "Сіздің қолдағы карталарыңыз:",

        btnStart: "Ойынды бастау"

    },

    ru: {

        createTitle: "Создать комнату",
        joinTitle: "Присоединиться",

        btnCreate: "Создать",
        btnJoin: "Войти",

        waitingTitle: "Ожидание игроков...",

        roomCodeLabel: "Код комнаты:",

        centerTitle: "Карточка в центре (уравнение):",

        myHandTitle: "Ваши карты на руках:",

        btnStart: "Начать игру"

    }

};


// ======================================================
// ЯЗЫК
// ======================================================

function setLanguage(lang) {

    currentLang = lang;

    document
        .getElementById('btn-kk')
        .classList.toggle('active', lang === 'kk');

    document
        .getElementById('btn-ru')
        .classList.toggle('active', lang === 'ru');

    document
        .querySelectorAll('[data-key]')
        .forEach(el => {

            const key = el.getAttribute('data-key');

            if (translations[lang][key]) {

                el.textContent =
                    translations[lang][key];

            }

        });
}


// ======================================================
// MODAL
// ======================================================

function showModal(text) {

    document
        .getElementById('modalMessage')
        .textContent = text;

    document
        .getElementById('customModal')
        .classList.remove('hidden');
}


function closeModal() {

    document
        .getElementById('customModal')
        .classList.add('hidden');
}


// ======================================================
// СОЗДАНИЕ КОМНАТЫ
// ======================================================

function createRoom() {

    const name =
        document
            .getElementById('playerName')
            .value
            .trim();

    if (!name) {

        return showModal(
            'Атыңызды енгізіңіз / Введите имя'
        );

    }

    isHost = true;

    socket.emit('createRoom', {
        playerName: name
    });
}


// ======================================================
// ВХОД
// ======================================================

function joinRoom() {

    const name =
        document
            .getElementById('playerName')
            .value
            .trim();

    const roomId =
        document
            .getElementById('roomCodeInput')
            .value
            .trim()
            .toUpperCase();

    if (!name || !roomId) {

        return showModal(
            'Деректерді толық толтырыңыз / Заполните данные'
        );

    }

    isHost = false;

    socket.emit('joinRoom', {
        roomId,
        playerName: name
    });
}


// ======================================================
// КОМНАТА СОЗДАНА
// ======================================================

socket.on('roomCreated', (roomId) => {

    currentRoomId = roomId;

    showWaitingRoom(
        roomId,
        [
            {
                id: socket.id,
                name:
                    document
                        .getElementById('playerName')
                        .value
                        .trim()
            }
        ]
    );

});


// ======================================================
// ИГРОК УСПЕШНО ВОШЕЛ В КОМНАТУ
// ======================================================

socket.on('roomJoined', ({ roomId, players }) => {

    currentRoomId = roomId;

    isHost = false;

    showWaitingRoom(
        roomId,
        players
    );

});


// ======================================================
// ИГРОКИ
// ======================================================

socket.on('updatePlayers', (players) => {

    updatePlayerList(players);

});


socket.on('errorMsg', (msg) => {

    showModal(msg);

});


// ======================================================
// ОЖИДАНИЕ
// ======================================================

function showWaitingRoom(roomId, players) {

    document
        .getElementById('lobby')
        .classList.add('hidden');

    document
        .getElementById('waitingRoom')
        .classList.remove('hidden');

    document
        .getElementById('displayRoomCode')
        .textContent = roomId;

    updatePlayerList(players);

    const startBtn =
        document.getElementById('startBtn');

    if (startBtn) {

        startBtn.style.display =
            isHost ? 'block' : 'none';

    }

}


function updatePlayerList(players) {

    const list =
        document.getElementById('playerList');

    list.innerHTML =
        players
            .map(p => `<li>${p.name}</li>`)
            .join('');

}


// ======================================================
// СТАРТ
// ======================================================

function hostStartGame() {

    if (currentRoomId && isHost) {

        socket.emit(
            'startGame',
            currentRoomId
        );

    }

}



let penaltyUntil = 0;
let penaltyTimer = null;

socket.on('gameStarted', ({ players, tableCard }) => {
    isCardClickLocked = false;
    startGameInterface(players, tableCard);
});

socket.on('updateGame', ({ players, tableCard, lastMoveMessage }) => {
    isCardClickLocked = false;
    startGameInterface(players, tableCard);
    if (lastMoveMessage) showToast(lastMoveMessage);
});

socket.on('penalty', ({ message, description, seconds = 40 }) => {
    isCardClickLocked = false;
    penaltyUntil = Date.now() + seconds * 1000;
    showToast(`${message || 'ШТРАФ!'} ${description || ''} — ${seconds} сек.`);
    updatePenaltyCountdown();
    if (penaltyTimer) clearInterval(penaltyTimer);
    penaltyTimer = setInterval(() => {
        if (Date.now() >= penaltyUntil) {
            clearInterval(penaltyTimer);
            penaltyTimer = null;
            showToast(currentLang === 'kk' ? 'Айып уақыты аяқталды!' : 'Штрафное время закончилось!');
        } else updatePenaltyCountdown();
    }, 250);
});

socket.on('gameOver', ({ winner, ranking }) => {
    isCardClickLocked = true;
    showRatingScreen(winner, ranking);
});

function updatePenaltyCountdown() {
    const left = Math.max(0, Math.ceil((penaltyUntil - Date.now()) / 1000));
    const hand = document.getElementById('myHand');
    if (hand) hand.dataset.penaltyLeft = String(left);
}

function showToast(message) {
    let toast = document.getElementById('gameToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'gameToast';
        toast.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:9999;background:#fff;color:#2c003e;padding:12px 20px;border-radius:12px;font-weight:700;box-shadow:0 4px 18px #0005;max-width:90vw;text-align:center';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.display = 'none'; }, 2800);
}

function startGameInterface(players, tableCard) {
    document.getElementById('lobby')?.classList.add('hidden');
    document.getElementById('waitingRoom')?.classList.add('hidden');
    document.getElementById('gameArea')?.classList.remove('hidden');

    const center = document.getElementById('centerCard');
    if (center) {
        center.innerHTML = tableCard ? `
            <div class="card center-card">
                <div class="corner-top-left">${escapeHtml(tableCard.displayNumber)}</div>
                <div class="corner-top-right">${escapeHtml(tableCard.displayNumber)}</div>
                <div class="equation-text">${escapeHtml(tableCard.equation)}</div>
                <div class="corner-bottom-left">${escapeHtml(tableCard.displayNumber)}</div>
                <div class="corner-bottom-right">${escapeHtml(tableCard.displayNumber)}</div>
            </div>` : `
            <div class="card center-card first-card-placeholder">
                <div class="equation-text">${currentLang === 'kk' ? 'Бірінші картаны таңдаңыз!' : 'Выберите первую карту!'}</div>
            </div>`;
    }

    const status = document.getElementById('playersStatusContainer');
    if (status) status.innerHTML = players.map(p =>
        `<span class="player-badge"><b>${escapeHtml(p.name)}</b>: ${p.cards.length} карт(а) · ${currentLang === 'kk' ? 'Ұпай' : 'Очки'}: ${p.score || 0}</span>`
    ).join(' | ');

    const me = players.find(p => p.id === socket.id);
    const hand = document.getElementById('myHand');
    if (!hand) return;
    hand.innerHTML = '';
    if (!me || !Array.isArray(me.cards)) return;

    me.cards.forEach(card => {
        const el = document.createElement('div');
        el.className = 'tabata-card card';
        el.innerHTML = `
            <div class="corner-top-left">${escapeHtml(card.displayNumber)}</div>
            <div class="corner-top-right">${escapeHtml(card.displayNumber)}</div>
            <div class="equation-text">${escapeHtml(card.equation)}</div>
            <div class="corner-bottom-left">${escapeHtml(card.displayNumber)}</div>
            <div class="corner-bottom-right">${escapeHtml(card.displayNumber)}</div>`;
        el.addEventListener('click', e => {
            e.preventDefault();
            if (isCardClickLocked || Date.now() < penaltyUntil || !currentRoomId) return;
            isCardClickLocked = true;
            socket.emit('playCard', { roomId: currentRoomId, cardId: card.id });
            // Re-enable if the server rejects a duplicate/invalid request.
            setTimeout(() => { isCardClickLocked = false; }, 700);
        });
        hand.appendChild(el);
    });
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function showRatingScreen(winner, ranking) {
    const screen = document.getElementById('ratingScreen');
    const winnerEl = document.getElementById('ratingWinner');
    const listEl = document.getElementById('ratingList');
    if (!screen || !winnerEl || !listEl) {
        showModal(`${currentLang === 'kk' ? 'Жеңімпаз' : 'Победитель'}: ${winner}`);
        return;
    }
    winnerEl.textContent = `🏆 ${currentLang === 'kk' ? 'Жеңімпаз' : 'Победитель'}: ${winner}`;
    listEl.innerHTML = ranking.map(p => `
        <div class="rating-row">
            <div class="rating-place">${p.place}</div>
            <div class="rating-name">${escapeHtml(p.name)}</div>
            <div class="rating-info">${currentLang === 'kk' ? 'Ұпай' : 'Очки'}: <b>${p.score}</b> ·
            ${currentLang === 'kk' ? 'Қалған карталар' : 'Карт осталось'}: <b>${p.cardsLeft}</b> ·
            ${currentLang === 'kk' ? 'Штраф' : 'Штрафов'}: <b>${p.penalties}</b></div>
        </div>`).join('');
    screen.classList.remove('hidden');
}

function restartGame() { location.reload(); }