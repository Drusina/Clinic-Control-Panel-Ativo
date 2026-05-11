import { useParams, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import TeamTab from "@/pages/clinics/tabs/team-tab";

export default function PortalEquipePage() {
  const params = useParams();
  const clinicId = params.clinicId as string;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link href="/portal">
          <Button variant="outline" size="icon" data-testid="btn-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipe Interna</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os membros da sua equipe.
          </p>
        </div>
      </div>
      <TeamTab clinicId={clinicId} />
    </div>
  );
}
