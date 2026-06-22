// 化石平台前端 / Fossil platform SPA.
'use strict';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastEl = document.getElementById('toast');

// ---------- helpers ----------
const api = {
  async get(p) {
    const r = await fetch(p);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  },
  async post(p, body) {
    const r = await fetch(p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  },
};

const yuan = (n) =>
  '¥' + Math.round(Number(n)).toLocaleString('zh-CN');
const pct = (f) => (f >= 0 ? '+' : '') + (f * 100).toFixed(1) + '%';

function toast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast ' + type;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toastEl.hidden = true), 3200);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

function fmtCountdown(ms) {
  if (ms <= 0) return '已结束';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (d > 0) return `${d}天 ${h}时 ${m}分`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function thumb(f, big = false) {
  return `<div class="thumb ${big ? 'lg' : ''}">${f.icon || '🦴'}${
    f.rarity ? `<span class="rarity">${esc(f.rarity)}</span>` : ''
  }</div>`;
}

// ---------- router ----------
const routes = {};
function navigate(route) {
  if (location.hash !== '#' + route) location.hash = route;
  render();
}
window.addEventListener('hashchange', render);

function render() {
  closeModal(); // route changes should never leave a stale modal open
  const route = (location.hash.replace('#', '') || 'dashboard').split('/')[0];
  document.querySelectorAll('#tabs button').forEach((b) =>
    b.classList.toggle('active', b.dataset.route === route)
  );
  const fn = routes[route] || routes.dashboard;
  app.innerHTML = '<div class="empty">加载中…</div>';
  fn().catch((e) => {
    app.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  });
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) navigate(btn.dataset.route);
});

// =====================================================================
// 概览 / Dashboard
// =====================================================================
routes.dashboard = async function () {
  const [stats, auctions, sales, activity] = await Promise.all([
    api.get('/api/stats'),
    api.get('/api/auctions'),
    api.get('/api/sales'),
    api.get('/api/activity'),
  ]);

  const featured = auctions.slice(0, 3);
  const topCase = sales[0];

  app.innerHTML = `
  <div class="view">
    <div class="grid cols-4" style="margin-bottom:22px">
      ${statCard(stats.liveAuctions, '进行中拍卖')}
      ${statCard(stats.listings, '市场在售')}
      ${statCard(yuan(stats.totalProfit), '案例累计盈利', true)}
      ${statCard('+' + stats.avgRoiPct + '%', '案例平均回报', true)}
    </div>

    <div class="section-head"><h2>🔥 热门拍卖</h2><p>按结束时间排序</p></div>
    <div class="grid cols-3" id="dash-auctions"></div>

    <div class="grid cols-2" style="margin-top:26px">
      <div>
        <div class="section-head"><h2>📈 本周最佳案例</h2></div>
        ${topCase ? caseCard(topCase) : '<div class="empty">暂无案例</div>'}
      </div>
      <div>
        <div class="section-head"><h2>⚡ 实时动态</h2></div>
        <div class="card">
          <ul class="activity">
            ${
              activity.length
                ? activity.map(activityItem).join('')
                : '<li>暂无动态，去出个价吧！</li>'
            }
          </ul>
        </div>
      </div>
    </div>
  </div>`;

  const host = document.getElementById('dash-auctions');
  featured.forEach((a) => host.appendChild(auctionCardEl(a)));
  startCountdowns();
};

function statCard(num, lbl, green = false) {
  return `<div class="card stat"><div class="num ${green ? 'green' : ''}">${num}</div><div class="lbl">${lbl}</div></div>`;
}

function activityItem(a) {
  const icon = { bid: '🔨', list: '📤', buy: '🛒' }[a.type] || '•';
  return `<li>${icon} <b>${esc(a.text)}</b></li>`;
}

// =====================================================================
// 拍卖行 / Auctions
// =====================================================================
routes.auctions = async function () {
  const auctions = await api.get('/api/auctions');
  app.innerHTML = `
  <div class="view">
    <div class="section-head">
      <div><h2>🔨 拍卖行</h2><p>缴纳保证金即可出价 · 临近结束时出价将自动延时 5 分钟（防狙击）</p></div>
    </div>
    <div class="grid cols-3" id="auc-grid"></div>
  </div>`;
  const grid = document.getElementById('auc-grid');
  if (!auctions.length) grid.innerHTML = '<div class="empty">暂无拍卖场次</div>';
  auctions.forEach((a) => grid.appendChild(auctionCardEl(a)));
  startCountdowns();
};

