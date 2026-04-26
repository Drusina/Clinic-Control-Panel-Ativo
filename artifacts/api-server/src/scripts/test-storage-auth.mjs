#!/usr/bin/env node
/**
 * Automated test: storage objects endpoint auth protection
 *
 * Verifies GET /api/storage/objects/* requires a valid super-admin JWT.
 * Runs against the locally running API server (port 8080 by default).
 *
 * Exit code 0 = all assertions passed
 * Exit code 1 = one or more assertions failed
 */

import { createHmac } from "crypto";

const BASE_URL = process.env.API_URL ?? "http://localhost:8080";
const TOKEN_SIGNING_SECRET = process.env.TOKEN_SIGNING_SECRET;
const SUPER_ADMIN_SECRET = process.env.SUPER_ADMIN_SECRET;
const TEST_PATH = "/api/storage/objects/__auth_test_nonexistent__.pdf";

let passed = 0;
let failed = 0;

function assert(label, condition, actual) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label} (got: ${actual})`);
    failed++;
  }
}

function b64url(str) {
  return Buffer.from(str).toString("base64url");
}

function makeToken(payload) {
  const signingSecret = TOKEN_SIGNING_SECRET;
  if (!signingSecret) throw new Error("TOKEN_SIGNING_SECRET is not set");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + 3600 }));
  const sig = createHmac("sha256", signingSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

async function get(url, headers = {}) {
  const res = await fetch(`${BASE_URL}${url}`, { headers });
  return res.status;
}

async function main() {
  console.log(`Testing storage auth protection against ${BASE_URL}${TEST_PATH}\n`);

  if (!SUPER_ADMIN_SECRET) {
    console.error("SUPER_ADMIN_SECRET env var is not set — cannot run auth tests");
    process.exit(1);
  }

  if (!TOKEN_SIGNING_SECRET) {
    console.error("TOKEN_SIGNING_SECRET env var is not set — cannot run auth tests");
    process.exit(1);
  }

  const noAuthStatus = await get(TEST_PATH);
  assert("No token → 401 Unauthorized", noAuthStatus === 401, noAuthStatus);

  const invalidToken = "invalid.token.value";
  const invalidStatus = await get(TEST_PATH, { Authorization: `Bearer ${invalidToken}` });
  assert("Invalid token → 401 or 403", invalidStatus === 401 || invalidStatus === 403, invalidStatus);

  const nonAdminToken = makeToken({ role: "user" });
  const nonAdminStatus = await get(TEST_PATH, { Authorization: `Bearer ${nonAdminToken}` });
  assert("Non-admin token → 403 Forbidden", nonAdminStatus === 403, nonAdminStatus);

  const adminToken = makeToken({ role: "super_admin" });
  const adminStatus = await get(TEST_PATH, { Authorization: `Bearer ${adminToken}` });
  assert(
    "Valid super-admin token → 404 (auth passes, file not found)",
    adminStatus === 404 || adminStatus === 200,
    adminStatus,
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
