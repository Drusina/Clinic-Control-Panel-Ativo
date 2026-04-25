import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Rocket, Search, ArrowRight } from "lucide-react";
import { useListClinics } from "@workspace/api-client-react";

export default function KickoffSelectPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useListClinics({ status: "kickoff", pageSize: 100 });

  const clinics = data?.data ?? [];
  const filtered = clinics.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.cidade ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function open(clinicId: string) {
    navigate(`/kickoff/${clinicId}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Rocket className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Kick-off</h1>
          <p className="text-sm text-muted-foreground">Selecione uma clínica para iniciar ou continuar o onboarding</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar clínica por nome ou cidade…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Rocket className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="font-medium">Nenhuma clínica em fase de kick-off</p>
            <p className="text-sm mt-1">Clínicas com status "kickoff" aparecem aqui automaticamente</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(clinic => (
            <Card key={clinic.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => open(clinic.id)}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{clinic.nome}</CardTitle>
                    <CardDescription>{[clinic.cidade, clinic.uf].filter(Boolean).join(", ") || "Localização não informada"}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{clinic.status}</Badge>
                    <Button size="sm" variant="ghost">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
