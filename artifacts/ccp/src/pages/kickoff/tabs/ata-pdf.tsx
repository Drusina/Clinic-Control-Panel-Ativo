import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import type { KickoffProximoPasso } from "@/hooks/use-kickoff-api";

const colors = {
  primary: "#1a56db",
  dark: "#111827",
  gray: "#6b7280",
  lightGray: "#f3f4f6",
  border: "#e5e7eb",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    color: colors.dark,
    fontSize: 10,
    backgroundColor: colors.white,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingBottom: 12,
    marginBottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    letterSpacing: 1,
  },
  brandSub: {
    fontSize: 8,
    color: colors.gray,
    marginTop: 2,
  },
  docTitle: {
    fontSize: 10,
    color: colors.gray,
    textAlign: "right",
  },
  clinicBox: {
    backgroundColor: colors.lightGray,
    borderRadius: 6,
    padding: 12,
    marginBottom: 20,
  },
  clinicName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: colors.dark,
  },
  clinicDate: {
    fontSize: 9,
    color: colors.gray,
    marginTop: 4,
  },
  metaGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  metaCard: {
    flex: 1,
    minWidth: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
  },
  metaLabel: {
    fontSize: 8,
    color: colors.gray,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.dark,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 5,
    marginBottom: 10,
  },
  listItem: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 5,
    paddingLeft: 4,
  },
  bullet: {
    color: colors.primary,
    fontFamily: "Helvetica-Bold",
    width: 14,
  },
  listText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    borderRadius: 4,
    padding: "6 10",
    marginBottom: 2,
  },
  tableHeaderCell: {
    color: colors.white,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    flex: 1,
  },
  tableRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    padding: "6 10",
    marginBottom: 2,
  },
  tableCell: {
    flex: 1,
    fontSize: 9,
    color: colors.dark,
  },
  participantRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 5,
    gap: 8,
  },
  emptyMsg: {
    fontSize: 9,
    color: colors.gray,
    fontStyle: "italic",
    paddingLeft: 4,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: "auto",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: colors.gray,
  },
});

interface AtaPdfProps {
  clinicName: string;
  date: string;
  modalidade: string;
  duracao: number;
  facilitador: string;
  status: string;
  participantes: string[];
  pauta: string[];
  proximosPassos: KickoffProximoPasso[];
}

function statusLabel(s: string) {
  switch (s) {
    case "realizado": return "Realizado";
    case "validado": return "Validado";
    default: return "Rascunho";
  }
}

function modalidadeLabel(m: string) {
  switch (m) {
    case "presencial": return "Presencial";
    case "hibrido": return "Híbrido";
    default: return "Remoto";
  }
}

export function AtaPdfDocument({
  clinicName,
  date,
  modalidade,
  duracao,
  facilitador,
  status,
  participantes,
  pauta,
  proximosPassos,
}: AtaPdfProps) {
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const meetingDate = date
    ? new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "Data não definida";

  return (
    <Document title={`Ata de Reunião — ${clinicName}`} author="IONEX360">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>IONEX360</Text>
            <Text style={styles.brandSub}>Gestão de Clínicas Estéticas</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Ata de Reunião de Kick-off</Text>
            <Text style={[styles.docTitle, { fontSize: 8, marginTop: 2 }]}>Gerado em: {today}</Text>
          </View>
        </View>

        {/* Clinic info */}
        <View style={styles.clinicBox}>
          <Text style={styles.clinicName}>{clinicName}</Text>
          <Text style={styles.clinicDate}>Data da reunião: {meetingDate}</Text>
        </View>

        {/* Meeting metadata */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Modalidade</Text>
            <Text style={styles.metaValue}>{modalidadeLabel(modalidade)}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Duração</Text>
            <Text style={styles.metaValue}>{duracao} minutos</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Facilitador</Text>
            <Text style={styles.metaValue}>{facilitador || "—"}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={[styles.metaValue, { color: status === "aprovada" ? "#059669" : colors.gray }]}>
              {statusLabel(status)}
            </Text>
          </View>
        </View>

        {/* Participantes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Participantes</Text>
          {participantes.length === 0 ? (
            <Text style={styles.emptyMsg}>Nenhum participante registrado.</Text>
          ) : (
            participantes.map((p, i) => (
              <View key={i} style={styles.participantRow}>
                <Text style={[styles.bullet, { width: 18 }]}>{i + 1}.</Text>
                <Text style={styles.listText}>{p}</Text>
              </View>
            ))
          )}
        </View>

        {/* Pauta */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pauta</Text>
          {pauta.length === 0 ? (
            <Text style={styles.emptyMsg}>Nenhum item de pauta registrado.</Text>
          ) : (
            pauta.map((item, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.bullet}>{i + 1}.</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))
          )}
        </View>

        {/* Próximos Passos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Próximos Passos</Text>
          {proximosPassos.length === 0 ? (
            <Text style={styles.emptyMsg}>Nenhum próximo passo registrado.</Text>
          ) : (
            <>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Ação</Text>
                <Text style={styles.tableHeaderCell}>Responsável</Text>
                <Text style={styles.tableHeaderCell}>Prazo</Text>
              </View>
              {proximosPassos.map((p, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{p.acao}</Text>
                  <Text style={styles.tableCell}>{p.responsavel}</Text>
                  <Text style={styles.tableCell}>{p.prazo || "—"}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>IONEX360 — Plataforma de Gestão de Clínicas Estéticas</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
