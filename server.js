const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// Room store
const rooms = {};

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create room
  socket.on('createRoom', ({ name, mode }) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      mode,
      host: socket.id,
      players: {
        [socket.id]: {
          name,
          x: 400,
          y: 500,
          score: 0,
          hp: 100,
          alive: true
        }
      },
      enemies: [],
      bullets: []
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('roomCreated', { roomId, mode });
    io.to(roomId).emit('playersUpdate', rooms[roomId].players);
  });

  // Join room
  socket.on('joinRoom', ({ name, roomId }) => {
    roomId = roomId.toUpperCase();
    const room = rooms[roomId];
    if (!room) {
      socket.emit('errorMsg', 'Room paoa jay nai!');
      return;
    }
    if (Object.keys(room.players).length >= 2) {
      socket.emit('errorMsg', 'Room full!');
      return;
    }
    room.players[socket.id] = {
      name,
      x: 400,
      y: 500,
      score: 0,
      hp: 100,
      alive: true
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('roomJoined', { roomId, mode: room.mode });
    io.to(roomId).emit('playersUpdate', room.players);
  });

  // START GAME — host theke
  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return;
    io.to(roomId).emit('gameStarted');
  });

  // Player movement
  socket.on('playerMove', ({ x, y }) => {
    const room = rooms[socket.roomId];
    if (!room || !room.players[socket.id]) return;
    room.players[socket.id].x = x;
    room.players[socket.id].y = y;
    socket.to(socket.roomId).emit('playerMoved', { id: socket.id, x, y });
  });

  // Bullet fired
  socket.on('fireBullet', ({ x, y }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    socket.to(socket.roomId).emit('bulletFired', { id: socket.id, x, y });
  });

  // Enemy spawned by host
  socket.on('spawnEnemy', (enemy) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    socket.to(socket.roomId).emit('enemySpawned', enemy);
  });

  // Enemy killed
  socket.on('enemyKilled', ({ enemyId, playerId, score }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    if (room.players[playerId]) {
      room.players[playerId].score += score;
    }
    io.to(socket.roomId).emit('playersUpdate', room.players);
  });

  // PvP hit
  socket.on('playerHit', ({ targetId, damage }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const target = room.players[targetId];
    if (!target) return;
    target.hp -= damage;
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      setTimeout(() => {
        if (room.players[targetId]) {
          room.players[targetId].hp = 100;
          room.players[targetId].alive = true;
          io.to(socket.roomId).emit('playersUpdate', room.players);
        }
      }, 3000);
    }
    io.to(socket.roomId).emit('playersUpdate', room.players);
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].players[socket.id];
      if (Object.keys(rooms[roomId].players).length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('playersUpdate', rooms[roomId].players);
        io.to(roomId).emit('playerLeft');
      }
    }
    console.log('Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
