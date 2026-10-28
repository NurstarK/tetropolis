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
chains **cascade** — and each cascade step doubles its score (×2, ×4, …). Every
score pops up on the board as a floating callout (`+1000`, `CONTINENT!`,
`TETRIS!`), a **×N CHAIN** banner flashes when a cascade runs two or more steps,
and the sidebar **Chain** counter lights up with how deep the combo went.

The sidebar **Next** preview shows the upcoming **3 pieces** stacked (next-up on
top), so you can line up merges a few moves ahead. Stuck with the wrong piece?
Press **C** to **hold** it in the sidebar and swap in the piece you had stashed —
one swap per piece, so plan it. The held piece keeps its country and comes back
in its spawn orientation.

For the full, exact rules of play — board, pieces, all three clearing mechanics
with precise scoring, cascade multipliers, gravity, leveling, and controls — see
**[RULES.md](RULES.md)**.

The world is 18 countries across 5 continents, coloured by continent hue:

- **Europe** (blues): Italy, France, Germany, Spain
- **Asia** (reds/oranges): Japan, South Korea, China, India
- **Americas** (greens): USA, Brazil, Argentina, Mexico
- **Africa** (golds): Nigeria, Egypt, South Africa
- **Oceania** (purples): Australia, New Zealand, Fiji

New pieces spawn weighted toward countries already on the board, so same-country
merges stay reachable even with the bigger roster (every country still appears).

Level goes up every 8 clears/merges, and gravity speeds up with it.

## Study the world

Open **Study** from the start screen (or from pause / game over) to learn the
geography behind the tiles. Browse every continent, country, and city — each
3-letter code expanded to its real city name (`ROM` → Rome) — or flip on
**Quiz** mode: a shuffled grid of bare codes you click to reveal the city,
country, and continent. The roster is generated from the game's own dataset, so
it always matches what you're playing. Study never touches your game — close it
with **Back** or **Esc** and a paused game resumes exactly where you left it.

## Daily Challenge

Hit **Daily** on the start screen for a deterministic run that's the **same for
everyone** on a given calendar day — the identical sequence of piece types and
countries falls for every player, so the day's scores are comparable. The seed is
just today's local date (`YYYY-MM-DD`): no network, no account, nothing leaves the
page, and a new day is a new puzzle. The piece stream is board-independent (so
your moves can't change what you're dealt) but still favours recent countries so
merges stay reachable; the city labels are cosmetic and stay random. Your best for
the day is kept separately from the endless leaderboard and shown on the start
screen. Endless play stays the default — switch between the two from the start or
game-over screen.

## High scores

End an **endless** run and, if it cracks the **top 10**, you're asked for a name —
your score joins a local leaderboard that greets you on the start screen (and shows
again on game over, your fresh entry highlighted). Scores, levels, and names live
only in your own browser via `localStorage`: no account, no network, nothing leaves
the page. Clear your browser storage and the board of champions starts fresh.
(Daily Challenge runs keep their own separate best, so the two stay comparable.)

## Music

An original upbeat chiptune loop and subtle merge / continent / row cues, all
synthesised live with the Web Audio API — no audio files, no network. The music
thickens and nudges faster as you level up (capped), pauses with the game, and
starts only after your first input (browser autoplay rules). Toggle it with the
**M** key or the speaker button in the sidebar; the choice is saved locally.

## Controls

| Key | Action |
| --- | --- |
| ← / → | Move |
| ↑ or X | Rotate |
| ↓ | Soft drop |
| Space | Hard drop |
| C | Hold / swap piece |
| P | Pause |
| R | Restart |
| M | Mute music |
| Esc | Close Study |

On a phone or tablet, play by touch: **drag** left/right to move, **tap** to
rotate, and **swipe down** to drop (a long swipe or fast flick hard-drops). The
board scales to fit the screen, and desktop keyboard play is unchanged.

## Layout & accessibility

- The board scales to the window height (classic three-column layout: score, hold and controls on the left; next queue and continent legend on the right). Canvas buffers are resized to the on-screen size × `devicePixelRatio`, so tiles and city codes stay sharp at any size.
- On phones the layout collapses to one column with the board first, then score, hold and next side by side.
- Text colours meet WCAG AA contrast against the panels; labels and controls use larger type.
- The ghost piece is drawn as a dashed outline in the falling piece's own colour, so the landing spot is easy to see.
- CSS animations respect the OS "reduce motion" setting.

## Running locally

No build step, no dependencies, no network. Just open `index.html` in a browser
(or serve the folder with any static server).

## Tech

Vanilla HTML, CSS, and JavaScript rendered to a single `<canvas>`. No frameworks,
no external fonts, no runtime network requests.

---

Built autonomously by [Aeon](https://aeon.fun).
