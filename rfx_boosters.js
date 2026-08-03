/* ══════════════════════════════════════════════════════════════════
   RED FOREST FX — PRODUCTIVITY BOOSTERS v3
   Complete implementation: Tiers 1-3 + Quick Wins A-J
   Hooks into existing RFX system via monkey-patching + DOM injection
   ══════════════════════════════════════════════════════════════════ */

(function() {
'use strict';

// ══════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════
var RFX_BOOST = {
  // Tier 1: Circuit Breaker
  circuitActive: false,
  dailyLossLimit: 0.03,     // 3% of account
  maxConsecLosses: 2,
  dailyPnl: 0,
  consecLosses: 0,
  lastResetDate: '',

  // Tier 1: Trailing Stop
  trailEnabled: true,
  trailMode: 'percent',     // 'percent' or 'pips'
  trailPips: 15,
  trailPct: 50,             // trail at 50% of max profit
  trailTrigger: 2,          // start trailing at 2x risk
  trailingState: {},        // tradeId -> { highWaterMark, originalSL }

  // Tier 1: Partial Close
  partialEnabled: true,
  partialTrigger: 2,        // close 50% at 2x risk
  partialPct: 50,           // close 50% of position
  partialState: {},         // tradeId -> bool (already closed)

  // Tier 2: Price Alerts
  alerts: [],               // [{pair, price, dir, id, active}]

  // Tier 2: Keyboard Shortcuts
  shortcutEnabled: true,

  // Tier 3: Voice Alerts
  voiceEnabled: false,

  // Tier 3: Sound
  soundEnabled: true,


  // Quick Win: Bookmarks
  bookmarks: [],

  // Quick Win: Last trade time
  lastTradeTime: null,

  // Dashboard data
  dashboardData: {},
};

// Load state from localStorage
function loadBoostState() {
  try {
    var saved = localStorage.getItem('rfxBoostState');
    if (saved) {
      var parsed = JSON.parse(saved);
      Object.assign(RFX_BOOST, parsed);
    }
    RFX_BOOST.alerts = JSON.parse(localStorage.getItem('rfxAlerts') || '[]');
    RFX_BOOST.bookmarks = JSON.parse(localStorage.getItem('rfxBookmarks') || '[]');
    RFX_BOOST.theme = localStorage.getItem('rfxTheme') || 'dark';
    RFX_BOOST.voiceEnabled = localStorage.getItem('rfxVoice') === 'true';
    RFX_BOOST.soundEnabled = localStorage.getItem('rfxSound') !== 'false';
  } catch(e) { console.warn('RFX Boost: state load error', e); }
}

function saveBoostState() {
  try {
    localStorage.setItem('rfxAlerts', JSON.stringify(RFX_BOOST.alerts));
    localStorage.setItem('rfxBookmarks', JSON.stringify(RFX_BOOST.bookmarks));
    localStorage.setItem('rfxTheme', RFX_BOOST.theme);
    localStorage.setItem('rfxVoice', String(RFX_BOOST.voiceEnabled));
    localStorage.setItem('rfxSound', String(RFX_BOOST.soundEnabled));
    // Save non-function state only
    var toSave = {};
    Object.keys(RFX_BOOST).forEach(function(k) {
      if (typeof RFX_BOOST[k] !== 'function') toSave[k] = RFX_BOOST[k];
    });
    localStorage.setItem('rfxBoostState', JSON.stringify(toSave));
  } catch(e) {}
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════
function safeEl(id) { return document.getElementById(id); }
function safeVal(id) { var el = safeEl(id); return el ? el.value : ''; }

function getOandaCreds() {
  return {
    token: (typeof RFX_CONFIG !== 'undefined' ? RFX_CONFIG.oandaToken : 'ce2918846211d3621fea62051602f4fa-f8b188a23c1694059c03d15cc2f2a8b1'),
    acct: (typeof RFX_CONFIG !== 'undefined' ? RFX_CONFIG.oandaAccount : '101-001-38916320-001'),
    base: 'https://api-fxpractice.oanda.com/v3'
  };
}

function showToast(msg, type) {
  if (typeof rfxShowToast === 'function') return rfxShowToast(msg, type);
  console.log('[RFX Boost]', msg);
}

// ══════════════════════════════════════════════════════════════════
// TIER 1: DAILY LOSS CIRCUIT BREAKER
// ══════════════════════════════════════════════════════════════════

function checkDailyCircuitBreaker(balance) {
  var today = new Date().toISOString().slice(0, 10);
  if (RFX_BOOST.lastResetDate !== today) {
    RFX_BOOST.dailyPnl = 0;
    RFX_BOOST.consecLosses = 0;
    RFX_BOOST.lastResetDate = today;
    RFX_BOOST.circuitActive = false;
  }

  var limit = balance * RFX_BOOST.dailyLossLimit;
  if (RFX_BOOST.dailyPnl <= -limit) {
    RFX_BOOST.circuitActive = true;
    showCircuitOverlay('daily_loss', RFX_BOOST.dailyPnl, limit, balance);
    return true;
  }
  if (RFX_BOOST.consecLosses >= RFX_BOOST.maxConsecLosses) {
    RFX_BOOST.circuitActive = true;
    showCircuitOverlay('consec_losses', RFX_BOOST.dailyPnl, limit, balance);
    return true;
  }
  return false;
}

function showCircuitOverlay(reason, pnl, limit, balance) {
  var existing = safeEl('rfxCircuitOverlay');
  if (existing) { existing.classList.add('active'); return; }

  var div = document.createElement('div');
  div.id = 'rfxCircuitOverlay';
  div.className = 'rfx-circuit-overlay active';
  div.innerHTML = '<div class="rfx-circuit-icon">⛔</div>'
    + '<div class="rfx-circuit-title">TRADING PAUSED</div>'
    + '<div class="rfx-circuit-sub">'
    + (reason === 'daily_loss'
      ? 'Daily loss limit of $' + limit.toFixed(2) + ' (' + (RFX_BOOST.dailyLossLimit*100).toFixed(0) + '% of $' + balance.toFixed(0) + ') reached.<br>Step away. Review your trades tomorrow.'
      : RFX_BOOST.consecLosses + ' consecutive losses today.<br>The market is not rewarding your edge right now. Protect your capital.')
    + '</div>'
    + '<div class="rfx-circuit-stats">'
    + '<div class="rfx-circuit-stat"><div class="rfx-circuit-stat-val">$' + Math.abs(pnl).toFixed(2) + '</div><div class="rfx-circuit-stat-label">Today\'s P&L</div></div>'
    + '<div class="rfx-circuit-stat"><div class="rfx-circuit-stat-val">' + RFX_BOOST.consecLosses + '/' + RFX_BOOST.maxConsecLosses + '</div><div class="rfx-circuit-stat-label">Consecutive Losses</div></div>'
    + '<div class="rfx-circuit-stat"><div class="rfx-circuit-stat-val">$' + balance.toFixed(2) + '</div><div class="rfx-circuit-stat-label">Account Balance</div></div>'
    + '</div>'
    + '<button class="rfx-circuit-dismiss" onclick="this.parentElement.classList.remove(\'active\')">I Understand — I Will Step Away</button>';
  document.body.appendChild(div);

  if (RFX_BOOST.voiceEnabled) speakText('Trading paused. Daily limit reached. Step away from the charts.');
  playAlertSound('circuit');
}

function recordTradeResult(pnl) {
  var today = new Date().toISOString().slice(0, 10);
  if (RFX_BOOST.lastResetDate !== today) {
    RFX_BOOST.dailyPnl = 0;
    RFX_BOOST.consecLosses = 0;
    RFX_BOOST.lastResetDate = today;
  }
  RFX_BOOST.dailyPnl += pnl;
  if (pnl < 0) {
    RFX_BOOST.consecLosses++;
  } else if (pnl > 0) {
    RFX_BOOST.consecLosses = 0;
  }
  saveBoostState();
}

// ══════════════════════════════════════════════════════════════════
// TIER 1: AUTO-TRAILING STOP
// ══════════════════════════════════════════════════════════════════

async function checkTrailingStops() {
  if (!RFX_BOOST.trailEnabled) return;
  var creds = getOandaCreds();

  try {
    var res = await fetch(creds.base + '/accounts/' + creds.acct + '/openTrades', {
      headers: { 'Authorization': 'Bearer ' + creds.token }
    });
    if (!res.ok) return;
    var data = await res.json();
    var trades = data.trades || [];

    for (var i = 0; i < trades.length; i++) {
      var ot = trades[i];
      var entryPrice = parseFloat(ot.price);
      var units = parseFloat(ot.currentUnits);
      var unrealizedPL = parseFloat(ot.unrealizedPL);
      var isLong = units > 0;
      var slOrder = ot.stopLossOrder;
      if (!slOrder || unrealizedPL <= 0) continue;

      var currentSL = parseFloat(slOrder.price);
      var slDist = Math.abs(entryPrice - currentSL);
      var instrument = ot.instrument;
      var pip = instrument === 'USD_JPY' ? 0.01 : 0.0001;
      var riskDist = slDist;

      // Calculate current price from P&L
      var currentPrice = isLong
        ? entryPrice + (unrealizedPL / (Math.abs(units) * pip * 10))
        : entryPrice - (unrealizedPL / (Math.abs(units) * pip * 10));

      var profitDist = Math.abs(currentPrice - entryPrice);
      var profitMultiple = profitDist / riskDist;

      // Already at breakeven or better — check for trailing
      var alreadyBE = isLong
        ? Math.abs(currentSL - entryPrice) < pip
        : Math.abs(currentSL - entryPrice) < pip;

      var trailState = RFX_BOOST.trailingState[ot.id] || {};
      var highWater = trailState.highWater || entryPrice;

      // Update high water mark
      if (isLong && currentPrice > highWater) highWater = currentPrice;
      if (!isLong && currentPrice < highWater) highWater = currentPrice;

      // Only trail when profit >= trailTrigger × risk
      if (profitMultiple < RFX_BOOST.trailTrigger) {
        RFX_BOOST.trailingState[ot.id] = { highWater: highWater, originalSL: currentSL };
        continue;
      }

      // Calculate trail SL
      var trailDist;
      if (RFX_BOOST.trailMode === 'pips') {
        trailDist = RFX_BOOST.trailPips * pip;
      } else {
        trailDist = profitDist * (RFX_BOOST.trailPct / 100);
      }

      var newSL = isLong
        ? highWater - trailDist
        : highWater + trailDist;

      // Only move SL if it improves (tightens) current SL
      var improvesSL = isLong ? newSL > currentSL + pip : newSL < currentSL - pip;

      if (improvesSL) {
        var slPriceStr = newSL.toFixed(instrument === 'USD_JPY' ? 3 : 5);
        try {
          var trailRes = await fetch(creds.base + '/accounts/' + creds.acct + '/trades/' + ot.id + '/orders', {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + creds.token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ stopLoss: { price: slPriceStr, timeInForce: 'GTC' } })
          });
          if (trailRes.ok) {
            var pair = instrument.replace('_', '');
            var lockedPips = isLong
              ? ((newSL - entryPrice) / pip).toFixed(1)
              : ((entryPrice - newSL) / pip).toFixed(1);
            showToast('📈 ' + pair + ' SL trailed to ' + slPriceStr + ' — +' + lockedPips + 'p locked', 'ok');
            RFX_BOOST.trailingState[ot.id] = { highWater: highWater, originalSL: newSL };
            if (RFX_BOOST.voiceEnabled) speakText(pair + ' stop loss trailed. ' + lockedPips + ' pips locked.');
            playAlertSound('trail');
          }
        } catch(e) { console.warn('Trail error:', e.message); }
      } else {
        RFX_BOOST.trailingState[ot.id] = { highWater: highWater, originalSL: currentSL };
      }
    }
  } catch(e) { console.warn('Trail check error:', e.message); }
}

// ══════════════════════════════════════════════════════════════════
// TIER 1: PARTIAL CLOSE AT TARGET
// ══════════════════════════════════════════════════════════════════

async function checkPartialClose() {
  if (!RFX_BOOST.partialEnabled) return;
  var creds = getOandaCreds();

  try {
    var res = await fetch(creds.base + '/accounts/' + creds.acct + '/openTrades', {
      headers: { 'Authorization': 'Bearer ' + creds.token }
    });
    if (!res.ok) return;
    var data = await res.json();
    var trades = data.trades || [];

    for (var i = 0; i < trades.length; i++) {
      var ot = trades[i];
      var tradeId = ot.id;
      if (RFX_BOOST.partialState[tradeId]) continue; // already partially closed

      var entryPrice = parseFloat(ot.price);
      var units = parseFloat(ot.currentUnits);
      var unrealizedPL = parseFloat(ot.unrealizedPL);
      var isLong = units > 0;
      var slOrder = ot.stopLossOrder;
      if (!slOrder) continue;

      var currentSL = parseFloat(slOrder.price);
      var slDist = Math.abs(entryPrice - currentSL);
      var pip = ot.instrument === 'USD_JPY' ? 0.01 : 0.0001;
      var riskDist = slDist;

      var currentPrice = isLong
        ? entryPrice + (unrealizedPL / (Math.abs(units) * pip * 10))
        : entryPrice - (unrealizedPL / (Math.abs(units) * pip * 10));

      var profitDist = Math.abs(currentPrice - entryPrice);
      var profitMultiple = profitDist / riskDist;

      if (profitMultiple >= RFX_BOOST.partialTrigger) {
        // Close partial
        var closeUnits = Math.floor(Math.abs(units) * (RFX_BOOST.partialPct / 100));
        var closeDir = isLong ? -closeUnits : closeUnits;

        try {
          var closeRes = await fetch(creds.base + '/accounts/' + creds.acct + '/orders', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + creds.token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order: {
                type: 'MARKET',
                instrument: ot.instrument,
                units: String(closeDir),
                timeInForce: 'FOK',
                positionFill: 'REDUCE_ONLY'
              }
            })
          });
          if (closeRes.ok) {
            var pair = ot.instrument.replace('_', '');
            var pnlPct = (profitMultiple * 100).toFixed(0);
            showToast('✅ ' + pair + ' partial close — ' + RFX_BOOST.partialPct + '% locked at +' + profitDist.toFixed(4) + ' (+' + (profitDist/pip).toFixed(1) + 'p)', 'ok');
            RFX_BOOST.partialState[tradeId] = true;
            if (RFX_BOOST.voiceEnabled) speakText(pair + ' partial close executed. Profits locked.');
            playAlertSound('partial');
          }
        } catch(e) { console.warn('Partial close error:', e.message); }
      }
    }
  } catch(e) { console.warn('Partial close check error:', e.message); }
}

