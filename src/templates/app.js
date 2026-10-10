/* Two capitals, one chamber. Front end for the published working paper.
   Every figure is drawn as inline SVG from the payload in data.json. */

const S = {
  power: "US",
  subject: "all",
  measure: 0,
  gapSample: "imp",
  term: 0,
  bloc: "arab",
  chamberYear: 2019,
  playing: false,
  splitEra: 1990,
  splitQuery: "",
  splitHit: null,
  saharaTier: "named",
  saharaQuery: "",
  saharaSort: { key: "year", dir: 1 },
  picked: []
};

const POWERS = ["US", "FR", "CN", "RU", "ES", "GB"];
const SUBJECTS = ["all", "important", "me", "co", "hr", "di", "nu", "ec"];
const BALLOT = { 1: "Yes", 2: "Abst.", 3: "No" };

let D = null;
let C = {};
let chamberYears = [];
let timer = null;
let markIndex = {};

const $ = function (selector) { return document.querySelector(selector); };
const esc = function (text) {
  return String(text).replace(/[&<>]/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch];
  });
};

function colours() {
  const style = getComputedStyle(document.documentElement);
  const read = function (name) { return style.getPropertyValue(name).trim(); };
  return {
    ma: read("--ma"),
    dz: read("--dz"),
    ink: read("--ink"),
    mute: read("--mute"),
    steel: read("--steel"),
    line: read("--line"),
    grid: read("--grid"),
    ochre: read("--ochre"),
    navy: read("--navy"),
    dot: read("--dot"),
    bar: read("--bar"),
    sheet: read("--sheet")
  };
}

