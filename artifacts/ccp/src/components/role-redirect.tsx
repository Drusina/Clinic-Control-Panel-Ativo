import { Loader2 } from "lucide-react";
import { Redirect, useLocation } from "wouter";
import { useCurrentRole } from "@/hooks/use-auth";

/**
 * Maps a legacy authenticated path to its portal counterpart.
 * Most operational modules share their slug under `/portal/...`, so we
 * just prepend `/portal`. A few admin paths map to portal-specific URLs
 * (e.g. `/admin/clinicas/:id` → `/portal/clinica/:id`). Everything we
 * cannot map cleanly falls back to the portal home.
 */
function mapLegacyPathToPortal(location: string): string {
  if (location.startsWith("/portal")) return location;

  // 1:1 module-prefix passthroughs — these all have `/portal/<slug>` routes.
  const passthroughPrefixes = [
    "/diagnostico",
    "/delegacao",
    "/riscos",
    "/acao",
    "/processos",
    "/evidencias",
    "/documentos",
    "/relatorios",
    "/kickoff",
  ];
  for (const prefix of passthroughPrefixes) {
    if (location === prefix || location.startsWith(prefix + "/")) {
      return `/portal${location}`;
    }
  }

  if (location === "/notifications") return "/portal/notificacoes";

  // /admin/clinicas/:id (with optional /documentos suffix) → portal equivalents.
  const docsMatch = location.match(/^\/admin\/clinicas\/([^/]+)\/documentos\/?$/);
  if (docsMatch) return `/portal/documentos/${docsMatch[1]}`;
  const detailMatch = location.match(/^\/admin\/clinicas\/([^/]+)\/?$/);
  if (detailMatch) return `/portal/clinica/${detailMatch[1]}`;

  return "/portal";
}

/**
 * Wraps super-admin-or-shared routes (`/admin/*`, `/diagnostico/*`,
 * `/delegacao/*`, etc.) and defensively pushes `team_member` sessions
 * into the dedicated portal — preserving the page they were trying to
 * reach when there is a portal equivalent. This prevents stale URLs,
 * BFCache restores, and hardcoded `<Link>`s from bouncing the manager
 * back to the platform-operator UI.
 */
export function TeamMemberToPortal({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data, isLoading } = useCurrentRole();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (data?.role === "team_member") {
    return <Redirect to={mapLegacyPathToPortal(location)} />;
  }

  return <>{children}</>;
}
