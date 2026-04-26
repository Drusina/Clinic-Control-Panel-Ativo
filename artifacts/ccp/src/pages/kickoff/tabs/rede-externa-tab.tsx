import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  useParceirosExternos,
  useCreateParceiroExterno,
  useUpdateParceiroExterno,
  useDeleteParceiroExterno,
  type ParceirosExternoData,
} from "@/hooks/use-kickoff-api";

interface Props {
  clinicId: string;
}

const TIPOS_PADRAO = [
  { key: "contador", label: "Contador", icon: "🧮" },
  { key: "advogado", label: "Advogado", icon: "⚖️" },
  { key: "marketing", label: "Agência de Marketing", icon: "📣" },
  { key: "ti_externo", label: "TI Externo", icon: "💻" },
  { key: "banco", label: "Banco", icon: "🏦" },
];

const TIPOS_PADRAO_KEYS = new Set(TIPOS_PADRAO.map((t) => t.key));

function tipoLabel(tipo: string): { label: string; icon: string } {
  const padrao = TIPOS_PADRAO.find((t) => t.key === tipo);
  if (padrao) return { label: padrao.label, icon: padrao.icon };
  return { label: tipo, icon: "🤝" };
}

interface PartnerFormState {
  nomeEmpresa: string;
  responsavel: string;
  registroProfissional: string;
  telefone: string;
  email: string;
  observacoes: string;
}

const EMPTY: PartnerFormState = {
  nomeEmpresa: "",
  responsavel: "",
  registroProfissional: "",
  telefone: "",
  email: "",
  observacoes: "",
};

function fromParceiro(p: ParceirosExternoData): PartnerFormState {
  return {
    nomeEmpresa: p.nomeEmpresa ?? "",
    responsavel: p.responsavel ?? "",
    registroProfissional: p.registroProfissional ?? "",
    telefone: p.telefone ?? "",
    email: p.email ?? "",
    observacoes: p.observacoes ?? "",
  };
}

const FIELDS: { field: keyof PartnerFormState; label: string }[] = [
  { field: "nomeEmpresa", label: "Nome / Empresa" },
  { field: "responsavel", label: "Responsável" },
  { field: "registroProfissional", label: "Registro (CRC, OAB, etc.)" },
  { field: "telefone", label: "Telefone" },
  { field: "email", label: "E-mail" },
  { field: "observacoes", label: "Observações" },
];

