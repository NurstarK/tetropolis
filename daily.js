"use strict";

/* =========================================================================
   Tetropolis — Daily Challenge.
   A date-seeded, deterministic run: everyone who plays on the same calendar
   day faces the exact same stream of piece TYPES and COUNTRIES, so scores are
   directly comparable. The seed is just today's local date string
   (YYYY-MM-DD) — no network, no account, nothing leaves the page.

   This module owns only two things: the day's pseudo-random generator and the
   day's best-score record (kept under its own localStorage key, separate from
   the endless high-score table in scores.js). It NEVER reads or writes board
   or game state. game.js pulls floats from it to choose a piece's type and
   country while a daily challenge is running, and records the final score here
   on a daily game over.

   City codes are NOT drawn from this stream — they are cosmetic (a code never
   affects a merge, a continent clear, or scoring) and stay on Math.random, so
   holding/swapping a piece (which re-labels its cells) can never knock the
   shared type/country stream out of sync between two players.
   ========================================================================= */

window.Daily = (function () {
  const STORAGE_KEY = "tetropolis.daily";

  // Local calendar date as YYYY-MM-DD — both the human-readable seed label and
  // the day the stored best belongs to.
  function todayKey() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // xmur3-style string hash -> a 32-bit integer seed for the PRNG.
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return (h ^ (h >>> 16)) >>> 0;
  }

  // mulberry32 — a tiny, well-distributed seeded PRNG. The same seed always
  // yields the same sequence of floats on every device and browser.
  function makePrng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let prng = makePrng(hashSeed(todayKey()));

  // Re-seed from today's date. Called whenever a daily challenge (re)starts so
  // every attempt — by anyone, any number of times — begins from the same point.
  function reset() {
    prng = makePrng(hashSeed(todayKey()));
  }

  // Next float in [0, 1) from the day's stream.
  function rand() {
    return prng();
  }

  // Read the stored record, tolerating missing / corrupt / legacy data.
  function read() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return { date: "", best: 0 }; }
    if (!raw) return { date: "", best: 0 };
    let o;
    try { o = JSON.parse(raw); } catch (e) { return { date: "", best: 0 }; }
    if (!o || typeof o !== "object") return { date: "", best: 0 };
    const best = typeof o.best === "number" && isFinite(o.best) ? Math.max(0, Math.floor(o.best)) : 0;
    return { date: typeof o.date === "string" ? o.date : "", best };
  }

  // Today's best score — 0 if nobody has set one today. A best from an earlier
  // day does NOT carry over: each calendar day starts fresh.
  function best() {
    const rec = read();
    return rec.date === todayKey() ? rec.best : 0;
  }

  // Record a finished daily run. Returns { best, isNew }: the day's best after
  // this run, and whether this run set a new best for today.
  function record(score) {
    const s = Math.max(0, Math.floor(score || 0));
    const today = todayKey();
    const current = best();        // already day-aware (resets to 0 on a new day)
    if (s > current) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, best: s })); } catch (e) { /* storage may be blocked */ }
      return { best: s, isNew: true };
    }
    // Otherwise make sure the record is pinned to today so a prior day's entry
    // (which best() already ignores) gets superseded in storage.
    if (read().date !== today) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, best: current })); } catch (e) { /* ignore */ }
    }
    return { best: current, isNew: false };
  }

  return { todayKey, reset, rand, best, record };
})();
