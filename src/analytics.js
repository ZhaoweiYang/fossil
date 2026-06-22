// 价格分析 / Price analytics: historical series, forward projection,
// similar-item trends and ROI maths. Everything is deterministic so the
// same fossil always renders the same chart (no Math.random()).

import { FOSSILS, NOW_YEAR } from './data.js';

// Small deterministic pseudo-noise in [-1, 1] from an integer seed, so a
// fossil's history looks organic but never changes between requests.
function noise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function round(n) {
  return Math.round(n);
}

// Build a quarterly historical price series for a fossil from its first
// tracked year up to "now", compounding `appreciation` per year with a
// touch of seeded volatility. The final point is pinned to basePrice so the
// quoted current value and the chart agree.
export function priceHistory(fossil) {
  const points = [];
  const startYear = fossil.since;
  const quarters = (NOW_YEAR - startYear) * 4;
  // Work backwards from basePrice so the last point == basePrice exactly.
  const qGrowth = Math.pow(1 + fossil.appreciation, 1 / 4);
  const seedBase = fossil.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

  for (let i = 0; i <= quarters; i++) {
    const year = startYear + Math.floor(i / 4);
    const q = (i % 4) + 1;
    // base value along the smooth compounding curve
    const smooth = fossil.basePrice / Math.pow(qGrowth, quarters - i);
    const wobble = 1 + noise(seedBase + i) * fossil.volatility;
    const value = i === quarters ? fossil.basePrice : smooth * wobble;
    points.push({ label: `${year}Q${q}`, year, quarter: q, price: round(value) });
  }
  return points;
}

// Project a fossil's value forward `years` years (default 3) at its modelled
// appreciation, plus an optimistic / conservative band (±40% of the rate).
export function projection(fossil, years = 3) {
  const start = fossil.basePrice;
  const points = [];
  const optRate = fossil.appreciation * 1.4;
  const consRate = fossil.appreciation * 0.6;
  for (let i = 0; i <= years * 4; i++) {
    const t = i / 4;
    const year = NOW_YEAR + Math.floor(i / 4);
    const q = (i % 4) + 1;
    points.push({
      label: `${year}Q${q}`,
      year,
      quarter: q,
      price: round(start * Math.pow(1 + fossil.appreciation, t)),
      optimistic: round(start * Math.pow(1 + optRate, t)),
      conservative: round(start * Math.pow(1 + consRate, t)),
    });
  }
  return points;
}

// Average price trend for a whole category — the "类似品涨价趋势".
// Normalised to an index (start = 100) so differently-priced items can be
// compared on one chart, and also returned as an averaged annual rate.
export function categoryTrend(category) {
  const peers = FOSSILS.filter((f) => f.category === category && !f.restricted);
  if (peers.length === 0) return { index: [], avgAppreciation: 0, sampleSize: 0 };

  // Align every peer's history to its last `n` quarters and average the
  // normalised (start=100) curves.
  const histories = peers.map((f) => priceHistory(f));
  const minLen = Math.min(...histories.map((h) => h.length));
  const index = [];
  for (let i = 0; i < minLen; i++) {
    let sum = 0;
    let labelSrc = null;
    for (const h of histories) {
      const slice = h.slice(h.length - minLen);
      const norm = (slice[i].price / slice[0].price) * 100;
      sum += norm;
      labelSrc = slice[i].label;
    }
    index.push({ label: labelSrc, value: round((sum / histories.length) * 10) / 10 });
  }
  const avgAppreciation =
    peers.reduce((a, f) => a + f.appreciation, 0) / peers.length;
  return { index, avgAppreciation, sampleSize: peers.length };
}

// ROI maths for a closed buy→sell case.
export function computeReturn(buyPrice, sellPrice, buyDate, sellDate) {
  const profit = sellPrice - buyPrice;
  const roi = profit / buyPrice; // total return
  const months = monthsBetween(buyDate, sellDate);
  const years = Math.max(months / 12, 0.25);
  const annualized = Math.pow(sellPrice / buyPrice, 1 / years) - 1;
  return {
    profit,
    roi,
    months,
    years: Math.round(years * 10) / 10,
    annualized,
    multiple: Math.round((sellPrice / buyPrice) * 100) / 100,
  };
}

// "YYYY-MM" → month count between two such strings.
function monthsBetween(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

// Forecast summary used on the buy page: projected value in 1/3/5y and the
// implied gain, framed against the category average.
export function forecastSummary(fossil) {
  const cat = categoryTrend(fossil.category);
  const at = (y) => round(fossil.basePrice * Math.pow(1 + fossil.appreciation, y));
  return {
    current: fossil.basePrice,
    appreciation: fossil.appreciation,
    categoryAvgAppreciation: cat.avgAppreciation,
    sampleSize: cat.sampleSize,
    in1y: at(1),
    in3y: at(3),
    in5y: at(5),
    gain3yPct: Math.round((Math.pow(1 + fossil.appreciation, 3) - 1) * 1000) / 10,
    vsCategory:
      Math.round((fossil.appreciation - cat.avgAppreciation) * 1000) / 10, // pct points
  };
}
