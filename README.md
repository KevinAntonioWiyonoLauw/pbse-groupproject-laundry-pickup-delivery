<div align="center">

# 🧺 Laundry Pickup & Delivery
**Platform Pemesanan dan Penjemputan Laundry**

<p align="center">
  <a href="#-gambaran-umum">Gambaran Umum</a> •
  <a href="#-pembagian-peran">Kelompok</a> •
  <a href="#-domain--alur-kerja">Domain</a> •
  <a href="#-struktur-repositori">Struktur</a> •
  <a href="#-menjalankan-mock-server">Mock Server</a> •
  <a href="#-live-deployment-service-p3">Live Service</a> •
</p>

</div>

---

## 🏛️ Identitas Proyek

**Proyek Mata Kuliah PACS262520 - Platform Based Software Engineering Kelas KOM**
Program Studi Ilmu Komputer, Departemen Ilmu Komputer dan Elektronika, FMIPA UGM - Semester Gasal 2026/2027

### 👥 Kelompok

| Nama Anggota | NIM|
| :--- | :--- |
| Ayasha Rahmadinni (Aya)| 24/545462/PA/23178 |
| Farsya Nabila Tori (Tori)| 24/543855/PA/23113 |
| Kevin Antonio Wiyono Lauw (Kevin) | 24/535917/PA/22736 |
| Maulana Faris Al Ghifari (Faris)| 24/544029/PA/23119 |

---

## 📋 Gambaran Umum

Sistem ini memodelkan alur pemesanan laundry dengan penjemputan oleh
driver, dibangun sebagai proyek **contract-first**: seluruh antarmuka
(`openapi.yaml`) dirancang dan divalidasi terlebih dahulu sebelum satu
baris kode backend ditulis. Proyek ini membangun **satu service**, lalu
menempelkan client baru (web, mobile, device, MCP) tanpa pernah menulis
ulang service-nya.

---

## 🧩 Pembagian Peran

Peran berotasi setiap 3 pertemuan; seorang anggota tidak boleh memegang
peran yang sama dua periode berturut-turut.

| Peran | Tanggung Jawab | 
| :--- | :--- | 
| **Contract Owner** | Pemegang tanggung jawab atas `openapi.yaml`; setiap perubahan antarmuka ditinjau oleh peran ini |
| **Service Owner** | Backend yang di-deploy, konfigurasi, migrasi, health endpoint (mulai Pertemuan 3) | 
| **Client Owner** | Klien yang dihadapi pengguna; pelaporan tertulis atas ambiguitas dalam kontrak |
| **Integration Owner** | Mock server, contract test, koordinasi dengan kelompok mitra (Pertemuan 7) |

| Nama | Pertemuan 1–3 | Pertemuan 4–6 |
| :--- | :--- | :--- |
| Aya | Service Owner | Client Owner |
| Tori | Client Owner | Integration Owner |
| Kevin | Contract Owner | Service Owner |
| Faris | Integration Owner | Contract Owner |

Keputusan awal autentikasi tahap 1 dicatat di
[`docs/decisions/0003-autentikasi.md`](docs/decisions/0003-autentikasi.md).
Spesifikasi kontrak final, scope vocabulary, dan handoff tahap 4 didokumentasikan di
[`docs/p4-contract-handoff.md`](docs/p4-contract-handoff.md).
Setup authorization server lokal tahap 3 dan hasil verifikasinya tersedia di
[`docs/p4-authorization-server.md`](docs/p4-authorization-server.md).
Keycloak memakai tambahan `docker-compose.auth.yml`; Compose service laundry
tetap tersedia seperti sebelumnya. Integrasi middleware auth dikerjakan pada tahap berikutnya.

---

## 🗺️ Domain & Alur Kerja

Customer mengajukan order laundry dengan menentukan jenis layanan, berat
cucian, dan alamat pickup. Staf laundry meninjau order yang masuk dan
menandainya siap dijemput, lalu sistem mencari driver yang tersedia
hingga driver ditugaskan. Driver mengambil cucian dari alamat customer yang
sering kali bekerja di lokasi dengan sinyal tidak stabil, dan order
kemudian diproses hingga selesai dan diantarkan kembali ke customer.
Customer dapat membatalkan order selama belum ada driver yang ditugaskan.

### State Machine Order

```
pending_pickup -> ready_for_pickup -> confirmed -> assigned -> picked_up -> processing -> completed
      |                  |              |
      v                  v              v
  cancelled          cancelled      cancelled
```

