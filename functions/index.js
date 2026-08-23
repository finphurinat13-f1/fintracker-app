// ── FinTracker price proxy ────────────────────────────────────────────────
// Replaces the browser's old path of calling Yahoo Finance through anonymous
// public CORS proxies (allorigins / corsproxy / codetabs). Those saw every
// ticker a user holds and could disappear without notice. Running the same
// fetches here keeps the holdings list between the user and us, and server-side
// requests have no CORS restriction to work around in the first place.
//
// Reached as /api/prices via the Hosting rewrite, so the browser calls it
// same-origin and no CORS headers are involved.
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

// ── tiny in-process cache ────────────────────────────────────────────────
// Prices move far slower than users click refresh. Caching also keeps us
// under the upstream rate limits, which now matter more than they used to:
// every user shares this function's IP instead of calling from their own.
// Keyed per symbol (not per request) so overlapping portfolios share fetches.
const CACHE = new Map();
const cached = async (key, ttlMs, produce) => {
  const hit = CACHE.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await produce();
  CACHE.set(key, { value, expires: Date.now() + ttlMs });
  if (CACHE.size > 800) for (const k of CACHE.keys()) { CACHE.delete(k); if (CACHE.size <= 600) break; }
  return value;
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const get = async (url, ms = 8000) => {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/json,text/csv,*/*' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally { clearTimeout(tid); }
};

// Run tasks a few at a time. A 30-ticker portfolio firing 30 simultaneous
// requests is exactly the shape that gets an IP rate-limited.
const pooled = async (items, size, worker) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(worker)));
  }
  return out;
};

// ── stocks ───────────────────────────────────────────────────────────────
// Yahoo's batch quote endpoints are gone: /v8/finance/quote returns "Not Found"
// and /v7/finance/quote returns 401 "User is unable to access this feature".
// The chart endpoint still answers unauthenticated, so it is the real path —
// one request per symbol, which is why the pool above exists.
// Returns the quote currency too. A price is meaningless without it: NVDA.MX
// quotes the same company in pesos, and applying that number to an asset the
// user has marked USD would silently overstate it by ~18x.
const yahooChart = async (symbol) => {
  try {
    const r = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
    const d = await r.json();
    const meta = d?.chart?.result?.[0]?.meta;
    const px = meta?.regularMarketPrice;
    return px > 0 ? { price: px, currency: meta?.currency || null } : null;
  } catch { return null; }
};

// Last resort. Stooq answers 404 from our test host, but it costs nothing when
// Yahoo already returned a price and may still work from other egress IPs.
// The .us suffix means this endpoint only ever serves US listings, so USD is safe.
const stooq = async (symbol) => {
  try {
    const r = await get(`https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase())}.us&f=sd2t2ohlcv&h&e=csv`, 6000);
    const lines = (await r.text()).trim().split('\n');
    if (lines.length < 2) return null;
    const close = parseFloat(lines[1].split(',')[6]);
    return close > 0 ? { price: close, currency: 'USD' } : null;
  } catch { return null; }
};

const stockPrice = (symbol) => cached(`stk:${symbol}`, 60_000, async () =>
  (await yahooChart(symbol)) ?? (await stooq(symbol))
);

const fetchStocks = async (symbols) => {
  const prices = {}, currencies = {};
  await pooled(symbols, 6, async s => {
    const hit = await stockPrice(s);
    if (hit) { prices[s] = hit.price; currencies[s] = hit.currency; }
  });
  return { prices, currencies };
};

// ── crypto (CoinGecko) ───────────────────────────────────────────────────
// CoinGecko does support batching, so this stays a single request.
const fetchCrypto = (ids) => cached(`cx:${[...ids].sort().join(',')}`, 60_000, async () => {
  try {
    const r = await get(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=usd`);
    const d = await r.json();
    const out = {};
    for (const [id, v] of Object.entries(d)) if (v?.usd > 0) out[id] = v.usd;
    return out;
  } catch { return {}; }
});

// ── USD/THB ──────────────────────────────────────────────────────────────
// Yahoo first, because an asset tracking THB=X prices off exactly that quote —
// and the free exchange-rate APIs refresh once a day, so the rate shown beside
// such an asset was yesterday's while the asset itself was live. One number
// with two sources is one number too many, and this one multiplies every USD
// holding in the portfolio. Those APIs stay as fallbacks.
const fetchUsdThb = () => cached('usdthb', 3_600_000, async () => {
  try {
    const d = await (await get('https://query1.finance.yahoo.com/v8/finance/chart/THB=X?interval=1d&range=1d')).json();
    const rate = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (rate > 0) return Math.round(rate * 100) / 100;
  } catch { /* fall through */ }
  for (const url of ['https://api.exchangerate-api.com/v4/latest/USD', 'https://open.er-api.com/v6/latest/USD']) {
    try {
      const d = await (await get(url)).json();
      const rate = d?.rates?.THB;
      if (rate > 0) return Math.round(rate * 100) / 100;
    } catch { /* try next source */ }
  }
  return null;
});

