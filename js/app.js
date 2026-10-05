/* Antarmuka simulator: panggung animasi, kendali, grafik, tabel, dan ekspor CSV. */
(function(){
  "use strict";
  const { DT, DOSAT, N, DEFAULTS, SCENARIOS, simulate } = window.SimModel;

  // ---------- keadaan ----------
    let P = Object.assign({}, DEFAULTS);
  let R = simulate(P);
  let idx = 0, playing = false, timer = null;

  const $ = s => document.querySelector(s);
  const nf = (v, d) => v.toLocaleString('id-ID', {minimumFractionDigits:d, maximumFractionDigits:d});
  const jam = t => String(Math.floor(t)).padStart(2,'0') + '.' + String(Math.round((t%1)*60)).padStart(2,'0');

  // ---------- grafik ----------
  const W = 720, H = 150, M = {l:42, r:12, t:10, b:22};
  function buildChart(host, opts){
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox', '0 0 '+W+' '+H);
    svg.setAttribute('preserveAspectRatio','none');
    svg.style.height = H+'px';
    host.appendChild(svg);
    const tip = document.createElement('div');
    tip.className = 'tip'; host.appendChild(tip);
    return {svg:svg, tip:tip, opts:opts, host:host};
  }
  const X = t => M.l + (t/24)*(W - M.l - M.r);
  const Yof = (v, max) => M.t + (1 - v/max)*(H - M.t - M.b);

  function draw(c, data, max, color, fmt, band){
    const svg = c.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const ns = 'http://www.w3.org/2000/svg';
    const el = (n, a) => { const e = document.createElementNS(ns,n); for (const k in a) e.setAttribute(k, a[k]); return e; };

    if (band){
      svg.appendChild(el('rect',{x:M.l, y:Yof(band.to,max), width:W-M.l-M.r,
        height:Math.max(0, Yof(band.from,max)-Yof(band.to,max)), fill:'var(--danger)', 'fill-opacity':'0.10'}));
    }
    // kisi + sumbu
    for (let i = 0; i <= 4; i++){
      const v = max*i/4, y = Yof(v, max);
      svg.appendChild(el('line',{x1:M.l, y1:y, x2:W-M.r, y2:y, stroke:'var(--line)', 'stroke-width':1}));
      const tx = el('text',{x:M.l-7, y:y+4, 'text-anchor':'end', 'font-size':10,
        'font-family':'IBM Plex Mono, monospace', fill:'var(--ink-3)'});
      tx.textContent = fmt(v); svg.appendChild(tx);
    }
    for (let h = 0; h <= 24; h += 6){
      const x = X(h);
      svg.appendChild(el('line',{x1:x, y1:M.t, x2:x, y2:H-M.b, stroke:'var(--line)', 'stroke-width':1, 'stroke-dasharray':'2 4'}));
      const tx = el('text',{x:x, y:H-M.b+15, 'text-anchor':'middle', 'font-size':10,
        'font-family':'IBM Plex Mono, monospace', fill:'var(--ink-3)'});
      tx.textContent = String(h).padStart(2,'0')+'.00'; svg.appendChild(tx);
    }
    if (c.opts.guide != null){
      const y = Yof(c.opts.guide, max);
      svg.appendChild(el('line',{x1:M.l, y1:y, x2:W-M.r, y2:y, stroke:'var(--ink-3)', 'stroke-width':1.5, 'stroke-dasharray':'5 4'}));
    }
    // pita aerator menyala
    let run = null;
    data.forEach((d, i) => {
      if (d.aer && run === null) run = d.t;
      if ((!d.aer || i === data.length-1) && run !== null){
        svg.appendChild(el('rect',{x:X(run), y:H-M.b-5, width:Math.max(1.5, X(d.t)-X(run)), height:5,
          fill:'var(--sun)', 'fill-opacity':'0.75', rx:2}));
        run = null;
      }
    });
    // garis
    let dd = '';
    data.forEach((d, i) => { dd += (i ? ' L ' : 'M ') + X(d.t).toFixed(1) + ' ' + Yof(c.opts.pick(d), max).toFixed(1); });
    const area = dd + ' L ' + X(24) + ' ' + Yof(0,max) + ' L ' + X(0) + ' ' + Yof(0,max) + ' Z';
    svg.appendChild(el('path',{d:area, fill:color, 'fill-opacity':'0.10'}));
    svg.appendChild(el('path',{d:dd, fill:'none', stroke:color, 'stroke-width':2, 'stroke-linejoin':'round'}));
    // penanda waktu
    const cross = el('line',{x1:0, y1:M.t, x2:0, y2:H-M.b, stroke:'var(--ink-2)', 'stroke-width':1, opacity:'0.45'});
    cross.setAttribute('id','cross'); svg.appendChild(cross);
    const dot = el('circle',{r:4, fill:color, stroke:'var(--surface)', 'stroke-width':2});
    dot.setAttribute('id','dot'); svg.appendChild(dot);
    c.cross = cross; c.dot = dot; c.max = max;
  }

  const charts = {
    pv: buildChart($('#c-pv'), {pick:d => d.pv, unit:' kW', dec:2}),
    soc: buildChart($('#c-soc'), {pick:d => d.soc, unit:'%', dec:0, guide:20}),
    do: buildChart($('#c-do'), {pick:d => d.do, unit:' mg/L', dec:2})
  };

  function redrawCharts(){
    const max = Math.max(0.5, Math.ceil(R.pvMax*1.25*10)/10);
    draw(charts.pv, R.series, max, 'var(--sun)', v => nf(v,1));
    draw(charts.soc, R.series, 100, 'var(--batt)', v => nf(v,0));
    draw(charts.do, R.series, DOSAT, 'var(--oxy)', v => nf(v,1), {from:0, to:4});
    moveMarkers();
  }
  function moveMarkers(){
    const d = R.series[idx]; if (!d) return;
    for (const k in charts){
      const c = charts[k]; if (!c.cross) continue;
      const x = X(d.t);
      c.cross.setAttribute('x1', x); c.cross.setAttribute('x2', x);
      c.dot.setAttribute('cx', x); c.dot.setAttribute('cy', Yof(c.opts.pick(d), c.max));
    }
  }
  Object.keys(charts).forEach(k => {
    const c = charts[k];
    c.svg.addEventListener('mousemove', e => {
      const r = c.svg.getBoundingClientRect();
      const frac = (e.clientX - r.left)/r.width;
      const t = Math.min(24, Math.max(0, (frac*W - M.l)/(W-M.l-M.r)*24));
      setIndex(Math.min(N-1, Math.max(0, Math.round(t/DT))));
      const d = R.series[idx];
      c.tip.style.opacity = 1;
      c.tip.style.left = ((X(d.t)/W)*r.width) + 'px';
      c.tip.style.top = (c.svg.offsetTop + (Yof(c.opts.pick(d), c.max)/H)*r.height) + 'px';
      c.tip.textContent = jam(d.t) + ' · ' + nf(c.opts.pick(d), c.opts.dec) + c.opts.unit;
    });
    c.svg.addEventListener('mouseleave', () => { c.tip.style.opacity = 0; });
  });

  // ---------- panggung ----------
  const sky = $('#sky'), sunG = $('#sun'), moon = $('#moon'), wheel = $('#wheel'),
        bubbles = $('#bubbles'), battFill = $('#batt-fill'), battPct = $('#batt-pct'),
        fish = $('#fish'), wire = $('#wire');
  let spin = 0;

  function paintScene(){
    const d = R.series[idx]; if (!d) return;
    const t = d.t;
    const elev = t >= 6 && t <= 18 ? Math.sin(Math.PI*(t-6)/12) : 0;
    sky.setAttribute('fill', elev > 0.05 ? 'var(--sky-day)' : 'var(--sky-night)');
    sky.setAttribute('fill-opacity', String(0.35 + 0.65*Math.min(1, elev*1.6 + 0.2)));
    if (elev > 0){
      sunG.setAttribute('opacity','1'); moon.setAttribute('opacity','0');
      const x = 80 + (t-6)/12*800, y = 118 - elev*86;
      sunG.setAttribute('transform','translate('+x.toFixed(1)+','+y.toFixed(1)+')');
    } else {
      sunG.setAttribute('opacity','0'); moon.setAttribute('opacity','1');
    }
    const w = 60*(d.soc/100);
    battFill.setAttribute('width', Math.max(2, w).toFixed(1));
    battFill.setAttribute('fill', d.soc <= 20 ? 'var(--danger)' : 'var(--batt)');
    battPct.textContent = Math.round(d.soc) + '%';
    wire.setAttribute('opacity', d.aer ? '1' : '0.3');
    if (d.aer){ spin = (spin + 9) % 360; bubbles.setAttribute('opacity','0.8'); }
    else { bubbles.setAttribute('opacity','0'); }
    wheel.setAttribute('transform','translate(695,126) rotate('+spin+')');
    fish.setAttribute('fill', d.do < 3 ? 'var(--danger)' : d.do < 4.5 ? 'var(--sun)' : '#F0B44A');
    $('#r-pv').textContent = nf(d.pv,2) + ' kW';
    $('#r-soc').textContent = Math.round(d.soc) + '%';
    $('#r-do').textContent = nf(d.do,1) + ' mg/L';
    $('#r-aer').textContent = d.aer ? 'menyala' : 'mati';
    $('#r-aer').setAttribute('fill', d.aer ? 'var(--sun)' : 'var(--ink-3)');
    $('#clock').textContent = jam(t);
  }
  function setIndex(i){ idx = i; $('#scrub').value = i; paintScene(); moveMarkers(); }

  // ---------- ringkasan ----------
  function paintSummary(){
    $('#t-pv').textContent = nf(R.pvEnergy, 2);
    $('#t-aer').textContent = nf(R.aerHours, 1);
    $('#t-do').textContent = nf(R.doMin, 2);
    $('#t-do-u').textContent = 'mg/L · pukul ' + jam(R.doMinT);
    $('#t-soc').textContent = nf(R.socMin, 0);
    const pill = $('#t-status');
    const label = R.status === 'aman' ? 'Aman' : R.status === 'waspada' ? 'Waspada' : 'Kritis';
    pill.className = 'pill ' + (R.status === 'aman' ? 'ok' : R.status === 'waspada' ? 'warn' : 'crit');
    pill.innerHTML = '<span class="dot"></span>' + label;
    $('#t-fail').textContent = R.failHours > 0.05 ? nf(R.failHours,1) + ' jam tak terlayani' : 'kebutuhan terpenuhi';
    $('#cf-val').textContent = nf(R.capacityFactor, 1) + '%';
  }

  function run(){ R = simulate(P); redrawCharts(); paintSummary(); paintScene(); }

  // ---------- kendali ----------
  function bindRange(id, key, dec, after){
    const inp = $('#'+id), out = $('#'+id+'-v');
    inp.addEventListener('input', () => {
      P[key] = parseFloat(inp.value);
      out.textContent = nf(P[key], dec);
      if (after) after();
      run();
    });
  }
  bindRange('kwp','kwp',1); bindRange('batt','batteryKwh',1);
  bindRange('aer','aeratorKw',2); bindRange('thr','doThreshold',1);
  bindRange('ker','keramba',0);

  function bindSeg(id, key, after){
    $('#'+id).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      P[key] = b.dataset.v;
      [].forEach.call(b.parentNode.children, x => x.setAttribute('aria-pressed', String(x === b)));
      if (after) after();
      run();
    });
  }
  bindSeg('orient','orientation', () => {
    const ew = P.orientation === 'ew';
    $('#arr-single').setAttribute('opacity', ew ? '0' : '1');
    $('#arr-ew').setAttribute('opacity', ew ? '1' : '0');
    $('#lbl-array').textContent = ew ? 'PLTS terapung (timur–barat)' : 'PLTS terapung';
  });
  bindSeg('weather','weather');

  function syncControls(){
    $('#kwp').value = P.kwp; $('#kwp-v').textContent = nf(P.kwp,1);
    $('#batt').value = P.batteryKwh; $('#batt-v').textContent = nf(P.batteryKwh,1);
    $('#aer').value = P.aeratorKw; $('#aer-v').textContent = nf(P.aeratorKw,2);
    $('#thr').value = P.doThreshold; $('#thr-v').textContent = nf(P.doThreshold,1);
    $('#ker').value = P.keramba; $('#ker-v').textContent = nf(P.keramba,0);
    [].forEach.call($('#orient').children, b => b.setAttribute('aria-pressed', String(b.dataset.v === P.orientation)));
    [].forEach.call($('#weather').children, b => b.setAttribute('aria-pressed', String(b.dataset.v === P.weather)));
    const ew = P.orientation === 'ew';
    $('#arr-single').setAttribute('opacity', ew ? '0' : '1');
    $('#arr-ew').setAttribute('opacity', ew ? '1' : '0');
    $('#lbl-array').textContent = ew ? 'PLTS terapung (timur–barat)' : 'PLTS terapung';
  }

  $('#reset').addEventListener('click', () => { P = Object.assign({}, DEFAULTS); syncControls(); run(); });
  $('#scrub').addEventListener('input', e => setIndex(parseInt(e.target.value, 10)));

  $('#play').addEventListener('click', () => {
    playing = !playing;
    $('#play').textContent = playing ? 'Jeda' : 'Jalankan';
    if (timer) clearInterval(timer);
    if (playing) timer = setInterval(() => setIndex((idx + 1) % N), 70);
  });

  // ---------- skenario & tabel ----------
  const SCEN = SCENARIOS;
  let rows = [];
  try { rows = JSON.parse(localStorage.getItem('lkm3-rows') || '[]'); } catch(e){ rows = []; }

  function save(){ try { localStorage.setItem('lkm3-rows', JSON.stringify(rows)); } catch(e){} }
  function paintRows(){
    const tb = $('#rows');
    if (!rows.length){
      tb.innerHTML = '<tr><td colspan="8" class="empty">Belum ada data. Tekan salah satu tombol skenario, atau atur parameter lalu tekan “Catat hasil”.</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => {
      const cls = r.status === 'aman' ? 'ok' : r.status === 'waspada' ? 'warn' : 'crit';
      const label = r.status.charAt(0).toUpperCase() + r.status.slice(1);
      return '<tr><td>' + r.name + '</td>' +
        '<td class="num">' + nf(r.pv,2) + ' kWh</td>' +
        '<td class="num">' + nf(r.aer,1) + ' j</td>' +
        '<td class="num">' + nf(r.doMin,2) + '</td>' +
        '<td class="num">' + jam(r.doMinT) + '</td>' +
        '<td class="num">' + nf(r.soc,0) + '%</td>' +
        '<td class="num">' + nf(r.fail,1) + ' j</td>' +
        '<td><span class="pill ' + cls + '"><span class="dot"></span>' + label + '</span></td></tr>';
    }).join('');
  }
  function addRow(name){
    rows.push({name:name, pv:R.pvEnergy, aer:R.aerHours, doMin:R.doMin, doMinT:R.doMinT,
      soc:R.socMin, fail:R.failHours, status:R.status});
    save(); paintRows();
  }
  document.querySelectorAll('[data-sc]').forEach(b => {
    b.addEventListener('click', () => {
      P = Object.assign({}, DEFAULTS, SCEN[b.dataset.sc].p);
      syncControls(); run(); addRow(SCEN[b.dataset.sc].name);
    });
  });
  $('#record').addEventListener('click', () => {
    const nama = (P.orientation === 'ew' ? 'Timur–barat' : 'Satu arah') + ' · ' + nf(P.kwp,1) + ' kWp · ' +
      nf(P.batteryKwh,1) + ' kWh · ' + P.weather + ' · ' + nf(P.keramba,0) + ' petak';
    addRow(nama);
  });
  $('#clear').addEventListener('click', () => { rows = []; save(); paintRows(); });

  // ---------- unduh CSV ----------
  // Pemisah titik koma + koma desimal agar langsung rapi di Excel berbahasa Indonesia.
  function toCsv(header, lines){
    const esc = v => { const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; };
    return '\uFEFF' + [header].concat(lines).map(r => r.map(esc).join(';')).join('\r\n');
  }
  function download(name, text){
    const blob = new Blob([text], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  $('#csv-rows').addEventListener('click', () => {
    if (!rows.length) return;
    download('hasil-skenario.csv', toCsv(
      ['Skenario','Energi PLTS (kWh)','Aerator aktif (jam)','DO min (mg/L)','Jam DO min','SoC min (%)','Kebutuhan tak terlayani (jam)','Status'],
      rows.map(r => [r.name, nf(r.pv,2), nf(r.aer,1), nf(r.doMin,2), jam(r.doMinT), nf(r.soc,0), nf(r.fail,1), r.status])));
  });
  $('#csv-series').addEventListener('click', () => {
    download('data-24-jam.csv', toCsv(
      ['Jam','Daya PLTS (kW)','Isi baterai (%)','Oksigen terlarut (mg/L)','Aerator'],
      R.series.map(d => [jam(d.t), nf(d.pv,3), nf(d.soc,1), nf(d.do,2), d.aer ? 'menyala' : 'mati'])));
  });

  // ---------- mulai ----------
  syncControls();
  run();
  setIndex(30);
  paintRows();
})();
