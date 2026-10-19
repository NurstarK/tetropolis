"use strict";

/* =========================================================================
   Tetropolis — Tetris where the blocks are cities.
   Vanilla JS, no build step, no network. Keyboard-first desktop play.
   ========================================================================= */

/* ----------------------------- Tunables ------------------------------- */
const COLS = 10;
const ROWS = 18;
const CELL = 34;                 // board cell size in px (board = 340 x 612)
const PREVIEW_CELL = 30;         // next-piece preview cell size

const BASE_DROP_MS = 800;        // gravity interval at level 1
const DROP_STEP_MS = 65;         // ms shaved off per level
const MIN_DROP_MS = 90;          // fastest gravity
const EVENTS_PER_LEVEL = 8;      // "level = every 8 clears/merges"

const MERGE_MIN = 4;             // >= 4 same-country cities merge into a country
const CONTINENT_MIN = 3;         // >= 3 same-continent countries clear
const MERGE_SCORE = 250;         // x group size
const CONTINENT_SCORE = 1000;    // x tiles cleared
const SOFT_DROP_SCORE = 1;       // per cell of soft drop
const ROW_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };

const COLORS = {
  grid: "#1a2336",
  gridEdge: "#243049",
  cityText: "#ffffff",
  countryBorder: "#fbbf24",
  ghost: "rgba(255,255,255,0.10)",
};

// Purely-cosmetic feedback timings (ms). Effects are overlay-only: they never
// read or change board state, score, or events — just the look of play.
const FX = {
  lockMs: 150,        // soft flash on a freshly locked piece
  mergeMs: 360,       // flash on cities consumed by a merge
  continentMs: 440,   // flash on country tiles a continent clear removes
  rowMs: 280,         // white sweep over cleared rows
  ringMs: 460,        // expanding ring at a merge/clear focal cell
  popMs: 200,         // scale-in "pop" when a country tile is born
};

/* --------------------------- Game dataset ----------------------------- */
// 12 countries across 4 continents. Each country colour is shaded within
// its continent's hue family so the continent reads at a glance.
const CONTINENTS = {
  europe:   { name: "Europe",   swatch: "#3b82f6" },
  asia:     { name: "Asia",     swatch: "#ef4444" },
  americas: { name: "Americas", swatch: "#22c55e" },
  africa:   { name: "Africa",   swatch: "#eab308" },
};

const COUNTRIES = {
  italy:     { name: "Italy",       flag: "🇮🇹", continent: "europe",   color: "#1d4ed8", cities: ["ROM", "MIL", "NAP", "TUR"] },
  france:    { name: "France",      flag: "🇫🇷", continent: "europe",   color: "#2563eb", cities: ["PAR", "LYO", "MRS", "NIC"] },
  germany:   { name: "Germany",     flag: "🇩🇪", continent: "europe",   color: "#3b82f6", cities: ["BER", "MUN", "HAM", "CGN"] },
  spain:     { name: "Spain",       flag: "🇪🇸", continent: "europe",   color: "#0ea5e9", cities: ["MAD", "BCN", "SEV", "VAL"] },
  japan:     { name: "Japan",       flag: "🇯🇵", continent: "asia",     color: "#b91c1c", cities: ["TYO", "OSA", "KYO", "NGO"] },
  korea:     { name: "South Korea", flag: "🇰🇷", continent: "asia",     color: "#dc2626", cities: ["SEL", "BUS", "INC", "DAE"] },
  china:     { name: "China",       flag: "🇨🇳", continent: "asia",     color: "#ea580c", cities: ["BEI", "SHA", "SHE", "CHE"] },
  usa:       { name: "USA",         flag: "🇺🇸", continent: "americas", color: "#15803d", cities: ["NYC", "LAX", "CHI", "MIA"] },
  brazil:    { name: "Brazil",      flag: "🇧🇷", continent: "americas", color: "#16a34a", cities: ["SAO", "RIO", "BSB", "SSA"] },
  argentina: { name: "Argentina",   flag: "🇦🇷", continent: "americas", color: "#22c55e", cities: ["BUE", "COR", "ROS", "MDZ"] },
  nigeria:   { name: "Nigeria",     flag: "🇳🇬", continent: "africa",   color: "#ca8a04", cities: ["LAG", "ABJ", "KAN", "IBA"] },
  egypt:     { name: "Egypt",       flag: "🇪🇬", continent: "africa",   color: "#eab308", cities: ["CAI", "ALX", "GIZ", "LXR"] },
};

const COUNTRY_KEYS = Object.keys(COUNTRIES);

