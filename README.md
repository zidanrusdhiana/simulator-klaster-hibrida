# Simulator Klaster Energi Hibrida

Prototipe perangkat lunak untuk **LKM-3 MSTR Energi (Kelompok 8)**. Simulator ini memodelkan satu klaster kecil:
**PLTS terapung → baterai → aerator kincir air → keramba jaring apung**, selama 24 jam dengan langkah 10 menit.

Pengguna dapat mengatur kapasitas panel, orientasi panel (satu arah atau timur–barat), kapasitas baterai,
daya aerator, ambang oksigen, cuaca, dan jumlah keramba, lalu melihat:

- animasi potongan waduk (matahari, panel, isi baterai, kincir, gelembung oksigen, ikan),
- grafik daya PLTS, isi baterai, dan oksigen terlarut,
- ringkasan hasil dan status keamanan ikan,
- tabel hasil empat skenario uji, yang bisa diunduh sebagai CSV.

Seluruh perhitungan berjalan di peramban. Tidak ada server data, basis data, atau dependensi pihak ketiga.

---

## Struktur folder

```
simulator-klaster-hibrida/
├── index.html          halaman utama
├── css/style.css       tampilan (mendukung mode terang & gelap)
├── js/model.js         model simulasi (dipakai peramban & pengujian)
├── js/app.js           antarmuka: animasi, kendali, grafik, tabel, CSV
├── test/model.test.js  10 uji otomatis untuk model
├── server.js           server lokal kecil tanpa dependensi
└── package.json
```

---

## Cara menjalankan

**Cara 1 — paling cepat:** klik dua kali `index.html`. Halaman langsung terbuka di peramban.

**Cara 2 — lewat server lokal** (butuh [Node.js](https://nodejs.org) versi 18 ke atas):

```bash
npm start
```

Lalu buka <http://localhost:3000>. Port bisa diganti: `PORT=8080 npm start`.

**Menjalankan uji otomatis:**

```bash
npm test
```

Uji ini memeriksa, antara lain: panel tidak menghasilkan listrik pada malam hari, isi baterai selalu
di rentang 0–100%, orientasi timur–barat menurunkan energi harian 5–10%, faktor kapasitas mendekati PLTS
Terapung Cirata, dan keempat skenario menghasilkan kesimpulan yang diharapkan.

---

## Model dan asumsi

| Komponen | Rumus / asumsi |
|---|---|
| Daya panel | `P = kWp × bentuk(t) × faktor cuaca × 0,5` (0,5 = derating sistem & atmosfer); matahari 06.00–18.00 |
| Orientasi timur–barat | dua larik digeser ±0,55 rad; puncak lebih rendah, bahu pagi/sore lebih tinggi, energi harian ±7% lebih kecil |
| Baterai | `SoC(t+Δ) = SoC + (P_surplus − P_defisit)·Δ / E_baterai`, dibatasi 0–100%, batas pakai 20% (10% saat darurat) |
| Oksigen terlarut | `dDO/dt = fotosintesis(t) + k_alam·(DO_jenuh − DO) + k_aerator·(1 − DO/DO_jenuh) − respirasi`, DO jenuh 8,5 mg/L |
| Kendali | aerator menyala bila DO < ambang; daya diambil dari panel dulu, lalu baterai; bila keduanya tidak cukup dicatat “tak terlayani” |
| Waktu | langkah 10 menit, disimulasikan 2 hari, yang ditampilkan hari kedua |

**Validasi:** pada cuaca cerah, faktor kapasitas model ±15,9%, dekat dengan PLTS Terapung Cirata
(192 MWp, 245 GWh/tahun → ±14,6%).

**Batas model:** simulator menghitung perilaku sistem, bukan membuktikan konversi cahaya menjadi listrik.
Pembuktian fisik itu dilakukan lewat percobaan efek fotolistrik (PhET) pada LKM-2.

---

## Hasil empat skenario (parameter awal)

| Skenario | Energi PLTS | Aerator aktif | DO terendah | Status |
|---|---|---|---|---|
| 1 · Tanpa aerator | 7,64 kWh | 0 jam | 3,25 mg/L | Waspada |
| 2 · Aerator tanpa baterai | 7,64 kWh | 0,7 jam | 3,36 mg/L | Waspada |
| 3 · Sistem usulan | 7,64 kWh | 2,2 jam | 4,96 mg/L | Aman |
| 4 · Berawan & keramba padat | 4,20 kWh | 6,7 jam | 2,31 mg/L | Kritis |

---

Kelompok 8 · LKM-3 Praktik Rekayasa · MSTR Energi · FPMIPA UPI
