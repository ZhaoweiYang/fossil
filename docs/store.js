// 平台状态与业务逻辑 / In-memory platform state + business rules.
// State is seeded from data.js and mutated by the API. It resets on restart
// (prototype scope) — swap this module for a DB layer to persist.

import {
  FOSSILS,
  CATEGORIES,
  SALES,
  AUCTION_SEED,
  LISTING_SEED,
  imageFor,
} from './data.js';
import {
  priceHistory,
  projection,
  categoryTrend,
  computeReturn,
  forecastSummary,
} from './analytics.js';

const HOUR = 3600 * 1000;

// Minimum legal bid increment as a fraction of the current price.
const BID_INCREMENT_PCT = 0.03;
// Deposit (保证金) required to bid, as a fraction of the bid amount.
export const DEPOSIT_PCT = 0.1;
// Platform fee charged to sellers on a completed sale.
const SELLER_FEE_PCT = 0.08;

let seq = 1000;
const nextId = (prefix) => `${prefix}-${++seq}`;

// ---- mutable state ----------------------------------------------------
const state = {
  auctions: [],
  listings: [],
  sales: SALES.map((s) => ({ ...s })),
  activity: [], // recent platform events (bids, buys, listings)
};

export function fossilById(id) {
  return FOSSILS.find((f) => f.id === id) || null;
}

function logActivity(type, text) {
  state.activity.unshift({ type, text, at: Date.now() });
  state.activity = state.activity.slice(0, 30);
}

// ---- init -------------------------------------------------------------
function init() {
  const now = Date.now();
  state.auctions = AUCTION_SEED.map((a, i) => {
    const fossil = fossilById(a.fossilId);
    const bids = a.bids.map((b, j) => ({
      id: nextId('bid'),
      bidder: b.bidder,
      amount: b.amount,
      at: now - (a.bids.length - j) * 7 * 60 * 1000,
    }));
    const currentBid = bids.length ? bids[bids.length - 1].amount : a.startBid;
    return {
      id: `auc-${String(i + 1).padStart(3, '0')}`,
      fossilId: a.fossilId,
      startBid: a.startBid,
      currentBid,
      bids,
      endsAt: now + a.endsInHours * HOUR,
      status: 'live',
    };
  });

  state.listings = LISTING_SEED.map((l, i) => ({
    id: `lst-${String(i + 1).padStart(3, '0')}`,
    fossilId: l.fossilId,
    seller: l.seller,
    price: l.price,
    condition: l.condition,
    status: 'active',
    custom: false,
    createdAt: now - (LISTING_SEED.length - i) * HOUR,
  }));
}
init();

// ---- serialization helpers -------------------------------------------
function fossilCard(fossil) {
  return {
    id: fossil.id,
    name: fossil.name,
    species: fossil.species,
    category: fossil.category,
    categoryName: CATEGORIES[fossil.category]?.name ?? fossil.category,
    period: fossil.period,
    origin: fossil.origin,
    size: fossil.size,
    grade: fossil.grade,
    rarity: fossil.rarity,
    icon: fossil.icon,
    image: imageFor(fossil.id, 800),
    basePrice: fossil.basePrice,
    appreciation: fossil.appreciation,
    description: fossil.description,
    restricted: !!fossil.restricted,
  };
}

function refreshAuctionStatus(a) {
  if (a.status === 'live' && Date.now() >= a.endsAt) a.status = 'ended';
  return a;
}

function auctionView(a) {
  refreshAuctionStatus(a);
  const fossil = fossilById(a.fossilId);
  const minNextBid = Math.ceil(a.currentBid * (1 + BID_INCREMENT_PCT));
  return {
    ...a,
    fossil: fossilCard(fossil),
    bidCount: a.bids.length,
    minNextBid,
    deposit: Math.round(minNextBid * DEPOSIT_PCT),
    msLeft: Math.max(0, a.endsAt - Date.now()),
  };
}

function listingView(l) {
  const fossil = fossilById(l.fossilId);
  return {
    ...l,
    fossil: fossil ? fossilCard(fossil) : { name: l.name, icon: l.icon, categoryName: l.categoryName },
  };
}

// ---- queries ----------------------------------------------------------
export function getCategories() {
  return Object.entries(CATEGORIES).map(([id, c]) => ({ id, ...c }));
}

export function getFossils() {
  return FOSSILS.map(fossilCard);
}

export function getFossilDetail(id) {
  const fossil = fossilById(id);
  if (!fossil) return null;
  return {
    ...fossilCard(fossil),
    history: priceHistory(fossil),
    projection: projection(fossil),
    forecast: forecastSummary(fossil),
    categoryTrend: categoryTrend(fossil.category),
    // realised comps from the same category, as supporting evidence
    comps: state.sales
      .filter((s) => s.category === fossil.category)
      .map(saleView),
  };
}

export function getAuctions() {
  return state.auctions.map(auctionView).sort((a, b) => a.msLeft - b.msLeft);
}

export function getAuction(id) {
  const a = state.auctions.find((x) => x.id === id);
  return a ? auctionView(a) : null;
}