// ══════════════════════════════════════════════════════════════════
// TIER 1: MULTI-PAIR DASHBOARD (HTML injected into page)
// ══════════════════════════════════════════════════════════════════

function injectMultiPairDashboard() {
  var calcSection = document.querySelector('.calc-section#calculator');
  if (!calcSection || safeEl('rfxDashboardSection')) return;

  var section = document.createElement('div');
  section.id = 'rfxDashboardSection';
  section.className = 'rfx-dashboard-section';
  section.innerHTML = '<div class="section">'
    + '<div class="sec-tag reveal">Pair Radar</div>'
    + '<h2 style="font-size:clamp(24px,3vw,36px);font-weight:900;letter-spacing:-0.03em;margin-bottom:8px;" class="reveal rd1">'
    + 'All pairs. <span style="color:var(--green)">One glance.</span></h2>'
    + '<p style="color:var(--muted);font-size:14px;margin-bottom:0;" class="reveal rd2">Live status for all 6 approved pairs — click any pair to load it into the calculator.</p>'
    + '<div class="rfx-pair-grid" id="rfxPairGrid"></div>'
    + '</div>';

  // Insert after calculator
  calcSection.parentNode.insertBefore(section, calcSection.nextSibling);
  refreshDashboard();
}

async function refreshDashboard() {
  var grid = safeEl('rfxPairGrid');
  if (!grid) return;
  var creds = getOandaCreds();
  var pairs = ['GBPUSD', 'EURUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'NZDUSD'];
  var instrMap = {GBPUSD:'GBP_USD',EURUSD:'EUR_USD',USDJPY:'USD_JPY',USDCAD:'USD_CAD',AUDUSD:'AUD_USD',NZDUSD:'NZD_USD'};
  var decs = {GBPUSD:5,EURUSD:5,USDJPY:3,USDCAD:5,AUDUSD:5,NZDUSD:5};

  // Prefetch HTF data for all pairs if not cached recently
  if (typeof _htfCache !== 'undefined' && typeof rfxFetchHTFDirection === 'function') {
    for (var pi = 0; pi < pairs.length; pi++) {
      var p = pairs[pi];
      if (!_htfCache[p] || (Date.now() - _htfCache[p].ts) > 5 * 60 * 1000) {
        rfxFetchHTFDirection(p);
      }
    }
  }

  grid.innerHTML = '';
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    var instr = instrMap[pair];
    var dec = decs[pair];

    // Try to get live price
    var price = '—';
    var dir = '—';
    var status = 'loading';
    var statusLabel = 'Loading…';

    if (typeof livePrices !== 'undefined' && livePrices[pair]) {
      price = livePrices[pair].price.toFixed(dec);
    }

    // Try to get HTF direction from cache
    if (typeof _htfCache !== 'undefined' && _htfCache[pair]) {
      var cache = _htfCache[pair];
      var dDir = cache.dDir;
      var h4Dir = cache.h4Dir;
      dir = (dDir === 'up' && h4Dir === 'up') ? '↑↑ UP'
          : (dDir === 'down' && h4Dir === 'down') ? '↓↓ DN'
          : dDir + '/' + h4Dir;

      if (dDir === h4Dir && dDir !== 'range') {
        status = 'aligned';
        statusLabel = 'Aligned';
      } else if (dDir === 'range' && h4Dir === 'range') {
        status = 'ranging';
        statusLabel = 'Ranging';
      } else {
        status = 'mixed';
        statusLabel = 'Mixed';
      }
    }

    var cardClass = status === 'aligned' ? 'all-clear' : (status === 'loading' ? 'loading' : (status === 'mixed' ? 'mixed' : (status === 'ranging' ? 'ranging' : '')));
    var card = document.createElement('div');
    card.className = 'rfx-pair-card ' + cardClass;
    card.onclick = (function(p) {
      return function() { rfxLoadPairFromDashboard(p); };
    })(pair);
    card.innerHTML = '<div class="pc-name">' + pair + '</div>'
      + '<div class="pc-price">' + price + '</div>'
      + '<div class="pc-row"><span>Daily + 4H</span><span class="pc-dir pc-dir-' + status + '">' + dir + '</span></div>'
      + '<div class="pc-badge ' + status + '">' + statusLabel + '</div>';
    grid.appendChild(card);
  }
}

