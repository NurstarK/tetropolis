"use strict";

/* =========================================================================
   Tetropolis — Study mode.
   A geography reference + self-quiz overlay. Learn the world before (or
   between) games: every country with its flag, continent, and city codes
   expanded to full city names.

   This overlay is purely informational — it NEVER reads or writes game state
   (board, score, level, paused, gameOver). It layers on top of whatever is on
   screen, so closing it returns the player to exactly where they were: a
   paused game stays paused with the board intact, the start screen stays the
   start screen. The roster it shows is generated from COUNTRIES / CONTINENTS
   in game.js — not a hand-copied list — so it tracks the live dataset.
   ========================================================================= */

// Full city names for each 3-letter code in the game dataset. The study view's
// ROSTER (which continents, countries, and cities exist) is generated from the
// COUNTRIES structure in game.js; this map only expands each code to its real
// city name. A code with no entry falls back to the code itself, so the view
// degrades gracefully — never breaks — if the dataset grows later.
const CITY_NAMES = {
  // Europe
  ROM: "Rome", MIL: "Milan", NAP: "Naples", TUR: "Turin",
  PAR: "Paris", LYO: "Lyon", MRS: "Marseille", NIC: "Nice",
  BER: "Berlin", MUN: "Munich", HAM: "Hamburg", CGN: "Cologne",
  MAD: "Madrid", BCN: "Barcelona", SEV: "Seville", VAL: "Valencia",
  LIS: "Lisbon", OPO: "Porto", FAO: "Faro", BRG: "Braga",
  ATH: "Athens", SKG: "Thessaloniki", HER: "Heraklion", PTR: "Patras",
  BRU: "Brussels", ANR: "Antwerp", GNT: "Ghent", LGG: "Liège",
  AMS: "Amsterdam", RTM: "Rotterdam", HAG: "The Hague", UTR: "Utrecht",
  LON: "London", MAN: "Manchester", EDI: "Edinburgh", BHX: "Birmingham",
  // Asia
  TYO: "Tokyo", OSA: "Osaka", KYO: "Kyoto", NGO: "Nagoya",
  SEL: "Seoul", BUS: "Busan", INC: "Incheon", DAE: "Daegu",
  BEI: "Beijing", SHA: "Shanghai", SHE: "Shenzhen", CHE: "Chengdu",
  DEL: "Delhi", BOM: "Mumbai", BLR: "Bengaluru", CCU: "Kolkata",
  BKK: "Bangkok", CNX: "Chiang Mai", HKT: "Phuket", PYX: "Pattaya",
  HAN: "Hanoi", SGN: "Ho Chi Minh City", DAD: "Da Nang", HPH: "Haiphong",
  MOW: "Moscow", LED: "Saint Petersburg", OVB: "Novosibirsk", SVX: "Yekaterinburg",
  // North & Central America
  NYC: "New York", LAX: "Los Angeles", CHI: "Chicago", MIA: "Miami",
  TOR: "Toronto", MTL: "Montreal", VAN: "Vancouver", OTT: "Ottawa",
  MEX: "Mexico City", GDL: "Guadalajara", MTY: "Monterrey", CUN: "Cancún",
  GUA: "Guatemala City", QZT: "Quetzaltenango", ANT: "Antigua Guatemala", ESC: "Escuintla",
  SAL: "San Salvador", SMG: "San Miguel", SNA: "Santa Ana", SOY: "Soyapango",
  TGU: "Tegucigalpa", SAP: "San Pedro Sula", LCE: "La Ceiba", CHO: "Choloma",
  MGA: "Managua", LEO: "León", GRN: "Granada", MAS: "Masaya",
  SJO: "San José", ALA: "Alajuela", CRT: "Cartago", LIR: "Liberia",
  PTY: "Panama City", COL: "Colón", DAV: "David", LCH: "La Chorrera",
  // South America
  SAO: "São Paulo", RIO: "Rio de Janeiro", BSB: "Brasília", SSA: "Salvador",
  BUE: "Buenos Aires", COR: "Córdoba", ROS: "Rosario", MDZ: "Mendoza",
  BOG: "Bogotá", MDE: "Medellín", CLO: "Cali", BAQ: "Barranquilla",
  LIM: "Lima", AQP: "Arequipa", CUZ: "Cusco", TRU: "Trujillo",
  SCL: "Santiago", VAP: "Valparaíso", CCP: "Concepción", ANF: "Antofagasta",
  CCS: "Caracas", MAR: "Maracaibo", VLN: "Valencia", BRM: "Barquisimeto",
  UIO: "Quito", GYE: "Guayaquil", CUE: "Cuenca", MEC: "Manta",
  LPB: "La Paz", SRZ: "Santa Cruz de la Sierra", CBB: "Cochabamba", SRE: "Sucre",
  ASU: "Asunción", CDE: "Ciudad del Este", ENC: "Encarnación", LUQ: "Luque",
  MVD: "Montevideo", PDP: "Punta del Este", STY: "Salto", PDU: "Paysandú",
  GEO: "Georgetown", LIN: "Linden", NAM: "New Amsterdam", BAR: "Bartica",
  PBM: "Paramaribo", LEL: "Lelydorp", NNK: "Nieuw Nickerie", MOE: "Moengo",
  // Africa
  LAG: "Lagos", ABJ: "Abuja", KAN: "Kano", IBA: "Ibadan",
  CAI: "Cairo", ALX: "Alexandria", GIZ: "Giza", LXR: "Luxor",
  JNB: "Johannesburg", CPT: "Cape Town", DUR: "Durban", PRY: "Pretoria",
  // Oceania
  SYD: "Sydney", MEL: "Melbourne", BNE: "Brisbane", PER: "Perth",
  AKL: "Auckland", WLG: "Wellington", CHC: "Christchurch", HLZ: "Hamilton",
  SUV: "Suva", NAN: "Nadi", LBS: "Labasa", SVU: "Savusavu",
};

