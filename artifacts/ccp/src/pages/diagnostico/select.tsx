import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ClipboardList, BarChart3, GitCompare, CheckSquare, Square, Search, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getStoredToken, useCurrentRole, getActiveClinicId } from "@/hooks/use-auth";
import { useClinicsForCurrentUser } from "@/hooks/use-clinics-for-current-user";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

interface Clinic {
  id: string;
  nome: string;
  fantasia?: string | null;
}

interface Diagnostic {
  id: string;
  clinicId: string;
  versao: number;
  status: string;
  scoreGlobal?: number;
  iniciadoEm: string;
  concluidoEm?: string;
}

export default function DiagnosticoSelectPage() {
  const [location, navigate] = useLocation();
  const qc = useQueryClient();
  const [selectedClinic, setSelectedClinic] = useState<string>("");
  const [clinicSearch, setClinicSearch] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompareSelected] = useState<string[]>([]);

  const { data: user } = useCurrentRole();
  const isSuperAdmin = user?.role === "super_admin";
  const isTeamMember = user?.role === "team_member";
  // Navigation is portal-aware: a manager inside `/portal/...` stays in the
  // portal namespace, while super_admin keeps the legacy `/diagnostico/...`
  // routes. This avoids a redirect bounce through `TeamMemberToPortal`.
  const isPortal = location.startsWith("/portal");
  const diagBase = isPortal ? "/portal/diagnostico" : "/diagnostico";

  // Source of truth for both roles. The hook itself fans out to the
  // correct endpoint (`/api/clinics` for super_admin, `/api/me/clinics`
  // for team_member) and returns a normalized list — see
  // `hooks/use-clinics-for-current-user.ts`.
  const { clinics: clinicList, isLoading: loadingClinics } = useClinicsForCurrentUser({ pageSize: 200 });
  const clinics: { data: Clinic[] } | undefined = clinicList.length || !loadingClinics
    ? { data: clinicList.map((c) => ({ id: c.id, nome: c.nome, fantasia: c.fantasia ?? undefined })) }
    : undefined;

  // Clinic-first scoping for managers: the active clinic is chosen once at
  // `/me/clinicas` and every module stays scoped to it — no clinic selector
  // is rendered in the portal. We pre-select the active clinic (or the only
  // clinic). If the manager has 2+ clinics and none is active, we bounce
  // back to the chooser so the wrong clinic's diagnostics are never shown.
  useEffect(() => {
    if (!isTeamMember) return;
    if (loadingClinics || !clinics?.data) return;
    if (clinics.data.length === 0) return; // ClinicAccessGuard handles this
    const active = getActiveClinicId();
    const match =
      (active && clinics.data.find((c) => c.id === active)) ||
      (clinics.data.length === 1 ? clinics.data[0] : undefined);
    if (match) {
      if (!selectedClinic) setSelectedClinic(match.id);
      return;
    }
    navigate("/me/clinicas", { replace: true });
  }, [isTeamMember, loadingClinics, clinics, selectedClinic, navigate]);

  const { data: diagnostics, isLoading: loadingDiags } = useQuery<Diagnostic[]>({
    queryKey: ["diagnostics", selectedClinic],
    queryFn: () => apiFetch(`/clinics/${selectedClinic}/diagnostics`),
    enabled: !!selectedClinic,
  });

  const createMut = useMutation({
    mutationFn: () => apiFetch(`/clinics/${selectedClinic}/diagnostics`, { method: "POST" }),
    onSuccess: (diag: Diagnostic) => {
      qc.invalidateQueries({ queryKey: ["diagnostics", selectedClinic] });
      navigate(`${diagBase}/${diag.id}`);
    },
  });

  const activeClinic = clinics?.data.find((c) => c.id === selectedClinic);

  const filteredClinics = (clinics?.data ?? []).filter((c) => {
    const term = clinicSearch.toLowerCase();
    return (
      c.nome.toLowerCase().includes(term) ||
      (c.fantasia ?? "").toLowerCase().includes(term)
    );
  });

  const canCompare = (diagnostics?.length ?? 0) >= 2;

  function toggleCompareMode() {
    setCompareMode((v) => !v);
    setCompareSelected([]);
  }

  function toggleCompareItem(id: string) {
    setCompareSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  function goToCompare() {
    if (compareSelected.length === 2) {
      navigate(`${diagBase}/comparar?a=${compareSelected[0]}&b=${compareSelected[1]}`);
    }
  }

  function handleClinicSelect(id: string) {
    setSelectedClinic(id);
    setCompareMode(false);
    setCompareSelected([]);
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Diagnóstico 360°</h1>
        <p className="text-muted-foreground mt-1">
          Avaliação completa da clínica em 8 pilares com 150 questões
        </p>
      </div>

      {/* Clinic selector — super_admin only. Managers are already scoped to
          their active clinic (chosen at /me/clinicas) and never see a list of
          other clinics here. */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selecionar Clínica</CardTitle>
            <CardDescription>Escolha a clínica para iniciar ou continuar um diagnóstico</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingClinics ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando clínicas...
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={clinicSearch}
                    onChange={(e) => setClinicSearch(e.target.value)}
                    placeholder="Buscar clínica..."
                    className="pl-9"
                  />
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {filteredClinics.map((clinic) => {
                    const selected = selectedClinic === clinic.id;
                    return (
                      <button
                        key={clinic.id}
                        onClick={() => handleClinicSelect(clinic.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center justify-between ${
                          selected
                            ? "bg-primary/5 border-primary"
                            : "hover:bg-muted/50 border-border"
                        }`}
                      >
                        <div>
                          <div className="font-medium text-sm">{clinic.fantasia || clinic.nome}</div>
                          <div className="text-xs text-muted-foreground">{clinic.nome}</div>
                        </div>
                        {selected ? (
                          <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </button>
                    );
                  })}
                  {filteredClinics.length === 0 && (
                    <p className="text-center text-muted-foreground py-6 text-sm">
                      Nenhuma clínica encontrada.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {selectedClinic && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
              <span>Diagnósticos de {activeClinic?.fantasia || activeClinic?.nome}</span>
              <div className="flex items-center gap-2">
                {canCompare && (
                  <Button
                    size="sm"
                    variant={compareMode ? "secondary" : "outline"}
                    onClick={toggleCompareMode}
                    className="gap-1.5"
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    {compareMode ? "Cancelar" : "Comparar"}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => createMut.mutate()}
                  disabled={createMut.isPending || compareMode}
                >
                  {createMut.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Novo Diagnóstico
                </Button>
              </div>
            </CardTitle>
            {compareMode && (
              <p className="text-xs text-muted-foreground mt-1">
                Selecione dois diagnósticos para comparar (apenas diagnósticos com score são elegíveis).
              </p>
            )}
          </CardHeader>
          <CardContent>
            {loadingDiags ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando diagnósticos...
              </div>
            ) : !diagnostics?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum diagnóstico iniciado para esta clínica.</p>
                <p className="text-xs mt-1">Clique em "Novo Diagnóstico" para começar.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {diagnostics.map((d) => {
                  const isEligible = compareMode && d.scoreGlobal != null;
                  const isChecked = compareSelected.includes(d.id);

                  return (
                    <div
                      key={d.id}
                      className={`flex items-center justify-between p-3 rounded-md border transition-colors ${
                        compareMode
                          ? isEligible
                            ? isChecked
                              ? "bg-primary/10 border-primary cursor-pointer"
                              : "hover:bg-accent border-border cursor-pointer"
                            : "opacity-40 border-border"
                          : "hover:bg-accent border-border"
                      }`}
                      onClick={isEligible ? () => toggleCompareItem(d.id) : undefined}
                    >
                      {compareMode && (
                        <div className="mr-3 shrink-0">
                          {isEligible ? (
                            isChecked ? (
                              <CheckSquare className="h-4 w-4 text-primary" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground" />
                            )
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground/30" />
                          )}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-sm">Versão {d.versao}</div>
                        <div className="text-xs text-muted-foreground">
                          Iniciado em {new Date(d.iniciadoEm).toLocaleDateString("pt-BR")}
                          {d.concluidoEm && ` · Concluído em ${new Date(d.concluidoEm).toLocaleDateString("pt-BR")}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.scoreGlobal != null && (
                          <span className="text-sm font-semibold text-primary">
                            {d.scoreGlobal.toFixed(1)}/5
                          </span>
                        )}
                        <Badge
                          variant={
                            d.status === "concluido"
                              ? "default"
                              : d.status === "em_andamento"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {d.status === "concluido"
                            ? "Concluído"
                            : d.status === "em_andamento"
                            ? "Em andamento"
                            : d.status}
                        </Badge>
                        {!compareMode && (
                          <div className="flex gap-1">
                            {d.status !== "concluido" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`${diagBase}/${d.id}`)}
                              >
                                Continuar
                              </Button>
                            )}
                            {d.scoreGlobal != null && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`${diagBase}/${d.id}/resultado`)}
                              >
                                <BarChart3 className="h-3.5 w-3.5 mr-1" />
                                Resultado
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {compareMode && (
                  <div className="flex items-center justify-between pt-2 border-t mt-1">
                    <span className="text-sm text-muted-foreground">
                      {compareSelected.length}/2 selecionados
                    </span>
                    <Button
                      size="sm"
                      disabled={compareSelected.length !== 2}
                      onClick={goToCompare}
                      className="gap-1.5"
                    >
                      <GitCompare className="h-3.5 w-3.5" />
                      Ver Comparação
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
