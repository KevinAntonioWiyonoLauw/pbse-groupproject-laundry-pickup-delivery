# P5 — Integration Owner Report

**Role**: Tori (Integration Owner)
**Branch**: `integration-owner`
**Tanggal**: 30 September 2026

---

## Ringkasan 

Seluruh 5 item checklist Integration Owner P5 selesai. Aplikasi web
ter-deploy di `https://pbse-laundry.kevinio.my.id` terverifikasi berperilaku
benar terhadap network dan identity: CORS, ETag/304, If-Match/412, dan
authorization tiga layer. Semua teruji langsung terhadap deployment
production, bukan hanya localhost atau mock.

---

## Status Checklist

| # | Item | Status | Bukti |
|---|---|---|---|
| 1 | Assertion database pada test 412 | ✅ Selesai | `tests/web/test-web-behaviour.js`; 3 assertion baru, 29/29 PASS |
| 2 | Perluas `verify-deployment.mjs` ke origin web ter-deploy | ✅ Selesai | 25/25 PASS terhadap `https://pbse-laundry.kevinio.my.id` |
| 3 | A.9 live test (enam skenario) + bukti | ✅ Selesai | `docs/p5-a9-evidence.md`; 6/6 skenario PASS |
| 4 | Verifikasi token/secret tidak bocor | ✅ Selesai | `docs/p5-test-*.txt`, scan manual bersih |
| 5 | Kumpulkan bukti pipeline | ✅ Selesai | Lihat bagian Pipeline di bawah |

---

## 1. Assertion Database pada Test 412

Ditambahkan ke `tests/web/test-web-behaviour.js`, pada skenario dua-window
(`If-Match` basi menghasilkan 412): order dibaca sebelum dan sesudah
percobaan write yang ditolak, dibandingkan byte-for-byte.

PASS 412 ditolak: status order tidak berubah; before=processing after=processing
PASS 412 ditolak: outletId order tidak berubah; before=outlet_a after=outlet_a
PASS 412 ditolak: representasi order identik byte-for-byte sebelum/sesudah

Total: 29 lulus, 0 gagal. Detail lengkap: `docs/p5-test-web-output.txt`.

---

## 2. Perluasan `verify-deployment.mjs`

`auth/keycloak/verify-deployment.mjs` diubah untuk menerima origin web
sebagai parameter ketiga (opsional, default `http://localhost:5173`):

```bash
node auth/keycloak/verify-deployment.mjs \
  https://pbse.kevinio.my.id \
  https://keycloak-production-68f0.up.railway.app \
  https://pbse-laundry.kevinio.my.id
```

Hasil akhir: `Deployment verification passed.`; 25/25 pemeriksaan lulus,
mencakup token claims, akses tanpa/dengan scope, CORS preflight, ETag,
conditional read (304), conditional write (412), dan visibilitas koleksi
staff.

Catatan proses: dua percobaan awal gagal; bukan karena konfigurasi
server, melainkan galat sintaks pada script (variabel `webOrigin` sempat
tertulis sebagai string literal `'webOrigin'`). Diperbaiki setelah
dikonfirmasi lewat perbandingan `curl` vs `fetch()` Node yang konsisten
berhasil, sementara script gagal; menunjukkan masalah ada di script, bukan
di server atau konfigurasi CORS.

---

## 3. A.9 — Live Test dari Console Browser

Enam skenario wajib dijalankan langsung terhadap aplikasi dan service
ter-deploy. Ringkasan:

| # | Skenario | Hasil |
|---|---|---|
| 1 | student-a → operasi staff (fulfilment) | 403 |
| 2 | student-a → dispatch pickup | 403 |
| 3 | student-a → buka `/pickups` di address bar | Refusal state + 403 (verifikasi manual) |
| 4 | staff-outlet-a → baca order outlet_b | 404 |
| 5 | student-a → baca order student-b | 404 |
| 6 | Request tanpa token | 401 + WWW-Authenticate |

6/6 lulus.

Detail lengkap, request/response penuh, dan screenshot: `docs/p5-a9-evidence.md`.

---

## 4. Verifikasi Token/Secret Tidak Bocor

Output dari tiga test suite (`test:web`, `test:weak-etag`, `test:shutdown`)
dipindai untuk pola JWT (`eyJ...`), header `Authorization: Bearer`, dan
password fixture dari `credentials.json`.

```bash
grep -riE "bearer|eyJ[A-Za-z0-9_-]{10,}" docs/p5-test-*.txt
grep -f <(cat auth/keycloak/.runtime/credentials.json | grep -oE '"[A-Za-z0-9_-]{20,}"' | tr -d '"') docs/p5-test-*.txt
```

Hasil: tidak ada kecocokan. Satu-satunya match pada scan pertama adalah
teks deskriptif test (`"tidak ada Allow-Credentials (Bearer, bukan
cookie)"`), bukan nilai token asli. Nilai yang tampak di output (ETag)
diverifikasi bukan token. ETag adalah string tunggal tanpa struktur
`header.payload.signature` yang menjadi ciri JWT.

---

## 5. Bukti Pipeline

Tiga test suite dijalankan dan outputnya disimpan:

```bash
pnpm --dir service run test:web        # 29 lulus, 0 gagal
pnpm --dir service run test:weak-etag  # 7 lulus, 0 gagal
pnpm --dir service run test:shutdown   # 12 lulus, 0 gagal
```

Output lengkap: `docs/p5-test-web-output.txt`, `docs/p5-test-weak-etag-output.txt`,
`docs/p5-test-shutdown-output.txt`.

### Status CI

CI merah sejak 27 September (run #58), berlanjut hingga run terbaru
(#70), termasuk seluruh commit P5 dari semua anggota.

Penyebab: step `test:shutdown` gagal secara konsisten di lingkungan CI
(Linux/Ubuntu GitHub Actions); `closeDatabase() lalu exit -> exit code 0`
mendapat `code=1`, meski lulus penuh (12/12) di lingkungan lokal (macOS).
CI berhenti pada step ini; step-step setelahnya (termasuk Redocly lint)
tidak sempat dijalankan.

Direkomendasikan: Service Owner menginvestigasi perbedaan perilaku
`closeDatabase()`/exit code antara macOS dan Linux; kemungkinan terkait
timing penutupan native SQLite handle yang disebutkan sebagai catatan
desain pada fungsi tersebut.

---

## Koordinasi Lintas Role

- **Kevin (Service Owner)**: mendaftarkan origin `pbse-laundry.kevinio.my.id`
  ke `CORS_ALLOWED_ORIGINS`, origin lama
  (`localhost:5173`, `pbse-laundry.vercel.app`) tetap dipertahankan.
- **Aya (Client Owner)**: aplikasi web ter-deploy di URL final
  `https://pbse-laundry.kevinio.my.id`.

---

## File yang Diubah/Ditambahkan Sesi Ini

tests/web/test-web-behaviour.js (modified; assertion 412)
auth/keycloak/verify-deployment.mjs (modified; parameter webOrigin)
docs/p5-a9-evidence.md (new)
docs/p5-integration-report.md (new; dokumen ini)
docs/p5-test-web-output.txt (new)
docs/p5-test-weak-etag-output.txt (new)
docs/p5-test-shutdown-output.txt (new)