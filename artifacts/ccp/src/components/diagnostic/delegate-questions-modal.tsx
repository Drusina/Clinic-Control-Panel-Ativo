import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Send, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getStoredToken } from "@/hooks/use-auth";
import { getRespondentToken } from "@/pages/responder/index";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface DelegateQuestionsModalProps {
  mode: "admin" | "respondent";
  open: boolean;
  onClose: () => void;
  perguntaIds: string[];
  pilarSlug: string;
  pilarNome: string;
  diagnosticoId: string;
  /** Required when mode === "admin". */
  clinicId?: string;
  /** E-mail do operador atual (admin) — usado para impedir auto-delegação. */
  selfEmail?: string | null;
  /** Optional summary lines (e.g. ["Q12: …", "Q15: …"]) shown above the form. */
  preview?: string[];
  onSuccess?: () => void;
}

interface DelegateResponse {
  id: string;
  inviteLink?: string | null;
}

export function DelegateQuestionsModal(props: DelegateQuestionsModalProps) {
  const { mode, open, onClose, perguntaIds, pilarSlug, pilarNome, diagnosticoId, clinicId, selfEmail, preview, onSuccess } = props;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    nome: "",
    email: "",
    prazo: "",
    observacoes: "",
    enviarConvite: true,
  });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setForm({ nome: "", email: "", prazo: "", observacoes: "", enviarConvite: true });
    setInviteLink(null);
    setCopied(false);
  };

  const closeAndReset = () => {
    reset();
    onClose();
  };

  const mut = useMutation<DelegateResponse, Error>({
    mutationFn: async () => {
      const body = {
        perguntaIds,
        pilarSlug,
        pilarNome,
        nivel: 3,
        responsavelNome: form.nome.trim(),
        responsavelEmail: form.email.trim(),
        prazo: form.prazo || null,
        observacoes: form.observacoes.trim() || null,
        diagnosticoId,
        enviarConvite: form.enviarConvite,
        status: "pendente" as const,
      };

      if (mode === "admin") {
        if (!clinicId) throw new Error("clinicId é obrigatório no modo admin.");
        const token = getStoredToken();
        const res = await fetch(`${BASE}/api/clinics/${clinicId}/delegacoes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? "Falha ao delegar.");
        }
        return res.json() as Promise<DelegateResponse>;
      }

      // respondent mode
      const token = getRespondentToken();
      const res = await fetch(`${BASE}/api/respondent/delegate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          perguntaIds,
          responsavelNome: form.nome.trim(),
          responsavelEmail: form.email.trim(),
          prazo: form.prazo || null,
          observacoes: form.observacoes.trim() || null,
          enviarConvite: form.enviarConvite,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao delegar.");
      }
      return res.json() as Promise<DelegateResponse>;
    },
    onSuccess: (data) => {
      // Invalidate caches relevant to each mode
      if (mode === "admin" && clinicId) {
        qc.invalidateQueries({ queryKey: ["clinic-delegacoes", clinicId] });
        qc.invalidateQueries({ queryKey: ["delegacao-hydrated", clinicId] });
      } else {
        qc.invalidateQueries({ queryKey: ["respondent-questions"] });
        qc.invalidateQueries({ queryKey: ["respondent-progress"] });
        qc.invalidateQueries({ queryKey: ["respondent-delegated-out"] });
      }
      onSuccess?.();
      if (data.inviteLink) {
        setInviteLink(data.inviteLink);
        toast({
          title: "Delegação criada",
          description: form.enviarConvite
            ? `Convite enviado para ${form.email}.`
            : "Compartilhe o link manualmente.",
        });
      } else {
        toast({
          title: "Delegação criada",
          description: form.enviarConvite
            ? `Convite enviado para ${form.email}.`
            : "Salva sem envio de convite.",
        });
        closeAndReset();
      }
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Erro ao delegar", description: err.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.email.trim()) return;
    if (selfEmail && form.email.trim().toLowerCase() === selfEmail.toLowerCase()) {
      toast({
        variant: "destructive",
        title: "E-mail inválido",
        description: "Você não pode delegar para o seu próprio e-mail.",
      });
      return;
    }
    mut.mutate();
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeAndReset()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            Delegar {perguntaIds.length} pergunta{perguntaIds.length === 1 ? "" : "s"} — {pilarNome}
          </DialogTitle>
          <DialogDescription>
            Quem receber este convite poderá responder apenas as perguntas selecionadas e
            também sub-delegar para outras pessoas se precisar.
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium mb-1">Link de resposta</p>
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteLink} className="text-xs font-mono" />
                <Button type="button" size="sm" variant="outline" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Válido por 30 dias. {form.enviarConvite ? "O link também foi enviado por e-mail." : "Envie manualmente para o responsável."}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={closeAndReset}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 py-2">
            {preview && preview.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-2 text-xs max-h-28 overflow-y-auto space-y-0.5">
                {preview.slice(0, 8).map((p, i) => (
                  <div key={i} className="text-muted-foreground truncate">{p}</div>
                ))}
                {preview.length > 8 && (
                  <div className="text-muted-foreground italic">… e mais {preview.length - 8}</div>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="nome">Nome do responsável *</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Maria Silva"
                required
              />
            </div>
            <div>
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@clinica.com.br"
                required
              />
            </div>
            <div>
              <Label htmlFor="prazo">Prazo</Label>
              <Input
                id="prazo"
                type="date"
                value={form.prazo}
                onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                placeholder="Instruções adicionais (opcional)"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enviarConvite}
                onChange={(e) => setForm((f) => ({ ...f, enviarConvite: e.target.checked }))}
              />
              <span>Enviar convite por e-mail agora</span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeAndReset}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : form.enviarConvite ? (
                  <Mail className="h-4 w-4 mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {form.enviarConvite ? "Delegar e enviar" : "Apenas delegar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
