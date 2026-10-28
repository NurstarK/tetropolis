"use strict";

/* =========================================================================
   Tetropolis — Tetris where the blocks are cities.
   Vanilla JS, no build step, no network. Keyboard-first desktop play.
   ========================================================================= */

/* ----------------------------- Tunables ------------------------------- */
const COLS = 10;
const ROWS = 18;
const CELL = 34;                 // board cell size in px (board = 340 x 612)
const PREVIEW_CELL = 24;         // hold / next preview cell size (both canvases)
const QUEUE_SIZE = 3;            // upcoming pieces shown in the Next preview

const BASE_DROP_MS = 800;        // gravity interval at level 1
const DROP_STEP_MS = 65;         // ms shaved off per level
const MIN_DROP_MS = 90;          // fastest gravity
const EVENTS_PER_LEVEL = 8;      // "level = every 8 clears/merges"

const MERGE_MIN = 4;             // >= 4 same-country cities merge into a country
const CONTINENT_MIN = 3;         // >= 3 same-continent countries clear
const MERGE_SCORE = 250;         // x group size
const CONTINENT_SCORE = 1000;    // x tiles cleared
const SOFT_DROP_SCORE = 1;       // per cell of soft drop

// New-piece country weighting (see pickCountry). With a ~18-country roster,
// uniform-random spawns made same-country clusters — and so the >=4 merge —
// too rare; these bias new pieces toward countries already on the board.
const COUNTRY_BASE_WEIGHT = 1;   // every country's floor chance to spawn
const COUNTRY_BOARD_WEIGHT = 1.5; // added per same-country city already on board
const ROW_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };

// Daily-challenge country weighting. The daily stream must be board-INDEPENDENT
// (see pickCountry), so instead of reading the board it biases toward countries
// that came up recently in the shared stream — a pure function of the seed, so
// identical for every player, while still keeping same-country clusters (and so
// the >=4 merge) reachable rather than a uniform grind over 18 countries.
const CHALLENGE_WINDOW = 8;         // recent generated pieces considered
const CHALLENGE_RECENT_WEIGHT = 2;  // weight added per same-country piece in the window

// Touch-play gesture tuning (mobile only). Desktop keyboard play never reads
// these — the handlers that use them simply don't fire without touch events.
const TAP_MAX_DIST = 14;        // px of finger travel still counted as a tap -> rotate
const TAP_MAX_MS = 260;         // longest press (ms) still counted as a tap -> rotate
const SWIPE_DROP_CELLS = 0.6;   // downward travel (in displayed cells) to register a drop
const HARD_DROP_CELLS = 2.5;    // downward travel (in cells) that becomes a hard drop
const HARD_DROP_VELOCITY = 1.1; // or a fast downward flick (px/ms) -> hard drop

const COLORS = {
  boardTop: "#1a1f4a",    // board background gradient — deep indigo, not black
  boardBottom: "#0f1a3a",
  previewBg: "#161c40",
  grid: "rgba(148,163,255,0.13)",
  gridEdge: "rgba(148,163,255,0.28)",
  cityText: "#ffffff",
  countryBorder: "#fbbf24",
  ghostFill: 0.16,        // ghost = the piece's own colour at low alpha...
  ghostStroke: 0.85,      // ...with a strong outline so the landing spot reads
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
  floatMs: 950,       // "+1000" score label rising from its focal cell
  bannerMs: 1100,     // "×4 CHAIN" cascade banner near the top of the board
  floatStaggerMs: 120, // delay between successive cascade callouts so they chain
};

// Callout colours — kept bright and legible against the dark board.
const CALLOUT = {
  score: "#ffffff",
  continent: "#fcd34d",   // gold, matches the country border / accent family
  tetris: "#fcd34d",
  chain: "#fb923c",       // hot orange — the cascade banner
};

/* --------------------------- Game dataset ----------------------------- */
// 43 countries across 6 continents. Each country colour is shaded within
// its continent's hue family so the continent reads at a glance; every city
// tile also carries its country's flag, so countries never rely on colour alone.
const CONTINENTS = {
  europe:   { name: "Europe",   swatch: "#3b82f6" },
  asia:     { name: "Asia",     swatch: "#ef4444" },
  namerica: { name: "North & Central America", swatch: "#22c55e" },
  samerica: { name: "South America", swatch: "#14b8a6" },
  africa:   { name: "Africa",   swatch: "#eab308" },
  oceania:  { name: "Oceania",  swatch: "#a855f7" },
};

