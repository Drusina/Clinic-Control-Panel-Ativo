import { Document, Page, Text, View, Svg, Circle, Polygon, Line } from "@react-pdf/renderer";
import { PdfHeader, PdfFooter, PdfBody, SectionHeading, styles } from "./PdfTemplate";

const PILARES = [
  { slug: "estrategia", nome: "Estratégia e Governança" },
  { slug: "financeiro", nome: "Financeiro e Fluxo de Caixa" },
  { slug: "contabil", nome: "Contabilidade e Fiscal" },
  { slug: "marketing", nome: "Vendas, Marketing e Captação" },
  { slug: "operacoes", nome: "Processos Operacionais" },
  { slug: "pessoas", nome: "Gestão de Pessoas e Cultura" },
  { slug: "tecnologia", nome: "Tecnologia e Sistemas" },
  { slug: "compliance", nome: "Compliance e Regulamentação" },
];

const N = PILARES.length;
const CX = 110;
const CY = 110;
const MAX_R = 90;
const LABEL_R = 104;
const MAX_SCORE = 5;

function polarToXY(angle: number, r: number): [number, number] {
  const rad = (angle * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function getAngle(idx: number): number {
  return -90 + (360 / N) * idx;
}

function makePolygonPoints(scores: number[]): string {
  return scores
    .map((s, i) => {
      const r = (Math.max(0, Math.min(MAX_SCORE, s)) / MAX_SCORE) * MAX_R;
      const [x, y] = polarToXY(getAngle(i), r);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function makeGridPoints(pct: number): string {
  return Array.from({ length: N }, (_, i) => {
    const r = (pct / 100) * MAX_R;
    const [x, y] = polarToXY(getAngle(i), r);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function getScoreColor(score: number): string {
  if (score >= 3.5) return "#22c55e";
  if (score >= 2.0) return "#f59e0b";
  return "#ef4444";
}
function getScoreLabel(score: number): string {
  if (score >= 3.5) return "Bom";
  if (score >= 2.0) return "Regular";
  return "Crítico";
}
function scorePct(score: number): string {
  return ((score / MAX_SCORE) * 100).toFixed(0) + "%";
}

type InsightItem = { pilar: string; titulo: string; descricao: string };
type InsightActionItem = InsightItem & { prioridade?: string; prazo?: string };
type InsightCriticalItem = InsightItem & { impacto?: string };

type InsightsIa = {
  pontos_fortes?: InsightItem[];
  pontos_criticos?: InsightCriticalItem[];
  acoes_sugeridas?: InsightActionItem[];
};

export type DiagnosticoPdfQuestion = {
  id: string;
  pilarSlug: string;
  pilarNome: string;
  pilarOrdem: number;
  texto: string;
  tipo: string;
  ordem: number;
};

export type DiagnosticoPdfProps = {
  clinicName: string;
  date: string;
  scoreGlobal: number;
  scoresPilares: Record<string, number>;
  insightsIa?: InsightsIa | null;
  questions?: DiagnosticoPdfQuestion[];
  respostas?: Record<string, string>;
};

function formatAnswer(tipo: string, valor: string | undefined | null): string {
  if (valor == null || valor === "") return "Sem resposta";
  switch (tipo) {
    case "sim_nao":
      return valor === "sim" ? "Sim" : valor === "nao" ? "Não" : valor;
    case "escala_1_5":
      return `${valor} / 5`;
    default:
      return valor;
  }
}

type QuestionsByPilar = {
  slug: string;
  nome: string;
  ordem: number;
  questions: DiagnosticoPdfQuestion[];
}[];

function groupQuestionsByPilar(questions: DiagnosticoPdfQuestion[]): QuestionsByPilar {
  const map = new Map<string, { slug: string; nome: string; ordem: number; questions: DiagnosticoPdfQuestion[] }>();
  for (const q of questions) {
    let row = map.get(q.pilarSlug);
    if (!row) {
      row = { slug: q.pilarSlug, nome: q.pilarNome, ordem: q.pilarOrdem, questions: [] };
      map.set(q.pilarSlug, row);
    }
    row.questions.push(q);
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => a.ordem - b.ordem);
  for (const g of groups) g.questions.sort((a, b) => a.ordem - b.ordem);
  return groups;
}

export function DiagnosticoPdf({ clinicName, date, scoreGlobal, scoresPilares, insightsIa, questions, respostas }: DiagnosticoPdfProps) {
  const scores = PILARES.map(p => scoresPilares[p.slug] ?? 0);
  const dataPoints = makePolygonPoints(scores);
  const grid20 = makeGridPoints(20);
  const grid40 = makeGridPoints(40);
  const grid60 = makeGridPoints(60);
  const grid80 = makeGridPoints(80);
  const grid100 = makeGridPoints(100);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfHeader clinicName={clinicName} date={date} />
        <PdfBody>
          <Text style={styles.reportTitle}>Diagnóstico 360°</Text>
          <Text style={styles.reportSubtitle}>Avaliação completa por pilares operacionais (escala 0–5)</Text>

          <View style={[styles.infoGrid, { marginBottom: 16 }]}>
            <View style={[styles.infoItem, { backgroundColor: "#0f172a", borderColor: "#0f172a" }]}>
              <Text style={[styles.infoLabel, { color: "#94a3b8" }]}>Score Global</Text>
              <Text style={[styles.infoValue, { color: "#f59e0b", fontSize: 22 }]}>
                {scoreGlobal.toFixed(1)} / {MAX_SCORE}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Classificação</Text>
              <Text style={[styles.infoValue, { color: getScoreColor(scoreGlobal) }]}>{getScoreLabel(scoreGlobal)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Pilares Avaliados</Text>
              <Text style={styles.infoValue}>{scores.filter(s => s > 0).length}/{N}</Text>
            </View>
          </View>

          <SectionHeading>Radar de Scores por Pilar</SectionHeading>

          <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 12 }}>
            <Svg width={220} height={220} viewBox="0 0 220 220">
              <Polygon points={grid100} fill="none" stroke="#e2e8f0" strokeWidth={0.8} />
              <Polygon points={grid80} fill="none" stroke="#e2e8f0" strokeWidth={0.6} />
              <Polygon points={grid60} fill="none" stroke="#e2e8f0" strokeWidth={0.6} />
              <Polygon points={grid40} fill="none" stroke="#e2e8f0" strokeWidth={0.6} />
              <Polygon points={grid20} fill="none" stroke="#e2e8f0" strokeWidth={0.6} />

              {PILARES.map((_, i) => {
                const [x, y] = polarToXY(getAngle(i), MAX_R);
                return (
                  <Line
                    key={i}
                    x1={CX}
                    y1={CY}
                    x2={x.toFixed(1)}
                    y2={y.toFixed(1)}
                    stroke="#cbd5e1"
                    strokeWidth={0.5}
                  />
                );
              })}

              <Polygon points={dataPoints} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={1.5} />

              {scores.map((s, i) => {
                const r = (Math.max(0, Math.min(MAX_SCORE, s)) / MAX_SCORE) * MAX_R;
                const [x, y] = polarToXY(getAngle(i), r);
                return <Circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={3} fill={getScoreColor(s)} />;
              })}

              <Circle cx={CX} cy={CY} r={2} fill="#64748b" />

              {/* Scale labels (1, 2, 3, 4, 5) on vertical axis */}
              {[1, 2, 3, 4, 5].map(v => {
                const r = (v / MAX_SCORE) * MAX_R;
                const [lx, ly] = polarToXY(-90, r);
                return (
                  <Text key={v} style={{ fontSize: 5.5, fill: "#94a3b8" }} x={lx + 2} y={ly}>{v}</Text>
                );
              })}

              {/* Axis labels */}
              {PILARES.map((p, i) => {
                const [lx, ly] = polarToXY(getAngle(i), LABEL_R);
                const words = p.nome.split(" ");
                const label = words[0];
                return (
                  <Text
                    key={i}
                    style={{ fontSize: 6.5, fill: "#374151", fontFamily: "Helvetica-Bold" }}
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                  >
                    {label}
                  </Text>
                );
              })}
            </Svg>

            <View style={{ flex: 1, paddingLeft: 12, paddingTop: 8 }}>
              <Text style={[styles.infoLabel, { marginBottom: 6 }]}>Scores por Pilar</Text>
              {PILARES.map((pilar, i) => {
                const score = scores[i];
                return (
                  <View key={pilar.slug} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getScoreColor(score), marginRight: 5 }} />
                    <Text style={{ fontSize: 6.5, color: "#374151", flex: 1 }}>
                      {pilar.nome.split(" ")[0]}
                    </Text>
                    <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: getScoreColor(score) }}>
                      {score.toFixed(1)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <SectionHeading>Análise por Pilar (escala 0–5)</SectionHeading>
          <View>
            {PILARES.map(pilar => {
              const score = scoresPilares[pilar.slug] ?? 0;
              const barWidth = scorePct(score);
              return (
                <View key={pilar.slug} style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>{pilar.nome}</Text>
                  <View style={styles.scoreBarContainer}>
                    <View style={[styles.scoreBarFill, { width: barWidth, backgroundColor: getScoreColor(score) }]} />
                  </View>
                  <Text style={[styles.scoreValue, { color: getScoreColor(score) }]}>
                    {score.toFixed(1)}/5
                  </Text>
                </View>
              );
            })}
          </View>

          <SectionHeading>Resumo por Pilar</SectionHeading>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Pilar</Text>
              <Text style={styles.tableHeaderCell}>Score</Text>
              <Text style={styles.tableHeaderCell}>Status</Text>
            </View>
            {PILARES.map(pilar => {
              const score = scoresPilares[pilar.slug] ?? 0;
              return (
                <View key={pilar.slug} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{pilar.nome}</Text>
                  <Text style={styles.tableCell}>{score.toFixed(1)} / 5</Text>
                  <Text style={[styles.tableCell, { color: getScoreColor(score), fontFamily: "Helvetica-Bold" }]}>
                    {getScoreLabel(score)}
                  </Text>
                </View>
              );
            })}
          </View>

          {insightsIa && (
            <>
              {insightsIa.pontos_fortes && insightsIa.pontos_fortes.length > 0 && (
                <>
                  <SectionHeading>Pontos Fortes (IA)</SectionHeading>
                  {insightsIa.pontos_fortes.map((item, idx) => (
                    <View key={idx} style={[styles.card, { borderLeftWidth: 3, borderLeftColor: "#22c55e" }]}>
                      <Text style={[styles.cardTitle, { color: "#166534" }]}>{item.titulo}</Text>
                      <Text style={[styles.bodyText, { fontSize: 7, color: "#64748b", marginBottom: 3 }]}>
                        Pilar: {item.pilar}
                      </Text>
                      <Text style={styles.bodyText}>{item.descricao}</Text>
                    </View>
                  ))}
                </>
              )}

              {insightsIa.pontos_criticos && insightsIa.pontos_criticos.length > 0 && (
                <>
                  <SectionHeading>Pontos Críticos (IA)</SectionHeading>
                  {insightsIa.pontos_criticos.map((item, idx) => (
                    <View key={idx} style={[styles.card, { borderLeftWidth: 3, borderLeftColor: "#ef4444" }]}>
                      <Text style={[styles.cardTitle, { color: "#991b1b" }]}>{item.titulo}</Text>
                      <Text style={[styles.bodyText, { fontSize: 7, color: "#64748b", marginBottom: 3 }]}>
                        Pilar: {item.pilar}{item.impacto ? ` | Impacto: ${item.impacto}` : ""}
                      </Text>
                      <Text style={styles.bodyText}>{item.descricao}</Text>
                    </View>
                  ))}
                </>
              )}

              {insightsIa.acoes_sugeridas && insightsIa.acoes_sugeridas.length > 0 && (
                <>
                  <SectionHeading>Ações Sugeridas (IA)</SectionHeading>
                  {insightsIa.acoes_sugeridas.map((item, idx) => (
                    <View key={idx} style={[styles.card, { borderLeftWidth: 3, borderLeftColor: "#3b82f6" }]}>
                      <Text style={[styles.cardTitle, { color: "#1e3a8a" }]}>{item.titulo}</Text>
                      <Text style={[styles.bodyText, { fontSize: 7, color: "#64748b", marginBottom: 3 }]}>
                        Pilar: {item.pilar}
                        {item.prioridade ? ` | Prioridade: ${item.prioridade}` : ""}
                        {item.prazo ? ` | Prazo: ${item.prazo}` : ""}
                      </Text>
                      <Text style={styles.bodyText}>{item.descricao}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          {questions && questions.length > 0 && (
            <>
              <SectionHeading>Perguntas e Respostas por Pilar</SectionHeading>
              {groupQuestionsByPilar(questions).map(group => (
                <View key={group.slug} style={{ marginBottom: 10 }} wrap={false}>
                  <Text style={[styles.cardTitle, { marginBottom: 4 }]}>{group.nome}</Text>
                  {group.questions.map(q => {
                    const answer = formatAnswer(q.tipo, respostas?.[q.id]);
                    const unanswered = respostas?.[q.id] == null || respostas?.[q.id] === "";
                    return (
                      <View
                        key={q.id}
                        style={{
                          flexDirection: "row",
                          marginBottom: 3,
                          paddingBottom: 3,
                          borderBottomWidth: 0.5,
                          borderBottomColor: "#e2e8f0",
                        }}
                      >
                        <Text style={{ fontSize: 7.5, color: "#374151", flex: 1, paddingRight: 8 }}>
                          {q.ordem}. {q.texto}
                        </Text>
                        <Text
                          style={{
                            fontSize: 7.5,
                            fontFamily: "Helvetica-Bold",
                            color: unanswered ? "#94a3b8" : "#0f172a",
                            width: 70,
                            textAlign: "right",
                          }}
                        >
                          {answer}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </>
          )}
        </PdfBody>
        <PdfFooter reportName="Diagnóstico 360°" />
      </Page>
    </Document>
  );
}
