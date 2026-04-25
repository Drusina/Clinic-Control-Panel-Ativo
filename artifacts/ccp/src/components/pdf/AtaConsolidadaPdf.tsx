import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, PdfFooter, PdfBody, SectionHeading, styles } from "./PdfTemplate";

type KickoffData = {
  id: string;
  clinicId: string;
  dataSessao: string | null;
  participantes: unknown;
  objetivosDiscutidos: string | null;
  decisoes: string | null;
  proximosPassos: string | null;
  responsavelAtaEmail: string | null;
  statusGeral: string | null;
};

type AtaConsolidadaPdfProps = {
  clinicName: string;
  date: string;
  kickoffs: KickoffData[];
};

export function AtaConsolidadaPdf({ clinicName, date, kickoffs }: AtaConsolidadaPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfHeader clinicName={clinicName} date={date} />
        <PdfBody>
          <Text style={styles.reportTitle}>Ata Consolidada</Text>
          <Text style={styles.reportSubtitle}>Registros das sessões de kick-off</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Total de Sessões</Text>
              <Text style={styles.infoValue}>{kickoffs.length}</Text>
            </View>
          </View>

          {kickoffs.length === 0 && (
            <Text style={[styles.bodyText, { textAlign: "center", marginTop: 24 }]}>Nenhuma sessão de kick-off registrada.</Text>
          )}

          {kickoffs.map((k, idx) => (
            <View key={k.id} style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.cardTitle}>
                Sessão {idx + 1} {k.dataSessao ? `— ${new Date(k.dataSessao).toLocaleDateString("pt-BR")}` : ""}
              </Text>

              {k.responsavelAtaEmail && (
                <Text style={[styles.bodyText, { marginBottom: 6 }]}>Responsável: {k.responsavelAtaEmail}</Text>
              )}

              {Array.isArray(k.participantes) && (k.participantes as string[]).length > 0 && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={[styles.infoLabel, { marginBottom: 3 }]}>Participantes</Text>
                  <Text style={styles.bodyText}>{(k.participantes as string[]).join(", ")}</Text>
                </View>
              )}

              {k.objetivosDiscutidos && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={[styles.infoLabel, { marginBottom: 3 }]}>Objetivos Discutidos</Text>
                  <Text style={styles.bodyText}>{k.objetivosDiscutidos}</Text>
                </View>
              )}

              {k.decisoes && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={[styles.infoLabel, { marginBottom: 3 }]}>Decisões</Text>
                  <Text style={styles.bodyText}>{k.decisoes}</Text>
                </View>
              )}

              {k.proximosPassos && (
                <View style={{ marginBottom: 4 }}>
                  <Text style={[styles.infoLabel, { marginBottom: 3 }]}>Próximos Passos</Text>
                  <Text style={styles.bodyText}>{k.proximosPassos}</Text>
                </View>
              )}

              {k.statusGeral && (
                <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#e2e8f0" }}>
                  <Text style={[styles.infoLabel, { marginBottom: 2 }]}>Status Geral</Text>
                  <Text style={[styles.bodyText, { fontFamily: "Helvetica-Bold" }]}>{k.statusGeral}</Text>
                </View>
              )}
            </View>
          ))}
        </PdfBody>
        <PdfFooter reportName="Ata Consolidada" />
      </Page>
    </Document>
  );
}
