/**
 * Pac-Man mini game for portfolio
 * Vanilla JS, Canvas API — no dependencies
 */
(function () {
  'use strict';

  /* ── Canvas setup ─────────────────────────────────────────── */
  var canvas, ctx;
  var COLS = 14, ROWS = 14;
  var CELL, W, H;
  var RAF = null, lastTime = 0;

  /* ── Game state ──────────────────────────────────────────── */
  var state = 'idle'; // idle | playing | dead | won | gameover
  var score = 0, best = 0, lives = 3;
  var dots = [], powerDots = [];
  var pacman, ghosts;
  var frightenTimer = 0;
  var FRIGHTEN_DUR = 6000; // ms

  /* ── Maze definition (0=wall, 1=dot, 2=power, 3=empty, 4=ghost-home) ─ */
  var MAZE_TEMPLATE = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,0,0,1,1,1,1,1,0],
    [0,2,0,0,1,0,0,0,0,1,0,0,2,0],
    [0,1,0,0,1,0,0,0,0,1,0,0,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,3,3,0,1,0,0,1,0],
    [0,1,1,1,1,0,4,4,0,1,1,1,1,0],
    [0,0,0,0,1,0,3,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,0,0,0,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,0,0,0,1,0,0,1,0],
    [0,2,0,0,1,0,0,0,0,1,0,0,2,0],
    [0,1,1,1,1,1,0,0,1,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ];
  var maze; // live copy

  /* ── Colors ─────────────────────────────────────────────── */
  var C = {
    bg:       '#000',
    wall:     '#1d4ed8',
    wallGlow: '#3b82f6',
    dot:      '#e0c97f',
    power:    '#f0f',
    pac:      '#FFD700',
    eye:      '#fff',
    pupil:    '#000',
    frighten: '#2563eb',
    text:     '#fff',
    ghost:    ['#ef4444','#f97316','#ec4899','#22d3ee'],
  };

  /* ── Pacman object ──────────────────────────────────────── */
  function makePacman() {
    return {
      col: 7, row: 9,
      x: 0, y: 0,
      dx: 0, dy: 0,
      nextDx: 0, nextDy: 0,
      mouthAngle: 0.25,
      mouthDir: 1,
      speed: 4.5, // cells/sec
      moving: false,
      dead: false,
      deathFrame: 0,
    };
  }

  /* ── Ghost object ───────────────────────────────────────── */
  function makeGhost(col, row, colorIdx, name) {
    return {
      col: col, row: row,
      x: 0, y: 0,
      dx: 0, dy: 0,
      speed: 3.8,
      colorIdx: colorIdx,
      name: name,
      frightened: false,
      eaten: false,
      home: { col: col, row: row },
      mode: 'scatter', // scatter | chase | frightened
      scatterTarget: null,
      eyeDir: 0, // angle in radians
    };
  }

  /* ── Init / reset ───────────────────────────────────────── */
  function init() {
    canvas = document.getElementById('pacCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);

    // Input
    document.addEventListener('keydown', onKey);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: true });
  }

  function resize() {
    if (!canvas) return;
    var w = canvas.parentElement ? canvas.parentElement.clientWidth : 560;
    var size = Math.min(w, 560);
    CELL = Math.floor(size / COLS);
    W = COLS * CELL; H = ROWS * CELL;
    canvas.width  = W;
    canvas.height = H;
    if (state === 'idle' || state === 'gameover' || state === 'won') drawSplashCanvas();
  }

  function resetLevel() {
    // Deep copy maze
    maze = MAZE_TEMPLATE.map(function (r) { return r.slice(); });

    dots = []; powerDots = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (maze[r][c] === 1) dots.push({ col: c, row: r, eaten: false });
        if (maze[r][c] === 2) powerDots.push({ col: c, row: r, eaten: false });
      }
    }

    pacman = makePacman();
    pacman.x = pacman.col * CELL + CELL / 2;
    pacman.y = pacman.row * CELL + CELL / 2;

    ghosts = [
      makeGhost(6,  6, 0, 'Blinky'),
      makeGhost(7,  6, 1, 'Pinky'),
      makeGhost(6,  7, 2, 'Inky'),
      makeGhost(7,  7, 3, 'Clyde'),
    ];
    ghosts.forEach(function (g) {
      g.x = g.col * CELL + CELL / 2;
      g.y = g.row * CELL + CELL / 2;
      // Start facing outward
      g.dx = 0; g.dy = -1;
    });

    frightenTimer = 0;
  }

  /* ── Input handling ─────────────────────────────────────── */
  var touchStartX, touchStartY;
  function onTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }
  function onTouchEnd(e) {
    if (!touchStartX) return;
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDir(dx > 0 ? 1 : -1, 0);
    } else {
      setDir(0, dy > 0 ? 1 : -1);
    }
    touchStartX = touchStartY = null;
  }
  function onKey(e) {
    var map = {
      ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1],
      a: [-1,0], d: [1,0], w: [0,-1], s: [0,1],
      A: [-1,0], D: [1,0], W: [0,-1], S: [0,1],
    };
    if (map[e.key]) {
      e.preventDefault();
      setDir(map[e.key][0], map[e.key][1]);
    }
  }
  function setDir(dx, dy) {
    if (state !== 'playing') return;
    pacman.nextDx = dx;
    pacman.nextDy = dy;
  }

  /* ── Movement helpers ───────────────────────────────────── */
  function canMove(col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    var c = maze[row][col];
    return c !== 0;
  }
  function canGhostMove(col, row) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    return maze[row][col] !== 0;
  }

  function cellCenter(col, row) {
    return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
  }

  /* ── Ghost AI ───────────────────────────────────────────── */
  function moveGhost(g, dt) {
    var speed = g.frightened ? g.speed * 0.5 : (g.eaten ? g.speed * 2 : g.speed);
    var pixels = speed * CELL * (dt / 1000);

    // At cell centre — choose direction
    var cx = g.col * CELL + CELL / 2;
    var cy = g.row * CELL + CELL / 2;
    var distToCenter = Math.abs(g.x - cx) + Math.abs(g.y - cy);

    if (distToCenter < pixels + 1) {
      g.x = cx; g.y = cy;
      // Choose next direction
      var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      var possible = dirs.filter(function (d) {
        return canGhostMove(g.col + d[0], g.row + d[1]) && !(d[0] === -g.dx && d[1] === -g.dy);
      });
      if (possible.length === 0) {
        possible = dirs.filter(function (d) { return canGhostMove(g.col + d[0], g.row + d[1]); });
      }
      if (possible.length === 0) return;

      var chosen;
      if (g.frightened) {
        chosen = possible[Math.floor(Math.random() * possible.length)];
      } else if (g.eaten) {
        // Head home
        chosen = possible.reduce(function (best, d) {
          var nc = g.col + d[0], nr = g.row + d[1];
          var dist = Math.abs(nc - g.home.col) + Math.abs(nr - g.home.row);
          var bd   = Math.abs((g.col + best[0]) - g.home.col) + Math.abs((g.row + best[1]) - g.home.row);
          return dist < bd ? d : best;
        });
      } else {
        // Chase pacman roughly
        var tx = pacman.col, ty = pacman.row;
        chosen = possible.reduce(function (best, d) {
          var nc = g.col + d[0], nr = g.row + d[1];
          var dist = Math.abs(nc - tx) + Math.abs(nr - ty);
          var bd   = Math.abs((g.col + best[0]) - tx) + Math.abs((g.row + best[1]) - ty);
          return dist < bd ? d : best;
        });
        // Scatter ~30% of time
        if (Math.random() < 0.3) chosen = possible[Math.floor(Math.random() * possible.length)];
      }

      g.dx = chosen[0]; g.dy = chosen[1];
      g.col += g.dx; g.row += g.dy;
      g.eyeDir = Math.atan2(g.dy, g.dx);
    }

    g.x += g.dx * pixels;
    g.y += g.dy * pixels;
  }

  /* ── Pacman movement ────────────────────────────────────── */
  function movePacman(dt) {
    var speed  = pacman.speed;
    var pixels = speed * CELL * (dt / 1000);

    // Try next direction first
    if (pacman.nextDx !== 0 || pacman.nextDy !== 0) {
      var nc = pacman.col + pacman.nextDx;
      var nr = pacman.row + pacman.nextDy;
      // Check if near enough to cell centre to turn
      var cx = pacman.col * CELL + CELL / 2;
      var cy = pacman.row * CELL + CELL / 2;
      var dist = Math.abs(pacman.x - cx) + Math.abs(pacman.y - cy);
      if (dist < pixels + 2 && canMove(nc, nr)) {
        pacman.x = cx; pacman.y = cy;
        pacman.dx = pacman.nextDx;
        pacman.dy = pacman.nextDy;
        pacman.col = nc; pacman.row = nr;
        pacman.nextDx = 0; pacman.nextDy = 0;
        pacman.moving = true;
      }
    }

    // Continue in current direction
    if (pacman.dx !== 0 || pacman.dy !== 0) {
      var ncol = pacman.col + pacman.dx;
      var nrow = pacman.row + pacman.dy;
      var ccx = pacman.col * CELL + CELL / 2;
      var ccy = pacman.row * CELL + CELL / 2;
      var d = Math.abs(pacman.x - ccx) + Math.abs(pacman.y - ccy);

      if (d < pixels + 1 && !canMove(ncol, nrow)) {
        // Hit wall
        pacman.x = ccx; pacman.y = ccy; pacman.moving = false;
      } else {
        pacman.x += pacman.dx * pixels;
        pacman.y += pacman.dy * pixels;
        // Update logical cell
        var newCol = Math.round((pacman.x - CELL / 2) / CELL);
        var newRow = Math.round((pacman.y - CELL / 2) / CELL);
        pacman.col = Math.max(0, Math.min(COLS - 1, newCol));
        pacman.row = Math.max(0, Math.min(ROWS - 1, newRow));
        pacman.moving = true;
      }
    }

    // Mouth animation
    if (pacman.moving) {
      pacman.mouthAngle += 0.045 * pacman.mouthDir;
      if (pacman.mouthAngle > 0.28 || pacman.mouthAngle < 0.01) pacman.mouthDir *= -1;
    }
  }

  /* ── Dot / collision logic ──────────────────────────────── */
  function checkDots() {
    dots.forEach(function (d) {
      if (!d.eaten && d.col === pacman.col && d.row === pacman.row) {
        d.eaten = true; maze[d.row][d.col] = 3;
        score += 10; updateUI();
      }
    });
    powerDots.forEach(function (d) {
      if (!d.eaten && d.col === pacman.col && d.row === pacman.row) {
        d.eaten = true; maze[d.row][d.col] = 3;
        score += 50; updateUI();
        frightenGhosts();
      }
    });
    // Win?
    if (dots.every(function (d) { return d.eaten; }) &&
        powerDots.every(function (d) { return d.eaten; })) {
      state = 'won'; showMessage('You Won! 🎉', 'Play Again');
    }
  }

  function frightenGhosts() {
    frightenTimer = FRIGHTEN_DUR;
    ghosts.forEach(function (g) {
      if (!g.eaten) { g.frightened = true; }
    });
  }

  function checkGhostCollision() {
    ghosts.forEach(function (g) {
      var dx = Math.abs(g.x - pacman.x);
      var dy = Math.abs(g.y - pacman.y);
      if (dx < CELL * 0.65 && dy < CELL * 0.65) {
        if (g.frightened) {
          // Eat ghost
          g.frightened = false; g.eaten = true;
          score += 200; updateUI();
        } else if (!g.eaten) {
          // Pacman dies
          lives--;
          updateUI();
          if (lives <= 0) {
            state = 'gameover';
            showMessage('Game Over', 'Try Again');
          } else {
            state = 'dead';
            setTimeout(function () {
              resetLevel();
              state = 'playing';
            }, 1200);
          }
        }
      }
    });
  }

  /* ── Update loop ────────────────────────────────────────── */
  function update(ts) {
    var dt = Math.min(ts - lastTime, 80);
    lastTime = ts;

    if (state !== 'playing') { RAF = requestAnimationFrame(update); return; }

    // Frighten timer
    if (frightenTimer > 0) {
      frightenTimer -= dt;
      if (frightenTimer <= 0) {
        frightenTimer = 0;
        ghosts.forEach(function (g) {
          g.frightened = false;
          if (g.eaten) {
            var home = g.home;
            if (Math.abs(g.col - home.col) < 1 && Math.abs(g.row - home.row) < 1) g.eaten = false;
          }
        });
      }
    }

    movePacman(dt);
    checkDots();
    ghosts.forEach(function (g) { moveGhost(g, dt); });
    checkGhostCollision();

    draw();
    RAF = requestAnimationFrame(update);
  }

  /* ── Draw ───────────────────────────────────────────────── */
  function draw() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    drawMaze();
    drawDots();
    drawGhosts();
    drawPacman();
  }

  function drawMaze() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (maze[r][c] === 0) {
          var x = c * CELL, y = r * CELL;
          // Wall fill
          ctx.fillStyle = '#0a1628';
          ctx.fillRect(x, y, CELL, CELL);
          // Wall border glow
          ctx.strokeStyle = C.wallGlow;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
        }
      }
    }
  }

  function drawDots() {
    var now = Date.now();
    dots.forEach(function (d) {
      if (d.eaten) return;
      var x = d.col * CELL + CELL / 2;
      var y = d.row * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(x, y, CELL * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = C.dot;
      ctx.fill();
    });
    powerDots.forEach(function (d) {
      if (d.eaten) return;
      var x = d.col * CELL + CELL / 2;
      var y = d.row * CELL + CELL / 2;
      var pulse = 0.14 + 0.04 * Math.sin(now / 200);
      ctx.beginPath();
      ctx.arc(x, y, CELL * pulse, 0, Math.PI * 2);
      ctx.fillStyle = C.power;
      ctx.fill();
      ctx.shadowColor = C.power;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function drawPacman() {
    if (state === 'dead') {
      pacman.deathFrame = (pacman.deathFrame || 0) + 0.06;
      var deathOpen = Math.min(pacman.deathFrame * 1.2, 1);
      ctx.beginPath();
      ctx.arc(pacman.x, pacman.y, CELL * 0.42, deathOpen * Math.PI, (2 - deathOpen) * Math.PI);
      ctx.lineTo(pacman.x, pacman.y);
      ctx.fillStyle = C.pac;
      ctx.fill();
      return;
    }

    var angle = Math.atan2(pacman.dy, pacman.dx) || 0;
    var open   = pacman.mouthAngle;

    // Body
    ctx.beginPath();
    ctx.moveTo(pacman.x, pacman.y);
    ctx.arc(pacman.x, pacman.y, CELL * 0.42,
      angle + open * Math.PI,
      angle + (2 - open) * Math.PI);
    ctx.closePath();
    ctx.fillStyle = C.pac;
    // Glow
    ctx.shadowColor = 'rgba(255,215,0,0.5)';
    ctx.shadowBlur  = 10;
    ctx.fill();
    ctx.shadowBlur  = 0;

    // Eye
    var eyeX = pacman.x + Math.cos(angle - Math.PI / 3) * CELL * 0.2;
    var eyeY = pacman.y + Math.sin(angle - Math.PI / 3) * CELL * 0.2;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, CELL * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
  }

  function drawGhosts() {
    var now = Date.now();
    ghosts.forEach(function (g) {
      var x = g.x, y = g.y;
      var r = CELL * 0.42;
      var blink = g.frightened && frightenTimer < 2000 && Math.floor(now / 300) % 2 === 0;
      var col = g.frightened ? (blink ? '#fff' : C.frighten) : C.ghost[g.colorIdx];

      // Body
      ctx.beginPath();
      ctx.arc(x, y - r * 0.2, r, Math.PI, 0);
      // Skirt
      var bottom = y + r * 0.8;
      var segments = 3;
      ctx.lineTo(x + r, bottom);
      for (var i = segments; i >= 0; i--) {
        var sx = x - r + (2 * r / segments) * i;
        var rise = (i % 2 === 0) ? bottom : bottom - r * 0.35;
        ctx.lineTo(sx, rise);
      }
      ctx.lineTo(x - r, y - r * 0.2);
      ctx.fillStyle = col;
      if (!g.frightened) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      if (!g.frightened && !g.eaten) {
        // Eyes
        var eyeOffsets = [-0.22, 0.22];
        eyeOffsets.forEach(function (ex) {
          var ex_ = x + r * ex;
          var ey_ = y - r * 0.3;
          ctx.beginPath();
          ctx.arc(ex_, ey_, r * 0.22, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ex_ + Math.cos(g.eyeDir) * r * 0.1,
                  ey_ + Math.sin(g.eyeDir) * r * 0.1,
                  r * 0.11, 0, Math.PI * 2);
          ctx.fillStyle = '#000c80';
          ctx.fill();
        });
      } else if (g.frightened) {
        // Scared face
        ctx.fillStyle = '#fff';
        ctx.font = Math.round(r) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👻', x, y - r * 0.1);
      }
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /* ── Splash on canvas ───────────────────────────────────── */
  function drawSplashCanvas() {
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W || 560, H || 560);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold ' + Math.round((W || 560) / 12) + 'px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PAC-MAN', (W || 560) / 2, (H || 560) / 2 - 20);
    ctx.fillStyle = '#8b949e';
    ctx.font = Math.round((W || 560) / 22) + 'px Inter, sans-serif';
    ctx.fillText('Press ▶ Play to start', (W || 560) / 2, (H || 560) / 2 + 30);
    ctx.textAlign = 'left';
  }

  /* ── Message overlay ────────────────────────────────────── */
  function showMessage(title, btnText) {
    var splash = document.getElementById('pmSplash');
    if (!splash) return;
    splash.style.display = 'flex';
    var h4 = splash.querySelector('h4');
    var p  = splash.querySelector('p');
    var btn = splash.querySelector('.pm-start-btn') || document.getElementById('pmStart');
    if (h4) h4.textContent = title;
    if (p)  p.textContent  = 'Score: ' + score + '  Best: ' + best;
    if (btn) btn.textContent = '▶ ' + btnText;
  }

  /* ── UI counters ────────────────────────────────────────── */
  function updateUI() {
    var el = document.getElementById('pmScore');
    if (el) el.textContent = score;
    if (score > best) {
      best = score;
      var bel = document.getElementById('pmBest');
      if (bel) bel.textContent = best;
    }
    var lel = document.getElementById('pmLives');
    if (lel) {
      var hearts = '';
      for (var i = 0; i < lives; i++) hearts += '❤️';
      lel.textContent = hearts || '💀';
    }
  }

  /* ── Public API ─────────────────────────────────────────── */
  window.PacMan = {
    start: function () {
      if (RAF) cancelAnimationFrame(RAF);
      score = 0; lives = 3;
      resetLevel();
      updateUI();
      state = 'playing';
      lastTime = performance.now();
      RAF = requestAnimationFrame(update);
    },
    pause: function () {
      if (state === 'playing') state = 'idle';
      if (RAF) { cancelAnimationFrame(RAF); RAF = null; }
    },
    resume: function () {
      if (state === 'idle') {
        state = 'playing';
        lastTime = performance.now();
        RAF = requestAnimationFrame(update);
      }
    },
  };

  /* ── Initialise when DOM ready ──────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
