import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, PdfFooter, PdfBody, SectionHeading, styles } from "./PdfTemplate";

function getSevColor(sev: number): string {
  if (sev <= 6) return "#22c55e";
  if (sev <= 14) return "#f59e0b";
  return "#ef4444";
}
function getSevLabel(sev: number): string {
  if (sev <= 6) return "Baixo";
  if (sev <= 14) return "Médio";
  return "Alto";
}

function getCellBg(prob: number, impact: number): string {
  const sev = prob * impact;
  if (sev <= 6) return "#dcfce7";
  if (sev <= 14) return "#fef9c3";
  return "#fee2e2";
}

type Risk = {
  id: string;
  nome: string;
  pilarSlug: string | null;
  probabilidade: number;
  impacto: number;
  severidade: number;
  responsavel: string | null;
  acoesMitigadoras: string | null;
  status: string;
};

type MapaRiscosPdfProps = {
  clinicName: string;
  date: string;
  risks: Risk[];
};

export function MapaRiscosPdf({ clinicName, date, risks }: MapaRiscosPdfProps) {
  const sorted = [...risks].sort((a, b) => b.severidade - a.severidade);
  const high = risks.filter(r => r.severidade > 14).length;
  const medium = risks.filter(r => r.severidade >= 7 && r.severidade <= 14).length;
  const low = risks.filter(r => r.severidade <= 6).length;

  const CELL_SIZE = 36;
  const LABEL_WIDTH = 24;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfHeader clinicName={clinicName} date={date} />
        <PdfBody>
          <Text style={styles.reportTitle}>Mapa de Riscos</Text>
          <Text style={styles.reportSubtitle}>Análise de riscos por probabilidade e impacto</Text>

          <View style={styles.infoGrid}>
            <View style={[styles.infoItem, { borderColor: "#fca5a5", backgroundColor: "#fef2f2" }]}>
              <Text style={[styles.infoLabel, { color: "#ef4444" }]}>Riscos Altos</Text>
              <Text style={[styles.infoValue, { color: "#ef4444" }]}>{high}</Text>
            </View>
            <View style={[styles.infoItem, { borderColor: "#fde68a", backgroundColor: "#fffbeb" }]}>
              <Text style={[styles.infoLabel, { color: "#f59e0b" }]}>Riscos Médios</Text>
              <Text style={[styles.infoValue, { color: "#f59e0b" }]}>{medium}</Text>
            </View>
            <View style={[styles.infoItem, { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" }]}>
              <Text style={[styles.infoLabel, { color: "#22c55e" }]}>Riscos Baixos</Text>
              <Text style={[styles.infoValue, { color: "#22c55e" }]}>{low}</Text>
            </View>
          </View>

          <SectionHeading>Matriz de Risco (Probabilidade × Impacto)</SectionHeading>

          <View style={{ marginBottom: 12 }}>
            {/* Matrix grid: rows = impact 5→1, cols = prob 1→5 */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {/* Y-axis label */}
              <View style={{ width: LABEL_WIDTH, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 7, color: "#64748b", transform: "rotate(-90deg)" }}>IMPACTO</Text>
              </View>
              <View>
                {[5, 4, 3, 2, 1].map(impact => (
                  <View key={impact} style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 7, color: "#64748b", width: 12, textAlign: "center" }}>{impact}</Text>
                    {[1, 2, 3, 4, 5].map(prob => {
                      const sev = prob * impact;
                      const cellRisks = risks.filter(r => r.probabilidade === prob && r.impacto === impact);
                      const bg = getCellBg(prob, impact);
                      return (
                        <View
                          key={prob}
                          style={{
                            width: CELL_SIZE,
                            height: CELL_SIZE,
                            backgroundColor: bg,
                            borderWidth: 0.5,
                            borderColor: "#e2e8f0",
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ fontSize: 6, color: "#64748b", marginBottom: 1 }}>{sev}</Text>
                          {cellRisks.length > 0 && (
                            <View style={{
                              width: 14,
                              height: 14,
                              borderRadius: 7,
                              backgroundColor: getSevColor(sev),
                              justifyContent: "center",
                              alignItems: "center",
                            }}>
                              <Text style={{ fontSize: 6, color: "#fff", fontFamily: "Helvetica-Bold" }}>
                                {cellRisks.length}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
                {/* X-axis labels */}
                <View style={{ flexDirection: "row", marginLeft: 12 }}>
                  {[1, 2, 3, 4, 5].map(p => (
                    <Text key={p} style={{ width: CELL_SIZE, fontSize: 7, color: "#64748b", textAlign: "center" }}>{p}</Text>
                  ))}
                </View>
                <Text style={{ fontSize: 7, color: "#64748b", textAlign: "center", marginTop: 2, marginLeft: 12 }}>PROBABILIDADE →</Text>
              </View>
              <View style={{ marginLeft: 16, alignSelf: "flex-start", paddingTop: 8 }}>
                <Text style={[styles.infoLabel, { marginBottom: 6 }]}>Legenda</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#dcfce7", marginRight: 4, borderWidth: 0.5, borderColor: "#bbf7d0" }} />
                  <Text style={{ fontSize: 7, color: "#374151" }}>Baixo (≤6)</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#fef9c3", marginRight: 4, borderWidth: 0.5, borderColor: "#fde68a" }} />
                  <Text style={{ fontSize: 7, color: "#374151" }}>Médio (7–14)</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#fee2e2", marginRight: 4, borderWidth: 0.5, borderColor: "#fca5a5" }} />
                  <Text style={{ fontSize: 7, color: "#374151" }}>Alto (≥15)</Text>
                </View>
                <Text style={[styles.infoLabel, { marginTop: 8, marginBottom: 4 }]}>Número = qtd. riscos</Text>
              </View>
            </View>
          </View>

          <SectionHeading>Riscos por Severidade (Decrescente)</SectionHeading>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Risco</Text>
              <Text style={styles.tableHeaderCell}>Prob.</Text>
              <Text style={styles.tableHeaderCell}>Impacto</Text>
              <Text style={styles.tableHeaderCell}>Sev.</Text>
              <Text style={styles.tableHeaderCell}>Nível</Text>
              <Text style={styles.tableHeaderCell}>Status</Text>
            </View>
            {sorted.map((r, i) => (
              <View key={r.id} style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? "#fafafa" : "#ffffff" }]}>
                <Text style={[styles.tableCell, { flex: 2 }]}>{r.nome}</Text>
                <Text style={styles.tableCell}>{r.probabilidade}</Text>
                <Text style={styles.tableCell}>{r.impacto}</Text>
                <Text style={styles.tableCell}>{r.severidade}</Text>
                <Text style={[styles.tableCell, { color: getSevColor(r.severidade), fontFamily: "Helvetica-Bold" }]}>{getSevLabel(r.severidade)}</Text>
                <Text style={styles.tableCell}>{r.status}</Text>
              </View>
            ))}
            {sorted.length === 0 && (
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>Nenhum risco cadastrado</Text>
              </View>
            )}
          </View>

          {sorted.filter(r => r.acoesMitigadoras).length > 0 && (
            <>
              <SectionHeading>Planos de Mitigação</SectionHeading>
              {sorted.filter(r => r.acoesMitigadoras).map(r => (
                <View key={r.id} style={styles.card}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={styles.cardTitle}>{r.nome}</Text>
                    <Text style={[styles.badge, { backgroundColor: getSevColor(r.severidade), color: "#fff" }]}>{getSevLabel(r.severidade)}</Text>
                  </View>
                  {r.responsavel && <Text style={[styles.bodyText, { marginBottom: 4 }]}>Responsável: {r.responsavel}</Text>}
                  <Text style={styles.bodyText}>{r.acoesMitigadoras}</Text>
                </View>
              ))}
            </>
          )}
        </PdfBody>
        <PdfFooter reportName="Mapa de Riscos" />
      </Page>
    </Document>
  );
}
