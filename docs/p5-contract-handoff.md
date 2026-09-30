# Handoff Kontrak API P5 (Contract Owner ke Tim)

- **Tanggal**: 30 September 2026
- **Penyusun**: Maulana Faris Al Ghifari (Faris — Contract Owner Rotasi 2)
- **Penerima Utama**: Kevin Antonio Wiyono Lauw (Service Owner) & Farsya Nabila Tori (Integration Owner)
- **Tembusan**: Ayasha Rahmadinni (Client Owner)
- **Versi Kontrak**: `1.3.0` (`openapi.yaml`)
- **Versi sebelumnya**: `1.2.0` (P4)
- **Status Kompatibilitas**: **Compatible** (menambah header, response, dan extension member opsional)
- **Hasil Redocly Lint**: `validated in ...ms — Woohoo! Your API description is valid.` (0 error, 2 warning)

> Dokumen ini sejajar dengan [`docs/p4-contract-handoff.md`](p4-contract-handoff.md).
> Isi handoff P4 (security scheme, vocabulary scope, tiga lapisan akses) tetap
> berlaku; dokumen ini hanya mencatat **delta P5**.

---

## 1. Ringkasan Perubahan Kontrak `1.2.0` → `1.3.0`

Lima kebutuhan client browser tidak dapat dinyatakan dari kontrak `1.2.0`.
Seluruh perubahan bersifat **additive**: tidak ada operasi, field, atau status
code yang dihapus maupun diubah maknanya, sehingga client yang ditulis terhadap
`1.2.0` tetap berjalan tanpa perubahan (lihat `docs/compatibility.md`).

1. **Conditional read** — header `ETag` (strong) dan response `304 Not Modified`
   pada tiga operasi `GET`, beserta parameter `If-None-Match`. Ini yang membuat
   polling murah: siklus poll yang tidak menemukan perubahan dijawab `304` tanpa
   body.
2. **Conditional write** — parameter `If-Match` pada tiga operasi write entitas,
   beserta response `412` dan problem type `precondition-failed`. Ini yang
   mencegah *lost update* ketika dua window menulis entitas yang sama.
3. **Cursor pagination** — header `X-Next-Cursor` pada dua operasi list.
4. **Bentuk kegagalan validasi** — extension `invalid-params`
   (`[{name, reason}]`) pada `400`, berdampingan dengan `invalidFields` lama.
5. **Kelengkapan schema `Problem`** — `error` (pada `401`) dan `requiredScopes`
   (pada `403`) yang sudah dipancarkan service sejak P4 tetapi belum pernah
   dinyatakan di kontrak; serta perbaikan `servers` ke deployment sebenarnya.

---

## 2. Header Baru

| Header | Arah | Operasi | Keterangan |
|---|---|---|---|
| `ETag` | Response | `GET /orders/{orderId}`, `GET /orders`, `GET /pickups` | Strong validator (tanpa prefix `W/`). Nilai buram bagi client; client hanya menyimpannya dan mengirimnya kembali. |
| `If-None-Match` | Request | tiga operasi `GET` di atas | Membawa `ETag` terakhir. Cocok → `304` tanpa body. |
| `If-Match` | Request | `POST /orders/{orderId}/fulfilment`, `POST /orders/{orderId}/cancellation`, `POST /pickups/{pickupId}/collect` | **`required: false`.** Membawa `ETag` versi yang terakhir dilihat client. Tidak cocok → `412`. |
| `X-Next-Cursor` | Response | `GET /orders`, `GET /pickups` | Token pagination berbasis baris (bukan offset). Sudah dipancarkan service sejak P3 (finding F7), kini dideklarasikan. |

> **Penting untuk Service Owner.** `If-Match` **wajib tetap opsional**. Bila
> dijadikan `required: true`, Prism mock akan menolak
> `tests/contract/test-contract.js` dan seluruh test P3/P4 yang tidak mengirim
> header itu. Yang berubah hanya **jaminan** yang didapat client yang mengirimnya,
> bukan kewajiban mengirimnya.