// Standard tetromino matrices (1 = filled).
const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const SHAPE_KEYS = Object.keys(SHAPES);

/* ------------------------------ State --------------------------------- */
let board;            // ROWS x COLS, each cell null or a tile object
let current;          // active falling piece
let next;             // next piece
let score, lines, level, events;
let paused, gameOver;
let dropCounter, lastTime, dropInterval;
let effects = [];     // transient visual-only overlays (see FX)

const boardCanvas = document.getElementById("board");
const bctx = boardCanvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nctx = nextCanvas.getContext("2d");

const el = {
  score: document.getElementById("score"),
  level: document.getElementById("level"),
  lines: document.getElementById("lines"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayText: document.getElementById("overlay-text"),
  overlayBtn: document.getElementById("overlay-btn"),
};

/* ----------------------------- Helpers -------------------------------- */
function rand(n) { return Math.floor(Math.random() * n); }

// Queue a cosmetic overlay effect. Stamped with its own start time so several
// effects spawned in the same board-resolve animate together.
function addEffect(fx) {
  fx.start = performance.now();
  effects.push(fx);
}

function emptyBoard() {
  const b = [];
  for (let r = 0; r < ROWS; r++) b.push(new Array(COLS).fill(null));
  return b;
}

// Relative luminance of a #rrggbb colour -> pick a legible text colour.
function textColorFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#1a1205" : COLORS.cityText;
}

function rotateMatrix(m) {
  const R = m.length, C = m[0].length;
  const out = [];
  for (let c = 0; c < C; c++) {
    const row = new Array(R).fill(null);
    for (let r = 0; r < R; r++) row[R - 1 - r] = m[r][c];
    out.push(row);
  }
  return out;
}

/* ----------------------------- Pieces --------------------------------- */
function makePiece() {
  const type = SHAPE_KEYS[rand(SHAPE_KEYS.length)];
  const shape = SHAPES[type].map((row) => row.slice());
  const countryKey = COUNTRY_KEYS[rand(COUNTRY_KEYS.length)];
  const cities = COUNTRIES[countryKey].cities;
  // Each filled cell gets its own random city code from the piece's country.
  const codes = shape.map((row) =>
    row.map((v) => (v ? cities[rand(cities.length)] : null)),
  );
  return {
    type,
    country: countryKey,
    shape,
    codes,
    row: 0,
    col: Math.floor((COLS - shape[0].length) / 2),
  };
}

function collides(piece, offRow = 0, offCol = 0, shape = piece.shape) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const br = piece.row + r + offRow;
      const bc = piece.col + c + offCol;
      if (bc < 0 || bc >= COLS || br >= ROWS) return true;
      if (br >= 0 && board[br][bc] !== null) return true;
    }
  }
  return false;
}

function rotatePiece() {
  const newShape = rotateMatrix(current.shape);
  if (!collides(current, 0, 0, newShape)) {
    current.shape = newShape;
    current.codes = rotateMatrix(current.codes);
  }
}

function move(dx) {
  if (!collides(current, 0, dx)) current.col += dx;
}

function softDrop() {
  if (!collides(current, 1, 0)) {
    current.row += 1;
    score += SOFT_DROP_SCORE;
  } else {
    lockAndAdvance();
  }
  dropCounter = 0;
}

function hardDrop() {
  let dist = 0;
  while (!collides(current, 1, 0)) {
    current.row += 1;
    dist += 1;
  }
  score += dist * SOFT_DROP_SCORE;
  lockAndAdvance();
  dropCounter = 0;
}

function lockPiece() {
  const country = COUNTRIES[current.country];
  const landed = [];
  for (let r = 0; r < current.shape.length; r++) {
    for (let c = 0; c < current.shape[r].length; c++) {
      if (!current.shape[r][c]) continue;
      const br = current.row + r;
      const bc = current.col + c;
      if (br < 0) { gameOver = true; continue; }
      board[br][bc] = {
        kind: "city",
        country: current.country,
        continent: country.continent,
        color: country.color,
        code: current.codes[r][c],
      };
      landed.push([br, bc]);
    }
  }
  if (landed.length) {
    addEffect({ kind: "flash", cells: landed, color: "#ffffff", alpha: 0.35, dur: FX.lockMs });
  }
}

function lockAndAdvance() {
  lockPiece();
  resolveBoard();
  current = next;
  next = makePiece();
  if (collides(current)) {
    gameOver = true;
  }
  updateHUD();
  drawNext();
  if (gameOver) endGame();
}

