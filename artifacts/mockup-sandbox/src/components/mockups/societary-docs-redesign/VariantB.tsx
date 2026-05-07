import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  FileText,
  ExternalLink,
  Sparkles,
  Trash2,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  Pencil,
  History,
  ChevronDown,
  ChevronRight,
  Users,
} from "lucide-react";

type AnalysisMode = "text" | "vision";
type Status = "ready" | "error";

interface MockSocio {
  nome: string;
  cpf: string | null;
  percentual: number | null;
  valor_quotas: number | null;
}

interface MockDoc {
  id: string;
  tipo: string;
  status: Status;
  errorMessage: string | null;
  appliedAt: string | null;
  appliedSociosCount: number;
  capitalSocial: number | null;
  socios: MockSocio[];
  resumo: string | null;
  analysisMode: AnalysisMode | null;
  truncated: boolean;
  pagesAnalyzed: number | null;
  totalPages: number | null;
  createdAt: string;
  document: { title: string; fileName: string; fileSize: number };
}

const TIPO_LABEL: Record<string, string> = {
  contrato_social: "Contrato Social",
  alteracao: "Alteração Contratual",
  acordo_socios: "Acordo de Sócios",
  outro: "Outro",
};

const SOCIETARY_TIPOS = [
  { value: "contrato_social", label: "Contrato Social" },
  { value: "alteracao", label: "Alteração Contratual" },
  { value: "acordo_socios", label: "Acordo de Sócios" },
  { value: "outro", label: "Outro" },
];