export function getListings() {
  return state.listings
    .filter((l) => l.status === 'active')
    .map(listingView)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function saleView(s) {
  const r = computeReturn(s.buyPrice, s.sellPrice, s.buyDate, s.sellDate);
  return { ...s, image: imageFor(s.id, 400), ...r };
}

export function getSales() {
  return state.sales
    .map(saleView)
    .sort((a, b) => b.annualized - a.annualized);
}

export function getCategoryTrend(category) {
  return categoryTrend(category);
}

export function getActivity() {
  return state.activity.slice(0, 12);
}

export function getStats() {
  const sales = getSales();
  const totalProfit = sales.reduce((a, s) => a + s.profit, 0);
  const avgRoi = sales.reduce((a, s) => a + s.roi, 0) / (sales.length || 1);
  const liveAuctions = state.auctions.filter(
    (a) => refreshAuctionStatus(a).status === 'live'
  ).length;
  const gmv = state.auctions.reduce((a, x) => a + x.currentBid, 0);
  return {
    fossils: FOSSILS.length,
    liveAuctions,
    listings: state.listings.filter((l) => l.status === 'active').length,
    closedCases: sales.length,
    totalProfit,
    avgRoiPct: Math.round(avgRoi * 1000) / 10,
    bestMultiple: Math.max(...sales.map((s) => s.multiple)),
    auctionGmv: gmv,
  };
}

// ---- mutations --------------------------------------------------------
export class RuleError extends Error {}

// 付款拍卖：出价 + 缴纳保证金 / Place a bid (validates increment, requires deposit).
export function placeBid(auctionId, { bidder, amount, deposit }) {
  const a = state.auctions.find((x) => x.id === auctionId);
  if (!a) throw new RuleError('拍卖场次不存在');
  refreshAuctionStatus(a);
  if (a.status !== 'live') throw new RuleError('该场次已结束，无法出价');

  bidder = (bidder || '').trim() || '匿名藏家';
  amount = Number(amount);
  if (!Number.isFinite(amount) || amount <= 0)
    throw new RuleError('出价金额无效');

  const minNext = Math.ceil(a.currentBid * (1 + BID_INCREMENT_PCT));
  if (amount < minNext)
    throw new RuleError(
      `出价需 ≥ ¥${minNext.toLocaleString()}（当前价加价幅度 ${Math.round(
        BID_INCREMENT_PCT * 100
      )}%）`
    );

  const requiredDeposit = Math.round(amount * DEPOSIT_PCT);
  if (Number(deposit) < requiredDeposit)
    throw new RuleError(
      `需缴纳保证金 ¥${requiredDeposit.toLocaleString()}（出价的 ${Math.round(
        DEPOSIT_PCT * 100
      )}%）`
    );

  const bid = { id: nextId('bid'), bidder, amount, at: Date.now() };
  a.bids.push(bid);
  a.currentBid = amount;
  // an active bidding war extends a near-closing auction by 5 min (anti-sniping)
  if (a.endsAt - Date.now() < 5 * 60 * 1000) a.endsAt += 5 * 60 * 1000;

  const fossil = fossilById(a.fossilId);
  logActivity('bid', `${bidder} 对「${fossil.name}」出价 ¥${amount.toLocaleString()}`);
  return auctionView(a);
}

// 上架出售 / Create a fixed-price marketplace listing.
export function createListing(payload) {
  const name = (payload.name || '').trim();
  const price = Number(payload.price);
  if (name.length < 2) throw new RuleError('请填写化石名称（≥2 字）');
  if (!Number.isFinite(price) || price <= 0) throw new RuleError('请填写有效售价');
  const category = CATEGORIES[payload.category] ? payload.category : null;

  const listing = {
    id: nextId('lst'),
    fossilId: null,
    custom: true,
    name,
    species: (payload.species || '').trim(),
    category,
    categoryName: category ? CATEGORIES[category].name : (payload.categoryName || '其他'),
    icon: category ? CATEGORIES[category].icon : '🦴',
    period: (payload.period || '').trim(),
    origin: (payload.origin || '').trim(),
    condition: (payload.condition || '未注明').trim(),
    description: (payload.description || '').trim(),
    seller: (payload.seller || '').trim() || '个人卖家',
    price,
    feePct: SELLER_FEE_PCT,
    estNet: Math.round(price * (1 - SELLER_FEE_PCT)),
    status: 'active',
    createdAt: Date.now(),
  };
  state.listings.push(listing);
  logActivity('list', `${listing.seller} 上架「${name}」售价 ¥${price.toLocaleString()}`);
  return listingView(listing);
}

// 购买在售品（模拟支付）/ Buy a fixed-price listing (simulated payment).
export function buyListing(listingId, { buyer } = {}) {
  const l = state.listings.find((x) => x.id === listingId);
  if (!l) throw new RuleError('商品不存在');
  if (l.status !== 'active') throw new RuleError('该商品已售出或下架');
  l.status = 'sold';
  l.buyer = (buyer || '').trim() || '买家';
  l.soldAt = Date.now();
  const name = l.custom ? l.name : fossilById(l.fossilId)?.name;
  logActivity('buy', `${l.buyer} 购买「${name}」¥${l.price.toLocaleString()}`);
  return { ok: true, orderId: nextId('ord'), listing: listingView(l), paid: l.price };
}

// for tests
export function _reset() {
  state.auctions = [];
  state.listings = [];
  state.sales = SALES.map((s) => ({ ...s }));
  state.activity = [];
  seq = 1000;
  init();
}