/* --------------------------- Board resolve ---------------------------- */
// Column gravity: let every tile fall to the lowest empty cell in its column.
function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] !== null) {
        if (r !== write) {
          board[write][c] = board[r][c];
          board[r][c] = null;
        }
        write -= 1;
      }
    }
  }
}

// 4-connected flood fill, grouping by a key derived from each tile.
function findGroups(matches, keyOf) {
  const seen = emptyBoard();
  const groups = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (seen[r][c] || !matches(board[r][c])) continue;
      const key = keyOf(board[r][c]);
      const stack = [[r, c]];
      const cells = [];
      seen[r][c] = true;
      while (stack.length) {
        const [cr, cc] = stack.pop();
        cells.push([cr, cc]);
        const nbrs = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]];
        for (const [nr, nc] of nbrs) {
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          if (seen[nr][nc]) continue;
          const t = board[nr][nc];
          if (matches(t) && keyOf(t) === key) {
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      groups.push({ key, cells });
    }
  }
  return groups;
}

function findFullRows() {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every((cell) => cell !== null)) rows.push(r);
  }
  return rows;
}

function clearRows(rows) {
  const drop = new Set(rows);
  const kept = [];
  for (let r = 0; r < ROWS; r++) {
    if (!drop.has(r)) kept.push(board[r]);
  }
  while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(null));
  board = kept;
}

function scoreForRows(n) {
  if (ROW_SCORES[n]) return ROW_SCORES[n];
  // Cascades can theoretically full more than 4 rows at once.
  return ROW_SCORES[4] + (n - 4) * 400;
}

// Resolve the board after a lock: gravity, then rules 2 -> 3 -> classic rows,
// re-checking until stable. Each cascade pass doubles its score.
function resolveBoard() {
  let pass = 0;
  let guard = 0;
  while (guard++ < 500) {
    applyGravity();
    const mult = Math.pow(2, pass);

    // Rule 2 — city merge: >=4 connected cities of one country -> country tile.
    const merges = findGroups(
      (t) => t && t.kind === "city",
      (t) => t.country,
    ).filter((g) => g.cells.length >= MERGE_MIN);

    if (merges.length) {
      for (const g of merges) {
        // Lowest-leftmost cell: max row, then min col.
        let target = g.cells[0];
        for (const [r, c] of g.cells) {
          if (r > target[0] || (r === target[0] && c < target[1])) target = [r, c];
        }
        const country = COUNTRIES[g.key];
        addEffect({ kind: "flash", cells: g.cells.slice(), color: country.color, alpha: 0.85, dur: FX.mergeMs });
        addEffect({ kind: "ring", r: target[0], c: target[1], color: COLORS.countryBorder, dur: FX.ringMs });
        for (const [r, c] of g.cells) board[r][c] = null;
        board[target[0]][target[1]] = {
          kind: "country",
          country: g.key,
          continent: country.continent,
          color: country.color,
          flag: country.flag,
          born: performance.now(),
        };
        score += MERGE_SCORE * g.cells.length * mult;
        events += 1;
      }
      Music.cue("merge");
      pass += 1;
      continue;
    }

    // Rule 3 — continent clear: >=3 connected country tiles of one continent.
    const continents = findGroups(
      (t) => t && t.kind === "country",
      (t) => t.continent,
    ).filter((g) => g.cells.length >= CONTINENT_MIN);

    if (continents.length) {
      let tiles = 0;
      for (const g of continents) {
        const hue = CONTINENTS[g.key] ? CONTINENTS[g.key].swatch : COLORS.countryBorder;
        addEffect({ kind: "flash", cells: g.cells.slice(), color: hue, alpha: 0.9, dur: FX.continentMs });
        for (const [r, c] of g.cells) {
          addEffect({ kind: "ring", r, c, color: hue, dur: FX.ringMs });
          board[r][c] = null;
        }
        tiles += g.cells.length;
        events += 1;
      }
      score += CONTINENT_SCORE * tiles * mult;
      Music.cue("continent");
      pass += 1;
      continue;
    }

    // Classic full-row clears (country tiles count as filled).
    const full = findFullRows();
    if (full.length) {
      addEffect({ kind: "rows", rows: full.slice(), dur: FX.rowMs });
      clearRows(full);
      lines += full.length;
      events += full.length;
      score += scoreForRows(full.length) * mult;
      Music.cue("row");
      pass += 1;
      continue;
    }

    break; // stable
  }

  level = 1 + Math.floor(events / EVENTS_PER_LEVEL);
  dropInterval = Math.max(MIN_DROP_MS, BASE_DROP_MS - (level - 1) * DROP_STEP_MS);
  Music.setLevel(level);
}