function el(tag, attrs, kids) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  if (attrs) {
    for (const key in attrs) { node.setAttribute(key, attrs[key]); }
  }
  const children = [].concat(kids === undefined ? [] : kids);
  for (const child of children) {
    node.appendChild(child && child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function fadeIn(node) {
  node.style.opacity = "0";
  requestAnimationFrame(function () { node.style.opacity = "1"; });
}

function canvas(width, height) {
  return el("svg", { viewBox: "0 0 " + width + " " + height, preserveAspectRatio: "xMidYMid meet" });
}

function linePath(points, xScale, yScale) {
  let path = "";
  let pen = false;
  for (const point of points) {
    if (point[1] === null || point[1] === undefined) { pen = false; continue; }
    path = path + (pen ? "L" : "M") + xScale(point[0]).toFixed(1) + " " + yScale(point[1]).toFixed(1) + " ";
    pen = true;
  }
  return path;
}

function lineChart(node, series, opt) {
  const width = 700;
  const height = opt.height || 300;
  const chart = canvas(width, height);
  const group = el("g");
  chart.appendChild(group);
  const xScale = function (value) { return 44 + (value - opt.x0) / (opt.x1 - opt.x0) * (width - 50); };
  const yScale = function (value) { return 14 + (opt.y1 - value) / (opt.y1 - opt.y0) * (height - 40); };

  group.appendChild(el("line", { x1: 44, x2: width - 6, y1: height - 22, y2: height - 22, stroke: C.line }));
  for (const value of opt.xTicks) {
    group.appendChild(el("line", { x1: xScale(value), x2: xScale(value), y1: height - 22, y2: height - 18, stroke: C.line }));
    group.appendChild(el("text", { x: xScale(value), y: height - 6, class: "tick", "text-anchor": "middle" }, String(value)));
  }
  for (const value of opt.yTicks) {
    group.appendChild(el("line", { x1: 44, x2: width - 6, y1: yScale(value), y2: yScale(value), stroke: C.grid }));
    group.appendChild(el("text", { x: 38, y: yScale(value) + 3.5, class: "tick", "text-anchor": "end" }, opt.yFormat(value)));
  }
  if (opt.shade) {
    group.appendChild(el("rect", {
      x: xScale(opt.shade[0]), y: 14, width: xScale(opt.shade[1]) - xScale(opt.shade[0]),
      height: height - 36, fill: C.steel, "fill-opacity": 0.12
    }));
  }
  if (opt.band) {
    let path = "";
    const kept = [];
    for (const point of opt.band) {
      if (point[1] === null) { continue; }
      path = path + (path ? "L" : "M") + xScale(point[0]).toFixed(1) + " " + yScale(point[1]).toFixed(1) + " ";
      kept.push(point);
    }
    for (let index = kept.length - 1; index >= 0; index -= 1) {
      path = path + "L" + xScale(kept[index][0]).toFixed(1) + " " + yScale(kept[index][2]).toFixed(1) + " ";
    }
    group.appendChild(el("path", { d: path + "Z", fill: C.steel, "fill-opacity": 0.3, stroke: "none" }));
  }
  if (opt.zero !== undefined) {
    group.appendChild(el("line", { x1: 44, x2: width - 6, y1: yScale(opt.zero), y2: yScale(opt.zero), stroke: C.ink, "stroke-dasharray": "3 3" }));
  }
  for (const item of series) {
    group.appendChild(el("path", {
      d: linePath(item.points, xScale, yScale), fill: "none", stroke: item.colour,
      "stroke-width": item.width || 2, "stroke-dasharray": item.dash || "none", "stroke-linejoin": "round"
    }));
  }

  const rule = el("line", { x1: 0, x2: 0, y1: 14, y2: height - 22, stroke: C.ink, "stroke-width": 0.7, opacity: 0 });
  group.appendChild(rule);
  const dots = [];
  for (const item of series) {
    const dot = el("circle", { r: 3.4, fill: item.colour, opacity: 0 });
    group.appendChild(dot);
    dots.push(dot);
  }
  const box = document.createElement("div");
  box.className = "hoverbox";
  box.style.display = "none";
  fadeIn(chart);
  node.replaceChildren(chart, box);

  const stops = series[0].points.map(function (point) { return point[0]; });
  const format = opt.hover || function (value) { return value.toFixed(2); };
  const move = function (event) {
    const rect = chart.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const pixel = clientX - rect.left;
    const target = opt.x0 + (pixel / rect.width * width - 44) / (width - 50) * (opt.x1 - opt.x0);
    let best = stops[0];
    for (const stop of stops) {
      if (Math.abs(stop - target) < Math.abs(best - target)) { best = stop; }
    }
    const rows = [];
    series.forEach(function (item, index) {
      let value = null;
      for (const point of item.points) {
        if (point[0] === best) { value = point[1]; }
      }
      dots[index].setAttribute("opacity", value === null || value === undefined ? 0 : 1);
      if (value !== null && value !== undefined) {
        dots[index].setAttribute("cx", xScale(best));
        dots[index].setAttribute("cy", yScale(value));
        rows.push('<span style="color:' + item.colour + '">' + item.name + "</span> " + format(value));
      }
    });
    rule.setAttribute("opacity", 0.35);
    rule.setAttribute("x1", xScale(best));
    rule.setAttribute("x2", xScale(best));
    box.innerHTML = "<b>" + best + "</b><br>" + rows.join("<br>");
    box.style.display = rows.length ? "block" : "none";
    box.style.left = (xScale(best) / width * 100) + "%";
    box.style.top = (28 / height * rect.height) + "px";
  };
  const leave = function () {
    rule.setAttribute("opacity", 0);
    for (const dot of dots) { dot.setAttribute("opacity", 0); }
    box.style.display = "none";
  };
  chart.addEventListener("mousemove", move);
  chart.addEventListener("touchmove", move, { passive: true });
  chart.addEventListener("mouseleave", leave);
  chart.addEventListener("touchend", leave);
}

function keyRow(node, items) {
  node.replaceChildren();
  for (const item of items) {
    const span = document.createElement("span");
    const swatch = document.createElement("i");
    swatch.style.background = item.colour;
    span.appendChild(swatch);
    span.appendChild(document.createTextNode(item.name));
    node.appendChild(span);
  }
}

function chips(node, options, current, handler) {
  node.replaceChildren();
  for (const option of options) {
    const button = document.createElement("button");
    button.className = "chip";
    button.textContent = option[1];
    button.setAttribute("aria-pressed", String(option[0] === current));
    button.addEventListener("click", function () { handler(option[0]); });
    node.appendChild(button);
  }
}

/* ---------- prose ---------- */

function seriesValue(subject, pair, year) {
  const record = D.series[subject][pair][String(year)];
  if (!record) { return null; }
  return record[S.measure];
}

function pooled(subject, pair, firstYear, lastYear, measure) {
  let total = 0;
  let count = 0;
  const record = D.series[subject][pair];
  for (const year in record) {
    if (Number(year) < firstYear || Number(year) > lastYear) { continue; }
    total += record[year][measure === undefined ? 0 : measure] * record[year][2];
    count += record[year][2];
  }
  return count ? total / count : null;
}

function blocRate(key, firstYear, lastYear) {
  let departures = 0;
  let total = 0;
  for (const year in D.blocs[key]) {
    if (Number(year) < firstYear || Number(year) > lastYear) { continue; }
    departures += D.blocs[key][year][0];
    total += D.blocs[key][year][1];
  }
  return total ? 100 * departures / total : null;
}

function speechTotals() {
  const words = { MA: 0, DZ: 0 };
  const counts = { MA: D.speech.terms.map(function () { return 0; }), DZ: D.speech.terms.map(function () { return 0; }) };
  for (const row of D.speech.kw) {
    words[row.c] += row.w;
    row.n.forEach(function (value, index) { counts[row.c][index] += value; });
  }
  return D.speech.terms.map(function (term, index) {
    return {
      term: term,
      ma: 10000 * counts.MA[index] / words.MA,
      dz: 10000 * counts.DZ[index] / words.DZ,
      maCount: counts.MA[index],
      dzCount: counts.DZ[index]
    };
  });
}

function writeProse() {
  const coverage = D.coverage;
  const gaps = D.gaps;
  const eras = D.eras;
  const last = coverage.maxYear;
  const together = pooled("all", "MA-DZ", 2000, last, 0);
  const totals = speechTotals();

  $("#abstract").textContent =
    "Morocco and Algeria have no embassies in each other's capitals and no open land border since 1994, and they cast the same ballot on " +
    together.toFixed(1) + " percent of roll calls since 2000. Three measures separate them anyway. On the votes the Department of State designates as important, Morocco agrees with Washington " +
    gaps.US_imp.gap.toFixed(1) + " points more often than Algeria (95 percent interval " + gaps.US_imp.lo.toFixed(1) + " to " + gaps.US_imp.hi.toFixed(1) + ", " + gaps.US_imp.n +
    " votes), while Algeria agrees with Beijing " + Math.abs(gaps.CN_imp.gap).toFixed(1) +
    " points more often than Morocco. On the first dimension of the yearly vote matrix the distance between them ran at " + eras[0].diff.toFixed(2) + " in " + eras[0].era +
    ", closed to " + eras[2].diff.toFixed(2) + " in " + eras[2].era + ", an interval that contains zero, and reopened to " + eras[3].diff.toFixed(2) + " in " + eras[3].era +
    ". Across " + coverage.rollcalls.toLocaleString() + " shared roll calls the two voted yes against no " + coverage.splitCount +
    " times, and their General Debate speeches diverge where the ballots do not.";

  const stats = [
    [together.toFixed(1) + "%", "Shared ballots since 2000, across " + coverage.rollcalls.toLocaleString() + " roll calls"],
    [String(coverage.splitCount), "Roll calls of open opposition, one yes against one no"],
    ["+" + gaps.US_imp.gap.toFixed(1), "Moroccan lead toward Washington on important votes, in points"],
    [String(D.speech.coverage.speeches.toLocaleString()), "General Debate addresses read for the rhetoric layer"]
  ];
  const lede = $("#lede");
  lede.replaceChildren();
  for (const stat of stats) {
    const block = document.createElement("div");
    block.className = "stat";
    const value = document.createElement("b");
    value.textContent = stat[0];
    const label = document.createElement("span");
    label.textContent = stat[1];
    block.appendChild(value);
    block.appendChild(label);
    lede.appendChild(block);
  }

  $("#p-diverge").textContent =
    "Agreement scores put the same result in the units the diplomatic literature uses. On the full agenda since 2000 the difference toward Washington is " +
    gaps.US_all.gap.toFixed(1) + " points, small but clear of zero (" + gaps.US_all.lo.toFixed(1) + " to " + gaps.US_all.hi.toFixed(1) + ", " +
    gaps.US_all.n.toLocaleString() + " votes). Restrict the sample to the roll calls Washington designates as important and the difference more than triples, and the sign turns over toward Beijing and Moscow, where Algeria is the closer partner.";

  $("#p-caucus").textContent =
    "Alignment with a great power is one thing, discipline inside one's own group another. Since 2000 Morocco broke with the Arab caucus on " +
    blocRate("arab_MA", 2000, last).toFixed(1) + " percent of qualifying votes and Algeria on " + blocRate("arab_DZ", 2000, last).toFixed(1) +
    " percent. Against the African group the rates are " + blocRate("africa_MA", 2000, last).toFixed(1) + " and " + blocRate("africa_DZ", 2000, last).toFixed(1) +
    " percent. Algiers, which built its diplomacy on third worldist solidarity, is the more frequent defector from both.";

  $("#p-sahara").textContent =
    "The Assembly recorded " + coverage.saharaCount + " roll calls whose text names the Sahara, Ifni, Rio de Oro or Saguia el Hamra, from the series that opened in 1965 to the last plenary vote in 2006. Morocco has no recorded ballot on three resolutions of the late 1980s, a silence Morse and Coggins (2024) treat as position taking rather than as capacity failure. After the 1991 ceasefire the file moved to the Security Council, which is why the named series stops (Zoubir, 2000). The Declaration tier below holds the " +
    coverage.proxyCount + " recorded votes since 1991 on the resolution that now carries the territory.";

  $("#p-minurso").textContent =
    "The General Assembly file contains no roll call naming MINURSO. The mission was created by the Security Council in 1991 and its mandate is renewed there, while the Fifth Committee funds it without a recorded vote, so the Assembly record is silent by construction. The renewal votes are the live measure of great power position on the territory, and they stopped being unanimous. The 2016 renewal drew two votes against, the only one of these " +
    D.minurso.length + " to do so, and every renewal since 2018 has carried two or three abstentions.";

  const recent = D.splits.filter(function (row) { return row.year >= 1990; }).length;
  $("#p-splits").textContent =
    "The hardest disagreement the Assembly records is one yes against one no. It happened " + coverage.splitCount + " times, " + recent +
    " of them since 1990. The recent cases are not scattered across the agenda: they are the annual resolution on the Declaration on the Granting of Independence to Colonial Countries and Peoples, which carries the Sahara question under its plenary name, and the Syria human rights texts.";

  const middleEast = pooled("me", "MA-DZ", 2000, last, 0);
  $("#p-speech").textContent =
    "Votes are one record of a state's position, speech is another. The General Debate corpus holds " + D.speech.coverage.speeches.toLocaleString() +
    " addresses from " + D.speech.coverage.minYear + " to " + D.speech.coverage.maxYear + ", including " + D.speech.coverage.ma + " Moroccan and " +
    D.speech.coverage.dz + " Algerian statements (Mikhaylov et al., 2017; Baturo et al., 2017). The two capitals use opposite vocabularies for the same file. Morocco says territorial integrity " +
    totals[2].ma.toFixed(1) + " times per 10,000 words against Algeria's " + totals[2].dz.toFixed(1) + ", while Algeria says self determination " +
    totals[1].dz.toFixed(1) + " times against Morocco's " + totals[1].ma.toFixed(1) + ". On Palestine the rates are almost identical, " +
    totals[6].ma.toFixed(1) + " and " + totals[6].dz.toFixed(1) + ", which is the rhetorical counterpart of the " + middleEast.toFixed(1) +
    " percent agreement on Middle East roll calls.";

  $("#p-method").textContent =
    "The window runs from Algeria's admission to the United Nations in 1962 to the most recent vote each source carries, and the three layers end in different years. The ballots are the roll call file of Voeten, Strezhnev and Bailey (2009) in the packaging maintained by Robinson (n.d.), which holds " +
    coverage.rollcalls.toLocaleString() + " shared roll calls from 1962 through the " + coverage.maxSession + "th session and stops in " + coverage.maxYear +
    "; sessions 75 to 79 sit in the Dataverse release, which this build does not reach. The speeches run to " + D.speech.coverage.maxYear +
    " and the Security Council renewals to 2025, so anything said about the years after " + coverage.maxYear + " rests on the speech and Council layers alone. Fjelstul et al. (2025) show what any roll call file omits, including failed votes and the 15,302 decisions adopted without a recorded vote.";

  $("#cite").textContent = citation();
}

function citation() {
  return "Mouhajir, S. (2026). Two capitals, one chamber: Moroccan and Algerian positions in the United Nations, 1962-2025 [Interactive working paper]. Ballots from Voeten, E., Strezhnev, A., & Bailey, M. (2009), United Nations General Assembly voting data (Version 34) [Data set], Harvard Dataverse, https://doi.org/10.7910/DVN/LEJUQZ; agreement index after Bailey, M. A., Strezhnev, A., & Voeten, E. (2017), Journal of Conflict Resolution, 61(2), 430-456.";
}

/* ---------- figures ---------- */

function drawCoverage() {
  const width = 700;
  const height = 96;
  const first = 1962;
  const last = 2026;
  const xScale = function (year) { return 150 + (year - first) / (last - first) * (width - 160); };
  const chart = canvas(width, height);
  for (const year of [1962, 1980, 2000, 2020]) {
    chart.appendChild(el("line", { x1: xScale(year), x2: xScale(year), y1: 6, y2: 78, stroke: C.line }));
    chart.appendChild(el("text", { x: xScale(year), y: 92, class: "tick", "text-anchor": "middle" }, String(year)));
  }
  const rows = [
    ["Roll calls", D.coverage.minYear, D.coverage.maxYear, C.ink, D.coverage.rollcalls.toLocaleString() + " votes"],
    ["General Debate", D.speech.coverage.minYear, D.speech.coverage.maxYear, C.ma, D.speech.coverage.speeches.toLocaleString() + " addresses"],
    ["MINURSO renewals", 2016, 2025, C.dz, D.minurso.length + " Council votes"]
  ];
  rows.forEach(function (row, index) {
    const group = el("g", { transform: "translate(0 " + (16 + index * 22) + ")" });
    group.appendChild(el("text", { x: 0, y: 4, class: "lab", fill: C.mute }, row[0]));
    group.appendChild(el("rect", { x: xScale(row[1]), y: -4, width: Math.max(2, xScale(row[2]) - xScale(row[1])), height: 8, fill: row[3], opacity: 0.85 }));
    group.appendChild(el("text", { x: xScale(row[2]) + 6, y: 4, class: "tick" }, row[1] + "–" + row[2] + ", " + row[4]));
    chart.appendChild(group);
  });
  $("#coverage").replaceChildren(chart);
}

function stateSeries(code) {
  return D.scaling.map(function (row) {
    const record = D.chamber[String(row.year)];
    if (!record) { return [row.year, null]; }
    const index = record.c.indexOf(code);
    return [row.year, index < 0 ? null : record.s[index]];
  });
}

function drawPositions() {
  const extra = [C.navy, "#8a5a1e", "#5c4b8a", "#2c6e49"];
  const series = [
    { points: D.scaling.map(function (row) { return [row.year, row.US]; }), colour: C.steel, width: 1.2, name: "United States" },
    { points: D.scaling.map(function (row) { return [row.year, row.MA]; }), colour: C.ma, width: 2.2, name: "Morocco" },
    { points: D.scaling.map(function (row) { return [row.year, row.DZ]; }), colour: C.dz, width: 2.2, name: "Algeria" }
  ];
  S.picked.forEach(function (code, index) {
    series.push({ points: stateSeries(code), colour: extra[index % extra.length], width: 1.6, name: D.names[code] || code });
  });
  lineChart($("#fig1"), series, {
    x0: 1962, x1: D.coverage.maxYear, y0: -2.6, y1: 3.3,
    xTicks: [1970, 1980, 1990, 2000, 2010, 2020], yTicks: [-2, -1, 0, 1, 2, 3],
    height: 300, yFormat: function (value) { return value.toFixed(0); },
    hover: function (value) { return value.toFixed(2); }
  });
  const key = [{ colour: C.ma, name: "Morocco" }, { colour: C.dz, name: "Algeria" }, { colour: C.steel, name: "United States" }];
  S.picked.forEach(function (code, index) { key.push({ colour: extra[index % extra.length], name: D.names[code] || code }); });
  keyRow($("#key1"), key);

  const picked = $("#picked");
  picked.replaceChildren();
  S.picked.forEach(function (code, index) {
    const pill = document.createElement("span");
    pill.className = "pill";
    const swatch = document.createElement("i");
    swatch.style.cssText = "width:10px;height:2px;display:inline-block;background:" + extra[index % extra.length];
    pill.appendChild(swatch);
    pill.appendChild(document.createTextNode(D.names[code] || code));
    const close = document.createElement("button");
    close.textContent = "×";
    close.title = "Remove";
    close.addEventListener("click", function () {
      S.picked = S.picked.filter(function (item) { return item !== code; });
      drawPositions();
    });
    pill.appendChild(close);
    picked.appendChild(pill);
  });
}

function drawDistance() {
  const points = D.scaling.map(function (row) { return [row.year, row.diff === undefined ? null : row.diff]; });
  const band = D.scaling.filter(function (row) { return row.diff_lo !== undefined; })
    .map(function (row) { return [row.year, row.diff_lo, row.diff_hi]; });
  lineChart($("#fig2"), [{ points: points, colour: C.ink, width: 1.8, name: "Distance" }], {
    x0: 1962, x1: D.coverage.maxYear, y0: -1.2, y1: 2.4,
    xTicks: [1970, 1980, 1990, 2000, 2010, 2020], yTicks: [-1, 0, 1, 2],
    height: 250, zero: 0, shade: [1992, 2005], band: band,
    yFormat: function (value) { return value.toFixed(0); },
    hover: function (value) { return value.toFixed(2); }
  });
}

function drawPeriods() {
  let html = '<table><thead><tr><th>Period</th><th class="num">Morocco</th><th class="num">Algeria</th><th class="num">Distance</th><th class="num">95 percent interval</th><th class="num">Roll calls</th></tr></thead><tbody>';
  for (const row of D.eras) {
    html += "<tr><td>" + row.era + '</td><td class="num" style="color:' + C.ma + '">' + row.MA.toFixed(2) +
      '</td><td class="num" style="color:' + C.dz + '">' + row.DZ.toFixed(2) + '</td><td class="num">' + row.diff.toFixed(2) +
      '</td><td class="num">' + row.diff_lo.toFixed(2) + " to " + row.diff_hi.toFixed(2) + '</td><td class="num">' + row.k + "</td></tr>";
  }
  $("#tab1").innerHTML = html + "</tbody></table>";
}

const chamber = { svg: null, dots: {}, hits: {}, labels: {}, axis: null, readout: null, frame: null, state: {} };
const CHAMBER_WIDTH = 700;
const CHAMBER_HEIGHT = 250;
const CHAMBER_LOW = -2.6;
const CHAMBER_HIGH = 3.3;
const NAMED = ["MA", "DZ", "US", "FR", "RU", "CN"];

function reducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function chamberLayout(year) {
  const record = D.chamber[String(year)];
  const layout = {};
  if (!record) { return layout; }
  const lanes = {};
  const points = record.c.map(function (code, index) { return { code: code, score: record.s[index] }; });
  points.sort(function (first, second) { return Math.abs(second.score) - Math.abs(first.score); });
  for (const point of points) {
    const x = 24 + (point.score - CHAMBER_LOW) / (CHAMBER_HIGH - CHAMBER_LOW) * (CHAMBER_WIDTH - 48);
    const column = Math.round(x / 4.2);
    const lane = lanes[column] || 0;
    lanes[column] = lane + 1;
    layout[point.code] = { x: x, y: CHAMBER_HEIGHT - 40 - lane * 4.3, score: point.score };
  }
  return layout;
}

function buildChamber() {
  const chart = canvas(CHAMBER_WIDTH, CHAMBER_HEIGHT);
  const axis = el("g");
  chart.appendChild(axis);
  chamber.axis = axis;
  const dots = el("g");
  chart.appendChild(dots);
  const codes = {};
  for (const year in D.chamber) {
    for (const code of D.chamber[year].c) { codes[code] = true; }
  }
  for (const code in codes) {
    const named = NAMED.indexOf(code) >= 0;
    const dot = el("circle", { cx: 0, cy: CHAMBER_HEIGHT, r: 1.9, opacity: 0 });
    dots.appendChild(dot);
    chamber.dots[code] = dot;
    if (named) {
      const label = el("text", { x: 0, y: CHAMBER_HEIGHT, class: "lab", "text-anchor": "middle", opacity: 0 },
        D.names[code] || code);
      dots.appendChild(label);
      chamber.labels[code] = label;
    }
    const hit = el("circle", { cx: 0, cy: CHAMBER_HEIGHT, r: 5.5, fill: "transparent", style: "cursor:crosshair", opacity: 0 });
    hit.addEventListener("mouseenter", function () {
      const current = chamber.state[code];
      if (!current) { return; }
      chamber.readout.style.display = "block";
      chamber.readout.style.left = (current.x / CHAMBER_WIDTH * 100) + "%";
      chamber.readout.style.top = (current.y / CHAMBER_HEIGHT * 100) + "%";
      chamber.readout.innerHTML = "<b>" + esc(D.names[code] || code) + "</b><br>" +
        current.score.toFixed(2) + " in " + S.chamberYear;
    });
    hit.addEventListener("mouseleave", function () { chamber.readout.style.display = "none"; });
    dots.appendChild(hit);
    chamber.hits[code] = hit;
  }
  chamber.caption = el("text", { x: 16, y: 16, class: "tick" }, "");
  chart.appendChild(chamber.caption);
  chart.appendChild(el("text", { x: CHAMBER_WIDTH - 16, y: 16, class: "tick", "text-anchor": "end" }, "Western end to the right"));
  chamber.readout = document.createElement("div");
  chamber.readout.className = "hoverbox";
  chamber.readout.style.display = "none";
  chamber.svg = chart;
  $("#fig3").replaceChildren(chart, chamber.readout);
}

function paintChamberAxis() {
  const axis = chamber.axis;
  axis.replaceChildren();
  axis.appendChild(el("line", {
    x1: 16, x2: CHAMBER_WIDTH - 16, y1: CHAMBER_HEIGHT - 30, y2: CHAMBER_HEIGHT - 30, stroke: C.line
  }));
  for (const value of [-2, -1, 0, 1, 2, 3]) {
    const x = 24 + (value - CHAMBER_LOW) / (CHAMBER_HIGH - CHAMBER_LOW) * (CHAMBER_WIDTH - 48);
    axis.appendChild(el("line", { x1: x, x2: x, y1: CHAMBER_HEIGHT - 34, y2: CHAMBER_HEIGHT - 26, stroke: C.line }));
    axis.appendChild(el("text", { x: x, y: CHAMBER_HEIGHT - 13, class: "tick", "text-anchor": "middle" }, String(value)));
  }
}

function drawChamber(animate) {
  if (!chamber.svg) { buildChamber(); }
  paintChamberAxis();
  const record = D.chamber[String(S.chamberYear)];
  if (!record) { return; }
  const layout = chamberLayout(S.chamberYear);
  const from = {};
  for (const code in chamber.dots) {
    const dot = chamber.dots[code];
    from[code] = {
      x: Number(dot.getAttribute("cx")) || 0,
      y: Number(dot.getAttribute("cy")) || CHAMBER_HEIGHT,
      opacity: Number(dot.getAttribute("opacity")) || 0
    };
    const big = code === "MA" || code === "DZ";
    const named = NAMED.indexOf(code) >= 0 && !big;
    dot.setAttribute("fill", big ? (code === "MA" ? C.ma : C.dz) : named ? C.ink : C.dot);
    dot.setAttribute("r", big ? 4.2 : named ? 3 : 1.9);
    if (chamber.labels[code]) {
      chamber.labels[code].setAttribute("fill", code === "MA" ? C.ma : code === "DZ" ? C.dz : C.mute);
      chamber.labels[code].setAttribute("font-size", big ? 10.5 : 9);
    }
  }
  chamber.state = layout;
  chamber.caption.textContent = S.chamberYear + ", " + record.c.length + " states with an estimated position";
  $("#chLabel").textContent = S.chamberYear;

  const place = function (progress) {
    for (const code in chamber.dots) {
      const target = layout[code];
      const origin = from[code];
      const visible = target ? 1 : 0;
      const x = target ? origin.x + (target.x - origin.x) * progress : origin.x;
      const y = target ? origin.y + (target.y - origin.y) * progress : origin.y;
      const opacity = origin.opacity + (visible - origin.opacity) * progress;
      chamber.dots[code].setAttribute("cx", x.toFixed(2));
      chamber.dots[code].setAttribute("cy", y.toFixed(2));
      chamber.dots[code].setAttribute("opacity", opacity.toFixed(3));
      chamber.hits[code].setAttribute("cx", x.toFixed(2));
      chamber.hits[code].setAttribute("cy", y.toFixed(2));
      chamber.hits[code].setAttribute("opacity", target ? 1 : 0);
      if (chamber.labels[code]) {
        chamber.labels[code].setAttribute("x", x.toFixed(2));
        chamber.labels[code].setAttribute("y", (y - 7).toFixed(2));
        chamber.labels[code].setAttribute("opacity", opacity.toFixed(3));
      }
    }
  };

  if (chamber.frame) { cancelAnimationFrame(chamber.frame); chamber.frame = null; }
  if (animate === false || reducedMotion()) { place(1); return; }
  const duration = 340;
  const started = performance.now();
  const step = function (now) {
    const share = Math.min(1, (now - started) / duration);
    const eased = share < 0.5 ? 4 * share * share * share : 1 - Math.pow(-2 * share + 2, 3) / 2;
    place(eased);
    if (share < 1) { chamber.frame = requestAnimationFrame(step); } else { chamber.frame = null; }
  };
  chamber.frame = requestAnimationFrame(step);
}

function drawGaps() {
  const rows = POWERS.map(function (code) {
    const record = D.gaps[code + "_" + S.gapSample];
    return {
      name: D.names[code] || code, gap: record.gap, lo: record.lo, hi: record.hi,
      ma: record.ma, dz: record.dz, n: record.n
    };
  });
  rows.sort(function (first, second) { return first.gap - second.gap; });
  const width = 700;
  const height = 44 + rows.length * 34;
  const xScale = function (value) { return 150 + (value + 20) / 40 * (width - 170); };
  const chart = canvas(width, height);
  for (const value of [-20, -10, 0, 10, 20]) {
    chart.appendChild(el("line", { x1: xScale(value), x2: xScale(value), y1: 10, y2: height - 24, stroke: value === 0 ? C.ink : C.grid }));
    chart.appendChild(el("text", { x: xScale(value), y: height - 8, class: "tick", "text-anchor": "middle" }, (value > 0 ? "+" : "") + value));
  }
  rows.forEach(function (row, index) {
    const y = 26 + index * 34;
    const colour = row.gap > 0 ? C.ma : C.dz;
    chart.appendChild(el("text", { x: 140, y: y + 4, class: "lab", "text-anchor": "end", fill: C.ink }, row.name));
    chart.appendChild(el("line", { x1: xScale(row.lo), x2: xScale(row.hi), y1: y, y2: y, stroke: colour, "stroke-width": 1.8 }));
    chart.appendChild(el("line", { x1: xScale(row.lo), x2: xScale(row.lo), y1: y - 4, y2: y + 4, stroke: colour, "stroke-width": 1.4 }));
    chart.appendChild(el("line", { x1: xScale(row.hi), x2: xScale(row.hi), y1: y - 4, y2: y + 4, stroke: colour, "stroke-width": 1.4 }));
    chart.appendChild(el("circle", { cx: xScale(row.gap), cy: y, r: 5, fill: colour }));
    chart.appendChild(el("text", {
      x: xScale(row.gap > 0 ? row.hi : row.lo) + (row.gap > 0 ? 9 : -9), y: y + 4,
      class: "tick", fill: colour, "text-anchor": row.gap > 0 ? "start" : "end"
    }, (row.gap > 0 ? "+" : "") + row.gap.toFixed(1)));
    chart.appendChild(el("title", {}, row.name + ": Morocco " + row.ma + "%, Algeria " + row.dz + "%, " + row.n + " shared votes"));
  });
  chart.appendChild(el("text", { x: xScale(-19), y: 14, class: "lab", fill: C.dz }, "Algeria closer"));
  chart.appendChild(el("text", { x: xScale(19), y: 14, class: "lab", fill: C.ma, "text-anchor": "end" }, "Morocco closer"));
  fadeIn(chart);
  $("#fig4").replaceChildren(chart);
}

function drawCaucus() {
  const years = [];
  for (let year = 1975; year <= D.coverage.maxYear; year += 1) { years.push(year); }
  const rate = function (key, year) {
    const record = D.blocs[key][year];
    return record && record[1] >= 10 ? 100 * record[0] / record[1] : null;
  };
  const suffix = S.bloc === "arab" ? "arab" : "africa";
  lineChart($("#fig5"), [
    { points: years.map(function (year) { return [year, rate(suffix + "_MA", year)]; }), colour: C.ma, width: 1.9, name: "Morocco" },
    { points: years.map(function (year) { return [year, rate(suffix + "_DZ", year)]; }), colour: C.dz, width: 1.9, name: "Algeria" }
  ], {
    x0: 1975, x1: D.coverage.maxYear, y0: 0, y1: 40,
    xTicks: [1980, 1990, 2000, 2010, 2020], yTicks: [0, 10, 20, 30, 40], height: 240,
    yFormat: function (value) { return value + "%"; },
    hover: function (value) { return value.toFixed(1) + "%"; }
  });
  keyRow($("#key5"), [{ colour: C.ma, name: "Morocco" }, { colour: C.dz, name: "Algeria" }]);
}

function ballot(value) {
  if (!value) { return '<span style="color:' + C.dot + '">&mdash;</span>'; }
  const colour = value === 1 ? C.dz : value === 2 ? C.ochre : C.ma;
  return '<span style="color:' + colour + '">' + BALLOT[value] + "</span>";
}

function drawSahara() {
  let rows = D.sahara.filter(function (row) { return row.tier === S.saharaTier; });
  if (S.saharaQuery) {
    rows = rows.filter(function (row) {
      return (row.year + " " + row.unres + " " + row.title).toLowerCase().indexOf(S.saharaQuery) >= 0;
    });
  }
  const sort = S.saharaSort;
  rows = rows.slice().sort(function (first, second) {
    if (sort.key === "year") { return sort.dir * (first.year - second.year); }
    return sort.dir * String(first[sort.key]).localeCompare(String(second[sort.key]));
  });
  $("#sahCount").textContent = rows.length + " roll calls";
  const direction = function (key) { return sort.key === key ? (sort.dir > 0 ? "asc" : "desc") : ""; };
  let html = '<table><thead><tr>' +
    '<th class="sortable" data-key="year" data-dir="' + direction("year") + '">Year</th>' +
    '<th class="sortable" data-key="unres" data-dir="' + direction("unres") + '">Symbol</th>' +
    '<th class="sortable" data-key="title" data-dir="' + direction("title") + '">Record</th>' +
    '<th class="mid">Morocco</th><th class="mid">Algeria</th><th class="mid">Spain</th><th class="mid">US</th>' +
    '<th class="num">Y / A / N</th></tr></thead><tbody>';
  for (const row of rows) {
    html += "<tr><td>" + row.year + '</td><td class="mono">' + esc(row.unres || "—") + '</td><td style="max-width:210px">' + esc(row.title) +
      '</td><td class="mid">' + ballot(row.v.MA) + '</td><td class="mid">' + ballot(row.v.DZ) + '</td><td class="mid">' + ballot(row.v.ES) +
      '</td><td class="mid">' + ballot(row.v.US) + '</td><td class="num">' + row.tally.join(" / ") + "</td></tr>";
  }
  $("#tab2").innerHTML = html + "</tbody></table>";
  const headers = $("#tab2").querySelectorAll("th.sortable");
  for (const header of headers) {
    header.addEventListener("click", function () {
      const key = header.dataset.key;
      S.saharaSort = { key: key, dir: S.saharaSort.key === key ? -S.saharaSort.dir : 1 };
      drawSahara();
    });
  }
}

function drawMinurso() {
  let html = '<table><thead><tr><th>Resolution</th><th>Adopted</th><th>Mandate to</th><th class="num">For</th><th class="num">Against</th><th class="num">Abstain</th><th class="num">Not voting</th></tr></thead><tbody>';
  for (const row of D.minurso) {
    html += '<tr><td class="mono">' + esc(row.resolution) + "</td><td>" + row.adopted + "</td><td>" + esc(row.until) +
      '</td><td class="num">' + row.favour + '</td><td class="num" style="color:' + (row.against ? C.ma : "inherit") + '">' + row.against +
      '</td><td class="num" style="color:' + (row.abstain ? C.ochre : "inherit") + '">' + row.abstain +
      '</td><td class="num">' + row.absent + "</td></tr>";
  }
  $("#tab3").innerHTML = html + "</tbody></table>";
}

function drawSplits() {
  let rows = D.splits.filter(function (row) { return row.year >= S.splitEra; });
  if (S.splitQuery) {
    rows = rows.filter(function (row) {
      return (row.year + " " + row.unres + " " + row.title).toLowerCase().indexOf(S.splitQuery) >= 0;
    });
  }
  rows = rows.slice().sort(function (first, second) { return second.year - first.year; });
  let html = '<table><thead><tr><th>Year</th><th>Symbol</th><th>Record</th><th class="mid">Morocco</th><th class="mid">Algeria</th></tr></thead><tbody>';
  for (const row of rows) {
    const key = row.year + "|" + row.unres;
    html += '<tr data-key="' + esc(key) + '" class="' + (S.splitHit === key ? "hit" : "") + '"><td>' + row.year +
      '</td><td class="mono">' + esc(row.unres || "—") + "</td><td>" + esc(row.title) +
      (row.important ? '<span class="flag">important</span>' : "") + '</td><td class="mid">' + ballot(row.ma) +
      '</td><td class="mid">' + ballot(row.dz) + "</td></tr>";
  }
  $("#tab4").innerHTML = html + "</tbody></table>";
  $("#splitCount").textContent = rows.length + " roll calls";
  const lines = $("#tab4").querySelectorAll("tr[data-key]");
  for (const line of lines) {
    line.addEventListener("click", function () {
      S.splitHit = line.dataset.key;
      drawSplits();
      flashMark(S.splitHit);
    });
  }
}

function flashMark(key) {
  const mark = markIndex[key];
  if (!mark) { return; }
  mark.setAttribute("opacity", "1");
  mark.setAttribute("stroke", C.ink);
  mark.setAttribute("stroke-width", "0.8");
  if (mark.scrollIntoView) { mark.scrollIntoView({ block: "nearest" }); }
  setTimeout(function () {
    mark.setAttribute("opacity", "0.85");
    mark.removeAttribute("stroke");
  }, 1600);
}

function drawBarcode() {
  const byYear = D.bars.byYear;
  const years = Object.keys(byYear).map(Number).sort(function (a, b) { return a - b; });
  let longest = 0;
  for (const year of years) { longest = Math.max(longest, byYear[year].length); }
  const width = 700;
  const rowHeight = 9;
  const left = 34;
  const step = (width - left - 8) / longest;
  const height = years.length * rowHeight + 16;
  const chart = canvas(width, height);
  markIndex = {};
  years.forEach(function (year, index) {
    const text = byYear[year];
    const top = 8 + index * rowHeight;
    const paths = { "2": "", "1": "" };
    for (let position = 0; position < text.length; position += 1) {
      if (text[position] === "0") { continue; }
      const x = left + position * step;
      paths[text[position]] += "M" + x.toFixed(2) + " " + top + "V" + (top + rowHeight - 2.4);
    }
    if (year % 5 === 0) {
      chart.appendChild(el("text", { x: 0, y: top + 6, class: "tick" }, String(year)));
    }
    chart.appendChild(el("path", { d: paths["2"], stroke: C.bar, "stroke-width": Math.max(0.7, step * 0.8) }));
    chart.appendChild(el("path", { d: paths["1"], stroke: C.ochre, "stroke-width": Math.max(0.7, step * 0.8) }));
  });
  const label = $("#barLabel");
  const reset = function () {
    label.textContent = D.bars.opposed.length + " roll calls of open opposition. Hover one to read it.";
  };
  for (const mark of D.bars.opposed) {
    const index = years.indexOf(mark.y);
    if (index < 0) { continue; }
    const rect = el("rect", {
      x: left + mark.i * step - 1, y: 8 + index * rowHeight - 1.5,
      width: Math.max(2.2, step * 1.6), height: rowHeight, fill: C.ma, opacity: 0.85, style: "cursor:pointer"
    });
    rect.addEventListener("mouseenter", function () {
      rect.setAttribute("opacity", "1");
      label.textContent = mark.y + "   " + (mark.u || "no symbol") + "   " + mark.t;
    });
    rect.addEventListener("mouseleave", function () { rect.setAttribute("opacity", "0.85"); });
    rect.addEventListener("click", function () {
      label.textContent = mark.y + "   " + (mark.u || "no symbol") + "   " + mark.t;
      S.splitEra = 1962;
      S.splitQuery = "";
      $("#splitFind").value = "";
      S.splitHit = mark.y + "|" + mark.u;
      chips($("#splitCtl"), [[1962, "since 1962"], [1990, "since 1990"], [2010, "since 2010"]], S.splitEra, setSplitEra);
      drawSplits();
    });
    markIndex[mark.y + "|" + mark.u] = rect;
    chart.appendChild(rect);
  }
  $("#fig6").replaceChildren(chart);
  reset();
}

function drawTerms() {
  const byYear = new Map();
  for (const row of D.speech.kw) {
    if (!byYear.has(row.year)) { byYear.set(row.year, { year: row.year }); }
    byYear.get(row.year)[row.c] = 10000 * row.n[S.term] / row.w;
  }
  const rows = Array.from(byYear.values()).sort(function (a, b) { return a.year - b.year; });
  let top = 4;
  for (const row of rows) { top = Math.max(top, row.MA || 0, row.DZ || 0); }
  lineChart($("#fig7"), [
    { points: rows.map(function (row) { return [row.year, row.MA === undefined ? null : row.MA]; }), colour: C.ma, width: 1.9, name: "Morocco" },
    { points: rows.map(function (row) { return [row.year, row.DZ === undefined ? null : row.DZ]; }), colour: C.dz, width: 1.9, name: "Algeria" }
  ], {
    x0: 1962, x1: 2024, y0: 0, y1: Math.ceil(top * 1.1),
    xTicks: [1970, 1980, 1990, 2000, 2010, 2020],
    yTicks: [0, Math.round(top * 0.5), Math.ceil(top)], height: 250,
    yFormat: function (value) { return value.toFixed(0); },
    hover: function (value) { return value.toFixed(1) + " per 10k"; }
  });
  keyRow($("#key7"), [{ colour: C.ma, name: "Morocco" }, { colour: C.dz, name: "Algeria" }]);
}

function drawVocabulary() {
  const totals = speechTotals().slice().sort(function (first, second) {
    return (second.ma / (second.dz || 0.01)) - (first.ma / (first.dz || 0.01));
  });
  let html = '<table><thead><tr><th>Term</th><th class="num">Morocco</th><th class="num">Algeria</th><th class="num">Ratio</th></tr></thead><tbody>';
  for (const row of totals) {
    html += "<tr><td>" + esc(row.term) + '</td><td class="num" style="color:' + C.ma + '">' + row.ma.toFixed(1) + " (" + row.maCount +
      ')</td><td class="num" style="color:' + C.dz + '">' + row.dz.toFixed(1) + " (" + row.dzCount +
      ')</td><td class="num">' + (row.dz > 0 ? (row.ma / row.dz).toFixed(2) : "n/a") + "</td></tr>";
  }
  $("#tab5").innerHTML = html + "</tbody></table>";
}

function drawSimilarity() {
  const votes = D.series.all["MA-DZ"];
  const rows = D.speech.sims.map(function (row) {
    const record = votes[String(row.year)];
    return {
      year: row.year, speech: row.ma_dz, median: row.median, p90: row.p90,
      votes: record ? record[0] / 100 : null
    };
  });
  lineChart($("#fig8"), [
    { points: rows.map(function (row) { return [row.year, row.votes]; }), colour: C.ink, width: 2, name: "Ballots" },
    { points: rows.map(function (row) { return [row.year, row.speech]; }), colour: C.ma, width: 2, name: "Speeches" },
    { points: rows.map(function (row) { return [row.year, row.median]; }), colour: C.steel, width: 1.1, name: "Median dyad" },
    { points: rows.map(function (row) { return [row.year, row.p90]; }), colour: C.steel, width: 1.1, dash: "4 3", name: "90th percentile" }
  ], {
    x0: 1962, x1: 2024, y0: 0, y1: 1,
    xTicks: [1970, 1980, 1990, 2000, 2010, 2020], yTicks: [0, 0.25, 0.5, 0.75, 1], height: 260,
    yFormat: function (value) { return value.toFixed(2); },
    hover: function (value) { return value.toFixed(3); }
  });
  keyRow($("#key8"), [
    { colour: C.ink, name: "Ballots" },
    { colour: C.ma, name: "Speeches" },
    { colour: C.steel, name: "Median and 90th percentile dyad" }
  ]);
}

function drawExplorer() {
  const first = D.series[S.subject]["MA-" + S.power];
  const second = D.series[S.subject]["DZ-" + S.power];
  const years = [];
  for (const row of D.scaling) { years.push(row.year); }
  const pick = function (record, year) {
    const entry = record[String(year)];
    return entry ? entry[S.measure] : null;
  };
  const kappa = S.measure === 1;
  lineChart($("#fig9"), [
    { points: years.map(function (year) { return [year, pick(first, year)]; }), colour: C.ma, width: 2.1, name: "Morocco" },
    { points: years.map(function (year) { return [year, pick(second, year)]; }), colour: C.dz, width: 2.1, name: "Algeria" }
  ], {
    x0: 1962, x1: D.coverage.maxYear, y0: kappa ? -0.6 : 0, y1: kappa ? 1 : 100,
    xTicks: [1970, 1980, 1990, 2000, 2010, 2020],
    yTicks: kappa ? [-0.5, 0, 0.5, 1] : [0, 25, 50, 75, 100], height: 290,
    zero: kappa ? 0 : undefined,
    yFormat: function (value) { return kappa ? value.toFixed(1) : value + "%"; },
    hover: function (value) { return kappa ? value.toFixed(3) : value.toFixed(1) + "%"; }
  });
  keyRow($("#key9"), [{ colour: C.ma, name: "Morocco" }, { colour: C.dz, name: "Algeria" }]);
  const name = D.names[S.power] || S.power;
  const pooledFirst = pooled(S.subject, "MA-" + S.power, 1990, D.coverage.maxYear, S.measure);
  const pooledSecond = pooled(S.subject, "DZ-" + S.power, 1990, D.coverage.maxYear, S.measure);
  $("#fig9Title").textContent = (kappa ? "Chance corrected agreement with " : "Agreement with ") + name + ", 1962 to " + D.coverage.maxYear;
  const format = function (value) {
    if (value === null) { return "n/a"; }
    return kappa ? value.toFixed(3) : value.toFixed(1) + " percent";
  };
  $("#fig9Note").textContent =
    "Pooled over 1990 to " + D.coverage.maxYear + ", Morocco scores " + format(pooledFirst) + " and Algeria " + format(pooledSecond) +
    " against " + name + ", on the subject " + S.subject + ". Years with fewer than five shared roll calls are dropped.";
}

/* ---------- controls ---------- */

function setSplitEra(value) {
  S.splitEra = value;
  chips($("#splitCtl"), [[1962, "since 1962"], [1990, "since 1990"], [2010, "since 2010"]], S.splitEra, setSplitEra);
  drawSplits();
}

function stopPlaying() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    $("#play").textContent = "Play years";
  }
}