const COUNTRIES = {
  italy:       { name: "Italy",          flag: "🇮🇹", continent: "europe",   color: "#1d4ed8", cities: ["ROM", "MIL", "NAP", "TUR"] },
  france:      { name: "France",         flag: "🇫🇷", continent: "europe",   color: "#2563eb", cities: ["PAR", "LYO", "MRS", "NIC"] },
  germany:     { name: "Germany",        flag: "🇩🇪", continent: "europe",   color: "#3b82f6", cities: ["BER", "MUN", "HAM", "CGN"] },
  spain:       { name: "Spain",          flag: "🇪🇸", continent: "europe",   color: "#6366f1", cities: ["MAD", "BCN", "SEV", "VAL"] },
  portugal:    { name: "Portugal",       flag: "🇵🇹", continent: "europe",   color: "#1e40af", cities: ["LIS", "OPO", "FAO", "BRG"] },
  greece:      { name: "Greece",         flag: "🇬🇷", continent: "europe",   color: "#60a5fa", cities: ["ATH", "SKG", "HER", "PTR"] },
  belgium:     { name: "Belgium",        flag: "🇧🇪", continent: "europe",   color: "#4f46e5", cities: ["BRU", "ANR", "GNT", "LGG"] },
  netherlands: { name: "Netherlands",    flag: "🇳🇱", continent: "europe",   color: "#818cf8", cities: ["AMS", "RTM", "HAG", "UTR"] },
  uk:          { name: "United Kingdom", flag: "🇬🇧", continent: "europe",   color: "#3730a3", cities: ["LON", "MAN", "EDI", "BHX"] },
  japan:       { name: "Japan",          flag: "🇯🇵", continent: "asia",     color: "#b91c1c", cities: ["TYO", "OSA", "KYO", "NGO"] },
  korea:       { name: "South Korea",    flag: "🇰🇷", continent: "asia",     color: "#dc2626", cities: ["SEL", "BUS", "INC", "DAE"] },
  china:       { name: "China",          flag: "🇨🇳", continent: "asia",     color: "#ea580c", cities: ["BEI", "SHA", "SHE", "CHE"] },
  india:       { name: "India",          flag: "🇮🇳", continent: "asia",     color: "#f97316", cities: ["DEL", "BOM", "BLR", "CCU"] },
  thailand:    { name: "Thailand",       flag: "🇹🇭", continent: "asia",     color: "#e11d48", cities: ["BKK", "CNX", "HKT", "PYX"] },
  vietnam:     { name: "Vietnam",        flag: "🇻🇳", continent: "asia",     color: "#c2410c", cities: ["HAN", "SGN", "DAD", "HPH"] },
  russia:      { name: "Russia",         flag: "🇷🇺", continent: "asia",     color: "#9f1239", cities: ["MOW", "LED", "OVB", "SVX"] },
  usa:         { name: "USA",            flag: "🇺🇸", continent: "namerica", color: "#15803d", cities: ["NYC", "LAX", "CHI", "MIA"] },
  canada:      { name: "Canada",         flag: "🇨🇦", continent: "namerica", color: "#16a34a", cities: ["TOR", "MTL", "VAN", "OTT"] },
  mexico:      { name: "Mexico",         flag: "🇲🇽", continent: "namerica", color: "#4d7c0f", cities: ["MEX", "GDL", "MTY", "CUN"] },
  guatemala:   { name: "Guatemala",      flag: "🇬🇹", continent: "namerica", color: "#65a30d", cities: ["GUA", "QZT", "ANT", "ESC"] },
  elsalvador:  { name: "El Salvador",    flag: "🇸🇻", continent: "namerica", color: "#22c55e", cities: ["SAL", "SMG", "SNA", "SOY"] },
  honduras:    { name: "Honduras",       flag: "🇭🇳", continent: "namerica", color: "#166534", cities: ["TGU", "SAP", "LCE", "CHO"] },
  nicaragua:   { name: "Nicaragua",      flag: "🇳🇮", continent: "namerica", color: "#84cc16", cities: ["MGA", "LEO", "GRN", "MAS"] },
  costarica:   { name: "Costa Rica",     flag: "🇨🇷", continent: "namerica", color: "#059669", cities: ["SJO", "ALA", "CRT", "LIR"] },
  panama:      { name: "Panama",         flag: "🇵🇦", continent: "namerica", color: "#10b981", cities: ["PTY", "COL", "DAV", "LCH"] },
  brazil:      { name: "Brazil",         flag: "🇧🇷", continent: "samerica", color: "#0d9488", cities: ["SAO", "RIO", "BSB", "SSA"] },
  argentina:   { name: "Argentina",      flag: "🇦🇷", continent: "samerica", color: "#14b8a6", cities: ["BUE", "COR", "ROS", "MDZ"] },
  colombia:    { name: "Colombia",       flag: "🇨🇴", continent: "samerica", color: "#0f766e", cities: ["BOG", "MDE", "CLO", "BAQ"] },
  peru:        { name: "Peru",           flag: "🇵🇪", continent: "samerica", color: "#2dd4bf", cities: ["LIM", "AQP", "CUZ", "TRU"] },
  chile:       { name: "Chile",          flag: "🇨🇱", continent: "samerica", color: "#115e59", cities: ["SCL", "VAP", "CCP", "ANF"] },
  venezuela:   { name: "Venezuela",      flag: "🇻🇪", continent: "samerica", color: "#5eead4", cities: ["CCS", "MAR", "VLN", "BRM"] },
  ecuador:     { name: "Ecuador",        flag: "🇪🇨", continent: "samerica", color: "#134e4a", cities: ["UIO", "GYE", "CUE", "MEC"] },
  bolivia:     { name: "Bolivia",        flag: "🇧🇴", continent: "samerica", color: "#0e7490", cities: ["LPB", "SRZ", "CBB", "SRE"] },
  paraguay:    { name: "Paraguay",       flag: "🇵🇾", continent: "samerica", color: "#06b6d4", cities: ["ASU", "CDE", "ENC", "LUQ"] },
  uruguay:     { name: "Uruguay",        flag: "🇺🇾", continent: "samerica", color: "#22d3ee", cities: ["MVD", "PDP", "STY", "PDU"] },
  guyana:      { name: "Guyana",         flag: "🇬🇾", continent: "samerica", color: "#99f6e4", cities: ["GEO", "LIN", "NAM", "BAR"] },
  suriname:    { name: "Suriname",       flag: "🇸🇷", continent: "samerica", color: "#0891b2", cities: ["PBM", "LEL", "NNK", "MOE"] },
  nigeria:     { name: "Nigeria",        flag: "🇳🇬", continent: "africa",   color: "#ca8a04", cities: ["LAG", "ABJ", "KAN", "IBA"] },
  egypt:       { name: "Egypt",          flag: "🇪🇬", continent: "africa",   color: "#eab308", cities: ["CAI", "ALX", "GIZ", "LXR"] },
  southafrica: { name: "South Africa",   flag: "🇿🇦", continent: "africa",   color: "#f59e0b", cities: ["JNB", "CPT", "DUR", "PRY"] },
  australia:   { name: "Australia",      flag: "🇦🇺", continent: "oceania",  color: "#7c3aed", cities: ["SYD", "MEL", "BNE", "PER"] },
  newzealand:  { name: "New Zealand",    flag: "🇳🇿", continent: "oceania",  color: "#9333ea", cities: ["AKL", "WLG", "CHC", "HLZ"] },
  fiji:        { name: "Fiji",           flag: "🇫🇯", continent: "oceania",  color: "#a855f7", cities: ["SUV", "NAN", "LBS", "SVU"] },
};