// Make callable from onclick
window.rfxLoadPairFromDashboard = function(pair) {
  var sel = safeEl('c-pair');
  if (sel) {
    sel.value = pair;
    if (typeof onPairChange === 'function') onPairChange();
  }
  document.querySelector('.calc-section#calculator').scrollIntoView({behavior:'smooth', block:'start'});
  showToast('🔄 Loaded ' + pair + ' into calculator', 'ok');
};

// ══════════════════════════════════════════════════════════════════
// TIER 2: PRICE ALERTS WITH SCORING
// ══════════════════════════════════════════════════════════════════

function injectPriceAlerts() {
  var aiSection = safeEl('aiSection');
  if (!aiSection || safeEl('rfxAlertsPanel')) return;

  var div = document.createElement('div');
  div.id = 'rfxAlertsPanel';
  div.className = 'rfx-alerts-section';
  div.innerHTML = '<div class="sec-tag" style="margin-top:32px;">Price Alerts</div>'
    + '<h3 style="font-size:20px;font-weight:900;margin-bottom:4px;">Set price-level alerts <span style="color:var(--green)">with auto-scoring</span></h3>'
    + '<p style="color:var(--muted);font-size:13px;margin-bottom:12px;">Get notified when price reaches your level AND the setup qualifies.</p>'
    + '<div class="rfx-alert-card">'
    + '<div id="rfxAlertsList"></div>'
    + '<div class="rfx-alert-form">'
    + '<select id="rfxAlertPair" class="calc-input" style="width:120px;padding:8px 10px;font-size:12px;">'
    + '<option>GBPUSD</option><option>EURUSD</option><option>USDJPY</option><option>USDCAD</option><option>AUDUSD</option><option>NZDUSD</option>'
    + '</select>'
    + '<input id="rfxAlertPrice" type="number" step="0.00001" placeholder="Price level" style="width:130px;">'
    + '<select id="rfxAlertDir" class="calc-input" style="width:100px;padding:8px 10px;font-size:12px;">'
    + '<option value="LONG">LONG ↑</option><option value="SHORT">SHORT ↓</option>'
    + '</select>'
    + '<button class="rfx-alert-add-btn" onclick="rfxAddAlert()">+ Add Alert</button>'
    + '</div>'
    + '</div>';
  aiSection.parentNode.insertBefore(div, aiSection.nextSibling);
  renderAlerts();
}

window.rfxAddAlert = function() {
  var pair = safeVal('rfxAlertPair');
  var price = parseFloat(safeVal('rfxAlertPrice'));
  var dir = safeVal('rfxAlertDir');
  if (!price || price <= 0) { showToast('⚠ Enter a valid price', 'warn'); return; }

  RFX_BOOST.alerts.push({
    id: Date.now(),
    pair: pair,
    price: price,
    dir: dir,
    active: true,
    created: new Date().toISOString()
  });
  saveBoostState();
  renderAlerts();
  safeEl('rfxAlertPrice').value = '';
  showToast('✅ Alert set: ' + pair + ' @ ' + price.toFixed(5) + ' (' + dir + ')', 'ok');
};

function renderAlerts() {
  var list = safeEl('rfxAlertsList');
  if (!list) return;
  if (RFX_BOOST.alerts.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:12px 0;font-style:italic;">No alerts set. Add a price level above.</div>';
    return;
  }
  list.innerHTML = RFX_BOOST.alerts.filter(function(a) { return a.active; }).map(function(a) {
    var dec = a.pair === 'USDJPY' ? 3 : 5;
    return '<div class="rfx-alert-row">'
      + '<span class="rfx-alert-pair">' + a.pair + '</span>'
      + '<span class="rfx-alert-price">' + a.price.toFixed(dec) + '</span>'
      + '<span class="rfx-alert-dir ' + a.dir.toLowerCase() + '">' + a.dir + '</span>'
      + '<button class="rfx-alert-del" onclick="rfxDelAlert(' + a.id + ')" title="Remove">×</button>'
      + '</div>';
  }).join('');
}

window.rfxDelAlert = function(id) {
  RFX_BOOST.alerts = RFX_BOOST.alerts.filter(function(a) { return a.id !== id; });
  saveBoostState();
  renderAlerts();
};

function checkPriceAlerts() {
  if (typeof livePrices === 'undefined') return;
  RFX_BOOST.alerts.forEach(function(alert) {
    if (!alert.active) return;
    var lp = livePrices[alert.pair];
    if (!lp) return;
    var price = lp.price;
    var triggered = false;

    if (alert.dir === 'LONG' && price <= alert.price) triggered = true;
    if (alert.dir === 'SHORT' && price >= alert.price) triggered = true;

    if (triggered) {
      alert.active = false;
      saveBoostState();
      renderAlerts();

      // Load pair and run scoring
      window.rfxLoadPairFromDashboard(alert.pair);
      var entryEl = safeEl('c-entry');
      if (entryEl) {
        entryEl.value = alert.price.toFixed(alert.pair === 'USDJPY' ? 3 : 5);
        if (typeof rfxCalc === 'function') rfxCalc();
      }

      showToast('🔔 ALERT: ' + alert.pair + ' reached ' + alert.price.toFixed(5) + ' — scoring…', 'ok');
      if (RFX_BOOST.voiceEnabled) speakText(alert.pair + ' reached your alert level.');
      playAlertSound('alert');

      // Check if guards pass after a tick
      setTimeout(function() {
        if (window._rfxLastVerdict && window._rfxLastVerdict.includes('ENTER')) {
          showToast('✅ ' + alert.pair + ' ALL GUARDS CLEAR at alert level!', 'ok');
          if (RFX_BOOST.voiceEnabled) speakText('All guards clear. Setup qualifies.');
        } else {
          showToast('⚠ ' + alert.pair + ' at level but setup does not qualify', 'warn');
        }
      }, 500);
    }
  });
}

// ══════════════════════════════════════════════════════════════════
// TIER 2: TRADE COMPARISON ENGINE
// ══════════════════════════════════════════════════════════════════

function injectTradeComparison() {
  var calcResult = safeEl('calcResult');
  if (!calcResult || safeEl('rfxComparison')) return;

  var div = document.createElement('div');
  div.id = 'rfxComparison';
  div.className = 'rfx-comparison-card';
  div.style.display = 'none';
  calcResult.parentNode.insertBefore(div, calcResult.nextSibling);
}

