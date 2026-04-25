import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, X, Download, GripVertical, Trash2 } from "lucide-react";
import { useKickoff, useUpsertKickoffFull, type KickoffProximoPasso } from "@/hooks/use-kickoff-api";
import { pdf } from "@react-pdf/renderer";
import { AtaPdfDocument } from "./ata-pdf";

interface Props { clinicId: string; clinicName?: string }

export default function AtaTab({ clinicId, clinicName = "Clínica" }: Props) {
  const { toast } = useToast();
  const { data: kickoff, isLoading } = useKickoff(clinicId);
  const upsert = useUpsertKickoffFull(clinicId);

  const [dataRealizacao, setDataRealizacao] = useState("");
  const [modalidade, setModalidade] = useState<string>("remoto");
  const [duracaoMinutos, setDuracaoMinutos] = useState<number>(60);
  const [facilitador, setFacilitador] = useState("");
  const [status, setStatus] = useState("rascunho");
  const [participantes, setParticipantes] = useState<string[]>([]);
  const [novoParticipante, setNovoParticipante] = useState("");
  const [pauta, setPauta] = useState<string[]>([]);
  const [novoPauta, setNovoPauta] = useState("");
  const [proximosPassos, setProximosPassos] = useState<KickoffProximoPasso[]>([]);
  const [novoPassoAcao, setNovoPassoAcao] = useState("");
  const [novoPassoResp, setNovoPassoResp] = useState("");
  const [novoPassoPrazo, setNovoPassoPrazo] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (kickoff && !initialized) {
    setDataRealizacao(kickoff.dataRealizacao ?? "");
    setModalidade(kickoff.modalidade ?? "remoto");
    setDuracaoMinutos(kickoff.duracaoMinutos ?? 60);
    setFacilitador(kickoff.facilitador ?? "");
    setStatus(kickoff.status);
    setParticipantes(kickoff.participantes ?? []);
    setPauta(kickoff.pauta ?? []);
    setProximosPassos(kickoff.proximosPassos ?? []);
    setInitialized(true);
  }

  function addParticipante() {
    if (!novoParticipante.trim()) return;
    setParticipantes([...participantes, novoParticipante.trim()]);
    setNovoParticipante("");
  }

  function addPauta() {
    if (!novoPauta.trim()) return;
    setPauta([...pauta, novoPauta.trim()]);
    setNovoPauta("");
  }

  function addPasso() {
    if (!novoPassoAcao.trim()) return;
    setProximosPassos([...proximosPassos, {
      acao: novoPassoAcao.trim(),
      responsavel: novoPassoResp.trim() || "—",
      prazo: novoPassoPrazo || "—",
    }]);
    setNovoPassoAcao(""); setNovoPassoResp(""); setNovoPassoPrazo("");
  }

  function save() {
    upsert.mutate(
      { dataRealizacao, modalidade, duracaoMinutos, facilitador, status, participantes, pauta, proximosPassos },
      {
        onSuccess: () => toast({ title: "Ata salva com sucesso" }),
        onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
      }
    );
  }

  async function exportPDF() {
    try {
      const document = (
        <AtaPdfDocument
          clinicName={clinicName}
          date={dataRealizacao}
          modalidade={modalidade}
          duracao={duracaoMinutos}
          facilitador={facilitador}
          status={status}
          participantes={participantes}
          pauta={pauta}
          proximosPassos={proximosPassos}
        />
      );
      const blob = await pdf(document).toBlob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `ata-kickoff-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao gerar PDF", description: (e as Error).message });
    }
  }

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Detalhes da Reunião</CardTitle>
          <CardDescription>Informações gerais do kick-off</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data da Reunião</Label>
              <Input type="date" value={dataRealizacao} onChange={e => setDataRealizacao(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Duração (minutos)</Label>
              <Input type="number" value={duracaoMinutos} onChange={e => setDuracaoMinutos(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Modalidade</Label>
              <Select value={modalidade} onValueChange={setModalidade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="presencial">Presencial</SelectItem>
                  <SelectItem value="remoto">Remoto</SelectItem>
                  <SelectItem value="hibrido">Híbrido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Facilitador</Label>
              <Input value={facilitador} onChange={e => setFacilitador(e.target.value)} placeholder="Nome do consultor" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="realizado">Realizado</SelectItem>
                  <SelectItem value="validado">Validado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Participantes</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {participantes.map((p, i) => (
              <Badge key={i} variant="secondary" className="gap-1 text-sm px-3 py-1">
                {p}
                <button onClick={() => setParticipantes(participantes.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={novoParticipante}
              onChange={e => setNovoParticipante(e.target.value)}
              placeholder="Nome do participante (cargo)"
              onKeyDown={e => e.key === "Enter" && addParticipante()}
            />
            <Button variant="outline" onClick={addParticipante}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pauta</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 mb-4">
            {pauta.map((item, i) => (
              <div
                key={i}
                draggable
                onDragStart={e => { e.dataTransfer.setData("pauta-index", String(i)); }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("pauta-index"));
                  if (from === i) return;
                  const next = [...pauta];
                  const [moved] = next.splice(from, 1);
                  next.splice(i, 0, moved);
                  setPauta(next);
                }}
                className="flex items-center gap-2 p-2 rounded border bg-muted/30 cursor-grab active:cursor-grabbing select-none"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1">{i + 1}. {item}</span>
                <button onClick={() => setPauta(pauta.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={novoPauta}
              onChange={e => setNovoPauta(e.target.value)}
              placeholder="Adicionar item de pauta"
              onKeyDown={e => e.key === "Enter" && addPauta()}
            />
            <Button variant="outline" onClick={addPauta}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Próximos Passos</CardTitle></CardHeader>
        <CardContent>
          {proximosPassos.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="w-6"></th>
                    <th className="text-left py-2 pr-4">Ação</th>
                    <th className="text-left py-2 pr-4">Responsável</th>
                    <th className="text-left py-2 pr-4">Prazo</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {proximosPassos.map((p, i) => (
                    <tr
                      key={i}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData("passo-index", String(i)); }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        const from = Number(e.dataTransfer.getData("passo-index"));
                        if (from === i) return;
                        const next = [...proximosPassos];
                        const [moved] = next.splice(from, 1);
                        next.splice(i, 0, moved);
                        setProximosPassos(next);
                      }}
                      className="border-b last:border-0 cursor-grab active:cursor-grabbing select-none"
                    >
                      <td className="py-2 pl-1"><GripVertical className="h-4 w-4 text-muted-foreground" /></td>
                      <td className="py-2 pr-4">{p.acao}</td>
                      <td className="py-2 pr-4">{p.responsavel}</td>
                      <td className="py-2 pr-4">{p.prazo}</td>
                      <td>
                        <button onClick={() => setProximosPassos(proximosPassos.filter((_, j) => j !== i))}>
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
            <Input value={novoPassoAcao} onChange={e => setNovoPassoAcao(e.target.value)} placeholder="Ação" />
            <Input value={novoPassoResp} onChange={e => setNovoPassoResp(e.target.value)} placeholder="Responsável" />
            <Input type="date" value={novoPassoPrazo} onChange={e => setNovoPassoPrazo(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={addPasso}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar passo
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={exportPDF}>
          <Download className="h-4 w-4 mr-2" /> Exportar ata em PDF
        </Button>
        <Button onClick={save} disabled={upsert.isPending}>
          {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Ata
        </Button>
      </div>
    </div>
  );
}