function auctionCardEl(a) {
  const div = document.createElement('div');
  div.className = 'card click';
  const f = a.fossil;
  const soon = a.msLeft > 0 && a.msLeft < 6 * 3600 * 1000;
  const pillCls = a.status === 'ended' ? 'ended' : soon ? 'soon' : 'live';
  const pillTxt = a.status === 'ended' ? '已结束' : soon ? '即将结束' : '进行中';
  div.innerHTML = `
    ${thumb(f)}
    <div class="row" style="margin-top:12px">
      <span class="pill ${pillCls}">${pillTxt}</span>
      <span class="countdown" data-ends="${a.endsAt}">${fmtCountdown(a.msLeft)}</span>
    </div>
    <h3>${esc(f.name)}</h3>
    <div class="species">${esc(f.species)}</div>
    <div class="meta"><span class="tag">${esc(f.categoryName)}</span><span class="tag">${esc(f.period)}</span></div>
    <div class="row" style="margin-top:6px">
      <div><div class="lbl" style="font-size:11.5px;color:var(--muted)">当前价 · ${a.bidCount} 次出价</div><div class="price">${yuan(a.currentBid)}</div></div>
      <button class="btn btn-gold">${a.status === 'ended' ? '查看' : '出价'}</button>
    </div>`;
  div.addEventListener('click', () => openAuction(a.id));
  return div;
}

async function openAuction(id) {
  const a = await api.get('/api/auctions/' + id);
  const detail = await api.get('/api/fossils/' + a.fossilId);
  const f = a.fossil;
  const ended = a.status === 'ended';

  openModal(`
    <div class="modal-split">
      <div>
        ${thumb(f, true)}
        <h3 style="margin-top:14px">${esc(f.name)}</h3>
        <div class="species">${esc(f.species)}</div>
        <div class="meta">
          <span class="tag">${esc(f.categoryName)}</span>
          <span class="tag">📅 ${esc(f.period)}</span>
          <span class="tag">📍 ${esc(f.origin)}</span>
          <span class="tag">📏 ${esc(f.size)}</span>
          <span class="tag">⭐ ${esc(f.grade)}</span>
        </div>
        <p style="font-size:13.5px;color:var(--muted)">${esc(f.description)}</p>
        <div class="callout">
          📈 该品类年均涨幅约 <b>${pct(detail.forecast.categoryAvgAppreciation)}</b>，
          本标本模型涨幅 <b>${pct(f.appreciation)}</b>
          （${f.appreciation >= detail.forecast.categoryAvgAppreciation
            ? '<span class="delta-up">跑赢品类</span>'
            : '<span class="delta-down">低于品类</span>'}）。
        </div>
      </div>
      <div>
        <div class="card">
          <div class="row">
            <div><div class="lbl" style="color:var(--muted);font-size:12px">起拍价 ${yuan(a.startBid)} · 当前最高</div>
            <div class="price" style="font-size:26px">${yuan(a.currentBid)}</div></div>
            <span class="countdown" data-ends="${a.endsAt}" style="font-size:18px">${fmtCountdown(a.msLeft)}</span>
          </div>

          <ul class="bidlist">
            ${
              a.bids.length
                ? [...a.bids].reverse().map((b, i) =>
                    `<li><span>${i === 0 ? '🏆 ' : ''}${esc(b.bidder)}</span><span>${yuan(b.amount)}</span></li>`
                  ).join('')
                : '<li><span>暂无出价</span><span>—</span></li>'
            }
          </ul>

          ${
            ended
              ? `<div class="callout warn">本场已结束。最终成交价 ${yuan(a.currentBid)}。</div>`
              : `
            <div class="field">
              <label>你的称呼</label>
              <input id="bid-name" placeholder="例如：藏家小石" maxlength="20" />
            </div>
            <div class="field">
              <label>出价金额（≥ ${yuan(a.minNextBid)}）</label>
              <input id="bid-amount" type="number" min="${a.minNextBid}" step="100" value="${a.minNextBid}" />
              <div class="hint">需缴纳保证金 <b id="dep-amt">${yuan(a.deposit)}</b>（出价的 10%，未中标全额退还）</div>
            </div>
            <button class="btn btn-gold btn-block" id="bid-submit">🔨 缴纳保证金并出价</button>`
          }
        </div>
      </div>
    </div>
  `, '拍卖详情');

  drawTrendCharts(detail);
  startCountdowns();

  if (!ended) {
    const amountEl = document.getElementById('bid-amount');
    const depEl = document.getElementById('dep-amt');
    amountEl.addEventListener('input', () => {
      const v = Number(amountEl.value) || 0;
      depEl.textContent = yuan(Math.round(v * 0.1));
    });
    document.getElementById('bid-submit').addEventListener('click', async () => {
      const bidder = document.getElementById('bid-name').value;
      const amount = Number(amountEl.value);
      const deposit = Math.round(amount * 0.1);
      const btn = document.getElementById('bid-submit');
      btn.disabled = true;
      try {
        await api.post(`/api/auctions/${id}/bids`, { bidder, amount, deposit });
        toast(`出价成功！已锁定保证金 ${yuan(deposit)}`, 'ok');
        closeModal();
        openAuction(id);
      } catch (e) {
        toast(e.message, 'err');
        btn.disabled = false;
      }
    });
  }
}

