const socket = io();

let myName = '';
let myRoomId = '';
let myMode = '';
let isHost = false;

// CREATE ROOM
document.getElementById('coopBtn').onclick = () => createRoom('coop');
document.getElementById('pvpBtn').onclick = () => createRoom('pvp');

function createRoom(mode) {
  myName = document.getElementById('playerName').value.trim() || 'Player';
  socket.emit('createRoom', { name: myName, mode });
}

// JOIN ROOM
document.getElementById('joinBtn').onclick = () => {
  myName = document.getElementById('playerName').value.trim() || 'Player';
  const roomId = document.getElementById('roomCode').value.trim();
  if (!roomId) {
    document.getElementById('menuMsg').textContent = 'Room code dao!';
    return;
  }
  socket.emit('joinRoom', { name: myName, roomId });
};

// ROOM CREATED
socket.on('roomCreated', ({ roomId, mode }) => {
  myRoomId = roomId;
  myMode = mode;
  isHost = true;
  showLobby(roomId, mode);
});

// ROOM JOINED
socket.on('roomJoined', ({ roomId, mode }) => {
  myRoomId = roomId;
  myMode = mode;
  isHost = false;
  showLobby(roomId, mode);
  document.getElementById('waitMsg').textContent = 'Host er start korar wait koro...';
  document.getElementById('startBtn').classList.add('hidden');
});

function showLobby(roomId, mode) {
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('lobby').classList.remove('hidden');
  document.getElementById('roomIdShow').textContent = roomId;
  document.getElementById('modeShow').textContent = mode.toUpperCase();
  if (isHost) {
    document.getElementById('startBtn').classList.remove('hidden');
    document.getElementById('waitMsg').textContent = 'Player 2 er wait koro...';
  }
}

// PLAYERS UPDATE
socket.on('playersUpdate', (players) => {
  const count = Object.keys(players).length;
  if (count >= 2 && isHost) {
    document.getElementById('waitMsg').textContent = 'Dujon ready! Start koro.';
  }
});

// START GAME
document.getElementById('startBtn').onclick = () => {
  socket.emit('startGame', { roomId: myRoomId });
};

socket.on('gameStarted', () => {
  document.getElementById('lobby').classList.add('hidden');
  if (window.startGame) window.startGame();
});

// ERRORS
socket.on('errorMsg', (msg) => {
  document.getElementById('menuMsg').textContent = msg;
});

// PLAYER LEFT
socket.on('playerLeft', () => {
  alert('Onno player chole gese! Menu te fire jao.');
  location.reload();
});

// RESTART
document.getElementById('restartBtn').onclick = () => location.reload();