/* ------------------------------ Render -------------------------------- */
function roundedPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTile(ctx, px, py, size, tile, alpha) {
  ctx.save();
  if (alpha != null) ctx.globalAlpha = alpha;
  const pad = 1;
  const x = px + pad, y = py + pad, s = size - pad * 2;

  if (tile.kind === "country") {
    // Freshly-born country tiles scale in from small to full size (cosmetic).
    if (tile.born != null) {
      const p = Math.min(1, (performance.now() - tile.born) / FX.popMs);
      const e = 1 - Math.pow(1 - p, 3);          // easeOutCubic
      const scale = 0.6 + 0.4 * e;
      const cx = px + size / 2, cy = py + size / 2;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }
    roundedPath(ctx, x, y, s, s, 5);
    ctx.fillStyle = tile.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.countryBorder;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `${Math.round(size * 0.62)}px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tile.flag, px + size / 2, py + size / 2 + 1);
  } else {
    roundedPath(ctx, x, y, s, s, 4);
    ctx.fillStyle = tile.color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();
    // top highlight for a touch of depth
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + 1, y + 1, s - 2, Math.max(2, s * 0.14));
    ctx.fillStyle = textColorFor(tile.color);
    ctx.font = `700 ${Math.round(size * 0.37)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tile.code, px + size / 2, py + size / 2 + 1);
  }
  ctx.restore();
}

function drawGrid() {
  bctx.fillStyle = "#0d1322";
  bctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
  bctx.strokeStyle = COLORS.grid;
  bctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    bctx.beginPath();
    bctx.moveTo(c * CELL + 0.5, 0);
    bctx.lineTo(c * CELL + 0.5, ROWS * CELL);
    bctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    bctx.beginPath();
    bctx.moveTo(0, r * CELL + 0.5);
    bctx.lineTo(COLS * CELL, r * CELL + 0.5);
    bctx.stroke();
  }
}

function ghostRow() {
  let off = 0;
  while (!collides(current, off + 1, 0)) off += 1;
  return off;
}

// Overlay-only effects (flashes, expanding rings, row sweeps). Rendered on top
// of the settled board every frame; each effect fades out and self-removes.
function drawEffects(now) {
  if (!effects.length) return;
  for (const fx of effects) {
    const p = (now - fx.start) / fx.dur;
    if (p < 0 || p >= 1) continue;
    bctx.save();
    if (fx.kind === "flash") {
      bctx.globalAlpha = (1 - p) * (fx.alpha != null ? fx.alpha : 0.85);
      bctx.fillStyle = fx.color || "#ffffff";
      for (const [r, c] of fx.cells) {
        roundedPath(bctx, c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2, 5);
        bctx.fill();
      }
    } else if (fx.kind === "ring") {
      const ease = 1 - Math.pow(1 - p, 2);        // easeOutQuad expansion
      const cx = fx.c * CELL + CELL / 2;
      const cy = fx.r * CELL + CELL / 2;
      bctx.globalAlpha = (1 - p) * 0.8;
      bctx.lineWidth = 3;
      bctx.strokeStyle = fx.color || COLORS.countryBorder;
      bctx.beginPath();
      bctx.arc(cx, cy, CELL * (0.3 + ease * 1.2), 0, Math.PI * 2);
      bctx.stroke();
    } else if (fx.kind === "rows") {
      bctx.globalAlpha = (1 - p) * 0.9;
      bctx.fillStyle = "#ffffff";
      for (const r of fx.rows) bctx.fillRect(0, r * CELL, COLS * CELL, CELL);
    }
    bctx.restore();
  }
  effects = effects.filter((fx) => now - fx.start < fx.dur);
}

function draw() {
  drawGrid();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) drawTile(bctx, c * CELL, r * CELL, CELL, board[r][c]);
    }
  }

  if (!gameOver && current) {
    // Ghost
    const g = ghostRow();
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < current.shape[r].length; c++) {
        if (!current.shape[r][c]) continue;
        const br = current.row + r + g;
        const bc = current.col + c;
        if (br < 0) continue;
        roundedPath(bctx, bc * CELL + 2, br * CELL + 2, CELL - 4, CELL - 4, 4);
        bctx.fillStyle = COLORS.ghost;
        bctx.fill();
      }
    }
    // Active piece
    const country = COUNTRIES[current.country];
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < current.shape[r].length; c++) {
        if (!current.shape[r][c]) continue;
        const br = current.row + r;
        const bc = current.col + c;
        if (br < 0) continue;
        drawTile(bctx, bc * CELL, br * CELL, CELL, {
          kind: "city",
          color: country.color,
          code: current.codes[r][c],
        });
      }
    }
  }

  drawEffects(performance.now());
}