window.Study = (function () {
  const root = document.getElementById("study");
  const bodyEl = document.getElementById("study-body");
  const hintEl = document.getElementById("study-hint");
  const quizBtn = document.getElementById("study-quiz-btn");
  const backBtn = document.getElementById("study-back");

  let quiz = false;

  const BROWSE_HINT =
    "Every country and city in the game. Each 3-letter code is the real city it stands for.";
  const QUIZ_HINT =
    "Self-quiz: can you name the city? Click a code to reveal its city, country, and continent.";

  function cityName(code) {
    return CITY_NAMES[code] || code;
  }

  // Build the full {code, name, country, flag, continent} list straight from
  // the live COUNTRIES structure — the single source of truth.
  function allCities() {
    const list = [];
    for (const key of COUNTRY_KEYS) {
      const co = COUNTRIES[key];
      const continent = CONTINENTS[co.continent] ? CONTINENTS[co.continent].name : co.continent;
      for (const code of co.cities) {
        list.push({ code, name: cityName(code), country: co.name, flag: co.flag, continent });
      }
    }
    return list;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* --------------------------- Browse view --------------------------- */
  // Grouped by continent -> country -> cities, in the game's own ordering.
  function renderBrowse() {
    bodyEl.className = "study-body browse";
    clear(bodyEl);

    for (const contKey of Object.keys(CONTINENTS)) {
      const cont = CONTINENTS[contKey];
      const countryKeys = COUNTRY_KEYS.filter((k) => COUNTRIES[k].continent === contKey);
      if (!countryKeys.length) continue;

      const section = document.createElement("section");
      section.className = "study-cont";

      const head = document.createElement("div");
      head.className = "study-cont-head";
      const sw = document.createElement("span");
      sw.className = "study-swatch";
      sw.style.background = cont.swatch;
      sw.style.color = cont.swatch; // drives the hue-matched glow
      const name = document.createElement("span");
      name.textContent = cont.name;
      head.appendChild(sw);
      head.appendChild(name);
      section.appendChild(head);

      for (const key of countryKeys) {
        const co = COUNTRIES[key];
        const card = document.createElement("div");
        card.className = "study-country";
        card.style.setProperty("--co-color", co.color);

        const title = document.createElement("div");
        title.className = "study-country-head";
        const flag = document.createElement("span");
        flag.className = "study-flag";
        flag.textContent = co.flag;
        const cn = document.createElement("span");
        cn.className = "study-country-name";
        cn.textContent = co.name;
        title.appendChild(flag);
        title.appendChild(cn);
        card.appendChild(title);

        const cities = document.createElement("div");
        cities.className = "study-cities";
        for (const code of co.cities) {
          const chip = document.createElement("span");
          chip.className = "study-city";
          const codeEl = document.createElement("b");
          codeEl.textContent = code;
          const nameEl = document.createElement("span");
          nameEl.textContent = cityName(code);
          chip.appendChild(codeEl);
          chip.appendChild(nameEl);
          cities.appendChild(chip);
        }
        card.appendChild(cities);
        section.appendChild(card);
      }

      bodyEl.appendChild(section);
    }
  }

  /* ---------------------------- Quiz view ---------------------------- */
  // A shuffled grid of bare city codes; click one to flip it and reveal the
  // answer. Re-shuffles each time quiz mode is (re)entered.
  function renderQuiz() {
    bodyEl.className = "study-body quiz";
    clear(bodyEl);

    const grid = document.createElement("div");
    grid.className = "study-quiz-grid";

    for (const c of shuffle(allCities())) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "study-card";
      btn.setAttribute("aria-pressed", "false");

      const front = document.createElement("span");
      front.className = "card-code";
      front.textContent = c.code;

      const back = document.createElement("span");
      back.className = "card-answer";
      const city = document.createElement("b");
      city.textContent = c.name;
      const where = document.createElement("small");
      where.textContent = `${c.flag} ${c.country} · ${c.continent}`;
      back.appendChild(city);
      back.appendChild(where);

      btn.appendChild(front);
      btn.appendChild(back);
      btn.addEventListener("click", () => {
        const revealed = btn.classList.toggle("revealed");
        btn.setAttribute("aria-pressed", revealed ? "true" : "false");
      });
      grid.appendChild(btn);
    }

    bodyEl.appendChild(grid);
  }

  function render() {
    if (quiz) {
      hintEl.textContent = QUIZ_HINT;
      renderQuiz();
    } else {
      hintEl.textContent = BROWSE_HINT;
      renderBrowse();
    }
  }

  /* ------------------------------ API -------------------------------- */
  function open() {
    render();
    root.classList.remove("hidden");
    backBtn.focus();
  }

  function close() {
    root.classList.add("hidden");
  }

  function isOpen() {
    return !root.classList.contains("hidden");
  }

  function toggleQuiz() {
    quiz = !quiz;
    quizBtn.textContent = quiz ? "Quiz: on" : "Quiz: off";
    quizBtn.setAttribute("aria-pressed", quiz ? "true" : "false");
    render();
  }

  /* ----------------------------- Wiring ------------------------------ */
  if (backBtn) backBtn.addEventListener("click", close);
  if (quizBtn) quizBtn.addEventListener("click", toggleQuiz);
  // "Study" buttons on the start / pause / game-over overlay open this view.
  for (const openBtn of document.querySelectorAll(".open-study")) {
    openBtn.addEventListener("click", open);
  }

  return { open, close, isOpen };
})();
