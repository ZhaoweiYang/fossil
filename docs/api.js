// 浏览器端 API / Client-side API used by the static (GitHub Pages) build.
// Same interface as api.js (get/post) but routes directly into the in-memory
// store running in the browser — no backend required. Routing mirrors
// server.js so app.js is unaware of which adapter it is talking to.
//
// In the deployed static site, store.js / analytics.js / data.js are copied
// next to this file, so the relative import below resolves.
import {
  getCategories,
  getFossils,
  getFossilDetail,
  getAuctions,
  getAuction,
  getListings,
  getSales,
  getCategoryTrend,
  getStats,
  getActivity,
  placeBid,
  createListing,
  buyListing,
  RuleError,
} from './store.js';

// Parse "/api/<resource>/<id>/<action>" the same way the server does.
function parts(p) {
  const path = p.split('?')[0];
  const seg = path.split('/').filter(Boolean); // ['api', resource, id, action]
  return { resource: seg[1], id: seg[2], action: seg[3] };
}

// Resolve on next microtask so callers always get async behaviour, matching
// the HTTP adapter (and surfacing RuleError messages as plain Errors).
export async function get(p) {
  const { resource, id } = parts(p);
  switch (resource) {
    case 'categories':
      return getCategories();
    case 'fossils':
      if (id) {
        const f = getFossilDetail(id);
        if (!f) throw new Error('未找到该化石');
        return f;
      }
      return getFossils();
    case 'auctions':
      if (id) {
        const a = getAuction(id);
        if (!a) throw new Error('未找到该场次');
        return a;
      }
      return getAuctions();
    case 'listings':
      return getListings();
    case 'sales':
      return getSales();
    case 'trends':
      return getCategoryTrend(id);
    case 'stats':
      return getStats();
    case 'activity':
      return getActivity();
    default:
      throw new Error('未知接口');
  }
}

export async function post(p, body = {}) {
  const { resource, id, action } = parts(p);
  try {
    if (resource === 'auctions' && id && action === 'bids') return placeBid(id, body);
    if (resource === 'listings' && !id) return createListing(body);
    if (resource === 'listings' && id && action === 'buy') return buyListing(id, body);
    throw new Error('未知接口');
  } catch (err) {
    // RuleError carries a user-facing message; rethrow as a plain Error so the
    // SPA's catch/toast path behaves identically to the HTTP adapter.
    if (err instanceof RuleError) throw new Error(err.message);
    throw err;
  }
}
