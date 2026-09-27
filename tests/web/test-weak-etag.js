// Uji regresi: If-Match harus bekerja dengan ETag WEAK.
// Mensimulasikan persis yang diterima browser dari Cloudflare (W/"...").
const path = require("node:path");
const crypto = require("node:crypto");
const harness = require(path.join(__dirname, "..", "helpers", "harness.js"));
const uuid = () => crypto.randomUUID();

const out = [];
const cek = (ok, label, extra = "") => out.push(`${ok ? "PASS" : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);

(async () => {
  const issuer = await harness.startTestIssuer({ port: harness.freePort(0) });
  const port = harness.freePort(100);
  const dbFile = harness.tempDatabaseFile("weaktag");
  const svc = harness.startService({ port, databaseFile: dbFile, issuer: issuer.issuer,
    jwksUri: issuer.jwksUri, audience: issuer.audience,
    extraEnv: { CORS_ALLOWED_ORIGINS: "http://localhost:5173" } });
  let log = ""; svc.stdout.on("data", c => log += c); svc.stderr.on("data", c => log += c);
  await harness.waitForHealth(port, () => log);

  const base = `http://127.0.0.1:${port}`;
  const student = await issuer.token("student-a");
  const staff = await issuer.token("staff-outlet-a");
  const call = (t, p, i = {}) => fetch(`${base}${p}`, { ...i,
    headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), "Content-Type": "application/json", ...i.headers } });

  const created = await call(student, "/v1/orders", { method: "POST",
    headers: { "Idempotency-Key": uuid() },
    body: JSON.stringify({ customerId: "cus_studentA", serviceType: "wash_fold", weightKg: 2, pickupAddress: "Jl. Weak" }) });
  const order = await created.json();

  const detail = await call(staff, `/v1/orders/${order.id}`);
  const strongTag = detail.headers.get("etag");
  cek(!strongTag.startsWith("W/"), "server mengirim ETag strong", strongTag.slice(0, 20) + "...");

  // Inilah bentuk yang diterima browser setelah Cloudflare mengompres: weak.
  const weakTag = "W/" + strongTag;
  console.log(`\n  strong (server)   : ${strongTag}`);
  console.log(`  weak   (browser)  : ${weakTag}\n`);

  // 1. If-Match dengan tag WEAK harus DITERIMA (ini yang tadinya gagal 412)
  const fulfil = await call(staff, `/v1/orders/${order.id}/fulfilment`,
    { method: "POST", headers: { "If-Match": weakTag } });
  cek(fulfil.status === 200, "If-Match WEAK diterima (bukan 412)", `status=${fulfil.status}`);
  const fulfilled = await fulfil.json();
  cek(fulfilled.status === "processing", "order benar-benar diterima", `status=${fulfilled.status}`);

  // 2. If-Match basi tetap ditolak 412
  const created2 = await call(student, "/v1/orders", { method: "POST",
    headers: { "Idempotency-Key": uuid() },
    body: JSON.stringify({ customerId: "cus_studentA", serviceType: "dry_clean", weightKg: 1, pickupAddress: "Jl. Weak 2" }) });
  const order2 = await created2.json();
  const d2 = await call(staff, `/v1/orders/${order2.id}`);
  const tag2 = d2.headers.get("etag");
  await call(staff, `/v1/orders/${order2.id}/fulfilment`, { method: "POST", headers: { "If-Match": tag2 } });
  const stale = await call(staff, `/v1/orders/${order2.id}/fulfilment`,
    { method: "POST", headers: { "If-Match": tag2 } });
  cek(stale.status === 412, "If-Match basi tetap 412", `status=${stale.status}`);

  // 3. Tag yang benar-benar salah tetap ditolak
  const bogus = await call(staff, `/v1/orders/${order2.id}/fulfilment`,
    { method: "POST", headers: { "If-Match": '"tag-yang-tidak-pernah-ada"' } });
  cek(bogus.status === 412, "If-Match asing tetap 412", `status=${bogus.status}`);

  // 4. If-None-Match dengan tag weak -> 304
  const list = await call(staff, "/v1/orders");
  const listTag = list.headers.get("etag");
  const poll = await call(staff, "/v1/orders", { headers: { "If-None-Match": "W/" + listTag } });
  cek(poll.status === 304, "If-None-Match WEAK -> 304", `status=${poll.status}`);

  // 5. Cache-Control: no-transform terkirim
  cek((list.headers.get("cache-control") || "").includes("no-transform"),
    "Cache-Control: no-transform dikirim", list.headers.get("cache-control"));

  await harness.stopChild(svc); await issuer.close(); harness.removeDatabase(dbFile);

  console.log("=== RINGKASAN ===");
  for (const r of out) console.log("  " + r);
  const fail = out.filter(r => r.startsWith("FAIL")).length;
  console.log(`\n  ${out.length - fail} lulus, ${fail} gagal`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error("GAGAL:", e.message); process.exitCode = 1; });
