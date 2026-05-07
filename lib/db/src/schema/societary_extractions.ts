import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { clinicDocumentsTable } from "./clinic_documents";

export const societaryExtractionsTable = pgTable(
  "societary_extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinicsTable.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => clinicDocumentsTable.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    extraction: jsonb("extraction").notNull(),
    status: text("status").notNull().default("ready"),
    errorMessage: text("error_message"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clinicIdx: index("societary_extractions_clinic_idx").on(t.clinicId),
    docIdx: index("societary_extractions_document_idx").on(t.documentId),
  }),
);

export type SocietaryExtraction = typeof societaryExtractionsTable.$inferSelect;