const list = (raw, limit) => [...new Set(
  String(raw || '').split(',').map(s => s.trim()).filter(Boolean)
)].slice(0, limit);

// ── name → ticker lookup ─────────────────────────────────────────────────
// Asking someone to supply a "ticker" assumes they know what one is. Searching
// by company name and picking from a list doesn't. The exchange has to be shown
// alongside: "nvidia" also matches NVDA.MX in Mexico, and "ptt" matches PTTRX,
// an unrelated US bond fund — picking blind would give a plausible-looking but
// completely wrong price.
const TOKENIZED = /tokeni[sz]ed|xstock|bstock/i;
// CCC is Yahoo's venue for actual coins. It counts as primary alongside the US
// exchanges, or searching "ethereum" ranks three Grayscale/iShares ETH funds
// above Ethereum itself.
// COMEX/NYMEX carry the metals and energy contracts — the only form gold is
// quoted in on Yahoo, so they count as primary venues too.
const MAJOR_US  = /^(NASDAQ|NYSE|NYSEArca|NYSE American|AMEX|BATS|Cboe|CCC|CCY|New York Commodity|New York Mercantile|COMEX|NYMEX)/i;
// Leveraged/inverse products track a name without being it — "3x NVIDIA",
// "T-Rex 2X Long NVIDIA". Pushed down rather than dropped, since someone may
// genuinely hold one.
const DERIVED   = /(^|\s)-?\d+(\.\d+)?x(\s|$)|leverage|ultra(short|pro)|daily target|bull |bear |option income/i;

// Yahoo's own ordering buries the obvious answer: searching "nvidia" put a
// Toronto ETF and a 2x leveraged product above NVDA.MX, and "tsm" put São Paulo
// and Mexico listings above plain TSM. Rank so the primary US listing wins.
const rank = (x, QU) => {
  const sym  = (x.symbol || '').toUpperCase();
  const name = x.shortname || x.longname || '';
  let s = 0;
  if (sym === QU) s += 1000;                                  // exact ticker typed
  else if (sym.startsWith(QU)) s += 120;
  if (MAJOR_US.test(x.exchDisp || x.exchange || '')) s += 300;
  if (x.quoteType === 'EQUITY') s += 100;
  else if (x.quoteType === 'CRYPTOCURRENCY') s += 100;
  else if (x.quoteType === 'FUTURE') s += 70;      // how commodities are quoted
  else if (x.quoteType === 'ETF') s += 50;
  else if (x.quoteType === 'MUTUALFUND') s -= 80;             // TSMEX/TSMWX for "tsm"
  if (DERIVED.test(name)) s -= 250;
  if (name.toUpperCase().startsWith(QU)) s += 40;
  return s;
};

// Email allowed to use the endpoints without a registry entry. The app gates
// sign-ups behind an approval step; this is the account that does the approving.
const ADMIN_EMAIL = 'finphurinat18@gmail.com';

// A valid token only proves somebody signed up, and signing up is open to
// anyone who finds the page. Approval is what the registry exists for, so it
// has to be checked on the paid endpoints as well — otherwise the gate on the
// front door is decoration, and any new account can spend the project's quota
// on outbound requests before an admin has seen the request at all.
const isApproved = async (decoded) => {
  if (decoded.email === ADMIN_EMAIL) return true;
  try {
    const snap = await admin.firestore().collection('registry').doc(decoded.uid).get();
    return snap.exists && snap.data().status === 'approved';
  } catch { return false; }
};

