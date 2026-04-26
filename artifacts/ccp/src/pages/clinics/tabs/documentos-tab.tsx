import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, FolderOpen, Loader2 } from "lucide-react";
import {
  useClinicDocumentCategories,
  useClinicDocuments,
} from "@/hooks/use-clinic-documents";

export default function DocumentosTab({ clinicId }: { clinicId: string }) {
  const categoriesQ = useClinicDocumentCategories(clinicId);
  const docsQ = useClinicDocuments(clinicId);

  const isLoading = categoriesQ.isLoading || docsQ.isLoading;
  const docs = docsQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  const totalSize = docs.reduce((acc, d) => acc + (d.fileSize ?? 0), 0);
  const totalSizeMb = (totalSize / (1024 * 1024)).toFixed(1);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/admin/clinicas/${clinicId}/documentos`}>
          <Button variant="outline" size="sm" data-testid="btn-open-documentos">
            <ExternalLink className="h-4 w-4 mr-2" />
            Abrir biblioteca completa
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Biblioteca de Documentos
          </CardTitle>
          <CardDescription>
            Acervo livre de arquivos da clínica organizado por categorias.
            Use a biblioteca completa para fazer upload, organizar e visualizar documentos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-md border p-4">
                <div className="text-sm text-muted-foreground">Categorias</div>
                <div className="text-2xl font-semibold" data-testid="stat-categories">
                  {categories.length}
                </div>
              </div>
              <div className="rounded-md border p-4">
                <div className="text-sm text-muted-foreground">Documentos</div>
                <div className="text-2xl font-semibold" data-testid="stat-documents">
                  {docs.length}
                </div>
              </div>
              <div className="rounded-md border p-4">
                <div className="text-sm text-muted-foreground">Espaço utilizado</div>
                <div className="text-2xl font-semibold" data-testid="stat-size">
                  {totalSizeMb} MB
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
