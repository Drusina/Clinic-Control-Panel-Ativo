import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useGetClinic, getGetClinicQueryKey } from "@workspace/api-client-react";
import {
  useClinicDocumentCategories,
  useClinicDocuments,
  useCreateDocumentCategory,
  useRenameDocumentCategory,
  useDeleteDocumentCategory,
  useUploadClinicDocument,
  useDeleteClinicDocument,
  fixClinicDocumentEncoding,
  type ClinicDocument,
  type ClinicDocumentCategory,
} from "@/hooks/use-clinic-documents";
import { useQueryClient } from "@tanstack/react-query";
import { SidebarTree } from "@/components/clinic-documents/sidebar-tree";
import { DetailPanel } from "@/components/clinic-documents/detail-panel";
import { NewCategoryModal, EditCategoryModal } from "@/components/clinic-documents/category-modals";
import { UploadModal } from "@/components/clinic-documents/upload-modal";

const ENCODING_FIX_KEY_PREFIX = "ccp:doc-encoding-fixed:";

function nameLooksMojibake(s: string): boolean {
  if (!s) return false;
  if (s.includes("\uFFFD")) return true;
  if (/\\u00[0-9a-fA-F]{2}/.test(s)) return true;
  return false;
}

export default function ClinicDocumentsPage() {
  const params = useParams<{ id: string }>();
  const clinicId = params.id;
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: clinic } = useGetClinic(clinicId, {
    query: { enabled: !!clinicId, queryKey: getGetClinicQueryKey(clinicId) },
  });

  const categoriesQ = useClinicDocumentCategories(clinicId);
  const docsQ = useClinicDocuments(clinicId);

  const createCategory = useCreateDocumentCategory(clinicId);
  const renameCategory = useRenameDocumentCategory(clinicId);
  const deleteCategory = useDeleteDocumentCategory(clinicId);
  const uploadDoc = useUploadClinicDocument(clinicId);
  const deleteDoc = useDeleteClinicDocument(clinicId);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<ClinicDocumentCategory | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategoryId, setUploadCategoryId] = useState<string | undefined>();

  const docs = docsQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  const selectedDoc = useMemo<ClinicDocument | null>(() => {
    return docs.find((d) => d.id === selectedDocId) ?? null;
  }, [docs, selectedDocId]);

  const selectedCategory = useMemo<ClinicDocumentCategory | null>(() => {
    if (!selectedDoc) return null;
    return categories.find((c) => c.id === selectedDoc.categoryId) ?? null;
  }, [selectedDoc, categories]);

  // Auto-run fix-encoding once per session if mojibake is detected.
  const fixRanRef = useRef(false);
  useEffect(() => {
    if (fixRanRef.current || !clinicId || !docsQ.data) return;
    const sessionKey = `${ENCODING_FIX_KEY_PREFIX}${clinicId}`;
    if (sessionStorage.getItem(sessionKey) === "1") {
      fixRanRef.current = true;
      return;
    }
    const hasBadName = docsQ.data.some(
      (d) => nameLooksMojibake(d.fileName) || nameLooksMojibake(d.title),
    );
    if (!hasBadName) {
      sessionStorage.setItem(sessionKey, "1");
      fixRanRef.current = true;
      return;
    }
    fixRanRef.current = true;
    fixClinicDocumentEncoding(clinicId)
      .then((fixed) => {
        sessionStorage.setItem(sessionKey, "1");
        if (fixed > 0) {
          qc.invalidateQueries({ queryKey: ["clinic-documents", clinicId] });
        }
      })
      .catch(() => {
        // best-effort, no toast for auto-fix
      });
  }, [clinicId, docsQ.data, qc]);

  function handleNewCategory(name: string) {
    createCategory.mutate(name, {
      onSuccess: () => {
        toast({ title: "Categoria criada" });
        setNewCatOpen(false);
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Erro ao criar categoria",
          description: (e as Error).message,
        }),
    });
  }

  function handleRenameCategory(name: string) {
    if (!editingCat) return;
    renameCategory.mutate(
      { id: editingCat.id, name },
      {
        onSuccess: () => {
          toast({ title: "Categoria renomeada" });
          setEditingCat(null);
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: "Erro ao renomear",
            description: (e as Error).message,
          }),
      },
    );
  }

  function handleDeleteCategory(cat: ClinicDocumentCategory) {
    if (cat.documentCount > 0) {
      toast({
        variant: "destructive",
        title: "Categoria possui documentos",
        description: "Mova ou exclua os documentos antes de remover a categoria.",
      });
      return;
    }
    if (!confirm(`Excluir a categoria "${cat.name}"?`)) return;
    deleteCategory.mutate(cat.id, {
      onSuccess: () => toast({ title: "Categoria excluída" }),
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Erro ao excluir",
          description: (e as Error).message,
        }),
    });
  }

  function handleDeleteDoc(id: string) {
    deleteDoc.mutate(id, {
      onSuccess: () => {
        toast({ title: "Documento excluído" });
        if (selectedDocId === id) setSelectedDocId(null);
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: "Erro ao excluir",
          description: (e as Error).message,
        }),
    });
  }

  function openUploadFor(categoryId?: string) {
    setUploadCategoryId(categoryId);
    setUploadOpen(true);
  }

  async function uploadOne(categoryId: string, file: File): Promise<unknown> {
    return uploadDoc.mutateAsync({ categoryId, file });
  }

  const isLoading = categoriesQ.isLoading || docsQ.isLoading;

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-6rem)]">
      <div className="flex items-center gap-3">
        <Link href={`/admin/clinicas/${clinicId}`}>
          <Button variant="outline" size="icon" data-testid="btn-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">
            Documentos {clinic ? `· ${clinic.nome}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            Acervo documental livre da clínica
          </p>
        </div>
        <Button onClick={() => openUploadFor(undefined)} data-testid="btn-open-upload">
          <Upload className="h-4 w-4 mr-2" />
          Upload em lote
        </Button>
      </div>

      <Card className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr] overflow-hidden p-0">
        <div className="border-r bg-card overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Carregando…
            </div>
          ) : (
            <SidebarTree
              categories={categories}
              documents={docs}
              selectedDocId={selectedDocId}
              onSelectDoc={(d) => setSelectedDocId(d.id)}
              onNewCategory={() => setNewCatOpen(true)}
              onEditCategory={(c) => setEditingCat(c)}
              onDeleteCategory={handleDeleteCategory}
              onUploadToCategory={openUploadFor}
            />
          )}
        </div>
        <div className="overflow-hidden bg-background">
          <DetailPanel
            doc={selectedDoc}
            category={selectedCategory}
            clinicId={clinicId}
            onDelete={handleDeleteDoc}
            isDeleting={deleteDoc.isPending}
          />
        </div>
      </Card>

      <NewCategoryModal
        open={newCatOpen}
        onOpenChange={setNewCatOpen}
        onCreate={handleNewCategory}
        isLoading={createCategory.isPending}
      />
      <EditCategoryModal
        open={!!editingCat}
        onOpenChange={(v) => !v && setEditingCat(null)}
        initialName={editingCat?.name ?? ""}
        onSave={handleRenameCategory}
        isLoading={renameCategory.isPending}
      />
      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        categories={categories}
        initialCategoryId={uploadCategoryId}
        uploadOne={uploadOne}
      />
    </div>
  );
}