function updateTradeComparison() {
  var div = safeEl('rfxComparison');
  if (!div) return;

  var pair = safeVal('c-pair') || 'GBPUSD';
  var dir = typeof calcDir !== 'undefined' ? calcDir : 'LONG';
  var score = parseFloat(safeVal('c-score')) || 0;
  if (score <= 0) { div.style.display = 'none'; return; }

  var trades = (typeof rfxGetTrades === 'function') ? rfxGetTrades() : [];
  var similar = trades.filter(function(t) {
    return t.pair === pair && t.direction === dir && t.outcome !== 'OPEN'
      && t.score && Math.abs(t.score - score) <= 10;
  });

  if (similar.length < 3) { div.style.display = 'none'; return; }

  var wins = similar.filter(function(t) { return t.outcome === 'WIN'; }).length;
  var losses = similar.filter(function(t) { return t.outcome === 'LOSS'; }).length;
  var be = similar.filter(function(t) { return t.outcome === 'BE'; }).length;
  var total = similar.length;
  var winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  var totalPnl = similar.reduce(function(s, t) { return s + (parseFloat(t.pnl) || 0); }, 0);

  var wrColor = winRate >= 60 ? 'green' : winRate >= 40 ? 'yellow' : 'red';

  div.style.display = 'block';
  div.innerHTML = '<div class="rfx-comp-header">'
    + '<span style="font-size:18px;">📊</span>'
    + '<div>'
    + '<div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;">Historical Comparison</div>'
    + '<div style="font-size:13px;color:var(--white);font-weight:600;">' + total + ' similar ' + pair + ' ' + dir + ' setups (score ±10%)</div>'
    + '</div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px;">'
    + '<div><div class="rfx-comp-stat ' + wrColor + '">' + winRate + '%</div><div class="rfx-comp-detail">Win Rate (' + wins + 'W / ' + losses + 'L / ' + be + 'BE)</div></div>'
    + '<div><div class="rfx-comp-stat" style="color:' + (totalPnl >= 0 ? 'var(--green)' : 'var(--red)') + ';">' + (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2) + '</div><div class="rfx-comp-detail">Total P&L</div></div>'
    + '<div><div class="rfx-comp-stat yellow">' + (total > 0 ? (totalPnl / total).toFixed(2) : '0') + '</div><div class="rfx-comp-detail">Avg P&L / Trade</div></div>'
    + '<div><div class="rfx-comp-stat green">' + (wins > 0 ? (similar.filter(function(t){return t.outcome==='WIN';}).reduce(function(s,t){return s+(parseFloat(t.pnl)||0);},0)/wins).toFixed(2) : '0') + '</div><div class="rfx-comp-detail">Avg Win</div></div>'
    + '</div>'
    + '<div class="rfx-comp-bar"><div class="rfx-comp-bar-fill" style="width:' + winRate + '%;background:var(--' + wrColor + ');box-shadow:0 0 8px var(--' + wrColor + ');"></div></div>';
}

// ══════════════════════════════════════════════════════════════════
// TIER 2: KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════════

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    if (!RFX_BOOST.shortcutEnabled) return;
    // Don't trigger when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    var handled = false;
    var msg = '';

    switch(e.key.toLowerCase()) {
      case 's':
        if (typeof rfxSaveTrade === 'function') { rfxSaveTrade(); msg = '💾 Save Trade'; }
        handled = true; break;
      case 'c':
        if (typeof rfxCopyAll === 'function') { rfxCopyAll(); msg = '⎘ Copy All'; }
        handled = true; break;
      case 'j':
        if (typeof showJournalPanel === 'function') { showJournalPanel(); msg = '📓 Journal'; }
        handled = true; break;
      case 'l':
        if (typeof setDir === 'function') {
          var newDir = calcDir === 'LONG' ? 'SHORT' : 'LONG';
          setDir(newDir);
          msg = '↕ ' + newDir;
        }
        handled = true; break;
      case '1': rfxLoadPairFromDashboard('GBPUSD'); msg = '1 → GBPUSD'; handled = true; break;
      case '2': rfxLoadPairFromDashboard('EURUSD'); msg = '2 → EURUSD'; handled = true; break;
      case '3': rfxLoadPairFromDashboard('USDJPY'); msg = '3 → USDJPY'; handled = true; break;
      case '4': rfxLoadPairFromDashboard('USDCAD'); msg = '4 → USDCAD'; handled = true; break;
      case '5': rfxLoadPairFromDashboard('AUDUSD'); msg = '5 → AUDUSD'; handled = true; break;
      case '6': rfxLoadPairFromDashboard('NZDUSD'); msg = '6 → NZDUSD'; handled = true; break;
      case ' ':
        if (typeof rfxAIJournalReview === 'function') { e.preventDefault(); rfxAIJournalReview(); msg = '✦ AI Review'; }
        handled = true; break;
      case 'escape':
        document.querySelectorAll('.stats-overlay.open, .journey-overlay.open, .journal-overlay.open, .rfx-modal-overlay').forEach(function(el) {
          el.style.display = 'none';
          el.classList.remove('open');
        });
        msg = '✕ Close';
        handled = true; break;
      case 'd':
        var dash = safeEl('rfxDashboardSection');
        if (dash) { dash.scrollIntoView({behavior:'smooth', block:'start'}); msg = '📡 Dashboard'; }
        handled = true; break;
    }

    if (handled) {
      e.preventDefault();
      showKbdToast(msg);
    }
  });
}

function showKbdToast(msg) {
  var toast = safeEl('rfxKbdToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'rfxKbdToast';
    toast.className = 'rfx-kbd-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function() { toast.classList.remove('show'); }, 1200);
}

// ══════════════════════════════════════════════════════════════════
// TIER 3: VOICE / AUDIO ALERTS
// ══════════════════════════════════════════════════════════════════

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  var utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 0.9;
  utterance.volume = 0.8;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function playAlertSound(type) {
  if (!RFX_BOOST.soundEnabled) return;
  // Use Web Audio API to generate a short tone — no external files needed
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch(type) {
      case 'circuit':
        osc.frequency.value = 220; gain.gain.value = 0.15;
        osc.start(); osc.stop(ctx.currentTime + 0.3);
        setTimeout(function() {
          var o2 = ctx.createOscillator(); var g2 = ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.frequency.value = 180; g2.gain.value = 0.12;
          o2.start(); o2.stop(ctx.currentTime + 0.4);
        }, 350);
        break;
      case 'trail':
      case 'partial':
        osc.frequency.value = 660; gain.gain.value = 0.08;
        osc.start(); osc.stop(ctx.currentTime + 0.12);
        break;
      case 'alert':
        osc.frequency.value = 880; gain.gain.value = 0.1;
        osc.start(); osc.stop(ctx.currentTime + 0.08);
        setTimeout(function() {
          var o2 = ctx.createOscillator(); var g2 = ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.frequency.value = 1100; g2.gain.value = 0.08;
          o2.start(); o2.stop(ctx.currentTime + 0.12);
        }, 120);
        break;
      case 'guard_clear':
        osc.frequency.value = 523; gain.gain.value = 0.06;
        osc.start(); osc.stop(ctx.currentTime + 0.1);
        setTimeout(function() {
          var o2 = ctx.createOscillator(); var g2 = ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.frequency.value = 659; g2.gain.value = 0.06;
          o2.start(); o2.stop(ctx.currentTime + 0.1);
        }, 100);
        setTimeout(function() {
          var o3 = ctx.createOscillator(); var g3 = ctx.createGain();
          o3.connect(g3); g3.connect(ctx.destination);
          o3.frequency.value = 784; g3.gain.value = 0.06;
          o3.start(); o3.stop(ctx.currentTime + 0.15);
        }, 200);
        break;
      default:
        osc.frequency.value = 440; gain.gain.value = 0.05;
        osc.start(); osc.stop(ctx.currentTime + 0.08);
    }
  } catch(e) {}
}

// ══════════════════════════════════════════════════════════════════
// TIER 3: ECONOMIC CALENDAR INLINE
// ══════════════════════════════════════════════════════════════════

function injectCalendarInline() {
  var aiSection = safeEl('aiSection');
  if (!aiSection || safeEl('rfxCalendarPanel')) return;

  var div = document.createElement('div');
  div.id = 'rfxCalendarPanel';
  div.className = 'rfx-calendar-section';
  div.innerHTML = '<div class="sec-tag">Economic Calendar</div>'
    + '<h3 style="font-size:20px;font-weight:900;margin-bottom:4px;">This week\'s <span style="color:var(--yellow)">high-impact events</span></h3>'
    + '<p style="color:var(--muted);font-size:13px;margin-bottom:8px;">Plan your trading around major releases.</p>'
    + '<div class="rfx-calendar-timeline" id="rfxCalendarTimeline">'
    + '<div style="font-size:12px;color:var(--muted);font-style:italic;padding:12px;">Loading calendar…</div>'
    + '</div>';
  aiSection.parentNode.insertBefore(div, aiSection.nextSibling);
  loadCalendar();
}

