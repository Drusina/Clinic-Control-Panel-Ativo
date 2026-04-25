import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, CheckCircle2, Clock, Send, Upload, FileSignature, ExternalLink } from "lucide-react";
import { useLgpdTermos, useCreateAutentiqueDocument, useUploadLgpdPdf, type LgpdTermoData } from "@/hooks/use-kickoff-api";

const TOTAL_TERMS = 6;

interface Props { clinicId: string }

function statusChip(status: string) {
  switch (status) {
    case "assinado": return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Assinado</Badge>;
    case "enviado": return <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-xs"><Send className="h-3 w-3 mr-1" />Enviado</Badge>;
    case "anexado": return <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs"><FileSignature className="h-3 w-3 mr-1" />Anexado</Badge>;
    case "recusado": return <Badge variant="destructive" className="text-xs">Recusado</Badge>;
    default: return <Badge variant="outline" className="text-xs"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
  }
}

export default function LgpdTab({ clinicId }: Props) {
  const { toast } = useToast();
  const { data: termos = [], isLoading } = useLgpdTermos(clinicId);
  const createDoc = useCreateAutentiqueDocument(clinicId);
  const uploadPdf = useUploadLgpdPdf(clinicId);

  const [selectedTermo, setSelectedTermo] = useState<LgpdTermoData | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const formalized = termos.filter(t => ["assinado", "anexado"].includes(t.status)).length;

  function openDialog(termo: LgpdTermoData) {
    setSelectedTermo(termo);
    setSignerName(termo.signatarioNome ?? "");
    setSignerEmail(termo.signatarioEmail ?? "");
    setDialogOpen(true);
  }

  function confirm() {
    if (!selectedTermo || !signerEmail || !signerName) return;
    createDoc.mutate(
      { termSlug: selectedTermo.slug, signerEmail, signerName },
      {
        onSuccess: () => {
          toast({ title: "Documento enviado para assinatura" });
          setDialogOpen(false);
        },
        onError: (e) => toast({ variant: "destructive", title: "Erro", description: (e as Error).message }),
      }
    );
  }

  function handlePdfUpload(termo: LgpdTermoData, file: File) {
    uploadPdf.mutate(
      { termoId: termo.id, file },
      {
        onSuccess: () => toast({ title: "PDF anexado com sucesso" }),
        onError: (e) => toast({ variant: "destructive", title: "Erro no upload", description: (e as Error).message }),
      }
    );
  }

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{formalized} de {TOTAL_TERMS} termos formalizados</p>
              <p className="text-sm text-muted-foreground">Documentos LGPD e autorizações obrigatórios da clínica</p>
            </div>
          </div>
          <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(formalized / TOTAL_TERMS) * 100}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {termos.map(termo => (
          <Card key={termo.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">{termo.nome}</CardTitle>
                  <CardDescription className="mt-1">{termo.descricao}</CardDescription>
                </div>
                {statusChip(termo.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {termo.signatarioNome && <p>Signatário: {termo.signatarioNome} ({termo.signatarioEmail})</p>}
                  {termo.enviadoEm && <p>Enviado: {new Date(termo.enviadoEm).toLocaleDateString("pt-BR")}</p>}
                  {termo.assinadoEm && <p>Assinado: {new Date(termo.assinadoEm).toLocaleDateString("pt-BR")}</p>}
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  {termo.acaoUrl && (
                    <a href={termo.acaoUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="secondary">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir link de assinatura
                      </Button>
                    </a>
                  )}
                  {["pendente", "recusado"].includes(termo.status) && (
                    <Button size="sm" variant="outline" onClick={() => openDialog(termo)}>
                      <Send className="h-3.5 w-3.5 mr-1" /> Aceite digital
                    </Button>
                  )}
                  {["pendente", "recusado"].includes(termo.status) && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => fileRefs.current[termo.id]?.click()}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Anexar PDF
                      </Button>
                      <input
                        ref={el => { fileRefs.current[termo.id] = el; }}
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handlePdfUpload(termo, file);
                          e.target.value = "";
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {termos.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Carregando termos LGPD…</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aceite Digital via Autentique</DialogTitle>
            <DialogDescription>
              Um documento de assinatura será criado e o link enviado por e-mail ao signatário.
            </DialogDescription>
          </DialogHeader>
          {selectedTermo && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-md bg-muted text-sm font-medium">{selectedTermo.nome}</div>
              <div className="space-y-2">
                <Label>Nome do Signatário</Label>
                <Input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Dr. Edgar Stroppa Lamas" />
              </div>
              <div className="space-y-2">
                <Label>E-mail do Signatário</Label>
                <Input type="email" value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="edgar@clinica.com.br" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirm} disabled={createDoc.isPending || !signerName || !signerEmail}>
              {createDoc.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar para assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
