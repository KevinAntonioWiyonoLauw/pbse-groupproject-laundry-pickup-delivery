// Uji graceful shutdown.
//
// Verifikasi sesungguhnya memerlukan pengiriman SIGTERM, dan Windows tidak
// memiliki signal POSIX: `child.kill('SIGTERM')` di sana langsung mematikan
// proses, sehingga handler tidak pernah berjalan. Karena itu:
//
//   - di Linux/macOS, SIGTERM sungguhan dikirim dan exit code diperiksa;
//   - di Windows, tes ini memverifikasi bagian yang dapat diverifikasi
//     (handler terdaftar, closeDatabase idempoten) dan menandai sisanya
//     sebagai tidak dapat diuji di platform ini, bukan lulus diam-diam.
//
// Jalur deployment adalah Linux (Railway), jadi verifikasi otoritatifnya
// berjalan di CI (langkah `test:shutdown` pada .github/workflows/ci.yml) dan
// dapat diulang manual dengan Docker:
//
//   docker build -t laundry-check .
//   docker run -d --name laundry-check -p 18099:8080 \
//     -e PORT=8080 -e DATABASE_FILE=./db/laundry.sqlite \
//     -e OIDC_ISSUER=... -e OIDC_JWKS_URI=... -e OIDC_AUDIENCE=laundry-api \
//     laundry-check
//   docker stop laundry-check
//   docker inspect laundry-check --format '{{.State.ExitCode}}'   # harus 0

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");

const SERVICE = path.join(__dirname, "..", "..", "service");
const isWindows = process.platform === "win32";
const PORT = 18993;

const results = [];
const cek = (ok, label, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);

// ---------------------------------------------------------------- 1. statis
const appSource = fs.readFileSync(path.join(SERVICE, "src", "app.js"), "utf8");
cek(/process\.on\('SIGTERM'/.test(appSource), "handler SIGTERM terdaftar di app.js");
cek(/process\.on\('SIGINT'/.test(appSource), "handler SIGINT terdaftar di app.js");
cek(/database\.closeDatabase\(\)/.test(appSource), "shutdown memanggil closeDatabase()");

const dbSource = fs.readFileSync(path.join(SERVICE, "src", "database.js"), "utf8");
cek(/function closeDatabase/.test(dbSource), "closeDatabase() didefinisikan");
cek(/db\.open/.test(dbSource), "closeDatabase() memeriksa handle masih terbuka (idempoten)");

// ------------------------------------------------- 2. closeDatabase langsung
// Membuktikan penutupan handle sebelum exit tidak memicu native crash.
const dbFile = path.join(os.tmpdir(), `close-test-${Date.now()}.sqlite`);
const closer = spawn(process.execPath, ["-e", `
  const db = require(${JSON.stringify(path.join(SERVICE, "src", "database.js"))});
  const Database = require(${JSON.stringify(path.join(SERVICE, "node_modules", "better-sqlite3"))});
  // Siapkan statement di module scope seperti store, agar destructornya ada.
  const stmt = db.prepare('SELECT 1 AS x');
  stmt.get();
  db.closeDatabase();
  db.closeDatabase();          // idempoten: panggilan kedua harus aman
  console.log('closed-ok');
`], {
  cwd: SERVICE,
  env: {
    ...process.env,
    // `config.js` treats PORT as required and calls process.exit(1) without it.
    // Locally a gitignored service/.env supplies it through dotenv, so its
    // absence only shows up in CI — where there is no .env — and the child
    // exited 1 before the database could be opened, failing this check.
    PORT: String(PORT + 1),
    DATABASE_FILE: dbFile,
    NODE_ENV: "test",
    OIDC_ISSUER: "https://example.invalid/realms/t",
    OIDC_JWKS_URI: "https://example.invalid/certs",
    OIDC_AUDIENCE: "test",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let closeOut = "", closeErr = "";
closer.stdout.on("data", (c) => { closeOut += c; });
closer.stderr.on("data", (c) => { closeErr += c; });

(async () => {
  const closeResult = await new Promise((resolve) => {
    closer.once("exit", (code) => resolve(code));
    setTimeout(() => { closer.kill(); resolve("TIMEOUT"); }, 20000);
  });

  cek(closeResult === 0, "closeDatabase() lalu exit -> exit code 0", `code=${closeResult}`);
  cek(/closed-ok/.test(closeOut), "pemanggilan kedua closeDatabase() aman (idempoten)");
  const closeCrashed = /Assertion|better_sqlite3|RemoveEnvironmentCleanupHook|Aborted/.test(closeErr);
  cek(!closeCrashed, "tidak ada native crash saat menutup handle");
  if (closeCrashed) {
    console.log("\n--- stderr ---\n" + closeErr.slice(0, 500));
  }

  // ------------------------------------------------------------- 3. SIGTERM
  if (isWindows) {
    results.push("SKIP  pengiriman SIGTERM tidak dapat diuji di Windows");
    results.push("      (Windows tidak punya signal POSIX; deployment Railway = Linux)");
  } else {
    const child = spawn(process.execPath, ["src/app.js"], {
      cwd: SERVICE,
      env: {
        ...process.env,
        PORT: String(PORT),
        DATABASE_FILE: path.join(os.tmpdir(), `sigterm-${Date.now()}.sqlite`),
        NODE_ENV: "production",
        OIDC_ISSUER: "https://example.invalid/realms/t",
        OIDC_JWKS_URI: "https://example.invalid/certs",
        OIDC_AUDIENCE: "test",
        CORS_ALLOWED_ORIGINS: "http://localhost:5173",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (c) => { out += c; });
    child.stderr.on("data", (c) => { err += c; });

    let up = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).status === 200) { up = true; break; } } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    cek(up, "service menjadi sehat");

    const sig = await new Promise((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
      child.kill("SIGTERM");
      setTimeout(() => resolve({ code: "TIMEOUT", signal: null }), 15000);
    });
    cek(sig.code === 0, "SIGTERM -> exit code 0", `code=${sig.code} signal=${sig.signal}`);
    cek(/shutting down/i.test(out), "log shutdown muncul");
    cek(!/Assertion|Aborted/.test(err), "tidak ada native crash pada SIGTERM");
  }

  for (const s of ["", "-wal", "-shm"]) fs.rmSync(`${dbFile}${s}`, { force: true, maxRetries: 5, retryDelay: 100 });

  console.log("=== RINGKASAN ===");
  for (const r of results) console.log("  " + r);
  const fail = results.filter((r) => r.startsWith("FAIL")).length;
  const skip = results.filter((r) => r.startsWith("SKIP")).length;
  console.log(`\n  ${results.filter(r => r.startsWith("PASS")).length} lulus, ${fail} gagal, ${skip} dilewati`);
  process.exitCode = fail ? 1 : 0;
})();