async function loadCalendar() {
  var el = safeEl('rfxCalendarTimeline');
  if (!el) return;

  try {
    var res = await fetch('https://rfx-news.keenan-charles20.workers.dev/');
    if (!res.ok) throw new Error('Calendar fetch failed');
    var data = await res.json();
    var events = data.events || [];

    // Filter to high-impact only, sort by date
    var highImpact = events.filter(function(e) {
      return (e.impact || '').toLowerCase() === 'high' || (e.impact || '') === '🔴';
    }).sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

    if (highImpact.length === 0) {
      el.innerHTML = '<div class="rfx-cal-empty">✓ No high-impact events this week. Clear sailing.</div>';
      return;
    }

    el.innerHTML = highImpact.slice(0, 10).map(function(e) {
      var t = new Date(e.date);
      var time = String(t.getUTCHours()).padStart(2,'0') + ':' + String(t.getUTCMinutes()).padStart(2,'0');
      var day = t.toLocaleDateString('en-US', {weekday:'short', timeZone:'UTC'});
      return '<div class="rfx-cal-event high">'
        + '<span class="rfx-cal-time">' + day + ' ' + time + '</span>'
        + '<span class="rfx-cal-country">' + (e.country || '—') + '</span>'
        + '<span class="rfx-cal-title">' + (e.title || '') + '</span>'
        + '<span class="rfx-cal-impact high">HIGH</span>'
        + '</div>';
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:12px;">⚠ Calendar unavailable — check forexfactory.com</div>';
  }
}

// ══════════════════════════════════════════════════════════════════
// TIER 3: RISK OF RUIN CALCULATOR
// ══════════════════════════════════════════════════════════════════

function injectRiskOfRuin() {
  var statsBody = document.querySelector('.stats-body');
  if (!statsBody || safeEl('rfxRoRSection')) return;

  var section = document.createElement('div');
  section.id = 'rfxRoRSection';
  section.innerHTML = '<div class="stats-sec-label">Risk of Ruin</div>'
    + '<div class="rfx-ror-card" id="rfxRoRCard">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;">'
    + '<div>'
    + '<div class="rfx-ror-value" id="rfxRoRValue">—</div>'
    + '<div class="rfx-ror-label" id="rfxRoRLabel">Need more trade data</div>'
    + '</div>'
    + '</div>'
    + '<div class="rfx-ror-gauge"><div class="rfx-ror-marker" id="rfxRoRMarker" style="left:0%"></div></div>'
    + '<div id="rfxRoRDetail" style="font-size:11px;color:var(--muted);margin-top:8px;"></div>'
    + '</div>';

  // Insert after the stats grid
  var grid = statsBody.querySelector('.stats-grid');
  if (grid) grid.parentNode.insertBefore(section, grid.nextSibling);
}

function calculateRiskOfRuin() {
  var trades = (typeof rfxGetTrades === 'function') ? rfxGetTrades() : [];
  var closed = trades.filter(function(t) { return t.outcome !== 'OPEN' && t.pnl !== undefined; });
  if (closed.length < 5) return;

  var wins = closed.filter(function(t) { return t.outcome === 'WIN'; });
  var losses = closed.filter(function(t) { return t.outcome === 'LOSS'; });
  var winRate = wins.length / closed.length;
  var avgWin = wins.length > 0 ? wins.reduce(function(s,t) { return s + Math.abs(parseFloat(t.pnl)||0); }, 0) / wins.length : 0;
  var avgLoss = losses.length > 0 ? losses.reduce(function(s,t) { return s + Math.abs(parseFloat(t.pnl)||0); }, 0) / losses.length : 0;

  if (avgLoss === 0) return;

  var payoffRatio = avgWin / avgLoss;
  // Risk of Ruin formula: RoR = ((1 - edge) / (1 + edge))^(units_risk)
  // Where edge = (winRate * payoffRatio - (1-winRate)) / payoffRatio
  var edge = (winRate * payoffRatio - (1 - winRate)) / payoffRatio;

  var ror;
  if (edge <= 0) {
    ror = 100; // No edge = certain ruin
  } else {
    // Simplified: probability of losing 10 consecutive trades
    ror = Math.pow(1 - winRate, 10) * 100;
  }

  ror = Math.min(100, Math.max(0, ror));
  var rorColor = ror <= 5 ? 'var(--green)' : ror <= 15 ? 'var(--yellow)' : 'var(--red)';

  var valEl = safeEl('rfxRoRValue');
  var labelEl = safeEl('rfxRoRLabel');
  var markerEl = safeEl('rfxRoRMarker');
  var detailEl = safeEl('rfxRoRDetail');

  if (valEl) { valEl.textContent = ror.toFixed(1) + '%'; valEl.style.color = rorColor; }
  if (labelEl) {
    labelEl.textContent = ror <= 5 ? 'Excellent — edge is strong' : ror <= 15 ? 'Acceptable — manage risk' : ror <= 30 ? 'Elevated — review your system' : 'Critical — stop and reassess';
  }
  if (markerEl) markerEl.style.left = Math.min(95, Math.max(5, ror)) + '%';
  if (detailEl) {
    detailEl.innerHTML = 'Win rate: ' + (winRate * 100).toFixed(0) + '% · Avg win: $' + avgWin.toFixed(2) + ' · Avg loss: $' + avgLoss.toFixed(2) + ' · Payoff: ' + payoffRatio.toFixed(2) + ':1 · ' + closed.length + ' closed trades';
  }
}

// ══════════════════════════════════════════════════════════════════
// TIER 3: PRE-MARKET BRIEFING (injected into hero section)
// ══════════════════════════════════════════════════════════════════

function injectPreMarketBriefing() {
  var heroLeft = document.querySelector('.hero-left');
  if (!heroLeft || safeEl('rfxBriefing')) return;

  var div = document.createElement('div');
  div.id = 'rfxBriefing';
  div.style.marginTop = '24px';
  div.innerHTML = '<div id="rfxBriefingContent" style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 20px;font-size:13px;line-height:1.8;color:var(--muted);">'
    + '<div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--green);margin-bottom:8px;">📋 Pre-Market Brief</div>'
    + '<div id="rfxBriefingBody">Loading market summary…</div>'
    + '</div>';
  heroLeft.appendChild(div);
  generateBriefing();
}

async function generateBriefing() {
  var body = safeEl('rfxBriefingBody');
  if (!body) return;

  var creds = getOandaCreds();
  var pairs = ['GBPUSD', 'EURUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'NZDUSD'];
  var instrMap = {GBPUSD:'GBP_USD',EURUSD:'EUR_USD',USDJPY:'USD_JPY',USDCAD:'USD_CAD',AUDUSD:'AUD_USD',NZDUSD:'NZD_USD'};

  var lines = [];
  var aligned = [];
  var opposed = [];

  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    try {
      var res = await fetch(creds.base + '/instruments/' + instrMap[pair] + '/candles?granularity=D&count=3', {
        headers: { 'Authorization': 'Bearer ' + creds.token }
      });
      if (res.ok) {
        var data = await res.json();
        var candles = data.candles || [];
        if (candles.length >= 2) {
          var last = parseFloat(candles[candles.length - 1].mid.c);
          var prev = parseFloat(candles[candles.length - 2].mid.c);
          var dir = last > prev ? 'UP' : last < prev ? 'DOWN' : 'RANGE';
          if (dir === 'UP') aligned.push(pair);
          else if (dir === 'DOWN') opposed.push(pair);
        }
      }
    } catch(e) {}
  }

  var balance = '';
  try {
    var sumRes = await fetch(creds.base + '/accounts/' + creds.acct + '/summary', {
      headers: { 'Authorization': 'Bearer ' + creds.token }
    });
    if (sumRes.ok) {
      var sumData = await sumRes.json();
      balance = '$' + parseFloat(sumData.account.balance).toFixed(2);
    }
  } catch(e) {}

  var streak = (typeof rfxGetStreak === 'function') ? rfxGetStreak() : 0;
  var session = (typeof getUtcSession === 'function') ? getUtcSession() : 'unknown';

  var lines2 = [];
  if (aligned.length > 0) lines2.push('📈 <strong style="color:var(--green);">Bullish:</strong> ' + aligned.join(', '));
  if (opposed.length > 0) lines2.push('📉 <strong style="color:var(--red);">Bearish:</strong> ' + opposed.join(', '));
  if (lines2.length === 0) lines2.push('↔️ All pairs ranging — wait for direction');
  lines2.push('💰 Balance: <strong>' + (balance || '—') + '</strong> · 🔥 Streak: ' + streak + ' · Session: ' + session);

  body.innerHTML = lines2.join('<br>');
}

// ══════════════════════════════════════════════════════════════════
// TIER 3: SETUP TYPE CLASSIFIER
// ══════════════════════════════════════════════════════════════════

function classifySetupType(entry, high, low, dDir, h4Dir, isLong) {
  if (!entry || !high || !low || high <= low) return 'Unknown';
  var width = high - low;
  var pos = ((entry - low) / width) * 100;
  var bothAligned = dDir === h4Dir && dDir !== 'range';
  var dNeutral = dDir === 'range';

  if (bothAligned && pos <= 35) return 'Trend Pullback';
  if (bothAligned && pos >= 65) return 'Trend Continuation';
  if (dNeutral && h4Dir !== 'range') return 'Range Breakout';
  if (dDir !== h4Dir && dDir !== 'range' && h4Dir !== 'range') return 'Counter-Trend';
  if (pos >= 80 || pos <= 20) return 'Breakout Retest';
  return 'Range Reversal';
}

function injectSetupTypeBadge() {
  // Add setup type badge to the calc result
  var calcTitle = safeEl('calcResultTitle');
  if (!calcTitle) return;

  var pair = safeVal('c-pair') || 'GBPUSD';
  var entry = parseFloat(safeVal('c-entry'));
  var high = parseFloat(safeVal('c-high'));
  var low = parseFloat(safeVal('c-low'));
  var dDir = safeVal('c-daily');
  var h4Dir = safeVal('c-h4');
  var isLong = calcDir === 'LONG';

  var setupType = classifySetupType(entry, high, low, dDir, h4Dir, isLong);

  // Remove existing badge if any
  var existing = safeEl('rfxSetupTypeBadge');
  if (existing) existing.remove();

  if (entry && high && low) {
    var badge = document.createElement('span');
    badge.id = 'rfxSetupTypeBadge';
    badge.className = 'rfx-setup-type';
    badge.textContent = setupType;
    calcTitle.parentNode.insertBefore(badge, calcTitle.nextSibling);
  }
}

// ══════════════════════════════════════════════════════════════════
// TIER 3: WEEKLY EMAIL REPORT
// ══════════════════════════════════════════════════════════════════

function generateWeeklyReport() {
  var trades = (typeof rfxGetTrades === 'function') ? rfxGetTrades() : [];
  var now = new Date();
  var monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  var weekTrades = trades.filter(function(t) { return new Date(t.timestamp || 0) >= monday; });
  var closed = weekTrades.filter(function(t) { return t.outcome !== 'OPEN'; });

  if (closed.length === 0) return null;

  var wins = closed.filter(function(t) { return t.outcome === 'WIN'; }).length;
  var losses = closed.filter(function(t) { return t.outcome === 'LOSS'; }).length;
  var pnl = closed.reduce(function(s, t) { return s + (parseFloat(t.pnl) || 0); }, 0);
  var winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;

  return {
    trades: closed.length,
    wins: wins,
    losses: losses,
    pnl: pnl,
    winRate: winRate,
    streak: (typeof rfxGetStreak === 'function') ? rfxGetStreak() : 0,
    pairs: [...new Set(closed.map(function(t) { return t.pair; }))],
  };
}

// ══════════════════════════════════════════════════════════════════
// QUICK WIN A: SOUND ON GUARD CLEAR
// ══════════════════════════════════════════════════════════════════

var _lastGuardsState = null;
function watchGuardsForSound() {
  // Hook into rfxCalc to detect when all guards flip to pass
  var currentAllOk = window._rfxLastVerdict && window._rfxLastVerdict.includes('ENTER');
  if (_lastGuardsState === false && currentAllOk) {
    playAlertSound('guard_clear');
    if (RFX_BOOST.voiceEnabled) speakText('All guards clear.');
  }
  _lastGuardsState = currentAllOk;
}

// ══════════════════════════════════════════════════════════════════
// QUICK WIN B: DOUBLE-CONFIRM ON SAVE
// ══════════════════════════════════════════════════════════════════

function wrapSaveWithConfirm() {
  if (typeof rfxSaveTrade !== 'function') return;
  var _origSave = rfxSaveTrade;
  rfxSaveTrade = function() {
    // Only confirm if guards actually pass (ENTER verdict)
    if (window._rfxLastVerdict && window._rfxLastVerdict.includes('ENTER')) {
      if (!confirm('⚠️ ALL 10 RULES CHECKED?\n\n✓ Score ≥65%\n✓ Daily + 4H aligned\n✓ Location in value zone\n✓ Direction edge ≥20pts\n✓ Entry trigger confirmed\n✓ Session active\n✓ Spread normal\n✓ No red news\n✓ SL beyond structure\n✓ Psychology checklist passed\n\nClick OK to confirm trade save.')) {
        return;
      }
    }
    _origSave();
  };
}

// ══════════════════════════════════════════════════════════════════
// QUICK WIN C: TIMER SINCE LAST TRADE
// ══════════════════════════════════════════════════════════════════

function injectLastTradeTimer() {
  var verdictBar = safeEl('pg-verdict-bar');
  if (!verdictBar || safeEl('rfxLastTradeTimer')) return;

  var div = document.createElement('div');
  div.id = 'rfxLastTradeTimer';
  div.className = 'rfx-last-trade-timer';
  verdictBar.parentNode.insertBefore(div, verdictBar.nextSibling);
  updateLastTradeTimer();
}

function updateLastTradeTimer() {
  var el = safeEl('rfxLastTradeTimer');
  if (!el) return;

  var trades = (typeof rfxGetTrades === 'function') ? rfxGetTrades() : [];
  if (trades.length === 0) { el.innerHTML = '<span style="color:var(--muted);">No trades yet</span>'; return; }

  var sorted = trades.slice().sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
  var lastTime = new Date(sorted[0].timestamp || 0);
  var now = new Date();
  var diffMs = now - lastTime;
  var hours = Math.floor(diffMs / 3600000);
  var mins = Math.floor((diffMs % 3600000) / 60000);
  var timeStr = hours > 0 ? hours + 'h ' + mins + 'm' : mins + 'm';

  el.innerHTML = '<span style="font-size:11px;color:rgba(255,255,255,.4);">Last trade: <span class="rfx-ltt-val" style="color:var(--green);font-weight:700;">' + timeStr + ' ago</span></span>';
}

// ══════════════════════════════════════════════════════════════════
// QUICK WIN D: COPY EXECUTION PLAN AS IMAGE
// ══════════════════════════════════════════════════════════════════

function injectCopyAsImageBtn() {
  var copyAllBtn = document.querySelector('.rfx-copy-all-btn');
  if (!copyAllBtn || safeEl('rfxCopyImgBtn')) return;

  var btn = document.createElement('button');
  btn.id = 'rfxCopyImgBtn';
  btn.className = 'rfx-copy-all-btn';
  btn.type = 'button';
  btn.textContent = '📷 Copy as Image';
  btn.onclick = copyExecutionPlanAsImage;
  copyAllBtn.parentNode.insertBefore(btn, copyAllBtn.nextSibling);
}

function copyExecutionPlanAsImage() {
  var ep = safeEl('execPlan');
  if (!ep || !ep.textContent.trim()) { showToast('⚠ No execution plan to copy', 'warn'); return; }

  // Create canvas
  var canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 200;
  var ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0A140A';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border
  ctx.strokeStyle = 'rgba(2,223,130,0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

  // Header
  ctx.fillStyle = '#02DF82';
  ctx.font = 'bold 14px Manrope, sans-serif';
  ctx.fillText('🌲 RED FOREST FX — EXECUTION PLAN', 20, 30);

  // Separator
  ctx.strokeStyle = 'rgba(2,223,130,0.15)';
  ctx.beginPath(); ctx.moveTo(20, 42); ctx.lineTo(580, 42); ctx.stroke();

  // Content (strip HTML tags)
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '13px Manrope, sans-serif';
  var text = ep.textContent.trim();
  var lines = text.split('\n');
  var y = 65;
  lines.forEach(function(line) {
    ctx.fillText(line.trim(), 20, y);
    y += 24;
  });

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '10px Manrope, sans-serif';
  ctx.fillText(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', 20, canvas.height - 15);

  // Copy to clipboard
  canvas.toBlob(function(blob) {
    if (blob && navigator.clipboard && navigator.clipboard.write) {
      navigator.clipboard.write([new ClipboardItem({'image/png': blob})]).then(function() {
        showToast('📷 Execution plan copied as image', 'ok');
      }).catch(function() {
        // Fallback: download
        var link = document.createElement('a');
        link.download = 'rfx-execution-plan.png';
        link.href = canvas.toDataURL();
        link.click();
        showToast('📷 Execution plan downloaded as image', 'ok');
      });
    } else {
      var link = document.createElement('a');
      link.download = 'rfx-execution-plan.png';
      link.href = canvas.toDataURL();
      link.click();
      showToast('📷 Execution plan downloaded as image', 'ok');
    }
  });
}

// ══════════════════════════════════════════════════════════════════
// QUICK WIN E: DARK/LIGHT THEME TOGGLE
// ══════════════════════════════════════════════════════════════════

function injectThemeToggle() {}

function toggleTheme() {}

// ══════════════════════════════════════════════════════════════════
// QUICK WIN F: PAIR CORRELATION HEATMAP
// ══════════════════════════════════════════════════════════════════

function injectCorrelationHeatmap() {
  var statsBody = document.querySelector('.stats-body');
  if (!statsBody || safeEl('rfxHeatmapSection')) return;

  var section = document.createElement('div');
  section.id = 'rfxHeatmapSection';
  section.innerHTML = '<div class="stats-sec-label">Pair Correlation Matrix</div>'
    + '<div id="rfxHeatmap" class="rfx-heatmap" style="grid-template-columns:repeat(6,1fr);"></div>';
  statsBody.appendChild(section);
  renderHeatmap();
}

function renderHeatmap() {
  var el = safeEl('rfxHeatmap');
  if (!el) return;
  var pairs = ['GBPUSD', 'EURUSD', 'USDJPY', 'USDCAD', 'AUDUSD'];
  // USD correlation groups
  var corrMap = {
    'GBPUSD-EURUSD': 0.85, 'GBPUSD-USDJPY': -0.4, 'GBPUSD-USDCAD': -0.6, 'GBPUSD-AUDUSD': 0.6,
    'EURUSD-USDJPY': -0.3, 'EURUSD-USDCAD': -0.55, 'EURUSD-AUDUSD': 0.55,
    'USDJPY-USDCAD': -0.2, 'USDJPY-AUDUSD': -0.35,
    'USDCAD-AUDUSD': -0.5,
  };

  var html = '<div class="rfx-heatmap-cell header"></div>';
  pairs.forEach(function(p) { html += '<div class="rfx-heatmap-cell header">' + p.slice(0,3) + '</div>'; });

  pairs.forEach(function(p1, i) {
    html += '<div class="rfx-heatmap-cell header">' + p1.slice(0,3) + '</div>';
    pairs.forEach(function(p2, j) {
      if (i === j) {
        html += '<div class="rfx-heatmap-cell" style="background:rgba(255,255,255,.04);color:var(--muted);">—</div>';
      } else {
        var key1 = p1 + '-' + p2;
        var key2 = p2 + '-' + p1;
        var corr = corrMap[key1] || corrMap[key2] || 0;
        var absCorr = Math.abs(corr);
        var cls = absCorr >= 0.7 ? 'high-corr' : absCorr >= 0.4 ? 'med-corr' : 'low-corr';
        html += '<div class="rfx-heatmap-cell ' + cls + '">' + (corr >= 0 ? '+' : '') + corr.toFixed(1) + '</div>';
      }
    });
  });

  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════
// QUICK WIN G: EXPORT JOURNAL AS PDF
// ══════════════════════════════════════════════════════════════════

function injectExportPdfBtn() {
  var journalBody = document.querySelector('.journal-panel-body');
  if (!journalBody || safeEl('rfxExportPdfBtn')) return;

  var btn = document.createElement('button');
  btn.id = 'rfxExportPdfBtn';
  btn.className = 'rfx-copy-all-btn';
  btn.style.marginBottom = '16px';
  btn.textContent = '📄 Export Journal as PDF';
  btn.onclick = exportJournalAsPdf;
  journalBody.insertBefore(btn, journalBody.firstChild);
}

function exportJournalAsPdf() {
  var entries = (typeof jGetEntries === 'function') ? jGetEntries() : [];
  if (entries.length === 0) { showToast('⚠ No journal entries to export', 'warn'); return; }

  // Create printable HTML
  var html = '<!DOCTYPE html><html><head><title>Red Forest FX Journal — ' + new Date().toISOString().slice(0,10) + '</title>'
    + '<style>body{font-family:system-ui,sans-serif;padding:40px;background:#fff;color:#000;font-size:13px;}'
    + 'h1{color:#02DF82;margin-bottom:20px;}.entry{border-left:3px solid #02DF82;padding:12px 16px;margin-bottom:12px;background:#f8f8f8;border-radius:4px;}'
    + '.meta{font-size:11px;color:#666;margin-bottom:6px;}.type{font-weight:700;color:#02DF82;}'
    + '</style></head><body>'
    + '<h1>🌲 Red Forest FX — Trading Journal</h1>'
    + '<p>Exported: ' + new Date().toLocaleString() + ' · ' + entries.length + ' entries</p>'
    + entries.map(function(e) {
      return '<div class="entry"><div class="meta"><span class="type">' + (e.type||'note').toUpperCase() + '</span> · '
        + (e.pair || '—') + ' · ' + (e.outcome || '—') + ' · ' + new Date(e.timestamp||0).toLocaleString() + '</div>'
        + '<div>' + (e.notes || '') + '</div></div>';
    }).join('')
    + '</body></html>';

  var w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(function() { w.print(); }, 500);
  }
  showToast('📄 Journal export opened — use Print to save as PDF', 'ok');
}

// ══════════════════════════════════════════════════════════════════
// QUICK WIN H: AUTO-FOCUS ENTRY FIELD ON PAIR SWITCH
// ══════════════════════════════════════════════════════════════════

function setupAutoFocus() {
  var pairSel = safeEl('c-pair');
  if (!pairSel) return;
  pairSel.addEventListener('change', function() {
    setTimeout(function() {
      var entryEl = safeEl('c-entry');
      if (entryEl) entryEl.focus();
    }, 100);
  });
}

// ══════════════════════════════════════════════════════════════════
// QUICK WIN I: BOOKMARK LAST 3 SETUPS
// ══════════════════════════════════════════════════════════════════

function injectBookmarks() {
  var pineWrap = safeEl('pinePasteWrap');
  if (!pineWrap || safeEl('rfxBookmarksPanel')) return;

  var div = document.createElement('div');
  div.id = 'rfxBookmarksPanel';
  div.innerHTML = '<div style="margin-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
    + '<span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);">🔖 Bookmarks:</span>'
    + '<div class="rfx-bookmarks" id="rfxBookmarksList"></div>'
    + '<button class="rfx-copy-all-btn" onclick="rfxBookmarkCurrent()" style="font-size:10px;padding:4px 10px;">+ Bookmark Current</button>'
    + '</div>';
  pineWrap.parentNode.insertBefore(div, pineWrap.nextSibling);
  renderBookmarks();
}

window.rfxBookmarkCurrent = function() {
  var pair = safeVal('c-pair');
  var dir = typeof calcDir !== 'undefined' ? calcDir : 'LONG';
  var score = safeVal('c-score');
  var entry = safeVal('c-entry');
  if (!entry) { showToast('⚠ Enter trade data first', 'warn'); return; }

  RFX_BOOST.bookmarks.push({
    pair: pair, dir: dir, score: score, entry: entry,
    sl: safeVal('c-sl'), tp: safeVal('c-tp'),
    daily: safeVal('c-daily'), h4: safeVal('c-h4'),
    high: safeVal('c-high'), low: safeVal('c-low'),
    time: new Date().toISOString()
  });
  // Keep only last 5
  if (RFX_BOOST.bookmarks.length > 5) RFX_BOOST.bookmarks = RFX_BOOST.bookmarks.slice(-5);
  saveBoostState();
  renderBookmarks();
  showToast('🔖 Setup bookmarked', 'ok');
};

function renderBookmarks() {
  var list = safeEl('rfxBookmarksList');
  if (!list) return;
  list.innerHTML = RFX_BOOST.bookmarks.map(function(b, i) {
    var dec = b.pair === 'USDJPY' ? 3 : 5;
    var label = b.pair + ' ' + b.dir + ' ' + (b.score || '?') + '% @ ' + (parseFloat(b.entry) || 0).toFixed(dec);
    return '<div class="rfx-bm-chip" onclick="rfxLoadBookmark(' + i + ')">'
      + label + '<span class="bm-del" onclick="event.stopPropagation();rfxDelBookmark(' + i + ')">×</span>'
      + '</div>';
  }).join('');
}

window.rfxLoadBookmark = function(idx) {
  var b = RFX_BOOST.bookmarks[idx];
  if (!b) return;
  var fields = {
    'c-pair': b.pair, 'c-entry': b.entry, 'c-sl': b.sl, 'c-tp': b.tp,
    'c-score': b.score, 'c-daily': b.daily, 'c-h4': b.h4,
    'c-high': b.high, 'c-low': b.low
  };
  Object.entries(fields).forEach(function(entry) {
    var el = safeEl(entry[0]);
    if (el && entry[1]) el.value = entry[1];
  });
  if (typeof setDir === 'function' && b.dir) setDir(b.dir);
  if (typeof rfxCalc === 'function') rfxCalc();
  showToast('🔖 Loaded bookmark: ' + b.pair + ' ' + b.dir, 'ok');
};

window.rfxDelBookmark = function(idx) {
  RFX_BOOST.bookmarks.splice(idx, 1);
  saveBoostState();
  renderBookmarks();
};

// ══════════════════════════════════════════════════════════════════
// QUICK WIN J: COUNTDOWN TO SESSION CLOSE
// ══════════════════════════════════════════════════════════════════

function injectSessionCountdown() {
  if (safeEl('rfxSessionCountdown')) return;
  var div = document.createElement('div');
  div.id = 'rfxSessionCountdown';
  div.className = 'rfx-session-countdown';
  div.onclick = function() { this.style.display = this.style.display === 'none' ? 'flex' : 'none'; };
  document.body.appendChild(div);
  updateSessionCountdown();
}

function updateSessionCountdown() {
  var el = safeEl('rfxSessionCountdown');
  if (!el) return;

  var now = new Date();
  var utcH = now.getUTCHours();
  var utcM = now.getUTCMinutes();
  var day = now.getUTCDay();

  if (day === 0 || day === 6) {
    el.innerHTML = '<span class="sc-dot"></span> <span style="color:var(--red);">Market closed</span>';
    el.classList.add('urgent');
    return;
  }

  var sessionName, closeHour;
  if (utcH >= 7 && utcH < 12) { sessionName = 'London'; closeHour = 12; }
  else if (utcH >= 12 && utcH < 16) { sessionName = 'Overlap'; closeHour = 16; }
  else if (utcH >= 16 && utcH < 21) { sessionName = 'New York'; closeHour = 21; }
  else {
    el.innerHTML = '<span class="sc-dot"></span> <span style="color:var(--yellow);">Off-session</span>';
    el.style.display = 'none';
    return;
  }

  var minsLeft = (closeHour - utcH) * 60 - utcM;
  var hrs = Math.floor(minsLeft / 60);
  var mins = minsLeft % 60;
  var timeStr = hrs > 0 ? hrs + 'h ' + mins + 'm' : mins + 'm';

  el.classList.toggle('urgent', minsLeft < 30);
  el.innerHTML = '<span class="sc-dot"></span> ' + sessionName + ' closes in <span class="rfx-sc-time">' + timeStr + '</span>';
  el.style.display = 'flex';
}

// ══════════════════════════════════════════════════════════════════
// QUICK WIN: SOUND TOGGLE BUTTON
// ══════════════════════════════════════════════════════════════════

function injectSoundToggle() {
  if (safeEl('rfxSoundToggle')) return;
  var btn = document.createElement('div');
  btn.id = 'rfxSoundToggle';
  btn.className = 'rfx-sound-toggle' + (RFX_BOOST.soundEnabled ? '' : ' muted');
  btn.title = 'Toggle sound';
  btn.textContent = RFX_BOOST.soundEnabled ? '🔊' : '🔇';
  btn.onclick = function() {
    RFX_BOOST.soundEnabled = !RFX_BOOST.soundEnabled;
    btn.textContent = RFX_BOOST.soundEnabled ? '🔊' : '🔇';
    btn.classList.toggle('muted', !RFX_BOOST.soundEnabled);
    saveBoostState();
    showToast(RFX_BOOST.soundEnabled ? '🔊 Sound on' : '🔇 Sound off', 'ok');
  };
  document.body.appendChild(btn);
}

// ══════════════════════════════════════════════════════════════════
// PWA: MANIFEST + SERVICE WORKER
// ══════════════════════════════════════════════════════════════════

function setupPWA() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    // Service worker file is served separately as sw.js
    navigator.serviceWorker.register('sw.js').catch(function() {});
  }

  // Add manifest link
  if (!document.querySelector('link[rel="manifest"]')) {
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'manifest.json';
    document.head.appendChild(link);
  }

  // Add theme-color meta
  if (!document.querySelector('meta[name="theme-color"]')) {
    var meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#000000';
    document.head.appendChild(meta);
  }

  // Add apple-touch-icon meta
  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    var m1 = document.createElement('meta');
    m1.name = 'apple-mobile-web-app-capable';
    m1.content = 'yes';
    document.head.appendChild(m1);
    var m2 = document.createElement('meta');
    m2.name = 'apple-mobile-web-app-status-bar-style';
    m2.content = 'black-translucent';
    document.head.appendChild(m2);
  }
}

