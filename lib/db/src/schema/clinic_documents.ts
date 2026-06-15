import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { documentCategoriesTable } from "./document_categories";

export const clinicDocumentsTable = pgTable(
  "clinic_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinicsTable.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => documentCategoriesTable.id, { onDelete: "restrict" }),
    sequenceNumber: integer("sequence_number").notNull().default(1),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    storagePath: text("storage_path").notNull(),
    fileSize: integer("file_size"),
    fileType: text("file_type"),
    // SHA-256 hex digest of the file bytes, used to detect duplicate uploads
    // within a clinic. Nullable for rows created before this column existed.
    contentHash: text("content_hash"),
    uploadedBy: text("uploaded_by"),
    summary: text("summary"),
    summarizedAt: timestamp("summarized_at", { withTimezone: true }),
    summaryAnalysisMode: text("summary_analysis_mode"),
    summaryPagesAnalyzed: integer("summary_pages_analyzed"),
    summaryTotalPages: integer("summary_total_pages"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clinicIdx: index("clinic_documents_clinic_idx").on(t.clinicId),
    categoryIdx: index("clinic_documents_category_idx").on(t.categoryId),
    clinicContentHashIdx: index("clinic_documents_clinic_content_hash_idx").on(
      t.clinicId,
      t.contentHash,
    ),
  }),
);

export type ClinicDocument = typeof clinicDocumentsTable.$inferSelect;
