import { pgTable, uuid, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { docsConstitutivoTable } from "./docs_constitutivos";

export const docsConstitutivoFilesTable = pgTable(
  "docs_constitutivos_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docId: uuid("doc_id")
      .notNull()
      .references(() => docsConstitutivoTable.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    tamanho: integer("tamanho"),
    sequenceNumber: integer("sequence_number").notNull().default(1),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    docSeqUnique: uniqueIndex("docs_constitutivos_files_doc_seq_unique").on(
      t.docId,
      t.sequenceNumber,
    ),
  }),
);

export type DocConstitutivoFile = typeof docsConstitutivoFilesTable.$inferSelect;