// =====================================================================
// 市场购买 / Marketplace (buy)
// =====================================================================
routes.market = async function () {
  const listings = await api.get('/api/listings');
  app.innerHTML = `
  <div class="view">
    <div class="section-head">
      <div><h2>🛒 市场购买</h2><p>一口价直接购买 · 点击查看价格走势与涨幅预测</p></div>
    </div>
    <div class="grid cols-3" id="mk-grid"></div>
  </div>`;
  const grid = document.getElementById('mk-grid');
  if (!listings.length) grid.innerHTML = '<div class="empty">市场暂无在售，去「我要出售」上架第一件吧！</div>';
  listings.forEach((l) => grid.appendChild(listingCardEl(l)));
};

function listingCardEl(l) {
  const f = l.fossil;
  const div = document.createElement('div');
  div.className = 'card click';
  div.innerHTML = `
    ${thumb(f)}
    <h3>${esc(f.name)}</h3>
    <div class="species">${esc(f.species || '')}</div>
    <div class="meta">
      <span class="tag">${esc(f.categoryName || '其他')}</span>
      ${l.condition ? `<span class="tag">品相 ${esc(l.condition)}</span>` : ''}
      <span class="tag">卖家 ${esc(l.seller)}</span>
    </div>
    <div class="row" style="margin-top:6px">
      <div class="price">${yuan(l.price)} <small>一口价</small></div>
      <button class="btn btn-gold">查看 / 购买</button>
    </div>`;
  div.addEventListener('click', () => openListing(l));
  return div;
}

async function openListing(l) {
  const f = l.fossil;
  // custom (user) listings have no analytics; platform fossils do.
  let detail = null;
  if (l.fossilId) {
    try { detail = await api.get('/api/fossils/' + l.fossilId); } catch {}
  }

  openModal(`
    <div class="modal-split">
      <div>
        ${thumb(f, true)}
        <h3 style="margin-top:14px">${esc(f.name)}</h3>
        <div class="species">${esc(f.species || '')}</div>
        <div class="meta">
          ${f.categoryName ? `<span class="tag">${esc(f.categoryName)}</span>` : ''}
          ${f.period ? `<span class="tag">📅 ${esc(f.period)}</span>` : ''}
          ${f.origin ? `<span class="tag">📍 ${esc(f.origin)}</span>` : ''}
          ${l.condition ? `<span class="tag">品相 ${esc(l.condition)}</span>` : ''}
        </div>
        <p style="font-size:13.5px;color:var(--muted)">${esc(f.description || l.description || '')}</p>
        <div class="card" style="margin-top:8px">
          <div class="row">
            <div><div class="lbl" style="color:var(--muted);font-size:12px">一口价</div><div class="price" style="font-size:26px">${yuan(l.price)}</div></div>
            <button class="btn btn-gold" id="buy-btn">🛒 立即购买</button>
          </div>
          <div class="hint" style="margin-top:8px">点击购买将模拟支付流程（原型演示，不会真实扣款）。</div>
        </div>
      </div>
      <div id="buy-analytics"></div>
    </div>
  `, '商品详情');

  const aHost = document.getElementById('buy-analytics');
  if (detail) {
    aHost.innerHTML = forecastPanel(detail, l.price);
    drawTrendCharts(detail);
  } else {
    aHost.innerHTML = `<div class="callout warn">该商品由个人卖家上架，暂无系统价格走势数据。建议参考同品类「赚钱案例」与市场行情自行评估。</div>`;
  }

  document.getElementById('buy-btn').addEventListener('click', async () => {
    const btn = document.getElementById('buy-btn');
    btn.disabled = true;
    try {
      const res = await api.post(`/api/listings/${l.id}/buy`, { buyer: '我' });
      toast(`购买成功！订单号 ${res.orderId}，已支付 ${yuan(res.paid)}`, 'ok');
      closeModal();
      navigate('market');
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
    }
  });
}

