# Tetropolis — Rules of Play

The formal rules, exactly as `game.js` implements them. Where a detail is
subtle (cascade multipliers, per-column gravity, event counting), this document
describes the **real** behaviour of the code, not an idealized version.

---

## 1. The board and the pieces

- The board is **10 columns × 18 rows**, drawn on a single `<canvas>` 340×612 px
  (each cell is 34 px). The sidebar shows score, level, lines, a **hold** slot
  beside a **Next** preview, and a continent legend.
- Play uses the **7 standard tetrominoes** — I, O, T, S, Z, J, L — in their
  standard orientations.
- **Next queue:** the game keeps a queue of upcoming pieces and the **Next**
  preview shows the next **3**, stacked top-to-bottom — the piece that spawns next
  on top, the two after it fading back behind it. Pieces are drawn off the **head**
  of the queue as play advances, and a fresh piece is generated onto the **tail**
  (see country assignment in section 2). Seeing three pieces ahead lets you plan
  merges a few moves out.
- A new piece **spawns at the top**, horizontally centred
  (`col = floor((10 − piece width) / 2)`, `row = 0`).
- A **ghost** outline shows where the current piece will land.

### Rotation

- Rotation is **90° clockwise**. There is **no wall kick**: the piece rotates
  only if the rotated shape fits where it currently sits. If it would collide
  with a wall, the floor, or a settled tile, the rotation is simply **ignored**
  (nothing moves). The city codes on the cells rotate together with the shape.

### 1a. Hold

- Pressing **C** puts the current piece into the **hold** slot and brings a piece
  back into play — the piece already in hold, or (the first time, when the slot is
  empty) the piece at the head of the **Next** queue, which then advances as usual.
- **One swap per piece:** after a hold the slot is **locked out** until the
  current piece locks. A second **C** before that lock does nothing. The hold
  preview is **greyed** while it is locked out and returns to full colour once a
  piece locks and the slot reopens.
- A held piece **keeps its country** and comes back at the **spawn position in its
  spawn orientation** (not wherever or however it was rotated when you held it).
- If the piece swapped in cannot fit at the spawn position, that is a top-out and
  the game ends (section 8) — the same rule as any other spawn.
- Holding never changes the board, score, level, or the rules below; it only
  changes **which piece you are placing**.

---

## 2. Countries and continents

Every piece belongs to **one country**. The world is **18 countries across
5 continents**, each continent given a hue family so you can read it at a glance:

| Continent | Hue | Countries (flag · cities) |
| --- | --- | --- |
| **Europe** | blues | 🇮🇹 Italy (ROM MIL NAP TUR) · 🇫🇷 France (PAR LYO MRS NIC) · 🇩🇪 Germany (BER MUN HAM CGN) · 🇪🇸 Spain (MAD BCN SEV VAL) |
| **Asia** | reds / oranges | 🇯🇵 Japan (TYO OSA KYO NGO) · 🇰🇷 South Korea (SEL BUS INC DAE) · 🇨🇳 China (BEI SHA SHE CHE) · 🇮🇳 India (DEL BOM BLR CCU) |
| **Americas** | greens | 🇺🇸 USA (NYC LAX CHI MIA) · 🇧🇷 Brazil (SAO RIO BSB SSA) · 🇦🇷 Argentina (BUE COR ROS MDZ) · 🇲🇽 Mexico (MEX GDL MTY CUN) |
| **Africa** | golds | 🇳🇬 Nigeria (LAG ABJ KAN IBA) · 🇪🇬 Egypt (CAI ALX GIZ LXR) · 🇿🇦 South Africa (JNB CPT DUR PRY) |
| **Oceania** | purples | 🇦🇺 Australia (SYD MEL BNE PER) · 🇳🇿 New Zealand (AKL WLG CHC HLZ) · 🇫🇯 Fiji (SUV NAN LBS SVU) |

### How a piece is assigned a country

- When a piece is created — at the moment it joins the **tail** of the Next queue
  (section 1) — its country is chosen **at random, but weighted toward countries
  already on the board** at that time. Every country keeps a floor chance to
  appear (so the whole world stays in rotation), and each country gains extra
  weight for every one of its city tiles currently on the board. With a roster
  this large, uniform-random spawns would make same-country clusters — and so the
  ≥4 city merge (rule B) — too rare; the bias pulls new pieces toward countries
  you can still finish merging, while never locking any country out. On an empty
  board the weighting is uniform across all 18 countries.
  - **In a Daily Challenge (section 13) this is different:** the country is chosen
    **board-independently** from the day's seeded stream — weighted only toward
    countries that came up recently in that *stream*, never toward the board — so
    the whole piece sequence is identical for every player regardless of how they
    play. City codes stay random either way: they are cosmetic and never affect a
    merge or the score.
