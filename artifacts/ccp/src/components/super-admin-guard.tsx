import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import { useCurrentRole } from "@/hooks/use-auth";

export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useCurrentRole();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (data?.role === "team_member") {
    return <Redirect to="/portal" />;
  }

  if (data?.role !== "super_admin") {
    return <Redirect to="/entrar" />;
  }

  return <>{children}</>;
}
