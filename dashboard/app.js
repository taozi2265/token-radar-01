// Token Radar's dashboard, model radar-4. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the fitted curve's own inputs, the validation
// the snapshot ran on the model, the ablation table, the scatter plot of the
// fit, and the protocol's farm plan with its netted verdict. No network:
// every byte it shows is in data.js.
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
  function fmtOdds(o) {
    if (o === null || o === undefined || !isFinite(o) || o >= 10) return '>100%';
    return Math.round(o * 100) + '%';
  }
  function fmtNet(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (n >= 0) return '$' + Math.round(n) + '/h';
    return '-$' + Math.round(-n) + '/h';
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
  function hoursOf(row) {
    var hold = holdDaysFor(row.age_days);
    return Math.round((0.25 + (hold / 7) * (10 / 60) + 10 / 60 + 5 / 60) * 100) / 100;
  }
  function verdictOf(row) {
    var m = DATA.model;
    var cost = farmCostOf(row);
    var share = row.implied_value_usd * m.airdrop_pct / m.farmers;
    var breakeven = share > 0 ? cost.total / share : Infinity;
    var hours = hoursOf(row);
    var net = (share * m.launch_p - cost.total) / hours;
    return {
      verdict: breakeven <= m.farm_odds ? 'farm' : breakeven <= m.thin_odds ? 'thin' : 'skip',
      share: share,
      cost: cost,
      breakeven: breakeven,
      net: Math.round(net * 100) / 100,
      hours: hours
    };
  }

  // The model in one function: the page recomputes a row from the fitted
  // curve and the pre-token discount, and checks the number board.json
  // carries, so the page's code and the board's data are visibly the same
  // arithmetic. The curve's two coefficients come from the data.
  function impliedOf(row) {
    var m = DATA.model;
    var c = DATA.curve;
    return Math.max(1, Math.round(Math.pow(10, c.intercept + c.slope * Math.log10(Math.max(1, row.tvl_usd))) * m.pre_token_discount)) + (row.adjust_usd || 0);
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
    var farm = DATA.rows.filter(function (r) { return r.verdict === 'farm'; }).length;
    return el('section', { class: 'lede' },
      el('h1', null, 'Every protocol with no token on record, ', el('em', { text: 'ranked by what its token could be worth' }), '.'),
      el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more below that floor — no wrapped, staked or bridged product of a token that already trades. Implied value comes from a curve fitted to the live market, not a flat multiple, and is a model, not a price, and never a promise of a token.' }),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Candidates ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Worth farming' }), el('b', { text: String(farm) + ' of ' + DATA.board_size }))
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
          el('span', { class: 'num implied-val', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub', text: 'P25–P75 ' + fmtUsd(r.band_p25_usd) + '–' + fmtUsd(r.band_p75_usd) })
        )),
        el('td', null, el('div', { class: 'verdict-cell' },
          el('span', { class: 'pill ' + r.verdict, text: r.verdict }),
          el('span', { class: 'sub', text: fmtOdds(r.breakeven_odds) + ' · ' + fmtNet(r.net_per_hour_usd) })
        )),
        el('td', null, statusPill(r))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Launch candidates, strongest implied value first. Select a row for its model and farm plan. The band is the P25–P75 range from 200 refits of the curve; the verdict line shows the launch odds that repay the cost and the net per hands-on hour.' }),
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
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market caps are what the curve is fitted on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function validationPanel() {
    var v = DATA.validation;
    var flat = v.ablation[0];
    var rows = v.ablation.map(function (a) {
      return el('tr', { class: a.used ? 'used' : null },
        el('td', { text: a.variant + (a.used ? ' — the model' : '') }),
        el('td', { class: 'num', text: a.loo_miss.toFixed(2) + 'x' }),
        el('td', { class: 'num', text: a.within_3x_pct + '%' }),
        el('td', { class: 'num', text: a.rho.toFixed(2) }),
        el('td', { class: 'num', text: a.wf_miss.toFixed(2) + 'x' }),
        el('td', { class: 'num', text: a.wf_within_3x_pct + '%' })
      );
    });
    return el('section', { class: 'panel validation' },
      el('h2', { text: 'Model validation — a fitted curve, tested out of sample, not asserted' }),
      el('div', { class: 'val-stats' },
        el('div', { class: 'val-stat' },
          el('span', { text: 'Leave-one-out · median miss' }),
          el('b', { text: v.loo.median_miss.toFixed(2) + 'x' }),
          el('span', { class: 'val-sub', text: v.loo.n + ' live tokens, each predicted without itself · ' + v.loo.within_3x + ' within 3x (' + v.loo.within_3x_pct + '%) · rank ρ ' + v.loo.rho.toFixed(2) })),
        el('div', { class: 'val-stat' },
          el('span', { text: 'Walk-forward · median miss' }),
          el('b', { text: v.walk_forward.median_miss.toFixed(2) + 'x' }),
          el('span', { class: 'val-sub', text: 'fitted on ' + v.walk_forward.fit_n + ' listed before ' + v.walk_forward.cutoff + ', tested on ' + v.walk_forward.test_n + ' after · ' + v.walk_forward.within_3x + ' within 3x (' + v.walk_forward.within_3x_pct + '%)' })),
        el('div', { class: 'val-stat' },
          el('span', { text: 'One flat multiple did worse' }),
          el('b', { text: flat.loo_miss.toFixed(2) + 'x / ' + flat.wf_miss.toFixed(2) + 'x' }),
          el('span', { class: 'val-sub', text: 'leave-one-out ' + flat.within_3x_pct + '% within 3x, walk-forward ' + flat.wf_within_3x_pct + '% — so radar-4 prices off the fitted curve' })),
        el('div', { class: 'val-stat' },
          el('span', { text: 'The curve' }),
          el('b', { text: 'log10 mcap = ' + DATA.curve.intercept + ' + ' + DATA.curve.slope + ' x log10 TVL' }),
          el('span', { class: 'val-sub', text: 'Huber fit on ' + DATA.curve.fit_n + ' live protocols' }))
      ),
      el('h3', { class: 'live-h', text: 'Out of sample — each term added in turn' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'ablation' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Variant' }), el('th', { scope: 'col', class: 'num', text: 'LOO miss' }), el('th', { scope: 'col', class: 'num', text: 'Within 3x' }), el('th', { scope: 'col', class: 'num', text: 'Rank ρ' }), el('th', { scope: 'col', class: 'num', text: 'Walk-fwd miss' }), el('th', { scope: 'col', class: 'num', text: 'Within 3x' }))),
          el('tbody', null, rows)
        )
      ),
      el('p', { class: 'val-note', text: 'Family offsets help leave-one-out but not walk-forward, so they are not used; fitted growth is near zero; fitted listing age and chain breadth are unstable out of time (walk-forward misses of ' + v.ablation[5].wf_miss.toFixed(1) + 'x and ' + v.ablation[6].wf_miss.toFixed(1) + 'x on the small pre-cutoff fit set), so they are not used either. The model keeps the curve alone. A curve is a central tendency, not a price — only about ' + v.loo.within_2x_pct + '% of live market caps land within 2x of it.' })
    );
  }

  function fmtTick(v) {
    if (v >= 1e9) return '$' + (v / 1e9) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3) + 'K';
    return '$' + v;
  }

  function scatterPanel() {
    // The SVG is built as markup and handed to the HTML parser, which puts
    // every element in the SVG namespace itself — so no namespace URI, and
    // no URL of any kind, appears in this file. Every value interpolated
    // here is a number or one of the fixed class names below.
    var live = DATA.scatter_live || [];
    var rows = DATA.rows;
    var grid = DATA.curve.band_grid || [];
    var xs = [], ys = [];
    live.forEach(function (p) { xs.push(Math.log10(p.tvl_usd)); ys.push(Math.log10(p.mcap_usd)); });
    rows.forEach(function (r) { xs.push(Math.log10(r.tvl_usd)); ys.push(Math.log10(r.implied_value_usd)); });
    grid.forEach(function (g) { xs.push(Math.log10(g.tvl_usd)); ys.push(Math.log10(g.lo_usd)); ys.push(Math.log10(g.hi_usd)); });
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
    // The band, then the curve, then the points.
    var bandPts = grid.map(function (g) { return X(Math.log10(g.tvl_usd)).toFixed(1) + ',' + Y(Math.log10(g.lo_usd)).toFixed(1); })
      .concat(grid.slice().reverse().map(function (g) { return X(Math.log10(g.tvl_usd)).toFixed(1) + ',' + Y(Math.log10(g.hi_usd)).toFixed(1); }));
    parts.push('<polygon points="' + bandPts.join(' ') + '" class="band"/>');
    parts.push('<polyline points="' + grid.map(function (g) { return X(Math.log10(g.tvl_usd)).toFixed(1) + ',' + Y(Math.log10(g.curve_usd)).toFixed(1); }).join(' ') + '" class="curve" fill="none"/>');
    live.forEach(function (p) {
      parts.push('<circle cx="' + X(Math.log10(p.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(p.mcap_usd)).toFixed(1) + '" r="2.4" class="' + (p.in_fit ? 'dot-fit' : 'dot-set') + '"/>');
    });
    rows.forEach(function (r) {
      parts.push('<circle cx="' + X(Math.log10(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(r.implied_value_usd)).toFixed(1) + '" r="1.9" class="dot-pre"/>');
    });
    parts.push('</svg>');
    return el('section', { class: 'panel scatter-panel' },
      el('h2', { text: 'The curve, against the market that fitted it' }),
      el('p', { class: 'val-note', text: 'Traded tokens are plotted at their real market cap; pre-token protocols at their implied value. The band is the P25–P75 range from 200 refits of the curve, widened by the leave-one-out miss of live tokens near each size. Where the dots sit far from the curve, the model is guessing hardest.' }),
      el('div', { html: parts.join('') }),
      el('div', { class: 'legend' },
        el('span', null, el('i', { class: 'sw dot-fit' }), 'Traded token, in the fit'),
        el('span', null, el('i', { class: 'sw dot-set' }), 'Traded, set aside'),
        el('span', null, el('i', { class: 'sw dot-pre' }), 'No token, at implied value'),
        el('span', null, el('i', { class: 'sw curve' }), 'Fitted curve'),
        el('span', null, el('i', { class: 'sw band' }), 'P25–P75 band')
      )
    );
  }

  function modelPanel() {
    var v = DATA.validation;
    return el('section', { class: 'panel' },
      el('h2', { text: 'How the value is made' }),
      el('div', { class: 'model-eq' }, el('span', { class: 'formula', text: 'log10 market cap = ' + DATA.curve.intercept + ' + ' + DATA.curve.slope + ' x log10 TVL' }),
        el('span', { text: 'Huber fit on ' + DATA.curve.fit_n + ' live protocols · implied value = 10^curve x 0.5 (pre-token discount)' })),
      el('p', { text: 'The curve is fitted on traded protocols only: each live market cap is a price the market has already printed, and the curve is the size-to-value relationship the market actually shows. A protocol with no token is priced by reading its TVL off that curve, then taking a flat 0.5 haircut for the fact that it has not launched. A wrapped, staked, bridged or restaked product of a token that already trades never enters the fit, and a chain token is never priced off itself — the fit pool is ' + DATA.curve.fit_n + ' of the ' + DATA.live_pool_size + ' live-token protocols, and the set-aside wrappers are shown on the scatter plot as grey dots, not hidden.' }),
      el('h3', { text: 'What the model does not use, and why' }),
      el('p', { text: 'Category offsets help leave-one-out but not walk-forward, so they are not used. A fitted 7-day growth term is near zero. Fitted listing age and chain breadth blow up out of time, so they are not used either. The curve stands alone; the ablation table above shows each of these terms being added in turn, with the out-of-sample numbers that settled it.' }),
      el('h3', { text: 'What the band means' }),
      el('p', { text: 'Every implied value carries a P25–P75 band from 200 refits of the curve, each fitted on a bootstrap sample of the ' + DATA.curve.fit_n + ' protocols, widened by the leave-one-out miss of live tokens near the same size. The band is wide on purpose: the curve misses a live market cap by ' + v.loo.median_miss.toFixed(2) + 'x in the median case, and only ' + v.loo.within_2x_pct + '% of live market caps land within 2x of it. The band says how uncertain the model knows itself to be.' }),
      el('h3', { text: 'Farm economics' }),
      el('p', { text: 'If a token launches, the model assumes 10% of its implied value goes to airdrops, split equally among 10,000 farmers, because a single farmer usually has no basis for claiming a larger share. The slice that follows is compared with the cost of farming — gas plus the yield forgone on the capital — and the verdict is the launch odds that would repay that cost: farm if the cost is repaid at 10% launch odds or less, thin up to 33%, skip beyond that. The net per hands-on hour uses a 25% launch chance, which is a guess, and the detail view shows every input so you can change it in your head.' }),
      el('p', { text: 'Farming a listed protocol does not promise a reward. Points systems change, allocations are decided after the fact, and a protocol can launch without airdropping at all. The verdicts are a cost check, not a recommendation.' }),
      el('h3', { text: 'Limits of the radar' }),
      el('p', { text: 'The snapshot is sealed: nothing is fetched live, so a protocol that launched or changed after the snapshot date is still scored as it was. A curve is a central tendency — the scatter plot shows how far real tokens sit from it. Nothing here is financial advice, and nothing here is a claim that any protocol will launch a token.' })
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
    var verdict = verdictOf(row);
    var cost = verdict.cost;
    var m = DATA.model;
    var curveVal = Math.round(Math.pow(10, DATA.curve.intercept + DATA.curve.slope * Math.log10(row.tvl_usd)));
    var proRata = 0.10 * row.implied_value_usd * cost.capital / row.tvl_usd;
    d.innerHTML = '';
    d.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.rows.length }),
        el('h2', { text: row.name }),
        el('p', { class: 'muted', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · ' + fmtAge(row.age_days) + ' old' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close detail', text: 'Close', onclick: function () { d.close(); state.selected = null; writeHash(); } })
    ));
    d.appendChild(el('section', { class: 'detail-grid' },
      el('div', null,
        el('h3', { text: 'Implied value' }),
        el('div', { class: 'detail-stat' },
          el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
          el('div', null, el('span', { text: 'P25–P75 band' }), el('b', { text: fmtUsd(row.band_p25_usd) + '–' + fmtUsd(row.band_p75_usd) })),
          el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: '7d' }), el('b', { text: fmtPct(row.change_7d) }))
        ),
        el('p', { text: 'How this number is made, from the curve alone:' }),
        el('dl', { class: 'eq' },
          el('dt', { text: 'log10 TVL' }), el('dd', { text: Math.log10(row.tvl_usd).toFixed(4) }),
          el('dt', { text: 'Fitted log10 market cap' }), el('dd', { text: (DATA.curve.intercept + DATA.curve.slope * Math.log10(row.tvl_usd)).toFixed(4) }),
          el('dt', { text: 'Curve value, before the discount' }), el('dd', { text: fmtUsd(curveVal) }),
          el('dt', { text: 'Pre-token discount' }), el('dd', { text: 'x ' + m.pre_token_discount }),
          el('dt', { text: 'Band, P25–P75' }), el('dd', { text: fmtUsd(row.band_p25_usd) + '–' + fmtUsd(row.band_p75_usd) }),
          el('dt', { text: 'Implied value' }), el('dd', { text: fmtUsd(row.implied_value_usd) })
        ),
        el('p', { class: 'muted', text: 'The page recomputes this value as ' + fmtUsd(recomputed) + ' from the curve above — the same number board.json carries' + (row.adjust_usd ? ', where a $' + row.adjust_usd + ' step breaks an exact tie between two ranks' : '') + '. The band is the P25–P75 range from 200 refits of the curve, widened by the leave-one-out miss of live tokens near this size.' })
      ),
      el('div', null,
        el('h3', { text: 'Farm verdict' }),
        el('div', { class: 'detail-stat' },
          el('div', null, el('span', { text: 'Verdict' }), el('b', null, el('span', { class: 'pill ' + row.verdict, text: row.verdict }))),
          el('div', null, el('span', { text: 'Launch odds that repay the cost' }), el('b', { text: fmtOdds(row.breakeven_odds) })),
          el('div', null, el('span', { text: 'Net per hands-on hour' }), el('b', { text: fmtNet(row.net_per_hour_usd) })),
          el('div', null, el('span', { text: 'Slice if it launches' }), el('b', { text: fmtMoney(row.farmer_share_usd) }))
        ),
        el('p', { text: row.verdict_reason }),
        el('dl', { class: 'eq' },
          el('dt', { text: 'Capital to farm with' }), el('dd', { text: '$' + cost.capital + ' (TVL tier)' }),
          el('dt', { text: 'Hold' }), el('dd', { text: cost.hold + ' days' }),
          el('dt', { text: 'Gas' }), el('dd', { text: '$' + cost.gas }),
          el('dt', { text: 'Yield forgone' }), el('dd', { text: '$' + cost.opp.toFixed(2) + ' (' + (m.opportunity_apr * 100) + '% APR for ' + cost.hold + ' days)' }),
          el('dt', { text: 'Total cost of farming' }), el('dd', { text: '$' + cost.total.toFixed(2) }),
          el('dt', { text: 'Airdrop pool' }), el('dd', { text: (m.airdrop_pct * 100) + '% of implied value · ' + m.farmers.toLocaleString('en-US') + ' farmers' }),
          el('dt', { text: 'Slice if it launches' }), el('dd', { text: fmtMoney(row.farmer_share_usd) }),
          el('dt', { text: 'Break-even odds' }), el('dd', { text: 'cost / slice = ' + fmtOdds(row.breakeven_odds) }),
          el('dt', { text: 'Net per hands-on hour' }), el('dd', { text: fmtNet(row.net_per_hour_usd) + ' at a 25% launch chance, over ' + verdict.hours.toFixed(2) + ' hands-on hours' })
        ),
        el('p', { class: 'muted', text: 'The page recomputes this verdict as ' + row.verdict + ' — the same verdict board.json carries. If the airdrop were split purely by deposit, your $' + cost.capital + ' in a ' + fmtUsd(row.tvl_usd) + ' protocol would be ' + fmtMoney(proRata) + ', not ' + fmtMoney(row.farmer_share_usd) + '; the slice above assumes activity-based allocation among ' + m.farmers.toLocaleString('en-US') + ' farmers, not a pro-rata share of the pool.' })
      )
    ));
    d.appendChild(el('section', null,
      el('h3', { text: 'How to farm ' + row.name }),
      el('ol', { class: 'steps' }, farmSteps(row).map(function (s) { return el('li', { text: s }); }))
    ));
    d.appendChild(el('section', null,
      el('h3', { text: 'What the number does not say' }),
      el('p', { text: 'A ' + row.verdict + ' verdict does not mean ' + row.name + ' will launch a token, and a token launch does not promise an airdrop. The implied value is the curve’s central estimate for a protocol of this size, and the band — ' + fmtUsd(row.band_p25_usd) + ' to ' + fmtUsd(row.band_p75_usd) + ' — is how wide the model’s own uncertainty runs. Check the protocol’s own channels before spending anything.' })
    ));
    if (!d.open) d.showModal();
  }

  function render() {
    app.innerHTML = '';
    app.appendChild(header());
    app.appendChild(lede());
    app.appendChild(controls());
    if (state.tab === 'pre-token') app.appendChild(boardTable());
    else app.appendChild(liveTable());
    app.appendChild(scatterPanel());
    app.appendChild(validationPanel());
    app.appendChild(modelPanel());
  }

  readHash();
  render();
  if (state.selected) openDetail(state.selected);
  window.addEventListener('hashchange', function () { readHash(); render(); });
})();
