import { Document, Page, Text, View } from "@react-pdf/renderer";
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

type Delegacao = {
  id: string;
  pilarSlug: string;
  responsavelEmail: string | null;
  status: string;
  createdAt: string;
};

type DelegacaoPdfProps = {
  clinicName: string;
  date: string;
  delegacoes: Delegacao[];
};

function getStatusColor(status: string): string {
  switch (status) {
    case "aceito": return "#22c55e";
    case "pendente": return "#f59e0b";
    case "recusado": return "#ef4444";
    default: return "#64748b";
  }
}

export function DelegacaoPdf({ clinicName, date, delegacoes }: DelegacaoPdfProps) {
  const accepted = delegacoes.filter(d => d.status === "aceito").length;
  const pending = delegacoes.filter(d => d.status === "pendente").length;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfHeader clinicName={clinicName} date={date} />
        <PdfBody>
          <Text style={styles.reportTitle}>Relatório de Delegação</Text>
          <Text style={styles.reportSubtitle}>Responsáveis por pilar operacional</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Total Delegações</Text>
              <Text style={styles.infoValue}>{delegacoes.length}</Text>
            </View>
            <View style={[styles.infoItem, { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" }]}>
              <Text style={[styles.infoLabel, { color: "#22c55e" }]}>Aceitas</Text>
              <Text style={[styles.infoValue, { color: "#22c55e" }]}>{accepted}</Text>
            </View>
            <View style={[styles.infoItem, { borderColor: "#fde68a", backgroundColor: "#fffbeb" }]}>
              <Text style={[styles.infoLabel, { color: "#f59e0b" }]}>Pendentes</Text>
              <Text style={[styles.infoValue, { color: "#f59e0b" }]}>{pending}</Text>
            </View>
          </View>

          <SectionHeading>Delegações por Pilar</SectionHeading>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Pilar</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Responsável</Text>
              <Text style={styles.tableHeaderCell}>Status</Text>
              <Text style={styles.tableHeaderCell}>Data</Text>
            </View>
            {PILARES.map(pilar => {
              const del = delegacoes.find(d => d.pilarSlug === pilar.slug);
              return (
                <View key={pilar.slug} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{pilar.nome}</Text>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{del?.responsavelEmail ?? "Não delegado"}</Text>
                  <Text style={[styles.tableCell, { color: del ? getStatusColor(del.status) : "#94a3b8", fontFamily: "Helvetica-Bold" }]}>
                    {del ? del.status : "—"}
                  </Text>
                  <Text style={styles.tableCell}>
                    {del ? new Date(del.createdAt).toLocaleDateString("pt-BR") : "—"}
                  </Text>
                </View>
              );
            })}
          </View>
        </PdfBody>
        <PdfFooter reportName="Relatório de Delegação" />
      </Page>
    </Document>
  );
}
