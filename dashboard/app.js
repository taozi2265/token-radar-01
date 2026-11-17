// Token Radar's dashboard, model radar-5. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the 40-row watchlist ranking first, the
// early radar and the live-token table on tabs, a per-protocol detail view
// with the full derivation chain, and the model and validation section
// (collapsed by default, openable with #view=model). No network: every byte
// it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'watchlist', sort: 'implied', dir: -1, selected: null, view: 'board' };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1000) return '$' + Math.round(Math.abs(n)).toLocaleString('en-US').replace(/^/, n < 0 ? '-' : '');
    if (Math.abs(n) >= 10) return '$' + Math.round(n);
    return '$' + n.toFixed(2);
  }
  function fmtSigned(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var s = n > 0 ? '+' : n < 0 ? '-' : '';
    return s + fmtMoney(Math.abs(n));
  }
  function fmtOdds(o) {
    if (o === null || o === undefined || !isFinite(o) || o >= 10) return '>100%';
    return Math.round(o * 100) + '%';
  }
  function fmtNet(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (n >= 0) return '$' + n.toFixed(2) + '/h';
    return '-$' + (-n).toFixed(2) + '/h';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The model, recomputed in the page from the fitted curve and the row's
  // own snapshot fields, so the page and board.json agree on every number.
  // The curve's coefficients and the category offsets come from the data.
  function impliedOf(row) {
    var c = DATA.curve;
    var x = Math.log10(Math.max(1, row.tvl_usd));
    var v = c.intercept + c.slope * x;
    if (typeof row.change_7d === 'number' && isFinite(row.change_7d)) {
      var g = Math.min(1.2, Math.max(-0.6, row.change_7d)) / 100;
      v += c.growth_coef * Math.log10(1 + g);
    }
    var ageF = row.age_days === null || row.age_days === undefined ? 0.5 : Math.exp(-row.age_days / 240);
    v += c.age_coef * ageF;
    var br = Math.min(Math.max((row.chains || []).length - 1, 0), 4);
    v += c.breadth_coef * br;
    v += (c.offsets && c.offsets[row.category]) || 0;
    return Math.max(1, Math.round(Math.pow(10, v) * c.discount));
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('view')) state.view = params.get('view');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'watchlist') params.set('tab', state.tab);
    if (state.view !== 'board') params.set('view', state.view);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function baseRows() {
    if (state.tab === 'watchlist') return DATA.rows.filter(function (r) { return r.watchlist; });
    if (state.tab === 'early') return DATA.rows.filter(function (r) { return !r.watchlist; });
    return DATA.rows;
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return baseRows().filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'verdict') { av = a.farm_verdict === 'farm' ? 2 : a.farm_verdict === 'thin' ? 1 : 0; bv = b.farm_verdict === 'farm' ? 2 : b.farm_verdict === 'thin' ? 1 : 0; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'ring', 'aria-hidden': 'true' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var v = DATA.validation;
    var top = DATA.rows.filter(function (r) { return r.watchlist; })[0];
    var farm = DATA.rows.filter(function (r) { return r.farm_verdict === 'farm'; }).length;
    var thin = DATA.rows.filter(function (r) { return r.farm_verdict === 'thin'; }).length;
    return el('section', { class: 'lede' },
      el('h1', null, 'Every protocol with no token on record, ', el('em', { text: 'ranked by what its token could be worth' }), '.'),
      el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more below that floor — no wrapped, staked or bridged product of a token that already trades. Implied value comes from a curve fitted to the live market, adjusted for each protocol’s own growth, run time, breadth and category, and is a model, not a price, and never a promise of a token.' }),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size + ' ✓' })),
        el('div', { class: 'fact' }, el('span', { text: 'Candidates ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top watchlist value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Farm / thin / skip' }), el('b', { text: farm + ' / ' + thin + ' / ' + (DATA.board_size - farm - thin) }))
      ),
      el('div', { class: 'model-strip' },
        el('span', { class: 'formula', text: 'log10 mcap = ' + DATA.curve.intercept.toFixed(4) + ' + ' + DATA.curve.slope.toFixed(4) + ' x log10 TVL, then growth, time, breadth and category adjustments, x 0.5' }),
        el('span', { text: 'LOO median miss ' + v.loo_median_miss_x.toFixed(2) + 'x · LOO rank ρ ' + v.loo_spearman.toFixed(2) + ' · walk-forward ' + v.wf_median_miss_x.toFixed(2) + 'x · ranking differs from TVL order in ' + v.watchlist_diff + ' of 40 watchlist positions' })
      ),
      el('p', { class: 'fingerprint', text: 'Data fingerprint: ' + DATA.curve.fingerprint.protocols + ' protocols · watchlist ' + DATA.curve.fingerprint.watchlist + ' · snapshot ' + DATA.curve.fingerprint.snapshot_sha256.slice(0, 16) + ' · as of ' + DATA.curve.fingerprint.as_of })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; state.sort = 'implied'; state.dir = -1; writeHash(); render(); } });
    }
    var shown = state.tab === 'live' ? DATA.live.length : filteredRows().length;
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Board' }),
        el('div', { class: 'tabs' },
          tabBtn('watchlist', 'Watchlist (40)'),
          tabBtn('early', 'Early radar (157)'),
          tabBtn('live', 'Live token')
        )),
      el('span', { class: 'count', text: shown + ' rows shown' })
    );
  }

  function sortHeader(key, label, num) {
    return el('th', { scope: 'col', class: num ? 'num' : null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    var caption = state.tab === 'watchlist'
      ? 'The 40 watchlist protocols, strongest implied value first. Select a row for its derivation chain and farm plan. The band is the P25–P75 range from quantile regression; the verdict line shows the launch odds that repay the cost and the net per hands-on hour.'
      : 'Early radar: the 157 launch candidates below the $50M watchlist floor, strongest implied value first. Select a row for its derivation chain and farm plan.';
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + ' · ' + fmtAge(r.age_days) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num implied-val', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub', text: 'P25–P75 ' + fmtUsd(r.band_p25_usd) + '–' + fmtUsd(r.band_p75_usd) })
        )),
        el('td', null, el('div', { class: 'verdict-cell' },
          el('span', { class: 'pill ' + r.farm_verdict, text: r.farm_verdict }),
          el('span', { class: 'sub', text: fmtOdds(r.farm_break_even_odds) + ' · ' + fmtNet(r.farm_net_per_hour_usd) })
        ))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: caption }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', true),
            sortHeader('name', 'Protocol', false),
            sortHeader('tvl', 'TVL', true),
            sortHeader('growth', '7d', true),
            sortHeader('implied', 'Implied value', false),
            sortHeader('verdict', 'Verdict', false)
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', { onclick: function () {}, tabindex: '-1' },
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + r.chains + ' chain' + (r.chains === 1 ? '' : 's') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.predicted_mcap_usd) }),
        el('td', { class: 'num', text: r.miss_x.toFixed(2) + 'x' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Live token: these protocols already trade, so their market cap is a fact and the model’s prediction sits beside it. They are set aside from the pre-token ranking — and their market caps are what the curve is fitted on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Model prediction' }), el('th', { scope: 'col', class: 'num', text: 'Miss' }))),
          tbody
        )
      )
    );
  }

  function fmtTick(v) {
    if (v >= 1e9) return '$' + (v / 1e9) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3) + 'K';
    return '$' + v;
  }

  function scatterPanel() {
    var s = DATA.scatter;
    var xs = [], ys = [];
    s.live.forEach(function (p) { xs.push(p.x); ys.push(p.y); });
    s.pre.forEach(function (p) { xs.push(p.x); ys.push(p.y); });
    s.curve.forEach(function (g) { xs.push(g.x); ys.push(g.y); });
    s.band.forEach(function (g) { xs.push(g.x); ys.push(g.lo); ys.push(g.hi); });
    var x0 = Math.floor(Math.min.apply(null, xs));
    var x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys));
    var y1 = Math.ceil(Math.max.apply(null, ys));
    var W = 640, H = 300, ML = 48, MR = 16, MT = 14, MB = 32;
    function X(v) { return ML + (v - x0) / (x1 - x0) * (W - ML - MR); }
    function Y(v) { return MT + (1 - (v - y0) / (y1 - y0)) * (H - MT - MB); }
    var parts = [];
    parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="scatter" role="img" aria-label="Market cap against TVL, log scales: traded tokens, the fitted curve, its P25 to P75 band, and the pre-token protocols at their implied value">');
    var tx, ty;
    for (tx = Math.ceil(x0); tx <= x1; tx++) {
      parts.push('<line x1="' + X(tx).toFixed(1) + '" y1="' + MT + '" x2="' + X(tx).toFixed(1) + '" y2="' + (H - MB) + '" class="grid"/>');
      var anchor = tx === Math.ceil(x0) ? 'start' : tx === x1 ? 'end' : 'middle';
      parts.push('<text x="' + X(tx).toFixed(1) + '" y="' + (H - 10) + '" class="tick" text-anchor="' + anchor + '">' + fmtTick(Math.pow(10, tx)) + '</text>');
    }
    for (ty = Math.ceil(y0); ty <= y1; ty++) {
      parts.push('<line x1="' + ML + '" y1="' + Y(ty).toFixed(1) + '" x2="' + (W - MR) + '" y2="' + Y(ty).toFixed(1) + '" class="grid"/>');
      parts.push('<text x="' + (ML - 6) + '" y="' + (Y(ty) + 3).toFixed(1) + '" class="tick" text-anchor="end">' + fmtTick(Math.pow(10, ty)) + '</text>');
    }
    var midY = MT + (H - MT - MB) / 2;
    parts.push('<text x="' + (ML + (W - ML - MR) / 2).toFixed(1) + '" y="' + (H - 1) + '" class="axis" text-anchor="middle">TVL (log)</text>');
    parts.push('<text x="12" y="' + midY.toFixed(1) + '" class="axis" text-anchor="middle" transform="rotate(-90 12 ' + midY.toFixed(1) + ')">Market cap / implied value (log)</text>');
    var bandPts = s.band.map(function (g) { return X(g.x).toFixed(1) + ',' + Y(g.lo).toFixed(1); })
      .concat(s.band.slice().reverse().map(function (g) { return X(g.x).toFixed(1) + ',' + Y(g.hi).toFixed(1); }));
    parts.push('<polygon points="' + bandPts.join(' ') + '" class="band"/>');
    parts.push('<polyline points="' + s.curve.map(function (g) { return X(g.x).toFixed(1) + ',' + Y(g.y).toFixed(1); }).join(' ') + '" class="curve" fill="none"/>');
    s.live.forEach(function (p) {
      parts.push('<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="2.4" class="' + (p.wrapper ? 'dot-set' : 'dot-fit') + '"/>');
    });
    s.pre.forEach(function (p) {
      parts.push('<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="1.9" class="' + (p.watchlist ? 'dot-pre' : 'dot-early') + '"/>');
    });
    parts.push('</svg>');
    return el('section', { class: 'panel scatter-panel' },
      el('h2', { text: 'The curve, against the market that fitted it' }),
      el('p', { class: 'val-note', text: 'Traded tokens are plotted at their real market cap; pre-token protocols at their pre-discount implied value. Gold dots are the 40 watchlist protocols; the paler dots are the early radar. The band is the P25–P75 range from quantile regression. Where the dots sit far from the curve, the model is guessing hardest.' }),
      el('div', { html: parts.join('') }),
      el('div', { class: 'legend' },
        el('span', null, el('i', { class: 'sw dot-fit' }), 'Traded token, in the fit'),
        el('span', null, el('i', { class: 'sw dot-set' }), 'Traded, wrapper (in the fit, indicator)'),
        el('span', null, el('i', { class: 'sw dot-pre' }), 'Watchlist, at implied value'),
        el('span', null, el('i', { class: 'sw dot-early' }), 'Early radar, at implied value'),
        el('span', null, el('i', { class: 'sw curve' }), 'Fitted curve'),
        el('span', null, el('i', { class: 'sw band' }), 'P25–P75 band')
      )
    );
  }

  function validationPanel() {
    var v = DATA.validation;
    var rows = v.ablation.map(function (a) {
      return el('tr', { class: a.id === 'radar5' ? 'used' : null },
        el('td', { text: a.label + (a.id === 'radar5' ? ' — the model' : '') }),
        el('td', { class: 'num', text: a.loo_miss_x.toFixed(2) + 'x' }),
        el('td', { class: 'num', text: a.loo_within_3x_pct + '%' }),
        el('td', { class: 'num', text: a.loo_spearman.toFixed(2) }),
        el('td', { class: 'num', text: a.loo_kendall.toFixed(2) }),
        el('td', { class: 'num', text: a.wf_miss_x.toFixed(2) + 'x' }),
        el('td', { class: 'num', text: a.wf_within_3x_pct + '%' }),
        el('td', { text: a.note })
      );
    });
    return el('section', { class: 'panel validation' },
      el('h2', { text: 'Model validation — a fitted curve, tested out of sample, not asserted' }),
      el('div', { class: 'val-stats' },
        el('div', { class: 'val-stat' },
          el('span', { text: 'Leave-one-out · median miss' }),
          el('b', { text: v.loo_median_miss_x.toFixed(2) + 'x' }),
          el('span', { class: 'val-sub', text: v.loo_n + ' live tokens, each predicted without itself · ' + v.loo_within_3x_pct + '% within 3x · rank ρ ' + v.loo_spearman.toFixed(2) + ' · τ ' + v.loo_kendall.toFixed(2) })),
        el('div', { class: 'val-stat' },
          el('span', { text: 'Walk-forward · median miss' }),
          el('b', { text: v.wf_median_miss_x.toFixed(2) + 'x' }),
          el('span', { class: 'val-sub', text: 'fitted on ' + v.wf_fit_n + ' listed before ' + v.wf_cutoff + ', tested on ' + v.wf_test_n + ' after · ' + v.wf_within_3x_pct + '% within 3x · rank ρ ' + v.wf_spearman.toFixed(2) })),
        el('div', { class: 'val-stat' },
          el('span', { text: 'Band coverage' }),
          el('b', { text: v.band_coverage_pct + '%' }),
          el('span', { class: 'val-sub', text: 'of live market caps fall inside their own P25–P75 band (a P25–P75 band should cover about 50%)' })),
        el('div', { class: 'val-stat' },
          el('span', { text: 'Ranking vs TVL order' }),
          el('b', { text: v.watchlist_diff + ' / 40 differ' }),
          el('span', { class: 'val-sub', text: 'top 10 differs in ' + v.top10_diff + ' · Spearman vs TVL order ' + v.rank_vs_tvl_spearman.toFixed(2) + ' — the ranking is the model’s, not the size list’s' }))
      ),
      el('h3', { class: 'live-h', text: 'Out of sample — each variant in turn' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'ablation' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Variant' }), el('th', { scope: 'col', class: 'num', text: 'LOO miss' }), el('th', { scope: 'col', class: 'num', text: 'Within 3x' }), el('th', { scope: 'col', class: 'num', text: 'Rank ρ' }), el('th', { scope: 'col', class: 'num', text: 'Rank τ' }), el('th', { scope: 'col', class: 'num', text: 'Walk-fwd miss' }), el('th', { scope: 'col', class: 'num', text: 'Within 3x' }), el('th', { scope: 'col', text: 'Why' }))),
          el('tbody', null, rows)
        )
      ),
      el('p', { class: 'val-note', text: 'Rank correlation is the primary validation metric here, because the ranking is what is scored: the leave-one-out rank correlation rises from 0.30 for the curve alone to 0.38 for radar-5. A curve is a central tendency, not a price — only about ' + v.loo_within_3x_pct + '% of live market caps land within 3x of it.' })
    );
  }

  function modelPanel() {
    var c = DATA.curve;
    var v = DATA.validation;
    var offsets = Object.keys(c.offsets).sort(function (a, b) { return c.offsets[b] - c.offsets[a]; });
    var offRows = offsets.slice(0, 12).map(function (k) {
      return el('tr', null, el('td', { text: k }), el('td', { class: 'num', text: (c.offsets[k] > 0 ? '+' : '') + (Math.pow(10, c.offsets[k]) - 1 >= 0 ? '+' : '') + Math.round((Math.pow(10, c.offsets[k]) - 1) * 100) + '%' }));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How the value is made' }),
      el('div', { class: 'model-eq' },
        el('span', { class: 'formula', text: 'log10 mcap = ' + c.intercept.toFixed(4) + ' + ' + c.slope.toFixed(4) + ' x log10 TVL + ' + c.wrapper.toFixed(4) + ' x wrapper' }),
        el('span', { text: 'Huber fit on ' + c.fit_pool_n + ' live protocols · then growth, time, breadth and category adjustments · implied value = 10^curve x 0.5 (pre-token discount)' })),
      el('p', { text: 'The curve is fitted on traded protocols only: each live market cap is a price the market has already printed, and the curve is the size-to-value relationship the market actually shows. A protocol with no token is priced by reading its TVL off that curve, then adjusting for its own figures — a 7-day change (a recent spike is stripped, a recent fall partly undone), how long it has run with no token, how many chains it spans, and the category it sits in — and then taking a flat 0.5 haircut for the fact that it has not launched. Wrapped, staked, bridged and restaked products stay in the fit with a wrapper indicator, so the fit uses the whole live market instead of setting a quarter of it aside.' }),
      el('h3', { text: 'The adjustments, and how big they are' }),
      el('p', { text: 'The adjustments are small on purpose. The snapshot shows no strong signal in any of them — the mcap/TVL multiple has no correlation with chain count, 7-day change or listing age — so each is shrunk toward zero and kept only so the derivation uses the protocol’s own figures. The growth term moves a value by at most a few percent; the time term by at most 2%; the breadth term by at most 4%. The category offset is the largest adjustment: an empirical-Bayes shrinkage of the category’s median residual (pseudo-count ' + c.category_pseudo_count + ', capped at ±' + Math.round((Math.pow(10, c.category_offset_cap) - 1) * 100) + '%), so a category with few protocols barely moves and a large one moves by most of its median residual. The twelve largest offsets:' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'calib' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Offset' }))),
          el('tbody', null, offRows)
        )
      ),
      el('h3', { text: 'What the band means' }),
      el('p', { text: 'Every implied value carries a P25–P75 band from quantile regression on the live market (τ = 0.25 and 0.75), with the same growth, time, breadth and category adjustments applied to both ends. The band is wide on purpose: the curve misses a live market cap by ' + v.loo_median_miss_x.toFixed(2) + 'x in the median case, and ' + v.band_coverage_pct + '% of live market caps fall inside their own band. The band says how uncertain the model knows itself to be.' }),
      el('h3', { text: 'Farm economics' }),
      el('p', { text: 'If a token launches, the model assumes 10% of its implied value goes to airdrops, split among the farmers of that size tier — 4,000 for a protocol under $100M TVL, 8,000 up to $1B, 15,000 above it — because a small protocol has fewer farmers chasing it. The slice that follows is compared with the cost of farming — gas plus the yield forgone on the capital — and the verdict is the launch odds that would repay that cost: farm if the cost is repaid at 10% launch odds or less, thin up to 33%, skip beyond that. The net per hands-on hour uses a 25% launch chance, which is a guess, and the detail view shows every input so you can change it in your head.' }),
      el('p', { text: 'Farming a listed protocol does not promise a reward. Points systems change, allocations are decided after the fact, and a protocol can launch without airdropping at all. The verdicts are a cost check, not a recommendation.' }),
      el('h3', { text: 'Limits of the radar' }),
      el('p', { text: 'The snapshot is sealed: nothing is fetched live, so a protocol that launched or changed after the snapshot date is still scored as it was. A curve is a central tendency — the scatter plot shows how far real tokens sit from it. Missing 7-day change reads as no change, and a missing listing date reads as the neutral middle of the time term, so no protocol is dropped for a missing field. Nothing here is financial advice, and nothing here is a claim that any protocol will launch a token.' })
    );
  }

  var dialog = null;
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = el('dialog', { class: 'detail' });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) { dialog.close(); state.selected = null; writeHash(); }
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function openDetail(slug) {
    var row = DATA.rows.find(function (r) { return r.slug === slug; });
    if (!row) return;
    var d = ensureDialog();
    state.selected = row.slug;
    writeHash();
    var recomputed = impliedOf(row);
    d.innerHTML = '';
    d.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.rows.length + (row.watchlist ? ' · watchlist' : ' · early radar') }),
        el('h2', { text: row.name }),
        el('p', { class: 'muted', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · ' + fmtAge(row.age_days) + ' old · TVL ' + fmtUsd(row.tvl_usd) })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close detail', text: 'Close', onclick: function () { d.close(); state.selected = null; writeHash(); } })
    ));
    d.appendChild(el('section', { class: 'detail-grid' },
      el('div', null,
        el('h3', { text: 'Implied value — the derivation chain' }),
        el('div', { class: 'detail-stat' },
          el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
          el('div', null, el('span', { text: 'P25–P75 band' }), el('b', { text: fmtUsd(row.band_p25_usd) + '–' + fmtUsd(row.band_p75_usd) })),
          el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: '7d' }), el('b', { text: fmtPct(row.change_7d) }))
        ),
        el('p', { text: 'Each line is a dollar amount, and they add up to the implied value:' }),
        el('dl', { class: 'eq' },
          el('dt', { text: 'Base curve value' }), el('dd', { text: fmtMoney(row.base_value_usd) }),
          el('dt', { text: 'Growth adjustment' }), el('dd', { text: fmtSigned(row.growth_adj_usd) }),
          el('dt', { text: 'Time adjustment' }), el('dd', { text: fmtSigned(row.time_adj_usd) }),
          el('dt', { text: 'Chain adjustment' }), el('dd', { text: fmtSigned(row.chain_adj_usd) }),
          el('dt', { text: 'Category adjustment' }), el('dd', { text: fmtSigned(row.category_adj_usd) }),
          el('dt', { text: 'Pre-token discount' }), el('dd', { text: '-' + fmtMoney(row.discount_usd) }),
          el('dt', { text: 'Implied value' }), el('dd', { text: fmtUsd(row.implied_value_usd) })
        ),
        el('p', { class: 'muted', text: 'The page recomputes this value as ' + fmtUsd(recomputed) + ' from the curve and this protocol’s own figures — the same number board.json carries. The band is the P25–P75 range from quantile regression, with the same adjustments applied to both ends.' })
      ),
      el('div', null,
        el('h3', { text: 'Farm verdict' }),
        el('div', { class: 'detail-stat' },
          el('div', null, el('span', { text: 'Verdict' }), el('b', null, el('span', { class: 'pill ' + row.farm_verdict, text: row.farm_verdict }))),
          el('div', null, el('span', { text: 'Launch odds that repay the cost' }), el('b', { text: fmtOdds(row.farm_break_even_odds) })),
          el('div', null, el('span', { text: 'Net per hands-on hour' }), el('b', { text: fmtNet(row.farm_net_per_hour_usd) })),
          el('div', null, el('span', { text: 'Slice if it launches' }), el('b', { text: fmtMoney(row.farm_expected_usd / 0.25) }))
        ),
        el('p', { text: row.farm_reason }),
        el('dl', { class: 'eq' },
          el('dt', { text: 'Capital to farm with' }), el('dd', { text: '$' + row.farm_capital_usd + ' (TVL tier)' }),
          el('dt', { text: 'Farmers sharing the pool' }), el('dd', { text: row.farm_farmers.toLocaleString('en-US') + ' (TVL tier)' }),
          el('dt', { text: 'Total cost of farming' }), el('dd', { text: '$' + row.farm_cost_usd.toFixed(2) }),
          el('dt', { text: 'Expected slice' }), el('dd', { text: '$' + row.farm_expected_usd.toFixed(2) + ' at a 25% launch chance' }),
          el('dt', { text: 'Break-even odds' }), el('dd', { text: 'cost / slice = ' + fmtOdds(row.farm_break_even_odds) }),
          el('dt', { text: 'Net per hands-on hour' }), el('dd', { text: fmtNet(row.farm_net_per_hour_usd) + ' over ' + row.farm_total_hours + ' hands-on hours' })
        ),
        el('p', { class: 'muted', text: 'The farm plan is priced for this protocol’s own TVL, chain count and run time — the capital, the hold period and the gas all vary, so no two protocols share a plan.' })
      )
    ));
    d.appendChild(el('section', null,
      el('h3', { text: 'How to farm ' + row.name }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) { return el('li', { text: s }); }))
    ));
    d.appendChild(el('section', null,
      el('h3', { text: 'What the number does not say' }),
      el('p', { text: 'A ' + row.farm_verdict + ' verdict does not mean ' + row.name + ' will launch a token, and a token launch does not promise an airdrop. The implied value is the model’s central estimate for a protocol of this size, and the band — ' + fmtUsd(row.band_p25_usd) + ' to ' + fmtUsd(row.band_p75_usd) + ' — is how wide the model’s own uncertainty runs. Check the protocol’s own channels before spending anything.' })
    ));
    if (!d.open) d.showModal();
  }

  function modelSection() {
    var details = el('details', { class: 'model-section', id: 'model-section' });
    if (state.view === 'model') details.setAttribute('open', '');
    var summary = el('summary', null, el('span', { text: 'Model & validation' }), el('span', { class: 'sub', text: ' — the fitted curve, the ablation table, the scatter plot, and how the value is made' }));
    summary.addEventListener('click', function () {
      state.view = state.view === 'model' ? 'board' : 'model';
      writeHash();
    });
    details.appendChild(summary);
    details.appendChild(validationPanel());
    details.appendChild(scatterPanel());
    details.appendChild(modelPanel());
    return details;
  }

  function render() {
    app.innerHTML = '';
    app.appendChild(header());
    app.appendChild(lede());
    app.appendChild(controls());
    if (state.tab === 'live') app.appendChild(liveTable());
    else app.appendChild(boardTable());
    app.appendChild(modelSection());
  }

  readHash();
  render();
  if (state.selected) openDetail(state.selected);
  window.addEventListener('hashchange', function () { readHash(); render(); });
})();