### Tiga Aktor Utama

| Aktor | Hak Akses Utama |
| :--- | :--- |
| **Customer** | Buat order, lihat order sendiri, batalkan sebelum `assigned` |
| **Staff Laundry** | Lihat semua order, tandai siap dijemput, kelola pencarian driver |
| **Driver** | Lihat & update status pickup miliknya sendiri |

📄 Dokumentasi lengkap:
[`docs/domain.md`](docs/domain.md) ·
[`docs/client-taxonomy.md`](docs/client-taxonomy.md) ·
[`docs/business-rules.md`](docs/business-rules.md)

---

## 📂 Struktur Repositori

```text
laundry-pickup-delivery/
├── openapi.yaml              # 📄 Kontrak API 
├── CHANGELOG.md               # Catatan perubahan kontrak
├── docs/
│   ├── domain.md               # Deskripsi domain & pemeriksaan 4 syarat
│   ├── client-taxonomy.md      # Taksonomi client (5 sumbu)
│   ├── resource-modeling.md    # Pemodelan kandidat resource Bagian B
│   ├── business-rules.md       # Dekomposisi aturan bisnis
│   └── decisions/
│       └── 0001-domain.md      # ADR pemilihan domain
├── auth/keycloak/             # Authorization server (P4)
├── service/                   # Backend (P3, auth P4, CORS & conditional request P5)
├── clients/
│   ├── web/                    # Dashboard admin (P5)
│   ├── mobile/                 # App customer & driver (P6)
│   ├── device/                 # Scanner loket (P11)
│   └── mcp/                    # Assistant agent (P12)
└── tests/
    ├── contract/                # Pengujian kesesuaian service vs openapi.yaml
    ├── authz/                   # Empat negative test otorisasi (P4)
    └── web/                     # CORS, visibilitas staff, conditional request (P5)
```

---

## 🌐 Perilaku Service untuk Client Browser (P5)

Tiga hal yang dibutuhkan browser client dan tidak ada sebelum P5:

| Kebutuhan | Perilaku |
|---|---|
| **CORS** | Origin diizinkan dibaca dari `CORS_ALLOWED_ORIGINS` (daftar eksplisit, dipisah koma). Origin yang tidak terdaftar tidak pernah di-reflect. `Vary: Origin` selalu dikirim. Preflight `OPTIONS` dijawab `204` sebelum authentication, karena preflight tidak membawa `Authorization`. |
| **Conditional read** | `GET` pada entitas dan koleksi mengembalikan `ETag` strong. Kirim kembali sebagai `If-None-Match`; bila tidak ada perubahan jawabannya `304` tanpa body. |
| **Conditional write** | Kirim `If-Match` berisi ETag yang terakhir dilihat. Bila entitas sudah berubah, jawabannya `412` dengan problem type `precondition-failed` — bukan `200` yang menimpa perubahan orang lain. |

`If-Match` bersifat opsional dan tetap dihormati bila dikirim, sehingga client
yang ditulis terhadap kontrak `1.2.0` tidak perlu berubah.

`ETag` dan `X-Next-Cursor` adalah custom header, jadi keduanya harus ada di
`Access-Control-Expose-Headers` agar dapat dibaca browser. `If-Match` dan
`If-None-Match` juga harus ada di `Access-Control-Allow-Headers` karena
keduanya memicu preflight.

### Visibilitas koleksi

| Principal | `GET /v1/orders` mengembalikan |
|---|---|
| Customer | Hanya order dengan `customerId` miliknya |
| Staff | Order yang terikat outletnya **dan** order yang belum terikat outlet mana pun (antrean masuk) |

Order yang terikat outlet lain tidak dikembalikan, dan membaca order itu
langsung lewat identifier menghasilkan `404` yang identik dengan order yang
tidak ada.

---

## 🔑 Menjalankan Authorization Server (P4)

Prasyarat: Docker Desktop aktif dan Node.js >= 20.

```bash
node auth/keycloak/prepare.mjs
docker compose --env-file auth/keycloak/.runtime/.env -f docker-compose.auth.yml up -d
node auth/keycloak/verify.mjs
```

`prepare.mjs` membuat password admin dan password enam user uji secara acak,
lalu menyimpannya **hanya** di `auth/keycloak/.runtime/credentials.json`
(gitignored, permission `0600`). Tidak ada credential pada public client atau
output perintah. Jangan tempel isinya ke chat, commit, screenshot, atau log.

