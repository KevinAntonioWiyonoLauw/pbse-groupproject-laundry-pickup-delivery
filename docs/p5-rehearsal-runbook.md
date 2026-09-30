# P5 — Rehearsal Presentasi Sesi 7 (Runbook)

- **Tanggal**: 30 September 2026
- **Owner**: Semua anggota (dikoordinasi Client Owner)
- **Aplikasi**: `https://pbse-laundry.kevinio.my.id`
- **Backend**: `https://pbse.kevinio.my.id` (kontrak `1.3.0`)
- **Authorization server**: `https://keycloak-production-68f0.up.railway.app/realms/laundry`

> Dokumen ini adalah **skrip latihan**, bukan rencana. Tujuannya agar satu
> rehearsal penuh dijalankan di URL produksi — bukan localhost — sebelum
> presentasi, dan setiap butir demonstrasi §7 CONTEXT punya langkah dan hasil
> yang sudah diharapkan. Status item yang belum dijalankan ditandai `[ ]`.

---

## 1. Prasyarat sebelum rehearsal

| # | Prasyarat | Cara memeriksa |
|---|---|---|
| 1 | Service hidup dan kontrak `1.3.0` | `curl -i https://pbse.kevinio.my.id/health` → `200` |
| 2 | Provider hidup | `.../realms/laundry/.well-known/openid-configuration` → `200` |
| 3 | Origin produksi terdaftar di Keycloak dan CORS | preflight §8 todo; `verify-deployment.mjs` 25/25 |
| 4 | Aplikasi terbuka dari komputer lain | buka URL di §atas, login berhasil |
| 5 | Password akun uji tersedia | `KREDENSIAL-LAUNDRY.md` (di luar Git) |
| 6 | **Seed data demo** sudah dijalankan **setelah** deploy terakhir | lihat §2 |

> **Penting.** Database SQLite di Railway bersifat *ephemeral*: redeploy
> menghapusnya. **Seed SETELAH deploy terakhir**, dan jangan deploy lagi setelah
> seed — jika tidak, data demo hilang saat presentasi.

---

## 2. Seed data demo

Dua akun uji, role berbeda, dengan data siap pakai:

| Username | Role | Domain identity | Data yang harus ada sebelum demo |
|---|---|---|---|
| `staff-outlet-a` | staff | `outlet_a` | Minimal satu order `pending_pickup` (antrean W1) |
| `student-a` | customer | `cus_studentA` | Order miliknya sendiri; satu order `processing` untuk uji penolakan `409` |

### 2.1 Membuat order via aplikasi (manual, paling sederhana)

1. Login `student-a` di aplikasi produksi.
2. Buka `/orders/new`, isi `serviceType=wash_fold`, `weightKg=3`,
   `pickupAddress`, submit. → order `pending_pickup` dibuat.
3. Ulangi sekali lagi jika simbol demo butuh dua order customer.
4. Login `staff-outlet-a`, terima satu order (W1). → order menjadi `processing`
   dan `outletId=outlet_a`. Order inilah yang dipakai butir demonstrasi 2
   (penolakan `409`: `student-a` mencoba membatalkan order `processing`).

### 2.2 Membuat order via skrip (opsional, idempoten per run)

Gunakan `node:` dengan token asli dari provider — pola yang sama dengan
`auth/keycloak/e2e-proof.mjs`, tetapi diarahkan ke deployment produksi:

```bash
# Token harus diperoleh lewat PKCE (login nyata); jangan pernah menaruh token
# di URL, log, atau argumen command line yang terekam.
```

Karena `POST /v1/orders` memerlukan token customer asli, cara paling aman adalah
**2.1 lewat browser**. Skrip hanya dianjurkan bila token sudah dipegang di
memori secara aman.

---

## 3. Skrip demonstrasi (lima butir §7 CONTEXT)

Jalankan **berurutan** di satu sesi browser yang sama agar konteks tetap.

### Butir 1 — Satu workflow lengkap end-to-end (W1)

| Langkah | Aksi | Hasil yang diharapkan |
|---|---|---|
| 1 | Buka `https://pbse-laundry.kevinio.my.id` tanpa sign-in | Landing termuat; menu operasional mengarahkan ke sign-in, **bukan** layar kosong/error |
| 2 | Sign in sebagai `staff-outlet-a` | Berhasil; menu staff tampil (Order masuk, Pickups) |
| 3 | Buka `/orders?status=pending_pickup` | Skeleton dulu → lalu daftar order masuk; ada order `pending_pickup` hasil seed |
| 4 | Buka detail salah satu order | Skeleton → detail order |
| 5 | Tekan **Terima** | Status berubah menjadi `processing`, `outletId=outlet_a` |
| 6 | Reload halaman | Data masih `processing` (hasil bertahan) |

**Kalimat penyaji:** "Ini W1: staff menerima order masuk. Setiap layar memuat
skeleton lebih dulu, lalu datanya; hasilnya bertahan setelah reload."

### Butir 2 — Satu jalur penolakan (`409` dalam istilah domain)

| Langkah | Aksi | Hasil yang diharapkan |
|---|---|---|
| 1 | Sign in sebagai `student-a` | Berhasil |
| 2 | Buka order miliknya yang sudah `processing` (dari Butir 1) | Detail order `processing` |
| 3 | Tekan **Batalkan** | Ditolak `409` dengan pesan domain, mis. **"Order sudah diproses dan tidak dapat dibatalkan."** — **bukan** "Request failed with status code 409" |