// Forecast panel shown when buying a platform fossil.
function forecastPanel(d, buyPrice) {
  const fc = d.forecast;
  const proj3 = fc.in3y;
  const gainIfBuy = proj3 - buyPrice;
  const roiIfBuy = gainIfBuy / buyPrice;
  return `
    <div class="card">
      <h4 style="margin-bottom:6px">📊 价格走势与涨幅预测</h4>
      <p class="hint" style="margin-top:0">实线为历史成交参考，虚线为模型预测，阴影为乐观/保守区间。</p>
      <div class="chart-wrap" id="chart-price"></div>

      <div class="forecast-grid">
        <div class="fc"><div class="yr">1 年后</div><div class="v">${yuan(fc.in1y)}</div><div class="up">${pct((fc.in1y - fc.current) / fc.current)}</div></div>
        <div class="fc"><div class="yr">3 年后</div><div class="v">${yuan(fc.in3y)}</div><div class="up">${pct((fc.in3y - fc.current) / fc.current)}</div></div>
        <div class="fc"><div class="yr">5 年后</div><div class="v">${yuan(fc.in5y)}</div><div class="up">${pct((fc.in5y - fc.current) / fc.current)}</div></div>
      </div>

      <div class="callout">
        若以当前价 <b>${yuan(buyPrice)}</b> 购入，按模型 3 年后约 <b>${yuan(proj3)}</b>，
        预计回报 <span class="delta-up">${pct(roiIfBuy)}</span>。
        本品类年均涨幅 <b>${pct(fc.categoryAvgAppreciation)}</b>（共 ${fc.sampleSize} 件同类样本）。
      </div>

      <h4 style="margin:16px 0 6px">🔁 同品类涨幅趋势（类似品对比）</h4>
      <p class="hint" style="margin-top:0">以起点 = 100 归一化，对比本品与品类平均的相对涨幅。</p>
      <div class="chart-wrap" id="chart-category"></div>

      ${
        d.comps && d.comps.length
          ? `<h4 style="margin:16px 0 8px">🧾 同品类已成交案例</h4>${d.comps
              .slice(0, 3)
              .map(compRow)
              .join('')}`
          : ''
      }
    </div>`;
}

