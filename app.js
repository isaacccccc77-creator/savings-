/* Miles Apart — expense tracker + flight fund.
   Everything lives in localStorage on this device. No server, no tracking. */
(() => {
  'use strict';

  // ---------- Constants ----------
  const STORE_KEY = 'milesApart.v1';
  const CATEGORIES = [
    { id: 'food',      name: 'Food',      icon: '🍜', color: 'var(--c1)' },
    { id: 'transport', name: 'Transport', icon: '🚇', color: 'var(--c2)' },
    { id: 'personal',  name: 'Personal',  icon: '🛍️', color: 'var(--c3)' },
    { id: 'bills',     name: 'Phone & Bills', icon: '📱', color: 'var(--c4)' },
    { id: 'fun',       name: 'Fun',       icon: '🎮', color: 'var(--c5)' },
    { id: 'love',      name: 'Dates & Gifts', icon: '💝', color: 'var(--c6)' },
    { id: 'other',     name: 'Other',     icon: '📦', color: 'var(--c7)' },
  ];
  const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
  const QUICK = {
    expense: [
      { label: '🍜 Hawker S$5', amount: 5, cat: 'food', note: 'Hawker meal' },
      { label: '🧋 Bubble tea S$4', amount: 4, cat: 'food', note: 'Bubble tea' },
      { label: '🚇 MRT S$2', amount: 2, cat: 'transport', note: 'MRT' },
      { label: '🚕 Grab S$15', amount: 15, cat: 'transport', note: 'Grab' },
      { label: '📱 Phone S$20', amount: 20, cat: 'bills', note: 'Phone plan' },
    ],
    save: [
      { label: 'S$20', amount: 20 }, { label: 'S$50', amount: 50 },
      { label: 'S$100', amount: 100 }, { label: 'S$200', amount: 200 },
    ],
    income: [
      { label: '🎖️ NS allowance', amount: null, note: 'NS allowance' },
      { label: '🧧 Ang bao', amount: null, note: 'Ang bao' },
      { label: '💼 Side job', amount: null, note: 'Side job' },
    ],
  };

  // ---------- Date helpers (local time, never UTC-shifted) ----------
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const DAY = 86400000;
  const daysBetween = (a, b) => Math.round((parseYmd(ymd(b)) - parseYmd(ymd(a))) / DAY);

  // ---------- State ----------
  function defaultState() {
    const today = new Date();
    const target = new Date(today.getFullYear() + 1, 5, 15); // mid-June next year
    return {
      settings: {
        name: '',
        partnerCity: 'London',
        income: 900,
        budget: 0,
        flightCost: 1500,
        targetDate: ymd(target),
        cycleStart: ymd(today),
        theme: null,
      },
      txns: [],
      trips: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      const base = defaultState();
      return {
        settings: { ...base.settings, ...(data.settings || {}) },
        txns: Array.isArray(data.txns) ? data.txns : [],
        trips: Array.isArray(data.trips) ? data.trips : [],
      };
    } catch (e) {
      console.warn('Could not load saved data', e);
      return defaultState();
    }
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('⚠️ Could not save — storage may be full or blocked'); }
  }

  let state = load();
  let viewMonth = new Date(); viewMonth.setDate(1);
  let txFilter = 'all';
  let addType = 'expense';
  let addCat = 'food';

  // ---------- Formatting ----------
  const fmt = (n, dp) => {
    const digits = dp ?? (Math.abs(n) % 1 === 0 || Math.abs(n) >= 1000 ? 0 : 2);
    const s = Math.abs(n).toLocaleString('en-SG', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return (n < 0 ? '−S$' : 'S$') + s;
  };
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Derived numbers ----------
  function monthTxns(d = viewMonth) {
    const k = monthKey(d);
    return state.txns.filter(t => t.date.startsWith(k));
  }
  const sum = (arr, type) => arr.filter(t => t.type === type).reduce((a, t) => a + t.amount, 0);
  function fundBalance() {
    return state.txns.reduce((a, t) => a + (t.type === 'save' ? t.amount : t.type === 'withdraw' ? -t.amount : 0), 0);
  }
  function monthNumbers(d = viewMonth) {
    const txs = monthTxns(d);
    const extraIncome = sum(txs, 'income');
    const income = (Number(state.settings.income) || 0) + extraIncome;
    const spent = sum(txs, 'expense');
    const saved = sum(txs, 'save');
    const cap = Number(state.settings.budget) > 0 ? Number(state.settings.budget) : income - saved;
    const left = Number(state.settings.budget) > 0 ? cap - spent : income - spent - saved;
    return { txs, income, extraIncome, spent, saved, left, cap };
  }

  // ---------- Animated number ----------
  const animState = new WeakMap();
  function countTo(el, to, formatter = fmt, dur = 1100) {
    const from = animState.get(el) ?? 0;
    animState.set(el, to);
    if (reduceMotion || from === to) { el.textContent = formatter(to); return; }
    const t0 = performance.now();
    const step = now => {
      const p = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = formatter(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = formatter(to);
    };
    requestAnimationFrame(step);
  }

  // ---------- Semi-circle gauge ----------
  const CX = 110, CY = 115, R = 90;
  const pointAt = pct => {
    const a = Math.PI * (1 - pct / 100);
    return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
  };
  function drawTicks(svg) {
    const g = svg.querySelector('.ticks');
    if (g.childElementCount) return;
    let html = '';
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI * (1 - i / 20);
      const major = i % 5 === 0;
      const r1 = R + 14, r2 = R + (major ? 22 : 18);
      html += `<line class="${major ? 'major' : ''}" x1="${CX + r1 * Math.cos(a)}" y1="${CY - r1 * Math.sin(a)}" x2="${CX + r2 * Math.cos(a)}" y2="${CY - r2 * Math.sin(a)}"/>`;
    }
    g.innerHTML = html;
  }
  const gaugeState = new WeakMap();
  function setGauge(root, pct, { rotateNeedle = false } = {}) {
    const svg = root.querySelector('svg');
    drawTicks(svg);
    const fill = svg.querySelector('.fill');
    const needle = svg.querySelector('.needle');
    const to = clamp(pct, 0, 100);
    const from = gaugeState.get(root) ?? 0;
    gaugeState.set(root, to);
    const render = p => {
      fill.style.strokeDasharray = `${p} 100`;
      const [x, y] = pointAt(p);
      // Plane points along the arc's tangent (direction of travel)
      const deg = rotateNeedle ? (90 - 180 * (1 - p / 100)) : 0;
      needle.setAttribute('transform', `translate(${x} ${y}) rotate(${deg})`);
    };
    if (reduceMotion) return render(to);
    const t0 = performance.now(), dur = 1400;
    const step = now => {
      const k = clamp((now - t0) / dur, 0, 1);
      // easeOutBack for a little overshoot "springy" feel
      const c1 = 1.4, c3 = c1 + 1;
      const e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
      render(clamp(from + (to - from) * e, 0, 100));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Render: header / clocks ----------
  function renderHeader() {
    const s = state.settings;
    const h = new Date().getHours();
    const hello = h < 5 ? 'Late night' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
    $('#greeting').textContent = s.name ? `${hello}, ${s.name} · Singapore → ${s.partnerCity}` : `Singapore → ${s.partnerCity}`;
    $('#partnerLabel').textContent = `Her · ${s.partnerCity}`;
    $('#partnerCityName').textContent = s.partnerCity;
    $('#monthLabel').textContent = viewMonth.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });
    const now = new Date();
    $('#nextMonth').disabled = monthKey(viewMonth) >= monthKey(now);
    $('#nextMonth').style.opacity = $('#nextMonth').disabled ? .35 : 1;
  }

  function tick() {
    const now = new Date();
    const opts = { hour: '2-digit', minute: '2-digit', hour12: false };
    $('#clockSG').textContent = now.toLocaleTimeString('en-GB', { ...opts, timeZone: 'Asia/Singapore' });
    $('#clockLDN').textContent = now.toLocaleTimeString('en-GB', { ...opts, timeZone: 'Europe/London' });
    // Offset changes with UK daylight saving (7h in summer, 8h in winter)
    const hr = tz => Number(now.toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }));
    const dayOf = tz => Number(now.toLocaleString('en-GB', { day: 'numeric', timeZone: tz }));
    let diff = hr('Asia/Singapore') - hr('Europe/London');
    if (dayOf('Asia/Singapore') !== dayOf('Europe/London')) diff += 24;
    diff = ((diff % 24) + 24) % 24;
    const ldnH = hr('Europe/London');
    const mood = ldnH >= 23 || ldnH < 7 ? 'she’s probably asleep 😴' : ldnH < 9 ? 'she’s waking up ☕' : 'good time to call 📞';
    $('#clockDiff').innerHTML = `${diff}h apart<br/>${mood}`;
  }

  // ---------- Render: gauges ----------
  function renderLeftGauge() {
    const m = monthNumbers();
    const pct = m.cap > 0 ? (m.left / m.cap) * 100 : 0;
    const root = $('#leftGauge');
    const status = $('#leftStatus');
    let color, label, cls;
    if (m.cap <= 0 && m.spent === 0) { color = 'var(--muted)'; label = 'Set income in ⚙'; cls = ''; }
    else if (pct >= 50) { color = 'var(--good)'; label = '✓ Healthy'; cls = 'good'; }
    else if (pct >= 20) { color = 'var(--warning)'; label = '⚠ Slow down'; cls = 'warn'; }
    else { color = 'var(--critical)'; label = pct <= 0 ? '✕ Over budget' : '✕ Almost out'; cls = 'bad'; }
    root.style.setProperty('--gauge-color', color);
    status.textContent = label; status.className = 'pill ' + cls;
    setGauge(root, pct);
    countTo($('#leftValue'), m.left);
    $('#leftCaption').textContent = Number(state.settings.budget) > 0 ? `of ${fmt(m.cap)} budget` : `of ${fmt(m.income)} income`;
    countTo($('#statSpent'), m.spent);
    countTo($('#statSaved'), m.saved);
    // Per-day allowance for the rest of the month (only meaningful for current month)
    const now = new Date();
    let perDay;
    if (monthKey(viewMonth) === monthKey(now)) {
      const remain = daysInMonth(now.getFullYear(), now.getMonth()) - now.getDate() + 1;
      perDay = Math.max(0, m.left) / remain;
    } else {
      perDay = m.spent / daysInMonth(viewMonth.getFullYear(), viewMonth.getMonth());
      $('#statPerDay').previousElementSibling.textContent = 'Avg / day';
    }
    if (monthKey(viewMonth) === monthKey(now)) $('#statPerDay').previousElementSibling.textContent = 'Per day left';
    countTo($('#statPerDay'), perDay, v => fmt(v, 2));
  }

  function fundPlan() {
    const s = state.settings;
    const bal = fundBalance();
    const goal = Math.max(1, Number(s.flightCost) || 1);
    const need = Math.max(0, goal - bal);
    const today = new Date();
    const target = parseYmd(s.targetDate);
    const daysLeft = Math.max(0, daysBetween(today, target));
    const weeks = Math.max(1, daysLeft / 7);
    const months = Math.max(1, daysLeft / 30.44);
    const start = parseYmd(s.cycleStart || ymd(today));
    const total = Math.max(1, daysBetween(start, target));
    const timePct = clamp((daysBetween(start, today) / total) * 100, 0, 100);
    const moneyPct = clamp((bal / goal) * 100, 0, 100);
    return { bal, goal, need, daysLeft, weekly: need / weeks, monthly: need / months, timePct, moneyPct, target };
  }

  function renderFund() {
    const p = fundPlan();
    setGauge($('#fundGauge'), p.moneyPct, { rotateNeedle: true });
    countTo($('#fundValue'), p.bal);
    $('#fundCaption').textContent = `of ${fmt(p.goal)} goal · ${Math.round(p.moneyPct)}%`;
    countTo($('#fundNeed'), p.need);
    countTo($('#fundWeekly'), p.need > 0 ? p.weekly : 0, v => fmt(v, v < 100 ? 2 : 0));
    countTo($('#fundMonthly'), p.need > 0 ? p.monthly : 0, v => fmt(v, 0));

    const fs = $('#fundStatus');
    const tp = $('#trackPill');
    let cls, label, text;
    if (p.need <= 0) { cls = 'good'; label = '✓ Fully funded!'; text = 'You’ve got the whole ticket covered. Go book it ✈️'; }
    else if (p.moneyPct >= p.timePct - 5) { cls = 'good'; label = '✓ On track'; text = `Keep saving ${fmt(p.weekly, 0)}/week and you’ll hit ${fmt(p.goal)} in time.`; }
    else if (p.moneyPct >= p.timePct - 20) { cls = 'warn'; label = '⚠ A bit behind'; text = `You need ${fmt(p.weekly, 0)}/week from now to catch up.`; }
    else { cls = 'bad'; label = '✕ Behind'; text = `Need ${fmt(p.weekly, 0)}/week — try trimming Fun or Grab rides.`; }
    if (p.daysLeft === 0 && p.need > 0) { cls = 'bad'; label = '✕ Date passed'; text = 'Target date has passed — update it in ⚙ Settings.'; }
    fs.textContent = label; fs.className = 'pill ' + cls;
    tp.textContent = label; tp.className = 'pill ' + cls;
    $('#trackText').textContent = text;
    $('#targetDateLabel').textContent = p.target.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
    countTo($('#daysLeft'), p.daysLeft, v => Math.round(v).toLocaleString('en-SG'));
    animateRoute(p.timePct);
  }

  // Plane travels along the SIN→LHR curve by how much time has passed in this saving cycle
  let routeFrom = 0;
  function animateRoute(pct) {
    const path = $('#routePath');
    const done = document.querySelector('.route-done');
    const plane = $('#routePlane');
    const svg = path.ownerSVGElement;
    const len = path.getTotalLength();
    done.style.strokeDasharray = `${pct} 100`;
    const place = p => {
      const pt = path.getPointAtLength(len * p / 100);
      const pt2 = path.getPointAtLength(Math.min(len, len * p / 100 + 1));
      const box = svg.getBoundingClientRect();
      const sx = box.width / 400, sy = box.height / 90;
      const ang = Math.atan2((pt2.y - pt.y) * sy, (pt2.x - pt.x) * sx) * 180 / Math.PI;
      plane.style.left = pt.x * sx + 'px';
      plane.style.top = pt.y * sy + 'px';
      plane.style.transform = `translate(-50%, -50%) rotate(${ang}deg)`;
    };
    if (reduceMotion) { place(pct); routeFrom = pct; return; }
    const from = routeFrom, t0 = performance.now(), dur = 1600;
    routeFrom = pct;
    const step = now => {
      const k = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      place(from + (pct - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Render: money flow (animated arrows) ----------
  function renderFlow() {
    const m = monthNumbers();
    const total = Math.max(m.income, m.spent + m.saved, 1);
    const left = Math.max(0, m.income - m.spent - m.saved);
    const over = Math.max(0, m.spent + m.saved - m.income);
    const outs = [
      { key: 'spent', label: 'Spent', icon: '💸', value: m.spent, color: 'var(--c2)' },
      { key: 'saved', label: 'London fund', icon: '✈️', value: m.saved, color: 'var(--accent-3)' },
      over > 0
        ? { key: 'over', label: 'Overspent', icon: '⚠️', value: -over, color: 'var(--critical)' }
        : { key: 'left', label: 'Left', icon: '👛', value: left, color: 'var(--good)' },
    ];
    // Size the drawing to its container so text stays ~1:1 on phones and desktops
    const W = clamp(Math.round($('#flow').clientWidth || 600), 300, 640);
    $('#flow svg').setAttribute('viewBox', `0 0 ${W} 220`);
    const srcW = Math.min(150, Math.round(W * 0.34));
    const src = { x: 4, y: 70, w: srcW, h: 80 };
    const narrow = W < 460;
    const nodeW = Math.min(170, Math.round(W * (narrow ? 0.46 : 0.40))), nodeH = 56, nx = W - nodeW - 4;
    const ys = [12, 82, 152];
    let paths = '', nodes = '';
    outs.forEach((o, i) => {
      const w = 3 + 22 * (Math.abs(o.value) / total);
      const sy = src.y + src.h / 2 + (i - 1) * 16;
      const ty = ys[i] + nodeH / 2;
      const x1 = src.x + src.w, x2 = nx - 8;
      const mid = (x1 + x2) / 2;
      const d = `M${x1} ${sy} C${mid} ${sy}, ${mid} ${ty}, ${x2} ${ty}`;
      paths += `<path class="flow-path" d="${d}" stroke="${o.color}" stroke-width="${w.toFixed(1)}"/>`;
      // marching chevron dashes on top of each ribbon = animated arrows
      paths += `<path class="flow-arrow" d="${d}" stroke="${o.color}" stroke-dasharray="8 32" style="animation-delay:${-i * 0.3}s"/>`;
      paths += `<path d="M${x2 - 8} ${ty - 7} L${x2 + 2} ${ty} L${x2 - 8} ${ty + 7}" fill="none" stroke="${o.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      nodes += `<g class="flow-node" transform="translate(${nx} ${ys[i]})">
        <rect width="${nodeW}" height="${nodeH}" rx="14" fill="${o.color}" fill-opacity="0.14" stroke="${o.color}" stroke-opacity="0.5"/>
        <text class="nicon" x="${narrow ? 10 : 14}" y="35">${o.icon}</text>
        <text class="nlabel" x="44" y="22">${o.label}</text>
        <text class="nvalue" x="44" y="42" style="font-size:${narrow ? 15 : 17}px">${fmt(o.value)}</text>
      </g>`;
    });
    nodes += `<g class="flow-node" transform="translate(${src.x} ${src.y})">
      <rect width="${src.w}" height="${src.h}" rx="16" fill="var(--accent)" fill-opacity="0.16" stroke="var(--accent)" stroke-opacity="0.6"/>
      <text class="nicon" x="14" y="47">💰</text>
      <text class="nlabel" x="44" y="30">Income</text>
      <text class="nvalue" x="44" y="52" style="font-size:${narrow ? 15 : 17}px">${fmt(m.income)}</text>
      ${m.extraIncome ? `<text class="nlabel" x="44" y="68">+${fmt(m.extraIncome)} extra</text>` : ''}
    </g>`;
    $('#flowPaths').innerHTML = paths;
    $('#flowNodes').innerHTML = nodes;

    // Trend vs previous month (spending)
    const prev = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
    const pm = monthNumbers(prev);
    const trend = $('#trend');
    if (pm.spent === 0 || m.spent === 0) {
      trend.className = 'trend flat'; $('#trendArrow').textContent = '→';
      $('#trendText').textContent = pm.spent === 0 ? 'No data last month' : 'Nothing spent yet';
    } else {
      const ch = (m.spent - pm.spent) / pm.spent * 100;
      const up = ch > 0.5, down = ch < -0.5;
      trend.className = 'trend ' + (up ? 'up' : down ? 'down' : 'flat');
      $('#trendArrow').textContent = up ? '↑' : down ? '↓' : '→';
      const pmName = prev.toLocaleDateString('en-SG', { month: 'short' });
      $('#trendText').textContent = up || down ? `${Math.abs(ch).toFixed(0)}% ${up ? 'more' : 'less'} spending than ${pmName}` : `About the same as ${pmName}`;
    }
  }

  // ---------- Render: categories ----------
  function renderCats() {
    const m = monthNumbers();
    const totals = {};
    m.txs.filter(t => t.type === 'expense').forEach(t => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
    const rows = CATEGORIES.map(c => ({ ...c, total: totals[c.id] || 0 })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
    const ul = $('#cats');
    $('#catTotal').textContent = m.spent ? `${fmt(m.spent)} total` : '';
    if (!rows.length) { ul.innerHTML = `<li class="empty"><span class="big">🧾</span>No spending this month yet.<br/>Tap ＋ to log your first expense.</li>`; return; }
    const max = rows[0].total;
    ul.innerHTML = rows.map(c => `
      <li class="cat-row" style="--cc:${c.color}">
        <div class="cat-ico">${c.icon}</div>
        <div>
          <div class="cat-top"><span>${c.name}</span><span class="pct">${Math.round(c.total / m.spent * 100)}%</span></div>
          <div class="bar"><span data-w="${(c.total / max * 100).toFixed(1)}"></span></div>
        </div>
        <div class="cat-amt">${fmt(c.total)}</div>
      </li>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ul.querySelectorAll('.bar > span').forEach(s => { s.style.width = s.dataset.w + '%'; });
    }));
  }

  // ---------- Render: daily bar chart ----------
  function renderDaily() {
    const m = monthNumbers();
    const y = viewMonth.getFullYear(), mo = viewMonth.getMonth();
    const n = daysInMonth(y, mo);
    const per = Array(n).fill(0);
    m.txs.filter(t => t.type === 'expense').forEach(t => { per[Number(t.date.slice(8, 10)) - 1] += t.amount; });
    const now = new Date();
    const isCur = monthKey(viewMonth) === monthKey(now);
    const elapsed = isCur ? now.getDate() : n;
    const avg = m.spent / elapsed;
    const max = Math.max(...per, avg, 1);
    // nice top value
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / mag * 2) / 2 * mag;
    const W = 360, H = 170, L = 30, B = 20, T = 8;
    const ch = H - B - T, cw = W - L;
    const bw = cw / n;
    let s = '';
    [0, .5, 1].forEach(f => {
      const yy = T + ch * (1 - f);
      s += `<line class="gridline" x1="${L}" x2="${W}" y1="${yy}" y2="${yy}"/>`;
      s += `<text class="axis-label" x="${L - 5}" y="${yy + 3}" text-anchor="end">${Math.round(top * f)}</text>`;
    });
    per.forEach((v, i) => {
      const h = v / top * ch;
      const x = L + i * bw + bw * 0.18, w = Math.max(2, bw * 0.64);
      const cls = ['dbar', isCur && i === now.getDate() - 1 ? 'today' : '', isCur && i >= now.getDate() ? 'dim' : ''].join(' ');
      if (v > 0) {
        const r = Math.min(4, w / 2, h);
        const yTop = T + ch - h;
        // bar with rounded top anchored to the baseline
        s += `<path class="${cls}" d="M${x} ${T + ch} V${yTop + r} Q${x} ${yTop} ${x + r} ${yTop} H${x + w - r} Q${x + w} ${yTop} ${x + w} ${yTop + r} V${T + ch} Z">
          <animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="${(i * 0.02).toFixed(2)}s" fill="freeze"/></path>`;
      }
      if ((i + 1) === 1 || (i + 1) % 5 === 0) s += `<text class="axis-label" x="${L + i * bw + bw / 2}" y="${H - 5}" text-anchor="middle">${i + 1}</text>`;
      s += `<rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${ch}" data-i="${i}"/>`;
    });
    if (m.spent > 0) {
      const ay = T + ch * (1 - avg / top);
      s += `<line class="avgline" x1="${L}" x2="${W}" y1="${ay}" y2="${ay}"/>`;
      s += `<text class="avglabel" x="${W}" y="${ay - 4}" text-anchor="end">avg ${fmt(avg, 0)}/day</text>`;
    }
    const svg = $('#dailySvg');
    svg.innerHTML = s;
    $('#dailyAvg').textContent = m.spent ? `avg ${fmt(avg, 2)}/day` : '';

    const tip = $('#tooltip');
    const wrap = $('#daily');
    const show = e => {
      const r = e.target.closest('.hit'); if (!r) return;
      const i = Number(r.dataset.i);
      const d = new Date(y, mo, i + 1);
      tip.innerHTML = `<b>${fmt(per[i], 2)}</b>${d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}`;
      const box = svg.getBoundingClientRect(), wb = wrap.getBoundingClientRect();
      const px = (L + i * bw + bw / 2) / W * box.width + (box.left - wb.left);
      const py = (T + ch - per[i] / top * ch) / H * box.height + (box.top - wb.top);
      tip.style.left = clamp(px, 50, wb.width - 50) + 'px';
      tip.style.top = Math.max(py, 30) + 'px';
      tip.classList.add('show');
    };
    svg.onpointermove = show; svg.onpointerdown = show;
    svg.onpointerleave = () => tip.classList.remove('show');

    // Insights
    const ins = [];
    const p = fundPlan();
    if (isCur && m.spent > 0) ins.push({ k: 'Month-end forecast', v: fmt(avg * n, 0) });
    const biggest = m.txs.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount)[0];
    if (biggest) ins.push({ k: 'Biggest spend', v: `${fmt(biggest.amount)} · ${esc(biggest.note || CAT[biggest.category]?.name || '')}` });
    const tea = 4 * p.daysLeft;
    if (p.daysLeft > 0) ins.push({ k: 'Skip 1 bubble tea/day ≈', v: `${fmt(tea, 0)} by trip 🧋` });
    if (p.need > 0 && p.daysLeft > 0) ins.push({ k: 'Daily to London', v: `${fmt(p.need / p.daysLeft, 2)}/day` });
    $('#insights').innerHTML = ins.slice(0, 4).map(i => `<div class="insight">${i.k}<strong>${i.v}</strong></div>`).join('');
  }

  // ---------- Render: transactions ----------
  function renderTx() {
    const list = $('#txList');
    const txs = monthTxns()
      .filter(t => txFilter === 'all' || t.type === txFilter || (txFilter === 'save' && t.type === 'withdraw'))
      .sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
    if (!txs.length) { list.innerHTML = `<div class="empty"><span class="big">✨</span>Nothing here yet for this month.</div>`; return; }
    let html = '', lastDay = '';
    const groups = {};
    txs.forEach(t => { groups[t.date] = (groups[t.date] || 0) + (t.type === 'expense' ? t.amount : 0); });
    txs.forEach((t, idx) => {
      if (t.date !== lastDay) {
        lastDay = t.date;
        const d = parseYmd(t.date);
        const today = ymd(new Date()), yest = ymd(new Date(Date.now() - DAY));
        const label = t.date === today ? 'Today' : t.date === yest ? 'Yesterday' : d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
        html += `<div class="tx-day"><span>${label}</span><span>${groups[t.date] ? '−' + fmt(groups[t.date]) : ''}</span></div>`;
      }
      let icon, color, title, sub, amt, cls;
      if (t.type === 'expense') { const c = CAT[t.category] || CAT.other; icon = c.icon; color = c.color; title = t.note || c.name; sub = c.name; amt = '−' + fmt(t.amount); cls = 'neg'; }
      else if (t.type === 'save') { icon = '✈️'; color = 'var(--accent-3)'; title = t.note || 'London fund'; sub = 'Saved to fund'; amt = '+' + fmt(t.amount); cls = 'fund'; }
      else if (t.type === 'withdraw') { icon = '🎫'; color = 'var(--accent-2)'; title = t.note || 'Flight booked'; sub = 'Paid from fund'; amt = '−' + fmt(t.amount); cls = 'neg'; }
      else { icon = '💰'; color = 'var(--good)'; title = t.note || 'Income'; sub = 'Extra income'; amt = '+' + fmt(t.amount); cls = 'pos'; }
      html += `<div class="tx" style="--cc:${color};animation-delay:${Math.min(idx, 12) * 0.03}s">
        <div class="tx-ico">${icon}</div>
        <div class="tx-main"><div class="tx-title">${esc(title)}</div><div class="tx-sub">${sub}</div></div>
        <div class="tx-amt ${cls}">${amt}</div>
        <button class="tx-del" data-id="${t.id}" aria-label="Delete ${esc(title)}">×</button>
      </div>`;
    });
    list.innerHTML = html;
  }

  function renderTrips() {
    const card = $('#tripsCard');
    card.hidden = !state.trips.length;
    $('#tripsList').innerHTML = state.trips.slice().reverse().map(t =>
      `<li><span>✈️ ${esc(t.note || 'Trip to ' + state.settings.partnerCity)} · booked ${parseYmd(t.date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</span><strong>${fmt(t.cost)}</strong></li>`).join('');
  }

  function renderAll() {
    renderHeader();
    renderLeftGauge();
    renderFund();
    renderFlow();
    renderCats();
    renderDaily();
    renderTx();
    renderTrips();
  }

  // ---------- Add sheet ----------
  function openSheet(el) { el.hidden = false; document.body.style.overflow = 'hidden'; }
  function closeSheet(el) { el.hidden = true; document.body.style.overflow = ''; }

  function renderChips() {
    const chips = $('#catChips');
    chips.hidden = addType !== 'expense';
    chips.innerHTML = CATEGORIES.map(c =>
      `<button type="button" class="chip ${c.id === addCat ? 'active' : ''}" style="--cc:${c.color}" data-cat="${c.id}" role="radio" aria-checked="${c.id === addCat}">${c.icon} ${c.name}</button>`).join('');
    $('#quickRow').innerHTML = QUICK[addType].map((q, i) => `<button type="button" data-q="${i}">${q.label}</button>`).join('');
    $('#noteInput').placeholder = addType === 'expense' ? 'Note (e.g. chicken rice, MRT)' : addType === 'save' ? 'Note (optional)' : 'Where from? (e.g. NS allowance)';
  }

  function openAdd(type = 'expense') {
    addType = type;
    document.querySelectorAll('#typeSeg button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    $('#addForm').reset();
    $('#dateInput').value = ymd(new Date());
    $('#dateInput').max = ymd(new Date());
    renderChips();
    openSheet($('#addSheet'));
    setTimeout(() => $('#amountInput').focus(), 250);
  }

  // ---------- Toast & confetti ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function confetti(n = 140) {
    if (reduceMotion) return;
    const c = $('#confetti'), ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const colors = ['#9085e9', '#e05aa0', '#38d6e8', '#fab219', '#2fd07a', '#ffffff'];
    const shapes = ['✈', '💙', '', '', '', ''];
    const parts = Array.from({ length: n }, () => ({
      x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .65,
      vx: (Math.random() - .5) * 14, vy: -Math.random() * 16 - 6,
      r: Math.random() * 6 + 3, rot: Math.random() * 6, vr: (Math.random() - .5) * .3,
      c: colors[Math.floor(Math.random() * colors.length)], s: shapes[Math.floor(Math.random() * shapes.length)],
    }));
    const t0 = performance.now();
    const frame = now => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(p => {
        p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (p.s) { ctx.font = `${p.r * 3}px sans-serif`; ctx.fillStyle = p.c; ctx.fillText(p.s, 0, 0); }
        else { ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); }
        ctx.restore();
      });
      if (now - t0 < 3500) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    requestAnimationFrame(frame);
  }

  // ---------- Theme ----------
  function applyTheme() {
    const t = state.settings.theme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]').content = t === 'light' ? '#f4f2fb' : '#0b0a1a';
  }

  // ---------- Sample data ----------
  function sampleData() {
    const s = defaultState();
    s.settings.name = state.settings.name || '';
    s.settings.cycleStart = ymd(new Date(Date.now() - 75 * DAY));
    const now = new Date();
    const txns = [];
    const notes = {
      food: ['Chicken rice', 'Mala', 'Canteen', 'McDonald’s', 'Bubble tea', 'Nasi lemak', 'Cookout w/ section'],
      transport: ['MRT', 'Bus', 'Grab back to camp', 'MRT'],
      personal: ['Uniqlo', 'Shopee haul', 'Haircut', 'Gym gear'],
      bills: ['Phone plan', 'Spotify'],
      fun: ['Movie', 'Steam sale', 'Bowling'],
      love: ['Care package to London', 'Flowers delivery'],
      other: ['Laundry', 'Toiletries'],
    };
    for (let back = 75; back >= 0; back--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
      const k = ymd(d);
      const r = n => Math.round(n * 100) / 100;
      txns.push({ id: uid(), type: 'expense', amount: r(3 + Math.random() * 9), category: 'food', note: notes.food[Math.floor(Math.random() * notes.food.length)], date: k, ts: d.getTime() + 1 });
      if (Math.random() < .6) txns.push({ id: uid(), type: 'expense', amount: r(1.5 + Math.random() * 3), category: 'transport', note: 'MRT', date: k, ts: d.getTime() + 2 });
      if (d.getDay() === 5 && Math.random() < .8) txns.push({ id: uid(), type: 'expense', amount: r(10 + Math.random() * 14), category: 'transport', note: 'Grab back to camp', date: k, ts: d.getTime() + 3 });
      if (Math.random() < .12) txns.push({ id: uid(), type: 'expense', amount: r(15 + Math.random() * 45), category: 'personal', note: notes.personal[Math.floor(Math.random() * 4)], date: k, ts: d.getTime() + 4 });
      if (Math.random() < .1) txns.push({ id: uid(), type: 'expense', amount: r(10 + Math.random() * 25), category: 'fun', note: notes.fun[Math.floor(Math.random() * 3)], date: k, ts: d.getTime() + 5 });
      if (d.getDate() === 3) txns.push({ id: uid(), type: 'expense', amount: 20, category: 'bills', note: 'Phone plan', date: k, ts: d.getTime() + 6 });
      if (d.getDate() === 12) txns.push({ id: uid(), type: 'expense', amount: 38, category: 'love', note: 'Care package to London', date: k, ts: d.getTime() + 7 });
      if (d.getDate() === 10) txns.push({ id: uid(), type: 'save', amount: 150, note: 'Monthly transfer', date: k, ts: d.getTime() + 8 });
      if (d.getDay() === 0 && Math.random() < .5) txns.push({ id: uid(), type: 'save', amount: 20, note: 'Weekend save', date: k, ts: d.getTime() + 9 });
      if (Math.random() < .08) txns.push({ id: uid(), type: 'expense', amount: r(3 + Math.random() * 8), category: 'other', note: notes.other[Math.floor(Math.random() * 2)], date: k, ts: d.getTime() + 10 });
    }
    s.txns = txns;
    s.settings.theme = state.settings.theme;
    return s;
  }

  // ---------- Events ----------
  function bind() {
    $('#fab').onclick = () => openAdd('expense');
    $('#quickSaveBtn').onclick = () => openAdd('save');
    $('#prevMonth').onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderAll(); };
    $('#nextMonth').onclick = () => { if ($('#nextMonth').disabled) return; viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderAll(); };
    $('#themeBtn').onclick = () => {
      state.settings.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      save(); applyTheme();
    };

    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeSheet(b.closest('.sheet-backdrop')));
    document.querySelectorAll('.sheet-backdrop').forEach(bd => bd.addEventListener('click', e => { if (e.target === bd) closeSheet(bd); }));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') document.querySelectorAll('.sheet-backdrop:not([hidden])').forEach(closeSheet);
    });

    $('#typeSeg').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      addType = b.dataset.type;
      document.querySelectorAll('#typeSeg button').forEach(x => x.classList.toggle('active', x === b));
      renderChips();
    };
    $('#catChips').onclick = e => {
      const b = e.target.closest('.chip'); if (!b) return;
      addCat = b.dataset.cat; renderChips();
    };
    $('#quickRow').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const q = QUICK[addType][Number(b.dataset.q)];
      if (q.amount != null) $('#amountInput').value = q.amount;
      if (q.cat) { addCat = q.cat; renderChips(); }
      if (q.note) $('#noteInput').value = q.note;
      if (q.amount == null) $('#amountInput').focus();
    };

    $('#addForm').onsubmit = e => {
      e.preventDefault();
      const amount = Math.round(parseFloat($('#amountInput').value) * 100) / 100;
      if (!(amount > 0)) { toast('Enter an amount above 0'); return; }
      const date = $('#dateInput').value || ymd(new Date());
      const t = { id: uid(), type: addType, amount, note: $('#noteInput').value.trim(), date, ts: Date.now() };
      if (addType === 'expense') t.category = addCat;
      const before = fundPlan();
      state.txns.push(t);
      save();
      closeSheet($('#addSheet'));
      // jump to the month of the entry so the user sees it land
      const d = parseYmd(date); viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      renderAll();
      if (addType === 'save') {
        const after = fundPlan();
        if (before.need > 0 && after.need <= 0) { confetti(220); toast('🎉 Flight fully funded! Time to book ✈️'); }
        else {
          const crossed = [25, 50, 75].find(m => before.moneyPct < m && after.moneyPct >= m);
          if (crossed) { confetti(); toast(`🎉 ${crossed}% of the way to ${state.settings.partnerCity}!`); }
          else toast(`✈️ ${fmt(amount)} closer to ${state.settings.partnerCity}`);
        }
      } else if (addType === 'income') toast(`💰 +${fmt(amount)} income logged`);
      else toast(`${CAT[addCat].icon} ${fmt(amount)} logged`);
    };

    $('#txFilter').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      txFilter = b.dataset.f;
      document.querySelectorAll('#txFilter button').forEach(x => x.classList.toggle('active', x === b));
      renderTx();
    };
    $('#txList').onclick = e => {
      const b = e.target.closest('.tx-del'); if (!b) return;
      const t = state.txns.find(x => x.id === b.dataset.id);
      if (!t || !confirm(`Delete this ${fmt(t.amount)} entry?`)) return;
      state.txns = state.txns.filter(x => x.id !== t.id);
      if (t.type === 'withdraw') {
        // Undo the booking: restore the goal it rolled forward
        const trip = state.trips.find(tr => tr.txnId === t.id);
        if (trip && trip.prev) Object.assign(state.settings, trip.prev);
        state.trips = state.trips.filter(tr => tr.txnId !== t.id);
      }
      save(); renderAll(); toast('Deleted');
    };

    $('#bookedBtn').onclick = () => {
      const p = fundPlan();
      const input = prompt(`Congrats!! 🎉 How much did the ticket cost? (S$)\nIt'll be paid out of your ${fmt(p.bal)} fund, and your next trip target moves one year ahead.`, String(state.settings.flightCost));
      if (input == null) return;
      const cost = Math.round(parseFloat(input) * 100) / 100;
      if (!(cost > 0)) { toast('Enter a valid amount'); return; }
      const today = new Date();
      const t = { id: uid(), type: 'withdraw', amount: Math.min(cost, Math.max(0, p.bal)), note: `Flight to ${state.settings.partnerCity}`, date: ymd(today), ts: Date.now() };
      if (t.amount > 0) state.txns.push(t);
      if (cost > t.amount) state.txns.push({ id: uid(), type: 'expense', amount: Math.round((cost - t.amount) * 100) / 100, category: 'love', note: `Flight top-up (${state.settings.partnerCity})`, date: ymd(today), ts: Date.now() + 1 });
      state.trips.push({
        date: ymd(today), cost, txnId: t.id, note: `Trip to ${state.settings.partnerCity}`,
        prev: { targetDate: state.settings.targetDate, cycleStart: state.settings.cycleStart, flightCost: state.settings.flightCost },
      });
      // Once a year: roll the goal forward 12 months from the old target
      const oldTarget = parseYmd(state.settings.targetDate);
      const next = new Date(Math.max(oldTarget, today));
      next.setFullYear(next.getFullYear() + 1);
      state.settings.targetDate = ymd(next);
      state.settings.cycleStart = ymd(today);
      state.settings.flightCost = cost;
      save(); renderAll(); confetti(260);
      toast(`✈️ Have an amazing trip! Next goal: ${next.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })}`);
    };

    // Settings
    $('#settingsBtn').onclick = () => {
      const f = $('#settingsForm');
      const s = state.settings;
      f.name.value = s.name; f.partnerCity.value = s.partnerCity; f.income.value = s.income;
      f.budget.value = s.budget || ''; f.flightCost.value = s.flightCost; f.targetDate.value = s.targetDate;
      f.targetDate.min = ymd(new Date());
      openSheet($('#settingsSheet'));
    };
    $('#settingsForm').onsubmit = e => {
      e.preventDefault();
      const f = e.target, s = state.settings;
      s.name = f.name.value.trim();
      s.partnerCity = f.partnerCity.value.trim() || 'London';
      s.income = Math.max(0, parseFloat(f.income.value) || 0);
      s.budget = Math.max(0, parseFloat(f.budget.value) || 0);
      s.flightCost = Math.max(1, parseFloat(f.flightCost.value) || 1500);
      if (f.targetDate.value && f.targetDate.value !== s.targetDate) s.targetDate = f.targetDate.value;
      save(); closeSheet($('#settingsSheet')); renderAll(); toast('Settings saved ✓');
    };
    $('#exportBtn').onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `miles-apart-backup-${ymd(new Date())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Backup downloaded ⬇');
    };
    $('#importInput').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || !Array.isArray(data.txns)) throw new Error('bad file');
        if (!confirm(`Replace current data with backup (${data.txns.length} entries)?`)) return;
        const base = defaultState();
        state = { settings: { ...base.settings, ...data.settings }, txns: data.txns, trips: data.trips || [] };
        save(); applyTheme(); closeSheet($('#settingsSheet')); renderAll(); toast('Backup restored ✓');
      } catch { toast('⚠️ That file isn’t a valid backup'); }
      e.target.value = '';
    };
    $('#sampleBtn').onclick = () => {
      if (state.txns.length && !confirm('Replace your current data with sample data? (Export a backup first if you want to keep it.)')) return;
      state = sampleData(); save(); closeSheet($('#settingsSheet')); renderAll(); toast('✨ Sample data loaded');
    };
    $('#resetBtn').onclick = () => {
      if (!confirm('Delete ALL data on this device? This cannot be undone.')) return;
      const theme = state.settings.theme;
      state = defaultState(); state.settings.theme = theme; save(); closeSheet($('#settingsSheet')); renderAll(); toast('Everything reset');
    };

    let rz;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { renderFlow(); routeFrom = fundPlan().timePct; animateRoute(routeFrom); }, 150); });
  }

  // ---------- Boot ----------
  applyTheme();
  bind();
  renderAll();
  tick();
  setInterval(tick, 20000);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
