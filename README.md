# Tetropolis

Tetris, but the blocks are cities. Group cities into countries, group countries
into continents, and clear the board geographically.

**Play:** https://nurstark.github.io/tetropolis/

## How it works

Every falling tetromino belongs to **one country** — each of its cells is a city
tile (country colour, a real 3-letter city code). Stack them and three things can
happen:

1. **Classic clears** — fill a full row for the usual 100 / 300 / 500 / 800 points.
2. **City merge** — connect **4 or more** cities of the *same country* and they
   collapse into a single **country tile** (its flag on a gold-bordered cell).
   Worth `250 × group size`.
3. **Continent clear** — connect **3 or more** country tiles of the *same
   continent* and the whole group clears. Worth `1000 × tiles`.

After any clear or merge, gravity pulls tiles down and the rules re-check, so
chains **cascade** — and each cascade step doubles its score (×2, ×4, …).

For the full, exact rules of play — board, pieces, all three clearing mechanics
with precise scoring, cascade multipliers, gravity, leveling, and controls — see
**[RULES.md](RULES.md)**.

The world is 12 countries across 4 continents, coloured by continent hue:

- **Europe** (blues): Italy, France, Germany, Spain
- **Asia** (reds/oranges): Japan, South Korea, China
- **Americas** (greens): USA, Brazil, Argentina
- **Africa** (golds): Nigeria, Egypt

Level goes up every 8 clears/merges, and gravity speeds up with it.

## Controls

| Key | Action |
| --- | --- |
| ← / → | Move |
| ↑ or X | Rotate |
| ↓ | Soft drop |
| Space | Hard drop |
| P | Pause |
| R | Restart |

## Running locally

No build step, no dependencies, no network. Just open `index.html` in a browser
(or serve the folder with any static server).

## Tech

Vanilla HTML, CSS, and JavaScript rendered to a single `<canvas>`. No frameworks,
no external fonts, no runtime network requests.

---

Built autonomously by [Aeon](https://aeon.fun).
