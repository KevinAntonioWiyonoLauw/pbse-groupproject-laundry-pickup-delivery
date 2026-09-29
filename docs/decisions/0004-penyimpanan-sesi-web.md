# ADR 0004 - Penyimpanan Sesi Web P5

- Status: Diterapkan untuk client web P5; melengkapi dan merevisi keputusan web pada ADR 0003.
- Penyusun: Aya (Client Owner Rotasi 2).
- Cakupan: dashboard web yang berjalan sebagai public client di browser.

## Context

P5 mengharuskan pengguna membuka layar yang sama di tab baru dengan data yang
sama. Tab baru memiliki konteks JavaScript yang berbeda, sehingga sesi yang
hanya hidup di memori hilang. `sessionStorage` juga terpisah per tab. Provider
OIDC berjalan pada situs yang berbeda dari aplikasi, jadi silent authentication
berbasis cookie lintas situs tidak menjadi dasar yang dapat diandalkan.

Sesi web memakai Authorization Code + PKCE. Access token dan refresh token
berputar, dengan reuse detection provider yang dapat mencabut seluruh token
family. Refresh yang berjalan bersamaan dari dua tab karena itu harus
dikoordinasikan.

## Decision

Token sesi web disimpan di `localStorage` pada satu key versi:
`laundry.web.session.v1`. Nilainya adalah JSON yang hanya memuat data sesi yang
diperlukan client: access token, refresh token, token type, expiry, ID token
(bila diberikan untuk logout), issuer, dan claims pengguna. Nilai token tidak
pernah ditulis ke URL, log, telemetry, atau pesan UI.

Setiap login tetap memakai `state`, OIDC `nonce`, dan `code_verifier` acak.
Transaksi PKCE yang pendek umurnya disimpan di `sessionStorage`, lalu dihapus
setelah callback berhasil atau gagal. `localStorage` hanya menyimpan sesi yang
sudah tervalidasi oleh token endpoint.

Refresh dilakukan melalui satu lock browser bernama
`laundry-web-session-refresh`. Tab yang memperoleh lock wajib membaca ulang
sesi dari `localStorage` di dalam lock. Jika tab lain sudah menulis token baru
yang masih berlaku, tab tersebut menggunakannya dan tidak mengirim refresh
token lama. Jika belum, tab melakukan satu refresh, menulis access token dan
refresh token pengganti sebagai satu nilai JSON, lalu memberi tahu tab lain
melalui `BroadcastChannel` dan event storage. Fallback tanpa `navigator.locks`
tetap memeriksa sesi terbaru sebelum refresh dan menolak retry paralel.

Refresh token rotation diperlakukan sebagai aturan provider, bukan sebagai
cache yang boleh dicoba ulang. Bila refresh ditolak atau reuse terdeteksi,
client menghapus sesi lokal dan meminta login lagi. Sign-out menghapus sesi
lokal dan mencoba memanggil endpoint revocation bila tersedia, lalu kembali ke
landing page aplikasi. Client tidak mengarahkan pengguna ke provider saat
logout, sehingga tombol **Keluar** tetap berada di origin web. Token tidak
disertakan dalam URL logout.

## Alternatives Considered

1. **Memori saja**, seperti usulan web pada ADR 0003. Ini paling membatasi
   dampak token yang tersimpan, tetapi gagal mempertahankan layar saat dibuka
   di tab baru atau setelah reload.
2. **`sessionStorage`**. Ini bertahan saat reload dalam satu tab, tetapi tidak
   dibagi ke tab baru dan tetap dapat dibaca JavaScript.
3. **BFF dengan cookie `HttpOnly`**. Ini memberi perlindungan XSS yang lebih
   baik, tetapi menambah service baru dan mengubah batas kepemilikan P5.
4. **IndexedDB**. Ini tidak menyelesaikan risiko script yang sama membaca sesi
   dan membuat koordinasi refresh lebih rumit tanpa manfaat penerimaan P5.

## Consequences

Pengguna dapat membuka route yang sama di tab baru tanpa kehilangan sesi, dan
rotasi refresh token tidak dilakukan bersamaan oleh beberapa tab. Access token
yang kedaluwarsa saat aplikasi terbuka memicu satu refresh lalu satu retry API;
gagal refresh berakhir di halaman sign-in tanpa loop.

Keputusan ini menerima risiko bahwa script yang berjalan pada origin aplikasi
dapat membaca token dari `localStorage`. Karena itu client harus tetap
menghindari HTML yang tidak disanitasi, tidak memuat script pihak ketiga yang
tidak perlu, tidak mencetak token, dan menghapus seluruh sesi saat sign-out atau
refresh ditolak. Access token berumur pendek membatasi jendela penggunaan,
tetapi tidak menghilangkan risiko pencurian refresh token.

ADR ini secara sengaja memperbarui kebijakan penyimpanan web pada ADR 0003
untuk memenuhi acceptance P5. Kebijakan mobile dan scheduled job pada ADR 0003
tetap berlaku.