function drawNext() {
  nctx.fillStyle = "#0d1322";
  nctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!next) return;
  const country = COUNTRIES[next.country];
  const w = next.shape[0].length;
  const h = next.shape.length;
  // trim empty rows/cols for centering
  const offX = (nextCanvas.width - w * PREVIEW_CELL) / 2;
  const offY = (nextCanvas.height - h * PREVIEW_CELL) / 2;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!next.shape[r][c]) continue;
      drawTile(nctx, offX + c * PREVIEW_CELL, offY + r * PREVIEW_CELL, PREVIEW_CELL, {
        kind: "city",
        color: country.color,
        code: next.codes[r][c],
      });
    }
  }
}

/* ------------------------------- HUD ---------------------------------- */
function updateHUD() {
  el.score.textContent = String(score);
  el.level.textContent = String(level);
  el.lines.textContent = String(lines);
}

function buildLegend() {
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  for (const key of Object.keys(CONTINENTS)) {
    const cont = CONTINENTS[key];
    const wrap = document.createElement("div");
    wrap.className = "cont";

    const head = document.createElement("div");
    head.className = "cont-head";
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = cont.swatch;
    sw.style.color = cont.swatch;      // drives the swatch's hue-matched glow
    head.appendChild(sw);
    head.appendChild(document.createTextNode(cont.name));

    const list = document.createElement("div");
    list.className = "countries";
    const names = COUNTRY_KEYS
      .filter((k) => COUNTRIES[k].continent === key)
      .map((k) => `${COUNTRIES[k].flag} ${COUNTRIES[k].name}`)
      .join("  ·  ");
    list.textContent = names;

    wrap.appendChild(head);
    wrap.appendChild(list);
    legend.appendChild(wrap);
  }
}

function showOverlay(title, text, btnLabel) {
  el.overlayTitle.textContent = title;
  el.overlayText.textContent = text;
  el.overlayBtn.textContent = btnLabel;
  el.overlay.classList.remove("hidden");
}

function hideOverlay() {
  el.overlay.classList.add("hidden");
}

function endGame() {
  Music.pause();
  showOverlay("Game Over", `You scored ${score} across ${level} level(s).`, "Play again");
}

/* ------------------------------- Loop --------------------------------- */
function loop(time = 0) {
  const delta = time - lastTime;
  lastTime = time;
  if (!paused && !gameOver) {
    dropCounter += delta;
    if (dropCounter > dropInterval) {
      softDropGravity();
      dropCounter = 0;
    }
  }
  draw();
  requestAnimationFrame(loop);
}

// Gravity tick (no soft-drop score).
function softDropGravity() {
  if (!collides(current, 1, 0)) {
    current.row += 1;
  } else {
    lockAndAdvance();
  }
}

/* ------------------------------ Input --------------------------------- */
function onKey(e) {
  // Any keypress is a user gesture — safe to create/resume the AudioContext.
  Music.unlock();

  if (e.key === "m" || e.key === "M") {
    Music.toggleMute();
    e.preventDefault();
    return;
  }
  if (e.key === "r" || e.key === "R") {
    reset();
    return;
  }
  if (gameOver) return;

  if (e.key === "p" || e.key === "P") {
    paused = !paused;
    if (paused) { showOverlay("Paused", "Press P to resume.", "Restart"); Music.pause(); }
    else { hideOverlay(); Music.play(); }
    return;
  }
  if (paused) return;

  switch (e.key) {
    case "ArrowLeft": move(-1); e.preventDefault(); break;
    case "ArrowRight": move(1); e.preventDefault(); break;
    case "ArrowDown": softDrop(); e.preventDefault(); break;
    case "ArrowUp":
    case "x":
    case "X": rotatePiece(); e.preventDefault(); break;
    case " ": hardDrop(); e.preventDefault(); break;
    default: break;
  }
}

/* ------------------------------ Setup --------------------------------- */
function reset() {
  board = emptyBoard();
  score = 0;
  lines = 0;
  level = 1;
  events = 0;
  paused = false;
  gameOver = false;
  dropCounter = 0;
  lastTime = 0;
  dropInterval = BASE_DROP_MS;
  effects = [];
  current = makePiece();
  next = makePiece();
  hideOverlay();
  updateHUD();
  drawNext();
  Music.setLevel(1);
  Music.play();
}

el.overlayBtn.addEventListener("click", () => {
  Music.unlock();
  if (gameOver || paused) reset();
});
document.addEventListener("keydown", onKey);

buildLegend();
reset();
requestAnimationFrame(loop);
