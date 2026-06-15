import { useState } from "react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Builds the public URL that serves a clinic logo. Returns null when the
 * clinic has no logo so callers can render their existing fallback icon.
 *
 * The stored `logoUrl` path changes on every upload (random object id), so we
 * append its last segment as a cache-busting version — a replaced logo shows
 * immediately even though the endpoint URL is otherwise stable.
 */
export function clinicLogoSrc(
  clinicId: string,
  logoUrl: string | null | undefined,
): string | null {
  if (!logoUrl) return null;
  const version = logoUrl.split("/").pop() ?? "";
  return `${BASE}/api/clinics/${clinicId}/logo?v=${encodeURIComponent(version)}`;
}

/**
 * Renders a clinic logo with graceful fallback. When the clinic has no logo
 * (or the image fails to load) the provided `fallback` node is shown instead,
 * preserving each call site's existing generic identity (building icon, etc.).
 */
export function ClinicLogo({
  clinicId,
  logoUrl,
  name,
  className,
  fallback,
}: {
  clinicId: string;
  logoUrl: string | null | undefined;
  name?: string | null;
  className?: string;
  fallback: React.ReactNode;
}) {
  const [errored, setErrored] = useState(false);
  const src = clinicLogoSrc(clinicId, logoUrl);

  if (!src || errored) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={name ? `Logo ${name}` : "Logo da clínica"}
      className={cn("object-contain", className)}
      onError={() => setErrored(true)}
    />
  );
}
