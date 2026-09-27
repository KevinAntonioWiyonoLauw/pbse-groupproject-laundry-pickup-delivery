# Contract changelog

## 2026-09-27 (v1.3.0)

Perubahan ini **kompatibel** menurut `docs/compatibility.md`: seluruhnya
menambah header, response, dan extension member opsional. Tidak ada operasi,
field, atau status code yang dihapus atau diubah maknanya, sehingga client
yang ditulis terhadap `1.2.0` tetap berjalan tanpa perubahan.

Alasan: Session 5 membangun browser client di atas kontrak ini, dan lima
kebutuhan client tidak dapat dinyatakan dari kontrak `1.2.0`.

### Added (compatible)

- Header `ETag` pada `GET /orders/{orderId}`, `GET /orders`, dan `GET /pickups`.
  Strong validator, tanpa prefix `W/`, karena `If-Match` mensyaratkan strong
  comparison.
- Response `304 Not Modified` pada tiga operasi di atas, beserta parameter
  `If-None-Match`. Ini yang membuat polling murah.
- Parameter `If-Match` pada `POST /orders/{orderId}/fulfilment`,
  `POST /orders/{orderId}/cancellation`, dan `POST /pickups/{pickupId}/collect`,
  beserta response `412` dan problem type
  `https://api.example.com/problems/precondition-failed`. Ini yang mencegah
  lost update ketika dua window menulis entitas yang sama.
- Header `X-Next-Cursor` pada `GET /orders` dan `GET /pickups`. Header ini
  sudah dipancarkan service sejak P3 tetapi belum pernah dinyatakan di kontrak.
- Extension member `invalid-params` (`[{name, reason}]`) pada response `400`,
  dalam bentuk yang dipakai RFC 9457 pada contohnya.
- Extension member `error` pada `401` dan `requiredScopes` pada `403`. Keduanya
  sudah dipancarkan service sejak P4 tetapi belum dinyatakan di kontrak.

### Clarified

- `GET /orders` kini menyatakan aturan visibilitas secara eksplisit: customer
  melihat order miliknya sendiri; staff melihat order yang sudah terikat
  outletnya **dan** order yang belum terikat outlet mana pun (antrean masuk);
  order yang terikat outlet lain tidak dikembalikan.
- `servers` diarahkan ke deployment sebenarnya
  (`https://pbse.kevinio.my.id/v1`) menggantikan `api.example.com`.

### Catatan untuk implementasi

`If-Match` bersifat opsional dan tetap dihormati bila dikirim. Client yang
tidak mengirimnya mempertahankan perilaku `1.2.0`; client yang mengirimnya
mendapat jaminan tidak menimpa perubahan yang belum dilihatnya.

## 2026-09-23 (v1.2.0)

Perubahan ini **kompatibel** menurut `docs/compatibility.md` (menambah endpoint).
Alasan: `POST /orders/{orderId}/fulfilment` sudah diimplementasikan dan dipakai
oleh negative test 3 P4 (scope `orders:fulfil`), tetapi belum pernah dinyatakan
di kontrak. Selama ini satu operasi protected berjalan tanpa deklarasi
`security` di `openapi.yaml`, sehingga kontrak tidak lagi menjadi sumber
kebenaran untuk operasi tersebut.

### Added (compatible)

- `POST /orders/{orderId}/fulfilment` (`fulfilOrder`) dengan scope
  `orders:fulfil` — operasi khusus staff untuk menerima order ke outlet caller.
  Endpoint ini sebelumnya hanya ada di kode dan dokumen handoff; kini
  dideklarasikan di kontrak dengan response `400`, `401`, `403`, `404`, `500`,
  `502`, `503`, dan `504`.
- `components.responses.NotFound` pada operasi ini mencakup dua kondisi:
  order tidak ada, dan order yang sudah terikat outlet lain.

### Clarified

- `orders:fulfil` kini dipakai oleh dua operasi di kontrak (`fulfilOrder`,
  `createPickup`) dan tidak ada lagi scope yang dideklarasikan tanpa operasi.

## 2026-09-23 (v1.1.0)

Perubahan ini **kompatibel** menurut `docs/compatibility.md` (menambah endpoint
dan menambah response field opsional). Alasan: kontrak 1.0.0 sudah mewajibkan
OAuth untuk seluruh operasi protected, tetapi dua capability yang sudah
dideklarasikan pada scope table belum punya operasi di kontrak. Step 11 P4
membutuhkan keduanya untuk empat negative test lintas boundary.

### Added (compatible)

- `POST /pickups` (`createPickup`) dengan scope `orders:fulfil` — operasi khusus
  staff untuk menugaskan driver pada order. Menambah endpoint tidak merusak
  client lama.
- `POST /pickups/{pickupId}/collect` (`collectPickup`) dengan scope
  `pickups:write` — operasi khusus driver untuk menandai penjemputan sudah
  diambil. Ownership check berjalan sebelum mutasi.
- Parameter `PickupId` (`^pku_[A-Za-z0-9]+$`).
- Schema `CreatePickupRequest` (`orderId`, `driverId`, `scheduledAt`).
- Response field opsional `outletId` pada schema `Order` (menambah response
  field bersifat compatible; client lama mengabaikan field yang tidak dikenal).
- Header `WWW-Authenticate` pada response `403 Forbidden`.

### Clarified

- `components.responses.NotFound` kini menyatakan secara eksplisit bahwa objek
  yang tidak ada dan objek yang tidak dapat diakses caller menghasilkan response
  yang identik, termasuk body Problem Details.
- `components.responses.Unauthorized` menjelaskan bahwa claims tidak dipercaya
  sebelum signature, issuer, audience, dan expiry diverifikasi.

## 2026-09-15 (v1.0.0 - Breaking Change)

- Updated contract version to `1.0.0` to reflect mandatory OAuth 2.0 / OIDC security requirements for P4.
- Defined `components.securitySchemes.oauth2` supporting `authorizationCode` (Authorization Code + PKCE) and `clientCredentials` flows.
- Established scope vocabulary: `orders:read`, `orders:write`, `pickups:read`, `orders:fulfil`, and `pickups:write`.
- Applied operation-level security requirements to all protected endpoints (`/orders`, `/orders/{orderId}`, `/orders/{orderId}/cancellation`, `/pickups`).
- Added public `/health` monitoring endpoint with `security: []`.
- Standardized `401 Unauthorized` with `WWW-Authenticate` response header, `403 Forbidden` for missing scopes, and `404 Not Found` covering both non-existent and not-owned resources (preventing resource existence probing).

## 2026-09-10 (v0.2.1)

- Added `invalidFields` Problem Details extension for request validation errors.

## 2026-09-08

- Finalized Session 3 contract behavior for unauthenticated local implementation.
- Added `Location` header to `POST /orders` response `201`.
- Added malformed identifier response `400` to `GET /orders/{orderId}`.
- Enforced UUID v4 format for `Idempotency-Key`.
- Added identifier patterns to resource schemas.

## 2026-09-02

- Finalized resource modeling for orders, pickups, and cancellations.
- Documented rejected UI/process candidates in `docs/resource-modeling.md`.
- Added collection pagination parameters and completed order status enums.
- Expanded Idempotency-Key and RFC 9457 conflict behavior in the OpenAPI contract.
