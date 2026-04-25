import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
    paddingTop: 0,
    paddingBottom: 50,
    paddingHorizontal: 0,
  },
  header: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 36,
    paddingVertical: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  logoIonex: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 1,
  },
  logo360: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#f59e0b",
    letterSpacing: 1,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  headerClinic: {
    fontSize: 11,
    color: "#e2e8f0",
    fontFamily: "Helvetica-Bold",
  },
  headerDate: {
    fontSize: 9,
    color: "#94a3b8",
    marginTop: 2,
  },
  body: {
    paddingHorizontal: 36,
    paddingTop: 24,
  },
  reportTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 4,
  },
  reportSubtitle: {
    fontSize: 10,
    color: "#64748b",
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 8,
    marginTop: 16,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  bodyText: {
    fontSize: 10,
    color: "#374151",
    lineHeight: 1.6,
  },
  table: {
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#475569",
    flex: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  tableCell: {
    fontSize: 9,
    color: "#374151",
    flex: 1,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    alignSelf: "flex-start",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  footerText: {
    fontSize: 8,
    color: "#94a3b8",
  },
  pageNumber: {
    fontSize: 8,
    color: "#94a3b8",
  },
  card: {
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 4,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  infoItem: {
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    padding: 8,
    flex: 1,
    minWidth: "45%",
  },
  infoLabel: {
    fontSize: 8,
    color: "#64748b",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  scoreLabel: {
    fontSize: 9,
    color: "#374151",
    width: 130,
  },
  scoreBarContainer: {
    flex: 1,
    height: 10,
    backgroundColor: "#e2e8f0",
    borderRadius: 5,
  },
  scoreBarFill: {
    height: 10,
    borderRadius: 5,
    backgroundColor: "#3b82f6",
  },
  scoreValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    width: 30,
    textAlign: "right",
  },
});

export { styles };

export function PdfHeader({ clinicName, date }: { clinicName: string; date: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.logo}>
        <Text style={styles.logoIonex}>IONEX</Text>
        <Text style={styles.logo360}>360</Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerClinic}>{clinicName}</Text>
        <Text style={styles.headerDate}>{date}</Text>
      </View>
    </View>
  );
}

export function PdfFooter({ reportName }: { reportName: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>IONEX360 — {reportName}</Text>
      <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function PdfBody({ children }: { children: React.ReactNode }) {
  return <View style={styles.body}>{children}</View>;
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionHeading}>{children}</Text>;
}
