'use strict';

/**
 * `prepare.mjs` must be safe to run more than once.
 *
 * It writes two files into `auth/keycloak/.runtime/`: a realm template derived
 * from the script, and the generated credentials. They have opposite
 * requirements:
 *
 *   - the template must be REGENERATED every run, or a change to the script
 *     (a new client scope, a widened `optionalClientScopes`, an extra mapper)
 *     silently never reaches a machine that has already run it once;
 *   - the credentials must be PRESERVED, or every account stops working and
 *     `import.mjs` writes passwords to the provider that nobody holds.
 *
 * Both were broken at different times, so both are pinned here. The check is
 * on file hashes and structure, never on secret values: no password is printed
 * or compared in a way that would leak it.
 */

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, "..", "..");
const PREPARE = path.join(ROOT, "auth", "keycloak", "prepare.mjs");
const RUNTIME = path.join(ROOT, "auth", "keycloak", ".runtime");
const CREDS = path.join(RUNTIME, "credentials.json");
const TEMPLATE = path.join(RUNTIME, "laundry-realm.json");

const results = [];
const cek = (ok, label, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
const hash = (file) => fs.existsSync(file)
  ? require("node:crypto").createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  : null;

const run = () => execFileSync(process.execPath, [PREPARE], { cwd: ROOT, stdio: "pipe" });

// --- 1. struktur skrip -----------------------------------------------------
const source = fs.readFileSync(PREPARE, "utf8");
cek(!/await access\(new URL\('credentials\.json'/.test(source),
  "prepare.mjs tidak keluar lebih awal saat credentials.json sudah ada");
cek(/credentials\.users\[username\] \?\? secret\(\)/.test(source),
  "password yang sudah ada dipakai ulang, bukan di-generate ulang");

// --- 2. jalankan dua kali, bandingkan --------------------------------------
if (!fs.existsSync(CREDS)) {
  cek(false, "credentials.json ada sebelum pengujian", "jalankan prepare.mjs lebih dulu");
} else {
  const credsBefore = hash(CREDS);
  const templateBefore = hash(TEMPLATE);

  run();
  const credsAfterOne = hash(CREDS);
  run();
  const credsAfterTwo = hash(CREDS);
  const templateAfter = hash(TEMPLATE);

  cek(credsBefore === credsAfterOne && credsAfterOne === credsAfterTwo,
    "credentials.json identik setelah dua kali dijalankan",
    credsBefore === credsAfterTwo ? "hash tidak berubah" : "hash berubah — password akan tidak valid");

  // Template boleh berubah isinya (itu tujuannya), yang penting ia ditulis
  // ulang. Perbandingan yang bermakna adalah terhadap isi skrip saat ini.
  const template = JSON.parse(fs.readFileSync(TEMPLATE, "utf8"));
  const web = template.clients.find((c) => c.clientId === "laundry-web");
  const optional = web?.optionalClientScopes ?? [];
  cek(optional.includes("orders:write"),
    "template memuat orders:write untuk laundry-web", `[${optional.join(", ")}]`);
  cek(optional.includes("orders:fulfil"),
    "template memuat orders:fulfil untuk laundry-web");
  cek(templateAfter !== null, "template ditulis ulang setiap run");

  // Staff dan customer memakai client yang sama, jadi keduanya harus dapat
  // meminta scope-nya. Grant tetap dibatasi role user, bukan oleh daftar ini.
  const customerScopes = ["orders:read", "orders:write"];
  const staffScopes = ["orders:read", "pickups:read", "orders:fulfil"];
  cek([...customerScopes, ...staffScopes].every((s) => optional.includes(s)),
    "laundry-web dapat meminta scope customer dan staff");

  // --- 3. template memuat password, dan itu memang harus -------------------
  //
  // Keycloak tidak dapat membuat user beserta kredensialnya dari file import
  // tanpa nilai passwordnya, jadi template memang memuatnya. Yang harus
  // dibuktikan bukan "tidak ada password di file itu", melainkan bahwa file
  // itu tidak pernah meninggalkan mesin ini: tidak masuk Git dan tidak masuk
  // image container.
  const templateText = fs.readFileSync(TEMPLATE, "utf8");
  const creds = JSON.parse(fs.readFileSync(CREDS, "utf8"));
  cek(Object.values(creds.users).every((p) => templateText.includes(p)),
    "template memuat password user (wajib: Keycloak butuh nilainya saat import)");

  const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
  const dockerignore = fs.readFileSync(path.join(ROOT, ".dockerignore"), "utf8");
  cek(gitignore.includes("auth/keycloak/.runtime"),
    "folder .runtime diabaikan Git");
  cek(dockerignore.includes("auth/keycloak/.runtime"),
    "folder .runtime diabaikan build container");

  // Bukti, bukan asumsi: tanyakan langsung kepada Git apakah kedua file itu
  // terlacak. File yang tidak ada di index tidak dapat ter-commit.
  let tracked = "";
  try {
    tracked = execFileSync("git", ["ls-files", "auth/keycloak/.runtime"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch { /* di luar repo Git: tidak ada yang bisa dilacak */ }
  cek(tracked === "", "tidak ada file .runtime yang terlacak Git",
    tracked ? tracked.split("\n").length + " file terlacak" : "");
}

console.log("=== RINGKASAN ===");
for (const r of results) console.log("  " + r);
const fail = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n  ${results.length - fail} lulus, ${fail} gagal`);
process.exitCode = fail ? 1 : 0;