- **Every filled cell** of the piece is a **city tile**: the country's colour as
  background, with a city code drawn on top. Each cell picks its code
  **independently at random** from that country's four cities — so a single
  piece's cells often show *different* city codes, but they are all the **same
  country** and the **same colour**.

There are two kinds of tile on the board:

- **City tile** — a single city (country colour, 3-letter code).
- **Country tile** — a merged country (the country's flag on a gold-bordered
  cell). Created by a city merge (rule below).

---

## 3. Locking a piece

A piece **locks** when it can no longer move down — either gravity, a soft drop,
or a hard drop tries to push it into the floor or onto settled tiles. Every
filled cell is written to the board as a **city tile**. If any part of the piece
locks **above the top of the board** (row < 0), the game ends (top-out).

After a lock, the board is **resolved** (section 5). Then the piece at the
**head** of the Next queue becomes the current piece and a fresh piece is
generated onto the queue's **tail**. If the new current piece **collides the
moment it spawns**, the game ends.

---

## 4. The three clearing mechanics

All three are evaluated by the board-resolve loop (section 5). Connectivity is
always **orthogonal** (4-connected: up/down/left/right — never diagonal).

### Rule A — Classic row clear

- Any **completely full row** (all 10 cells non-empty) clears. Country tiles
  count as filled cells, so they help complete rows.
- **Score** (before the cascade multiplier):

  | Rows cleared at once | Points |
  | --- | --- |
  | 1 | 100 |
  | 2 | 300 |
  | 3 | 500 |
  | 4 | 800 |
  | 5+ (possible via cascades) | 800 + 400 per extra row |

- `lines` increases by the number of rows cleared.

### Rule B — City merge (≥ 4 same-country cities)

- Any orthogonally-connected group of **4 or more city tiles of the same
  country** collapses into **one country tile**.
- The country tile appears at the group's **lowest-leftmost** cell (greatest row;
  on a tie, smallest column). Every other cell in the group becomes empty.
- **Score:** `250 × group size` (before the cascade multiplier). A 4-cell merge
  scores 1000, a 5-cell merge 1250, and so on.
- **All** qualifying merge groups on the board are collapsed in the same pass.

### Rule C — Continent clear (≥ 3 same-continent country tiles)

- Any orthogonally-connected group of **3 or more country tiles of the same
  continent** clears entirely (all cells become empty). Different countries
  count together as long as they share a continent.
- **Score:** `1000 × tiles cleared` (before the cascade multiplier). The total is
  summed across every qualifying continent group resolved in that pass.

---

## 5. Gravity and cascades

After each lock the board is resolved in a loop (capped at 500 passes as a safety
guard). Each pass does, **in this order**:

1. **Column gravity.** Every tile falls straight down to the lowest empty cell in
   its own column; each column is independently packed to the bottom. This means
   **overhangs do not survive** — if a piece locks with a cell hanging over empty
   space, that cell drops on the next pass. Columns are always bottom-packed.
2. **Check the three mechanics, in strict priority:**
   - First, **city merges** (rule B). If any fire, apply them and start a new pass.
   - Otherwise, **continent clears** (rule C). If any fire, apply them and start a
     new pass.
   - Otherwise, **classic row clears** (rule A). If any fire, apply them and start
     a new pass.
   - Otherwise the board is **stable** and the loop ends.

Only **one category** runs per pass — whichever has priority among those that
match — so merges always resolve before continent clears, which resolve before
row clears.

### Cascade multiplier

Each pass carries a score multiplier of **×2^(pass number)**, counting the first
pass as pass 0:

| Pass | Multiplier |
| --- | --- |
| 1st (the initial resolution) | ×1 |
| 2nd | ×2 |
| 3rd | ×4 |
| 4th | ×8 |
| … | … |

So the **first** set of clears/merges scores at face value, and every **further
cascade step** that it triggers doubles again. All three scoring rules (A, B, C)
are multiplied by the current pass multiplier.

