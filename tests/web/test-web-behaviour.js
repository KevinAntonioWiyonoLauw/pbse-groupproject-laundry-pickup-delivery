'use strict';

/**
 * Behaviour the browser client depends on, exercised against the real service.
 *
 * Three groups, each covering a way the web client would silently break:
 *   - CORS: a preflight carries no Authorization header, so it can never be
 *     authenticated, and the response headers a browser needs in order to read
 *     `ETag` and `X-Next-Cursor` must be exposed explicitly.
 *   - Visibility: a staff list and a staff detail must agree. When the list
 *     filter and the ownership predicate disagree, an order shows up in the
 *     intake queue and answers 404 when opened.
 *   - Conditional requests: 304 on an unchanged poll, 412 on a stale write.
 *     The 304 is checked with an explicit `Cache-Control: no-cache`, because
 *     `fetch` injects that header itself and the naive implementation then
 *     never returns 304.
 *
 * Uses the P4 harness: test-only signing key and a temporary database, so CI
 * needs no network access to a live authorization server.
 */

const path = require("node:path");
const crypto = require("node:crypto");
const harness = require(path.join(__dirname, "..", "helpers", "harness.js"));

const out = [];
const cek = (ok, label, extra = "") => { out.push(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`); };

const ORIGIN = "https://laundry-p5.vercel.app";
const uuid = () => crypto.randomUUID();

async function main() {
  const issuer = await harness.startTestIssuer({ port: harness.freePort(0) });
  const port = harness.freePort(60);
  const dbFile = harness.tempDatabaseFile("p5behaviour");
  const service = harness.startService({
    port, databaseFile: dbFile, issuer: issuer.issuer,
    jwksUri: issuer.jwksUri, audience: issuer.audience,
    extraEnv: { CORS_ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173` },
  });
  let log = "";
  service.stdout.on("data", (c) => { log += c; });
  service.stderr.on("data", (c) => { log += c; });
  await harness.waitForHealth(port, () => log);

  const base = `http://127.0.0.1:${port}`;
  const call = (token, p, init = {}) => fetch(`${base}${p}`, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", ...init.headers },
  });

  const student = await issuer.token("student-a");
  const staffA = await issuer.token("staff-outlet-a");
  const staffB = await issuer.token("staff-outlet-b");

  // ------------------------------------------------------------- CORS
  console.log("--- CORS ---");
  const pre = await fetch(`${base}/v1/orders`, {
    method: "OPTIONS",
    headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,idempotency-key,if-match" },
  });
  cek(pre.status === 204, "preflight dijawab 204", `status=${pre.status}`);
  cek(pre.headers.get("access-control-allow-origin") === ORIGIN, "ACAO = origin yang diizinkan");
  cek((pre.headers.get("access-control-allow-headers") || "").includes("If-Match"), "If-Match ada di allow-headers");
  cek((pre.headers.get("access-control-expose-headers") || "").includes("ETag"), "ETag ada di expose-headers");
  cek((pre.headers.get("access-control-expose-headers") || "").includes("X-Next-Cursor"), "X-Next-Cursor ada di expose-headers");
  cek((pre.headers.get("vary") || "").includes("Origin"), "Vary: Origin ada");
  cek(!pre.headers.get("access-control-allow-credentials"), "tidak ada Allow-Credentials (Bearer, bukan cookie)");

  const evil = await fetch(`${base}/v1/orders`, {
    method: "OPTIONS", headers: { Origin: "https://evil.example.org", "Access-Control-Request-Method": "GET" },
  });
  cek(!evil.headers.get("access-control-allow-origin"), "origin asing TIDAK di-reflect", `ACAO=${evil.headers.get("access-control-allow-origin") ?? "(absen)"}`);
  cek((evil.headers.get("vary") || "").includes("Origin"), "Vary: Origin tetap ada pada origin asing");

  const preAuth = await fetch(`${base}/v1/orders`, { method: "OPTIONS", headers: { Origin: ORIGIN } });
  cek(preAuth.status === 204, "preflight TANPA token tetap 204 (bukan 401)", `status=${preAuth.status}`);

  // ------------------------------------------------- visibilitas staff
  console.log("\n--- Visibilitas koleksi + detail staff ---");
  const created = await call(student, "/v1/orders", { method: "POST",
    headers: { "Idempotency-Key": uuid() },
    body: JSON.stringify({ customerId: "cus_studentA", serviceType: "wash_fold", weightKg: 2, pickupAddress: "Jl. Uji" }) });
  const order = await created.json();
  cek(created.status === 201 && order.outletId === null, "order baru belum terikat outlet", `outletId=${order.outletId}`);

  const staffList = await call(staffA, "/v1/orders?status=pending_pickup");
  const staffBody = await staffList.json();
  cek(staffBody.some((o) => o.id === order.id), "staff MELIHAT order pending di antrean masuk", `jumlah=${staffBody.length}`);

  const staffRead = await call(staffA, `/v1/orders/${order.id}`);
  cek(staffRead.status === 200, "staff dapat MEMBUKA order dari antreannya (list & detail konsisten)", `status=${staffRead.status}`);

  const staffBRead = await call(staffB, `/v1/orders/${order.id}`);
  cek(staffBRead.status === 200, "staff outlet lain juga melihat (belum diklaim siapa pun)", `status=${staffBRead.status}`);

  // ---------------------------------------------------- ETag / 304
  console.log("\n--- Conditional read ---");
  const g1 = await call(staffA, "/v1/orders");
  const etagList = g1.headers.get("etag");
  cek(!!etagList && !etagList.startsWith("W/"), "ETag list strong (bukan weak)", etagList ?? "absen");
  const g2 = await call(staffA, "/v1/orders", { headers: { "If-None-Match": etagList } });
  cek(g2.status === 304, "polling tak berubah -> 304", `status=${g2.status}`);
  const g2n = await call(staffA, "/v1/orders", { headers: { "If-None-Match": etagList, "Cache-Control": "no-cache" } });
  cek(g2n.status === 304, "304 tetap terjadi meski ada Cache-Control: no-cache", `status=${g2n.status}`);

  const d1 = await call(staffA, `/v1/orders/${order.id}`);
  const etagDetail = d1.headers.get("etag");
  const d2 = await call(staffA, `/v1/orders/${order.id}`, { headers: { "If-None-Match": etagDetail } });
  cek(d2.status === 304, "detail tak berubah -> 304", `status=${d2.status}`);

  // ---------------------------------------------------- If-Match / 412
  console.log("\n--- Conditional write ---");
  const ok = await call(staffA, `/v1/orders/${order.id}/fulfilment`, { method: "POST", headers: { "If-Match": etagDetail } });
  cek(ok.status === 200, "If-Match benar -> 200", `status=${ok.status}`);

  // Skenario dua window: window kedua masih memegang ETag LAMA, sementara
  // window pertama sudah menekan Terima. Ini yang menghasilkan 412.
  const stale = await call(staffA, `/v1/orders/${order.id}/fulfilment`, { method: "POST", headers: { "If-Match": etagDetail } });
  const staleBody = await stale.json();
  cek(stale.status === 412, "dua window, If-Match basi -> 412 (bukan 404, bukan 200)", `status=${stale.status}`);
  cek(staleBody.type === "https://api.example.com/problems/precondition-failed", "412 memakai problem type precondition-failed", `type=${staleBody.type}`);
  cek(/sudah ditangani/i.test(staleBody.detail || ""), "pesan 412 dalam istilah domain", `detail="${staleBody.detail}"`);

  const noMatch = await call(staffA, `/v1/orders/${order.id}/fulfilment`, { method: "POST" });
  cek(noMatch.status === 200, "tanpa If-Match tetap 200 (header opsional, klien lama aman)", `status=${noMatch.status}`);

  // staff outlet lain tetap tidak boleh menyentuh order milik outlet_a
  const other = await call(staffB, `/v1/orders/${order.id}/fulfilment`, { method: "POST" });
  cek(other.status === 404, "staff outlet lain -> 404 (bukan 412: ini soal kepemilikan, bukan versi)", `status=${other.status}`);

  // ------------------------------------------------ A.9 console attack
  console.log("\n--- A.9 ---");
  const attack = await call(student, `/v1/orders/${order.id}/fulfilment`, { method: "POST" });
  cek(attack.status === 403 || attack.status === 404, "customer -> operasi staff ditolak", `status=${attack.status}`);
  cek((await call(null, "/v1/orders")).status === 401, "tanpa token -> 401");

  await harness.stopChild(service);
  await issuer.close();
  harness.removeDatabase(dbFile);

  console.log("\n=== RINGKASAN ===");
  for (const r of out) console.log("  " + r);
  const fail = out.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n  ${out.length - fail} lulus, ${fail} gagal`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error("GAGAL:", e.message); process.exitCode = 1; });
