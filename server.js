const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static('public'));

const rooms = Object.create(null);
const PENALTY_MS = 40_000;

// Карточки и значения углов переписаны с карточек из приложенного документа.
// a, b, c используются для точной проверки корней уравнения.
const cardTemplates = [
 {equation:'x² - 6x + 5 = 0', a:1,b:-6,c:5,displayNumber:'-2'},
 {equation:'5x² + 14x + 8 = 0',a:5,b:14,c:8,displayNumber:'1'},
 {equation:'-7x² + 3x + 4 = 0',a:-7,b:3,c:4,displayNumber:'3'},
 {equation:'x² - 4x - 12 = 0',a:1,b:-4,c:-12,displayNumber:'3'},
 {equation:'6x² + 5x - 4 = 0',a:6,b:5,c:-4,displayNumber:'4'},
 {equation:'x² + 5x - 24 = 0',a:1,b:5,c:-24,displayNumber:'0,5'},
 {equation:'-10x² - 7x + 3 = 0',a:-10,b:-7,c:3,displayNumber:'-2'},
 {equation:'x² - 8x + 16 = 0',a:1,b:-8,c:16,displayNumber:'-1'},
 {equation:'x² - 12x + 27 = 0',a:1,b:-12,c:27,displayNumber:'1,5'},
 {equation:'2x³ + 27x - 240 = 0',a:2,b:27,c:-240,displayNumber:'1,5'},
 {equation:'5x² - 17x + 6 = 0',a:5,b:-17,c:6,displayNumber:'0,5'},
 {equation:'6x² - 15x + 0 = 0',a:6,b:-15,c:0,displayNumber:'3'},
 {equation:'-10x² + 19x + 6 = 0',a:-10,b:19,c:6,displayNumber:'0,5'},
 {equation:'4x² + 24x - 13 = 0',a:4,b:24,c:-13,displayNumber:'1'},
 {equation:'-6x² - x - 1 = 0',a:-6,b:-1,c:-1,displayNumber:'-1'},
 {equation:'x² + 9x + 8 = 0',a:1,b:9,c:8,displayNumber:'0,5'},
 {equation:'4x² + 12x - 7 = 0',a:4,b:12,c:-7,displayNumber:'-1'},
 {equation:'2x² - 6x + 4 = 0',a:2,b:-6,c:4,displayNumber:'4'},
 {equation:'-25x² + 21x - 4 = 0',a:-25,b:21,c:-4,displayNumber:'-2'},
 {equation:'2x² + 7x + 6 = 0',a:2,b:7,c:6,displayNumber:'4'},
 {equation:'x² - 16x + 48 = 0',a:1,b:-16,c:48,displayNumber:'-1'},
 {equation:'2x² + 3x + 1 = 0',a:2,b:3,c:1,displayNumber:'1,5'},
 {equation:'x² + x - 20 = 0',a:1,b:1,c:-20,displayNumber:'1'},
 {equation:'14x² - 33x + 18 = 0',a:14,b:-33,c:18,displayNumber:'1'}
];