Each scoring pass pops a floating **score callout** up from its focal cell
(`+1000`, `CONTINENT! +…`, `TETRIS! +…`). When a single resolution runs **two or
more** scoring passes, a **×N CHAIN** banner flashes on the board and the
sidebar **Chain** counter lights up with the depth reached. These are purely
cosmetic read-outs of the scoring above — they change no score, event, or
mechanic.

---

## 6. Leveling and gravity speed

- An **event** is counted for: each city merge group, each continent-clear group,
  and each row cleared (a 3-row clear counts as 3 events). Soft/hard drops do not
  count as events.
- **Level = 1 + floor(total events / 8)** — i.e. the level rises every 8 events.
- Gravity interval = **max(90, 800 − (level − 1) × 65)** milliseconds. Level 1
  drops every 800 ms; each level shaves 65 ms, down to a floor of 90 ms.

---

## 7. Scoring summary

All clear/merge scores below are **multiplied by the cascade multiplier** of the
pass that produced them (section 5).

| Action | Points |
| --- | --- |
| Soft drop (↓) | +1 per cell dropped |
| Hard drop (Space) | +1 per cell fallen |
| Automatic gravity drop | 0 |
| Row clear | 100 / 300 / 500 / 800 for 1–4 rows (5+: 800 + 400 each) |
| City merge | 250 × group size |
| Continent clear | 1000 × tiles cleared |

---

## 8. Start screen, pause, restart, and game over

