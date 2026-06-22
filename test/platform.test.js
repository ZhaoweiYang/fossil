// 平台业务逻辑测试 / Backend logic tests (node:test, zero deps).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getFossils,
  getFossilDetail,
  getAuctions,
  getListings,
  getSales,
  getStats,
  placeBid,
  createListing,
  buyListing,
  RuleError,
  _reset,
} from '../src/store.js';
import { computeReturn, priceHistory, projection, categoryTrend } from '../src/analytics.js';
import { FOSSILS } from '../src/data.js';

test('catalog and detail load with analytics', () => {
  _reset();
  const fossils = getFossils();
  assert.ok(fossils.length >= 10, 'has a catalog');

  const d = getFossilDetail(fossils[0].id);
  assert.ok(d.history.length > 1, 'history series exists');
  assert.ok(d.projection.length > 1, 'projection series exists');
  // last historical point pins to the quoted current value
  assert.equal(d.history[d.history.length - 1].price, d.basePrice);
  // forecast moves up over time
  assert.ok(d.forecast.in5y > d.forecast.in1y);
  assert.ok(d.forecast.in1y > d.forecast.current);
});

test('projection band brackets the central estimate', () => {
  const f = FOSSILS.find((x) => x.category === 'dinoTooth');
  const p = projection(f, 3);
  for (const pt of p) {
    assert.ok(pt.optimistic >= pt.price, 'optimistic >= central');
    assert.ok(pt.conservative <= pt.price, 'conservative <= central');
  }
});

test('category trend normalises to 100 and reports sample size', () => {
  const t = categoryTrend('ammonite');
  assert.equal(t.index[0].value, 100, 'index starts at 100');
  assert.ok(t.sampleSize >= 2, 'aggregates multiple peers');
  assert.ok(t.avgAppreciation > 0);
});

test('computeReturn maths (ROI, multiple, annualized)', () => {
  const r = computeReturn(10000, 20000, '2020-01', '2024-01');
  assert.equal(r.profit, 10000);
  assert.equal(r.roi, 1); // +100%
  assert.equal(r.multiple, 2);
  assert.equal(r.months, 48);
  // doubling over 4y => ~18.9% annualized
  assert.ok(Math.abs(r.annualized - 0.1892) < 0.01);
});

test('sales are returned with computed returns, sorted by annualized', () => {
  const sales = getSales();
  assert.ok(sales.length > 0);
  for (const s of sales) {
    assert.equal(s.profit, s.sellPrice - s.buyPrice);
    assert.ok(s.roi > 0);
  }
  for (let i = 1; i < sales.length; i++) {
    assert.ok(sales[i - 1].annualized >= sales[i].annualized, 'sorted desc');
  }
});

test('placeBid enforces increment and deposit, then updates price', () => {
  _reset();
  const auction = getAuctions()[0];
  const tooLow = Math.floor(auction.currentBid * 1.01);

  assert.throws(
    () => placeBid(auction.id, { bidder: 'A', amount: tooLow, deposit: tooLow }),
    RuleError,
    'rejects below min increment'
  );

  const ok = auction.minNextBid;
  assert.throws(
    () => placeBid(auction.id, { bidder: 'A', amount: ok, deposit: 0 }),
    RuleError,
    'rejects insufficient deposit'
  );

  const updated = placeBid(auction.id, {
    bidder: '测试藏家',
    amount: ok,
    deposit: Math.round(ok * 0.1),
  });
  assert.equal(updated.currentBid, ok);
  assert.equal(updated.bids[updated.bids.length - 1].bidder, '测试藏家');
});

test('createListing validates and appears in marketplace', () => {
  _reset();
  const before = getListings().length;

  assert.throws(() => createListing({ name: 'x', price: 100 }), RuleError, 'name too short');
  assert.throws(() => createListing({ name: '完整三叶虫', price: -5 }), RuleError, 'bad price');

  const created = createListing({
    name: '测试菊石标本',
    category: 'ammonite',
    price: 3000,
    seller: '单元测试',
  });
  assert.equal(created.custom, true);
  assert.equal(created.estNet, Math.round(3000 * 0.92), 'seller fee applied');

  const after = getListings();
  assert.equal(after.length, before + 1);
  assert.ok(after.some((l) => l.id === created.id));
});

test('buyListing marks sold and blocks double purchase', () => {
  _reset();
  const listing = getListings()[0];
  const res = buyListing(listing.id, { buyer: '买家甲' });
  assert.equal(res.ok, true);
  assert.ok(res.orderId);

  // no longer active
  assert.ok(!getListings().some((l) => l.id === listing.id));
  // cannot buy twice
  assert.throws(() => buyListing(listing.id, {}), RuleError);
});

test('stats reflect platform state', () => {
  _reset();
  const s = getStats();
  assert.ok(s.liveAuctions > 0);
  assert.ok(s.listings > 0);
  assert.ok(s.totalProfit > 0);
  assert.ok(s.closedCases > 0);
});

test('price history is deterministic', () => {
  const f = FOSSILS[2];
  assert.deepEqual(priceHistory(f), priceHistory(f));
});
