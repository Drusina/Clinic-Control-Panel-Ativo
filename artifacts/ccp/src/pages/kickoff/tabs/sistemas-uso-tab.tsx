import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Edit2, Trash2, Server } from "lucide-react";
import { useSistemasUso, useCreateSistemaUso, useUpdateSistemaUso, useDeleteSistemaUso, type SistemaUsoData } from "@/hooks/use-kickoff-api";

interface Props { clinicId: string }

const EMPTY: Partial<SistemaUsoData> = {
  nome: "", fornecedor: null, tipo: null, apiDisponivel: null,
  responsavelInterno: null, criticidade: null, integrado: false,
};

function apiChipColor(val: string | null | undefined) {
  if (val === "sim") return "default";
  if (val === "nao") return "destructive";
  return "secondary";
}

function criticidadeColor(val: string | null | undefined) {
  if (val === "alto") return "destructive";
  if (val === "medio") return "secondary";
  return "outline";
}

export default function SistemasUsoTab({ clinicId }: Props) {
  const { toast } = useToast();
  const { data: sistemas = [], isLoading } = useSistemasUso(clinicId);
  const create = useCreateSistemaUso(clinicId);
  const update = useUpdateSistemaUso(clinicId);
  const remove = useDeleteSistemaUso(clinicId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SistemaUsoData | null>(null);
  const [form, setForm] = useState<Partial<SistemaUsoData>>({ ...EMPTY });

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setOpen(true); }
  function openEdit(s: SistemaUsoData) {
    setEditing(s);
    setForm({ nome: s.nome, fornecedor: s.fornecedor, tipo: s.tipo, apiDisponivel: s.apiDisponivel, responsavelInterno: s.responsavelInterno, criticidade: s.criticidade, integrado: s.integrado });
    setOpen(true);
  }

  function save() {
    if (editing) {
      update.mutate(
        { id: editing.id, ...form },
        {
          onSuccess: () => { toast({ title: "Sistema atualizado" }); setOpen(false); },
          onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
        }
      );
    } else {
      create.mutate(form, {
        onSuccess: () => { toast({ title: "Sistema adicionado" }); setOpen(false); },
        onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
      });
    }
  }

  function del(id: string) {
    remove.mutate(id, {
      onSuccess: () => toast({ title: "Sistema removido" }),
      onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
    });
  }

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Sistemas em Uso</CardTitle>
            <CardDescription>Sistemas e ferramentas utilizados pela clínica</CardDescription>
          </div>
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Novo sistema
          </Button>
        </CardHeader>
        <CardContent>
          {sistemas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Server className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nenhum sistema cadastrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 pr-4">Sistema</th>
                    <th className="text-left py-3 pr-4">Fornecedor</th>
                    <th className="text-left py-3 pr-4">Tipo</th>
                    <th className="text-left py-3 pr-4">API</th>
                    <th className="text-left py-3 pr-4">Responsável</th>
                    <th className="text-left py-3 pr-4">Criticidade</th>
                    <th className="text-left py-3 pr-4">Integrado</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {sistemas.map(s => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{s.nome}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{s.fornecedor ?? "—"}</td>
                      <td className="py-2 pr-4">{s.tipo ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={apiChipColor(s.apiDisponivel)} className="text-xs capitalize">
                          {s.apiDisponivel === "a_validar" ? "A validar" : (s.apiDisponivel ?? "—")}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{s.responsavelInterno ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {s.criticidade && <Badge variant={criticidadeColor(s.criticidade)} className="text-xs capitalize">{s.criticidade}</Badge>}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={s.integrado ? "default" : "outline"} className="text-xs">{s.integrado ? "Sim" : "Não"}</Badge>
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(s)} className="p-1 text-muted-foreground hover:text-foreground"><Edit2 className="h-3.5 w-3.5" /></button>
                          <button onClick={() => del(s.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar Sistema" : "Novo Sistema"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Nome*</Label>
              <Input value={form.nome ?? ""} onChange={e => setForm({ ...form, nome: e.target.value })} />
            </div>
            {[
              { field: "fornecedor" as const, label: "Fornecedor" },
              { field: "tipo" as const, label: "Tipo (ERP, CRM, etc.)" },
              { field: "responsavelInterno" as const, label: "Responsável Interno" },
            ].map(({ field, label }) => (
              <div key={field} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input value={(form[field] ?? "") as string} onChange={e => setForm({ ...form, [field]: e.target.value || null })} />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">API Disponível</Label>
              <Select value={form.apiDisponivel ?? ""} onValueChange={v => setForm({ ...form, apiDisponivel: v || null })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                  <SelectItem value="a_validar">A validar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Criticidade</Label>
              <Select value={form.criticidade ?? ""} onValueChange={v => setForm({ ...form, criticidade: v || null })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alto">Alto</SelectItem>
                  <SelectItem value="medio">Médio</SelectItem>
                  <SelectItem value="baixo">Baixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <Switch checked={form.integrado ?? false} onCheckedChange={v => setForm({ ...form, integrado: v })} id="integrado" />
              <Label htmlFor="integrado">Integrado ao IONEX360</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={create.isPending || update.isPending}>
              {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