const requireAuth = async (req, res) => {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'unauthorized' }); return false; }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (!await isApproved(decoded)) { res.status(403).json({ error: 'not approved' }); return false; }
    return true;
  } catch { res.status(401).json({ error: 'unauthorized' }); return false; }
};

exports.search = onRequest(
  { region: 'us-central1', maxInstances: 5, memory: '256MiB', timeoutSeconds: 20 },
  async (req, res) => {
    if (!await requireAuth(req, res)) return;

    const q = String(req.query.q || '').trim().slice(0, 60);
    if (q.length < 2) return res.json({ results: [] });

    const results = await cached(`q:${q.toLowerCase()}`, 3_600_000, async () => {
      try {
        const r = await get(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=16&newsCount=0`);
        const d = await r.json();
        const QU = q.toUpperCase();
        return (d.quotes || [])
          // Futures used to be dropped as noise, which also removed the only way
          // Yahoo quotes gold — searching "gold" returned everything except gold.
          // They rank below equities instead.
          .filter(x => x.symbol)
          // Tokenized equities are crypto tokens that merely track a share price.
          // Nobody tracking an actual holding wants one, and they crowd out the
          // real listing — searching "TSMC" returned three of them.
          .filter(x => !TOKENIZED.test(x.shortname || x.longname || ''))
          .map(x => ({
            symbol:   x.symbol,
            name:     x.shortname || x.longname || x.symbol,
            // "CCC" is Yahoo's internal name for its crypto venue and means
            // nothing to a reader; every other exchange name is self-explanatory.
            exchange: /^CC[CY]$/i.test(x.exchDisp || x.exchange || '') ? 'Crypto' : (x.exchDisp || x.exchange || ''),
            type:     x.typeDisp || x.quoteType || '',
            _score:   rank(x, QU),
          }))
          .sort((a, b) => b._score - a._score)
          .slice(0, 7)
          .map(({ _score, ...rest }) => rest);
      } catch { return []; }
    });

    res.set('Cache-Control', 'private, max-age=300');
    res.json({ results });
  }
);

exports.prices = onRequest(
  { region: 'us-central1', maxInstances: 10, memory: '256MiB', timeoutSeconds: 60 },
  async (req, res) => {
    // Signed-in callers only — this endpoint spends money on outbound requests,
    // so it must not be usable by anyone who finds the URL.
    if (!await requireAuth(req, res)) return;

    const stocks = list(req.query.stocks, 60).map(s => s.toUpperCase());
    const crypto = list(req.query.crypto, 60).map(s => s.toLowerCase());

    const [stockRes, cryptoPrices, usdthb] = await Promise.all([
      stocks.length ? fetchStocks(stocks) : { prices: {}, currencies: {} },
      crypto.length ? fetchCrypto(crypto) : {},
      fetchUsdThb(),
    ]);
    const stockPrices = stockRes.prices;
    // CoinGecko was asked for USD explicitly, so those are USD by construction.
    const currencies = { ...stockRes.currencies };
    Object.keys(cryptoPrices).forEach(k => { currencies[k] = 'USD'; });

    // Tell the caller which symbols came back empty. Without this a partial
    // result is indistinguishable from a complete one, and the usual cause is a
    // ticker the upstream spells differently (PTT vs PTT.BK) — which the user
    // can only fix if we say which one failed.
    const missing = [
      ...stocks.filter(s => !(s in stockPrices)),
      ...crypto.filter(c => !(c in cryptoPrices)),
    ];
    const priced = [...Object.keys(stockPrices), ...Object.keys(cryptoPrices)];
    console.log(`prices: ${stocks.length} stocks + ${crypto.length} crypto -> ${priced.length} priced [${priced.join(' ')}]` + (missing.length ? ` | missing: ${missing.join(',')}` : ''));

    res.set('Cache-Control', 'private, max-age=30');
    res.json({ stocks: stockPrices, crypto: cryptoPrices, currencies, usdthb, missing, asOf: new Date().toISOString() });
  }
);
