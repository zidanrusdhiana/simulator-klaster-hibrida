// Uji otomatis model simulasi. Jalankan: npm test  (atau: node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate, sunShape, DEFAULTS, SCENARIOS, N } = require('../js/model.js');

const run = (over = {}) => simulate({ ...DEFAULTS, ...over });
const scenario = (k) => run(SCENARIOS[k].p);

test('panel tidak menghasilkan listrik pada malam hari', () => {
  for (const t of [0, 3, 5.5, 18.5, 22]) {
    assert.equal(sunShape(t, 'single'), 0);
    assert.equal(sunShape(t, 'ew'), 0);
  }
});

test('simulasi menghasilkan 144 titik (langkah 10 menit selama 24 jam)', () => {
  assert.equal(run().series.length, N);
});

test('isi baterai selalu berada di antara 0 dan 100 persen', () => {
  for (const k of Object.keys(SCENARIOS)) {
    for (const s of scenario(k).series) assert.ok(s.soc >= 0 && s.soc <= 100);
  }
});

test('orientasi timur–barat: energi harian turun 5–10%, tetapi pagi & sore lebih tinggi', () => {
  const single = run({ orientation: 'single' });
  const ew = run({ orientation: 'ew' });
  const drop = 1 - ew.pvEnergy / single.pvEnergy;
  assert.ok(drop > 0.05 && drop < 0.10, `penurunan ${(drop * 100).toFixed(1)}%`);
  assert.ok(sunShape(7, 'ew') > sunShape(7, 'single'));
  assert.ok(sunShape(17, 'ew') > sunShape(17, 'single'));
  assert.ok(sunShape(12, 'ew') < sunShape(12, 'single'));
});

test('faktor kapasitas cuaca cerah mendekati PLTS Terapung Cirata (±14,6%)', () => {
  const cf = run().capacityFactor;
  assert.ok(cf > 12 && cf < 18, `CF ${cf.toFixed(1)}%`);
});

test('skenario 1 (tanpa aerator) tidak aman bagi ikan', () => {
  const r = scenario(1);
  assert.equal(r.aerHours, 0);
  assert.notEqual(r.status, 'aman');
});

test('skenario 2: tanpa baterai, aerator jauh lebih jarang menyala dibanding sistem usulan', () => {
  assert.ok(scenario(2).aerHours < scenario(3).aerHours);
});

test('skenario 3 (sistem usulan) menjaga oksigen tetap aman', () => {
  const r = scenario(3);
  assert.equal(r.status, 'aman');
  assert.ok(r.doMin >= 4.5);
  assert.ok(r.failHours < 0.01);
});

test('skenario 4 (berawan & keramba padat) memunculkan kendala', () => {
  const r = scenario(4);
  assert.equal(r.status, 'kritis');
  assert.ok(r.failHours > 0);
  assert.ok(r.socMin < 20);
});

test('perbaikan rancangan: baterai & panel lebih besar memulihkan skenario 4', () => {
  const r = run({ ...SCENARIOS[4].p, batteryKwh: 15, kwp: 4 });
  assert.ok(r.doMin > scenario(4).doMin);
});

test('kebutuhan tak terlayani hanya dihitung untuk 24 jam yang ditampilkan', () => {
  // Tanpa aerator, setiap langkah saat DO di bawah ambang adalah kebutuhan tak terlayani.
  const r = scenario(1);
  const jamDiBawahAmbang = r.series.filter((s) => s.do < DEFAULTS.doThreshold).length / 6;
  assert.ok(r.failHours <= 24);
  assert.ok(Math.abs(r.failHours - jamDiBawahAmbang) <= 1 / 6 + 1e-9, `${r.failHours} vs ${jamDiBawahAmbang}`);
});

test('tanpa baterai, isi baterai dilaporkan kosong (bukan nilai awal 60%)', () => {
  const r = scenario(2);
  assert.equal(r.hasBattery, false);
  assert.equal(r.socMin, null);
});
