import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import { useCurrentRole, useMyClinics } from "@/hooks/use-auth";

interface ClinicAccessGuardProps {
  /**
   * The clinic id this route operates on. When provided, a `team_member`
   * must have this clinic id in their `/api/me/clinics` list to pass.
   * When omitted (e.g. on `/select` landing pages), the guard only
   * checks that the session is authenticated (super_admin or
   * team_member with at least one clinic).
   *
   * NOTE: do NOT pass arbitrary `:id` params (e.g. diagnostic id) here.
   * Pass only ids that resolve to a clinic. Backend handlers continue
   * to enforce access via `assertClinicAccess`.
   */
  clinicId?: string | null;
  children: React.ReactNode;
}

/**
 * Guards routes that operate on a clinic. Allows access when:
 *   - the session is a super admin (full access), OR
 *   - the session is a team_member and (a) `clinicId` is omitted, or
 *     (b) `clinicId` belongs to one of the user's clinics.
 *
 * Otherwise redirects:
 *   - no session → `/admin/login`
 *   - team_member with no access at all → `/me/clinicas`
 *   - team_member trying to reach a clinic they don't own → `/me/clinicas`
 */
export function ClinicAccessGuard({ clinicId, children }: ClinicAccessGuardProps) {
  const { data: user, isLoading: roleLoading } = useCurrentRole();
  const { data: my, isLoading: clinicsLoading } = useMyClinics();

  if (roleLoading) return <GuardSpinner />;

  if (!user || !user.role) {
    return <Redirect to="/admin/login" />;
  }

  if (user.role === "super_admin") {
    return <>{children}</>;
  }

  if (user.role !== "team_member") {
    return <Redirect to="/admin/login" />;
  }

  if (clinicsLoading) return <GuardSpinner />;

  if (!my || my.clinics.length === 0) {
    return <Redirect to="/me/clinicas" />;
  }

  if (clinicId) {
    const allowed = my.clinics.some((c) => c.id === clinicId);
    if (!allowed) {
      return <Redirect to="/me/clinicas" />;
    }
  }

  return <>{children}</>;
}

function GuardSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
