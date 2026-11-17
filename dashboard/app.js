// Token Radar's dashboard, model radar-3. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own inputs, the validation the
// snapshot ran on the model, the calibration table and the protocol's farm
// plan with its netted verdict. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchOnly: false };

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
  function fmtMult(n) { return (n === null || n === undefined) ? 'n/a' : n.toFixed(3) + 'x'; }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (n >= 1000) return '$' + Math.round(n).toLocaleString('en-US');
    if (n >= 10) return '$' + Math.round(n);
    return '$' + n.toFixed(2);
  }

  // The farm verdict, recomputed in the page from the same constants as the
  // model, so the page and board.json agree on it as they do on the value.
  function farmCostOf(row) {
    var m = DATA.model;
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var gas = (capital >= 150 ? 8 : 4) + 2 * Math.ceil(hold / 7);
    var opp = capital * m.opportunity_apr * hold / 365;
    return { capital: capital, hold: hold, gas: gas, opp: opp, total: gas + opp };
  }
  function verdictOf(row) {
    var m = DATA.model;
    var cost = farmCostOf(row);
    var share = row.implied_value_usd * m.farmer_share_pct / m.farmers;
    var ratio = cost.total > 0 ? share / cost.total : 0;
    return {
      verdict: ratio >= m.farm_multiple ? 'farm' : ratio >= m.thin_multiple ? 'thin' : 'skip',
      share: share,
      cost: cost,
      ratio: ratio
    };
  }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and the calibrated multiple, and checks the number board.json
  // carries, so the page's code and the board's data are visibly the same
  // arithmetic. The multiple itself comes from the calibration table.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var breadth = 1 + m.breadth_step * Math.min(Math.max((row.chains || []).length - 1, 0), m.breadth_cap);
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * m.pre_token_discount * growthMult * maturity * breadth));
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

  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and keep the loan-to-value low.';
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and keep the position in range.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + " into " + name + "'s highest-yield vault on " + chain + ' and leave it compounding.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + name + "'s basis strategy on " + chain + ' and keep the position open.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and hold the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or hold $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + " of " + name + "'s index token on " + chain + ' and hold it.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Spend $' + capital + ' through ' + name + ' on ' + chain + ' and keep the account active.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + " of USDC to " + name + "'s chain, use its app once, and keep the balance there.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper, never in a screenshot or a chat.', cost: 'nothing to set up; under $3 of gas for the first transaction', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action each week on ' + p.name + ' — a deposit, a swap, a borrow, or a vote — so the wallet shows steady use.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days, so the activity is counted in more than one snapshot window.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open " + p.name + "'s own points or rewards page from its official site and claim only through the link it publishes; never pay a fee to claim and never trust a link from a direct message.", cost: 'no fee to check', time: '10 minutes' },
      { text: 'Write the wallet address, the dates, and every transaction hash in a farm log, so you can repeat the position or unwind it without guessing.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
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
    if (params.get('watch') === '1') state.watchOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watchOnly) params.set('watch', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
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
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'verdict') { av = a.verdict === 'farm' ? 2 : a.verdict === 'thin' ? 1 : 0; bv = b.verdict === 'farm' ? 2 : b.verdict === 'thin' ? 1 : 0; }
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
        el('span', null, 'DefiLlama protocol index, ', el('b', { text: DATA.rows.length + DATA.live.length + ' protocols read' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    return el('section', { class: 'lede' },
      el('h1', null, 'Every protocol with no token on record, ', el('em', { text: 'ranked by what its token could be worth' }), '.'),
      el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more below that floor — no wrapped, staked or bridged product of a token that already trades. Implied value is a model, not a price, and never a promise of a token.' }),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Candidates ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }))
      )
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
    var watchBox = el('input', { type: 'checkbox', id: 'watch', checked: state.watchOnly ? 'checked' : null, 'aria-label': 'Watchlist only' });
    watchBox.addEventListener('change', function () { state.watchOnly = watchBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('label', { class: 'check', for: 'watch' }, watchBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col', class: key === 'tvl' || key === 'growth' || key === 'age' || key === 'implied' ? 'num' : null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function statusPill(r) {
    if (r.watchlist) return el('span', { class: 'pill watch', text: 'watchlist' });
    return el('span', { class: 'pill', text: 'no token' });
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; writeHash(); render(); } })
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
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num implied-val', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('div', { class: 'verdict-cell' },
          el('span', { class: 'pill ' + r.verdict, text: r.verdict }),
          el('span', { class: 'sub', text: r.value_per_cost + 'x' })
        )),
        el('td', null, statusPill(r))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Launch candidates, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('verdict', 'Verdict'),
            el('th', { scope: 'col', text: 'Token' })
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
        el('td', null, el('span', { class: 'pill live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'pill live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market caps are what calibrates it.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function validationPanel() {
    var v = DATA.validation;
    var b = v.baseline_loo;
    var wb = v.baseline_walk_forward;
    return el('section', { class: 'panel validation' },
      el('h2', { text: 'Model validation — tested on the live market, not asserted' }),
      el('div', { class: 'val-stats' },
        el('div', { class: 'val-stat' },
          el('span', { text: 'Leave-one-out · median error' }),
          el('b', { text: v.loo.median_ape_pct + '%' }),
          el('span', { class: 'val-sub', text: v.loo.n + ' live tokens, each predicted without itself · ' + v.loo.within_2x + ' within 2x (' + v.loo.within_2x_pct + '%)' })),
        el('div', { class: 'val-stat' },
          el('span', { text: 'Walk-forward · median error' }),
          el('b', { text: v.walk_forward.median_ape_pct + '%' }),
          el('span', { class: 'val-sub', text: 'fitted on ' + v.walk_forward.fit_n + ' listed before ' + v.walk_forward.cutoff + ', tested on ' + v.walk_forward.test_n + ' after · ' + v.walk_forward.within_2x + ' within 2x (' + v.walk_forward.within_2x_pct + '%)' })),
        el('div', { class: 'val-stat' },
          el('span', { text: 'Category multiples did worse' }),
          el('b', { text: b.median_ape_pct + '% / ' + wb.median_ape_pct + '%' }),
          el('span', { class: 'val-sub', text: 'leave-one-out ' + b.within_2x_pct + '% within 2x, walk-forward ' + wb.within_2x_pct + '% — so radar-3 prices off the market median' })),
        el('div', { class: 'val-stat' },
          el('span', { text: 'Market median multiple' }),
          el('b', { text: fmtMult(DATA.global_median) }),
          el('span', { class: 'val-sub', text: 'median market-cap-to-TVL of the live protocols in this snapshot' }))
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var calibRows = (DATA.calibration || []).map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.comparables) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is priced' }),
      el('p', { text: 'The multiple is one market price, not one per category. Radar-2 priced each category off its own live-token median; radar-3 tested that choice two ways on this snapshot and it lost both: leave-one-out put the category model at a ' + DATA.validation.baseline_loo.median_ape_pct + '% median error (' + DATA.validation.baseline_loo.within_2x_pct + '% within 2x) against ' + DATA.validation.loo.median_ape_pct + '% (' + DATA.validation.loo.within_2x_pct + '%) for one market-wide median, and the walk-forward test gave ' + DATA.validation.baseline_walk_forward.median_ape_pct + '% (' + DATA.validation.baseline_walk_forward.within_2x_pct + '%) against ' + DATA.validation.walk_forward.median_ape_pct + '% (' + DATA.validation.walk_forward.within_2x_pct + '%). The category differences are mostly noise, so every protocol is priced off the market median of ' + fmtMult(DATA.global_median) + '.' }),
      el('div', { class: 'formula' },
        el('b', { text: 'implied = round( tvl_usd x ' + DATA.global_median.toFixed(3) + ' x 0.5' }),
        ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')',
        ' x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ')',
        ' x (1 + ' + m.breadth_step + ' x min(chains - 1, ' + m.breadth_cap + ')) )'
      ),
      el('p', null, 'The ', el('b', { text: '0.5' }), ' is the pre-token discount: a token that does not exist yet carries launch, vesting and liquidity risk a live token does not. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ', el('b', { text: m.unknown_age_days + ' days' }), '. Every ratio behind the median is winsorized to [' + m.winsor_low + ', ' + m.winsor_high + '] first, so one wild outlier cannot set the price. No protocol name is special-cased, and no row is hand-picked.'),
      el('p', null, 'Farm verdicts are netted, not just ranked: a farmer’s share is taken as ', el('b', { text: Math.round(m.farmer_share_pct * 100) + '% of the implied value' }), ', paid to ', el('b', { text: m.farmers.toLocaleString('en-US') + ' farmers' }), ', against a farming cost of gas plus the yield forgone on the locked capital (' + Math.round(m.opportunity_apr * 100) + '% a year). ', el('b', { text: 'Farm' }), ' when the share is at least ' + m.farm_multiple + 'x the cost, ', el('b', { text: 'thin' }), ' when it covers the cost, ', el('b', { text: 'skip' }), ' when it does not.'),
      el('h3', { class: 'live-h', text: 'Reference: what each category’s live protocols pay' }),
      el('p', { text: 'Each category’s own median, from its live protocols. The model does not price off these — the validation above says the market median is the better price — but they are shown so the choice is auditable.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'calib' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Live protocols' }), el('th', { scope: 'col', class: 'num', text: 'Multiple' }))),
          el('tbody', null, calibRows)
        )
      ),
      el('div', { class: 'warn', text: 'Honest limits: this snapshot records no token for these protocols, it does not promise one. An implied value is a model estimate built from TVL, growth, age and the live market — not a price, not a prediction, and not advice. Wrapped, staked and bridged products of tokens that already trade are left out on purpose.' }),
      el('p', { class: 'val-note', text: 'Honest read on the validation: a multiple is a central tendency, not a price — only about a quarter of live market caps land within 2x of the prediction. What the tests show is that one market price beats a price per category, out of sample, twice. The tests predict live market caps with the same formula the board uses, minus the 0.5 pre-token discount (a stated haircut, not a fitted number), and both are computed from this sealed snapshot.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row);
    var agrees = recomputed === row.implied_value_usd;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · Watchlist' : ' · Early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var vc = verdictOf(row);
    var cost = vc.cost;
    dialog.appendChild(el('section', { class: 'detail-section verdict' },
      el('h3', { text: 'Farm verdict' }),
      el('div', { class: 'verdict-line' },
        el('span', { class: 'pill ' + row.verdict, text: row.verdict }),
        el('span', { text: row.verdict_reason })
      ),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Capital to lock' }), el('b', { class: 'num', text: fmtMoney(cost.capital) })),
        el('div', null, el('span', { text: 'Hold' }), el('b', { class: 'num', text: cost.hold + ' days' })),
        el('div', null, el('span', { text: 'Gas' }), el('b', { class: 'num', text: fmtMoney(cost.gas) })),
        el('div', null, el('span', { text: 'Forgone yield (5%)' }), el('b', { class: 'num', text: fmtMoney(cost.opp) })),
        el('div', null, el('span', { text: 'Farming cost' }), el('b', { class: 'num', text: fmtMoney(cost.total) })),
        el('div', null, el('span', { text: 'Farmer’s share' }), el('b', { class: 'num', text: fmtMoney(vc.share) }))
      ),
      el('p', { class: 'note', text: 'The page recomputes this verdict as ' + vc.verdict + ' — ' + (vc.verdict === row.verdict ? 'the same verdict board.json carries.' : 'which differs from the board: the data would be stale.') })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Market multiple' }), el('b', { class: 'num', text: fmtMult(row.multiple) })),
        el('div', null, el('span', { text: 'Category median (reference)' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) + ' (' + row.comparables + ' live)' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains / breadth' }), el('b', { class: 'num', text: (row.chains || []).length + ' / ' + String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'note', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (agrees ? ' — the same number board.json carries.' : ' — which differs from the board: the data would be stale.') + ' The multiple is the market-wide median market-cap-to-TVL ratio of the live protocols in this snapshot; the category median is shown for reference only. This is an estimate, not a price.' }),
      el('p', { class: 'note', text: 'Validated out of sample: leave-one-out median error ' + DATA.validation.loo.median_ape_pct + '% (' + DATA.validation.loo.within_2x_pct + '% within 2x of the real market cap), walk-forward ' + DATA.validation.walk_forward.median_ape_pct + '% (' + DATA.validation.walk_forward.within_2x_pct + '% within 2x). A multiple is a central tendency, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(validationPanel());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
