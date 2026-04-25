import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import { useParceirosExternos, useCreateParceiroExterno, useUpdateParceiroExterno, type ParceirosExternoData } from "@/hooks/use-kickoff-api";

interface Props { clinicId: string }

const TIPOS = [
  { key: "contador", label: "Contador", icon: "🧮" },
  { key: "advogado", label: "Advogado", icon: "⚖️" },
  { key: "marketing", label: "Agência de Marketing", icon: "📣" },
  { key: "ti_externo", label: "TI Externo", icon: "💻" },
  { key: "banco", label: "Banco", icon: "🏦" },
];

interface PartnerFormState {
  nomeEmpresa: string;
  responsavel: string;
  registroProfissional: string;
  telefone: string;
  email: string;
  observacoes: string;
}

const EMPTY: PartnerFormState = {
  nomeEmpresa: "", responsavel: "", registroProfissional: "", telefone: "", email: "", observacoes: "",
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

export default function RedeExternaTab({ clinicId }: Props) {
  const { toast } = useToast();
  const { data: parceiros = [], isLoading } = useParceirosExternos(clinicId);
  const createParceiro = useCreateParceiroExterno(clinicId);
  const updateParceiro = useUpdateParceiroExterno(clinicId);

  const [forms, setForms] = useState<Record<string, PartnerFormState>>({});

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;

  function getForm(tipo: string): PartnerFormState {
    if (forms[tipo]) return forms[tipo];
    const existing = parceiros.find(p => p.tipo === tipo);
    if (existing) return fromParceiro(existing);
    return { ...EMPTY };
  }

  function setForm(tipo: string, update: Partial<PartnerFormState>) {
    setForms(prev => ({ ...prev, [tipo]: { ...getForm(tipo), ...update } }));
  }

  function save(tipo: string) {
    const form = getForm(tipo);
    const existing = parceiros.find(p => p.tipo === tipo);
    const data = {
      tipo,
      nomeEmpresa: form.nomeEmpresa || null,
      responsavel: form.responsavel || null,
      registroProfissional: form.registroProfissional || null,
      telefone: form.telefone || null,
      email: form.email || null,
      observacoes: form.observacoes || null,
    };

    if (existing) {
      updateParceiro.mutate(
        { id: existing.id, ...data },
        {
          onSuccess: () => toast({ title: `${tipo} salvo` }),
          onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
        }
      );
    } else {
      createParceiro.mutate(data, {
        onSuccess: () => toast({ title: `${tipo} salvo` }),
        onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
      });
    }
  }

  return (
    <div className="space-y-4">
      {TIPOS.map(({ key, label, icon }) => {
        const form = getForm(key);
        return (
          <Card key={key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{icon} {label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { field: "nomeEmpresa" as const, label: "Nome / Empresa" },
                  { field: "responsavel" as const, label: "Responsável" },
                  { field: "registroProfissional" as const, label: "Registro (CRC, OAB, etc.)" },
                  { field: "telefone" as const, label: "Telefone" },
                  { field: "email" as const, label: "E-mail" },
                  { field: "observacoes" as const, label: "Observações" },
                ].map(({ field, label: fLabel }) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs">{fLabel}</Label>
                    <Input
                      value={form[field]}
                      onChange={e => setForm(key, { [field]: e.target.value })}
                      onBlur={() => {}}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => save(key)}
                  disabled={createParceiro.isPending || updateParceiro.isPending}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
