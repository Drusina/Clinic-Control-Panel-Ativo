import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Edit2, Trash2, Building2 } from "lucide-react";
import { useSocios, useCreateSocio, useUpdateSocio, useDeleteSocio, type SocioData } from "@/hooks/use-kickoff-api";

interface Props { clinicId: string }

const EMPTY: Omit<SocioData, "id" | "clinicId" | "createdAt" | "updatedAt"> = {
  nome: "", cpf: null, percentual: null, cargo: null, decisor: false,
  email: null, whatsapp: null, origem: "manual", qualificacao: null, qualId: null, dataEntrada: null,
};

export default function QuadroSocietarioTab({ clinicId }: Props) {
  const { toast } = useToast();
  const { data: socios = [], isLoading } = useSocios(clinicId);
  const createSocio = useCreateSocio(clinicId);
  const updateSocio = useUpdateSocio(clinicId);
  const deleteSocio = useDeleteSocio(clinicId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SocioData | null>(null);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  }

  function openEdit(s: SocioData) {
    setEditing(s);
    setForm({
      nome: s.nome, cpf: s.cpf, percentual: s.percentual, cargo: s.cargo,
      decisor: s.decisor, email: s.email, whatsapp: s.whatsapp, origem: s.origem,
      qualificacao: s.qualificacao, qualId: s.qualId, dataEntrada: s.dataEntrada,
    });
    setOpen(true);
  }

  function save() {
    const data = {
      ...form,
      percentual: form.percentual != null ? Number(form.percentual) : null,
    };
    if (editing) {
      updateSocio.mutate(
        { id: editing.id, ...data },
        {
          onSuccess: () => { toast({ title: "Sócio atualizado" }); setOpen(false); },
          onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
        }
      );
    } else {
      createSocio.mutate(data, {
        onSuccess: () => { toast({ title: "Sócio adicionado" }); setOpen(false); },
        onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
      });
    }
  }

  function remove(id: string) {
    deleteSocio.mutate(id, {
      onSuccess: () => toast({ title: "Sócio removido" }),
      onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
    });
  }

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Quadro Societário (QSA)</CardTitle>
            <CardDescription>Sócios e participações. Dados da BrasilAPI pré-populados.</CardDescription>
          </div>
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Novo sócio
          </Button>
        </CardHeader>
        <CardContent>
          {socios.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Nenhum sócio cadastrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 pr-4">Nome</th>
                    <th className="text-left py-3 pr-4">CPF</th>
                    <th className="text-left py-3 pr-4">%</th>
                    <th className="text-left py-3 pr-4">Cargo</th>
                    <th className="text-left py-3 pr-4">Decisor</th>
                    <th className="text-left py-3 pr-4">E-mail</th>
                    <th className="text-left py-3 pr-4">Origem</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {socios.map(s => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{s.nome}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{s.cpf ?? "—"}</td>
                      <td className="py-2 pr-4">{s.percentual != null ? `${s.percentual}%` : "—"}</td>
                      <td className="py-2 pr-4">{s.cargo ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {s.decisor ? <Badge variant="default" className="text-xs">Sim</Badge> : <Badge variant="outline" className="text-xs">Não</Badge>}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{s.email ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={s.origem === "brasilapi" ? "secondary" : "outline"} className="text-xs capitalize">
                          {s.origem}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(s)} className="p-1 text-muted-foreground hover:text-foreground">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => remove(s.id)} className="p-1 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Sócio" : "Novo Sócio"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {[
              { label: "Nome*", key: "nome" as const, full: true },
              { label: "CPF", key: "cpf" as const },
              { label: "% Participação", key: "percentual" as const, type: "number" },
              { label: "Cargo", key: "cargo" as const },
              { label: "E-mail", key: "email" as const },
              { label: "WhatsApp", key: "whatsapp" as const },
            ].map(({ label, key, type, full }) => (
              <div key={key} className={`space-y-1 ${full ? "col-span-2" : ""}`}>
                <Label className="text-xs">{label}</Label>
                <Input
                  type={type || "text"}
                  value={(form[key] ?? "") as string}
                  onChange={e => setForm({ ...form, [key]: e.target.value || null })}
                />
              </div>
            ))}
            <div className="col-span-2 flex items-center gap-3">
              <Switch
                checked={form.decisor}
                onCheckedChange={v => setForm({ ...form, decisor: v })}
                id="decisor"
              />
              <Label htmlFor="decisor">Decisor</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={createSocio.isPending || updateSocio.isPending}>
              {(createSocio.isPending || updateSocio.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