> **Penting untuk Integration Owner.** `ETag` **bukan** CORS-safelisted response
> header, sehingga wajib ada di `Access-Control-Expose-Headers` — jika tidak,
> browser tidak dapat membacanya dan seluruh conditional read/write mustahil.
> `If-Match`/`If-None-Match` juga bukan CORS-safelisted request header, sehingga
> wajib ada di `Access-Control-Allow-Headers`.

---

## 3. Status Code Baru

| Kondisi | Status | Response | Problem type |
|---|---|---|---|
| `If-None-Match` cocok, entitas tidak berubah | `304` | Body kosong; `ETag` tetap dikirim | — |
| `If-Match` ada tetapi tidak cocok versi terkini | `412` | `application/problem+json` | `https://api.example.com/problems/precondition-failed` |
| Write tanpa `If-Match` | `200`/`201` | Seperti `1.2.0` | — (header opsional, tetap dihormati bila dikirim) |

### Problem type baru: `precondition-failed`

`412` adalah **kondisi normal**, bukan kegagalan sistem. Kontrak menyatakannya
eksplisit: setelah menerima `412`, client diharapkan memuat ulang, me-render
ulang, dan menjelaskan dalam istilah domain ("Order ini sudah ditangani rekan
kerja"), bukan menampilkan banner error generik.

```json
{
  "type": "https://api.example.com/problems/precondition-failed",
  "title": "Precondition failed",
  "status": 412,
  "detail": "Order ini sudah ditangani oleh rekan kerja. Muat ulang untuk melihat keadaan terbaru.",
  "instance": "/v1/orders/ord_01HZX2Y5K7/fulfilment"
}
```

### Bentuk kegagalan validasi (`400`)

Response `400` kini membawa **dua** representasi daftar field yang gagal:

```json
{
  "type": "https://api.example.com/problems/bad-request",
  "title": "Bad Request",
  "status": 400,
  "invalidFields": ["weightKg"],
  "invalid-params": [{ "name": "weightKg", "reason": "must be at least 0.1" }]
}
```

- `invalid-params` adalah extension **baru** (bentuk yang dipakai RFC 9457 pada
  contohnya), membawa nama **dan** alasan.
- `invalidFields` **dipertahankan** apa adanya agar client lama tetap bekerja
  (finding F5). Perubahan bersifat additive.

### Kelengkapan schema `Problem`

| Member | Muncul pada | Sudah dipancarkan sejak | Kini dideklarasikan |
|---|---|---|---|
| `error` | `401` (mirror `WWW-Authenticate`) | P4 | Ya (menutup finding F8) |
| `requiredScopes` | `403` | P4 | Ya (menutup finding F8) |

---

## 4. Verifikasi Kontrak ↔ Implementasi (sebagai Contract Owner)

Dibandingkan terhadap `service/src/routes/` pada kontrak `1.3.0`:

| # | Item | Hasil |
|---|---|:--:|
| 1 | `ETag` benar-benar dikirim pada `GET /orders/{orderId}`, `GET /orders`, `GET /pickups` | ✅ |
| 2 | `If-Match` **`required: false`** pada fulfilment, cancellation, collect | ✅ (`openapi.yaml:625-627`) |
| 3 | `412` mendeklarasikan problem type `precondition-failed` | ✅ (`openapi.yaml:854-871`) |
| 4 | `X-Next-Cursor` dideklarasikan pada dua operasi list | ✅ (`openapi.yaml:81`, `:376`) |
| 5 | Extension `invalid-params` ada pada `400`, `invalidFields` dipertahankan | ✅ (`openapi.yaml:812-834`) |
| 6 | `error` dan `requiredScopes` dideklarasikan pada schema `Problem` | ✅ (`openapi.yaml:835-846`) |
| 7 | `servers` menunjuk `https://pbse.kevinio.my.id/v1` | ✅ (`openapi.yaml:14`) |
| 8 | Deskripsi visibilitas koleksi staff menyebut order yang belum terikat outlet | ✅ (`CHANGELOG.md` §Clarified; deskripsi `GET /orders`) |

`CHANGELOG.md` mencerminkan seluruh perubahan `1.3.0` di bawah satu bagian
bertanggal `2026-09-27 (v1.3.0)`, tanpa perubahan yang tidak tercatat.

---

## 5. Catatan Kompatibilitas

Seluruh perubahan **compatible** menurut `docs/compatibility.md`:

- Menambah header respons (`ETag`, `X-Next-Cursor`) — client lama mengabaikannya.
- Menambah parameter request **opsional** (`If-Match`, `If-None-Match`) — client
  lama yang tidak mengirimnya mempertahankan perilaku `1.2.0`.
- Menambah response (`304`, `412`) — status baru yang tidak pernah dilihat client
  lama, dan hanya muncul bila client mengirim precondition.
- Menambah extension member opsional (`invalid-params`, `error`,
  `requiredScopes`) — additive; `invalidFields` dipertahankan.

**Tidak ada** perubahan breaking. Client yang ditulis terhadap `1.2.0` tetap
berjalan. Yang bertambah hanya jaminan bagi client yang memakai precondition.

---

## 6. Tembusan dan Tindak Lanjut

**Kepada Service Owner (Kevin):**

1. Pertahankan `If-Match` sebagai **opsional tetapi dihormati**; resolusi
   idempotency replay mendahului pemeriksaan `If-Match`, baru mutasi.
2. Urutan evaluasi write yang benar: **idempotency replay → `If-Match` →
   mutasi**, agar retry request yang sama mengembalikan hasil semula, bukan
   `412`.
3. `matchesIfMatch` membandingkan **nilai** validator dan mengabaikan prefix
   weak, karena proxy (Cloudflare) melemahkan `ETag` menjadi `W/"..."`. Ini
   perilaku benar menurut RFC 9110 dan sudah dikunci `tests/web/test-weak-etag.js`.

**Kepada Integration Owner (Tori):**

1. Pastikan `ETag` dan `X-Next-Cursor` ada di `Access-Control-Expose-Headers`,
   dan `If-Match`/`If-None-Match` ada di `Access-Control-Allow-Headers`.
2. Test `304` wajib memakai jalur `304` eksplisit (bukan `req.fresh` bawaan),
   karena `fetch()` menyuntikkan `no-cache`.
3. Test `412`: buka entitas yang sama dua kali, kirim `If-Match` yang sama,
   pastikan yang kedua `412` **dan database tidak berubah**.

---

## 7. Finding yang Tetap Terbuka (tidak ditambal)

Sesuai PDF P5 §0.1, layar yang tidak dapat dibangun dari operasi yang
dipublikasikan **dicatat sebagai finding**, bukan ditambal dengan endpoint baru:

| # | Finding | Dampak pada client |
|---|---|---|
| F1 | Tidak ada operasi daftar driver, padahal `CreatePickupRequest.driverId` wajib | Form penugasan driver (W2) tidak dapat mengisi `driverId` dari API |
| F4 | Tidak ada `GET /v1/pickups/{pickupId}`, sehingga `ETag` per-pickup tidak dapat diperoleh | Conditional write pada `collectPickup` tidak dapat dibangun sepenuhnya dari operasi yang ada |
| F3 | State machine sebagian fiktif: `ready_for_pickup`, `confirmed`, `assigned`, `completed`, `delivered` tidak pernah ditulis service | Status tersebut ada di enum tetapi tidak pernah dicapai |
| F10 | Tidak ada operasi sign-out di kontrak | Client memanggil `end_session_endpoint`/`revocation_endpoint` provider langsung |

---

## 8. Ringkasan Satu Paragraf (untuk tembusan)

```text
Branch contract-owner sudah selaras dengan main.
Kontrak 1.3.0 sudah diverifikasi terhadap implementasi service.
Header baru: ETag (strong), If-Match (opsional), If-None-Match, X-Next-Cursor.
Status baru: 304 Not Modified, 412 Precondition Failed
             (problem type precondition-failed).
Extension baru: invalid-params [{name, reason}] pada 400;
                error pada 401; requiredScopes pada 403.
Seluruh perubahan compatible; client 1.2.0 tetap berjalan tanpa perubahan.
Rincian ada di docs/p5-contract-handoff.md.
```
