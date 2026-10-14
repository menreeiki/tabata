const socket = io();

let currentRoomId = null;
let currentLang = 'kk';
let isHost = false;

// Защита от повторного клика по карте
let isCardClickLocked = false;
let cardLockTimer = null;

function formatRoot(value) {
    if (!Number.isFinite(Number(value))) return String(value ?? '');
    const rounded = Math.abs(Number(value)) < 0.0000001 ? 0 : Number(Number(value).toFixed(4));
    return String(rounded).replace('.', ',');
}


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


// ======================================================
// ИГРА НАЧАЛАСЬ
// ======================================================

socket.on(
    'gameStarted',
    ({ players, tableCard, firstCard }) => {

        // После начала игры снова разрешаем клик
        isCardClickLocked = false;
        if (cardLockTimer) { clearTimeout(cardLockTimer); cardLockTimer = null; }

        startGameInterface(
            players,
            tableCard,
            firstCard
        );

    }
);


// ======================================================
// ОБНОВЛЕНИЕ ИГРЫ
// ======================================================

socket.on(
    'updateGame',
    ({
        players,
        tableCard,
        lastMoveMessage,
        firstCard
    }) => {

        // Обновление игры не должно снимать персональную блокировку штрафа.
        if (!cardLockTimer) isCardClickLocked = false;

        startGameInterface(
            players,
            tableCard,
            firstCard
        );

        if (lastMoveMessage) {

            console.log(
                lastMoveMessage
            );

        }

    }
);


socket.on('playRejected', (data) => {
    isCardClickLocked = false;
    if (cardLockTimer) { clearTimeout(cardLockTimer); cardLockTimer = null; }
    if (data?.message) console.warn(data.message);
});


// ======================================================
// ШТРАФ
// ======================================================

socket.on('penalty', (data) => {
    isCardClickLocked = true;
    if (cardLockTimer) clearTimeout(cardLockTimer);
    const duration = Number(data.duration) || 0;
    if (duration > 0) {
        cardLockTimer = setTimeout(() => {
            isCardClickLocked = false;
            cardLockTimer = null;
            showPenaltyScreen('Штраф окончен', 'Время штрафа прошло. Теперь можно снова выбирать карты.');
        }, duration);
    } else {
        isCardClickLocked = false;
    }
    showPenaltyScreen(data.message, data.description);
});


// ======================================================
// ОТОБРАЖЕНИЕ ИГРЫ
// ======================================================

function startGameInterface(
    players,
    tableCard,
    firstCard = false
) {

    document
        .getElementById('lobby')
        .classList.add('hidden');

    document
        .getElementById('waitingRoom')
        .classList.add('hidden');

    document
        .getElementById('gameArea')
        .classList.remove('hidden');


    // ==================================================
    // ЦЕНТРАЛЬНАЯ КАРТА
    // ==================================================

    const centerCardEl =
        document.getElementById('centerCard');


    if (!tableCard) {

        centerCardEl.innerHTML = `

            <div class="card center-card first-card-placeholder">

                <div class="equation-text">

                    ${
                        currentLang === 'kk'
                        ? 'Бірінші картаны таңдаңыз!'
                        : 'Выберите первую карту!'
                    }

                </div>

            </div>

        `;

    } else {

        centerCardEl.innerHTML = `

            <div class="card center-card">

                <div class="corner-top-left" style="position:absolute;top:8px;left:8px;z-index:5;color:#fff;font-size:13px;font-weight:800;line-height:1.2;pointer-events:none;">x₁ = ${formatRoot(tableCard.answers[0])}</div>
                <div class="corner-top-right" style="position:absolute;top:8px;right:8px;z-index:5;color:#fff;font-size:13px;font-weight:800;line-height:1.2;pointer-events:none;transform:none;">x₂ = ${formatRoot(tableCard.answers[1])}</div>
                <div class="equation-text">${tableCard.equation}</div>

            </div>

        `;

    }


    // ==================================================
    // СТАТУС ИГРОКОВ
    // ==================================================

    const statusContainer =
        document.getElementById(
            'playersStatusContainer'
        );


    statusContainer.innerHTML =
        players
            .map(p => `

                <span class="player-badge">

                    <b>${p.name}</b>:
                    ${p.cards.length} карт(а) · ${currentLang === 'kk' ? 'Ұпай' : 'Очки'}: ${p.score ?? 0}

                </span>

            `)
            .join(' | ');


    // ==================================================
    // НАША РУКА
    // ==================================================

    const me =
        players.find(
            p => p.id === socket.id
        );


    const handEl =
        document.getElementById(
            'myHand'
        );


    handEl.innerHTML = '';


    if (!me || !me.cards) {
        return;
    }


    me.cards.forEach(card => {

        const cardDiv =
            document.createElement('div');


        cardDiv.className =
            'tabata-card card';


        // ==================================================
        // УГЛЫ = displayNumber
        // answers НЕ показываем
        // ==================================================

        cardDiv.innerHTML = `

            <div class="corner-top-left" style="position:absolute;top:8px;left:8px;z-index:5;color:#fff;font-size:13px;font-weight:800;line-height:1.2;pointer-events:none;">x₁ = ${formatRoot(card.answers[0])}</div>
            <div class="corner-top-right" style="position:absolute;top:8px;right:8px;z-index:5;color:#fff;font-size:13px;font-weight:800;line-height:1.2;pointer-events:none;transform:none;">x₂ = ${formatRoot(card.answers[1])}</div>
            <div class="equation-text">${card.equation}</div>

        `;


        // ==================================================
        // КЛИК ПО КАРТЕ
        // ==================================================

        cardDiv.addEventListener(
            'click',
            function (e) {

                e.preventDefault();
                e.stopPropagation();

                // Если предыдущий клик ещё обрабатывается —
                // ничего больше не отправляем
                if (isCardClickLocked) {
                    return;
                }

                // Без комнаты играть нельзя
                if (!currentRoomId) {
                    console.log(
                        'Ошибка: currentRoomId отсутствует'
                    );
                    return;
                }

                // Блокируем повторное нажатие
                isCardClickLocked = true;

                console.log(
                    'Карта отправлена:',
                    card.id,
                    'Комната:',
                    currentRoomId
                );

                socket.emit(
                    'playCard',
                    {
                        roomId: currentRoomId,
                        cardId: card.id
                    }
                );

            }
        );


        // ==================================================
        // ВАЖНО:
        //
        // touchend ЗДЕСЬ БОЛЬШЕ НЕТ.
        //
        // Иначе на некоторых устройствах одно касание
        // вызывает touchend + click и карта отправляется
        // два раза.
        // ==================================================


        handEl.appendChild(cardDiv);

    });

}


