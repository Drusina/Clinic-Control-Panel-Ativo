import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { usePerfilOperacional, useUpsertPerfilOperacional } from "@/hooks/use-kickoff-api";

interface Props { clinicId: string }

export default function PerfilOperacionalTab({ clinicId }: Props) {
  const { toast } = useToast();
  const { data: perfil, isLoading } = usePerfilOperacional(clinicId);
  const upsert = useUpsertPerfilOperacional(clinicId);

  const [faturamento, setFaturamento] = useState<number | "">(0);
  const [ticket, setTicket] = useState<number | "">(0);
  const [pacientes, setPacientes] = useState<number | "">(0);
  const [atendimentos, setAtendimentos] = useState<number | "">(0);
  const [horario, setHorario] = useState("");
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [novaEsp, setNovaEsp] = useState("");
  const [particular, setParticular] = useState<number | "">(0);
  const [convenio, setConvenio] = useState<number | "">(0);
  const [sus, setSus] = useState<number | "">(0);
  const [initialized, setInitialized] = useState(false);

  if (perfil && !initialized) {
    setFaturamento(perfil.faturamentoMensal ?? 0);
    setTicket(perfil.ticketMedio ?? 0);
    setPacientes(perfil.pacientesAtivos ?? 0);
    setAtendimentos(perfil.atendimentosMes ?? 0);
    setHorario(perfil.horarioFuncionamento ?? "");
    setEspecialidades(perfil.especialidades ?? []);
    setParticular(perfil.modeloParticular ?? 0);
    setConvenio(perfil.modeloConvenio ?? 0);
    setSus(perfil.modeloSus ?? 0);
    setInitialized(true);
  }

  function addEsp() {
    if (!novaEsp.trim()) return;
    setEspecialidades([...especialidades, novaEsp.trim()]);
    setNovaEsp("");
  }

  function save() {
    upsert.mutate(
      {
        faturamentoMensal: Number(faturamento) || null,
        ticketMedio: Number(ticket) || null,
        pacientesAtivos: Number(pacientes) || null,
        atendimentosMes: Number(atendimentos) || null,
        horarioFuncionamento: horario || null,
        especialidades,
        modeloParticular: Number(particular) || 0,
        modeloConvenio: Number(convenio) || 0,
        modeloSus: Number(sus) || 0,
      },
      {
        onSuccess: () => toast({ title: "Perfil operacional salvo" }),
        onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
      }
    );
  }

  const chartData = [
    { name: "Particular", value: Number(particular) || 0, color: "#3b82f6" },
    { name: "Convênio", value: Number(convenio) || 0, color: "#10b981" },
    { name: "SUS", value: Number(sus) || 0, color: "#f59e0b" },
  ];

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dados Financeiros e Operacionais</CardTitle>
          <CardDescription>Informações do perfil operacional da clínica</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Faturamento Mensal (R$)</Label>
              <Input type="number" value={faturamento} onChange={e => setFaturamento(e.target.value ? Number(e.target.value) : "")} />
            </div>
            <div className="space-y-2">
              <Label>Ticket Médio (R$)</Label>
              <Input type="number" value={ticket} onChange={e => setTicket(e.target.value ? Number(e.target.value) : "")} />
            </div>
            <div className="space-y-2">
              <Label>Pacientes Ativos</Label>
              <Input type="number" value={pacientes} onChange={e => setPacientes(e.target.value ? Number(e.target.value) : "")} />
            </div>
            <div className="space-y-2">
              <Label>Atendimentos/Mês</Label>
              <Input type="number" value={atendimentos} onChange={e => setAtendimentos(e.target.value ? Number(e.target.value) : "")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Horário de Funcionamento</Label>
              <Input value={horario} onChange={e => setHorario(e.target.value)} placeholder="Ex: Seg-Sex 7h-19h · Sáb 7h-12h" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Especialidades</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {especialidades.map((esp, i) => (
              <Badge key={i} variant="secondary" className="gap-1 text-sm px-3 py-1">
                {esp}
                <button onClick={() => setEspecialidades(especialidades.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={novaEsp}
              onChange={e => setNovaEsp(e.target.value)}
              placeholder="Adicionar especialidade"
              onKeyDown={e => e.key === "Enter" && addEsp()}
            />
            <Button variant="outline" onClick={addEsp}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Modelo de Atendimento (%)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              {[
                { label: "Particular (%)", value: particular, set: setParticular },
                { label: "Convênio (%)", value: convenio, set: setConvenio },
                { label: "SUS (%)", value: sus, set: setSus },
              ].map(({ label, value, set }) => (
                <div key={label} className="space-y-2">
                  <Label>{label}</Label>
                  <Input type="number" min={0} max={100} value={value} onChange={e => set(e.target.value ? Number(e.target.value) : "")} />
                </div>
              ))}
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={upsert.isPending}>
          {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Perfil
        </Button>
      </div>
    </div>
  );
}
