import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Edit2, Users } from "lucide-react";
import { useTeamMembers, useCreateTeamMember, useUpdateTeamMember, type TeamMemberData } from "@/hooks/use-kickoff-api";

interface Props { clinicId: string }

const AREAS = ["Administrativo", "Clínico", "Atendimento", "Marketing", "TI", "Outro"];
const VINCULOS = ["CLT", "PJ", "Socio", "Terceirizado"];

const EMPTY: Partial<TeamMemberData> = {
  nome: "", funcao: "", area: "", vinculo: "", email: "", whatsapp: "", temAcessoPlataforma: false,
};

export default function EquipeInternaTab({ clinicId }: Props) {
  const { toast } = useToast();
  const { data: members = [], isLoading } = useTeamMembers(clinicId);
  const createMember = useCreateTeamMember(clinicId);
  const updateMember = useUpdateTeamMember(clinicId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMemberData | null>(null);
  const [form, setForm] = useState<Partial<TeamMemberData>>({ ...EMPTY });

  const grouped = AREAS.reduce((acc, area) => {
    acc[area] = members.filter(m => m.area === area);
    return acc;
  }, {} as Record<string, TeamMemberData[]>);

  function openNew() { setEditing(null); setForm({ ...EMPTY }); setOpen(true); }
  function openEdit(m: TeamMemberData) {
    setEditing(m);
    setForm({ nome: m.nome, funcao: m.funcao, area: m.area, vinculo: m.vinculo, email: m.email, whatsapp: m.whatsapp, temAcessoPlataforma: m.temAcessoPlataforma });
    setOpen(true);
  }

  function toggleAcesso(m: TeamMemberData) {
    updateMember.mutate(
      { id: m.id, temAcessoPlataforma: !m.temAcessoPlataforma },
      {
        onSuccess: () => toast({ title: m.temAcessoPlataforma ? "Acesso revogado" : "Convite enviado" }),
        onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
      }
    );
  }

  function save() {
    const data = { ...form, clinicId };
    if (editing) {
      updateMember.mutate(
        { id: editing.id, ...form },
        {
          onSuccess: () => { toast({ title: "Membro atualizado" }); setOpen(false); },
          onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
        }
      );
    } else {
      createMember.mutate(data, {
        onSuccess: () => { toast({ title: "Membro adicionado" }); setOpen(false); },
        onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
      });
    }
  }

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Novo membro
        </Button>
      </div>

      {AREAS.map(area => {
        const areaMembers = grouped[area];
        if (!areaMembers || areaMembers.length === 0) return null;
        return (
          <Card key={area}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                {area}
                <Badge variant="secondary" className="text-xs">{areaMembers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4">Nome</th>
                      <th className="text-left py-2 pr-4">Função</th>
                      <th className="text-left py-2 pr-4">Vínculo</th>
                      <th className="text-left py-2 pr-4">E-mail</th>
                      <th className="text-left py-2 pr-4">Convidar</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {areaMembers.map(m => (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{m.nome}</td>
                        <td className="py-2 pr-4">{m.funcao ?? "—"}</td>
                        <td className="py-2 pr-4">
                          {m.vinculo && <Badge variant="outline" className="text-xs">{m.vinculo}</Badge>}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs">{m.email ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <Switch
                            checked={m.temAcessoPlataforma}
                            onCheckedChange={() => toggleAcesso(m)}
                            disabled={updateMember.isPending}
                          />
                        </td>
                        <td className="py-2">
                          <button onClick={() => openEdit(m)} className="p-1 text-muted-foreground hover:text-foreground">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {members.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Nenhum membro cadastrado</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Membro" : "Novo Membro"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Nome*</Label>
              <Input value={form.nome ?? ""} onChange={e => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Função</Label>
              <Input value={form.funcao ?? ""} onChange={e => setForm({ ...form, funcao: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Área</Label>
              <Select value={form.area ?? ""} onValueChange={v => setForm({ ...form, area: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vínculo</Label>
              <Select value={form.vinculo ?? ""} onValueChange={v => setForm({ ...form, vinculo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {VINCULOS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">E-mail</Label>
              <Input value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp</Label>
              <Input value={form.whatsapp ?? ""} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <Switch
                checked={form.temAcessoPlataforma ?? false}
                onCheckedChange={v => setForm({ ...form, temAcessoPlataforma: v })}
                id="acesso"
              />
              <Label htmlFor="acesso">Convidar para a plataforma</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={createMember.isPending || updateMember.isPending}>
              {(createMember.isPending || updateMember.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