const COUNTRY_KEYS = Object.keys(COUNTRIES);

// Rotating roster: each game deals this many countries per continent from the
// full pool (20 in play). Merges need 4 same-country cities, so playing with
// all 43 at once would make them far too rare; dealing a subset keeps merge
// odds close to the original 18-country game while every game gets a
// different map. Africa and Oceania (3 countries each) are always complete.
// Every count is >= CONTINENT_MIN so continent clears stay reachable.
const ROSTER_PER_CONTINENT = { europe: 4, asia: 4, namerica: 3, samerica: 3, africa: 3, oceania: 3 };
let roster = COUNTRY_KEYS.slice();   // this game's countries (see dealRoster)

// Deal this game's roster. Uses rngFloat, so a Daily Challenge deals the same
// roster to everyone (it runs right after the day's seed is reset, before any
// piece is drawn); endless games get a fresh random deal. Keeps COUNTRY_KEYS
// order so the legend and weighting loops are stable.
function dealRoster() {
  const picked = new Set();
  for (const cont of Object.keys(CONTINENTS)) {
    const keys = COUNTRY_KEYS.filter((k) => COUNTRIES[k].continent === cont);
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(rngFloat() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    const n = Math.min(keys.length, ROSTER_PER_CONTINENT[cont] || keys.length);
    for (const k of keys.slice(0, n)) picked.add(k);
  }
  return COUNTRY_KEYS.filter((k) => picked.has(k));
}

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
let queue;            // upcoming pieces (length QUEUE_SIZE); queue[0] spawns next
let hold;             // piece stashed in the hold slot (null until first hold)
let holdUsed;         // true once the slot was used this piece — one swap per lock
let score, lines, level, events;
let started, paused, gameOver;
let dropCounter, lastTime, dropInterval;
let effects = [];     // transient visual-only overlays (see FX)
let challenge = false; // true during a Daily Challenge run (date-seeded stream)
let challengeSeq;      // countries generated so far this daily run (stream-weighting)

const boardCanvas = document.getElementById("board");
const bctx = boardCanvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nctx = nextCanvas.getContext("2d");
const holdCanvas = document.getElementById("hold");
const hctx = holdCanvas.getContext("2d");

// Logical (CSS-pixel) sizes every draw call works in. The canvases' backing
// buffers are resized to match their on-screen size x devicePixelRatio (see
// fitCanvas), so the board stays sharp however large the layout makes it.
const BOARD_W = COLS * CELL, BOARD_H = ROWS * CELL;
const HOLD_W = 104, HOLD_H = 104;
const NEXT_W = 104, NEXT_H = 204;

function fitCanvas(canvas, ctx, w, h) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.max(1, (rect.width / w) * (window.devicePixelRatio || 1));
  const bw = Math.round(w * scale), bh = Math.round(h * scale);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
}

function fitAllCanvases() {
  fitCanvas(boardCanvas, bctx, BOARD_W, BOARD_H);
  fitCanvas(holdCanvas, hctx, HOLD_W, HOLD_H);
  fitCanvas(nextCanvas, nctx, NEXT_W, NEXT_H);
  if (typeof drawHold === "function" && queue) { drawHold(); drawQueue(); }
}

const el = {
  score: document.getElementById("score"),
  level: document.getElementById("level"),
  lines: document.getElementById("lines"),
  chain: document.getElementById("chain"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayText: document.getElementById("overlay-text"),
  overlayBtn: document.getElementById("overlay-btn"),
  overlayModeBtn: document.getElementById("overlay-mode-btn"),
  overlayDaily: document.getElementById("overlay-daily"),
  overlayNameForm: document.getElementById("overlay-nameform"),
  overlayNameInput: document.getElementById("overlay-name"),
  overlayScores: document.getElementById("overlay-scores"),
  modeTag: document.getElementById("mode-tag"),
};

// A finished run awaiting a name on the game-over screen (null when none is
// pending). Captured at game over so the saved entry uses the final score/level
// even if the player opens Study or clicks around before naming it.
let pendingRun = null;

/* ----------------------------- Helpers -------------------------------- */
function rand(n) { return Math.floor(Math.random() * n); }

// The float source for the gameplay-defining random draws (piece type and
// country). A Daily Challenge pulls from the day's date-seeded stream so the
// sequence is identical for everyone; endless play is plain Math.random. City
// codes never use this — they are cosmetic and stay on rand() (Math.random).
function rngFloat() {
  return challenge ? Daily.rand() : Math.random();
}

// Queue a cosmetic overlay effect. Stamped with its own start time so several
// effects spawned in the same board-resolve animate together. An optional
// `delay` (ms) staggers the effect — a whole cascade resolves in one synchronous
// frame, so staggering makes its callouts pop in sequence rather than all at once.
function addEffect(fx) {
  fx.start = performance.now();
  if (fx.delay == null) fx.delay = 0;
  effects.push(fx);
}

// Rise-and-fade text label floating up from a board cell (overlay-only). `size`
// is the font px; `delay` staggers it within a cascade.
function floatCallout(r, c, text, color, size, delay) {
  addEffect({ kind: "float", r, c, text, color, size: size || 15, dur: FX.floatMs, delay: delay || 0 });
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
// Choose the country for a new piece. Every country keeps a floor chance to
// appear (COUNTRY_BASE_WEIGHT) so the whole world stays in rotation; on top of
// that each country gains weight for every one of its cities already sitting on
// the board (COUNTRY_BOARD_WEIGHT). The bias pulls new pieces toward countries
// you can still finish merging, which keeps the >=4 city-merge reachable now
// that the roster is large — without ever locking any country out.
function pickCountry() {
  const counts = {};
  for (const k of COUNTRY_KEYS) counts[k] = 0;

  if (challenge) {
    // Daily Challenge: the choice must NOT read the board — the whole piece
    // stream has to be a pure function of the date, so two players making
    // different moves still get the same countries. Instead of board tiles we
    // weight by how often each country came up in the last CHALLENGE_WINDOW
    // pieces of this (shared, seeded) stream; the history is the same for
    // everyone, so this stays deterministic while keeping clusters reachable.
    const recent = challengeSeq.slice(-CHALLENGE_WINDOW);
    for (const k of recent) counts[k] += 1;
    let total = 0;
    const weights = roster.map((k) => {
      const w = COUNTRY_BASE_WEIGHT + counts[k] * CHALLENGE_RECENT_WEIGHT;
      total += w;
      return w;
    });
    let pick = rngFloat() * total;
    let chosen = roster[roster.length - 1];
    for (let i = 0; i < roster.length; i++) {
      pick -= weights[i];
      if (pick < 0) { chosen = roster[i]; break; }
    }
    challengeSeq.push(chosen);
    return chosen;
  }

  // Endless: board-aware weighting (see the note above the tunables).
  if (board) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = board[r][c];
        if (t && t.kind === "city") counts[t.country] += 1;
      }
    }
  }
  let total = 0;
  const weights = roster.map((k) => {
    const w = COUNTRY_BASE_WEIGHT + counts[k] * COUNTRY_BOARD_WEIGHT;
    total += w;
    return w;
  });
  let pick = rngFloat() * total;
  for (let i = 0; i < roster.length; i++) {
    pick -= weights[i];
    if (pick < 0) return roster[i];
  }
  return roster[roster.length - 1];
}

