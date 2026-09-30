# P5 — Bukti Final Gate Sebelum Tag `l5`

- **Tanggal**: 30 September 2026
- **Commit `main` yang diverifikasi**: `ee4a41b` (CI run #84 → **success**)
- **Aplikasi**: https://pbse-laundry.kevinio.my.id
- **Backend**: https://pbse.kevinio.my.id (kontrak `1.3.0`)
- **Provider**: https://keycloak-production-68f0.up.railway.app/realms/laundry

Dokumen ini memetakan **setiap item final gate §13 CONTEXT** ke bukti nyata.
Item yang memerlukan **tindakan browser manual** (login, klik) ditandai
`⚠ manual` dan **wajib dijalankan tim saat rehearsal** — tidak bisa diverifikasi
otomatis.

---

## A. Verifikasi otomatis (sudah dijalankan untuk dokumen ini)

| Uji | Command | Hasil |
|---|---|---|
| Service hidup | `curl -i .../health` | `200` |
| Provider hidup | discovery document | `200` |
| Aplikasi termuat | `curl .../pbse-laundry.kevinio.my.id` | `200` |
| Deep link `/orders`, `/orders/new`, `/pickups`, `/callback` | `curl` masing-masing | `200` semua |
| CORS origin produksi | `OPTIONS` + `Origin: https://pbse-laundry.kevinio.my.id` | `204` + ACAO + expose `ETag`/`X-Next-Cursor` + `Vary: Origin` |
| CORS origin asing | `OPTIONS` + `Origin: https://evil.example` | `204` **tanpa** ACAO (tidak di-reflect) |
| Tanpa token | `GET /v1/orders` | `401` + `WWW-Authenticate: invalid_token` |
| **End-to-end token asli** | `verify-deployment.mjs <api> <kc> <web-origin>` | **25/25 PASS** |
| **Redocly lint** | `npx @redocly/cli lint openapi.yaml` | valid, **0 error**, 2 warning |
| **CI** | GitHub Actions run #84 pada `ee4a41b` | **success** |
| Seluruh test service | `pnpm --dir service run test` | hijau (authz, contract, migration, persistence, concurrency, web 29, weak-etag 7, shutdown 8+1 skip, prepare 12) |
| Koleksi staff memuat order belum terikat | `verify-deployment.mjs` | PASS (staff sees an unbound order in the intake queue) |
| `304` polling | `verify-deployment.mjs` | PASS (unchanged read -> 304) |
| `412` write bersamaan | `verify-deployment.mjs` | PASS (stale validator -> 412) |
| `403`/`404` sesuai A.9 | `verify-deployment.mjs` | PASS (missing scope -> 403; other caller -> 404; absent/not-owned bodies identical) |

**Data demo yang sudah di-seed** (`tools/p5-seed-demo.mjs`, setelah deploy terakhir):

```text
student-a (customer): 3 order
   - pending_pickup: 2
   - processing: 1
staff-outlet-a (staff): 3 order (idem)
```

---

## B. Final gate §13 — status per item

### Aplikasi

| Item | Status | Bukti |
|---|---|---|
| Buka URL tanpa sign-in → sign-in, bukan layar kosong | ⚠ manual | jalankan saat rehearsal |
| Sign in role pertama, satu workflow end-to-end | ⚠ manual | W1 di runbook |
| Hasil tetap ada setelah reload | ⚠ manual | — |
| URL layar bisa disalin & dibuka di tab baru dengan data sama | ⚠ manual | uji terima baris 3 |
| Field wajib kosong → pesan pada field itu, istilah domain | ⚠ manual | uji terima baris 4 |
| Dua window aksi sama → penjelasan + data terkini | ⚠ manual | uji terima baris 5 |
| Keempat view state dapat ditunjukkan | ⚠ manual | §5 runbook |
| Tidak ada `fetch` di luar API layer | ✅ | grep: hanya `clients/web/src/lib/api.ts` |
| Base URL dari environment variable | ✅ | `NEXT_PUBLIC_API_BASE_URL` di README |

### Perilaku terhadap network dan identity

| Item | Status | Bukti |
|---|---|---|
| `401`, `403`, `404` ditangani berbeda | ✅ (API) / ⚠ manual (UI) | `verify-deployment.mjs` + A.9 |
| Session kedaluwarsa saat aplikasi terbuka ditangani | ⚠ manual | — |
| Sign-out bersihkan lokal + panggil provider | ⚠ manual | — |
| Polling data tak berubah → `304` | ✅ | `verify-deployment.mjs` (304) |
| `304` diperlakukan sebagai pembacaan berhasil | ✅ | `clients/web` + test web |
| Data basi dengan penanda umur | ⚠ manual | komponen `freshness.tsx` |
| Dua window menulis bersamaan → `412` normal | ✅ (API) / ⚠ manual (UI) | `verify-deployment.mjs` (412) |

### Service dan kontrak

| Item | Status | Bukti |
|---|---|---|
| CORS daftar eksplisit + `Vary: Origin` | ✅ | preflight otomatis |
| Preflight origin web OK; origin asing tidak di-reflect | ✅ | preflight otomatis |
| `ETag` dapat dibaca browser | ✅ | `Access-Control-Expose-Headers: ETag` |
| Koleksi staff memuat order belum terikat, bukan outlet lain | ✅ | `verify-deployment.mjs` + test-4 P4 |
| `openapi.yaml` `1.3.0` + lint lulus | ✅ | Redocly 0 error |
| `CHANGELOG.md` mencatat seluruh perubahan | ✅ | `CHANGELOG.md` v1.3.0 |
| Seluruh test P3/P4 tetap lulus | ✅ | `pnpm --dir service run test` |
| Service lokal dapat start | ✅ | — |

### Authorization server

| Item | Status | Bukti |
|---|---|---|
| `redirectUris`/`webOrigins` memuat origin produksi, tanpa wildcard | ✅ | `verify-deployment.mjs`, README |
| Client web dapat meminta scope customer & staff | ✅ | token claims PASS |
| Grant dibatasi role user (staff tanpa `orders:write`) | ✅ | `verify-deployment.mjs` |
| Verifikasi P4 tetap lulus | ✅ | `verify.mjs` |

### A.9 dan presentasi

| Item | Status | Bukti |
|---|---|---|
| Console attack → `403`/`404`, tidak pernah `200` | ✅ | `docs/p5-a9-evidence.md` (6/6) |
| Route role lain → refusal state, bukan data | ✅ | A.9 skenario 3 |
| Dua akun uji role berbeda punya data siap pakai | ✅ | seed: 2 pending + 1 processing |
| Satu rehearsal penuh di URL produksi | ⚠ **BELUM** | jalankan `docs/p5-rehearsal-runbook.md` |
| Setiap anggota punya commit yang dapat ditelusuri | ⚠ cek | lihat §C |

### Dokumentasi

| Item | Status | Bukti |
|---|---|---|
| Tabel A.1 di README, tiap baris operasi nyata | ✅ | `README.md` §Aplikasi Web |
| Catatan penyimpanan session di README | ✅ | `README.md` |
| URL aplikasi ter-deploy di README | ✅ | `https://pbse-laundry.kevinio.my.id` |
| Role dua akun uji di README | ✅ | `staff-outlet-a`, `student-a` |
| Daftar finding di README | ✅ | `README.md` §Temuan |
| ADR 0004 selesai | ✅ | `docs/decisions/0004-penyimpanan-sesi-web.md` |

---

## C. Kontribusi Git per anggota (untuk DoD #12)

```bash
git log l4..main --format="%an" | sort | uniq -c
```

Jalankan perintah di atas dan pastikan **setiap** anggota muncul minimal sekali.
Bila salah satu belum muncul, ia perlu satu commit di branch role-nya yang merge
ke `main` sebelum tag.

---

## D. Langkah terakhir (urutan pasti)

1. **Push** `integration-owner` (berisi `tools/` + runbook) → PR → merge ke `main`.
2. Tunggu CI hijau pada `main` setelah merge.
3. **Seed ulang** data demo (setelah deploy terakhir):
   ```bash
   node tools/p5-seed-demo.mjs https://pbse.kevinio.my.id \
     https://keycloak-production-68f0.up.railway.app \
     https://pbse-laundry.kevinio.my.id
   ```
4. Jalankan **rehearsal penuh** di `https://pbse-laundry.kevinio.my.id` mengikuti
   `docs/p5-rehearsal-runbook.md`; centang §B yang masih `⚠ manual`.
5. Pastikan `git branch -a --no-merged main` **kosong** dan tiap anggota muncul di
   `git log l4..main`.
6. **Tag** (hanya setelah semua di atas lulus):
   ```bash
   git checkout main && git pull origin main
   git tag l5
   git push origin l5
   ```
