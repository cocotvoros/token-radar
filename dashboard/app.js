// Pulse Radar dashboard: board, scatter, filters, sorting, detail drawer, live comparables.
// Reads window.PULSE_RADAR (written by main.ts) and recomputes every implied
// value in the page from the same factors, so board and code visibly agree.
(function () {
  var D = window.PULSE_RADAR;
  if (!D) { document.getElementById('meta').textContent = 'No data loaded.'; return; }

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function dollars(n) {
    var sign = n < 0 ? '-$' : '$';
    return sign + Math.abs(n).toFixed(2);
  }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function age(listed) {
    if (!listed) return '—';
    var days = Math.floor((Date.parse(D.as_of + 'T00:00:00Z') - Date.parse(listed + 'T00:00:00Z')) / 864e5);
    if (days < 30) return days + 'd';
    if (days < 365) return Math.floor(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  /** Recompute one row's implied value from its stored factors. */
  function recompute(r) {
    return Math.max(1, Math.round(r.tvl_usd * r.multiple * r.growth_factor * r.maturity_factor * r.breadth_factor));
  }
  function verdictClass(v) {
    return v === 'FARM' ? 'farm' : (v === 'THIN' ? 'thin' : 'skip');
  }

  var params = new URLSearchParams(location.search);
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('cat');
  var chainEl = document.getElementById('chain');
  var watchEl = document.getElementById('watch');
  var sortEl = document.getElementById('sort');
  var rowsEl = document.getElementById('rows');
  var countEl = document.getElementById('count');

  document.getElementById('meta').textContent =
    D.rows.length + ' protocols ranked\nSnapshot ' + D.as_of + ' · floor ' + money(D.floor_usd);

  // KPI strip: the numbers a reader should see before a single row.
  var top = D.rows[0];
  document.getElementById('kpi-ranked').textContent = D.rows.length;
  document.getElementById('kpi-ranked-sub').textContent = 'of ' + D.universe.total + ' in the snapshot';
  document.getElementById('kpi-watch').textContent = D.rows.filter(function (r) { return r.watchlist; }).length + ' / 40';
  document.getElementById('kpi-top').textContent = money(top.implied_value_usd);
  document.getElementById('kpi-top-sub').textContent = 'rank 1 · ' + top.name;
  document.getElementById('kpi-multiple').textContent = D.curve.b.toFixed(2);
  var chosenCore = null;
  D.tournament.candidates.forEach(function (c) { if (c.name === D.tournament.chosen) chosenCore = c; });
  document.getElementById('kpi-miss').textContent = '×' + chosenCore.typical_miss_factor.toFixed(1);
  document.getElementById('kpi-miss-sub').textContent = 'typical miss, leave-one-out';

  var v = D.validation;
  var t = D.tournament;
  var v3Loo = t.candidates[0];
  var rs = t.resample;
  var validText = 'Out of sample, three ways. Split-half: fitted on ' + v.fit_n + ' live-token protocols, tested on the other ' +
    v.holdout_n + ' — typical miss ×' + v.typical_miss_factor.toFixed(2) + ', Spearman ' + v.spearman.toFixed(2) + '. ' +
    'Leave-one-out over all ' + t.n + ': the v4 core misses by ×' + chosenCore.typical_miss_factor.toFixed(2) +
    ' with ' + chosenCore.within_2x + ' of ' + t.n + ' within 2×, against the old category-median core\u2019s ×' +
    v3Loo.typical_miss_factor.toFixed(2) + ' and ' + v3Loo.within_2x + ' of ' + t.n + '. ' +
    'Across ' + rs.splits + ' seeded resampled splits it beat the old core on typical miss in ' + rs.v4_beats_v3.typical_miss +
    ' of ' + rs.splits + '. ' + v.recompute_match + '.';
  document.getElementById('valid-panel').textContent = validText;
  document.getElementById('method-valid').textContent = validText +
    ' The model orders launches better than it prices them, so read ranks first and values second.';
  document.getElementById('method-loo').textContent =
    'Five candidate cores, identical factors, leave-one-out over all ' + t.n + ' live-token protocols — only the pricing core differs. ' +
    'The old category-median core is the first row; the board runs the chosen row. A seeded ' + rs.splits + '-split resampling study ' +
    '(64 fit / 64 test) agrees: mean typical miss ×' + rs.v4_core.typical_miss_factor.toFixed(2) + ' for the v4 core against ×' +
    rs.v3_core.typical_miss_factor.toFixed(2) + ' for the old core, winning ' + rs.v4_beats_v3.typical_miss + ' of ' + rs.splits + ' splits head-to-head.';
  var gridHtml = '<table class="grid"><thead><tr><th>Candidate core</th><th>Typical miss</th><th>Within 2×</th><th>Spearman</th><th></th></tr></thead><tbody>';
  t.candidates.forEach(function (c) {
    gridHtml += '<tr' + (c.name === t.chosen ? ' class="chosen"' : '') + '><td>' + c.name + '</td><td>×' +
      c.typical_miss_factor.toFixed(2) + '</td><td>' + c.within_2x + ' / ' + t.n + '</td><td>' +
      c.spearman.toFixed(3) + '</td><td>' + (c.name === t.chosen ? 'chosen' : '') + '</td></tr>';
  });
  gridHtml += '</tbody></table>';
  document.getElementById('loo-grid').innerHTML = gridHtml;

  var u = D.universe;
  var reasons = Object.keys(u.set_aside_reasons).sort().map(function (k) {
    return u.set_aside_reasons[k] + ' ' + k;
  }).join(' · ');
  var universeText = 'Universe: ' + u.total + ' protocols = ' + u.ranked + ' ranked + ' +
    u.set_aside + ' set aside (' + reasons + ') + ' + u.already_trading + ' already trading. Nothing is dropped silently.';
  document.getElementById('universe-line').textContent = universeText;
  document.getElementById('method-universe').textContent = universeText;

  // Scatter: live tokens (grey), the fitted size curve (line), the board's top 10 (gold).
  (function scatter() {
    var el = document.getElementById('scatter');
    var W = 1336, H = 250, padL = 64, padR = 12, padT = 10, padB = 30;
    var pts = D.live_points;
    var top10 = D.rows.slice(0, 10);
    var allX = pts.map(function (p) { return p.tvl_usd; }).concat(top10.map(function (r) { return r.tvl_usd; }));
    var allY = pts.map(function (p) { return p.mcap_usd; }).concat(top10.map(function (r) { return r.implied_value_usd; }));
    var xMin = Math.log10(Math.min.apply(null, allX)), xMax = Math.log10(Math.max.apply(null, allX));
    var yMin = Math.log10(Math.min.apply(null, allY)), yMax = Math.log10(Math.max.apply(null, allY));
    function X(tvl) { return padL + (Math.log10(tvl) - xMin) / (xMax - xMin) * (W - padL - padR); }
    function Y(val) { return H - padB - (Math.log10(val) - yMin) / (yMax - yMin) * (H - padT - padB); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Scatter of TVL against market cap">';
    for (var e = Math.ceil(yMin); e <= Math.floor(yMax); e++) {
      var val = Math.pow(10, e);
      s += '<line x1="' + padL + '" y1="' + Y(val) + '" x2="' + (W - padR) + '" y2="' + Y(val) + '" class="sgrid"/>' +
        '<text x="' + (padL - 6) + '" y="' + (Y(val) + 4) + '" class="slabel" text-anchor="end">' + money(val) + '</text>';
    }
    for (var ex = Math.ceil(xMin); ex <= Math.floor(xMax); ex++) {
      var xv = Math.pow(10, ex);
      s += '<text x="' + X(xv) + '" y="' + (H - 8) + '" class="slabel" text-anchor="middle">' + money(xv) + '</text>';
    }
    s += '<text x="' + (padL + 4) + '" y="' + (padT + 10) + '" class="slabel">market cap →</text>';
    var path = '';
    for (var i = 0; i <= 40; i++) {
      var lx = xMin + (xMax - xMin) * i / 40;
      var tvl = Math.pow(10, lx);
      var fit = Math.exp(D.curve.a + D.curve.b * Math.log(tvl));
      path += (i === 0 ? 'M' : 'L') + X(tvl).toFixed(1) + ' ' + Y(fit).toFixed(1) + ' ';
    }
    s += '<path d="' + path + '" class="scurve"/>';
    pts.forEach(function (p) {
      s += '<circle cx="' + X(p.tvl_usd).toFixed(1) + '" cy="' + Y(p.mcap_usd).toFixed(1) + '" r="3" class="slive"><title>' + p.slug + '</title></circle>';
    });
    top10.forEach(function (r) {
      s += '<circle cx="' + X(r.tvl_usd).toFixed(1) + '" cy="' + Y(r.implied_value_usd).toFixed(1) + '" r="4.5" class="stop"><title>' + r.slug + ' (implied)</title></circle>';
    });
    s += '</svg>';
    el.innerHTML = s;
    document.getElementById('scatter-note').textContent =
      'Each grey dot is one of the ' + D.curve.n + ' live-token protocols (TVL vs market cap, log–log). The line is the fitted size curve, ' +
      'log(mcap) = ' + D.curve.a.toFixed(2) + ' + ' + D.curve.b.toFixed(2) + ' × log(TVL), R² ' + D.curve.r2.toFixed(2) +
      ' — the spine of the model: every implied value starts on this line, then its category offset and factors move it. ' +
      'Gold dots are the board\u2019s top 10 implied values on the same axes.';
  })();

  var cats = {}, chains = {};
  D.rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    r.chains.forEach(function (c) { chains[c] = 1; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catEl.appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainEl.appendChild(o);
  });
  if (params.get('q')) qEl.value = params.get('q');
  if (params.get('cat')) catEl.value = params.get('cat');
  if (params.get('watch')) watchEl.checked = true;

  function filtered() {
    var q = qEl.value.trim().toLowerCase();
    var cat = catEl.value, chain = chainEl.value, watch = watchEl.checked;
    var list = D.rows.filter(function (r) {
      if (watch && !r.watchlist) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var mode = sortEl.value;
    if (mode === 'implied' || mode === 'rank') list.sort(function (a, b) { return a.rank - b.rank; });
    if (mode === 'tvl') list.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    if (mode === 'growth') list.sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); });
    if (mode === 'age') list.sort(function (a, b) { return (a.listed_at || '9999') < (b.listed_at || '9999') ? -1 : 1; });
    return list;
  }

  function render() {
    var list = filtered();
    countEl.textContent = list.length + ' of ' + D.rows.length + ' shown';
    rowsEl.innerHTML = '';
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      if (r.rank <= 3) tr.className = 'top3';
      var chg = r.change_7d === null ? '—' : pct(r.change_7d);
      var cls = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'gain' : 'loss');
      tr.innerHTML =
        '<td>' + r.rank + '</td>' +
        '<td><b></b>' + (r.watchlist ? '<span class="pill">watchlist</span>' : '') + '</td>' +
        '<td>' + (r.category || '—') + '</td>' +
        '<td>' + r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls + '">' + chg + '</td>' +
        '<td class="num"><b>' + money(recompute(r)) + '</b></td>' +
        '<td class="num range">' + money(r.implied_low_usd) + ' – ' + money(r.implied_high_usd) + '</td>' +
        '<td class="num">' + dollars(r.airdrop_per_1k_usd) + '</td>' +
        '<td><span class="verdict ' + verdictClass(r.verdict) + '">' + r.verdict + '</span></td>' +
        '<td>›</td>';
      tr.querySelector('b').textContent = r.name;
      tr.addEventListener('click', function () { openDetail(r.slug); });
      rowsEl.appendChild(tr);
    });
  }

  function openDetail(slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var d = document.getElementById('detail');
    var steps = r.farm_steps.map(function (s) {
      var li = document.createElement('li'); li.textContent = s; return li.outerHTML;
    }).join('');
    d.innerHTML =
      '<h2></h2><p>' + (r.category || 'No category') + ' · ' + r.chains.join(', ') + '</p>' +
      '<div class="big">' + money(recompute(r)) + ' implied</div>' +
      '<div class="rangebar"><span>Range ' + money(r.implied_low_usd) + ' – ' + money(r.implied_high_usd) + '</span>' +
      '<span class="verdict ' + verdictClass(r.verdict) + '">' + r.verdict + '</span></div>' +
      '<dl>' +
      '<dt>Rank</dt><dd>#' + r.rank + ' of ' + D.rows.length + '</dd>' +
      '<dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd>' +
      '<dt>7-day change</dt><dd>' + pct(r.change_7d) + '</dd>' +
      '<dt>Tracked since</dt><dd>' + (r.listed_at || 'unknown') + ' (' + age(r.listed_at) + ')</dd>' +
      '<dt>Implied multiple</dt><dd>' + r.multiple.toFixed(3) + '× — size curve ' + r.multiple_raw.toFixed(3) +
      '× at this TVL, category offset ' + r.offset_factor.toFixed(2) + '× (shrunk, from ' + r.comparables_n + ' live comparables)</dd>' +
      '<dt>Curve alone says</dt><dd>' + money(r.curve_value_usd) + ' (no category offset)</dd>' +
      '<dt>Growth factor</dt><dd>' + r.growth_factor.toFixed(3) + '×</dd>' +
      '<dt>Maturity factor</dt><dd>' + r.maturity_factor.toFixed(3) + '×</dd>' +
      '<dt>Breadth factor</dt><dd>' + r.breadth_factor.toFixed(3) + '×</dd>' +
      '<dt>Farm cost, $1K / 4wk</dt><dd>' + dollars(r.farm_cost_usd) + '</dd>' +
      '<dt>Expected airdrop / $1K</dt><dd>' + dollars(r.airdrop_per_1k_usd) + ' (5% share, pro-rata)</dd>' +
      '<dt>Net per $1K</dt><dd>' + dollars(r.net_usd) + ' (at the low end: ' + dollars(r.net_low_usd) + ')</dd>' +
      '</dl>' +
      '<p class="recalc">Recomputed in this page: TVL × multiple × growth × maturity × breadth = ' +
      money(recompute(r)) + ' (board: ' + money(r.implied_value_usd) + '). ' + v.recompute_match + '.</p>' +
      '<h3>How to farm it</h3><ol>' + steps + '</ol>' +
      '<p class="recalc">Records no token in the snapshot — not proof it has none. ' +
      'Implied value is this board\u2019s own claim, not a prediction of a launch.</p>';
    d.querySelector('h2').textContent = r.name;
    document.getElementById('drawer').hidden = false;
  }
  document.getElementById('close').addEventListener('click', function () {
    document.getElementById('drawer').hidden = true;
  });

  var liveEl = document.getElementById('live-rows');
  D.comparables.forEach(function (c) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td></td><td>' + (c.category || '—') + '</td>' +
      '<td class="num">' + money(c.tvl_usd) + '</td>' +
      '<td class="num">' + money(c.mcap_usd) + '</td>' +
      '<td class="num">' + c.ratio.toFixed(2) + '×</td>';
    tr.querySelector('td').textContent = c.name;
    liveEl.appendChild(tr);
  });

  function tab(name) {
    ['board', 'live', 'method'].forEach(function (t) {
      document.getElementById('view-' + t).hidden = (t !== name);
      document.getElementById('tab-' + t).classList.toggle('active', t === name);
    });
  }
  document.getElementById('tab-board').addEventListener('click', function () { tab('board'); });
  document.getElementById('tab-live').addEventListener('click', function () { tab('live'); });
  document.getElementById('tab-method').addEventListener('click', function () { tab('method'); });

  [qEl, catEl, chainEl, watchEl, sortEl].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  render();
  if (params.get('detail')) openDetail(params.get('detail'));
})();
