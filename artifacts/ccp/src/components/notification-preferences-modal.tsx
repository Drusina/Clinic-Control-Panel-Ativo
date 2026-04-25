import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, MessageSquare, Mail, Check, Loader2, Users } from "lucide-react";
import { getStoredToken } from "@/hooks/use-auth";

interface TeamMember {
  id: string;
  nome: string;
  email: string | null;
  funcao: string | null;
  notificationPreferences: { emailEnabled: boolean; whatsappEnabled: boolean };
}

interface NotificationPrefs {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function fetchAllMembers(): Promise<TeamMember[]> {
  try {
    const res = await fetch("/api/team/all", { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json() as Promise<TeamMember[]>;
  } catch {
    return [];
  }
}

async function patchMemberPrefs(memberId: string, prefs: NotificationPrefs): Promise<boolean> {
  try {
    const res = await fetch(`/api/preferences/notifications/${memberId}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(prefs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface NotificationPreferencesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationPreferencesModal({ open, onOpenChange }: NotificationPreferencesModalProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [prefs, setPrefs] = useState<NotificationPrefs>({ emailEnabled: true, whatsappEnabled: true });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaved(false);
    setLoading(true);
    fetchAllMembers().then((list) => {
      setMembers(list);
      if (list.length > 0 && !selectedId) {
        const first = list[0];
        setSelectedId(first.id);
        setPrefs(first.notificationPreferences ?? { emailEnabled: true, whatsappEnabled: true });
      } else if (selectedId) {
        const current = list.find((m) => m.id === selectedId);
        if (current) setPrefs(current.notificationPreferences ?? { emailEnabled: true, whatsappEnabled: true });
      }
      setLoading(false);
    });
  }, [open]);

  function onSelectMember(id: string) {
    setSelectedId(id);
    setSaved(false);
    const member = members.find((m) => m.id === id);
    if (member) setPrefs(member.notificationPreferences ?? { emailEnabled: true, whatsappEnabled: true });
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    await patchMemberPrefs(selectedId, prefs);
    setMembers((prev) =>
      prev.map((m) => (m.id === selectedId ? { ...m, notificationPreferences: prefs } : m))
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const selectedMember = members.find((m) => m.id === selectedId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Bell className="h-5 w-5 text-primary" />
            Preferências de notificação
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Configure os canais de notificação por membro da equipe.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum membro da equipe cadastrado.<br />
              Adicione membros nas clínicas para configurar notificações.
            </p>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block uppercase tracking-wide">
                Membro da equipe
              </Label>
              <Select value={selectedId} onValueChange={onSelectMember}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um membro..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="font-medium">{m.nome}</span>
                      {m.email && (
                        <span className="text-muted-foreground ml-2 text-xs">{m.email}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMember?.funcao && (
                <p className="text-xs text-muted-foreground mt-1">Função: {selectedMember.funcao}</p>
              )}
            </div>

            <div className="flex items-start justify-between gap-4 p-4 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 rounded-md bg-primary/10">
                  <Mail className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <Label htmlFor="email-toggle" className="text-sm font-medium text-foreground cursor-pointer">
                    Notificações por email
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Delegações de pilares, documentos próximos ao vencimento e convites.
                  </p>
                </div>
              </div>
              <Switch
                id="email-toggle"
                checked={prefs.emailEnabled}
                disabled={!selectedId}
                onCheckedChange={(checked) => setPrefs((p) => ({ ...p, emailEnabled: checked }))}
              />
            </div>

            <div className="flex items-start justify-between gap-4 p-4 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 rounded-md bg-green-500/10">
                  <MessageSquare className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <Label htmlFor="whatsapp-toggle" className="text-sm font-medium text-foreground cursor-pointer">
                    Notificações por WhatsApp
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Delegações e aprovações via WhatsApp Business (requer número cadastrado no perfil).
                  </p>
                </div>
              </div>
              <Switch
                id="whatsapp-toggle"
                checked={prefs.whatsappEnabled}
                disabled={!selectedId}
                onCheckedChange={(checked) => setPrefs((p) => ({ ...p, whatsappEnabled: checked }))}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !selectedId}
            className="gap-2 min-w-[160px]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4" />
                Salvo
              </>
            ) : (
              "Salvar preferências"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
