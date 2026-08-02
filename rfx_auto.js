/* ═════════════════════════════════════════════════════════════════
   RFX AUTO v3 — Enhanced Scanner
   ══════════════════════════════════════════════════════════════════
   • 6 pairs (added NZDUSD)
   • 30s polling interval
   • Sound alerts on qualifying setups
   • Browser notifications
   • Safely wrapped — can't break the site
   ══════════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  try {

  // ─ OANDA Credentials ──
  var OANDA_TOKEN = (typeof RFX_CONFIG !== 'undefined' ? RFX_CONFIG.oandaToken : '');
  var OANDA_BASE  = 'https://api-fxpractice.oanda.com/v3';

  // ── 6 Approved pairs + defaults ──
  var PAIRS = ['GBPUSD', 'EURUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'NZDUSD'];
  var INSTR_MAP = {
    GBPUSD: 'GBP_USD', EURUSD: 'EUR_USD', USDJPY: 'USD_JPY',
    USDCAD: 'USD_CAD', AUDUSD: 'AUD_USD', NZDUSD: 'NZD_USD'
  };
  var PIP = { GBPUSD: 0.0001, EURUSD: 0.0001, USDJPY: 0.01, USDCAD: 0.0001, AUDUSD: 0.0001, NZDUSD: 0.0001 };
  var STOP_PIPS = { GBPUSD: 25, EURUSD: 20, USDJPY: 35, USDCAD: 25, AUDUSD: 25, NZDUSD: 25 };
  var MIN_SCORE = 65;
  var MIN_DIR_EDGE = 20;
  var LONG_MAX_POS = 45;
  var SHORT_MIN_POS = 55;

  // ── State ──
  var pairData = {};
  var lastAlertTime = {};
  var radarOpen = false;
  var radarMinimized = false;
  var notifPermissionRequested = false;

  // ── Sound (Web Audio API — no files needed) ──
  var audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { return null; }
    }
    return audioCtx;
  }

  function playQualifySound() {
    var ctx = getAudioCtx();
    if (!ctx) return;
    // Ascending triad: C5 → E5 → G5
    var notes = [523.25, 659.25, 783.99];
    var t = ctx.currentTime;
    notes.forEach(function(freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, t + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 0.3);
    });
  }

  function playTickSound() {
    var ctx = getAudioCtx();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  // ── Browser Notifications ──
  function requestNotifPermission() {
    if (notifPermissionRequested) return;
    notifPermissionRequested = true;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(function(perm) {
        console.log('[RFX Auto] Notification permission:', perm);
      });
    }
  }

  function sendNotif(pair, data) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification('⚡ RFX: ' + pair + ' ' + data.dir + ' QUALIFIES', {
        body: 'Score: ' + data.score + '% · Setup: ' + data.setupType + ' · ' + data.killzoneLabel,
        tag: 'rfx-' + pair,
        silent: true
      });
    } catch(e) {}
  }

  // ── Safe helpers ──
  function safeToast(msg, type) {
    try {
      if (typeof rfxShowToast === 'function') rfxShowToast(msg, type);
      else console.log('[RFX Auto]', msg);
    } catch(e) { console.log('[RFX Auto]', msg); }
  }

  function safeSetDir(dir) {
    try { if (typeof setDir === 'function') setDir(dir); } catch(e) {}
  }

  function safeCalc() {
    try { if (typeof rfxCalc === 'function') rfxCalc(); } catch(e) {}
  }

  // ═══════════════════════════════════════════════════════════════
  // OANDA DATA FETCHING
  // ═══════════════════════════════════════════════════════════════

  function fetchCandles(instrument, granularity, count) {
    return fetch(OANDA_BASE + '/instruments/' + instrument + '/candles?granularity=' + granularity + '&count=' + count, {
      headers: { 'Authorization': 'Bearer ' + OANDA_TOKEN }
    })
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(data) { return data ? (data.candles || []) : null; })
    .catch(function() { return null; });
  }

  function calcEMA(data, period) {
    if (!data || data.length < period) return null;
    var k = 2 / (period + 1);
    var ema = data[0];
    for (var i = 1; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
    return ema;
  }

  function getDir(c, e21, e50, e200) {
    if (c > e21 && e21 > e50 && e50 > e200) return 'up';
    if (c < e21 && e21 < e50 && e50 < e200) return 'down';
    if (c > e50 && e50 > e200) return 'up';
    if (c < e50 && e50 < e200) return 'down';
    if (c > e50) return 'up';
    if (c < e50) return 'down';
    return 'range';
  }

  function scoreDir(d, isLong, aligned, range) {
    if (isLong) return d === 'up' ? aligned : d === 'range' ? range : 0;
    return d === 'down' ? aligned : d === 'range' ? range : 0;
  }

  function scoreEmaBias(c, e21, e50, e200, isLong, maxPts) {
    var s = 0;
    if (isLong) {
      if (c > e21) s += Math.round(maxPts * 0.35);
      if (c > e50) s += Math.round(maxPts * 0.35);
      if (e21 > e50) s += Math.round(maxPts * 0.20);
      if (c > e200) s += Math.round(maxPts * 0.10);
    } else {
      if (c < e21) s += Math.round(maxPts * 0.35);
      if (c < e50) s += Math.round(maxPts * 0.35);
      if (e21 < e50) s += Math.round(maxPts * 0.20);
      if (c < e200) s += Math.round(maxPts * 0.10);
    }
    return Math.min(maxPts, s);
  }

  function scoreCandleMomentum(c, prev, isLong, maxPts) {
    var rng = Math.max(Math.abs(c - prev), 0.0001);
    var body = Math.abs(c - prev);
    var closePos = isLong ? (c - Math.min(c, prev)) / rng : (Math.max(c, prev) - c) / rng;
    var s = 0;
    if (isLong ? c > prev : c < prev) s += Math.round(maxPts * 0.40);
    if (closePos >= 0.60) s += Math.round(maxPts * 0.35);
    if (body / rng >= 0.35) s += Math.round(maxPts * 0.25);
    return Math.min(maxPts, s);
  }

  function scoreLocation(c, sh, sl, isLong, maxPts) {
    var width = Math.max(sh - sl, 0.00001);
    var pos = (c - sl) / width * 100;
    var s = 0;
    if (isLong) {
      if (pos <= 35) s += Math.round(maxPts * 0.55);
      else if (pos <= 50) s += Math.round(maxPts * 0.35);
      else if (pos <= 65) s += Math.round(maxPts * 0.15);
      if (Math.abs(c - sl) / Math.max(sl, 0.0001) * 100 <= 0.5) s += Math.round(maxPts * 0.10);
    } else {
      if (pos >= 65) s += Math.round(maxPts * 0.55);
      else if (pos >= 50) s += Math.round(maxPts * 0.35);
      else if (pos >= 35) s += Math.round(maxPts * 0.15);
      if (Math.abs(c - sh) / Math.max(sh, 0.0001) * 100 <= 0.5) s += Math.round(maxPts * 0.10);
    }
    return Math.min(maxPts, s);
  }

  function detectBRT(c, cp, sh, sl, isLong) {
    if (isLong) return cp > sl && c > sl;
    return cp < sh && c < sh;
  }

  function detectSOS(c, o, pc, po, isLong) {
    var body = Math.abs(c - o);
    var pb = Math.abs(pc - po);
    if (isLong) return c > o && body > pb * 1.5;
    return c < o && body > pb * 1.5;
  }

  function detectEngulf(c, o, pc, po, isLong) {
    var body = Math.abs(c - o);
    var pb = Math.abs(pc - po);
    if (isLong) return c > o && pc < po && c >= po && o <= pc && body >= pb;
    return c < o && pc > po && c <= po && o >= pc && body >= pb;
  }

  // ═══════════════════════════════════════════════════════════════
  // PAIR SCORING
  // ═══════════════════════════════════════════════════════════════

  function fetchPairData(pair) {
    var instr = INSTR_MAP[pair];
    var pip = PIP[pair];

    return Promise.all([
      fetchCandles(instr, 'D', 25),
      fetchCandles(instr, 'H4', 15),
      fetchCandles(instr, 'H1', 60)
    ])
    .then(function(results) {
      var dCandles = results[0], h4Candles = results[1], h1Candles = results[2];
      if (!dCandles || !h4Candles || !h1Candles) return null;

      var dComp = dCandles.filter(function(c) { return c.complete; });
      var h4Comp = h4Candles.filter(function(c) { return c.complete; });
      var h1Comp = h1Candles.filter(function(c) { return c.complete; });
      if (dComp.length < 3 || h4Comp.length < 3 || h1Comp.length < 10) return null;

      var dCloses = dComp.map(function(c) { return parseFloat(c.mid.c); });
      var dHighs = dComp.map(function(c) { return parseFloat(c.mid.h); });
      var dLows = dComp.map(function(c) { return parseFloat(c.mid.l); });
      var h4Closes = h4Comp.map(function(c) { return parseFloat(c.mid.c); });
      var h4Highs = h4Comp.map(function(c) { return parseFloat(c.mid.h); });
      var h4Lows = h4Comp.map(function(c) { return parseFloat(c.mid.l); });
      var h1Closes = h1Comp.map(function(c) { return parseFloat(c.mid.c); });
      var h1Opens = h1Comp.map(function(c) { return parseFloat(c.mid.o); });
      var h1Highs = h1Comp.map(function(c) { return parseFloat(c.mid.h); });
      var h1Lows = h1Comp.map(function(c) { return parseFloat(c.mid.l); });

      var dClose = dCloses[dCloses.length - 1], dPrev = dCloses[dCloses.length - 2];
      var h4Close = h4Closes[h4Closes.length - 1], h4Prev = h4Closes[h4Closes.length - 2];
      var curClose = h1Closes[h1Closes.length - 1], curOpen = h1Opens[h1Opens.length - 1];
      var prevClose = h1Closes[h1Closes.length - 2], prevOpen = h1Opens[h1Opens.length - 2];

      var high20 = Math.max.apply(null, h1Highs.slice(-20));
      var low20 = Math.min.apply(null, h1Lows.slice(-20));

      var dE21 = calcEMA(dCloses, 21), dE50 = calcEMA(dCloses, 50), dE200 = calcEMA(dCloses, 200);
      var h4E21 = calcEMA(h4Closes, 21), h4E50 = calcEMA(h4Closes, 50), h4E200 = calcEMA(h4Closes, 200);
      var h1E21 = calcEMA(h1Closes, 21), h1E50 = calcEMA(h1Closes, 50), h1E200 = calcEMA(h1Closes, 200);

      var dDir = getDir(dClose, dE21, dE50, dE200);
      var h4Dir = getDir(h4Close, h4E21, h4E50, h4E200);
      var h1Dir = getDir(curClose, h1E21, h1E50, h1E200);

      // Direction scoring
      var longDS = 0, shortDS = 0;
      longDS += scoreDir(dDir, true, 18, 8) + scoreEmaBias(dClose, dE21, dE50, dE200, true, 18);
      shortDS += scoreDir(dDir, false, 18, 8) + scoreEmaBias(dClose, dE21, dE50, dE200, false, 18);
      longDS += scoreDir(h4Dir, true, 12, 6) + scoreEmaBias(h4Close, h4E21, h4E50, h4E200, true, 12);
      shortDS += scoreDir(h4Dir, false, 12, 6) + scoreEmaBias(h4Close, h4E21, h4E50, h4E200, false, 12);
      longDS += scoreDir(h1Dir, true, 4, 2) + scoreEmaBias(curClose, h1E21, h1E50, h1E200, true, 5);
      shortDS += scoreDir(h1Dir, false, 4, 2) + scoreEmaBias(curClose, h1E21, h1E50, h1E200, false, 5);
      if (curClose > curOpen) longDS += 5; else shortDS += 5;
      if (dClose > dPrev) longDS += 5; else shortDS += 5;

      var rangeW = high20 - low20;
      var pos = rangeW > 0 ? ((curClose - low20) / rangeW) * 100 : 50;
      if (pos < 30) longDS += 10; else if (pos < 50) longDS += 5;
      if (pos > 70) shortDS += 10; else if (pos > 50) shortDS += 5;

      var emaDist = h1E50 > 0 ? Math.abs(curClose - h1E50) / h1E50 * 100 : 999;
      if (emaDist < 0.5) { longDS += 5; shortDS += 5; }

      var dirDiff = Math.abs(longDS - shortDS);
      var autoDir = longDS >= shortDS ? 'LONG' : 'SHORT';
      var isLong = autoDir === 'LONG';

      // Scoring
      var wScore = Math.min(60, scoreDir(dDir, isLong, 18, 8) + scoreEmaBias(dClose, dE21, dE50, dE200, isLong, 18));
      var dScore = Math.min(60, scoreDir(dDir, isLong, 18, 8) + scoreEmaBias(dClose, dE21, dE50, dE200, isLong, 16) + scoreCandleMomentum(dClose, dPrev, isLong, 10) + scoreLocation(dClose, Math.max.apply(null, dHighs.slice(-20)), Math.min.apply(null, dLows.slice(-20)), isLong, 8));
      var h4Score = Math.min(45, scoreDir(h4Dir, isLong, 12, 6) + scoreEmaBias(h4Close, h4E21, h4E50, h4E200, isLong, 12) + scoreCandleMomentum(h4Close, h4Prev, isLong, 8) + scoreLocation(h4Close, Math.max.apply(null, h4Highs.slice(-20)), Math.min.apply(null, h4Lows.slice(-20)), isLong, 6));
      var ltfScore = Math.min(15, scoreDir(h1Dir, isLong, 4, 2) + scoreEmaBias(curClose, h1E21, h1E50, h1E200, isLong, 5) + scoreCandleMomentum(curClose, prevClose, isLong, 4) + (detectBRT(curClose, prevClose, high20, low20, isLong) ? 2 : 0));

      var entryScore = 0;
      entryScore += detectSOS(curClose, curOpen, prevClose, prevOpen, isLong) ? 7 : 0;
      entryScore += detectEngulf(curClose, curOpen, prevClose, prevOpen, isLong) ? 5 : 0;
      entryScore += scoreCandleMomentum(curClose, prevClose, isLong, 5);
      entryScore += (isLong ? curClose > h1E21 : curClose < h1E21) ? 3 : 0;
      entryScore = Math.min(20, entryScore);

      var totalScore = wScore + dScore + h4Score + ltfScore + entryScore;
      var totalPct = (totalScore / 200.0) * 100;

      // Guards
      var rangePos = ((curClose - low20) / Math.max(high20 - low20, 0.00001)) * 100;
      var locationOk = isLong ? rangePos <= LONG_MAX_POS : rangePos >= SHORT_MIN_POS;
      var scoreOk = totalPct >= MIN_SCORE;
      var dirEdgeOk = dirDiff >= MIN_DIR_EDGE;
      var dAligned = isLong ? dDir === 'up' : dDir === 'down';
      var h4Aligned = isLong ? h4Dir === 'up' : h4Dir === 'down';
      var dNeutral = dDir === 'range';
      var mtfOk = (dAligned && h4Aligned) || (totalPct >= 85 && h4Aligned) || (dNeutral && h4Aligned && totalPct >= 75);
      var entryOk = entryScore >= 6 && ltfScore >= 6;

      // Session
      var utcH = new Date().getUTCHours();
      var session = utcH >= 12 && utcH < 16 ? 'OVERLAP' : utcH >= 7 && utcH < 12 ? 'LONDON' : utcH >= 16 && utcH < 21 ? 'NY' : 'CLOSED';
      var sessionAllowed = (utcH >= 7 && utcH < 12) || (utcH >= 12 && utcH < 16) || (utcH >= 16 && utcH < 21);

      // Killzone
      var silverBullet = utcH === 15;
      var killzoneLabel = 'Off-killzone';
      if (silverBullet) killzoneLabel = 'SILVER BULLET';
      else if (utcH >= 7 && utcH < 10) killzoneLabel = 'London KZ';
      else if (utcH >= 13 && utcH < 16) killzoneLabel = 'NY Killzone';

      var effectiveRR = session === 'LONDON' ? 4.0 : session === 'OVERLAP' ? 3.5 : session === 'NY' ? 3.0 : 2.0;

      // Setup type
      var bothAligned = dDir === h4Dir && dDir !== 'range';
      var counterTrend = dDir !== h4Dir && dDir !== 'range' && h4Dir !== 'range';
      var setupType = 'RANGE REVERSAL';
      if (bothAligned && rangePos <= 35) setupType = 'TREND PULLBACK';
      else if (bothAligned && rangePos >= 65) setupType = 'TREND CONTINUATION';
      else if (dNeutral && h4Dir !== 'range') setupType = 'RANGE BREAKOUT';
      else if (counterTrend) setupType = 'COUNTER-TREND';

      var allGuardsPass = scoreOk && sessionAllowed && mtfOk && locationOk && dirEdgeOk && entryOk;

      var stopPips = STOP_PIPS[pair];
      var stopDist = stopPips * pip;
      var tpDist = stopPips * effectiveRR * pip;
      var entryPrice = curClose;
      var sl = isLong ? entryPrice - stopDist : entryPrice + stopDist;
      var tp = isLong ? entryPrice + tpDist : entryPrice - tpDist;

      return {
        pair: pair, dir: autoDir, score: Math.round(totalPct),
        daily: dDir, h4: h4Dir, entry: entryPrice, sl: sl, tp: tp,
        stopPips: stopPips, rr: '1:' + effectiveRR.toFixed(1),
        location: Math.round(rangePos) + '%',
        guards: allGuardsPass ? 'ALL PASS' : 'WAIT',
        setupType: setupType, killzoneLabel: killzoneLabel,
        session: session, sessionAllowed: sessionAllowed,
        allGuardsPass: allGuardsPass, silverBullet: silverBullet
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // UI: RADAR PANEL
  // ═══════════════════════════════════════════════════════════════

  function injectRadar() {
    if (document.getElementById('rfxRadarPanel')) return;

    var radar = document.createElement('div');
    radar.id = 'rfxRadarPanel';

    // Header — always visible (click to toggle minimize/expand)
    var header = document.createElement('div');
    header.id = 'rfxRadarHeader';
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;' +
      'background:rgba(2,223,130,0.1);border-bottom:1px solid rgba(2,223,130,0.2);' +
      'cursor:pointer;user-select:none;';
    header.innerHTML =
      '<span style="font-size:14px;font-weight:700;color:#02DF82;pointer-events:none;">📡 Multi-Pair Radar</span>' +
      '<span id="rfxRadarQualifyCount" style="font-size:10px;font-weight:800;background:#02DF82;color:#0A140A;padding:2px 7px;border-radius:999px;display:none;pointer-events:none;margin-right:8px;">0</span>' +
      '<span id="rfxRadarCloseBtn" style="font-size:18px;cursor:pointer;color:rgba(255,255,255,0.5);pointer-events:none;">✕</span>';
    header.addEventListener('click', function() { toggleRadarMinimize(); });

    // Grid content
    var grid = document.createElement('div');
    grid.id = 'rfxRadarGrid';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px;';

    radar.appendChild(header);
    radar.appendChild(grid);

    Object.assign(radar.style, {
      position: 'fixed', top: '75px', right: '15px', width: '480px',
      background: '#0A140A', border: '1px solid rgba(2,223,130,0.2)',
      borderRadius: '12px', zIndex: '2000', display: 'none',
      boxShadow: '0 8px 32px rgba(0,0,0,0.8)', fontFamily: 'Manrope, sans-serif',
      transition: 'all .25s ease'
    });
    document.body.appendChild(radar);

    // Floating toggle button (only shows when radar is fully closed)
    var btn = document.createElement('div');
    btn.id = 'rfxRadarToggle';
    btn.textContent = '📡';
    btn.title = 'Toggle Multi-Pair Radar';
    Object.assign(btn.style, {
      position: 'fixed', top: '75px', right: '15px', width: '40px', height: '40px',
      background: '#0A140A', border: '1px solid rgba(2,223,130,0.3)',
      borderRadius: '50%', color: '#02DF82', fontSize: '18px',
      cursor: 'pointer', zIndex: '1999',
      display: 'none', alignItems: 'center', justifyContent: 'center',
      transition: 'all .2s'
    });
    btn.addEventListener('mouseenter', function() { btn.style.borderColor = 'rgba(2,223,130,0.6)'; btn.style.transform = 'scale(1.1)'; });
    btn.addEventListener('mouseleave', function() { btn.style.borderColor = 'rgba(2,223,130,0.3)'; btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', function() {
      radar.style.display = 'block';
      btn.style.display = 'none';
      radarOpen = true;
      if (radarMinimized) toggleRadarMinimize();
      playTickSound();
    });
    document.body.appendChild(btn);
  }

  function toggleRadarMinimize() {
    var radar = document.getElementById('rfxRadarPanel');
    var grid = document.getElementById('rfxRadarGrid');
    var header = document.getElementById('rfxRadarHeader');
    var icon = document.getElementById('rfxRadarCloseBtn');
    if (!radar) return;

    radarMinimized = !radarMinimized;
    if (radarMinimized) {
      // Collapse: hide grid, remove bottom border, show maximize icon
      grid.style.display = 'none';
      grid.style.padding = '0';
      header.style.borderBottom = 'none';
      icon.textContent = '\u229e';
    } else {
      // Expand: show grid, restore bottom border, show close icon
      grid.style.display = 'grid';
      grid.style.padding = '14px';
      header.style.borderBottom = '1px solid rgba(2,223,130,0.2)';
      icon.textContent = '\u2715';
    }
    playTickSound();
  }

  function updateRadar() {
    var grid = document.getElementById('rfxRadarGrid');
    if (!grid) return;

    // Count qualifying pairs for badge
    var qualifyCount = PAIRS.filter(function(p) {
      var d = pairData[p];
      return d && d.allGuardsPass;
    }).length;
    var badge = document.getElementById('rfxRadarQualifyCount');
    if (badge) {
      badge.textContent = qualifyCount;
      badge.style.display = qualifyCount > 0 ? 'inline-block' : 'none';
    }

    grid.innerHTML = PAIRS.map(function(pair) {
      var data = pairData[pair];
      if (!data) {
        return '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;text-align:center;">' +
          '<div style="font-size:12px;font-weight:800;color:#fff;margin-bottom:6px;letter-spacing:.05em;">' + pair + '</div>' +
          '<div style="font-size:22px;font-weight:900;color:rgba(255,255,255,0.3);">—</div>' +
          '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px;">Loading…</div></div>';
      }

      var qualify = data.allGuardsPass;
      var bg = qualify ? 'rgba(2,223,130,0.12)' : 'rgba(255,255,255,0.03)';
      var border = qualify ? '#02DF82' : 'rgba(255,255,255,0.08)';
      var scoreColor = data.score >= MIN_SCORE ? '#02DF82' : 'rgba(255,255,255,0.4)';
      var dirIcon = data.dir === 'LONG' ? '↑' : '↓';
      var glow = qualify ? 'box-shadow:0 0 16px rgba(2,223,130,0.3);' : '';
      var kzTag = data.silverBullet ? '⚡' : data.killzoneLabel !== 'Off-killzone' ? '' : '';

      return "<div style=\"background:" + bg + ";border:1px solid " + border + ";border-radius:10px;padding:14px;text-align:center;cursor:pointer;transition:all 0.2s;" + glow + "\" " +
        "onmouseover=\"this.style.background='rgba(2,223,130,0.2)'\" " +
        "onmouseout=\"this.style.background='" + bg + "'\" " +
        "onclick=\"window.__rfxAutoLoadPair('" + pair + "')\">" +
        '<div style="font-size:12px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:.05em;">' + pair + ' ' + kzTag + '</div>' +
        '<div style="font-size:26px;font-weight:900;color:' + scoreColor + ';">' + data.score + '%</div>' +
        '<div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.6);margin-top:2px;">' + dirIcon + ' ' + data.dir + '</div>' +
        '<div style="font-size:9px;margin-top:6px;padding:3px 10px;border-radius:999px;display:inline-block;background:' + (qualify ? 'rgba(2,223,130,0.2)' : 'rgba(255,255,255,0.05)') + ';color:' + (qualify ? '#02DF82' : 'rgba(255,255,255,0.4)') + ';font-weight:700;letter-spacing:.05em;">' + data.guards + '</div>' +
        '</div>';
    }).join('');
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTO-LOAD PAIR INTO CALCULATOR
  // ═══════════════════════════════════════════════════════════════

  window.__rfxAutoLoadPair = function(pair) {
    var data = pairData[pair];
    if (!data) return;

    var dec = pair === 'USDJPY' ? 3 : 5;
    var fields = {
      'c-pair': pair,
      'c-daily': data.daily,
      'c-h4': data.h4,
      'c-score': String(data.score),
      'c-entry': data.entry.toFixed(dec),
      'c-sl': data.sl.toFixed(dec),
      'c-tp': data.tp.toFixed(dec),
      'c-stoppips': String(data.stopPips)
    };

    Object.keys(fields).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = fields[id];
    });

    safeSetDir(data.dir);
    setTimeout(safeCalc, 200);

    var calcSection = document.querySelector('.calc-section');
    if (calcSection) calcSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    safeToast(' Loaded ' + pair + ' ' + data.dir + ' (' + data.score + '%)', 'ok');
    playTickSound();
  };

  // ═══════════════════════════════════════════════════════════════
  // AUTO-ALERTS (sound + notifications)
  // ═══════════════════════════════════════════════════════════════

  function checkForQualifyingSetups() {
    PAIRS.forEach(function(pair) {
      var data = pairData[pair];
      if (!data || !data.allGuardsPass) return;

      var lastAlert = lastAlertTime[pair] || 0;
      var now = Date.now();
      if (now - lastAlert < 5 * 60 * 1000) return;

      lastAlertTime[pair] = now;

      // Toast
      safeToast(' ' + pair + ' ' + data.dir + ' ALL GUARDS PASS (' + data.score + '%)', 'ok');

      // Sound
      playQualifySound();

      // Browser notification
      sendNotif(pair, data);

      // Open radar (expand if minimized)
      var radar = document.getElementById('rfxRadarPanel');
      if (radar) { radar.style.display = 'block'; radarOpen = true; document.getElementById('rfxRadarToggle').style.display = 'none';
        if (radarMinimized) toggleRadarMinimize(); }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // POLLING LOOP — 30 second interval
  // ═══════════════════════════════════════════════════════════════

  function pollAllPairs() {
    Promise.all(PAIRS.map(function(pair) { return fetchPairData(pair); }))
      .then(function(results) {
        results.forEach(function(data, i) {
          if (data) pairData[PAIRS[i]] = data;
        });
        updateRadar();
        checkForQualifyingSetups();
      })
      .catch(function(err) { console.warn('[RFX Auto] Poll error:', err); });
  }

  // ═══════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════

  function initAuto() {
    console.log('[RFX Auto v3] Initializing...');
    try {
      injectRadar();
      requestNotifPermission();
      pollAllPairs();
      setInterval(pollAllPairs, 30000);
      console.log('[RFX Auto v3] ✓ Ready — 6 pairs, polling every 30s, sound + notifications enabled');
    } catch(e) { console.error('[RFX Auto v3] Init error:', e); }
  }

  if (document.readyState === 'complete') initAuto();
  else window.addEventListener('load', function() { setTimeout(initAuto, 2000); });

  } catch(mainError) {
    console.error('[RFX Auto v3] FATAL ERROR — website is safe:', mainError);
  }

})();
