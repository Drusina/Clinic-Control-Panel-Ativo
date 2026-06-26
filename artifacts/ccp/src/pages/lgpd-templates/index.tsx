import { useEffect, useMemo, useState } from "react";
import {
  useLgpdTemplates,
  useUpdateLgpdTemplate,
  previewLgpdTemplate,
  type LgpdTemplateData,
} from "@/hooks/use-kickoff-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Save,
  Eye,
  ShieldCheck,
  AlertCircle,
  FileText,
} from "lucide-react";

type Draft = { titulo: string; corpo: string };

export default function LgpdTemplatesPage() {
  const { toast } = useToast();
  const { data: templates, isLoading } = useLgpdTemplates();
  const updateTemplate = useUpdateLgpdTemplate();

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!templates) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const t of templates) {
        if (!next[t.slug]) next[t.slug] = { titulo: t.titulo, corpo: t.corpo };
      }
      return next;
    });
    setSelectedSlug((cur) => cur ?? templates[0]?.slug ?? null);
  }, [templates]);

  const selected: LgpdTemplateData | undefined = useMemo(
    () => templates?.find((t) => t.slug === selectedSlug),
    [templates, selectedSlug],
  );
  const draft = selectedSlug ? drafts[selectedSlug] : undefined;

  const isDirty = useMemo(() => {
    if (!selected || !draft) return false;
    return draft.titulo !== selected.titulo || draft.corpo !== selected.corpo;
  }, [selected, draft]);

  function patchDraft(slug: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [slug]: { ...prev[slug], ...patch } }));
  }

  async function handleSave() {
    if (!selected || !draft) return;
    try {
      await updateTemplate.mutateAsync({
        slug: selected.slug,
        titulo: draft.titulo,
        corpo: draft.corpo,
      });
      toast({
        title: "Template salvo",
        description: `"${draft.titulo}" foi atualizado com sucesso.`,
      });
    } catch {
      toast({ title: "Erro ao salvar template", variant: "destructive" });
    }
  }

  async function handlePreview() {
    if (!selected || !draft) return;
    setPreviewing(true);
    try {
      await previewLgpdTemplate(selected.slug, {
        titulo: draft.titulo,
        corpo: draft.corpo,
      });
    } catch (e) {
      toast({
        title: "Erro ao gerar pré-visualização",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPreviewing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-2 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p>Não foi possível carregar os modelos de LGPD.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Templates LGPD
        </h1>
        <p className="text-muted-foreground mt-1">
          Edite o título e o corpo dos termos de LGPD usados na formalização com as
          clínicas. As alterações valem para os próximos termos gerados.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Modelos</CardTitle>
            <CardDescription className="text-xs">
              {templates.length} termos disponíveis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {templates.map((t) => {
              const active = t.slug === selectedSlug;
              const dirty =
                drafts[t.slug] &&
                (drafts[t.slug].titulo !== t.titulo ||
                  drafts[t.slug].corpo !== t.corpo);
              return (
                <button
                  key={t.slug}
                  onClick={() => setSelectedSlug(t.slug)}
                  data-testid={`lgpd-template-${t.slug}`}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{t.titulo}</span>
                  {dirty && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>

        {selected && draft ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {selected.titulo}
                    <Badge variant="secondary" className="font-normal">
                      v{selected.versao}
                    </Badge>
                  </CardTitle>
                  {selected.descricao && (
                    <CardDescription>{selected.descricao}</CardDescription>
                  )}
                  {selected.updatedAt && (
                    <p className="text-xs text-muted-foreground">
                      Atualizado em{" "}
                      {new Date(selected.updatedAt).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreview}
                    disabled={previewing}
                    data-testid="lgpd-preview"
                  >
                    {previewing ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="mr-2 h-3.5 w-3.5" />
                    )}
                    Pré-visualizar PDF
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!isDirty || updateTemplate.isPending}
                    data-testid="lgpd-save"
                  >
                    {updateTemplate.isPending ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-3.5 w-3.5" />
                    )}
                    Salvar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lgpd-titulo">Título</Label>
                <Input
                  id="lgpd-titulo"
                  value={draft.titulo}
                  onChange={(e) =>
                    patchDraft(selected.slug, { titulo: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lgpd-corpo">Corpo do termo</Label>
                <Textarea
                  id="lgpd-corpo"
                  value={draft.corpo}
                  onChange={(e) =>
                    patchDraft(selected.slug, { corpo: e.target.value })
                  }
                  className="min-h-[420px] font-mono text-xs leading-relaxed"
                />
                <p className="text-xs text-muted-foreground">
                  Use a pré-visualização para conferir como o termo ficará no PDF
                  final antes de salvar.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex items-center justify-center">
            <p className="py-16 text-sm text-muted-foreground">
              Selecione um modelo para editar.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