// The piece TYPE draw. Routed through rngFloat so a Daily Challenge draws it
// from the day's seeded stream (identical for everyone); endless is random.
function pickType() {
  return SHAPE_KEYS[Math.floor(rngFloat() * SHAPE_KEYS.length)];
}

// Build a piece of a given type and country at the spawn position, in spawn
// orientation. Each filled cell gets its own random city code from the country.
function makePieceFrom(type, countryKey) {
  const shape = SHAPES[type].map((row) => row.slice());
  const cities = COUNTRIES[countryKey].cities;
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

// A brand-new piece. TYPE then COUNTRY are drawn from the active stream in that
// fixed order (so the daily sequence is deterministic); makePieceFrom then
// labels the cells with cosmetic Math.random city codes. Only makePiece (via
// fillQueue / shiftQueue) advances the stream — holding/swapping a piece reuses
// an existing type+country and never draws from it, so it can't desync a daily.
function makePiece() {
  const type = pickType();
  const country = pickCountry();
  return makePieceFrom(type, country);
}

// The upcoming-pieces queue. New pieces are only ever created by makePiece() as
// they enter the tail of the queue — so each one still runs through
// pickCountry()'s board-aware weighting, evaluated against the board at the
// moment it joins the queue. The player sees QUEUE_SIZE pieces ahead.
function fillQueue() {
  while (queue.length < QUEUE_SIZE) queue.push(makePiece());
}

// Take the next piece off the head of the queue and top the queue back up.
function shiftQueue() {
  const piece = queue.shift();
  fillQueue();
  return piece;
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
        flag: country.flag,
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
  current = shiftQueue();
  holdUsed = false;        // a fresh piece is in play — the hold slot reopens
  if (collides(current)) {
    gameOver = true;
  }
  updateHUD();
  drawQueue();
  drawHold();
  if (gameOver) endGame();
}

// Hold / swap. Stash the current piece (keeping its country, reset to spawn
// orientation) and bring the held piece — or the next piece, the first time —
// into play. Allowed once per piece: the slot stays locked until the next lock.
function holdPiece() {
  if (holdUsed) return;
  const stash = makePieceFrom(current.type, current.country);
  if (hold) {
    current = makePieceFrom(hold.type, hold.country);
  } else {
    current = shiftQueue();   // first hold: pull the next piece in, refill the queue
  }
  hold = stash;
  holdUsed = true;
  dropCounter = 0;
  drawQueue();
  drawHold();
  // A swapped-in piece spawns at the top like any other; if it cannot fit, that
  // is a legitimate top-out.
  if (collides(current)) {
    gameOver = true;
    endGame();
  }
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
  let chainN = 0;            // scoring passes so far this resolve (the chain depth)
  const stagger = () => chainN * FX.floatStaggerMs; // chain callouts in sequence
  while (guard++ < 500) {
    applyGravity();
    const mult = Math.pow(2, pass);

    // Rule 2 — city merge: >=4 connected cities of one country -> country tile.
    const merges = findGroups(
      (t) => t && t.kind === "city",
      (t) => t.country,
    ).filter((g) => g.cells.length >= MERGE_MIN);

    if (merges.length) {
      const delay = stagger();
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
        const gained = MERGE_SCORE * g.cells.length * mult;
        score += gained;
        events += 1;
        floatCallout(target[0], target[1], `+${gained}`, CALLOUT.score, 15, delay);
      }
      Music.cue("merge");
      chainN += 1;
      setChain(chainN);
      pass += 1;
      continue;
    }

    // Rule 3 — continent clear: >=3 connected country tiles of one continent.
    const continents = findGroups(
      (t) => t && t.kind === "country",
      (t) => t.continent,
    ).filter((g) => g.cells.length >= CONTINENT_MIN);

    if (continents.length) {
      const delay = stagger();
      let tiles = 0;
      for (const g of continents) {
        const hue = CONTINENTS[g.key] ? CONTINENTS[g.key].swatch : COLORS.countryBorder;
        addEffect({ kind: "flash", cells: g.cells.slice(), color: hue, alpha: 0.9, dur: FX.continentMs });
        // Lowest-leftmost cell anchors this group's callout.
        let focal = g.cells[0];
        for (const [r, c] of g.cells) {
          addEffect({ kind: "ring", r, c, color: hue, dur: FX.ringMs });
          if (r > focal[0] || (r === focal[0] && c < focal[1])) focal = [r, c];
          board[r][c] = null;
        }
        const gained = CONTINENT_SCORE * g.cells.length * mult;
        floatCallout(focal[0], focal[1], `CONTINENT! +${gained}`, CALLOUT.continent, 16, delay);
        tiles += g.cells.length;
        events += 1;
      }
      score += CONTINENT_SCORE * tiles * mult;
      Music.cue("continent");
      chainN += 1;
      setChain(chainN);
      pass += 1;
      continue;
    }

    // Classic full-row clears (country tiles count as filled).
    const full = findFullRows();
    if (full.length) {
      addEffect({ kind: "rows", rows: full.slice(), dur: FX.rowMs });
      const gained = scoreForRows(full.length) * mult;
      const topRow = Math.min(...full);
      const label = full.length >= 4 ? `TETRIS! +${gained}` : `+${gained}`;
      floatCallout(topRow, Math.floor(COLS / 2), label,
        full.length >= 4 ? CALLOUT.tetris : CALLOUT.score,
        full.length >= 4 ? 16 : 15, stagger());
      clearRows(full);
      lines += full.length;
      events += full.length;
      score += gained;
      Music.cue("row");
      chainN += 1;
      setChain(chainN);
      pass += 1;
      continue;
    }

    break; // stable
  }

  // A true cascade (2+ scoring passes) earns a prominent banner near the top of
  // the board, emitted once with the peak chain depth so the passes don't stack.
  if (chainN >= 2) {
    const size = Math.min(30, 18 + chainN * 2);
    addEffect({ kind: "banner", text: `×${chainN} CHAIN`, color: CALLOUT.chain, size, dur: FX.bannerMs, delay: 120 });
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
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Small flag above the code, so a country never depends on colour alone
    // (skipped in the small Hold/Next previews).
    const withFlag = tile.flag && size >= 30;
    if (withFlag) {
      ctx.fillStyle = "#ffffff";   // emoji take their alpha from fillStyle
      ctx.font = `${Math.round(size * 0.3)}px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
      ctx.fillText(tile.flag, px + size / 2, py + size * 0.3);
    }
    ctx.fillStyle = textColorFor(tile.color);
    ctx.font = `700 ${Math.round(size * (withFlag ? 0.34 : 0.4))}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(tile.code, px + size / 2, withFlag ? py + size * 0.68 : py + size / 2 + 1);
  }
  ctx.restore();
}

function drawGrid() {
  const bg = bctx.createLinearGradient(0, 0, 0, BOARD_H);
  bg.addColorStop(0, COLORS.boardTop);
  bg.addColorStop(1, COLORS.boardBottom);
  bctx.fillStyle = bg;
  bctx.fillRect(0, 0, BOARD_W, BOARD_H);
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
    const p = (now - fx.start - fx.delay) / fx.dur;
    if (p < 0 || p >= 1) continue;
    bctx.save();
    if (fx.kind === "float" || fx.kind === "banner") {
      drawCallout(fx, p);
      bctx.restore();
      continue;
    }
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
  effects = effects.filter((fx) => now - fx.start - fx.delay < fx.dur);
}

// Draw a rising, fading text label. A `float` rises from its cell; a `banner`
// sits near the top-centre of the board and drifts up a little. Both fade in
// briefly, hold, then fade out, with a dark stroke so they stay legible over
// any tile. Horizontal position is clamped so edge callouts never clip.
function drawCallout(fx, p) {
  const ease = 1 - Math.pow(1 - p, 3);                  // easeOutCubic
  const fade = p < 0.12 ? p / 0.12 : (p > 0.62 ? (1 - p) / 0.38 : 1);
  const size = fx.size || 15;

  bctx.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`;
  bctx.textAlign = "center";
  bctx.textBaseline = "middle";

  let cx, cy;
  if (fx.kind === "banner") {
    // Sit below the spawn rows so the banner doesn't cover a freshly spawned
    // piece, then drift up a little as it fades.
    cx = (COLS * CELL) / 2;
    cy = CELL * 2.7 - ease * CELL * 0.6;
  } else {
    cx = fx.c * CELL + CELL / 2;
    cy = fx.r * CELL + CELL / 2 - ease * CELL * 1.6;
  }

  const halfW = bctx.measureText(fx.text).width / 2 + 5;
  cx = Math.max(halfW, Math.min(COLS * CELL - halfW, cx));

  bctx.globalAlpha = Math.max(0, Math.min(1, fade));
  bctx.lineJoin = "round";
  bctx.lineWidth = Math.max(3, size * 0.28);
  bctx.strokeStyle = "rgba(0,0,0,0.72)";
  bctx.strokeText(fx.text, cx, cy);
  bctx.fillStyle = fx.color || "#ffffff";
  bctx.fillText(fx.text, cx, cy);
}

function draw() {
  drawGrid();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) drawTile(bctx, c * CELL, r * CELL, CELL, board[r][c]);
    }
  }

  if (!gameOver && current) {
    const country = COUNTRIES[current.country];
    // Ghost
    const g = ghostRow();
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < current.shape[r].length; c++) {
        if (!current.shape[r][c]) continue;
        const br = current.row + r + g;
        const bc = current.col + c;
        if (br < 0) continue;
        roundedPath(bctx, bc * CELL + 2.5, br * CELL + 2.5, CELL - 5, CELL - 5, 4);
        bctx.save();
        bctx.globalAlpha = COLORS.ghostFill;
        bctx.fillStyle = country.color;
        bctx.fill();
        bctx.globalAlpha = COLORS.ghostStroke;
        bctx.lineWidth = 2;
        bctx.setLineDash([5, 3]);
        bctx.strokeStyle = country.color;
        bctx.stroke();
        bctx.restore();
      }
    }
    // Active piece
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < current.shape[r].length; c++) {
        if (!current.shape[r][c]) continue;
        const br = current.row + r;
        const bc = current.col + c;
        if (br < 0) continue;
        drawTile(bctx, bc * CELL, br * CELL, CELL, {
          kind: "city",
          color: country.color,
          flag: country.flag,
          code: current.codes[r][c],
        });
      }
    }
  }

  drawEffects(performance.now());
}

// Draw one piece centred — by its filled bounding box, so every shape sits
// visually centred — within a rectangular slot of a canvas. `alpha` fades the
// whole piece (used to grey out a locked-out hold slot, and to recede the later
// pieces in the Next queue).
function drawPieceSlot(ctx, piece, x, y, w, h, cell, alpha) {
  if (!piece) return;
  const country = COUNTRIES[piece.country];
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
  }
  const offX = x + (w - (maxC - minC + 1) * cell) / 2;
  const offY = y + (h - (maxR - minR + 1) * cell) / 2;
  ctx.save();
  if (alpha != null) ctx.globalAlpha = alpha;
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (!piece.shape[r][c]) continue;
      drawTile(ctx, offX + (c - minC) * cell, offY + (r - minR) * cell, cell, {
        kind: "city",
        color: country.color,
        flag: country.flag,
        code: piece.codes[r][c],
      });
    }
  }
  ctx.restore();
}

// The hold slot: a single centred piece, greyed while it is locked out.
function drawHold() {
  hctx.fillStyle = COLORS.previewBg;
  hctx.fillRect(0, 0, HOLD_W, HOLD_H);
  drawPieceSlot(hctx, hold, 0, 0, HOLD_W, HOLD_H,
    PREVIEW_CELL, holdUsed ? 0.32 : null);
}

// The Next preview: the upcoming QUEUE_SIZE pieces stacked top-to-bottom, the
// next-up piece on top. Later pieces recede slightly so the order reads at a
// glance; thin separators divide the slots.
function drawQueue() {
  nctx.fillStyle = COLORS.previewBg;
  nctx.fillRect(0, 0, NEXT_W, NEXT_H);
  const slotH = NEXT_H / QUEUE_SIZE;
  for (let i = 0; i < QUEUE_SIZE; i++) {
    if (i > 0) {
      nctx.save();
      nctx.strokeStyle = COLORS.gridEdge;
      nctx.lineWidth = 1;
      nctx.beginPath();
      nctx.moveTo(8, i * slotH + 0.5);
      nctx.lineTo(NEXT_W - 8, i * slotH + 0.5);
      nctx.stroke();
      nctx.restore();
    }
    // First piece full strength; the two behind it fade back a touch.
    const alpha = i === 0 ? null : (i === 1 ? 0.72 : 0.5);
    drawPieceSlot(nctx, queue[i], 0, i * slotH, NEXT_W, slotH,
      PREVIEW_CELL, alpha);
  }
}

/* ------------------------------- HUD ---------------------------------- */
function updateHUD() {
  el.score.textContent = String(score);
  el.level.textContent = String(level);
  el.lines.textContent = String(lines);
}

// Sidebar combo counter. It shows the live chain depth as a cascade resolves and
// lights up at 2+; after a short hold it fades back to idle. Purely a readout —
// it reflects scoring, it never drives it.
let chainResetTimer = null;
function setChain(n) {
  if (!el.chain) return;
  // Only a real chain (2+ scoring passes in one resolve) lights the counter; a
  // lone merge or clear isn't a combo and shouldn't flash the sidebar.
  if (n < 2) return;
  if (chainResetTimer) { clearTimeout(chainResetTimer); chainResetTimer = null; }
  el.chain.textContent = `×${n}`;
  el.chain.classList.remove("hot");
  void el.chain.offsetWidth;              // restart the pop animation
  el.chain.classList.add("active", "hot");
  chainResetTimer = setTimeout(resetChain, 1400);
}

function resetChain() {
  if (chainResetTimer) { clearTimeout(chainResetTimer); chainResetTimer = null; }
  if (!el.chain) return;
  el.chain.textContent = "—";
  el.chain.classList.remove("active", "hot");
}

function buildLegend() {
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  for (const key of Object.keys(CONTINENTS)) {
    const cont = CONTINENTS[key];
    const wrap = document.createElement("div");
    wrap.className = "cont";
    wrap.style.setProperty("--hue", cont.swatch);   // tints the row (style.css)

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
    const names = roster
      .filter((k) => COUNTRIES[k].continent === key)
      .map((k) => `${COUNTRIES[k].flag} ${COUNTRIES[k].name}`)
      .join("  ·  ");
    list.textContent = names;

    wrap.appendChild(head);
    wrap.appendChild(list);
    legend.appendChild(wrap);
  }
}

// Low-level overlay setter. Hides the high-score extras (name entry + table) by
// default; callers that want them (start screen, game over) re-show them after.
function showOverlay(title, text, btnLabel) {
  el.overlayTitle.textContent = title;
  el.overlayText.textContent = text;
  el.overlayBtn.textContent = btnLabel;
  el.overlayNameForm.classList.add("hidden");
  el.overlayScores.classList.add("hidden");
  if (el.overlayModeBtn) el.overlayModeBtn.classList.add("hidden");
  if (el.overlayDaily) el.overlayDaily.classList.add("hidden");
  el.overlay.classList.remove("hidden");
}

function hideOverlay() {
  el.overlay.classList.add("hidden");
}

// The secondary overlay button that switches mode. `mode` is the mode it starts
// ("daily" or "endless"); pass null to leave it hidden.
function setModeButton(mode) {
  if (!el.overlayModeBtn) return;
  if (!mode) { el.overlayModeBtn.classList.add("hidden"); return; }
  el.overlayModeBtn.dataset.mode = mode;
  el.overlayModeBtn.textContent = mode === "daily" ? "Daily" : "Endless";
  el.overlayModeBtn.classList.remove("hidden");
}

// One-line daily status on an overlay (date + today's best). Hidden by default.
function showDailyTag(text) {
  if (!el.overlayDaily) return;
  el.overlayDaily.textContent = text;
  el.overlayDaily.classList.remove("hidden");
}

function dailyStatus() {
  const b = Daily.best();
  return b > 0 ? `today's best ${b.toLocaleString()}` : "no score yet today";
}

// Sidebar indicator shown only while a Daily Challenge is being played.
function updateModeTag() {
  if (!el.modeTag) return;
  if (challenge) {
    el.modeTag.textContent = `🗓 Daily · ${Daily.todayKey()}`;
    el.modeTag.classList.remove("hidden");
  } else {
    el.modeTag.classList.add("hidden");
  }
}

// Reveal the high-score table inside the current overlay, optionally
// highlighting a freshly-saved run at `highlightRank` (0-based, -1 for none).
function showScores(highlightRank) {
  Scores.renderInto(el.overlayScores, highlightRank == null ? -1 : highlightRank);
  el.overlayScores.classList.remove("hidden");
}

function endGame() {
  Music.pause();

  if (challenge) {
    // Daily runs keep their own board: record against today's best (its own
    // localStorage key) — they never enter the endless top-10 table, and the
    // endless table / name entry don't appear here.
    const res = Daily.record(score);
    const verdict = res.isNew && score > 0
      ? `New daily best: ${res.best.toLocaleString()}!`
      : (res.best > 0 ? `Today's best: ${res.best.toLocaleString()}.` : "");
    showOverlay("Game Over", `You scored ${score.toLocaleString()} on today's Daily Challenge.`, "Play again");
    showDailyTag(`🗓 Daily · ${Daily.todayKey()}${verdict ? " · " + verdict : ""}`);
    setModeButton("endless");     // offer a switch back to endless play
    pendingRun = null;
    return;
  }

  showOverlay("Game Over", `You scored ${score.toLocaleString()} across ${level} level(s).`, "Play again");
  if (Scores.qualifies(score)) {
    // New top-10 run — ask for a name before showing anything else. The mode
    // button stays hidden here so a stray click can't discard the pending run;
    // it reappears once the name is saved (saveHighScore).
    pendingRun = { score, level, lines };
    el.overlayNameInput.value = "";
    el.overlayNameForm.classList.remove("hidden");
    el.overlayNameInput.focus();
  } else {
    pendingRun = null;
    setModeButton("daily");       // offer today's Daily Challenge
    showScores(-1);
  }
}

// Save the pending run under the typed name, then show the table with it lit up.
function saveHighScore() {
  if (!pendingRun) return;
  const rank = Scores.add({
    name: el.overlayNameInput.value,
    score: pendingRun.score,
    level: pendingRun.level,
    lines: pendingRun.lines,
  });
  pendingRun = null;
  el.overlayNameForm.classList.add("hidden");
  // Hand the keyboard back to the game so R / Play-again work right after saving.
  el.overlayNameInput.blur();
  setModeButton("daily");         // now safe to offer a mode switch
  showScores(rank);
  el.overlayBtn.focus();
}

/* ------------------------------- Loop --------------------------------- */
function loop(time = 0) {
  const delta = time - lastTime;
  lastTime = time;
  if (started && !paused && !gameOver) {
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

  // While a text field owns focus (the high-score name entry), let it keep the
  // keyboard — a typed "r"/"p"/"m" must not fire a game shortcut.
  const ae = document.activeElement;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;

  // While the Study overlay is open it owns the keyboard: Escape closes it and
  // everything else is ignored, so the game underneath never moves.
  if (Study.isOpen()) {
    if (e.key === "Escape") { Study.close(); e.preventDefault(); }
    return;
  }

  if (e.key === "m" || e.key === "M") {
    Music.toggleMute();
    e.preventDefault();
    return;
  }
  if (e.key === "r" || e.key === "R") {
    restartRun();              // restart the current mode (endless or daily)
    e.preventDefault();
    return;
  }

  // Start screen: wait for the player to begin.
  if (!started) {
    if (e.key === "Enter" || e.key === " ") { startGame(); e.preventDefault(); }
    return;
  }

  if (gameOver) return;

  if (e.key === "p" || e.key === "P") {
    paused = !paused;
    if (paused) {
      showOverlay("Paused", "Press P to resume.", "Restart");
      if (challenge) showDailyTag(`🗓 Daily · ${Daily.todayKey()} · ${dailyStatus()}`);
      Music.pause();
    } else { hideOverlay(); Music.play(); }
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
    case "c":
    case "C": holdPiece(); e.preventDefault(); break;
    default: break;
  }
}

/* --------------------------- Touch input ------------------------------ */
// Mobile/touch play. This is strictly additive: desktop keyboard play is
// unchanged, and every gesture maps to the SAME action a key already triggers.
//   • drag left / right  -> move the piece column by column (live, as you drag)
//   • quick tap          -> rotate
//   • swipe down         -> soft drop (short swipe) or hard drop (long/fast flick)
// The board canvas sets `touch-action: none`, so these gestures never scroll or
// zoom the page. Drops are decided on touch-end from the net vertical travel.
let touch = null;

// Gestures only drive the game during active play. When an overlay (start,
// pause, game over) or the Study view is up it covers the canvas, so this is
// belt-and-suspenders — but it keeps a stray touch from moving a hidden piece.
function touchPlayable() {
  return started && !paused && !gameOver && !Study.isOpen();
}

// Displayed board cell size in CSS px — derives the move step and drop
// thresholds from the canvas's on-screen size, so they stay right at any scale.
function displayedCell() {
  const rect = boardCanvas.getBoundingClientRect();
  return {
    w: Math.max(16, rect.width / COLS),
    h: Math.max(16, rect.height / ROWS),
  };
}

function onTouchStart(e) {
  Music.unlock();                 // a touch is a user gesture — safe to start audio
  if (!touchPlayable() || e.touches.length !== 1) { touch = null; return; }
  const t = e.touches[0];
  touch = { x0: t.clientX, y0: t.clientY, lastX: t.clientX, t0: performance.now(), accX: 0, cols: 0 };
  e.preventDefault();
}

function onTouchMove(e) {
  if (!touch || !touchPlayable()) return;
  const t = e.touches[0];
  const step = displayedCell().w;
  touch.accX += t.clientX - touch.lastX;
  touch.lastX = t.clientX;
  // Each full column-width of horizontal travel nudges the piece one column.
  while (touch.accX >= step) { move(1); touch.accX -= step; touch.cols += 1; }
  while (touch.accX <= -step) { move(-1); touch.accX += step; touch.cols += 1; }
  e.preventDefault();
}

function onTouchEnd(e) {
  if (!touch) return;
  const g = touch;
  touch = null;
  if (!touchPlayable()) return;
  const end = e.changedTouches[0];
  const cell = displayedCell();
  const dx = end.clientX - g.x0;
  const dy = end.clientY - g.y0;
  const elapsed = performance.now() - g.t0;
  const absX = Math.abs(dx), absY = Math.abs(dy);

  if (g.cols === 0 && absX < TAP_MAX_DIST && absY < TAP_MAX_DIST && elapsed < TAP_MAX_MS) {
    rotatePiece();                               // quick tap, no drag -> rotate
  } else if (dy > cell.h * SWIPE_DROP_CELLS && absY > absX) {
    // Downward swipe that outweighs any sideways drag -> drop. A long swipe or a
    // fast flick hard-drops; a short, gentle one soft-drops a single cell.
    const velocity = dy / Math.max(1, elapsed);  // px per ms, downward
    if (dy > cell.h * HARD_DROP_CELLS || velocity > HARD_DROP_VELOCITY) hardDrop();
    else softDrop();
  }
  e.preventDefault();
}

boardCanvas.addEventListener("touchstart", onTouchStart, { passive: false });
boardCanvas.addEventListener("touchmove", onTouchMove, { passive: false });
boardCanvas.addEventListener("touchend", onTouchEnd, { passive: false });
boardCanvas.addEventListener("touchcancel", () => { touch = null; }, { passive: false });

/* ------------------------------ Setup --------------------------------- */
// Build a fresh board and piece queue. Does NOT start play — callers decide
// whether to begin (startGame) or hold on the start screen (showStartScreen).
function newGame() {
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
  hold = null;
  holdUsed = false;
  challengeSeq = [];
  if (challenge) Daily.reset();   // re-seed the day's deterministic stream first
  roster = dealRoster();          // daily: from the seed, before any piece is drawn
  buildLegend();
  queue = [];
  fillQueue();            // endless: uniform on an empty board. daily: seeded stream.
  current = shiftQueue();
  updateHUD();
  updateModeTag();
  resetChain();
  drawQueue();
  drawHold();
  Music.setLevel(1);
}

// Begin — or restart — active play immediately, in whatever mode `challenge` is
// currently set to. newGame() re-seeds the daily stream when challenge is true.
function beginRun() {
  newGame();
  started = true;
  hideOverlay();
  Music.play();
}

function startGame() { challenge = false; beginRun(); }   // endless
function startDaily() { challenge = true; beginRun(); }   // today's Daily Challenge
function restartRun() { beginRun(); }                     // R / primary button: same mode

// The screen shown on load: the board is ready but nothing falls and the music
// stays silent until the player chooses Play, Daily, or Study first.
function showStartScreen() {
  challenge = false;
  newGame();
  started = false;
  pendingRun = null;
  Music.pause();
  showOverlay(
    "Tetropolis",
    "Group cities into countries, countries into continents. Press Play to begin, try today's Daily Challenge, or Study the world first.",
    "Play",
  );
  setModeButton("daily");
  showDailyTag(`🗓 Daily · ${Daily.todayKey()} · ${dailyStatus()}`);
  showScores(-1);     // the hall of fame greets every new player
}

// The primary overlay button (Play / Restart / Play again) begins a fresh run in
// the CURRENT mode: endless from the start screen (where challenge is false), or
// the same mode you were just playing on pause / game over. The secondary "mode"
// button switches between Endless and Daily.
el.overlayBtn.addEventListener("click", () => {
  Music.unlock();
  restartRun();
});

el.overlayModeBtn.addEventListener("click", () => {
  Music.unlock();
  if (el.overlayModeBtn.dataset.mode === "daily") startDaily();
  else startGame();
});

// Submitting the name form (Save button or Enter) records the pending run.
el.overlayNameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  Music.unlock();
  saveHighScore();
});
document.addEventListener("keydown", onKey);

buildLegend();
fitAllCanvases();
window.addEventListener("resize", fitAllCanvases);
if (window.ResizeObserver) new ResizeObserver(fitAllCanvases).observe(boardCanvas);
showStartScreen();
requestAnimationFrame(loop);
