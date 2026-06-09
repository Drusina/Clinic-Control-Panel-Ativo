import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ChevronDown, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { getStoredToken } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return fetch(`${BASE}${path}`, { ...init, headers });
}

// Subconjunto de campos de uma delegação necessários para (re)enviar o link de
// resposta. A interface completa `Delegacao` (em index.tsx) é estruturalmente
// compatível com este alvo, então os componentes aceitam delegações reais.
export interface DelegacaoResendTarget {
  id: string;
  responsavelNome: string | null;
  responsavelEmail: string | null;
  inviteSentAt?: string | null;
  questaoInicio: number | null;
  questaoFim: number | null;
}

export function delegacaoScopeLabel(d: DelegacaoResendTarget): string | null {
  if (d.questaoInicio != null && d.questaoFim != null) {
    return d.questaoInicio === d.questaoFim
      ? `Q${d.questaoInicio}`
      : `Q${d.questaoInicio}–Q${d.questaoFim}`;
  }
  return null;
}

// Mutation compartilhada para (re)gerar e enviar o link de resposta de uma
// delegação específica. Recebe o id da delegação no `mutate(id)`, para que um
// único hook possa servir o responsável do pilar (N1) e cada sub-delegado (N2).
export function useSendInvite(clinicId: string, diagnosticoId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (delegacaoId: string) => {
      const res = await authFetch(
        `/api/clinics/${clinicId}/diagnostics/${diagnosticoId}/delegacoes/${delegacaoId}/send-invite`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Erro ao enviar convite");
      }
      return res.json() as Promise<{ ok: boolean; sent: boolean; to: string; link: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["delegacao-hydrated", clinicId] });
      toast({
        title: data.sent ? "Convite enviado" : "Link gerado (e-mail falhou)",
        description: data.sent
          ? `E-mail enviado para ${data.to}. O link é válido por 30 dias.`
          : `Não foi possível enviar para ${data.to}. Compartilhe o link manualmente: ${data.link}`,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Não foi possível enviar", description: err.message });
    },
  });
}

export function SendInviteButton({
  clinicId,
  diagnosticoId,
  delegacao,
}: {
  clinicId: string;
  diagnosticoId: string;
  delegacao: DelegacaoResendTarget;
}) {
  const sendMut = useSendInvite(clinicId, diagnosticoId);

  const alreadySent = !!delegacao.inviteSentAt;
  const disabled = !delegacao.responsavelEmail || sendMut.isPending;
  const quem = delegacao.responsavelNome ? ` para ${delegacao.responsavelNome}` : "";

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={() => sendMut.mutate(delegacao.id)}
      title={
        !delegacao.responsavelEmail
          ? "Adicione um e-mail de responsável antes de enviar"
          : alreadySent
          ? `Reenviar link de resposta${quem}`
          : `Enviar link de resposta por e-mail${quem}`
      }
    >
      {sendMut.isPending ? (
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
      ) : alreadySent ? (
        <Send className="h-3 w-3 mr-1" />
      ) : (
        <Mail className="h-3 w-3 mr-1" />
      )}
      {alreadySent ? "Reenviar" : "Enviar convite"}
    </Button>
  );
}

// Menu "Reenviar" para a linha (fechada) do pilar quando há sub-delegações.
// Lista o responsável do pilar (N1) e cada sub-delegado (N2) para que o gestor
// escolha explicitamente o destinatário sem precisar expandir o pilar.
export function ResendInviteMenu({
  clinicId,
  diagnosticoId,
  n1,
  n2s,
}: {
  clinicId: string;
  diagnosticoId: string;
  n1: DelegacaoResendTarget;
  n2s: DelegacaoResendTarget[];
}) {
  const sendMut = useSendInvite(clinicId, diagnosticoId);
  const noneHaveEmail = ![n1, ...n2s].some((d) => !!d.responsavelEmail);

  const renderItem = (d: DelegacaoResendTarget, sublabel: string) => {
    const noEmail = !d.responsavelEmail;
    const isPending = sendMut.isPending && sendMut.variables === d.id;
    return (
      <DropdownMenuItem
        key={d.id}
        disabled={noEmail || sendMut.isPending}
        onSelect={() => {
          if (!noEmail) sendMut.mutate(d.id);
        }}
        className="flex items-start gap-2"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 mt-0.5 animate-spin shrink-0" />
        ) : (
          <Send className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        )}
        <div className="flex flex-col min-w-0">
          <span className="font-medium truncate">
            {d.responsavelNome ?? "—"}
            <span className="text-muted-foreground font-normal"> · {sublabel}</span>
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {d.responsavelEmail ?? "sem e-mail cadastrado"}
            {d.inviteSentAt ? " · já enviado" : ""}
          </span>
        </div>
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          disabled={sendMut.isPending || noneHaveEmail}
          title={
            noneHaveEmail
              ? "Nenhum responsável tem e-mail cadastrado"
              : "Reenviar link para o responsável do pilar ou um sub-delegado"
          }
        >
          {sendMut.isPending ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Send className="h-3 w-3 mr-1" />
          )}
          Reenviar
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Reenviar link de resposta para…</DropdownMenuLabel>
        {renderItem(n1, "responsável do pilar")}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Sub-delegações
        </DropdownMenuLabel>
        {n2s.map((d) => {
          const scope = delegacaoScopeLabel(d);
          return renderItem(d, scope ? `sub-delegado · ${scope}` : "sub-delegado");
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