**Kalimat penyaji:** "Penolakan dijelaskan dalam istilah domain, bukan kode
status mentah."

### Butir 3 — Satu write conflict (`412` sebagai kondisi normal)

| Langkah | Aksi | Hasil yang diharapkan |
|---|---|---|
| 1 | Window A: login `staff-outlet-a`, buka order `pending_pickup` | Detail order |
| 2 | Window B: login `staff-outlet-b` (incognito), buka order **yang sama** | Detail order |
| 3 | Window A: tekan **Terima** | `200`; order menjadi `processing` |
| 4 | Window B: tekan **Terima** | `412` ditangani bersih: pesan **"Order ini sudah ditangani rekan kerja"**, lalu **data terkini ditampilkan** — **bukan** banner error generik |

**Kalimat penyaji:** "Dua window menulis bersamaan; yang kedua menjelaskan
bahwa orang lain lebih dulu, lalu menampilkan data terkini."

### Butir 4 — Console attack A.9, live

| Langkah | Aksi | Hasil yang diharapkan |
|---|---|---|
| 1 | Sign in `student-a`, buka DevTools | — |
| 2 | Di console, kirim `POST /v1/orders/{id}/fulfilment` dengan header `Authorization` yang sama | Network tab → **`403`**; **tidak pernah `200`** |
| 3 | Ketik `/pickups` di address bar | Halaman termuat (file statis, membuktikan apa pun), tetapi Network tab menunjukkan API dijawab `403` dan layar menampilkan **refusal state**, bukan data |

Bukti lengkap keenam baris A.9 ada di `docs/p5-a9-evidence.md` beserta screenshot.

**Kalimat penyaji:** "Serangan dari console dijawab `403` oleh service, bukan
hanya disembunyikan oleh client."

### Butir 5 — Satu kalimat per anggota

| Anggota | Bagian yang dibangun | Satu keputusan teknis + alasan |
|---|---|---|
| Kevin (Service Owner) | CORS, conditional request, visibilitas staff | `If-Match` sengaja **opsional**: menjaga seluruh test P3/P4 tetap lulus, sementara client tetap selalu mengirimnya |
| Faris (Contract Owner) | Kontrak `1.3.0` + handoff | `invalid-params` ditambahkan **additive** di samping `invalidFields` agar client lama tetap berjalan |
| Tori (Integration Owner) | Test web, A.9, verifikasi deployment | Test `304` memakai jalur eksplisit, bukan `req.fresh`, karena `fetch()` menyuntikkan `no-cache` |
| Aya (Client Owner) | Aplikasi web | Token di `localStorage` dengan refresh terkoordinasi antar-tab: satu-satunya pilihan yang memenuhi uji terima tab-baru tanpa BFF |

---

## 4. Checklist tabel uji terima (§6.1) — dijalankan saat rehearsal

| # | Yang dilakukan | Hasil yang harus terjadi | [ ] |
|---|---|---|---|
| 1 | Buka URL tanpa sign-in | Diarahkan ke sign-in, bukan layar kosong/error | [ ] |
| 2 | Sign in role pertama, selesaikan satu workflow A.1 end-to-end | Skeleton dulu, lalu data; bertahan setelah reload | [ ] |
| 3 | Salin URL sebuah layar, buka di tab baru | Layar yang sama dengan data yang sama — bukan halaman awal | [ ] |
| 4 | Kosongkan satu field wajib pada form, submit | Pesan error **pada field itu**, dalam istilah domain | [ ] |
| 5 | Buka satu entitas di dua window, tekan aksi sama | Window kedua menjelaskan orang lain lebih dulu, lalu data terkini | [ ] |
| 6 | Console: kirim operasi tanpa hak | Service menjawab `403`/`404`; **tidak ada `200`** | [ ] |

## 5. Checklist empat view state (§6.2)

| State | Cara memicu | [ ] |
|---|---|---|
| Loading | Muat ulang layar list (throttle network di DevTools) | [ ] |
| Empty | Gunakan filter yang tidak menghasilkan baris | [ ] |
| Error | **DevTools offline mode** lalu muat ulang (cara terbersih) | [ ] |
| Content | Kondisi normal; perhatikan **penanda basi** + waktu ambil | [ ] |

---

## 6. Setelah rehearsal

- [ ] Catat link URL produksi yang dipakai dan commit hash `main` saat latihan.
- [ ] Perbaiki hambatan yang ditemukan, lalu ulangi rehearsal.
- [ ] Jalankan kembali **final gate §13** CONTEXT; tag `l5` **hanya** setelah semua
  lulus dan semua PR role merge ke `main`.
- [ ] Simpan bukti: URL, hasil test, bukti A.9, commit hash untuk `l5`.

---

## 7. Pitfall yang sudah diketahui (jangan terulang)

| # | Jebakan | Mitigasi |
|---|---|---|
| 1 | Preview Vercel ber-URL acak, tak terdaftar di CORS/Keycloak | **Selalu** pakai URL produksi `pbse-laundry.kevinio.my.id` |
| 2 | Access token berumur 300 detik; aksi lama bisa `401` | Reload halaman untuk memperbarui token, lalu ulangi (lihat catatan A.9 §Catatan) |
| 3 | DB Railway ephemeral | Seed setelah deploy terakhir; jangan deploy lagi |
| 4 | Mendaftarkan akun baru saat presentasi | Pakai `staff-outlet-a` dan `student-a` yang sudah siap |
