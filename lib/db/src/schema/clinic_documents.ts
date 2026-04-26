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
    uploadedBy: text("uploaded_by"),
    summary: text("summary"),
    summarizedAt: timestamp("summarized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clinicIdx: index("clinic_documents_clinic_idx").on(t.clinicId),
    categoryIdx: index("clinic_documents_category_idx").on(t.categoryId),
  }),
);

export type ClinicDocument = typeof clinicDocumentsTable.$inferSelect;
