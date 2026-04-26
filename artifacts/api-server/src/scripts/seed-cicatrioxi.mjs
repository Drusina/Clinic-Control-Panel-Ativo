#!/usr/bin/env node
/**
 * Seed: CICATRIOXI test clinic + LGPD termos.
 *
 * Inserts a single fixed-id clinic ("CICATRIOXI — Clínica de Cicatrização e
 * Tratamentos") used as the canonical fixture for the LGPD electronic-signature
 * end-to-end flow. Idempotent: re-running leaves the existing row in place.
 *
 * Usage:
 *   node artifacts/api-server/src/scripts/seed-cicatrioxi.mjs
 *
 * Requires DATABASE_URL.
 */

import pg from "pg";

const CLINIC_ID = "79a64b14-13ab-486a-a78f-5247a6fab899";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rowCount } = await pool.query(
    `INSERT INTO clinics
       (id, nome, fantasia, cnpj, endereco, cep, responsavel, plano, status, etapa, progresso, created_at, updated_at)
     VALUES
       ($1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        'pro',
        'trial',
        3,
        20,
        NOW(),
        NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      CLINIC_ID,
      "CICATRIOXI - Clínica de Cicatrização e Tratamentos",
      "CICATRIOXI",
      "62.471.913/0001-08",
      "Rua das Tulipas, 450 - Centro - Sorriso/MT",
      "78.890-000",
      "Dr. Edgar Stroppa Lamas",
    ],
  );

  if (rowCount === 0) {
    console.log(`✓ CICATRIOXI clinic already exists (id ${CLINIC_ID})`);
  } else {
    console.log(`✓ CICATRIOXI clinic seeded (id ${CLINIC_ID})`);
  }

  // Note: LGPD termos and the 6 default templates are auto-seeded on first
  // GET /api/clinics/:id/lgpd-termos and GET /api/admin/lgpd-templates.
  // Contratada defaults are bootstrapped in artifacts/api-server/src/index.ts
  // via bootstrapContratadaDefaults() on every server start.
  console.log("ℹ LGPD termos auto-seed on first read of the LGPD tab.");
} finally {
  await pool.end();
}
