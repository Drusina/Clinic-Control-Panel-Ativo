#!/usr/bin/env node
import { createHmac } from "crypto";

const BASE_URL = process.env.API_URL ?? "http://localhost:8080";
const SECRET = process.env.SUPER_ADMIN_SECRET;
const CLINIC_ID = "a899d603-799e-4792-a0cd-732187afa9f9";

let passed = 0;
let failed = 0;

function assert(label, condition, actual) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label} (got: ${JSON.stringify(actual)})`);
    failed++;
  }
}

function b64url(str) { return Buffer.from(str).toString("base64url"); }

function makeToken() {
  if (!SECRET) throw new Error("SUPER_ADMIN_SECRET is not set");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({ role: "super_admin", iat: now, exp: now + 3600 }),
  );
  const sig = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

const TOKEN = makeToken();

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  console.log(`\n--- Testing docs-constitutivos files API against ${BASE_URL} ---\n`);

  // 1. List docs - should include files array
  const list = await api(`/api/clinics/${CLINIC_ID}/docs-constitutivos`);
  assert("GET docs returns 200", list.status === 200, list.status);
  assert("GET docs returns array", Array.isArray(list.data), typeof list.data);

  const contratoSocial = list.data.find((d) => d.nome === "Contrato Social");
  const cartaoCnpj = list.data.find((d) => d.nome === "Cartão CNPJ");
  const alvara = list.data.find((d) => d.nome === "Alvará");

  assert("Contrato Social present", !!contratoSocial, contratoSocial);
  assert(
    "Contrato Social has files array with 1 file (migrated)",
    contratoSocial?.files?.length === 1,
    contratoSocial?.files,
  );
  assert(
    "Cartão CNPJ has files array with 1 file (migrated)",
    cartaoCnpj?.files?.length === 1,
    cartaoCnpj?.files?.length,
  );
  assert(
    "Alvará starts with 0 files",
    alvara?.files?.length === 0,
    alvara?.files?.length,
  );
  assert(
    "Legacy storagePath is the latest file's path",
    contratoSocial?.storagePath === contratoSocial?.files?.[0]?.storagePath,
    contratoSocial?.storagePath,
  );

  // 2. Add a 2nd file to Contrato Social
  const fakePdf = Buffer.from("%PDF-1.4 fake test content").toString("base64");
  const add1 = await api(
    `/api/clinics/${CLINIC_ID}/docs-constitutivos/${contratoSocial.id}/files`,
    {
      method: "POST",
      body: JSON.stringify({
        fileName: "1a Alteracao Contratual.pdf",
        fileBase64: fakePdf,
        mimeType: "application/pdf",
      }),
    },
  );
  assert("POST 1st new file returns 201", add1.status === 201, add1.status);
  assert("New file has sequenceNumber 2", add1.data.sequenceNumber === 2, add1.data.sequenceNumber);
  const file2Id = add1.data.id;

  // 3. Add a 3rd file
  const add2 = await api(
    `/api/clinics/${CLINIC_ID}/docs-constitutivos/${contratoSocial.id}/files`,
    {
      method: "POST",
      body: JSON.stringify({
        fileName: "2a Alteracao Contratual.pdf",
        fileBase64: fakePdf,
        mimeType: "application/pdf",
      }),
    },
  );
  assert("POST 2nd new file returns 201", add2.status === 201, add2.status);
  assert("Third file has sequenceNumber 3", add2.data.sequenceNumber === 3, add2.data.sequenceNumber);
  const file3Id = add2.data.id;

  // 4. List again - should have 3 files now
  const list2 = await api(`/api/clinics/${CLINIC_ID}/docs-constitutivos`);
  const cs2 = list2.data.find((d) => d.id === contratoSocial.id);
  assert("Contrato Social now has 3 files", cs2?.files?.length === 3, cs2?.files?.length);
  assert(
    "Files are ordered by sequenceNumber asc",
    cs2?.files?.[0].sequenceNumber === 1
      && cs2?.files?.[1].sequenceNumber === 2
      && cs2?.files?.[2].sequenceNumber === 3,
    cs2?.files?.map((f) => f.sequenceNumber),
  );

  // 5. Signed URL for specific file
  const sig = await api(
    `/api/clinics/${CLINIC_ID}/docs-constitutivos/${contratoSocial.id}/files/${file2Id}/signed-url`,
  );
  assert("Signed URL returns 200", sig.status === 200, sig.status);
  assert("Signed URL has token", typeof sig.data?.url === "string" && sig.data.url.includes("sig="), sig.data);

  // 6. Delete file 2
  const del = await api(
    `/api/clinics/${CLINIC_ID}/docs-constitutivos/${contratoSocial.id}/files/${file2Id}`,
    { method: "DELETE" },
  );
  assert("DELETE file returns 200", del.status === 200, del.status);

  // 7. Delete file 3 (cleanup)
  await api(
    `/api/clinics/${CLINIC_ID}/docs-constitutivos/${contratoSocial.id}/files/${file3Id}`,
    { method: "DELETE" },
  );

  // 8. Verify back to 1 file
  const list3 = await api(`/api/clinics/${CLINIC_ID}/docs-constitutivos`);
  const cs3 = list3.data.find((d) => d.id === contratoSocial.id);
  assert("After deletes, Contrato Social has 1 file again", cs3?.files?.length === 1, cs3?.files?.length);

  // 9. Mandatory progress count
  const mandatory = list3.data.filter((d) => d.obrigatorio);
  const mandatoryWithFiles = mandatory.filter((d) => (d.files?.length ?? 0) > 0);
  assert("Mandatory total = 4", mandatory.length === 4, mandatory.length);
  assert("Mandatory with files = 2 (Contrato Social + Cartão CNPJ)", mandatoryWithFiles.length === 2, mandatoryWithFiles.length);

  // 10. Legacy /upload still works (now appends a file)
  const legacyUpload = await api(
    `/api/clinics/${CLINIC_ID}/docs-constitutivos/${contratoSocial.id}/upload`,
    {
      method: "POST",
      body: JSON.stringify({
        fileName: "via-legacy-endpoint.pdf",
        fileBase64: fakePdf,
        mimeType: "application/pdf",
      }),
    },
  );
  assert("Legacy /upload returns 200", legacyUpload.status === 200, legacyUpload.status);
  assert("Legacy /upload appended file (now 2)", legacyUpload.data.files?.length === 2, legacyUpload.data.files?.length);

  // cleanup the legacy-added file
  const legacyFileId = legacyUpload.data.files?.find((f) => f.fileName === "via-legacy-endpoint.pdf")?.id;
  if (legacyFileId) {
    await api(
      `/api/clinics/${CLINIC_ID}/docs-constitutivos/${contratoSocial.id}/files/${legacyFileId}`,
      { method: "DELETE" },
    );
  }

  console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
