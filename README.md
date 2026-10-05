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

## Cara program menghitung

Program membagi satu hari menjadi **144 langkah @10 menit**. Di setiap langkah, program menghitung empat hal
berurutan, lalu maju ke langkah berikutnya. Simulasi dijalankan 2 hari dan yang ditampilkan hari kedua, supaya
kondisi awal (baterai 60%, oksigen 5,5 mg/L) tidak memengaruhi hasil.

### 1. Daya panel

$$P = \text{kWp} \times \sin\left(\pi \cdot \frac{t-6}{12}\right) \times \text{faktor cuaca} \times 0{,}5$$

Angka 0,5 adalah faktor rugi sistem dan atmosfer.

**Contoh** (cuaca cerah, panel 2 kWp):

- pukul 12.00 → 2 × 1 × 1 × 0,5 = **1,00 kW**
- pukul 09.00 → 2 × 0,71 × 1 × 0,5 = **0,71 kW**
- malam hari → **0 kW**

### 2. Keputusan aerator (aturan kendali)

Aerator dibutuhkan jika oksigen **< 5 mg/L**. Sumber dayanya dipilih berurutan:

1. **Panel**, jika dayanya ≥ 0,75 kW;
2. kalau tidak, **baterai**, jika isinya > 20% (atau > 10% saat darurat, yaitu oksigen < 4 mg/L);
3. kalau keduanya tidak bisa → aerator mati dan langkah itu dicatat sebagai **tak terlayani**.

### 3. Isi baterai

$$\Delta SoC = \frac{(\text{daya masuk} - \text{daya keluar}) \times \tfrac{1}{6}\ \text{jam}}{\text{kapasitas baterai}} \times 100\%$$

**Contoh:** aerator 0,75 kW dari baterai 7,5 kWh selama 10 menit → 0,75 × ⅙ ÷ 7,5 × 100 = **−1,67% per langkah**.

### 4. Oksigen terlarut

Perubahan oksigen adalah penjumlahan empat proses:

| Proses | Rumus | Nilai contoh |
|---|---|---|
| Fotosintesis plankton (+) | `0,95 × sin(...) × cuaca` | 0 pada malam, 0,95 pada siang cerah |
| Penyerapan alami dari udara (+) | `0,07 × (8,5 − DO)` | DO 5 → +0,25 |
| Aerator (+), jika menyala | `2,2 × (1 − DO/8,5)` | DO 5 → +0,91 |
| Respirasi ikan & pembusukan (−) | `0,55 × (keramba/40)` | 40 petak → −0,55 |

Satuannya mg/L per jam; hasil penjumlahan dikali ⅙ jam untuk mendapatkan perubahan per langkah.

### Contoh satu langkah nyata (skenario 3, pukul 02.00)

Oksigen 4,96 mg/L → di bawah ambang 5 → aerator menyala dari baterai.

| Proses | Perhitungan | Hasil (mg/L/jam) |
|---|---|---|
| Fotosintesis | malam | 0 |
| Alami | 0,07 × (8,5 − 4,96) | +0,25 |
| Aerator | 2,2 × (1 − 4,96/8,5) | +0,92 |
| Respirasi | — | −0,55 |
| **Total** | | **+0,61** |

+0,61 mg/L/jam × ⅙ jam = **+0,10** → oksigen naik menjadi **5,06 mg/L**.

Pada langkah berikutnya oksigen sudah 5,06, di atas ambang, sehingga aerator mati. Perubahannya menjadi
0,24 − 0,55 = −0,31 mg/L/jam → turun 0,05 per langkah → 5,01 → 4,96 → aerator menyala lagi.

Jadi, aerator **berkedip**: nyala 10 menit, mati 20 menit, dan menahan oksigen di sekitar 5 mg/L sepanjang malam.
Inilah sebabnya total aerator aktif hanya 2,2 jam dan oksigen terendahnya 4,96 mg/L.

### Asal angka tiap kolom

| Kolom | Cara dihitung |
|---|---|
| Energi PLTS | jumlah (daya × ⅙ jam) dari 144 langkah |
| Aerator | jumlah langkah aerator menyala × 10 menit |
| DO min & jamnya | nilai oksigen terkecil dari 144 langkah |
| SoC min | isi baterai terkecil |
| Tak terlayani | jumlah langkah “aerator dibutuhkan tetapi tidak ada daya” × 10 menit |
| Status | DO min ≥ 4,5 → Aman; 3–4,5 → Waspada; < 3 → Kritis |

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