function compRow(c) {
  return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
    <div><b>${esc(c.fossilName)}</b><div class="hint">${c.buyDate} 买入 ${yuan(c.buyPrice)} → ${c.sellDate} 卖出 ${yuan(c.sellPrice)}</div></div>
    <div class="delta-up">${pct(c.roi)}</div>
  </div>`;
}

// Draw historical+projection price chart and the category-normalised chart.
function drawTrendCharts(detail) {
  const priceHost = document.getElementById('chart-price');
  if (priceHost && window.Charts) {
    const hist = detail.history.map((p) => ({ label: p.label, value: p.price }));
    const proj = detail.projection.map((p) => ({ label: p.label, value: p.price }));
    // connect history end to projection start
    const projLine = [{ label: hist[hist.length - 1].label, value: hist[hist.length - 1].value }, ...proj];
    Charts.line(priceHost, {
      height: 240,
      band: {
        upper: detail.projection.map((p) => ({ label: p.label, value: p.optimistic })),
        lower: detail.projection.map((p) => ({ label: p.label, value: p.conservative })),
        color: 'rgba(212,175,55,.14)',
      },
      series: [
        { name: '历史成交参考', color: '#6aa6e6', points: hist },
        { name: '模型预测', color: '#d4af37', points: projLine, dashed: true, dot: false },
      ],
      showLegend: true,
    });
  }

  const catHost = document.getElementById('chart-category');
  if (catHost && window.Charts && detail.categoryTrend.index.length) {
    const catIdx = detail.categoryTrend.index.map((p) => ({ label: p.label, value: p.value }));
    // normalise this fossil's own history to start=100 for fair comparison
    const h = detail.history;
    const base = h[h.length - catIdx.length] ? h[h.length - catIdx.length].price : h[0].price;
    const selfIdx = h.slice(h.length - catIdx.length).map((p) => ({
      label: p.label,
      value: Math.round((p.price / base) * 1000) / 10,
    }));
    Charts.line(catHost, {
      height: 220,
      formatY: (v) => Math.round(v),
      series: [
        { name: '本标本', color: '#d4af37', points: selfIdx },
        { name: `品类平均（${detail.categoryName}）`, color: '#3fb98b', points: catIdx, dashed: true },
      ],
      showLegend: true,
    });
  }
}

// =====================================================================
// 我要出售 / Sell (create listing)
// =====================================================================
routes.sell = async function () {
  const cats = await api.get('/api/categories');
  app.innerHTML = `
  <div class="view">
    <div class="section-head">
      <div><h2>📤 我要出售</h2><p>填写化石信息上架到市场 · 成交后平台收取 8% 服务费</p></div>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <div class="field"><label>化石名称 *</label><input id="s-name" placeholder="例如：摩洛哥三叶虫 立体标本" maxlength="40" /></div>
        <div class="form-row">
          <div class="field"><label>学名 / 物种</label><input id="s-species" placeholder="Drotops megalomanicus" /></div>
          <div class="field"><label>品类</label>
            <select id="s-cat">${cats.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="field"><label>地质年代</label><input id="s-period" placeholder="泥盆纪 (约 3.9 亿年前)" /></div>
          <div class="field"><label>产地</label><input id="s-origin" placeholder="摩洛哥" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>售价（¥）*</label><input id="s-price" type="number" min="1" step="50" placeholder="9800" /></div>
          <div class="field"><label>品相</label><input id="s-cond" placeholder="全品 / 展示级" /></div>
        </div>
        <div class="field"><label>卖家名称</label><input id="s-seller" placeholder="个人卖家" maxlength="20" /></div>
        <div class="field"><label>描述</label><textarea id="s-desc" placeholder="清修情况、有无修补、附带证书等"></textarea></div>
        <button class="btn btn-gold btn-block" id="s-submit">📤 确认上架</button>
      </div>
      <div>
        <div class="card">
          <h4>实时预览</h4>
          <div id="s-preview" style="margin-top:12px"></div>
        </div>
        <div class="card" style="margin-top:16px">
          <h4>💡 上架小贴士</h4>
          <ul style="color:var(--muted);font-size:13px;padding-left:18px;line-height:1.8">
            <li>清修质量与是否修补，是化石溢价的关键。</li>
            <li>注明产地与年代，更易获得买家信任。</li>
            <li>受文物法保护的标本（如中国恐龙蛋/重要脊椎动物化石）<b>禁止交易</b>。</li>
            <li>到账 = 售价 × (1 − 8% 服务费)。</li>
          </ul>
        </div>
      </div>
    </div>
  </div>`;

  const ids = ['s-name', 's-species', 's-cat', 's-period', 's-origin', 's-price', 's-cond', 's-seller', 's-desc'];
  const get = (id) => document.getElementById(id).value;
  function preview() {
    const price = Number(get('s-price')) || 0;
    const catOpt = document.querySelector('#s-cat option:checked');
    const icon = catOpt ? catOpt.textContent.trim().split(' ')[0] : '🦴';
    document.getElementById('s-preview').innerHTML = `
      <div class="card">
        <div class="thumb">${icon}</div>
        <h3>${esc(get('s-name') || '（未命名化石）')}</h3>
        <div class="species">${esc(get('s-species'))}</div>
        <div class="meta"><span class="tag">${esc(catOpt ? catOpt.textContent.replace(/^\S+\s/, '') : '')}</span>${get('s-cond') ? `<span class="tag">品相 ${esc(get('s-cond'))}</span>` : ''}</div>
        <div class="price">${price ? yuan(price) : '¥—'} <small>一口价</small></div>
        <div class="hint">预计到账 ${price ? yuan(Math.round(price * 0.92)) : '¥—'}</div>
      </div>`;
  }
  ids.forEach((id) => document.getElementById(id).addEventListener('input', preview));
  preview();

  document.getElementById('s-submit').addEventListener('click', async () => {
    const payload = {
      name: get('s-name'),
      species: get('s-species'),
      category: get('s-cat'),
      period: get('s-period'),
      origin: get('s-origin'),
      price: get('s-price'),
      condition: get('s-cond'),
      seller: get('s-seller'),
      description: get('s-desc'),
    };
    const btn = document.getElementById('s-submit');
    btn.disabled = true;
    try {
      const res = await api.post('/api/listings', payload);
      toast(`上架成功！「${res.name || payload.name}」已进入市场`, 'ok');
      navigate('market');
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
    }
  });
};

// =====================================================================
// 赚钱案例 / Profit cases
// =====================================================================
routes.cases = async function () {
  const sales = await api.get('/api/sales');
  const totalProfit = sales.reduce((a, s) => a + s.profit, 0);
  const best = sales[0];
  app.innerHTML = `
  <div class="view">
    <div class="section-head">
      <div><h2>📈 赚钱案例</h2><p>真实化石买入 → 卖出的盈利复盘（数据为演示样本）</p></div>
    </div>
    <div class="grid cols-3" style="margin-bottom:22px">
      ${statCard(yuan(totalProfit), '累计盈利', true)}
      ${statCard(sales.length, '已成交案例')}
      ${statCard(best ? best.multiple + '×' : '—', '最高倍数', true)}
    </div>
    <div class="grid cols-2" id="case-grid"></div>
  </div>`;
  const grid = document.getElementById('case-grid');
  sales.forEach((s) => {
    const div = document.createElement('div');
    div.className = 'card case';
    div.innerHTML = caseCardInner(s);
    grid.appendChild(div);
    const sp = div.querySelector('.spark-host');
    if (sp && window.Charts) {
      // build a smooth buy->sell ramp as a visual
      const pts = rampSeries(s.buyPrice, s.sellPrice, 8);
      sp.appendChild(Charts.sparkline(pts, { color: '#3fb98b', width: 150, height: 40 }));
    }
  });
};

function rampSeries(a, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const wob = 1 + Math.sin(i * 1.7) * 0.04;
    out.push(a * Math.pow(b / a, t) * wob);
  }
  out[n - 1] = b;
  return out;
}

function caseCard(s) {
  return `<div class="card case">${caseCardInner(s)}</div>`;
}

function caseCardInner(s) {
  return `
    <div class="row">
      <div class="row" style="gap:10px">
        <div class="thumb" style="width:54px;height:54px;font-size:26px;flex:none">${s.icon}</div>
        <div><h3 style="font-size:15px">${esc(s.fossilName)}</h3><div class="hint">${esc(s.seller)} · 持有 ${s.years} 年</div></div>
      </div>
      <div class="roi-badge"><span class="big">${pct(s.roi)}</span><span class="sm">年化 ${pct(s.annualized)}</span></div>
    </div>
    <div class="flow">
      <div class="leg"><div class="d">${s.buyDate} 买入</div><div class="p">${yuan(s.buyPrice)}</div></div>
      <div class="arrow">→</div>
      <div class="spark-host" style="flex:1.2;display:flex;justify-content:center"></div>
      <div class="arrow">→</div>
      <div class="leg"><div class="d">${s.sellDate} 卖出</div><div class="p" style="color:var(--green)">${yuan(s.sellPrice)}</div></div>
    </div>
    <div class="row">
      <span class="tag">净赚 <b class="delta-up">${yuan(s.profit)}</b></span>
      <span class="tag">${s.multiple}× 倍数</span>
    </div>
    ${s.note ? `<p class="hint" style="margin-top:8px">💬 ${esc(s.note)}</p>` : ''}`;
}

// =====================================================================
// modal + countdowns
// =====================================================================
function openModal(html, title = '') {
  modalRoot.innerHTML = `
    <div class="modal-bg">
      <div class="modal">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="close">×</button></div>
        <div class="modal-body">${html}</div>
      </div>
    </div>`;
  modalRoot.querySelector('.close').addEventListener('click', closeModal);
  modalRoot.querySelector('.modal-bg').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-bg')) closeModal();
  });
}
function closeModal() {
  modalRoot.innerHTML = '';
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// live countdown ticker for any [data-ends] element on the page
let tickTimer = null;
function startCountdowns() {
  if (tickTimer) clearInterval(tickTimer);
  const tick = () => {
    const now = Date.now();
    document.querySelectorAll('[data-ends]').forEach((el) => {
      const ms = Number(el.dataset.ends) - now;
      el.textContent = fmtCountdown(ms);
      if (ms <= 0) el.textContent = '已结束';
    });
  };
  tick();
  tickTimer = setInterval(tick, 1000);
}

// ---------- boot ----------
render();
