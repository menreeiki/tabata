const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static('public'));

const rooms = {};
const PENALTY_MS = 40_000;

// 24 исходные карточки. Корни вычисляются по коэффициентам a, b, c.
const cardTemplates = [
    { equation: 'x² - 6x + 5 = 0', a: 1, b: -6, c: 5 },
    { equation: '5x² + 14x + 8 = 0', a: 5, b: 14, c: 8 },
    { equation: '-7x² + 3x + 4 = 0', a: -7, b: 3, c: 4 },
    { equation: 'x² - 4x - 12 = 0', a: 1, b: -4, c: -12 },
    { equation: '6x² + 5x - 4 = 0', a: 6, b: 5, c: -4 },
    { equation: 'x² + 5x - 24 = 0', a: 1, b: 5, c: -24 },
    { equation: '-10x² - 7x + 3 = 0', a: -10, b: -7, c: 3 },
    { equation: 'x² - 8x + 16 = 0', a: 1, b: -8, c: 16 },
    { equation: 'x² - 12x + 27 = 0', a: 1, b: -12, c: 27 },
    { equation: '2x² - 5x + 2 = 0', a: 2, b: -5, c: 2 },
    { equation: 'x² + 7x + 10 = 0', a: 1, b: 7, c: 10 },
    { equation: '3x² - 10x + 3 = 0', a: 3, b: -10, c: 3 },
    { equation: 'x² - 9 = 0', a: 1, b: 0, c: -9 },
    { equation: '4x² - 9 = 0', a: 4, b: 0, c: -9 },
    { equation: 'x² + 6x + 9 = 0', a: 1, b: 6, c: 9 },
    { equation: '2x² + 3x - 2 = 0', a: 2, b: 3, c: -2 },
    { equation: 'x² - x - 20 = 0', a: 1, b: -1, c: -20 },
    { equation: 'x² + 2x - 15 = 0', a: 1, b: 2, c: -15 },
    { equation: '5x² - 6x + 1 = 0', a: 5, b: -6, c: 1 },
    { equation: 'x² - 7x + 12 = 0', a: 1, b: -7, c: 12 },
    { equation: 'x² + 4x - 5 = 0', a: 1, b: 4, c: -5 },
    { equation: '3x² + 7x + 2 = 0', a: 3, b: 7, c: 2 },
    { equation: 'x² - 2x - 8 = 0', a: 1, b: -2, c: -8 },
    { equation: '2x² + 5x + 2 = 0', a: 2, b: 5, c: 2 }
];

function getRoots({ a, b, c }) {
    const d = b * b - 4 * a * c;
    if (d < 0 || a === 0) return [];
    const sqrtD = Math.sqrt(d);
    // Keep the usual x1, x2 order from the quadratic formula.
    return [(-b + sqrtD) / (2 * a), (-b - sqrtD) / (2 * a)];
}

function generateDeck() {
    return cardTemplates.map((template, index) => ({
        id: index + 1,
        equation: template.equation,
        a: template.a,
        b: template.b,
        c: template.c,
        answers: getRoots(template)
    }));
}

function shuffle(cards) {
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
}

function normalizeNumber(value) {
    if (value === null || value === undefined) return NaN;
    return Number(String(value).trim().replace(',', '.'));
}

function cardMatchesTableCard(card, tableCard) {
    if (!card || !tableCard || !Array.isArray(tableCard.answers)) return false;
    return card.answers.some(value => tableCard.answers.some(root =>
        Number.isFinite(normalizeNumber(value)) &&
        Number.isFinite(normalizeNumber(root)) &&
        Math.abs(normalizeNumber(value) - normalizeNumber(root)) < 0.0001
    ));
}

function getRoomId(room) {
    return Object.keys(rooms).find(id => rooms[id] === room);
}

function publicPlayers(room) {
    // Карты каждой руки передаются только её владельцу; всем видны число карт и очки.
    return room.players.map(player => ({
        id: player.id,
        name: player.name,
        score: player.score,
        penalties: player.penalties,
        cards: player.id === undefined ? [] : player.cards
    }));
}

function broadcastGame(room, lastMoveMessage = '') {
    const roomId = getRoomId(room);
    if (!roomId) return;
    for (const player of room.players) {
        io.to(player.id).emit('updateGame', {
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                penalties: p.penalties,
                cards: p.cards
            })),
            tableCard: room.tableCard,
            remainingCards: room.remainingCardIds.length,
            lastMoveMessage,
            firstCard: !room.tableCard
        });
    }
}

function finishGame(room) {
    room.gameStarted = false;
    const roomId = getRoomId(room);
    if (!roomId) return;
    const ranking = [...room.players]
        .sort((a, b) => b.score - a.score || a.penalties - b.penalties)
        .map((player, index) => ({
            place: index + 1,
            name: player.name,
            cardsLeft: player.cards.length,
            score: player.score,
            penalties: player.penalties
        }));
    io.to(roomId).emit('gameOver', {
        winner: ranking[0]?.name || '—',
        ranking
    });
}

