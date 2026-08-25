/* Procedurally generated Minecraft-style landscape, rendered at a tiny
 * "block" resolution and scaled up with pixelated rendering so every
 * canvas block reads as one in-world block. A tiny avatar wanders the
 * ridge line and occasionally digs a block out of the ground. Runs
 * behind the UI panels. */
(function () {
  var BLOCK_PX = 14; // approx on-screen size of one terrain block
  var SUB = 6; // sub-pixel subdivisions per block, for sprite detail
  var MAX_DIG_DEPTH = 2; // blocks an avatar can remove from one column

  var canvas = document.createElement('canvas');
  canvas.id = 'mc-backdrop';
  document.body.insertBefore(canvas, document.body.firstChild);
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var buffer = document.createElement('canvas');
  var bctx = buffer.getContext('2d');
  bctx.imageSmoothingEnabled = false;

  var cols, rows, groundHeight, dugDepth, stars, trees, clouds, avatar;

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerpColor(c1, c2, t) {
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
    ];
  }

  function shade(rgb, amt) {
    return [
      Math.max(0, Math.min(255, rgb[0] + amt)),
      Math.max(0, Math.min(255, rgb[1] + amt)),
      Math.max(0, Math.min(255, rgb[2] + amt)),
    ];
  }

  function rgbStr(rgb) {
    return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
  }

  // draws a block-unit rect with edges snapped to the sub-pixel grid,
  // so fractional avatar/cloud coordinates stay crisp instead of blurry
  function fillBlock(c, bx, by, bw, bh, color) {
    var l = Math.round(bx * SUB);
    var t = Math.round(by * SUB);
    var w = Math.max(1, Math.round((bx + bw) * SUB) - l);
    var h = Math.max(1, Math.round((by + bh) * SUB) - t);
    c.fillStyle = color;
    c.fillRect(l, t, w, h);
  }

  var SKY_TOP = [17, 14, 38];
  var SKY_HORIZON = [214, 108, 74];
  var GRASS = [93, 156, 63];
  var DIRT = [122, 75, 40];
  var STONE = [110, 110, 112];
  var TRUNK = [90, 60, 32];
  var LEAVES = [58, 122, 46];
  var MOON = [239, 231, 207];
  var CLOUD = [232, 232, 240];
  var SKIN = [224, 178, 128];
  var SHIRT = [43, 132, 140];
  var PANTS = [54, 64, 138];
  var TOOL = [150, 150, 156];
  var TOOL_HANDLE = [110, 74, 42];

  function skyColor(y) {
    var t = y / rows;
    return lerpColor(SKY_TOP, SKY_HORIZON, Math.pow(t, 1.4));
  }

  function terrainColor(x, y, depth) {
    var texRand = mulberry32(555 + x * 97 + y * 13);
    var noise = Math.floor(texRand() * 16) - 8;
    if (depth === 0) return shade(GRASS, noise);
    if (depth < 4) return shade(DIRT, noise);
    return shade(STONE, noise);
  }

  function generateTerrain() {
    var rand = mulberry32(20260825); // fixed seed: same hills every load

    groundHeight = new Array(cols);
    var base = rows * 0.84;
    var h = base;
    for (var x = 0; x < cols; x++) {
      h += (rand() - 0.5) * 1.6;
      h += (base - h) * 0.02; // pull back toward baseline so hills stay on-screen
      h = Math.max(rows * 0.76, Math.min(rows * 0.94, h));
      groundHeight[x] = h;
    }
    var smoothed = groundHeight.slice();
    for (var x = 1; x < cols - 1; x++) {
      smoothed[x] = (groundHeight[x - 1] + groundHeight[x] + groundHeight[x + 1]) / 3;
    }
    groundHeight = smoothed.map(Math.round);
    dugDepth = new Array(cols).fill(0);

    stars = [];
    var starRows = Math.round(rows * 0.6);
    var starCount = Math.round(cols * starRows * 0.02);
    for (var i = 0; i < starCount; i++) {
      stars.push({
        x: Math.floor(rand() * cols),
        y: Math.floor(rand() * starRows),
        phase: rand() * Math.PI * 2,
      });
    }

    trees = [];
    var minGap = 6;
    var lastTree = -minGap;
    for (var x = 2; x < cols - 2; x++) {
      if (x - lastTree < minGap) continue;
      if (rand() < 0.06) {
        trees.push(x);
        lastTree = x;
      }
    }
  }

  function drawColumn(x) {
    var g = groundHeight[x];
    for (var y = 0; y < rows; y++) {
      var color = y < g ? skyColor(y) : terrainColor(x, y, y - g);
      fillBlock(bctx, x, y, 1, 1, rgbStr(color));
    }
  }

  function drawStatic() {
    for (var x = 0; x < cols; x++) drawColumn(x);

    var mx = cols * 0.78;
    var my = rows * 0.16;
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= 3) {
          fillBlock(bctx, mx + dx, my + dy, 1, 1, rgbStr(MOON));
        }
      }
    }

    trees.forEach(function (x) {
      var g = groundHeight[x];
      var trunkH = 3;
      for (var i = 0; i < trunkH; i++) {
        fillBlock(bctx, x, g - 1 - i, 1, 1, rgbStr(TRUNK));
      }
      var ty = g - 1 - trunkH;
      [
        [-1, 0], [0, 0], [1, 0],
        [-1, -1], [0, -1], [1, -1],
        [0, -2],
      ].forEach(function (p) {
        fillBlock(bctx, x + p[0], ty + p[1], 1, 1, rgbStr(LEAVES));
      });
    });
  }

  function digAt(x) {
    if (trees.indexOf(x) !== -1) return false;
    if ((dugDepth[x] || 0) >= MAX_DIG_DEPTH) return false;
    dugDepth[x] = (dugDepth[x] || 0) + 1;
    groundHeight[x] = Math.min(groundHeight[x] + 1, rows - 1);
    drawColumn(x);
    return true;
  }

  function chopTree(x) {
    var idx = trees.indexOf(x);
    if (idx === -1) return false;
    trees.splice(idx, 1);
    for (var cx = x - 1; cx <= x + 1; cx++) {
      if (cx >= 0 && cx < cols) drawColumn(cx);
    }
    return true;
  }

  function initClouds() {
    var rand = mulberry32(99);
    clouds = [];
    var n = Math.max(3, Math.round(cols / 26));
    for (var i = 0; i < n; i++) {
      clouds.push({
        x: rand() * cols,
        y: Math.round(rows * (0.08 + rand() * 0.22)),
        w: 4 + Math.floor(rand() * 5),
        speed: 0.02 + rand() * 0.03,
      });
    }
  }

  function pickWalkTarget(fromX) {
    if (trees.length && Math.random() < 0.35) {
      var tx = trees[Math.floor(Math.random() * trees.length)];
      return Math.max(2, Math.min(cols - 3, tx));
    }
    var span = cols * 0.35;
    var t = fromX + (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * span);
    return Math.max(2, Math.min(cols - 3, Math.round(t)));
  }

  function initAvatar() {
    avatar = {
      x: -3,
      dir: 1,
      target: Math.max(2, Math.min(cols - 3, Math.round(cols * 0.2))),
      state: 'walk',
      action: null, // 'dig' | 'chop'
      walkFrame: 0,
      workCol: 0,
      workSwings: 0,
      workSwingsTotal: 0,
      swingTimer: 0,
    };
  }

  function updateAvatar() {
    if (avatar.state === 'walk') {
      var dx = avatar.target - avatar.x;
      var dir = dx >= 0 ? 1 : -1;
      avatar.dir = dir;
      var step = 0.14;
      if (Math.abs(dx) <= step) {
        avatar.x = avatar.target;
        var col = Math.max(1, Math.min(cols - 2, Math.round(avatar.x)));
        if (trees.indexOf(col) !== -1) {
          avatar.state = 'work';
          avatar.action = 'chop';
          avatar.workCol = col;
          avatar.workSwingsTotal = 3 + Math.floor(Math.random() * 2);
          avatar.workSwings = 0;
          avatar.swingTimer = 0;
        } else if (Math.random() < 0.5 && (dugDepth[col] || 0) < MAX_DIG_DEPTH) {
          avatar.state = 'work';
          avatar.action = 'dig';
          avatar.workCol = col;
          avatar.workSwingsTotal = 2 + Math.floor(Math.random() * 2);
          avatar.workSwings = 0;
          avatar.swingTimer = 0;
        } else {
          avatar.target = pickWalkTarget(avatar.x);
        }
      } else {
        avatar.x += dir * step;
        avatar.walkFrame++;
      }
    } else if (avatar.state === 'work') {
      avatar.swingTimer++;
      if (avatar.swingTimer >= 3) {
        avatar.swingTimer = 0;
        avatar.workSwings++;
        var isLastSwing = avatar.workSwings >= avatar.workSwingsTotal;
        if (avatar.action === 'chop') {
          if (isLastSwing) chopTree(avatar.workCol); // tree falls on the final swing
        } else {
          digAt(avatar.workCol);
        }
        if (isLastSwing) {
          avatar.state = 'walk';
          avatar.action = null;
          avatar.target = pickWalkTarget(avatar.x);
        }
      }
    }
  }

  function drawAvatar() {
    var col = Math.max(0, Math.min(cols - 1, Math.round(avatar.x)));
    var g = groundHeight[col];
    var x = avatar.x;
    var walking = avatar.state === 'walk' && Math.abs(avatar.target - avatar.x) > 0.05;
    var stride = walking ? Math.sin(avatar.walkFrame * 0.9) * 0.14 : 0;
    var working = avatar.state === 'work';
    var swing = working ? Math.abs(Math.sin((avatar.swingTimer / 3) * Math.PI)) : 0;

    fillBlock(ctx, x - 0.22, g - 0.85 + Math.max(0, stride), 0.18, 0.85 - Math.max(0, stride), rgbStr(PANTS));
    fillBlock(ctx, x + 0.04, g - 0.85 + Math.max(0, -stride), 0.18, 0.85 - Math.max(0, -stride), rgbStr(PANTS));

    fillBlock(ctx, x - 0.25, g - 1.45, 0.5, 0.6, rgbStr(SHIRT));
    fillBlock(ctx, x - 0.18, g - 1.85, 0.36, 0.4, rgbStr(SKIN));

    var armSide = avatar.dir >= 0 ? 1 : -1;
    var armX = x + armSide * 0.27;
    var armY = g - 1.3 + swing * 0.3;
    fillBlock(ctx, armX - 0.07, armY, 0.14, 0.35, rgbStr(SKIN));
    if (working) {
      var toolHead = avatar.action === 'chop' ? TOOL_HANDLE : TOOL;
      fillBlock(ctx, armX + armSide * 0.06 - 0.03, armY - 0.18, 0.06, 0.3, rgbStr(TOOL_HANDLE));
      fillBlock(ctx, armX + armSide * 0.16 - 0.06, armY - 0.28, 0.16, 0.09, rgbStr(toolHead));
    }
  }

  function resize() {
    cols = Math.max(60, Math.ceil(window.innerWidth / BLOCK_PX));
    rows = Math.max(34, Math.ceil(window.innerHeight / BLOCK_PX));
    buffer.width = cols * SUB;
    buffer.height = rows * SUB;
    canvas.width = cols * SUB;
    canvas.height = rows * SUB;
    generateTerrain();
    drawStatic();
    initClouds();
    initAvatar();
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  var lastFrame = 0;
  function tick(ts) {
    requestAnimationFrame(tick);
    if (ts - lastFrame < 120) return; // ~8fps is plenty for this ambient scene
    lastFrame = ts;

    ctx.drawImage(buffer, 0, 0);

    clouds.forEach(function (c) {
      c.x += c.speed;
      if (c.x - c.w > cols) c.x = -c.w;
      for (var i = 0; i < c.w; i++) {
        var cx = Math.floor(c.x) + i;
        if (cx < 0 || cx >= cols) continue;
        fillBlock(ctx, cx, c.y, 1, 2, rgbStr(CLOUD));
      }
    });

    stars.forEach(function (s) {
      var v = (Math.sin(ts / 900 + s.phase) + 1) / 2;
      if (v > 0.55) {
        fillBlock(ctx, s.x, s.y, 1, 1, 'rgba(255,255,255,' + (0.4 + v * 0.6).toFixed(2) + ')');
      }
    });

    updateAvatar();
    drawAvatar();
  }

  window.addEventListener('resize', debounce(resize, 250));
  resize();
  requestAnimationFrame(tick);
})();