// ======================================================
// ЭКРАН ШТРАФА
// ======================================================

function showPenaltyScreen(
    title,
    description
) {

    const screen =
        document.getElementById(
            'penaltyScreen'
        );


    if (!screen) {
        return;
    }


    document
        .getElementById('penaltyTitle')
        .textContent = title;


    document
        .getElementById('penaltyDescription')
        .textContent = description;


    screen.classList.remove(
        'hidden'
    );


    // Через 2 секунды закрываем
    setTimeout(() => {

        screen.classList.add(
            'hidden'
        );

    }, 2000);

}


// ======================================================
// ЗАКРЫТИЕ ШТРАФА
// ======================================================

function closePenaltyScreen() {

    const screen =
        document.getElementById(
            'penaltyScreen'
        );

    if (screen) {

        screen.classList.add(
            'hidden'
        );

    }

}


// ======================================================
// КОНЕЦ ИГРЫ / РЕЙТИНГ
// ======================================================

socket.on(
    'gameOver',
    ({ winner, ranking }) => {

        isCardClickLocked = true;
        if (cardLockTimer) { clearTimeout(cardLockTimer); cardLockTimer = null; }

        showRatingScreen(
            winner,
            ranking
        );

    }
);


// ======================================================
// РЕЙТИНГ
// ======================================================

function showRatingScreen(
    winner,
    ranking
) {

    const screen =
        document.getElementById(
            'ratingScreen'
        );


    const winnerEl =
        document.getElementById(
            'ratingWinner'
        );


    const listEl =
        document.getElementById(
            'ratingList'
        );


    winnerEl.textContent =
        `🏆 ${
            currentLang === 'kk'
                ? 'Жеңімпаз'
                : 'Победитель'
        }: ${winner}`;


    listEl.innerHTML =
        ranking
            .map(player => `

                <div class="rating-row">

                    <div class="rating-place">
                        ${player.place}
                    </div>

                    <div class="rating-name">
                        ${player.name}
                    </div>

                    <div class="rating-info">

                        ${
                            currentLang === 'kk'
                            ? 'Ұпай'
                            : 'Очки'
                        }:
                        <b>${player.score}</b>

                        &nbsp; | &nbsp;

                        ${
                            currentLang === 'kk'
                            ? 'Қалған карталар'
                            : 'Карт осталось'
                        }:
                        <b>${player.cardsLeft}</b>

                        &nbsp; | &nbsp;

                        ${
                            currentLang === 'kk'
                            ? 'Штраф'
                            : 'Штрафов'
                        }:
                        <b>${player.penalties}</b>

                    </div>

                </div>

            `)
            .join('');


    screen.classList.remove(
        'hidden'
    );

}


// ======================================================
// ПЕРЕЗАПУСК
// ======================================================

function restartGame() {

    location.reload();

}