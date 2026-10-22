"use strict";

/* =========================================================================
   Tetropolis — Local high scores.
   A persistent top-10 score table kept in localStorage. No network: the whole
   table lives in the player's own browser. Scores are shown on the start screen
   and the game-over screen, and the player names a run that cracks the top 10.

   This module owns nothing but the score list — it never reads or writes board
   state, score, level, or pause. game.js calls into it at game over (to record
   a run) and when it paints the start / game-over overlay (to show the table).
   localStorage access is wrapped in try/catch so the game still runs from a
   file:// URL or a browser that blocks storage — it just won't persist.
   ========================================================================= */

window.Scores = (function () {
  const STORAGE_KEY = "tetropolis.highscores";
  const MAX = 10;              // keep only the best this many runs
  const NAME_MAX = 12;         // max characters kept for a player's name

  // Read the table from storage. Always returns a clean, descending-sorted
  // array capped at MAX, tolerating missing/corrupt/old data.
  function load() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return []; }
    if (!raw) return [];
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return []; }
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.score === "number" && isFinite(e.score))
      .map((e) => ({
        name: sanitizeName(e.name),
        score: Math.max(0, Math.floor(e.score)),
        level: Math.max(1, Math.floor(e.level || 1)),
        lines: Math.max(0, Math.floor(e.lines || 0)),
        date: typeof e.date === "string" ? e.date : "",
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX);
  }

  function save(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* storage may be blocked */ }
  }

  // Trim to printable characters and clamp the length; blank falls back later.
  function sanitizeName(name) {
    return String(name == null ? "" : name).replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  }

  // Would a run of this score make the table? Zero never qualifies.
  function qualifies(score) {
    if (!(score > 0)) return false;
    const list = load();
    if (list.length < MAX) return true;
    return score > list[list.length - 1].score;
  }

  // Record a run. Returns its 0-based rank in the saved table, or -1 if the
  // score didn't make the cut after all (e.g. a tie that fell off the end).
  function add(entry) {
    const run = {
      name: sanitizeName(entry.name) || "YOU",
      score: Math.max(0, Math.floor(entry.score || 0)),
      level: Math.max(1, Math.floor(entry.level || 1)),
      lines: Math.max(0, Math.floor(entry.lines || 0)),
      date: new Date().toISOString().slice(0, 10),
    };
    const list = load();
    list.push(run);
    // Stable within a tie: earlier (existing) entries keep the higher rank, so
    // a new run ties below the scores it matched.
    list.sort((a, b) => b.score - a.score);
    const trimmed = list.slice(0, MAX);
    save(trimmed);
    return trimmed.indexOf(run);
  }

  function hasAny() {
    return load().length > 0;
  }

  // Paint the table into a container element. `highlightRank` (0-based) marks
  // the row for a just-saved run; pass -1/undefined for none. Rebuilds the
  // container's contents each call.
  function renderInto(container, highlightRank) {
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    const list = load();

    const title = document.createElement("div");
    title.className = "scores-title";
    title.textContent = "High Scores";
    container.appendChild(title);

    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "scores-empty";
      empty.textContent = "No scores yet — be the first.";
      container.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    const tbody = document.createElement("tbody");
    list.forEach((e, i) => {
      const tr = document.createElement("tr");
      if (i === highlightRank) tr.className = "you";

      const rank = document.createElement("td");
      rank.className = "rank";
      rank.textContent = String(i + 1);

      const name = document.createElement("td");
      name.className = "name";
      name.textContent = e.name;

      const lvl = document.createElement("td");
      lvl.className = "lvl";
      lvl.textContent = "L" + e.level;

      const score = document.createElement("td");
      score.className = "score";
      score.textContent = e.score.toLocaleString();

      tr.appendChild(rank);
      tr.appendChild(name);
      tr.appendChild(lvl);
      tr.appendChild(score);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  return { load, qualifies, add, hasAny, renderInto, NAME_MAX };
})();