function roots(card) {
  const d = card.b * card.b - 4 * card.a * card.c;
  if (d < 0 || !card.a) return [];
  const sq = Math.sqrt(d);
  return [(-card.b + sq) / (2 * card.a), (-card.b - sq) / (2 * card.a)];
}
function num(v) {
  if (v === null || v === undefined) return NaN;
  return Number(String(v).trim().replace(',', '.'));
}
function matches(card, tableCard) {
  const n = num(card && card.displayNumber);
  return Number.isFinite(n) && roots(tableCard).some(r => Math.abs(r - n) < 0.011);
}
function shuffledCards() {
  const cards = cardTemplates.map((t, i) => ({...t, id:i+1, answers:roots(t)}));
  for (let i=cards.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [cards[i],cards[j]]=[cards[j],cards[i]];
  }
  return cards;
}
function roomIdFor(room) { return Object.keys(rooms).find(id => rooms[id] === room); }
function publicPlayers(room) {
  return room.players.map(p => ({
    id:p.id, name:p.name, cards:p.cards, score:p.score, penalties:p.penalties,
    penaltyUntil: Math.max(0, p.penaltyUntil - Date.now())
  }));
}
function broadcast(room, message='') {
  const id=roomIdFor(room); if (!id) return;
  io.to(id).emit('updateGame', {players:publicPlayers(room), tableCard:room.tableCard, lastMoveMessage:message});
}
function finish(room, winner) {
  room.gameStarted=false;
  const id=roomIdFor(room); if (!id) return;
  const ranking=[...room.players].sort((a,b) =>
    a.cards.length-b.cards.length || b.score-a.score || a.penalties-b.penalties
  ).map((p,i)=>({place:i+1,name:p.name,cardsLeft:p.cards.length,score:p.score,penalties:p.penalties}));
  io.to(id).emit('gameOver',{winner:winner.name,ranking});
}
io.on('connection', socket => {
  socket.on('createRoom', ({playerName}) => {
    const id=Math.random().toString(36).slice(2,7).toUpperCase();
    rooms[id]={host:socket.id,players:[{id:socket.id,name:playerName,cards:[],score:0,penalties:0,penaltyUntil:0}],tableCard:null,gameStarted:false};
    socket.join(id); socket.emit('roomCreated',id);
  });
  socket.on('joinRoom', ({roomId,playerName}) => {
    roomId=String(roomId||'').trim().toUpperCase();
    const room=rooms[roomId];
    if (!room) return socket.emit('errorMsg','Комната не найдена!');
    if (room.gameStarted) return socket.emit('errorMsg','Игра уже началась!');
    if (![2,3,4,6].includes(room.players.length+1)) return socket.emit('errorMsg','В игре могут участвовать 2, 3, 4 или 6 игроков!');
    if (room.players.some(p=>p.id===socket.id)) return;
    room.players.push({id:socket.id,name:playerName,cards:[],score:0,penalties:0,penaltyUntil:0});
    socket.join(roomId);
    socket.emit('roomJoined',{roomId,players:room.players});
    io.to(roomId).emit('updatePlayers',room.players);
  });
  socket.on('startGame', roomId => {
    const room=rooms[roomId];
    if (!room || room.host!==socket.id || room.gameStarted) return;
    if (![2,3,4,6].includes(room.players.length)) return socket.emit('errorMsg','Для начала игры нужно 2, 3, 4 или 6 игроков!');
    room.gameStarted=true; room.tableCard=null;
    room.players.forEach(p=>{p.cards=shuffledCards();p.score=0;p.penalties=0;p.penaltyUntil=0;});
    io.to(roomId).emit('gameStarted',{players:publicPlayers(room),tableCard:null,firstCard:true});
  });
  socket.on('playCard', ({roomId,cardId}) => {
    const room=rooms[roomId];
    if (!room || !room.gameStarted) return;
    const player=room.players.find(p=>p.id===socket.id);
    if (!player) return;
    const now = Date.now();
    if (now < player.penaltyUntil) {
      socket.emit('penalty',{message:'ШТРАФ!',description:'Подождите окончания штрафа.',seconds:Math.ceil((player.penaltyUntil-now)/1000)});
      return;
    }
    // По окончании штрафа сбрасываем состояние, чтобы следующие ходы
    // не зависели от старой временной метки.
    player.penaltyUntil = 0;
    const idx=player.cards.findIndex(c=>String(c.id)===String(cardId));
    if (idx<0) return;
    const card=player.cards[idx];
    // Первый игрок может начать раунд любой картой.
    if (!room.tableCard) {
      player.cards.splice(idx,1);
      room.tableCard=card;
      player.score++;
      if (!player.cards.length) return finish(room,player);
      broadcast(room,`${player.name} заработал(а) 1 очко!`);
      return;
    }
    // Каждый следующий выбор проверяется сервером по корням центрального уравнения.
    if (matches(card,room.tableCard)) {
      player.cards.splice(idx,1);
      room.tableCard=card;
      player.score++;
      if (!player.cards.length) return finish(room,player);
      broadcast(room,`${player.name} заработал(а) 1 очко!`);
    } else {
      player.penalties++;
      player.penaltyUntil=Date.now()+PENALTY_MS;
      socket.emit('penalty',{message:'ШТРАФ!',description:'Неверный ответ. Вы не можете нажимать карты 40 секунд.',seconds:40});
      broadcast(room,`${player.name} получил(а) штраф −40 секунд!`);
    }
  });
  socket.on('disconnect', () => {
    for (const id of Object.keys(rooms)) {
      const room=rooms[id];
      room.players=room.players.filter(p=>p.id!==socket.id);
      if (!room.players.length) { delete rooms[id]; continue; }
      if (room.host===socket.id) room.host=room.players[0].id;
      io.to(id).emit('updatePlayers',room.players);
    }
  });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Сервер запущен на порту ${PORT}`));