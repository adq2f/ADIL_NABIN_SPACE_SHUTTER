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
  // textures create e generate hobe
}

function create() {
  scene = this;

  // ----- Textures Generate -----
  const g = this.add.graphics();

  // Player ship (green triangle)
  g.fillStyle(0x00ff00, 1);
  g.fillTriangle(20, 0, 0, 40, 40, 40);
  g.generateTexture('ship', 40, 40);
  g.clear();

  // Enemy ship (red)
  g.fillStyle(0xff0044, 1);
  g.fillTriangle(20, 40, 0, 0, 40, 0);
  g.generateTexture('enemy', 40, 40);
  g.clear();

  // Bullet (yellow)
  g.fillStyle(0xffff00, 1);
  g.fillRect(0, 0, 4, 12);
  g.generateTexture('bullet', 4, 12);
  g.destroy();

  // ----- My Player -----
  myPlayer = this.physics.add.sprite(400, 500, 'ship');
  myPlayer.setCollideWorldBounds(true);

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
    if (!myPlayer.active) return;
    const b = bullets.create(myPlayer.x, myPlayer.y - 25, 'bullet');
    b.setVelocityY(-600);
    socket.emit('fireBullet', { x: myPlayer.x, y: myPlayer.y });
  });

  // ----- Socket Listeners -----
  socket.on('playerMoved', ({ id, x, y }) => {
    if (otherPlayers[id]) {
      otherPlayers[id].x = x;
      otherPlayers[id].y = y;
    } else {
      const other = scene.physics.add.sprite(x, y, 'ship');
      other.setTint(0x00aaff);
      otherPlayers[id] = other;
    }
  });

  socket.on('bulletFired', ({ id, x, y }) => {
    const b = enemyBullets.create(x, y - 25, 'bullet');
    b.setTint(0xff00ff);
    b.setVelocityY(-600);
  });

  socket.on('enemySpawned', (enemyData) => {
    const e = enemies.create(enemyData.x, enemyData.y, 'enemy');
    e.enemyId = enemyData.id;
    e.hp = enemyData.hp || 1;
    e.setVelocityY(80);
  });

  socket.on('playersUpdate', (players) => {
    updateHUD(players);
  });

  // ----- Collisions -----
  this.physics.add.overlap(bullets, enemies, (bullet, enemy) => {
    bullet.destroy();
    enemy.hp -= 1;
    if (enemy.hp <= 0) {
      const eid = enemy.enemyId;
      enemy.destroy();
      socket.emit('enemyKilled', { enemyId: eid, playerId: socket.id, score: 10 });
    }
  });

  if (myMode === 'pvp') {
    this.physics.add.overlap(enemyBullets, myPlayer, (bullet, player) => {
      bullet.destroy();
      socket.emit('playerHit', { targetId: socket.id, damage: 20 });
    });
  }

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
        const e = enemies.create(x, 0, 'enemy');
        e.enemyId = enemyData.id;
        e.hp = 1;
        e.setVelocityY(80);
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
    if (me.hp <= 0 && myPlayer.active) {
      myPlayer.setActive(false).setVisible(false);
      scene.time.delayedCall(3000, () => {
        myPlayer.setActive(true).setVisible(true);
        myPlayer.setPosition(400, 500);
      });
    }
  }
}

function update() {
  if (!myPlayer || !myPlayer.active) return;

  const speed = 300;
  let vx = 0, vy = 0;
  if (cursors.left.isDown || wasd.A.isDown) vx = -speed;
  else if (cursors.right.isDown || wasd.D.isDown) vx = speed;
  if (cursors.up.isDown || wasd.W.isDown) vy = -speed;
  else if (cursors.down.isDown || wasd.S.isDown) vy = speed;

  myPlayer.setVelocity(vx, vy);

  // Throttled position send
  if (this.time.now - lastSend > 50) {
    socket.emit('playerMove', { x: myPlayer.x, y: myPlayer.y });
    lastSend = this.time.now;
  }

  // Cleanup offscreen
  bullets.children.each(b => { if (b.y < -20) b.destroy(); });
  enemyBullets.children.each(b => { if (b.y < -20) b.destroy(); });
  enemies.children.each(e => { if (e.y > 620) e.destroy(); });
}