function nearestYear(value) {
  let best = chamberYears[0];
  for (const year of chamberYears) {
    if (Math.abs(year - value) < Math.abs(best - value)) { best = year; }
  }
  return best;
}

function bindSelect(node, options, read, write, redraw) {
  node.replaceChildren();
  for (const option of options) {
    const item = document.createElement("option");
    item.value = option[0];
    item.textContent = option[1];
    if (option[0] === read()) { item.selected = true; }
    node.appendChild(item);
  }
  node.addEventListener("change", function (event) {
    write(event.target.value);
    redraw();
  });
}

function bindChips(node, options, read, write, redraw) {
  const render = function () {
    chips(node, options, read(), function (value) {
      write(value);
      render();
      redraw();
    });
  };
  render();
}

function wireControls() {
  bindChips($("#gapCtl"), [["imp", "Important votes"], ["all", "All roll calls"]],
    function () { return S.gapSample; },
    function (value) { S.gapSample = value; },
    drawGaps);

  bindChips($("#blocCtl"), [["arab", "Arab caucus"], ["africa", "African group"]],
    function () { return S.bloc; },
    function (value) { S.bloc = value; },
    drawCaucus);

  bindChips($("#sahCtl"), [["named", "Named Sahara votes"], ["proxy", "Declaration resolutions"]],
    function () { return S.saharaTier; },
    function (value) { S.saharaTier = value; },
    drawSahara);

  setSplitEra(S.splitEra);

  bindSelect($("#termSelect"), D.speech.terms.map(function (term, index) { return [index, term]; }),
    function () { return S.term; },
    function (value) { S.term = Number(value); },
    drawTerms);

  const powerOptions = POWERS.map(function (code) { return [code, D.names[code] || code]; });
  bindChips($("#powerCtl"), powerOptions,
    function () { return S.power; },
    function (value) { S.power = value; },
    drawExplorer);

  bindSelect($("#subjectSelect"), SUBJECTS.map(function (key) { return [key, D.subjectLabels[key]]; }),
    function () { return S.subject; },
    function (value) { S.subject = value; },
    drawExplorer);

  bindChips($("#measureCtl"), [[0, "Agreement index"], [1, "Chance corrected"]],
    function () { return S.measure; },
    function (value) { S.measure = value; },
    drawExplorer);

  const slider = $("#chYear");
  slider.min = chamberYears[0];
  slider.max = chamberYears[chamberYears.length - 1];
  slider.value = S.chamberYear;
  slider.addEventListener("input", function () {
    stopPlaying();
    S.chamberYear = nearestYear(Number(slider.value));
    drawChamber(true);
  });
  slider.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") { return; }
    const index = chamberYears.indexOf(nearestYear(Number(slider.value)));
    const next = Math.min(chamberYears.length - 1, Math.max(0, index + (event.key === "ArrowRight" ? 1 : -1)));
    S.chamberYear = chamberYears[next];
    slider.value = S.chamberYear;
    stopPlaying();
    drawChamber(true);
    event.preventDefault();
  });
  $("#play").addEventListener("click", function () {
    if (timer) { return stopPlaying(); }
    $("#play").textContent = "Pause";
    timer = setInterval(function () {
      const index = chamberYears.indexOf(S.chamberYear);
      S.chamberYear = chamberYears[(index + 1) % chamberYears.length];
      slider.value = S.chamberYear;
      drawChamber(true);
    }, 520);
  });

  const list = $("#stateList");
  for (const code in D.names) {
    if (["MA", "DZ", "US"].indexOf(code) >= 0) { continue; }
    const option = document.createElement("option");
    option.value = D.names[code];
    list.appendChild(option);
  }
  $("#addState").addEventListener("change", function (event) {
    const text = event.target.value.trim().toLowerCase();
    for (const code in D.names) {
      if (D.names[code].toLowerCase() === text && S.picked.indexOf(code) < 0 && S.picked.length < 4) {
        S.picked.push(code);
        drawPositions();
        break;
      }
    }
    event.target.value = "";
  });

  let saharaTimer = null;
  $("#sahFind").addEventListener("input", function (event) {
    const text = event.target.value.trim().toLowerCase();
    clearTimeout(saharaTimer);
    saharaTimer = setTimeout(function () {
      S.saharaQuery = text;
      drawSahara();
    }, 120);
  });
  let splitTimer = null;
  $("#splitFind").addEventListener("input", function (event) {
    const text = event.target.value.trim().toLowerCase();
    clearTimeout(splitTimer);
    splitTimer = setTimeout(function () {
      S.splitQuery = text;
      drawSplits();
    }, 120);
  });
  $("#splitClear").addEventListener("click", function () {
    S.splitQuery = "";
    S.splitHit = null;
    $("#splitFind").value = "";
    drawSplits();
  });

  $("#copyCite").addEventListener("click", function (event) {
    navigator.clipboard.writeText(citation()).then(function () {
      event.target.textContent = "Citation copied";
      setTimeout(function () { event.target.textContent = "Copy the APA citation"; }, 2200);
    });
  });
  $("#dlSeries").addEventListener("click", downloadSeries);
  $("#dlSplits").addEventListener("click", downloadSplits);
}