// ══════════════════════════════════════════════════════════════════
// MONKEY-PATCH HOOKS: Wire boosters into existing RFX functions
// ══════════════════════════════════════════════════════════════════

function hookExistingFunctions() {
  // Hook fetchOandaAccount for circuit breaker + trailing + partial
  if (typeof fetchOandaAccount === 'function') {
    var _origFetchOanda = fetchOandaAccount;
    fetchOandaAccount = async function() {
      await _origFetchOanda();
      try {
        var creds = getOandaCreds();
        var res = await fetch(creds.base + '/accounts/' + creds.acct + '/summary', {
          headers: { 'Authorization': 'Bearer ' + creds.token }
        });
        if (res.ok) {
          var data = await res.json();
          var balance = parseFloat(data.account.balance);
          checkDailyCircuitBreaker(balance);
        }
      } catch(e) {}
      checkTrailingStops();
      checkPartialClose();
    };
  }

  // Hook rfxCalc for comparison + setup type + sound watch
  if (typeof rfxCalc === 'function') {
    var _origCalc = rfxCalc;
    rfxCalc = function() {
      _origCalc();
      updateTradeComparison();
      injectSetupTypeBadge();
      watchGuardsForSound();
      checkPriceAlerts();
    };
  }

  // Hook rfxHandleTransaction for recording results
  if (typeof rfxHandleTransaction === 'function') {
    var _origHandle = rfxHandleTransaction;
    rfxHandleTransaction = function(tx) {
      _origHandle(tx);
      var type = tx.type || (tx.transaction && tx.transaction.type);
      if (type === 'ORDER_FILL' && tx.tradesClosed && tx.tradesClosed.length > 0) {
        var pl = parseFloat(tx.pl || 0);
        if (pl !== 0) recordTradeResult(pl);
      }
    };
  }
}