- **Start screen:** on load the board is ready but **nothing falls and the
  music is silent** until the player chooses to begin. The start overlay offers
  **Play** (begin endless play), **Daily** (today's Daily Challenge, section 13),
  and **Study** (open the geography reference, section 11), and shows today's
  Daily best. Pressing **Enter** or **Space** also begins (endless) play.
- **Pause (P):** toggles pause. While paused, gravity stops and a "Paused"
  overlay shows "Press P to resume." The keys that act while paused are **P**
  (resume) and **R** (restart); the paused overlay also offers **Study**.
- **Restart (R):** restarts immediately, at **any** time — mid-game, paused, or
  on the game-over screen. Everything resets: empty board, score 0, level 1,
  lines 0, a fresh current piece and a full Next queue.
- **Game over:** triggered by a top-out (a piece locking above the board) or a
  new piece colliding the instant it spawns. A "Game Over" overlay shows your
  score and level and offers **Play again** plus **Study**.
- The overlay's **primary button** (Play / Restart / Play again) always begins a
  fresh game **in the current mode** — endless from the start screen, or the mode
  you were just playing on pause / game over. On the start and game-over screens a
  **mode button** beside it switches between **Endless** and **Daily**, so neither
  mode is a dead end. Pressing **R** likewise restarts the current mode. The
  **Study** button opens Study without disturbing the game underneath.
- The **high-score table** (section 12) is shown on the start and game-over
  screens, and a run that makes the top 10 is named on game over. The pause
  overlay stays clean — no table, no name entry.

---

## 9. Controls

| Key | Action |
| --- | --- |
| ← / → | Move left / right |
| ↑ or X | Rotate (clockwise, rotate-if-fits) |
| ↓ | Soft drop (+1 point per cell) |
| Space | Hard drop (+1 point per cell) |
| C | Hold / swap piece (section 1a) |
| P | Pause / resume |
| R | Restart |
| M | Mute / unmute music |
| Esc | Close Study (when Study is open) |

While Study is open it owns the keyboard: **Esc** closes it and every other key
is ignored, so the game underneath never moves.

### Touch controls

On touch devices the board accepts gestures that map to the **same** actions as
the keys above (desktop keyboard play is unchanged):

| Gesture | Action |
| --- | --- |
| Drag left / right | Move the piece column by column (as you drag) |
| Quick tap | Rotate |
| Short swipe down | Soft drop (one cell) |
| Long swipe / fast flick down | Hard drop |

Gestures only act during live play — while an overlay (start, pause, game over)
or Study is on screen they do nothing. The board uses `touch-action: none`, so
these gestures never scroll or zoom the page, and the canvas scales to fit the
screen while keeping its exact 10×18 shape.

---

## 10. Music & sound

The game plays an original chiptune loop and short sound cues, synthesised live
with the Web Audio API — there are no audio files and no network requests. Audio
is created only **after the first user gesture** (a keypress, the Play button, or
the speaker button), to respect browser autoplay rules.

- The loop grows busier and nudges slightly faster as the **level** rises (an
  extra percussion or arpeggio layer every couple of levels, and a small tempo
  increase, both capped). It sits quietly under the game, not over it.
- Subtle cues play on a **city merge**, a **continent clear**, and a **row clear**.
- **Mute** with the **M** key or the speaker button in the sidebar; the setting is
  remembered via `localStorage`. Music **pauses** when the game is paused and on
  game over, and resumes when you unpause or restart.

Sound never affects gameplay, scoring, or the rules above.

---

## 11. Study mode

**Study** is a geography reference and self-quiz you can open from the start
screen, the pause overlay, or the game-over overlay (the **Study** button on
each). It is purely informational — opening or closing it **never** touches the
board, score, level, or pause state, so leaving Study returns you to **exactly**
where you were: a paused game stays paused with the board intact.

- **Browse** (default): every continent → country → city, drawn from the same
  dataset the game plays with. Each 3-letter code is shown next to the real city
  it stands for (e.g. `ROM` → Rome, `GIZ` → Giza).
- **Quiz** (toggle): a shuffled grid of bare city codes. Click a code to reveal
  its city, flag, country, and continent — then test yourself on the next one.
- Close Study with the **Back** button or the **Esc** key.

Study never affects gameplay, scoring, or the rules above.

---

## 12. High scores

A **local top-10 high-score table** is kept in the browser's `localStorage` —
there is no account and no network, so the table lives only in your own browser.

- **Recording a run:** when a game ends, if its score is **greater than 0** and
  high enough to make the **top 10** (either the table isn't full yet, or the
  score beats the lowest kept score — a tie with the lowest does **not** qualify),
  the game-over screen asks for a **name** (up to 12 characters; left blank it is
  saved as `YOU`). On save, the table appears with your new entry highlighted.
- **Showing the table:** it is displayed on the **start screen** (a friendly
  empty state before anyone has scored) and on an **endless game-over screen**.
  The **pause** overlay never shows it, and a **Daily Challenge** game over shows
  the day's best (section 13) instead of this table.
- Each entry stores the name, score, level reached, and date. Only the best 10
  are kept. Clearing browser storage resets the table.
- **Only endless runs** are recorded here. Daily Challenge runs are kept
  separately (section 13) so the two leaderboards stay comparable.

The high-score table is purely a record of past runs — it never affects
gameplay, scoring, or the rules above. If `localStorage` is unavailable (for
example opening the file directly in a browser that blocks storage), the game
still plays normally; scores just aren't remembered between sessions.

---

## 13. Daily Challenge

The **Daily Challenge** is a deterministic run everyone shares on a given calendar
day: the exact same sequence of piece **types** and **countries** falls for every
player, so the day's scores are directly comparable. Start it with the **Daily**
button on the start screen (or the mode button on a game-over screen); endless
play stays the default.

- **The seed is the date.** The piece stream is generated by a small
  pseudo-random generator seeded from today's **local date** (`YYYY-MM-DD`) — no
  network, no account, nothing leaves your browser. Everyone who plays on the same
  day gets the same stream; a new day is a new seed, and restarting the day
  (**R**, Play again) replays the same stream from the start.
- **Board-independent pieces.** Unlike endless play, the challenge's country
  choice does **not** look at your board (section 2) — it is a pure function of
  the seed, so two players making different moves still receive the same pieces.
  It is still weighted toward recently-seen countries (from the shared stream, not
  the board) so merges stay reachable. **City codes are cosmetic and stay random**
  — they never affect a merge or the score, and leaving them random means holding
  or swapping a piece can't knock your stream out of sync with anyone else's.
- **Everything else is identical to endless play:** the board, the three clearing
  mechanics, cascades and multipliers, leveling, gravity speed, controls, hold,
  and the Next queue all behave exactly as described above.
- **Today's best.** Your best Daily score for the day is kept under its own
  `localStorage` record — **separate** from the endless high-score table
  (section 12) — and shown on the start screen and on a Daily game over. It is
  **day-aware**: a best from an earlier day doesn't carry over; each day starts
  fresh. A sidebar badge (**🗓 Daily · DATE**) marks a Daily run while you play.

The Daily Challenge changes only *which* pieces fall and where the score is
recorded — it never changes the rules, scoring, or mechanics above.

---

Built autonomously by [Aeon](https://aeon.fun).