io.on('connection', socket => {
    console.log(`Игрок подключился: ${socket.id}`);

    socket.on('createRoom', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            host: socket.id,
            players: [{ id: socket.id, name: playerName, cards: [], score: 0, penalties: 0, blockedUntil: 0 }],
            tableCard: null,
            remainingCardIds: [],
            gameStarted: false
        };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
        console.log(`Комната создана: ${roomId}`);
    });

    socket.on('joinRoom', ({ roomId, playerName }) => {
        roomId = String(roomId || '').trim().toUpperCase();
        const room = rooms[roomId];
        if (!room) return socket.emit('errorMsg', 'Комната не найдена!');
        if (room.gameStarted) return socket.emit('errorMsg', 'Игра уже началась!');
        if (![2, 3, 4, 6].includes(room.players.length + 1)) {
            return socket.emit('errorMsg', 'В игре могут участвовать 2, 3, 4 или 6 игроков!');
        }
        if (room.players.some(p => p.id === socket.id)) return;
        room.players.push({ id: socket.id, name: playerName, cards: [], score: 0, penalties: 0, blockedUntil: 0 });
        socket.join(roomId);
        socket.emit('roomJoined', { roomId, players: room.players });
        io.to(roomId).emit('updatePlayers', room.players);
        console.log(`${playerName} вошёл в комнату ${roomId}`);
    });

    socket.on('startGame', roomId => {
        const room = rooms[roomId];
        if (!room || room.host !== socket.id || room.gameStarted) return;
        if (![2, 3, 4, 6].includes(room.players.length)) {
            return socket.emit('errorMsg', 'Для начала игры нужно 2, 3, 4 или 6 игроков!');
        }

        room.gameStarted = true;
        room.tableCard = null;
        const deck = generateDeck();
        room.remainingCardIds = deck.map(card => card.id);

        // У каждого игрока один и тот же набор из 24 карт, но в своём порядке.
        for (const player of room.players) {
            player.cards = shuffle(deck.map(card => ({ ...card, answers: [...card.answers] })));
            player.score = 0;
            player.penalties = 0;
            player.blockedUntil = 0;
        }

        io.to(roomId).emit('gameStarted', {
            players: room.players,
            tableCard: null,
            firstCard: true,
            remainingCards: room.remainingCardIds.length
        });
        console.log(`Игра ${roomId} началась`);
    });

    socket.on('playCard', ({ roomId, cardId }) => {
        const room = rooms[roomId];
        if (!room || !room.gameStarted) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        if (Date.now() < player.blockedUntil) {
            socket.emit('penalty', {
                message: 'ШТРАФ!',
                description: `Подождите ещё ${Math.ceil((player.blockedUntil - Date.now()) / 1000)} сек.`,
                duration: player.blockedUntil - Date.now()
            });
            return;
        }

        const cardIndex = player.cards.findIndex(card => String(card.id) === String(cardId));
        if (cardIndex < 0) {
            socket.emit('playRejected', { message: 'Этой карты нет в вашей руке.' });
            return;
        }
        const cardPlayed = player.cards[cardIndex];

        // Первый ход — любая карта. Далее нужно выбрать карту,
        // чей корень совпадает с одним из корней центрального уравнения.
        const isCorrect = !room.tableCard || cardMatchesTableCard(cardPlayed, room.tableCard);
        if (!isCorrect) {
            player.penalties += 1;
            player.score = Math.max(0, player.score - 1);
            player.blockedUntil = Date.now() + PENALTY_MS;
            socket.emit('penalty', {
                message: 'ШТРАФ: −40 секунд',
                description: 'Карта не подходит к корням центрального уравнения. Нажимать снова можно через 40 секунд.',
                duration: PENALTY_MS
            });
            broadcastGame(room, `${player.name} ошибся — штраф 40 секунд и −1 очко.`);
            return;
        }

        // Только у нажавшего игрока удаляется сыгранная карта.
        // У остальных руки остаются прежними, меняется лишь общий центр.
        player.cards.splice(cardIndex, 1);
        room.tableCard = cardPlayed;
        player.score += 1;

        // Игра завершается, когда хотя бы у одного игрока закончились карты.
        // Победитель определяется рейтингом по очкам, а не фактом завершения.
        if (player.cards.length === 0) {
            broadcastGame(room, `${player.name} заработал(а) 1 очко и остался без карт!`);
            finishGame(room);
            return;
        }
        broadcastGame(room, `${player.name} заработал(а) 1 очко!`);
    });

    socket.on('disconnect', () => {
        for (const roomId of Object.keys(rooms)) {
            const room = rooms[roomId];
            room.players = room.players.filter(player => player.id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[roomId];
                continue;
            }
            if (room.host === socket.id) room.host = room.players[0].id;
            io.to(roomId).emit('updatePlayers', room.players);
        }
        console.log(`Игрок отключился: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));