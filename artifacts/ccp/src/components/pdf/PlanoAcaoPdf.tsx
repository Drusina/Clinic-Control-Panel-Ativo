import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, PdfFooter, PdfBody, SectionHeading, styles } from "./PdfTemplate";

const COLUNAS = [
  { key: "backlog", label: "Backlog" },
  { key: "doing", label: "Em Andamento" },
  { key: "review", label: "Em Revisão" },
  { key: "done", label: "Concluído" },
];

type Acao = {
  id: string;
  titulo: string;
  descricao: string | null;
  pilarSlug: string | null;
  coluna: string;
  prazo: string | null;
  responsavel?: string | null;
};

type PlanoAcaoPdfProps = {
  clinicName: string;
  date: string;
  acoes: Acao[];
};

function getColumnColor(coluna: string): string {
  switch (coluna) {
    case "backlog": return "#64748b";
    case "doing": return "#3b82f6";
    case "review": return "#f59e0b";
    case "done": return "#22c55e";
    default: return "#64748b";
  }
}

export function PlanoAcaoPdf({ clinicName, date, acoes }: PlanoAcaoPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfHeader clinicName={clinicName} date={date} />
        <PdfBody>
          <Text style={styles.reportTitle}>Plano de Ação Mensal</Text>
          <Text style={styles.reportSubtitle}>Ações organizadas por etapa de execução</Text>

          <View style={styles.infoGrid}>
            {COLUNAS.map(col => {
              const count = acoes.filter(a => a.coluna === col.key).length;
              return (
                <View key={col.key} style={styles.infoItem}>
                  <Text style={styles.infoLabel}>{col.label}</Text>
                  <Text style={[styles.infoValue, { color: getColumnColor(col.key) }]}>{count}</Text>
                </View>
              );
            })}
          </View>

          {COLUNAS.map(col => {
            const items = acoes.filter(a => a.coluna === col.key);
            if (items.length === 0) return null;
            return (
              <View key={col.key}>
                <SectionHeading>{col.label} ({items.length})</SectionHeading>
                <View style={styles.table}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Ação</Text>
                    <Text style={styles.tableHeaderCell}>Pilar</Text>
                    <Text style={styles.tableHeaderCell}>Prazo</Text>
                  </View>
                  {items.map((a, i) => (
                    <View key={a.id} style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? "#fafafa" : "#ffffff" }]}>
                      <View style={{ flex: 2 }}>
                        <Text style={styles.tableCell}>{a.titulo}</Text>
                        {a.descricao && <Text style={[styles.tableCell, { color: "#94a3b8", fontSize: 8 }]}>{a.descricao}</Text>}
                      </View>
                      <Text style={styles.tableCell}>{a.pilarSlug ?? "—"}</Text>
                      <Text style={styles.tableCell}>{a.prazo ?? "—"}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

          {acoes.length === 0 && (
            <Text style={[styles.bodyText, { textAlign: "center", marginTop: 24 }]}>Nenhuma ação cadastrada.</Text>
          )}
        </PdfBody>
        <PdfFooter reportName="Plano de Ação Mensal" />
      </Page>
    </Document>
  );
}
