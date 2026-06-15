import { useRef, useState } from "react";
import { Building2, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClinicLogo } from "@/components/clinic-logo";
import { useUploadClinicLogo, useDeleteClinicLogo } from "@/hooks/use-clinic-logo";

const ACCEPT = "image/png,image/jpeg,image/svg+xml,image/webp";
const ALLOWED = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export default function LogoCard({
  clinicId,
  nome,
  logoUrl,
}: {
  clinicId: string;
  nome: string;
  logoUrl: string | null | undefined;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadClinicLogo(clinicId);
  const remove = useDeleteClinicLogo(clinicId);
  const [removing, setRemoving] = useState(false);

  const busy = upload.isPending || remove.isPending;

  function handlePick() {
    inputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED.has(file.type)) {
      toast({
        title: "Formato não suportado",
        description: "Envie uma imagem PNG, JPG, SVG ou WebP.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({
        title: "Arquivo muito grande",
        description: "O logo deve ter no máximo 5 MB.",
        variant: "destructive",
      });
      return;
    }
    try {
      await upload.mutateAsync(file);
      toast({ title: "Logo atualizado" });
    } catch (err) {
      toast({
        title: "Falha ao enviar logo",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await remove.mutateAsync();
      toast({ title: "Logo removido" });
    } catch (err) {
      toast({
        title: "Falha ao remover logo",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo da Clínica</CardTitle>
        <CardDescription>
          Aparece no painel, nos módulos e no seletor de clínicas. PNG, JPG, SVG ou WebP (até 5 MB).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
          <ClinicLogo
            clinicId={clinicId}
            logoUrl={logoUrl}
            name={nome}
            className="h-full w-full p-2"
            fallback={<Building2 className="h-10 w-10 text-muted-foreground" />}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={handleFile}
            data-testid="input-logo-file"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handlePick}
            disabled={busy}
            data-testid="btn-upload-logo"
          >
            {upload.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {logoUrl ? "Substituir" : "Enviar logo"}
          </Button>
          {logoUrl && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleRemove}
              disabled={busy}
              data-testid="btn-remove-logo"
            >
              {removing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Remover
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