> **`prepare.mjs` aman dijalankan berulang kali.** Ia menulis dua file dengan
> kebutuhan yang berlawanan: **template realm di-regenerate setiap kali**
> (supaya perubahan skrip benar-benar sampai ke provider), sedangkan
> **password dipertahankan** (supaya akun tidak mati). Keduanya pernah salah
> dan keduanya senyap gejalanya, jadi keduanya dikunci oleh
> `tests/authz/test-prepare-idempotent.js`.

### Memperbaiki realm yang sudah ada

`import.mjs` bersifat idempotent: ia membuat client scope yang hilang,
merekonsiliasi protocol mapper, **mendeklarasikan attribute identitas pada user
profile**, memastikan atribut user, dan **membaca ulang untuk memverifikasi**
atribut itu benar-benar tersimpan.

```bash
node auth/keycloak/import.mjs http://localhost:8081
node auth/keycloak/import.mjs https://<keycloak-host> \
  # origin web app yang di-deploy, additive terhadap origin lokal:
  WEB_ORIGINS=https://<web-app-host>
```

Admin credential diambil dari environment (`KC_ADMIN_PASSWORD`) bila ada, jika
tidak dari `.runtime/credentials.json`.

> **Kenapa langkah deklarasi attribute penting.** Keycloak 24+ memvalidasi user
> terhadap *declarative user profile*. Attribute yang tidak dideklarasikan di
> sana **dibuang tanpa error**: admin API menjawab `204 No Content` dan nilainya
> tidak pernah muncul pada user. Akibatnya `principal.js` jatuh ke fallback
> `sub`, setiap perbandingan kepemilikan menjadi UUID Keycloak melawan
> identifier domain, dan **setiap object dijawab `404`**. Gejalanya mudah
> disalahartikan sebagai bug client. Karena itu `import.mjs` sekarang
> mendeklarasikan attribute lebih dulu, lalu memverifikasi dengan membaca ulang
> — bukan sekadar mengirim `PUT` dan menganggapnya berhasil.

---

## 🖥️ Menjalankan Mock Server

```bash
pnpm --package=@stoplight/prism-cli dlx prism mock openapi.yaml -p 4010
```

### Contoh Perintah `curl`

```bash
# 1. GET collection
curl -i http://127.0.0.1:4010/orders

# 2. GET dengan filter
curl -i "http://127.0.0.1:4010/orders?status=pending_pickup"

# 3. POST dengan Idempotency-Key
curl -i -X POST http://127.0.0.1:4010/orders \
  -H 'Idempotency-Key: <uuid-v4>' \
  -H 'Content-Type: application/json' \
  -d '{ ... }'
```

### Validasi Kontrak

```bash
npx @redocly/cli lint openapi.yaml
```

---

## 🚀 Live Deployment

Backend service aktif dan dapat diakses publik:

- **Base URL:** `https://pbse.kevinio.my.id`
- **Health Check:** `https://pbse.kevinio.my.id/health`
- **Base API Path:** `https://pbse.kevinio.my.id/v1`
- **Authorization Server:** `https://keycloak-production-68f0.up.railway.app/realms/laundry`
- **Audience:** `laundry-api`
- **Kontrak:** `1.3.0`

Endpoint protected menjawab `401` tanpa token. `CORS_ALLOWED_ORIGINS` harus
diisi pada environment Railway; origin yang tidak terdaftar tidak akan pernah
menerima `Access-Control-Allow-Origin`. Verifikasi menyeluruh, termasuk
penerimaan token asli, dijalankan dengan:

```bash
node auth/keycloak/verify-deployment.mjs \
  https://pbse.kevinio.my.id \
  https://keycloak-production-68f0.up.railway.app
```

Dokumentasi terkait:

- **Bukti Uji & Hasil Curl (Service Owner):** [`service/EVIDENCE.md`](service/EVIDENCE.md)
- **Laporan Integrasi (Integration Owner):** [`docs/p3-integration-report.md`](docs/p3-integration-report.md)
- **Review Klien (Client Owner):** [`docs/p3-client-review.md`](docs/p3-client-review.md)
- **Authorization server & handoff:** [`docs/p4-authorization-server.md`](docs/p4-authorization-server.md) · [`docs/p4-contract-handoff.md`](docs/p4-contract-handoff.md)

