import type { Request } from "express";
import { randomBytes } from "crypto";

/**
 * Shared primitives for the INTERNAL "Assinatura Eletrônica Simples"
 * (Lei 14.063/2020) flow. These are pure helpers reused by both the LGPD
 * signing routes (`routes/lgpd-signing.ts`) and the commercial document signing
 * (`lib/comercial-signing.ts` + `routes/comercial.ts`). They must stay free of
 * table-specific logic so every signing surface shares the same token entropy,
 * CPF validation and IP-derivation behavior.
 */

/** 32 URL-safe characters → ~190 bits of entropy. */
export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Human-readable verification code printed on the signed Comprovante. */
export function generateVerificationCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[buf[i] % alphabet.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Validates a Brazilian CPF (11 digits + check digits). */
export function isValidCpf(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (factor: number) => {
    let sum = 0;
    for (let i = 0; i < factor - 1; i++)
      sum += parseInt(cpf[i], 10) * (factor - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(10) === parseInt(cpf[9], 10) && calc(11) === parseInt(cpf[10], 10);
}

/** Formats an 11-digit CPF as `000.000.000-00` (returns input on bad length). */
export function formatCpf(raw: string): string {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11) return raw;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** Best-effort client IP, honoring the proxy's `x-forwarded-for` header. */
export function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff.length > 0) return xff[0].split(",")[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? "";
}
