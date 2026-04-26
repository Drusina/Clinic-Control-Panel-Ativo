import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";

export const documentCategoriesTable = pgTable(
  "document_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinicsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ordem: integer("ordem").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clinicIdx: index("document_categories_clinic_idx").on(t.clinicId),
  }),
);

export type DocumentCategory = typeof documentCategoriesTable.$inferSelect;