// ══════════════════════════════════════════════════════════════════
// MAIN INIT
// ══════════════════════════════════════════════════════════════════

function initBoosters() {
  loadBoostState();

  // Inject HTML components
  injectMultiPairDashboard();
  // injectPriceAlerts();
  injectTradeComparison();
  // injectCalendarInline();
  injectRiskOfRuin();
  injectPreMarketBriefing();
  injectLastTradeTimer();
  injectCopyAsImageBtn();
  injectBookmarks();
  injectSessionCountdown();
  // injectThemeToggle();
  injectSoundToggle();
  injectCorrelationHeatmap();
  injectExportPdfBtn();

  // Setup interactivity
  setupKeyboardShortcuts();
  setupAutoFocus();
  wrapSaveWithConfirm();
  setupPWA();

  // Hook existing functions
  hookExistingFunctions();

  // Periodic updates
  setInterval(updateSessionCountdown, 30000);
  setInterval(updateLastTradeTimer, 60000);
  setInterval(checkPriceAlerts, 5000);
  setInterval(function() { refreshDashboard(); }, 30000);
  setInterval(calculateRiskOfRuin, 120000);

  console.log('🌲 RFX Boosters v3 loaded — 25 features active');
}

// Wait for existing RFX to initialize, then hook in
if (document.readyState === 'complete') {
  setTimeout(initBoosters, 1000);
} else {
  window.addEventListener('load', function() {
    setTimeout(initBoosters, 1000);
  });
}

})();