function download(name, text) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadSeries() {
  const header = ["year", "subject", "pair", "agreement_percent", "chance_corrected", "shared_roll_calls"];
  const lines = [header.join(",")];
  for (const subject in D.series) {
    for (const pair in D.series[subject]) {
      const record = D.series[subject][pair];
      for (const year in record) {
        lines.push([year, subject, pair, record[year][0], record[year][1], record[year][2]].join(","));
      }
    }
  }
  download("agreement_series.csv", lines.join("\n"));
}

function downloadSplits() {
  const lines = ["year,symbol,title,morocco,algeria,united_states,france,important_vote"];
  for (const row of D.splits) {
    lines.push([
      row.year, row.unres, '"' + row.title.replace(/"/g, "'") + '"',
      BALLOT[row.ma], BALLOT[row.dz], row.us ? BALLOT[row.us] : "", row.fr ? BALLOT[row.fr] : "",
      row.important ? "yes" : "no"
    ].join(","));
  }
  download("opposed_roll_calls.csv", lines.join("\n"));
}

function wireRail() {
  const links = document.querySelectorAll("nav.rail a");
  const targets = [];
  for (const link of links) {
    const target = document.querySelector(link.getAttribute("href"));
    if (target) { targets.push({ link: link, target: target }); }
  }
  const update = function () {
    let active = null;
    for (const item of targets) {
      if (item.target.getBoundingClientRect().top < 160) { active = item; }
    }
    for (const item of targets) { item.link.classList.toggle("on", item === active); }
  };
  window.addEventListener("scroll", update, { passive: true });
  update();
}

function drawAll() {
  C = colours();
  drawCoverage();
  drawPositions();
  drawDistance();
  drawPeriods();
  drawChamber(false);
  drawGaps();
  drawCaucus();
  drawSahara();
  drawMinurso();
  drawSplits();
  drawBarcode();
  drawTerms();
  drawVocabulary();
  drawSimilarity();
  drawExplorer();
}

function start(payload) {
  D = payload;
  chamberYears = Object.keys(D.chamber).map(Number).sort(function (a, b) { return a - b; });
  S.chamberYear = chamberYears.indexOf(2019) >= 0 ? 2019 : chamberYears[chamberYears.length - 1];
  C = colours();
  writeProse();
  wireControls();
  drawAll();
  wireRail();
  if (window.matchMedia) {
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = function () { drawAll(); };
    if (scheme.addEventListener) { scheme.addEventListener("change", handler); }
  }
}

if (window.__DATA__) {
  start(window.__DATA__);
} else {
  fetch("./data.json").then(function (response) { return response.json(); }).then(start).catch(function () {
    document.querySelector("#abstract").textContent =
      "This page loads its data from data.json, which a browser will not read from a file path. Serve the folder over http, for instance with python3 -m http.server, or open the standalone build in dist.";
  });
}
