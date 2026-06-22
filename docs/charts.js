// 轻量 SVG 图表 / Tiny dependency-free SVG charts.
// Exposes window.Charts.{line, sparkline, donutLegend}.

const SVGNS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, children = []) {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.appendChild(c);
  return node;
}

function fmt(n) {
  if (n >= 10000) return '¥' + (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万';
  return '¥' + Math.round(n).toLocaleString();
}

// Multi-series line chart with optional shaded band (for forecast range).
// config: {
//   series: [{ name, color, points:[{label, value}], dashed?, dot? }],
//   band?: { upper:[{label,value}], lower:[{label,value}], color },
//   yLabel?, height?, formatY?
// }
function line(container, config) {
  container.innerHTML = '';
  const W = container.clientWidth || 640;
  const H = config.height || 280;
  const padL = 58, padR = 16, padT = 16, padB = 38;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allSeries = config.series.filter((s) => s.points && s.points.length);
  if (!allSeries.length) return;

  // unified label axis (use the longest series)
  const labels = allSeries.reduce(
    (a, s) => (s.points.length > a.length ? s.points : a),
    []
  ).map((p) => p.label);
  const n = labels.length;

  let allVals = [];
  for (const s of allSeries) allVals.push(...s.points.map((p) => p.value));
  if (config.band) {
    allVals.push(...config.band.upper.map((p) => p.value));
    allVals.push(...config.band.lower.map((p) => p.value));
  }
  let min = Math.min(...allVals);
  let max = Math.max(...allVals);
  if (min === max) { min *= 0.9; max *= 1.1; }
  const range = max - min;
  min = Math.max(0, min - range * 0.08);
  max = max + range * 0.08;

  const formatY = config.formatY || fmt;
  const x = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => padT + plotH - ((v - min) / (max - min)) * plotH;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: '100%',
    height: H,
    class: 'chart-svg',
    preserveAspectRatio: 'none',
  });

  // y gridlines + labels
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const val = min + ((max - min) * t) / ticks;
    const yy = y(val);
    svg.appendChild(
      el('line', { x1: padL, y1: yy, x2: W - padR, y2: yy, class: 'grid' })
    );
    const lbl = el('text', { x: padL - 8, y: yy + 4, class: 'axis-y', 'text-anchor': 'end' });
    lbl.textContent = formatY(val);
    svg.appendChild(lbl);
  }

  // x labels (thin them out)
  const step = Math.ceil(n / 6);
  for (let i = 0; i < n; i += step) {
    const t = el('text', { x: x(i), y: H - 14, class: 'axis-x', 'text-anchor': 'middle' });
    t.textContent = labels[i];
    svg.appendChild(t);
  }

  // forecast band
  if (config.band) {
    const up = config.band.upper, lo = config.band.lower;
    const pts = [];
    for (let i = 0; i < up.length; i++) pts.push(`${x(i)},${y(up[i].value)}`);
    for (let i = lo.length - 1; i >= 0; i--) pts.push(`${x(i)},${y(lo[i].value)}`);
    svg.appendChild(
      el('polygon', { points: pts.join(' '), fill: config.band.color || 'rgba(212,175,55,.14)', stroke: 'none' })
    );
  }

  // series
  for (const s of allSeries) {
    const d = s.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`)
      .join(' ');
    const pathAttrs = {
      d,
      fill: 'none',
      stroke: s.color,
      'stroke-width': s.width || 2.5,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    };
    if (s.dashed) pathAttrs['stroke-dasharray'] = '6 5';
    svg.appendChild(el('path', pathAttrs));

    if (s.dot !== false) {
      s.points.forEach((p, i) => {
        if (i === s.points.length - 1 || i % step === 0) {
          svg.appendChild(
            el('circle', { cx: x(i), cy: y(p.value), r: 3, fill: s.color })
          );
        }
      });
    }
  }

  container.appendChild(svg);

  // legend
  if (config.series.length > 1 || config.showLegend) {
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    for (const s of config.series) {
      const item = document.createElement('span');
      item.className = 'legend-item';
      item.innerHTML = `<i style="background:${s.color}${s.dashed ? ';border-bottom:2px dashed ' + s.color + ';background:transparent;height:0' : ''}"></i>${s.name}`;
      legend.appendChild(item);
    }
    container.appendChild(legend);
  }
}

// Tiny inline sparkline (for sale/comp cards).
function sparkline(points, { color = '#d4af37', width = 120, height = 34 } = {}) {
  if (!points || points.length < 2) return document.createTextNode('');
  const vals = points.map((p) => (typeof p === 'number' ? p : p.value));
  const min = Math.min(...vals), max = Math.max(...vals);
  const rng = max - min || 1;
  const x = (i) => (i / (vals.length - 1)) * (width - 4) + 2;
  const y = (v) => height - 3 - ((v - min) / rng) * (height - 6);
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'spark' });
  const area = `${d} L ${x(vals.length - 1)} ${height} L ${x(0)} ${height} Z`;
  svg.appendChild(el('path', { d: area, fill: color, opacity: '0.12', stroke: 'none' }));
  svg.appendChild(el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2 }));
  svg.appendChild(el('circle', { cx: x(vals.length - 1), cy: y(vals[vals.length - 1]), r: 2.6, fill: color }));
  return svg;
}

window.Charts = { line, sparkline, fmt };
