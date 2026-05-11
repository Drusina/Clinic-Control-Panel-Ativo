import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ClipboardList, BarChart3, GitCompare, CheckSquare, Square } from "lucide-react";
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
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [selectedClinic, setSelectedClinic] = useState<string>("");
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompareSelected] = useState<string[]>([]);

  const { data: user } = useCurrentRole();
  const isSuperAdmin = user?.role === "super_admin";

  // Source of truth for both roles. The hook itself fans out to the
  // correct endpoint (`/api/clinics` for super_admin, `/api/me/clinics`
  // for team_member) and returns a normalized list — see
  // `hooks/use-clinics-for-current-user.ts`.
  const { clinics: clinicList, isLoading: loadingClinics } = useClinicsForCurrentUser({ pageSize: 200 });
  const clinics: { data: Clinic[] } | undefined = clinicList.length || !loadingClinics
    ? { data: clinicList.map((c) => ({ id: c.id, nome: c.nome, fantasia: c.fantasia ?? undefined })) }
    : undefined;

  // Atalho UX: se o gestor já tem uma clínica ativa no header (ou só uma
  // clínica vinculada), pré-seleciona para evitar dois cliques.
  useEffect(() => {
    if (isSuperAdmin || selectedClinic || !clinics?.data?.length) return;
    const active = getActiveClinicId();
    const match = (active && clinics.data.find((c) => c.id === active)) || (clinics.data.length === 1 ? clinics.data[0] : undefined);
    if (match) setSelectedClinic(match.id);
  }, [isSuperAdmin, selectedClinic, clinics]);

  const { data: diagnostics, isLoading: loadingDiags } = useQuery<Diagnostic[]>({
    queryKey: ["diagnostics", selectedClinic],
    queryFn: () => apiFetch(`/clinics/${selectedClinic}/diagnostics`),
    enabled: !!selectedClinic,
  });

  const createMut = useMutation({
    mutationFn: () => apiFetch(`/clinics/${selectedClinic}/diagnostics`, { method: "POST" }),
    onSuccess: (diag: Diagnostic) => {
      qc.invalidateQueries({ queryKey: ["diagnostics", selectedClinic] });
      navigate(`/diagnostico/${diag.id}`);
    },
  });

  const activeClinic = clinics?.data.find((c) => c.id === selectedClinic);

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
      navigate(`/diagnostico/comparar?a=${compareSelected[0]}&b=${compareSelected[1]}`);
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Selecionar Clínica</CardTitle>
          <CardDescription>Escolha a clínica para iniciar ou continuar um diagnóstico</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingClinics ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando clínicas...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {clinics?.data.map((clinic) => (
                <button
                  key={clinic.id}
                  onClick={() => handleClinicSelect(clinic.id)}
                  className={`text-left px-3 py-2 rounded-md border transition-colors text-sm ${
                    selectedClinic === clinic.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent border-border"
                  }`}
                >
                  <div className="font-medium">{clinic.fantasia || clinic.nome}</div>
                  <div className={`text-xs ${selectedClinic === clinic.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {clinic.nome}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
                                onClick={() => navigate(`/diagnostico/${d.id}`)}
                              >
                                Continuar
                              </Button>
                            )}
                            {d.scoreGlobal != null && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`/diagnostico/${d.id}/resultado`)}
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