function brl(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

function maskCpf(cpf: string | null): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D+/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.***-${d.slice(9)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

const MOCK_DOCS: MockDoc[] = [
  {
    id: "1",
    tipo: "contrato_social",
    status: "ready",
    errorMessage: null,
    appliedAt: null,
    appliedSociosCount: 0,
    capitalSocial: 250000,
    socios: [
      {
        nome: "Dra. Ana Beatriz Carvalho",
        cpf: "12345678901",
        percentual: 60,
        valor_quotas: 150000,
      },
      {
        nome: "Dr. Rafael Mendes Souza",
        cpf: "98765432100",
        percentual: 40,
        valor_quotas: 100000,
      },
    ],
    resumo:
      "Contrato Social da Clínica Vida Plena Ltda., constituída em 12/03/2024, com capital social de R$ 250.000,00 dividido entre dois sócios médicos.",
    analysisMode: "text",
    truncated: false,
    pagesAnalyzed: null,
    totalPages: null,
    createdAt: "2026-05-06T14:32:00Z",
    document: {
      title: "Contrato Social — Clínica Vida Plena Ltda. (12/03/2024)",
      fileName: "contrato-social-vida-plena.pdf",
      fileSize: 487000,
    },
  },
  {
    id: "2",
    tipo: "alteracao",
    status: "error",
    errorMessage:
      "PDF protegido por senha. Remova a proteção e envie novamente.",
    appliedAt: null,
    appliedSociosCount: 0,
    capitalSocial: null,
    socios: [],
    resumo: null,
    analysisMode: null,
    truncated: false,
    pagesAnalyzed: null,
    totalPages: null,
    createdAt: "2026-05-05T09:14:00Z",
    document: {
      title: "1ª Alteração Contratual",
      fileName: "alteracao-1.pdf",
      fileSize: 312000,
    },
  },
  {
    id: "3",
    tipo: "contrato_social",
    status: "ready",
    errorMessage: null,
    appliedAt: "2026-04-28T11:02:00Z",
    appliedSociosCount: 2,
    capitalSocial: 200000,
    socios: [],
    resumo: null,
    analysisMode: "text",
    truncated: false,
    pagesAnalyzed: null,
    totalPages: null,
    createdAt: "2026-04-28T10:55:00Z",
    document: {
      title: "Contrato Social — Versão original (2022)",
      fileName: "contrato-social-2022.pdf",
      fileSize: 401000,
    },
  },
  {
    id: "4",
    tipo: "acordo_socios",
    status: "ready",
    errorMessage: null,
    appliedAt: "2026-03-15T16:20:00Z",
    appliedSociosCount: 2,
    capitalSocial: null,
    socios: [],
    resumo: null,
    analysisMode: "vision",
    truncated: true,
    pagesAnalyzed: 8,
    totalPages: 12,
    createdAt: "2026-03-15T16:10:00Z",
    document: {
      title: "Acordo de Sócios — Cláusulas de Saída e Tag-Along",
      fileName: "acordo-socios-scan.pdf",
      fileSize: 1850000,
    },
  },
  {
    id: "5",
    tipo: "alteracao",
    status: "ready",
    errorMessage: null,
    appliedAt: "2026-02-10T13:48:00Z",
    appliedSociosCount: 1,
    capitalSocial: 250000,
    socios: [],
    resumo: null,
    analysisMode: "text",
    truncated: false,
    pagesAnalyzed: null,
    totalPages: null,
    createdAt: "2026-02-10T13:40:00Z",
    document: {
      title: "2ª Alteração — Aumento de Capital Social",
      fileName: "alteracao-2-capital.pdf",
      fileSize: 268000,
    },
  },
  {
    id: "6",
    tipo: "outro",
    status: "ready",
    errorMessage: null,
    appliedAt: null,
    appliedSociosCount: 0,
    capitalSocial: null,
    socios: [],
    resumo:
      "Documento societário sem sócios identificados na análise automática.",
    analysisMode: "vision",
    truncated: false,
    pagesAnalyzed: 3,
    totalPages: 3,
    createdAt: "2026-01-22T08:30:00Z",
    document: {
      title: "Procuração — Representação em Assembleia",
      fileName: "procuracao-assembleia.pdf",
      fileSize: 156000,
    },
  },
];

export function VariantB() {
  const [tipo, setTipo] = useState("contrato_social");
  const [historicoOpen, setHistoricoOpen] = useState(false);

  const pendentes = MOCK_DOCS.filter(
    (d) => d.status === "error" || (d.status === "ready" && !d.appliedAt),
  );
  const historico = MOCK_DOCS.filter(
    (d) => d.status === "ready" && !!d.appliedAt,
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Documentos Societários (com análise por IA)
          </CardTitle>
          <CardDescription>
            Envie o Contrato Social, Alterações Contratuais ou Acordo de Sócios
            (PDF até 10 MB). PDFs com texto e PDFs{" "}
            <span className="font-medium">escaneados</span> são suportados — quando
            o PDF é só imagem, as páginas são enviadas para a IA via análise
            visual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload */}
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] items-end p-3 border rounded-md bg-muted/30">
            <div className="space-y-1">
              <Label htmlFor="file-input">Arquivo</Label>
              <Input id="file-input" type="file" accept="application/pdf" />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOCIETARY_TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Enviar e analisar
            </Button>
          </div>

          {/* PENDENTES — em destaque */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <h3 className="text-sm font-semibold tracking-tight">
                  Pendentes de revisão
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {pendentes.length}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Documentos que precisam da sua atenção
              </p>
            </div>

            {pendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground border border-dashed rounded-md py-6 text-center">
                Nenhum documento pendente. 🎉
              </p>
            ) : (
              <div className="space-y-3">
                {pendentes.map((doc) => (
                  <PendingItem key={doc.id} doc={doc} />
                ))}
              </div>
            )}
          </div>

          {/* HISTÓRICO — colapsado */}
          <Collapsible open={historicoOpen} onOpenChange={setHistoricoOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {historicoOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <History className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    Histórico de documentos importados
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {historico.length}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {historicoOpen ? "Ocultar" : "Ver"}
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="rounded-md border overflow-hidden">
                <div className="divide-y">
                  {historico.map((doc) => (
                    <HistoryRow key={doc.id} doc={doc} />
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 px-1">
                Os arquivos continuam disponíveis na{" "}
                <span className="font-medium">Biblioteca de Documentos</span>{" "}
                mesmo após a remoção da análise.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
}

function PendingItem({ doc }: { doc: MockDoc }) {
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(doc.socios.map((_, i) => i)),
  );
  const [applyCapital, setApplyCapital] = useState(doc.capitalSocial != null);

  const togglePick = (i: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const showReanalyze =
    doc.status === "error" ||
    (doc.status === "ready" && doc.socios.length === 0);

  return (
    <div className="rounded-md border-2 border-amber-200 dark:border-amber-900/40 p-3 space-y-3 bg-amber-50/30 dark:bg-amber-950/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm truncate">
                {doc.document.title}
              </p>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                title="Editar título"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Badge variant="outline" className="text-xs">
                {TIPO_LABEL[doc.tipo]}
              </Badge>
              {doc.analysisMode === "vision" && (
                <Badge variant="outline" className="text-xs">
                  <Eye className="h-3 w-3 mr-1" />
                  PDF escaneado (visão)
                </Badge>
              )}
              {doc.truncated && (
                <Badge variant="outline" className="text-xs">
                  Análise parcial
                  {doc.pagesAnalyzed && doc.totalPages
                    ? ` (${doc.pagesAnalyzed}/${doc.totalPages} pp.)`
                    : ""}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {fmtDate(doc.createdAt)} •{" "}
              {(doc.document.fileSize / 1024).toFixed(0)} KB •{" "}
              <span className="font-mono">{doc.document.fileName}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Abrir">
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            title="Remover análise"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {doc.status === "error" && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>Não foi possível analisar este documento. {doc.errorMessage}</p>
        </div>
      )}

      {showReanalyze && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Re-analisar
          </Button>
        </div>
      )}

      {doc.status === "ready" && (
        <>
          {doc.resumo && (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Resumo</p>
              <p>{doc.resumo}</p>
            </div>
          )}
          {doc.capitalSocial != null && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={applyCapital}
                onCheckedChange={(v) => setApplyCapital(v === true)}
              />
              <span>
                Aplicar capital social sugerido:{" "}
                <strong>{brl(doc.capitalSocial)}</strong>
              </span>
            </label>
          )}
          {doc.socios.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Sócios extraídos</p>
              <div className="space-y-1">
                {doc.socios.map((s, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2 text-sm rounded-md border p-2 hover:bg-accent/30 cursor-pointer bg-card"
                  >
                    <Checkbox
                      checked={picked.has(i)}
                      onCheckedChange={() => togglePick(i)}
                      className="mt-0.5"
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 flex-1 text-xs">
                      <div className="sm:col-span-2 font-medium text-sm text-foreground">
                        {s.nome}
                      </div>
                      <div>
                        <span className="text-muted-foreground">CPF: </span>
                        {maskCpf(s.cpf)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Quotas: </span>
                        {s.percentual != null ? `${s.percentual}%` : "—"}
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">Valor: </span>
                        {brl(s.valor_quotas)}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
          {(doc.capitalSocial != null || doc.socios.length > 0) && (
            <div className="flex justify-end">
              <Button size="sm">Aplicar selecionados</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HistoryRow({ doc }: { doc: MockDoc }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/40 transition-colors">
      {/* date + status dot */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums w-20">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500 shrink-0" />
        {fmtShortDate(doc.appliedAt ?? doc.createdAt)}
      </div>

      {/* title + meta */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium truncate">{doc.document.title}</p>
          <Badge variant="outline" className="text-[10px] py-0 h-4">
            {TIPO_LABEL[doc.tipo]}
          </Badge>
          {doc.analysisMode === "vision" && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 h-4"
              title="PDF escaneado"
            >
              <Eye className="h-2.5 w-2.5 mr-0.5" />
              visão
            </Badge>
          )}
          {doc.truncated && (
            <Badge variant="outline" className="text-[10px] py-0 h-4">
              parcial
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {doc.appliedSociosCount > 0 ? (
            <>
              <Users className="inline h-3 w-3 mr-1 -mt-0.5" />
              {doc.appliedSociosCount} sócio
              {doc.appliedSociosCount > 1 ? "s" : ""} aplicado
              {doc.appliedSociosCount > 1 ? "s" : ""}
              {" · "}
            </>
          ) : (
            <>Sem sócios aplicados · </>
          )}
          <span className="font-mono">{doc.document.fileName}</span>
        </p>
      </div>

      {/* actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Abrir">
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="Re-analisar"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="Editar título"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          title="Remover análise"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