export default function RedeExternaTab({ clinicId }: Props) {
  const { toast } = useToast();
  const { data: parceiros = [], isLoading } = useParceirosExternos(clinicId);
  const createParceiro = useCreateParceiroExterno(clinicId);
  const updateParceiro = useUpdateParceiroExterno(clinicId);
  const deleteParceiro = useDeleteParceiroExterno(clinicId);

  const [forms, setForms] = useState<Record<string, PartnerFormState>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
      </div>
    );
  }

  function getForm(p: ParceirosExternoData): PartnerFormState {
    return forms[p.id] ?? fromParceiro(p);
  }

  function setForm(id: string, base: PartnerFormState, update: Partial<PartnerFormState>) {
    setForms((prev) => ({ ...prev, [id]: { ...(prev[id] ?? base), ...update } }));
  }

  function save(p: ParceirosExternoData) {
    const form = getForm(p);
    updateParceiro.mutate(
      {
        id: p.id,
        tipo: p.tipo,
        nomeEmpresa: form.nomeEmpresa || null,
        responsavel: form.responsavel || null,
        registroProfissional: form.registroProfissional || null,
        telefone: form.telefone || null,
        email: form.email || null,
        observacoes: form.observacoes || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Membro salvo" });
          setForms((prev) => {
            const next = { ...prev };
            delete next[p.id];
            return next;
          });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Erro ao salvar",
            description: (e as Error).message,
          }),
      }
    );
  }

  function remove(id: string) {
    deleteParceiro.mutate(id, {
      onSuccess: () => {
        toast({ title: "Membro removido" });
        setConfirmDeleteId(null);
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Erro ao remover",
          description: (e as Error).message,
        }),
    });
  }

  const grouped = parceiros.reduce<Record<string, ParceirosExternoData[]>>((acc, p) => {
    (acc[p.tipo] ??= []).push(p);
    return acc;
  }, {});

  const orderedTipos = [
    ...TIPOS_PADRAO.map((t) => t.key).filter((k) => grouped[k]),
    ...Object.keys(grouped)
      .filter((k) => !TIPOS_PADRAO_KEYS.has(k))
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Membros da Rede Externa</h3>
          <p className="text-xs text-muted-foreground">
            Cadastre múltiplos parceiros por categoria. Você pode usar categorias
            personalizadas (ex.: Consultor Financeiro).
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          data-testid="btn-add-parceiro"
        >
          <Plus className="h-4 w-4 mr-1" /> Adicionar membro
        </Button>
      </div>

      {parceiros.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum membro cadastrado ainda. Clique em <strong>Adicionar membro</strong>{" "}
            para começar.
          </CardContent>
        </Card>
      )}

      {orderedTipos.map((tipo) => {
        const { label, icon } = tipoLabel(tipo);
        const list = grouped[tipo] ?? [];
        return (
          <div key={tipo} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-sm font-semibold text-muted-foreground">
                {icon} {label}{" "}
                <span className="ml-1 text-xs font-normal">({list.length})</span>
              </h4>
            </div>
            <div className="space-y-3">
              {list.map((p) => {
                const form = getForm(p);
                const baseForm = fromParceiro(p);
                return (
                  <Card key={p.id} data-testid={`card-parceiro-${p.id}`}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>{form.nomeEmpresa || form.responsavel || "Sem nome"}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive hover:text-destructive"
                          onClick={() => setConfirmDeleteId(p.id)}
                          data-testid={`btn-delete-parceiro-${p.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {FIELDS.map(({ field, label: fLabel }) => (
                          <div key={field} className="space-y-1">
                            <Label className="text-xs">{fLabel}</Label>
                            <Input
                              value={form[field]}
                              onChange={(e) =>
                                setForm(p.id, baseForm, { [field]: e.target.value })
                              }
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => save(p)}
                          disabled={updateParceiro.isPending}
                        >
                          <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      <AddPartnerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        isPending={createParceiro.isPending}
        onSubmit={(data) => {
          setAddOpen(false);
          createParceiro.mutate(data, {
            onSuccess: () => {
              toast({ title: "Membro adicionado" });
            },
            onError: (e) => {
              toast({
                variant: "destructive",
                title: "Erro ao adicionar",
                description: (e as Error).message,
              });
              setAddOpen(true);
            },
          });
        }}
      />

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O membro será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteId && remove(confirmDeleteId)}
              disabled={deleteParceiro.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface AddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSubmit: (data: {
    tipo: string;
    nomeEmpresa: string | null;
    responsavel: string | null;
    registroProfissional: string | null;
    telefone: string | null;
    email: string | null;
    observacoes: string | null;
  }) => void;
}

const CUSTOM_KEY = "__custom__";

function slugifyTipo(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function AddPartnerDialog({ open, onOpenChange, isPending, onSubmit }: AddDialogProps) {
  const [tipoSelect, setTipoSelect] = useState<string>(TIPOS_PADRAO[0].key);
  const [tipoCustom, setTipoCustom] = useState("");
  const [form, setForm] = useState<PartnerFormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTipoSelect(TIPOS_PADRAO[0].key);
    setTipoCustom("");
    setForm(EMPTY);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function submit() {
    setError(null);
    let tipo = tipoSelect;
    if (tipoSelect === CUSTOM_KEY) {
      const slug = slugifyTipo(tipoCustom);
      if (!slug) {
        setError("Informe o nome da categoria personalizada.");
        return;
      }
      tipo = slug;
    }
    if (!form.nomeEmpresa.trim() && !form.responsavel.trim()) {
      setError("Informe ao menos o nome da empresa ou o responsável.");
      return;
    }
    onSubmit({
      tipo,
      nomeEmpresa: form.nomeEmpresa.trim() || null,
      responsavel: form.responsavel.trim() || null,
      registroProfissional: form.registroProfissional.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      observacoes: form.observacoes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar membro à rede externa</DialogTitle>
          <DialogDescription>
            Selecione uma categoria existente ou crie uma personalizada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Categoria</Label>
            <Select value={tipoSelect} onValueChange={setTipoSelect}>
              <SelectTrigger data-testid="select-categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_PADRAO.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.icon} {t.label}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_KEY}>
                  ✨ Outra categoria (personalizada)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipoSelect === CUSTOM_KEY && (
            <div className="space-y-1">
              <Label className="text-xs">
                Nome da categoria personalizada
              </Label>
              <Input
                value={tipoCustom}
                onChange={(e) => setTipoCustom(e.target.value)}
                placeholder="Ex.: Consultor Financeiro"
                data-testid="input-categoria-custom"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELDS.map(({ field, label: fLabel }) => (
              <div key={field} className="space-y-1">
                <Label className="text-xs">{fLabel}</Label>
                <Input
                  value={form[field]}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [field]: e.target.value }))
                  }
                  data-testid={`input-${field}`}
                />
              </div>
            ))}
          </div>

          {error && (
            <p className="text-xs text-destructive" data-testid="add-parceiro-error">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={isPending} data-testid="btn-submit-parceiro">
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Salvando…
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