---

## 🧭 Aplikasi Web (P5)

### Tabel workflow

Setiap workflow adalah sesuatu yang **diselesaikan seseorang**, bukan daftar
layar. Setiap baris menyebut operasi yang benar-benar ada di `openapi.yaml`.

| Workflow | Screen | Role permitted | Operation in `openapi.yaml` | Call/screen |
|---|---|---|---|---|
| **W1 — Staff menerima order masuk** | Daftar order masuk `/orders?status=pending_pickup` | staff | `GET /v1/orders?status=pending_pickup` | 1 |
| | Detail order `/orders/{orderId}` | staff | `GET /v1/orders/{orderId}` | 1 |
| | Aksi Terima | staff | `POST /v1/orders/{orderId}/fulfilment` | 1 |
| **W2 — Staff menugaskan driver** | Panel penugasan `/orders/{orderId}/assign` | staff | `GET /v1/orders/{orderId}` + `POST /v1/pickups` | 2 |
| **W3 — Staff memantau pickup** | Daftar pickup `/pickups` (polled) | staff | `GET /v1/pickups` | 1 |
| **W4 — Customer membuat order** | Form order baru `/orders/new` | customer | `POST /v1/orders` | 1 |
| | Order saya `/orders` | customer | `GET /v1/orders` | 1 |
| **W5 — Customer membatalkan order** | Detail order `/orders/{orderId}` | customer | `GET /v1/orders/{orderId}` | 1 |
| | Konfirmasi pembatalan | customer | `POST /v1/orders/{orderId}/cancellation` | 1 |

### Alamat aplikasi ter-deploy

_Belum di-deploy._ Bagian ini diisi setelah aplikasi web tersedia di Vercel.

### Akun uji untuk presentasi

| Username | Role | Domain identity | Data yang dipegang |
|---|---|---|---|
| `staff-outlet-a` | staff | `outlet_a` | Order yang terikat `outlet_a` |
| `student-a` | customer | `cus_studentA` | Order miliknya sendiri |

Password akun uji tidak ditulis di repository. Nilainya ada pada
`auth/keycloak/.runtime/credentials.json` untuk provider lokal, dan pada
provider hosted setelah direset melalui `import.mjs` atau admin console.

### Catatan penyimpanan session

**Keputusan: token disimpan di `localStorage`.**

Alternatif yang lebih aman secara teori adalah menyimpan token hanya di memori
JavaScript, dan itu memang yang diusulkan pada ADR 0003. Keputusan itu tidak
dapat dipertahankan begitu uji terima P5 dijalankan: membuka URL sebuah layar
di **tab baru** menciptakan konteks JavaScript yang baru, sehingga token di
memori hilang dan aplikasi mengalihkan pengguna ke sign-in — padahal syaratnya
adalah layar yang sama dengan data yang sama. `sessionStorage` juga tidak
menolong karena bersifat per-tab, dan memperbarui token diam-diam lewat iframe
tidak dapat diandalkan karena authorization server berada pada **situs
berbeda** sehingga cookie-nya diblokir browser modern.

**Konsekuensi keamanan yang diterima:** token di `localStorage` dapat dibaca
oleh **setiap** script yang berjalan pada halaman itu, sehingga satu celah XSS
cukup untuk mencuri sesi. Cookie `HttpOnly` akan menutup celah itu, tetapi
memerlukan backend-for-frontend yang sudah ditolak pada ADR 0003. Karena
access token berumur 300 detik, jendela penyalahgunaan dibatasi oleh masa
berlakunya; refresh token tetap menjadi target utama dan karena itu refresh
dikoordinasikan antar-tab agar reuse tidak mencabut seluruh token family.

### Dua jebakan production yang sudah ditutup

Keduanya hanya muncul setelah deploy, tidak terlihat di localhost, dan sudah
diperbaiki beserta test regresinya.

**1. Proxy melemahkan ETag, sehingga `If-Match` tidak pernah cocok.**

Cloudflare meng-encode ulang respons JSON dengan Brotli, dan ketika sebuah
intermediary mentransformasi representasi ia **melemahkan** validator menjadi
`W/"..."` — perilaku yang benar menurut RFC 9110. Yang tidak benar adalah
akibatnya di sisi kami: `If-Match` dibandingkan dengan *strong comparison*,
sehingga tag weak tidak akan pernah cocok dan browser menerima `412` pada
write **pertama**, bukan hanya saat konflik.

