// 曳行コース地図（全日程で共通の処理）
// 各日のページで places.js → schedule-○○.js → このファイルの順に読み込む
(function () {
  'use strict';

  const DAY = window.COURSE_DAY;
  if (!DAY) return;

  // 日程一覧。ページを増やすときはここに追加する
  const DAYS = [
    { id: 'shiken', href: 'shiken/', nav: '試験曳き 4日' },
    { id: '10', href: '10/', nav: '本曳き 10日' },
    { id: '11', href: '11/', nav: '本曳き 11日' }
  ];

  const TYPES = {
    yari: { label: 'やりまわし', cls: 'b-yari' },
    peko: { label: 'ペコまわし', cls: 'b-peko' },
    tome: { label: '止めまわし', cls: 'b-tome' },
    turn: { label: '', cls: 'b-plain' },
    u: { label: 'Uターン', cls: 'b-turn' },
    back: { label: 'バック', cls: 'b-turn' },
    backu: { label: 'バックUターン', cls: 'b-turn' },
    straight: { label: '直進', cls: 'b-plain' },
    dep: { label: '発', cls: 'b-plain' },
    arr: { label: '着', cls: 'b-plain' },
    event: { label: '', cls: 'b-ev' }
  };
  const STORE_KEY = 'ogaito30-course-data';
  const ENJI = '#6E1A26';
  const LABEL_ZOOM = 16;
  const MS_PER_MIN = 250; // 再生速度：予定の1分を0.25秒で進める（大きくするほどゆっくり）
  const FALLBACK_CENTER = [34.3984, 135.3644];

  // ================= 下ごしらえ =================
  const toMin = s => { const p = s.split(':'); return (+p[0]) * 60 + (+p[1]); };
  const pad = n => (n < 10 ? '0' : '') + n;
  const fmt = t => { const m = Math.floor(t + 1e-6); return Math.floor(m / 60) + ':' + pad(m % 60); };
  const r6 = x => Math.round(x * 1e6) / 1e6;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const BLOCKS = DAY.blocks.map((b, bi) => {
    const stops = [], items = [];
    let title = '';
    b.items.forEach(it => {
      if (typeof it === 'string') {
        if (!stops.length) title = it;
        else items.push({ ev: it, after: stops.length - 1 });
        return;
      }
      const s = { time: it[0] || '', t: it[0] ? toMin(it[0]) : null, place: it[1], type: it[2], dir: it[3] || '', pt: it[4] || it[1] };
      stops.push(s);
      items.push({ stop: s, idx: stops.length - 1 });
    });
    // 時刻のない行は、前後の時刻から均等に割り振る
    stops.forEach((s, i) => {
      if (s.t != null) return;
      let p = i - 1; while (p >= 0 && stops[p].time === '') p--;
      let n = i + 1; while (n < stops.length && stops[n].time === '') n++;
      s.t = stops[p].t + (stops[n].t - stops[p].t) * (i - p) / (n - p);
    });
    return {
      no: bi, sec: b.sec || '', rest: b.rest || '', title, items, stops,
      evs: items.filter(x => x.ev),
      start: stops[0].t, end: stops[stops.length - 1].t,
      from: stops[0].place, to: stops[stops.length - 1].place
    };
  });

  const PLACE_NAMES = [];
  BLOCKS.forEach(b => b.stops.forEach(s => { if (!PLACE_NAMES.includes(s.pt)) PLACE_NAMES.push(s.pt); }));
  // 「表示名・○○」の補助地点（例：脇道にバックで入る位置）。地図に印を付けない
  const isAux = s => s.pt.indexOf(s.place + '・') === 0;

  // ================= データ（座標・経路） =================
  let data = JSON.parse(JSON.stringify(window.COURSE_DATA || { places: {}, paths: {} }));
  let hasDraft = false;
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (d && d.places) { data = d; hasDraft = true; }
  } catch (e) { /* 保存領域が使えない環境 */ }
  data.places = data.places || {};
  data.paths = data.paths || {};

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); hasDraft = true; } catch (e) { /* 保存不可 */ }
  }

  const hasCoord = n => { const p = data.places[n]; return !!p && isFinite(p.lat) && isFinite(p.lng); };
  const ll = n => [data.places[n].lat, data.places[n].lng];
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  // a→b の経路。経由点は名前の小さい方→大きい方の向きで保存している
  function legCoords(a, b) {
    if (!hasCoord(a) || !hasCoord(b)) return null;
    if (a === b) return [ll(a), ll(a)];
    const p = data.paths[pairKey(a, b)];
    const via = p && p.via ? p.via.slice() : [];
    if (a > b) via.reverse();
    return [ll(a)].concat(via, [ll(b)]);
  }

  const dist = (p, q) => L.latLng(p).distanceTo(L.latLng(q));

  function buildLegs(b) {
    const legs = [];
    for (let i = 0; i < b.stops.length - 1; i++) {
      const s = b.stops[i], n = b.stops[i + 1];
      const coords = legCoords(s.pt, n.pt);
      const cum = [0];
      let len = 0;
      if (coords) for (let j = 1; j < coords.length; j++) { len += dist(coords[j - 1], coords[j]); cum.push(len); }
      legs.push({ t0: s.t, t1: n.t, coords, cum, len });
    }
    return legs;
  }

  function pointAt(leg, f) {
    const c = leg.coords;
    if (leg.len === 0) return { pt: c[0], seg: 1 };
    const target = Math.max(0, Math.min(1, f)) * leg.len;
    let j = 1;
    while (j < c.length - 1 && leg.cum[j] < target) j++;
    const segLen = leg.cum[j] - leg.cum[j - 1];
    const k = segLen ? (target - leg.cum[j - 1]) / segLen : 0;
    return { pt: [c[j - 1][0] + (c[j][0] - c[j - 1][0]) * k, c[j - 1][1] + (c[j][1] - c[j - 1][1]) * k], seg: j };
  }

  // ================= ページの骨組み =================
  const lastStop = BLOCKS[BLOCKS.length - 1].stops.slice(-1)[0];
  const navHtml = DAYS.map(d =>
    '<a href="../' + d.href + '"' + (d.id === DAY.id ? ' aria-current="page"' : '') + '>' + esc(d.nav) + '</a>'
  ).join('');

  document.body.classList.add('course-page');
  document.body.insertAdjacentHTML('afterbegin', `
<header class="top">
  <div class="top-row">
    <div class="top-title">
      <a class="top-org" href="../">小垣内参拾人組 曳行コース</a>
      <h1>${esc(DAY.title)}</h1>
    </div>
    <span class="top-date">令和八年${esc(DAY.dateLabel)} ${BLOCKS[0].stops[0].time}〜${lastStop.time}</span>
    <button class="edit-toggle" id="editToggle" type="button" hidden>コース編集</button>
  </div>
  <nav class="days" aria-label="日程">${navHtml}</nav>
</header>

<div class="layout">
  <div id="map" role="region" aria-label="曳行コースの地図"></div>

  <div class="panel">
    <div class="tabs" id="tabs" role="tablist" aria-label="時間帯"></div>

    <div class="view-panel">
      <div class="status" aria-live="polite">
        <div class="status-time" id="statusTime"></div>
        <div class="status-text" id="statusText"></div>
        <span class="status-live" id="statusLive" hidden>当日の予定上の位置（目安）</span>
        <button class="back-live" id="backLive" type="button" hidden>いまの予定位置に戻る</button>
      </div>

      <div class="player">
        <button class="play" id="play" type="button" aria-label="コースを再生"></button>
        <div class="scrub">
          <input type="range" id="scrub" step="0.05" aria-label="時刻">
          <div class="scrub-ends"><span id="scrubStart"></span><span id="scrubEnd"></span></div>
        </div>
      </div>

      <p class="missing" id="missing" hidden></p>

      <ol class="tt" id="timetable"></ol>

      <ul class="legend">
        <li><span class="badge b-yari">やりまわし</span></li>
        <li><span class="badge b-peko">ペコまわし</span></li>
        <li><span class="badge b-tome">止めまわし</span></li>
        <li><span class="sym sym-yari"></span>やりまわしのある地点</li>
        <li><span class="sym"></span>そのほかの地点</li>
      </ul>
      <p class="note">※曳行の都合により、コースおよび時間が前後する場合があります。地図上の位置は予定表から割り出した目安です。</p>

      <a class="ouen" href="https://osakana-design.github.io/ogaito30ningumi/">小垣内参拾人組を応援する<small>御花・オンライン寄附「オガファン」</small></a>
    </div>

    <div class="edit-panel">
      <h2>コース編集</h2>
      <ol class="edit-help">
        <li>地点を選び、地図をタップして配置します。配置したピンはドラッグで動かせます。</li>
        <li>区間の線をタップすると曲がり角が増えます。曲がり角をドラッグして道路に沿わせてください。曲がり角はダブルクリック（スマホは長押し）で消せます。</li>
        <li>まっすぐでよい区間は「直線でOK」を押します。</li>
        <li>地点と経路は全日程で共通です。作業内容はこのブラウザに自動保存されます。仕上がったら「書き出す」でコピーし、assets/places.js をまるごと置き換えてください。</li>
      </ol>

      <div class="armed" id="armed" hidden>
        <span>地図をタップして「<b id="armedName"></b>」を配置</span>
        <button type="button" id="armedCancel">やめる</button>
      </div>

      <h3>この日の地点<span id="placeCount"></span></h3>
      <ul class="plist" id="placeList"></ul>

      <h3>この時間帯の区間<span id="segCount"></span></h3>
      <ul class="slist" id="segList"></ul>

      <h3>データ</h3>
      <div class="edit-actions">
        <button class="mini mini-fill" type="button" id="exportBtn">書き出す（コピー）</button>
        <button class="mini" type="button" id="importBtn">貼り付けたデータを読み込む</button>
        <button class="mini" type="button" id="clearBtn">下書きを破棄</button>
      </div>
      <textarea id="dataBox" rows="6" spellcheck="false" aria-label="コースデータ"></textarea>
      <p class="edit-msg" id="editMsg"></p>
    </div>
  </div>
</div>`);

  // ================= 地図 =================
  const firstPt = PLACE_NAMES.find(hasCoord);
  const map = L.map('map', { minZoom: 13, maxZoom: 18 }).setView(firstPt ? ll(firstPt) : FALLBACK_CENTER, 16);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');

  const GSI_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
  const BASES = {
    '淡色地図': L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', { maxZoom: 18, attribution: GSI_ATTR, className: 'tiles-pale' }),
    '標準地図': L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', { maxZoom: 18, attribution: GSI_ATTR, className: 'tiles-std' }),
    '航空写真': L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', { maxZoom: 18, attribution: GSI_ATTR, className: 'tiles-photo' })
  };
  BASES['淡色地図'].addTo(map);
  L.control.layers(BASES, null, { position: 'topright', collapsed: false }).addTo(map);

  // 地図画像が読み込めない環境では、その旨を地図上に表示する
  let tileOk = 0, tileNg = 0, tileNotice = null;
  Object.values(BASES).forEach(tiles => {
    tiles.on('tileload', () => { tileOk++; if (tileNotice) { tileNotice.remove(); tileNotice = null; } });
    tiles.on('tileerror', () => {
      tileNg++;
      if (tileOk === 0 && tileNg >= 3 && !tileNotice) {
        tileNotice = L.control({ position: 'bottomleft' });
        tileNotice.onAdd = () => {
          const el = L.DomUtil.create('div', 'tile-notice');
          el.textContent = '背景の地図を読み込めません。ファイルをダウンロードしてブラウザで直接開くか、公開先のURLで表示してください。';
          return el;
        };
        tileNotice.addTo(map);
      }
    });
  });

  const mapEl = map.getContainer();
  const syncLabels = () => mapEl.classList.toggle('hide-labels', map.getZoom() < LABEL_ZOOM);
  map.on('zoomend', syncLabels);
  syncLabels();

  const viewLayer = L.layerGroup().addTo(map);
  const editLayer = L.layerGroup();

  const baseLine = L.polyline([], { color: ENJI, weight: 7, opacity: .3, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(viewLayer);
  const doneLine = L.polyline([], { color: ENJI, weight: 5, opacity: .95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(viewLayer);
  const stopLayer = L.layerGroup().addTo(viewLayer);
  const djMarker = L.marker(FALLBACK_CENTER, {
    icon: L.divIcon({ className: '', html: '<div class="dj"><div class="dj-dir"></div><div class="dj-body"></div></div>', iconSize: [34, 34], iconAnchor: [17, 17] }),
    interactive: false, keyboard: false, zIndexOffset: 1000
  });

  // ================= 画面の要素 =================
  const $ = id => document.getElementById(id);
  const tabsEl = $('tabs'), ttEl = $('timetable'), scrub = $('scrub'), playBtn = $('play');
  const statusTime = $('statusTime'), statusText = $('statusText'), statusLive = $('statusLive'), backLive = $('backLive');

  const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z"/></svg>';

  let cur = 0, legs = [], t = BLOCKS[0].start, rows = [];
  let playing = false, lastTs = 0, heading = null;
  let live = false, editing = false, armed = null;

  function badge(s) {
    const ty = TYPES[s.type] || TYPES.straight;
    let txt = ty.label;
    if (s.type === 'turn' || s.type === 'event') txt = s.dir;
    else if ((s.type === 'yari' || s.type === 'peko' || s.type === 'tome') && s.dir) txt = ty.label + '・' + s.dir;
    return txt ? '<span class="badge ' + ty.cls + '">' + esc(txt) + '</span>' : '';
  }

  function afterBlockText(b) {
    const nb = BLOCKS[b.no + 1];
    if (!nb) return 'この日の曳行はここまでです';
    return (b.rest ? esc(b.rest) + 'ののち ' : '次は ') + nb.stops[0].time + ' ' + esc(nb.from) + ' 発';
  }

  function renderTabs() {
    tabsEl.innerHTML = BLOCKS.map((b, i) =>
      '<button class="tab" role="tab" type="button" data-i="' + i + '" aria-selected="' + (i === cur) + '">' +
      '<b>' + b.stops[0].time + '</b><small>' + esc(b.sec) + '</small></button>'
    ).join('');
  }

  function renderTimetable() {
    const b = BLOCKS[cur];
    let html = b.title ? '<li class="tt-ev">『' + esc(b.title) + '』</li>' : '';
    b.items.forEach(it => {
      if (it.ev) { html += '<li class="tt-ev">『' + esc(it.ev) + '』</li>'; return; }
      const s = it.stop;
      html += '<li><button class="tt-row" type="button" data-i="' + it.idx + '">' +
        (s.time ? '<time>' + s.time + '</time>' : '<time class="is-est">—</time>') +
        '<span>' + esc(s.place) + '</span>' + badge(s) + '</button></li>';
    });
    const nb = BLOCKS[cur + 1];
    if (nb) html += '<li class="tt-rest">' + (b.rest ? '《 ' + esc(b.rest) + ' 》' : '') +
      '<small>次は ' + nb.stops[0].time + ' ' + esc(nb.from) + ' 発</small></li>';
    ttEl.innerHTML = html;
    rows = Array.from(ttEl.querySelectorAll('.tt-row'));
  }

  function renderStops() {
    stopLayer.clearLayers();
    const b = BLOCKS[cur];
    const yari = new Set(b.stops.filter(s => s.type === 'yari').map(s => s.pt));
    const seen = new Set();
    b.stops.forEach(s => {
      if (isAux(s) || seen.has(s.pt) || !hasCoord(s.pt)) return;
      seen.add(s.pt);
      const isY = yari.has(s.pt);
      L.circleMarker(ll(s.pt), {
        radius: 6, color: ENJI, weight: 2.5, fillColor: isY ? ENJI : '#fff', fillOpacity: 1, interactive: false
      }).bindTooltip(esc(s.place), {
        permanent: true, direction: 'top', offset: [0, -7], className: 'lbl' + (isY ? ' lbl-yari' : '')
      }).addTo(stopLayer);
    });
  }

  function renderMissing() {
    const miss = [...new Set(BLOCKS[cur].stops.map(s => s.pt))].filter(n => !hasCoord(n));
    const el = $('missing');
    el.hidden = miss.length === 0;
    if (miss.length) el.textContent = 'まだ地図に配置されていない地点があります：' + miss.join('、');
  }

  function blockBounds(b) {
    const pts = [];
    buildLegs(b).forEach(l => { if (l.coords) pts.push(...l.coords); });
    b.stops.forEach(s => { if (hasCoord(s.pt)) pts.push(ll(s.pt)); });
    return pts.length ? L.latLngBounds(pts) : null;
  }

  function fitBlock() {
    const bd = blockBounds(BLOCKS[cur]);
    if (!bd) return;
    if (bd.getNorthEast().equals(bd.getSouthWest())) map.setView(bd.getCenter(), 17);
    else map.fitBounds(bd, { padding: [36, 36], maxZoom: 18 });
  }

  function selectBlock(i, opts) {
    opts = opts || {};
    cur = i;
    renderTabs();
    if (editing) {
      renderEdit();
    } else {
      const b = BLOCKS[cur];
      legs = buildLegs(b);
      baseLine.setLatLngs(legs.filter(l => l.coords && l.len > 0).map(l => l.coords));
      renderStops();
      renderTimetable();
      renderMissing();
      scrub.min = b.start;
      scrub.max = b.end;
      $('scrubStart').textContent = b.stops[0].time;
      $('scrubEnd').textContent = b.stops[b.stops.length - 1].time;
      heading = null;
      t = opts.t != null ? opts.t : b.start;
      update();
    }
    if (!opts.noFit) fitBlock();
  }

  // ================= 時刻に応じた表示 =================
  function update() {
    const b = BLOCKS[cur];
    t = Math.max(b.start, Math.min(b.end, t));
    const done = [];
    let pos = null, seg = null, legForHeading = null;

    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      if (t >= l.t1 && i < legs.length - 1) { if (l.coords) done.push(l.coords); continue; }
      if (t >= l.t1) {
        if (l.coords) { done.push(l.coords); pos = l.coords[l.coords.length - 1]; }
        break;
      }
      if (l.coords) {
        const r = pointAt(l, (t - l.t0) / Math.max(1e-6, l.t1 - l.t0));
        done.push(l.coords.slice(0, r.seg).concat([r.pt]));
        pos = r.pt; seg = r.seg; legForHeading = l;
      }
      break;
    }
    doneLine.setLatLngs(done.filter(c => c.length > 1));

    if (pos) {
      djMarker.setLatLng(pos);
      if (!viewLayer.hasLayer(djMarker)) djMarker.addTo(viewLayer);
      if (legForHeading && legForHeading.len > 0) {
        const a = map.latLngToLayerPoint(legForHeading.coords[seg - 1]);
        const c = map.latLngToLayerPoint(legForHeading.coords[seg]);
        if (a.distanceTo(c) > 0.5) heading = Math.atan2(c.y - a.y, c.x - a.x) * 180 / Math.PI;
      }
      const dir = djMarker.getElement() && djMarker.getElement().querySelector('.dj-dir');
      if (dir) {
        dir.classList.toggle('is-none', heading == null);
        if (heading != null) dir.style.transform = 'rotate(' + (heading + 90) + 'deg)';
      }
      if (playing || live) {
        const inner = map.getBounds().pad(-0.15);
        if (!inner.contains(pos)) map.panTo(pos, { animate: true, duration: .4 });
      }
    } else if (viewLayer.hasLayer(djMarker)) {
      viewLayer.removeLayer(djMarker);
    }

    // 状況の文章
    statusTime.textContent = fmt(t);
    const last = b.stops[b.stops.length - 1];
    let html = '';
    const ev = b.evs.find(e => b.stops[e.after].t <= t + 1e-6 && t < b.stops[e.after + 1].t - 1e-6);
    if (ev) html += '<span class="status-ev">『' + esc(ev.ev) + '』</span>';
    else if (b.title && t < b.end - 1e-6) html += '<span class="status-ev">『' + esc(b.title) + '』</span>';
    if (t >= b.end - 1e-6) {
      html += '<b>' + esc(last.place) + '</b> ' + (last.type === 'arr' ? '着' : badge(last)) + '<br><span class="when">' + afterBlockText(b) + '</span>';
    } else {
      const at = b.stops.find(s => Math.abs(s.t - t) < 1e-6);
      const next = b.stops.find(s => s.t > t + 1e-6);
      const nextTime = s => (s.time ? s.time : '');
      html += at
        ? '<b>' + esc(at.place) + '</b> ' + badge(at) + (next ? '<br><span class="when">次は ' + esc(next.place) + (next.time ? '（' + next.time + '）' : '') + '</span>' : '')
        : '次は <b>' + esc(next.place) + '</b> ' + badge(next) + (next.time ? '<span class="when">' + nextTime(next) + '予定</span>' : '');
    }
    statusText.innerHTML = html;

    // 予定表の現在行
    let nextIdx = b.stops.findIndex(s => s.t >= t - 1e-6);
    if (nextIdx < 0) nextIdx = b.stops.length - 1;
    rows.forEach(r => {
      const i = +r.dataset.i;
      r.classList.toggle('is-past', i < nextIdx);
      r.classList.toggle('is-next', i === nextIdx);
    });

    scrub.value = t;
  }

  // ================= 再生 =================
  function setPlayIcon() {
    playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    playBtn.setAttribute('aria-label', playing ? '一時停止' : 'コースを再生');
  }

  function tick(ts) {
    if (!playing) return;
    if (lastTs) t += (ts - lastTs) / MS_PER_MIN;
    lastTs = ts;
    if (t >= BLOCKS[cur].end) { t = BLOCKS[cur].end; playing = false; setPlayIcon(); }
    update();
    if (playing) requestAnimationFrame(tick);
  }

  function startPlay() {
    if (t >= BLOCKS[cur].end - 1e-6) t = BLOCKS[cur].start;
    playing = true; lastTs = 0; setPlayIcon();
    requestAnimationFrame(tick);
  }

  function stopPlay() { playing = false; setPlayIcon(); }

  // ================= 当日の予定位置 =================
  function jstNow() {
    const s = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' });
    return { date: s.slice(0, 10), min: (+s.slice(11, 13)) * 60 + (+s.slice(14, 16)) + (+s.slice(17, 19)) / 60 };
  }

  function liveTarget() {
    const n = jstNow();
    if (n.date !== DAY.date) return null;
    for (let i = 0; i < BLOCKS.length; i++) {
      const b = BLOCKS[i];
      if (n.min < b.start) return i === 0 ? null : { i: i - 1, t: BLOCKS[i - 1].end }; // 休憩中
      if (n.min <= b.end) return { i, t: n.min };
    }
    return null;
  }

  function setLive(on) {
    live = on;
    statusLive.hidden = !on;
    backLive.hidden = on || !liveTarget();
  }

  function goLive(fit) {
    const lt = liveTarget();
    if (!lt) { setLive(false); return; }
    setLive(true);
    if (lt.i !== cur) selectBlock(lt.i, { t: lt.t, noFit: !fit });
    else { t = lt.t; update(); }
  }

  function userTookOver() { if (live) setLive(false); }

  // ================= 閲覧の操作 =================
  tabsEl.addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    stopPlay(); userTookOver();
    selectBlock(+btn.dataset.i);
  });

  scrub.addEventListener('input', () => { stopPlay(); userTookOver(); t = +scrub.value; update(); });

  playBtn.addEventListener('click', () => { userTookOver(); playing ? stopPlay() : startPlay(); });

  ttEl.addEventListener('click', e => {
    const row = e.target.closest('.tt-row');
    if (!row) return;
    stopPlay(); userTookOver();
    const s = BLOCKS[cur].stops[+row.dataset.i];
    t = s.t;
    update();
    if (hasCoord(s.pt)) map.panTo(ll(s.pt));
  });

  backLive.addEventListener('click', () => { stopPlay(); goLive(true); });

  setInterval(() => { if (live && !editing) goLive(false); }, 20000);

  // ================= 編集モード =================
  const PIN_ICON = L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
  const VIA_ICON = L.divIcon({ className: '', html: '<div class="via"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
  const editToggle = $('editToggle'), editMsg = $('editMsg'), dataBox = $('dataBox');

  const params = new URLSearchParams(location.search);
  const canEdit = params.has('edit') || location.hash === '#edit' || PLACE_NAMES.some(n => !hasCoord(n));
  editToggle.hidden = !canEdit;

  function blockPairs(b) {
    const out = [];
    for (let i = 0; i < b.stops.length - 1; i++) {
      const a = b.stops[i].pt, c = b.stops[i + 1].pt;
      if (a === c) continue;
      const k = pairKey(a, c);
      if (!out.includes(k)) out.push(k);
    }
    return out;
  }

  const pathDone = k => { const p = data.paths[k]; return !!(p && ((p.via && p.via.length) || p.ok)); };
  const ensurePath = k => data.paths[k] || (data.paths[k] = { via: [], ok: false });

  function insertVia(k, latlng) {
    const [a, c] = k.split('|');
    const coords = legCoords(a, c);
    const p = map.latLngToLayerPoint(latlng);
    let best = 0, bd = Infinity;
    for (let i = 0; i < coords.length - 1; i++) {
      const d = L.LineUtil.pointToSegmentDistance(p, map.latLngToLayerPoint(coords[i]), map.latLngToLayerPoint(coords[i + 1]));
      if (d < bd) { bd = d; best = i; }
    }
    ensurePath(k).via.splice(best, 0, [r6(latlng.lat), r6(latlng.lng)]);
    save();
    renderEdit();
  }

  function renderEdit() {
    editLayer.clearLayers();
    const b = BLOCKS[cur];
    const inBlock = new Set(b.stops.map(s => s.pt));

    blockPairs(b).forEach(k => {
      const [a, c] = k.split('|');
      const coords = legCoords(a, c);
      if (!coords) return;
      const ok = pathDone(k);
      const line = L.polyline(coords, {
        color: ok ? ENJI : '#8C7F81', weight: 5, opacity: .9, dashArray: ok ? null : '1 9',
        lineCap: 'round', interactive: false
      }).addTo(editLayer);
      const hit = L.polyline(coords, { weight: 24, opacity: 0, bubblingMouseEvents: false }).addTo(editLayer);
      hit.on('click', e => insertVia(k, e.latlng));

      const p = data.paths[k];
      if (p && p.via) p.via.forEach((v, idx) => {
        const m = L.marker(v, { icon: VIA_ICON, draggable: true, bubblingMouseEvents: false, zIndexOffset: 500 }).addTo(editLayer);
        m.on('drag', ev => {
          const g = ev.target.getLatLng();
          p.via[idx] = [r6(g.lat), r6(g.lng)];
          const nc = legCoords(a, c);
          line.setLatLngs(nc); hit.setLatLngs(nc);
        });
        m.on('dragend', save);
        const del = ev => {
          if (ev.originalEvent) L.DomEvent.stop(ev.originalEvent);
          p.via.splice(idx, 1);
          save();
          renderEdit();
        };
        m.on('dblclick', del);
        m.on('contextmenu', del);
      });
    });

    PLACE_NAMES.forEach(n => {
      if (!hasCoord(n)) return;
      const m = L.marker(ll(n), { icon: PIN_ICON, draggable: true, bubblingMouseEvents: false, zIndexOffset: 1000 }).addTo(editLayer);
      m.bindTooltip(esc(n), { permanent: true, direction: 'top', offset: [0, -10], className: 'lbl' + (inBlock.has(n) ? '' : ' lbl-dim') });
      m.on('dragend', ev => {
        const g = ev.target.getLatLng();
        data.places[n] = { lat: r6(g.lat), lng: r6(g.lng) };
        save();
        renderEdit();
      });
    });

    renderEditPanel();
  }

  function renderEditPanel() {
    const b = BLOCKS[cur];
    const inBlock = new Set(b.stops.map(s => s.pt));
    const placed = PLACE_NAMES.filter(hasCoord).length;
    $('placeCount').textContent = placed + ' / ' + PLACE_NAMES.length + ' 配置済み';

    $('placeList').innerHTML = PLACE_NAMES.map(n =>
      '<li><button type="button" data-place="' + esc(n) + '" class="' + (armed === n ? 'is-armed' : '') + '">' +
      '<span class="dot' + (hasCoord(n) ? ' is-on' : '') + '"></span>' + esc(n) +
      '<small>' + (hasCoord(n) ? '置き直す' : '未配置') + (inBlock.has(n) ? '' : '・他の時間帯') + '</small></button></li>'
    ).join('');

    const pairs = blockPairs(b);
    $('segCount').textContent = pairs.filter(pathDone).length + ' / ' + pairs.length + ' 調整済み';
    $('segList').innerHTML = pairs.map(k => {
      const [a, c] = k.split('|');
      const p = data.paths[k];
      const nVia = p && p.via ? p.via.length : 0;
      let state, action = '';
      if (!legCoords(a, c)) state = '<span class="seg-state">地点が未配置</span>';
      else if (nVia) { state = '<span class="seg-state">曲がり角 ' + nVia + '</span>'; action = '<button class="mini" type="button" data-reset="' + esc(k) + '">直線に戻す</button>'; }
      else if (p && p.ok) { state = '<span class="seg-state">直線</span>'; action = '<button class="mini" type="button" data-unok="' + esc(k) + '">取り消す</button>'; }
      else { state = '<span class="seg-state is-todo">未調整</span>'; action = '<button class="mini" type="button" data-ok="' + esc(k) + '">直線でOK</button>'; }
      return '<li><button class="seg-name" type="button" data-show="' + esc(k) + '">' + esc(a) + ' ⇄ ' + esc(c) + '</button>' + state + action + '</li>';
    }).join('');

    $('armed').hidden = !armed;
    $('armedName').textContent = armed || '';
    mapEl.classList.toggle('is-armed', !!armed);
  }

  $('placeList').addEventListener('click', e => {
    const btn = e.target.closest('[data-place]');
    if (!btn) return;
    armed = btn.dataset.place;
    if (hasCoord(armed)) map.panTo(ll(armed));
    renderEditPanel();
  });

  $('armedCancel').addEventListener('click', () => { armed = null; renderEditPanel(); });

  $('segList').addEventListener('click', e => {
    const el = e.target.closest('button');
    if (!el) return;
    const d = el.dataset;
    if (d.show) {
      const [a, c] = d.show.split('|');
      const coords = legCoords(a, c);
      if (coords) map.fitBounds(L.latLngBounds(coords), { padding: [60, 60], maxZoom: 18 });
      return;
    }
    if (d.ok) ensurePath(d.ok).ok = true;
    if (d.unok) ensurePath(d.unok).ok = false;
    if (d.reset) { const p = ensurePath(d.reset); p.via = []; p.ok = false; }
    save();
    renderEdit();
  });

  map.on('click', e => {
    if (!editing || !armed) return;
    const wasNew = !hasCoord(armed);
    data.places[armed] = { lat: r6(e.latlng.lat), lng: r6(e.latlng.lng) };
    armed = wasNew ? (PLACE_NAMES.find(n => !hasCoord(n)) || null) : null;
    save();
    renderEdit();
  });

  // 他の日程の地点も含めて、全データを places.js の形で書き出す
  function exportData() {
    const out = { places: {}, paths: {} };
    Object.keys(data.places).forEach(n => { if (hasCoord(n)) out.places[n] = data.places[n]; });
    Object.keys(data.paths).forEach(k => {
      const p = data.paths[k];
      if ((p.via && p.via.length) || p.ok) out.paths[k] = { via: p.via || [], ok: !!p.ok };
    });
    return '// 地点の座標と区間の経路（全日程で共通）\n// コース編集の「書き出す」でコピーした内容で、このファイルをまるごと置き換えてください。\n' +
      'window.COURSE_DATA = ' + JSON.stringify(out) + ';\n';
  }

  $('exportBtn').addEventListener('click', () => {
    const text = exportData();
    dataBox.value = text;
    dataBox.select();
    const done = () => { editMsg.textContent = 'コピーしました。assets/places.js の中身をまるごと置き換えてください。'; };
    const fail = () => { editMsg.textContent = '下の欄の内容をコピーしてください。'; };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fail);
    else fail();
  });

  $('importBtn').addEventListener('click', () => {
    try {
      const src = dataBox.value.replace(/^[\s\S]*?window\.COURSE_DATA\s*=\s*/, '').replace(/;\s*$/, '');
      const d = JSON.parse(src);
      if (!d || typeof d.places !== 'object') throw new Error('places');
      data = { places: d.places, paths: d.paths || {} };
      save();
      renderEdit();
      editMsg.textContent = '読み込みました。';
    } catch (err) {
      editMsg.textContent = '読み込めませんでした。「書き出す」で出力した内容をそのまま貼り付けてください。';
    }
  });

  $('clearBtn').addEventListener('click', () => {
    if (!confirm('このブラウザに保存した下書きを消して、places.js のデータに戻します。よろしいですか？')) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* 何もしない */ }
    location.reload();
  });

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('is-editing', on);
    editToggle.textContent = on ? '編集を終える' : 'コース編集';
    if (on) {
      stopPlay(); setLive(false);
      viewLayer.remove();
      editLayer.addTo(map);
      armed = PLACE_NAMES.find(n => !hasCoord(n)) || null;
      editMsg.textContent = hasDraft ? 'このブラウザに保存された下書きを表示しています。' : '';
      renderEdit();
    } else {
      armed = null;
      mapEl.classList.remove('is-armed');
      editLayer.remove();
      viewLayer.addTo(map);
      selectBlock(cur, { noFit: true });
    }
  }

  editToggle.addEventListener('click', () => setEditing(!editing));

  // ================= 開始 =================
  setPlayIcon();
  const lt = liveTarget();
  if (lt) { selectBlock(lt.i, { t: lt.t }); setLive(true); }
  else { selectBlock(0); setLive(false); }
})();
