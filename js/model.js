/*
 * Model simulasi Klaster Energi Hibrida (PLTS terapung + baterai + aerator keramba).
 *
 * File ini sengaja ditulis sebagai skrip biasa (bukan ES module) agar:
 *   - bisa dipakai di peramban, termasuk saat index.html dibuka langsung (file://), dan
 *   - bisa di-require() oleh Node.js untuk pengujian otomatis (test/model.test.js).
 */
(function (root) {
  'use strict';

  /** Langkah waktu: 10 menit (dalam jam). */
  const DT = 1 / 6;
  /** Jumlah langkah dalam 24 jam. */
  const N = 144;
  /** Kadar oksigen jenuh di air waduk (mg/L). */
  const DOSAT = 8.5;

  /**
   * Faktor bentuk radiasi pada permukaan panel (0..1).
   * Matahari dimodelkan terbit 06.00 dan terbenam 18.00.
   * Orientasi timur–barat = dua larik yang digeser ±0,55 rad terhadap lintasan matahari;
   * bagian lintasan yang jatuh di luar jam matahari hilang, sehingga energinya ±7% lebih rendah
   * tetapi kurvanya lebih lebar.
   */
  function sunShape(t, orientation) {
    if (t < 6 || t > 18) return 0;
    const h = (Math.PI * (t - 6)) / 12;
    const pos = (x) => Math.max(0, Math.sin(x));
    if (orientation === 'ew') return 0.5 * pos(h + 0.55) + 0.5 * pos(h - 0.55);
    return pos(h);
  }

  /** Faktor cuaca (deterministik agar hasil bisa diulang). */
  function weatherFactor(t, weather) {
    if (weather === 'berawan') return 0.55 + 0.18 * Math.sin(2.3 * t);
    if (weather === 'hujan') return 0.25 + 0.08 * Math.sin(1.7 * t);
    return 1;
  }

  /**
   * Jalankan simulasi.
   * @param {object} p parameter:
   *   kwp          kapasitas panel (kWp)
   *   orientation  'single' | 'ew'
   *   batteryKwh   kapasitas baterai (kWh), 0 = tanpa baterai
   *   aeratorKw    daya aerator (kW), 0 = tanpa aerator
   *   doThreshold  ambang penyalaan aerator (mg/L)
   *   weather      'cerah' | 'berawan' | 'hujan'
   *   keramba      jumlah petak keramba (beban oksigen)
   * Disimulasikan dua hari; yang dikembalikan hari kedua agar siklus sudah mantap.
   */
  function simulate(p) {
    const derate = 0.5;                 // derating sistem & atmosfer
    const load = p.keramba / 40;        // 40 petak = beban acuan
    const kAer = 2.2 * (p.aeratorKw / 0.75);
    const kNat = 0.07;                  // reaerasi alami (1/jam)
    const resp = 0.55 * load;           // konsumsi oksigen ikan + dekomposisi (mg/L/jam)
    const photoPeak = 0.95;             // produksi oksigen fotosintesis puncak (mg/L/jam)

    const hasBattery = p.batteryKwh > 0;
    let soc = 60;
    let doM = 5.5;
    const series = [];
    let pvEnergy = 0, aerHours = 0, curtailed = 0, failHours = 0;

    for (let day = 0; day < 2; day++) {
      const record = day === 1;          // hari pertama hanya pemanasan, tidak dihitung
      for (let i = 0; i < N; i++) {
        const t = i * DT;
        const w = Math.max(0, weatherFactor(t, p.weather));
        const pv = p.kwp * sunShape(t, p.orientation) * w * derate;

        const emergency = doM < 4;
        const want = doM < p.doThreshold || emergency;
        const floor = emergency ? 10 : 20;   // batas bawah isi baterai

        let aerOn = false, fromBatt = 0, toBatt = 0;
        if (want && p.aeratorKw > 0) {
          if (pv >= p.aeratorKw) {
            aerOn = true; toBatt = pv - p.aeratorKw;
          } else if (p.batteryKwh > 0 && soc > floor) {
            aerOn = true; fromBatt = p.aeratorKw - pv;
          } else {
            toBatt = pv;
          }
        } else {
          toBatt = pv;
        }
        if (record && !aerOn && want) failHours += DT;   // butuh aerasi tetapi tidak ada daya

        if (p.batteryKwh > 0) {
          const d = ((toBatt - fromBatt) * DT) / p.batteryKwh * 100;
          if (record && soc + d > 100) curtailed += ((soc + d - 100) / 100) * p.batteryKwh;
          soc = Math.min(100, Math.max(0, soc + d));
        } else if (record && toBatt > 0) {
          curtailed += toBatt * DT;
        }

        const photo = photoPeak * sunShape(t, 'single') * w;
        const dDo = photo + kNat * (DOSAT - doM) + (aerOn ? kAer * (1 - doM / DOSAT) : 0) - resp;
        doM = Math.max(0, Math.min(DOSAT, doM + dDo * DT));

        if (record) {
          pvEnergy += pv * DT;
          if (aerOn) aerHours += DT;
          series.push({ t, pv, soc: hasBattery ? soc : 0, do: doM, aer: aerOn });
        }
      }
    }

    let doMin = Infinity, doMinT = 0, socMin = hasBattery ? 100 : null, pvMax = 0;
    for (const s of series) {
      if (s.do < doMin) { doMin = s.do; doMinT = s.t; }
      if (hasBattery && s.soc < socMin) socMin = s.soc;
      if (s.pv > pvMax) pvMax = s.pv;
    }

    return {
      series, hasBattery, pvEnergy, aerHours, doMin, doMinT, socMin, pvMax, curtailed, failHours,
      status: doMin >= 4.5 ? 'aman' : doMin >= 3 ? 'waspada' : 'kritis',
      capacityFactor: p.kwp > 0 ? (pvEnergy / (p.kwp * 24)) * 100 : 0,
    };
  }

  const DEFAULTS = Object.freeze({
    kwp: 2, orientation: 'single', batteryKwh: 7.5, aeratorKw: 0.75,
    doThreshold: 5, weather: 'cerah', keramba: 40,
  });

  const SCENARIOS = Object.freeze({
    1: { name: '1 · Tanpa aerator', p: { aeratorKw: 0 } },
    2: { name: '2 · Aerator tanpa baterai', p: { aeratorKw: 0.75, batteryKwh: 0 } },
    3: { name: '3 · Sistem usulan', p: {} },
    4: { name: '4 · Berawan & keramba padat', p: { weather: 'berawan', keramba: 60 } },
  });

  const api = { DT, N, DOSAT, DEFAULTS, SCENARIOS, sunShape, weatherFactor, simulate };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SimModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
