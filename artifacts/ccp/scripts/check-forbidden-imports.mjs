#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import { readdirSync, statSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");

/**
 * Guard rails enforced on the CCP portal source tree.
 *
 * Each rule fails the build when an import that the team has explicitly
 * banned outside of a known exception list shows up in the codebase.
 * The most important one today is `useListClinics`: it is the Orval
 * hook that hits `GET /api/clinics`, a super-admin-only endpoint, and
 * any "selecionar clínica" screen reachable by a `team_member` MUST
 * use the shared `useClinicsForCurrentUser` hook instead. See
 * `src/hooks/use-clinics-for-current-user.ts` and the auth section of
 * `replit.md` for the full story (regression history: tasks #194/#195).
 */
const RULES = [
  {
    symbol: "useListClinics",
    // Match only real code references (imports or call sites), not the
    // banned-symbol name appearing inside JSDoc / comments / strings that
    // explain the rule. We look for either an `import` statement that
    // mentions the symbol or a direct `useListClinics(` call site.
    pattern: /(^|\n)\s*import[\s\S]*?\buseListClinics\b[\s\S]*?from\s+['"][^'"]+['"]|\buseListClinics\s*\(/,
    allow: [
      // The clinics admin index is the single legitimate caller; it is
      // already wrapped in `SuperAdminGuard`.
      "src/pages/clinics/index.tsx",
      // The platform Painel (dashboard) is super-admin only — it is mounted
      // under `SuperAdminGuard` and renders the clinic-health overview grid.
      "src/pages/dashboard.tsx",
    ],
    message:
      "useListClinics targets the super-admin-only `GET /api/clinics` endpoint. " +
      "For any screen that a team_member can reach use `useClinicsForCurrentUser` " +
      "from `@/hooks/use-clinics-for-current-user` instead. See replit.md (auth section).",
  },
];

const IGNORED_DIRS = new Set(["node_modules", "dist", ".turbo", ".vite"]);
const SCANNED_EXT = /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (IGNORED_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (SCANNED_EXT.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const text = readFileSync(file, "utf8");
  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    if (rule.allow.includes(rel)) continue;
    violations.push({ file: rel, rule });
  }
}

if (violations.length === 0) {
  process.exit(0);
}

console.error("\n✖ Forbidden imports detected in artifacts/ccp:\n");
for (const { file, rule } of violations) {
  console.error(`  • ${file}`);
  console.error(`      uses ${rule.symbol} but is not in the allow-list.`);
  console.error(`      ${rule.message}\n`);
}
process.exit(1);
