let game;
let scene;
let myPlayer;
let otherPlayers = {};
let bullets;
let enemyBullets;
let enemies;
let cursors;
let wasd;
let spaceKey;
let lastSend = 0;
let gameRunning = false;

// START GAME — socket.js theke call hobe
window.startGame = function () {
  if (gameRunning) return;
  gameRunning = true;

  const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#000011',
    parent: document.body,
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: { preload, create, update }
  };
  game = new Phaser.Game(config);
};

function preload() {
  // Kichu load korte hobe na
}

function create() {
  scene = this;

  // ----- MY PLAYER (Green Rectangle) -----
  myPlayer = this.add.rectangle(400, 500, 40, 40, 0x00ff00);
  this.physics.add.existing(myPlayer);
  myPlayer.body.setCollideWorldBounds(true);

  // ----- Groups -----
  bullets = this.physics.add.group();
  enemyBullets = this.physics.add.group();
  enemies = this.physics.add.group();

  // ----- Input -----
  cursors = this.input.keyboard.createCursorKeys();
  wasd = this.input.keyboard.addKeys('W,A,S,D');
  spaceKey = this.input.keyboard.addKey('SPACE');

  // ----- Fire -----
  this.input.keyboard.on('keydown-SPACE', () => {
    if (!myPlayer.body || !myPlayer.body.enable) return;
    const b = this.add.rectangle(myPlayer.x, myPlayer.y - 25, 5, 15, 0xffff00);
    this.physics.add.existing(b);
    b.body.setVelocityY(-600);
    bullets.add(b);
    socket.emit('fireBullet', { x: myPlayer.x, y: myPlayer.y });
  });

  // ----- Socket: Other player moved -----
  socket.on('playerMoved', ({ id, x, y }) => {
    if (otherPlayers[id]) {
      otherPlayers[id].x = x;
      otherPlayers[id].y = y;
    } else {
      const other = scene.add.rectangle(x, y, 40, 40, 0x00aaff);
      scene.physics.add.existing(other);
      otherPlayers[id] = other;
    }
  });

  // ----- Socket: Other player fired -----
  socket.on('bulletFired', ({ id, x, y }) => {
    const b = scene.add.rectangle(x, y - 25, 5, 15, 0xff00ff);
    scene.physics.add.existing(b);
    b.body.setVelocityY(-600);
    enemyBullets.add(b);
  });

  // ----- Socket: Enemy spawned -----
  socket.on('enemySpawned', (enemyData) => {
    const e = scene.add.rectangle(enemyData.x, 0, 40, 40, 0xff0044);
    scene.physics.add.existing(e);
    e.body.setVelocityY(80);
    e.enemyId = enemyData.id;
    e.hp = enemyData.hp || 1;
    enemies.add(e);
  });

  // ----- Socket: Players update -----
  socket.on('playersUpdate', (players) => {
    updateHUD(players);
  });

  // ----- Collision: My bullets vs enemies -----
  this.physics.add.overlap(bullets, enemies, (bullet, enemy) => {
    bullet.destroy();
    enemy.hp -= 1;
    if (enemy.hp <= 0) {
      const eid = enemy.enemyId;
      enemy.destroy();
      socket.emit('enemyKilled', { enemyId: eid, playerId: socket.id, score: 10 });
    }
  });

  // ----- Collision: Enemy bullets vs me (PvP) -----
  if (myMode === 'pvp') {
    this.physics.add.overlap(enemyBullets, myPlayer, (bullet, player) => {
      bullet.destroy();
      socket.emit('playerHit', { targetId: socket.id, damage: 20 });
    });
  }

  // ----- Collision: Enemies vs me -----
  this.physics.add.overlap(myPlayer, enemies, (player, enemy) => {
    enemy.destroy();
    if (myMode === 'pvp') {
      socket.emit('playerHit', { targetId: socket.id, damage: 10 });
    }
  });

  // ----- Enemy Spawner (host only) -----
  if (isHost) {
    this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => {
        const x = Phaser.Math.Between(50, 750);
        const enemyData = {
          id: Math.random().toString(36).substring(2, 9),
          x,
          y: 0,
          hp: 1
        };
        const e = scene.add.rectangle(x, 0, 40, 40, 0xff0044);
        scene.physics.add.existing(e);
        e.body.setVelocityY(80);
        e.enemyId = enemyData.id;
        e.hp = 1;
        enemies.add(e);
        socket.emit('spawnEnemy', enemyData);
      }
    });
  }

  // ----- HUD -----
  this.hudText = this.add.text(10, 10, 'HP: 100 | Score: 0', {
    fontSize: '18px',
    color: '#00ffff'
  });
}

function updateHUD(players) {
  const me = players[socket.id];
  if (me && scene && scene.hudText) {
    scene.hudText.setText(`HP: ${me.hp} | Score: ${me.score}`);
    if (me.hp <= 0 && myPlayer.body && myPlayer.body.enable) {
      myPlayer.body.enable = false;
      myPlayer.setVisible(false);
      scene.time.delayedCall(3000, () => {
        myPlayer.body.enable = true;
        myPlayer.setVisible(true);
        myPlayer.x = 400;
        myPlayer.y = 500;
      });
    }
  }
}

function update() {
  if (!myPlayer || !myPlayer.body || !myPlayer.body.enable) return;

  const speed = 300;
  let vx = 0, vy = 0;
  if (cursors.left.isDown || wasd.A.isDown) vx = -speed;
  else if (cursors.right.isDown || wasd.D.isDown) vx = speed;
  if (cursors.up.isDown || wasd.W.isDown) vy = -speed;
  else if (cursors.down.isDown || wasd.S.isDown) vy = speed;

  myPlayer.body.setVelocity(vx, vy);

  // Send position (throttled)
  if (this.time.now - lastSend > 50) {
    socket.emit('playerMove', { x: myPlayer.x, y: myPlayer.y });
    lastSend = this.time.now;
  }

  // Cleanup offscreen
  bullets.children.each(b => { if (b.y < -20) b.destroy(); });
  enemyBullets.children.each(b => { if (b.y < -20) b.destroy(); });
  enemies.children.each(e => { if (e.y > 620) e.destroy(); });
}
