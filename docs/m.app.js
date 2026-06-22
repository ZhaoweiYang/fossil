// 古生代 · 移动端 H5 / Fossil platform mobile PWA.
// Reuses the same pluggable API layer (api.js HTTP adapter on the server,
// api.local.js client-side store on GitHub Pages) and the SVG chart module.
import * as api from './api.js';

const appEl = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const sheetRoot = document.getElementById('sheet-root');
const toastEl = document.getElementById('toast');

// ---------- helpers ----------
const yuan = (n) => '¥' + Math.round(Number(n)).toLocaleString('zh-CN');
const pct = (f) => (f >= 0 ? '+' : '') + (f * 100).toFixed(1) + '%';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let toastTimer;
function toast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast ' + type;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => (toastEl.hidden = true), 220);
  }, 3000);
}

function fmtCountdown(ms) {
  if (ms <= 0) return '已结束';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (d > 0) return `${d}天 ${h}时 ${m}分`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// Real photo with emoji fallback. The emoji sits behind; if the image loads it
// covers the emoji, if it fails (onerror) the img is removed and emoji shows.
function photo(obj, { h, w, badge, cls = '', radius } = {}) {
  let style = '';
  if (h) style += `height:${h}px;`;
  if (w) style += `width:${w}px;flex:none;`;
  if (radius) style += `border-radius:${radius}px;`;
  const emojiSize = w && w <= 64 ? ' style="font-size:24px"' : '';
  const img = obj.image
    ? `<img class="ph-img" src="${esc(obj.image)}" alt="${esc(obj.name || '')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  return `<div class="ph ${cls}"${style ? ` style="${style}"` : ''}>${badge ? `<span class="badge">${esc(badge)}</span>` : ''}<span class="ph-emoji"${emojiSize}>${obj.icon || '🦴'}</span>${img}</div>`;
}

// ---------- routing (bottom tabs) ----------
const screens = {};
let current = 'home';

function go(tab) {
  current = tab;
  [...tabbar.children].forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  appEl.scrollTop = 0;
  appEl.innerHTML = '<div class="loading">加载中…</div>';
  (screens[tab] || screens.home)().catch((e) => {
    appEl.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  });
}
tabbar.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) go(btn.dataset.tab);
});

function appbar(title, sub, hero = false) {
  if (hero) {
    return `<header class="appbar hero">
      <div class="brandrow"><span class="mark">🦴</span>
        <div><div class="title">古生代 <span class="gold">FOSSILIA</span></div>
        <div class="sub">${esc(sub)}</div></div></div>
    </header>`;
  }
  return `<header class="appbar"><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</header>`;
}

// =====================================================================
// 首页 / Home
// =====================================================================
screens.home = async function () {
  const [stats, auctions, sales, activity] = await Promise.all([
    api.get('/api/stats'), api.get('/api/auctions'), api.get('/api/sales'), api.get('/api/activity'),
  ]);
  const top = sales[0];
  appEl.innerHTML = `
  <div class="view">
    ${appbar('', '化石拍卖 · 交易 · 价值趋势', true)}
    <div class="screen-pad">
      <div class="chips">
        ${chip(stats.liveAuctions, '进行中拍卖')}
        ${chip(stats.listings, '市场在售')}
        ${chip(yuan(stats.totalProfit), '案例累计盈利', true)}
        ${chip('+' + stats.avgRoiPct + '%', '案例平均回报', true)}
      </div>

      <div class="sec"><h2>🔥 热门拍卖</h2><span class="more" data-goto="auctions">全部 ›</span></div>
      <div class="hscroll" id="home-auctions"></div>

      <div class="sec"><h2>📈 本周最佳案例</h2><span class="more" data-goto="cases">全部 ›</span></div>
      <div id="home-case"></div>

      <div class="sec"><h2>⚡ 实时动态</h2></div>
      <ul class="feed">${activity.length ? activity.map(actItem).join('') : '<li>暂无动态，去出个价吧！</li>'}</ul>

      <p class="disclaimer">原型演示 · 数据模拟生成，趋势为统计模型预测，<b>不构成投资建议</b>。图片来自维基共享资源。</p>
    </div>
  </div>`;

  const ha = document.getElementById('home-auctions');
  auctions.slice(0, 6).forEach((a) => {
    const el = auctionCard(a, true);
    el.classList.add('fcard');
    ha.appendChild(el);
  });
  if (top) document.getElementById('home-case').appendChild(caseCard(top));

  appEl.querySelectorAll('[data-goto]').forEach((s) => s.addEventListener('click', () => go(s.dataset.goto)));
  startCountdowns();
};

function chip(n, l, green) {
  return `<div class="chip"><div class="n ${green ? 'green' : ''}">${n}</div><div class="l">${l}</div></div>`;
}
function actItem(a) {
  const icon = { bid: '🔨', list: '📤', buy: '🛒' }[a.type] || '•';
  return `<li>${icon} <b>${esc(a.text)}</b></li>`;
}

// =====================================================================
// 拍卖 / Auctions
// =====================================================================
screens.auctions = async function () {
  const auctions = await api.get('/api/auctions');
  appEl.innerHTML = `
  <div class="view">
    ${appbar('拍卖行', '缴 10% 保证金即可出价 · 临近结束自动延时防狙击')}
    <div class="screen-pad"><div class="list" id="auc-list"></div></div>
  </div>`;
  const list = document.getElementById('auc-list');
  if (!auctions.length) list.innerHTML = '<div class="empty">暂无拍卖场次</div>';
  auctions.forEach((a) => list.appendChild(auctionCard(a)));
  startCountdowns();
};

function auctionCard(a, compact = false) {
  const f = a.fossil;
  const soon = a.msLeft > 0 && a.msLeft < 6 * 3600 * 1000;
  const pc = a.status === 'ended' ? 'ended' : soon ? 'soon' : 'live';
  const pt = a.status === 'ended' ? '已结束' : soon ? '即将结束' : '进行中';
  const el = document.createElement('div');
  el.className = 'card tap';
  el.innerHTML = `
    ${photo(f, { h: compact ? 140 : 168 })}
    <div class="body">
      <div class="rowbtw"><span class="pill ${pc}">${pt}</span>
        <span class="countdown" data-ends="${a.endsAt}">${fmtCountdown(a.msLeft)}</span></div>
      <h3 style="margin-top:9px">${esc(f.name)}</h3>
      <div class="metarow"><span class="tag">${esc(f.categoryName)}</span><span class="tag">${esc(f.period)}</span></div>
      <div class="rowbtw">
        <div><div class="hint" style="margin:0">当前价 · ${a.bidCount} 次出价</div><div class="price">${yuan(a.currentBid)}</div></div>
        <button class="btn btn-gold sm">${a.status === 'ended' ? '查看' : '出价'}</button>
      </div>
    </div>`;
  el.addEventListener('click', () => openAuction(a.id));
  return el;
}

async function openAuction(id) {
  const a = await api.get('/api/auctions/' + id);
  const detail = await api.get('/api/fossils/' + a.fossilId).catch(() => null);
  const f = a.fossil;
  const ended = a.status === 'ended';
  const body = `
    ${photo(f, { h: 230, cls: 'hero-img', badge: f.rarity })}
    <h3 class="title">${esc(f.name)}</h3>
    <div class="species">${esc(f.species)}</div>
    <div class="metarow">
      <span class="tag">${esc(f.categoryName)}</span>
      <span class="tag">📅 ${esc(f.period)}</span>
      <span class="tag">📍 ${esc(f.origin)}</span>
      <span class="tag">📏 ${esc(f.size)}</span>
    </div>
    <div class="card" style="margin-top:6px"><div class="body">
      <div class="rowbtw">
        <div><div class="hint" style="margin:0">起拍 ${yuan(a.startBid)} · 当前最高</div>
          <div class="price" style="font-size:24px">${yuan(a.currentBid)}</div></div>
        <span class="countdown" data-ends="${a.endsAt}" style="font-size:16px">${fmtCountdown(a.msLeft)}</span>
      </div>
      <ul class="bidlist">
        ${a.bids.length ? [...a.bids].reverse().map((b, i) => `<li><span>${i === 0 ? '🏆 ' : ''}${esc(b.bidder)}</span><span>${yuan(b.amount)}</span></li>`).join('') : '<li><span>暂无出价</span><span>—</span></li>'}
      </ul>
    </div></div>
    ${detail ? trendBlock(detail) : ''}
    <p class="hint">${esc(f.description)}</p>
  `;
  const footer = ended
    ? `<div class="callout warn" style="margin:0">本场已结束，最终成交价 ${yuan(a.currentBid)}。</div>`
    : `<button class="btn btn-gold btn-block" id="bid-go">🔨 出价（最低 ${yuan(a.minNextBid)}）</button>`;

  openSheet(body, footer);
  if (detail) drawTrends(detail);
  startCountdowns();

  if (!ended) {
    document.getElementById('bid-go').addEventListener('click', () => openBidForm(a));
  }
}

function openBidForm(a) {
  const body = `
    <h3 class="title">出价 · ${esc(a.fossil.name)}</h3>
    <div class="callout" style="margin-top:10px">当前最高 <b>${yuan(a.currentBid)}</b>，最低出价 <b>${yuan(a.minNextBid)}</b>（加价 3%）。</div>
    <div class="field"><label>你的称呼</label><input id="bd-name" placeholder="例如：藏家小石" maxlength="20"></div>
    <div class="field"><label>出价金额（¥）</label>
      <input id="bd-amt" type="number" inputmode="numeric" min="${a.minNextBid}" step="100" value="${a.minNextBid}"></div>
    <div class="callout">需缴纳保证金 <b id="bd-dep">${yuan(a.deposit)}</b>（出价 10%，未中标全额退还）。</div>
  `;
  const footer = `<button class="btn btn-gold btn-block" id="bd-submit">缴纳保证金并出价</button>`;
  openSheet(body, footer, '出价');
  const amt = document.getElementById('bd-amt');
  const dep = document.getElementById('bd-dep');
  amt.addEventListener('input', () => (dep.textContent = yuan(Math.round((Number(amt.value) || 0) * 0.1))));
  document.getElementById('bd-submit').addEventListener('click', async () => {
    const amount = Number(amt.value);
    const deposit = Math.round(amount * 0.1);
    const btn = document.getElementById('bd-submit');
    btn.disabled = true;
    try {
      await api.post(`/api/auctions/${a.id}/bids`, { bidder: document.getElementById('bd-name').value, amount, deposit });
      toast(`出价成功！已锁定保证金 ${yuan(deposit)}`, 'ok');
      closeSheet(true);
      if (current === 'auctions') go('auctions'); else go(current);
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  });
}

// =====================================================================
// 市场 / Market
// =====================================================================
screens.market = async function () {
  const listings = await api.get('/api/listings');
  appEl.innerHTML = `
  <div class="view">
    ${appbar('市场购买', '一口价直接购买 · 查看价格走势与涨幅预测')}
    <div class="screen-pad"><div class="list" id="mk-list"></div></div>
  </div>`;
  const list = document.getElementById('mk-list');
  if (!listings.length) list.innerHTML = '<div class="empty">市场暂无在售，去「出售」上架第一件吧！</div>';
  listings.forEach((l) => list.appendChild(listingCard(l)));
};

function listingCard(l) {
  const f = l.fossil;
  const el = document.createElement('div');
  el.className = 'card tap';
  el.innerHTML = `
    ${photo(f, { h: 168, badge: f.rarity })}
    <div class="body">
      <h3>${esc(f.name)}</h3>
      <div class="species">${esc(f.species || '')}</div>
      <div class="metarow">
        <span class="tag">${esc(f.categoryName || '其他')}</span>
        ${l.condition ? `<span class="tag">品相 ${esc(l.condition)}</span>` : ''}
        <span class="tag">卖家 ${esc(l.seller)}</span>
      </div>
      <div class="rowbtw">
        <div class="price">${yuan(l.price)} <small>一口价</small></div>
        <button class="btn btn-gold sm">查看 / 购买</button>
      </div>
    </div>`;
  el.addEventListener('click', () => openListing(l));
  return el;
}

async function openListing(l) {
  const f = l.fossil;
  let detail = null;
  if (l.fossilId) detail = await api.get('/api/fossils/' + l.fossilId).catch(() => null);
  const body = `
    ${photo(f, { h: 230, cls: 'hero-img', badge: f.rarity })}
    <h3 class="title">${esc(f.name)}</h3>
    <div class="species">${esc(f.species || '')}</div>
    <div class="metarow">
      ${f.categoryName ? `<span class="tag">${esc(f.categoryName)}</span>` : ''}
      ${f.period ? `<span class="tag">📅 ${esc(f.period)}</span>` : ''}
      ${f.origin ? `<span class="tag">📍 ${esc(f.origin)}</span>` : ''}
      ${l.condition ? `<span class="tag">品相 ${esc(l.condition)}</span>` : ''}
    </div>
    <p class="hint">${esc(f.description || l.description || '')}</p>
    ${detail ? trendBlock(detail, l.price) : '<div class="callout warn">个人卖家上架，暂无系统价格走势数据。</div>'}
  `;
  const footer = `<div class="rowbtw" style="gap:12px">
      <div><div class="hint" style="margin:0">一口价</div><div class="price" style="font-size:22px">${yuan(l.price)}</div></div>
      <button class="btn btn-gold" id="buy-go" style="flex:1">🛒 立即购买</button></div>`;
  openSheet(body, footer);
  if (detail) drawTrends(detail);
  document.getElementById('buy-go').addEventListener('click', async () => {
    const btn = document.getElementById('buy-go');
    btn.disabled = true;
    try {
      const res = await api.post(`/api/listings/${l.id}/buy`, { buyer: '我' });
      toast(`购买成功！订单 ${res.orderId}，已支付 ${yuan(res.paid)}`, 'ok');
      closeSheet(true);
      go('market');
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  });
}

// price-trend + forecast + similar-item block (shared by auction & market sheets)
function trendBlock(d, buyPrice) {
  const fc = d.forecast;
  const ref = buyPrice || fc.current;
  const roi = (fc.in3y - ref) / ref;
  return `
    <div class="card" style="margin-top:8px"><div class="body">
      <h3 style="font-size:15px">📊 价格走势与涨幅预测</h3>
      <p class="hint" style="margin-top:2px">实线为历史成交参考，虚线为模型预测，阴影为乐观/保守区间。</p>
      <div class="chart-wrap" id="m-chart-price"></div>
      <div class="fc-grid">
        <div class="fc"><div class="y">1 年</div><div class="v">${yuan(fc.in1y)}</div><div class="u">${pct((fc.in1y - fc.current) / fc.current)}</div></div>
        <div class="fc"><div class="y">3 年</div><div class="v">${yuan(fc.in3y)}</div><div class="u">${pct((fc.in3y - fc.current) / fc.current)}</div></div>
        <div class="fc"><div class="y">5 年</div><div class="v">${yuan(fc.in5y)}</div><div class="u">${pct((fc.in5y - fc.current) / fc.current)}</div></div>
      </div>
      <div class="callout">若以 <b>${yuan(ref)}</b> 购入，按模型 3 年后约 <b>${yuan(fc.in3y)}</b>，预计回报 <span class="up">${pct(roi)}</span>。本品类年均涨幅 <b>${pct(fc.categoryAvgAppreciation)}</b>（${fc.sampleSize} 件同类样本）。</div>
      <h3 style="font-size:15px;margin-top:8px">🔁 同品类涨幅对比（类似品）</h3>
      <p class="hint" style="margin-top:2px">以起点=100 归一化，对比本品与品类平均。</p>
      <div class="chart-wrap" id="m-chart-cat"></div>
      ${d.comps && d.comps.length ? `<h3 style="font-size:15px;margin-top:10px">🧾 同品类成交案例</h3>${d.comps.slice(0, 3).map(comp).join('')}` : ''}
    </div></div>`;
}
function comp(c) {
  return `<div class="rowbtw" style="padding:8px 0;border-bottom:1px solid var(--line)">
    <div><b style="font-size:13px">${esc(c.fossilName)}</b><div class="hint" style="margin:0">${c.buyDate} ${yuan(c.buyPrice)} → ${c.sellDate} ${yuan(c.sellPrice)}</div></div>
    <div class="up">${pct(c.roi)}</div></div>`;
}

function drawTrends(detail) {
  const priceHost = document.getElementById('m-chart-price');
  if (priceHost && window.Charts) {
    const hist = detail.history.map((p) => ({ label: p.label, value: p.price }));
    const proj = detail.projection.map((p) => ({ label: p.label, value: p.price }));
    const projLine = [{ label: hist[hist.length - 1].label, value: hist[hist.length - 1].value }, ...proj];
    Charts.line(priceHost, {
      height: 210,
      band: {
        upper: detail.projection.map((p) => ({ label: p.label, value: p.optimistic })),
        lower: detail.projection.map((p) => ({ label: p.label, value: p.conservative })),
        color: 'rgba(212,175,55,.14)',
      },
      series: [
        { name: '历史参考', color: '#6aa6e6', points: hist },
        { name: '模型预测', color: '#d4af37', points: projLine, dashed: true, dot: false },
      ],
      showLegend: true,
    });
  }
  const catHost = document.getElementById('m-chart-cat');
  if (catHost && window.Charts && detail.categoryTrend.index.length) {
    const catIdx = detail.categoryTrend.index.map((p) => ({ label: p.label, value: p.value }));
    const h = detail.history;
    const base = h[h.length - catIdx.length] ? h[h.length - catIdx.length].price : h[0].price;
    const selfIdx = h.slice(h.length - catIdx.length).map((p) => ({ label: p.label, value: Math.round((p.price / base) * 1000) / 10 }));
    Charts.line(catHost, {
      height: 200, formatY: (v) => Math.round(v),
      series: [
        { name: '本标本', color: '#d4af37', points: selfIdx },
        { name: `品类平均（${detail.categoryName}）`, color: '#3fb98b', points: catIdx, dashed: true },
      ],
      showLegend: true,
    });
  }
}

// =====================================================================
// 出售 / Sell
// =====================================================================
screens.sell = async function () {
  const cats = await api.get('/api/categories');
  appEl.innerHTML = `
  <div class="view">
    ${appbar('我要出售', '填写信息上架到市场 · 成交收取 8% 服务费')}
    <div class="screen-pad">
      <div class="card"><div class="body">
        <div class="field"><label>化石名称 *</label><input id="s-name" placeholder="例如：摩洛哥三叶虫 立体标本" maxlength="40"></div>
        <div class="field"><label>学名 / 物种</label><input id="s-species" placeholder="Drotops megalomanicus"></div>
        <div class="two">
          <div class="field"><label>品类</label><select id="s-cat">${cats.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}</select></div>
          <div class="field"><label>售价（¥）*</label><input id="s-price" type="number" inputmode="numeric" min="1" step="50" placeholder="9800"></div>
        </div>
        <div class="two">
          <div class="field"><label>地质年代</label><input id="s-period" placeholder="泥盆纪"></div>
          <div class="field"><label>产地</label><input id="s-origin" placeholder="摩洛哥"></div>
        </div>
        <div class="two">
          <div class="field"><label>品相</label><input id="s-cond" placeholder="全品 / 展示级"></div>
          <div class="field"><label>卖家名称</label><input id="s-seller" placeholder="个人卖家" maxlength="20"></div>
        </div>
        <div class="field"><label>描述</label><textarea id="s-desc" placeholder="清修情况、有无修补、附带证书等"></textarea></div>
        <div class="callout" id="s-net">预计到账 ¥— （售价 − 8% 服务费）</div>
        <button class="btn btn-gold btn-block" id="s-submit">📤 确认上架</button>
      </div></div>
      <div class="callout" style="margin-top:14px">💡 清修质量、是否修补是溢价关键；注明产地年代更易获信任。受文物法保护的标本（如恐龙蛋）<b>禁止交易</b>。</div>
    </div>
  </div>`;

  const get = (id) => document.getElementById(id).value;
  const price = document.getElementById('s-price');
  const net = document.getElementById('s-net');
  price.addEventListener('input', () => {
    const p = Number(price.value) || 0;
    net.innerHTML = p ? `预计到账 <b>${yuan(Math.round(p * 0.92))}</b> （售价 ${yuan(p)} − 8% 服务费）` : '预计到账 ¥— （售价 − 8% 服务费）';
  });
  document.getElementById('s-submit').addEventListener('click', async () => {
    const payload = { name: get('s-name'), species: get('s-species'), category: get('s-cat'), period: get('s-period'), origin: get('s-origin'), price: get('s-price'), condition: get('s-cond'), seller: get('s-seller'), description: get('s-desc') };
    const btn = document.getElementById('s-submit');
    btn.disabled = true;
    try {
      const res = await api.post('/api/listings', payload);
      toast(`上架成功！「${res.name || payload.name}」已进入市场`, 'ok');
      go('market');
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  });
};

// =====================================================================
// 案例 / Profit cases
// =====================================================================
screens.cases = async function () {
  const sales = await api.get('/api/sales');
  const total = sales.reduce((a, s) => a + s.profit, 0);
  const best = sales[0];
  appEl.innerHTML = `
  <div class="view">
    ${appbar('赚钱案例', '真实化石买入 → 卖出的盈利复盘（演示样本）')}
    <div class="screen-pad">
      <div class="chips">
        ${chip(yuan(total), '累计盈利', true)}
        ${chip(sales.length, '已成交案例')}
        ${chip(best ? best.multiple + '×' : '—', '最高倍数', true)}
      </div>
      <div class="list" id="case-list" style="margin-top:8px"></div>
    </div>
  </div>`;
  const list = document.getElementById('case-list');
  sales.forEach((s) => list.appendChild(caseCard(s)));
};

function caseCard(s) {
  const el = document.createElement('div');
  el.className = 'card case';
  el.innerHTML = `<div class="body">
    <div class="rowbtw">
      <div style="display:flex;align-items:center;gap:10px">
        ${photo(s, { w: 52, h: 52, radius: 12 })}
        <div><h3 style="font-size:14px">${esc(s.fossilName)}</h3><div class="hint" style="margin:0">${esc(s.seller)} · 持有 ${s.years} 年</div></div>
      </div>
      <div class="roi"><span class="big">${pct(s.roi)}</span><span class="sm">年化 ${pct(s.annualized)}</span></div>
    </div>
    <div class="flow">
      <div class="leg"><div class="d">${s.buyDate} 买入</div><div class="p">${yuan(s.buyPrice)}</div></div>
      <div class="arrow">→</div>
      <div class="spark" id="spark-${s.id}"></div>
      <div class="arrow">→</div>
      <div class="leg"><div class="d">${s.sellDate} 卖出</div><div class="p" style="color:var(--green)">${yuan(s.sellPrice)}</div></div>
    </div>
    ${s.note ? `<p class="hint">💬 ${esc(s.note)}</p>` : ''}
  </div>`;
  // sparkline after attach
  setTimeout(() => {
    const host = el.querySelector('#spark-' + s.id);
    if (host && window.Charts) host.appendChild(Charts.sparkline(ramp(s.buyPrice, s.sellPrice, 8), { color: '#3fb98b', width: 96, height: 34 }));
  }, 0);
  return el;
}
function ramp(a, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1); out.push(a * Math.pow(b / a, t) * (1 + Math.sin(i * 1.7) * 0.04)); }
  out[n - 1] = b; return out;
}

// =====================================================================
// bottom sheet
// =====================================================================
let sheetOpen = false;
function openSheet(bodyHtml, footerHtml = '', title = '') {
  sheetRoot.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet">
      <div class="grab"></div>
      <div class="sheet-scroll">
        ${title ? `<h3 class="title" style="margin-top:6px">${esc(title)}</h3>` : ''}
        ${bodyHtml}
        ${footerHtml ? `<div class="sticky-buy">${footerHtml}</div>` : ''}
      </div>
    </div>`;
  const bg = sheetRoot.querySelector('.sheet-backdrop');
  const sheet = sheetRoot.querySelector('.sheet');
  bg.addEventListener('click', () => closeSheet());
  enableSwipeDown(sheet, () => closeSheet());
  requestAnimationFrame(() => { bg.classList.add('open'); sheet.classList.add('open'); });
  sheetOpen = true;
}
function closeSheet(immediate = false) {
  const bg = sheetRoot.querySelector('.sheet-backdrop');
  const sheet = sheetRoot.querySelector('.sheet');
  if (!bg || !sheet) return;
  sheetOpen = false;
  bg.classList.remove('open');
  sheet.classList.remove('open');
  setTimeout(() => { sheetRoot.innerHTML = ''; }, immediate ? 0 : 320);
}
// drag the sheet down to dismiss (native-like)
function enableSwipeDown(sheet, onClose) {
  let startY = 0, dy = 0, dragging = false;
  const scroller = sheet.querySelector('.sheet-scroll');
  sheet.addEventListener('touchstart', (e) => {
    // only start drag when content scrolled to top
    if (scroller.scrollTop > 0) return;
    startY = e.touches[0].clientY; dragging = true; dy = 0;
    sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    dy = e.touches[0].clientY - startY;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 110) onClose();
  });
}

// =====================================================================
// countdown ticker
// =====================================================================
let ticker;
function startCountdowns() {
  clearInterval(ticker);
  const tick = () => {
    const now = Date.now();
    document.querySelectorAll('[data-ends]').forEach((el) => {
      el.textContent = fmtCountdown(Number(el.dataset.ends) - now);
    });
  };
  tick();
  ticker = setInterval(tick, 1000);
}

// ---------- service worker (PWA) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ---------- boot ----------
go('home');