Diukur langsung terhadap deployment:

| Request | ETag diterima | Encoding |
|---|---|---|
| default (browser) | `W/"aiNfDU1j..."` | `br` |
| `Accept-Encoding: identity` | `"aiNfDU1j..."` | — |

Perbaikannya: `matchesIfMatch` membandingkan **nilai** validator dan
mengabaikan prefix weak. Aman di sini karena tag ini adalah penanda versi
entitas, bukan checksum byte: `W/"abc"` dan `"abc"` menamai versi yang sama,
dan itulah persis yang ditanyakan `If-Match`. Strong comparison ada untuk
melindungi operasi byte-exact seperti range request, yang tidak disediakan API
ini. `Cache-Control: no-transform` juga dikirim untuk menghentikan pelemahan
di sumbernya. Regresi dikunci oleh `tests/web/test-weak-etag.js`.

**2. Proses abort saat shutdown, sehingga deploy sehat terlihat gagal.**

Railway melaporkan deploy sebagai crash karena proses keluar dengan kode
`134`:

```
Statement::~Statement() [better_sqlite3.node]
node::RemoveEnvironmentCleanupHook(...) at ../src/api/hooks.cc:142
Assertion failed: (env) != nullptr
Aborted
```

Setiap store menyiapkan prepared statement di module scope, jadi statement itu
masih terbuka saat proses berakhir. Tanpa signal handler, Node lebih dulu
meruntuhkan environment V8, lalu destructor native berjalan pada environment
yang sudah mati. Service sendiri sehat sepanjang waktu — crash hanya terjadi di
jalur keluar, dan platform membaca exit code non-zero sebagai deploy gagal.

Perbaikannya: jalur shutdown eksplisit pada `SIGTERM`/`SIGINT` — berhenti
menerima koneksi, tutup handle SQLite selagi runtime masih utuh, lalu `exit 0`.
Diverifikasi di Linux (platform deployment): `docker stop` menghasilkan exit
code **137 tanpa perbaikan** dan **0 dengan perbaikan**. Regresi dikunci oleh
`tests/web/test-graceful-shutdown.js`.

> Windows tidak memiliki signal POSIX, sehingga test shutdown melaporkan jalur
> signal sebagai **dilewati** di sana, bukan lulus diam-diam. Verifikasi
> otoritatifnya berjalan di CI (Linux) dan lewat Docker.

### Temuan terhadap kontrak

Layar yang tidak dapat dibangun dari operasi yang dipublikasikan adalah temuan
tentang kontrak, bukan alasan menambah endpoint (aturan P5 §0.1). Berikut yang
tercatat:

| # | Temuan | Dampak pada client |
|---|---|---|
| 1 | Tidak ada operasi daftar driver, padahal `CreatePickupRequest.driverId` wajib | Form penugasan driver (W2) memerlukan `driverId` yang tidak dapat ditemukan lewat API |
| 2 | Tidak ada `GET /v1/pickups/{pickupId}` | `ETag` per-pickup tidak dapat diperoleh, sehingga conditional write pada `collectPickup` tidak dapat dibangun dari operasi yang ada |
| 3 | State machine tidak lengkap: service hanya pernah menulis `pending_pickup`, `processing`, `cancelled` (order) dan `assigned`, `picked_up` (pickup) | Status `ready_for_pickup`, `confirmed`, `assigned`, `completed`, dan `delivered` ada di enum tetapi tidak pernah dicapai |
| 4 | `400` vs `422` tidak sepenuhnya mengikuti pembacaan RFC 9457: kegagalan nilai field (mis. `weightKg` di bawah minimum) dijawab `422` | Client menangani keduanya; `invalid-params` menempelkan pesan pada field yang tepat |
| 5 | Tidak ada operasi sign-out di kontrak | Client memanggil `end_session_endpoint` dan `revocation_endpoint` provider |
| 6 | `CreateOrderRequest.customerId` meminta identitas yang sudah ada pada token | Client membaca `fixture_domain_id` dari token |

Temuan 1 dan 2 belum diselesaikan dan **tidak** ditambal dengan endpoint baru,
sesuai aturan tugas.

---

## 🔗 Referensi Materi

Proyek ini mengikuti silabus mata kuliah Platform Based Software Engineering.

---

<div align="center">

Dibuat dengan 🩷

</div>
