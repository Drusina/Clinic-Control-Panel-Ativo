import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, PdfFooter, PdfBody, SectionHeading, styles } from "./PdfTemplate";

type DocConstitutivoFile = {
  id: string;
  fileName: string;
  enviadoEm: string;
};

type DocConstitutivo = {
  id: string;
  categoria: string;
  nome: string;
  obrigatorio: boolean;
  files?: DocConstitutivoFile[];
  storagePath: string | null;
  tamanho: number | null;
  enviadoEm: string | null;
};

type DocsConstitutivosPdfProps = {
  clinicName: string;
  date: string;
  docs: DocConstitutivo[];
};

function hasFile(d: DocConstitutivo) {
  return (d.files && d.files.length > 0) || !!d.storagePath;
}

export function DocsConstitutivosPdf({ clinicName, date, docs }: DocsConstitutivosPdfProps) {
  const sent = docs.filter(hasFile).length;
  const pending = docs.filter(d => !hasFile(d)).length;
  const required = docs.filter(d => d.obrigatorio && !hasFile(d)).length;

  const grouped = docs.reduce((acc, doc) => {
    if (!acc[doc.categoria]) acc[doc.categoria] = [];
    acc[doc.categoria].push(doc);
    return acc;
  }, {} as Record<string, DocConstitutivo[]>);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfHeader clinicName={clinicName} date={date} />
        <PdfBody>
          <Text style={styles.reportTitle}>Documentos Constitutivos</Text>
          <Text style={styles.reportSubtitle}>Status de envio de documentos societários</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Total</Text>
              <Text style={styles.infoValue}>{docs.length}</Text>
            </View>
            <View style={[styles.infoItem, { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" }]}>
              <Text style={[styles.infoLabel, { color: "#22c55e" }]}>Enviados</Text>
              <Text style={[styles.infoValue, { color: "#22c55e" }]}>{sent}</Text>
            </View>
            <View style={[styles.infoItem, { borderColor: "#fde68a", backgroundColor: "#fffbeb" }]}>
              <Text style={[styles.infoLabel, { color: "#f59e0b" }]}>Pendentes</Text>
              <Text style={[styles.infoValue, { color: "#f59e0b" }]}>{pending}</Text>
            </View>
            {required > 0 && (
              <View style={[styles.infoItem, { borderColor: "#fca5a5", backgroundColor: "#fef2f2" }]}>
                <Text style={[styles.infoLabel, { color: "#ef4444" }]}>Obrig. Pendentes</Text>
                <Text style={[styles.infoValue, { color: "#ef4444" }]}>{required}</Text>
              </View>
            )}
          </View>

          {Object.entries(grouped).map(([categoria, items]) => (
            <View key={categoria}>
              <SectionHeading>{categoria}</SectionHeading>
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Documento</Text>
                  <Text style={styles.tableHeaderCell}>Obrigatório</Text>
                  <Text style={styles.tableHeaderCell}>Arquivos</Text>
                  <Text style={styles.tableHeaderCell}>Último envio</Text>
                </View>
                {items.map((doc, i) => {
                  const count = doc.files?.length ?? (doc.storagePath ? 1 : 0);
                  const last =
                    doc.files && doc.files.length > 0
                      ? doc.files[doc.files.length - 1].enviadoEm
                      : doc.enviadoEm;
                  return (
                    <View key={doc.id} style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? "#fafafa" : "#ffffff" }]}>
                      <Text style={[styles.tableCell, { flex: 2 }]}>{doc.nome}</Text>
                      <Text style={styles.tableCell}>{doc.obrigatorio ? "Sim" : "Não"}</Text>
                      <Text style={[styles.tableCell, {
                        color: count > 0 ? "#22c55e" : "#f59e0b",
                        fontFamily: "Helvetica-Bold"
                      }]}>
                        {count > 0 ? `${count} arquivo${count > 1 ? "s" : ""}` : "Pendente"}
                      </Text>
                      <Text style={styles.tableCell}>
                        {last ? new Date(last).toLocaleDateString("pt-BR") : "—"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}

          {docs.length === 0 && (
            <Text style={[styles.bodyText, { textAlign: "center", marginTop: 24 }]}>Nenhum documento cadastrado.</Text>
          )}
        </PdfBody>
        <PdfFooter reportName="Documentos Constitutivos" />
      </Page>
    </Document>
  );
}
