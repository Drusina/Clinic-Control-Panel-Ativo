import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  ChevronDown,
  Pencil,
  Plus,
  Search,
  Upload,
  Folder,
  Trash2,
  Sparkles,
  ScanLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClinicDocument, ClinicDocumentCategory } from "@/hooks/use-clinic-documents";
import { FileIcon } from "./file-icon";

export function SidebarTree({
  categories,
  documents,
  selectedDocId,
  onSelectDoc,
  onNewCategory,
  onEditCategory,
  onDeleteCategory,
  onUploadToCategory,
}: {
  categories: ClinicDocumentCategory[];
  documents: ClinicDocument[];
  selectedDocId: string | null;
  onSelectDoc: (doc: ClinicDocument) => void;
  onNewCategory: () => void;
  onEditCategory: (cat: ClinicDocumentCategory) => void;
  onDeleteCategory: (cat: ClinicDocumentCategory) => void;
  onUploadToCategory: (categoryId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  const docsByCat = useMemo(() => {
    const map = new Map<string, ClinicDocument[]>();
    for (const d of documents) {
      const list = map.get(d.categoryId) ?? [];
      list.push(d);
      map.set(d.categoryId, list);
    }
    return map;
  }, [documents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return categories.map((c) => ({
        cat: c,
        docs: docsByCat.get(c.id) ?? [],
        forceOpen: false,
      }));
    }
    return categories
      .map((c) => {
        const all = docsByCat.get(c.id) ?? [];
        const matches = all.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.fileName.toLowerCase().includes(q),
        );
        const catNameMatches = c.name.toLowerCase().includes(q);
        if (catNameMatches) {
          return { cat: c, docs: all, forceOpen: true };
        }
        if (matches.length > 0) {
          return { cat: c, docs: matches, forceOpen: true };
        }
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [categories, docsByCat, search]);

  function toggle(catId: string) {
    setOpenCats((s) => {
      const n = new Set(s);
      if (n.has(catId)) n.delete(catId);
      else n.add(catId);
      return n;
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar documento ou categoria…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-search-docs"
          />
        </div>
        <Button onClick={onNewCategory} variant="outline" size="sm" className="w-full" data-testid="btn-new-category">
          <Plus className="h-4 w-4 mr-2" />
          Nova categoria
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            {search ? "Nenhum resultado encontrado." : "Nenhuma categoria ainda."}
          </p>
        )}
        {filtered.map(({ cat, docs, forceOpen }) => {
          const isOpen = forceOpen || openCats.has(cat.id);
          const docCount = docsByCat.get(cat.id)?.length ?? 0;
          return (
            <div key={cat.id} className="group">
              <div
                className={cn(
                  "flex items-center gap-1 rounded-md hover:bg-accent/50 px-1.5 py-1.5 cursor-pointer",
                )}
                onClick={() => toggle(cat.id)}
                data-testid={`category-row-${cat.id}`}
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="flex-1 text-sm font-medium truncate" title={cat.name}>
                  {cat.name}
                </span>
                <Badge variant="secondary" className="h-5 px-1.5 text-xs shrink-0">
                  {docCount}
                </Badge>
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUploadToCategory(cat.id);
                    }}
                    title="Fazer upload nesta categoria"
                    data-testid={`btn-upload-cat-${cat.id}`}
                  >
                    <Upload className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditCategory(cat);
                    }}
                    title="Renomear categoria"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {docCount === 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCategory(cat);
                      }}
                      title="Excluir categoria vazia"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  {docs.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1.5 italic">
                      Sem documentos.
                    </p>
                  )}
                  {docs.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => onSelectDoc(d)}
                      className={cn(
                        "flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-accent/50",
                        selectedDocId === d.id && "bg-accent text-accent-foreground",
                      )}
                      data-testid={`doc-row-${d.id}`}
                    >
                      <FileIcon mime={d.fileType} fileName={d.fileName} />
                      <span className="truncate flex-1" title={d.title}>
                        {d.title}
                      </span>
                      {d.summary && d.summaryAnalysisMode === "vision" && (
                        <ScanLine
                          className="h-3 w-3 text-primary shrink-0"
                          aria-label="Resumo IA gerado por análise de imagem"
                        />
                      )}
                      {d.summary && d.summaryAnalysisMode !== "vision" && (
                        <Sparkles
                          className="h-3 w-3 text-primary shrink-0"
                          aria-label="Resumo IA disponível"
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
