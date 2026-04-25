import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentAccessLogTable = pgTable("document_access_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  objectPath: text("object_path").notNull(),
  accessedBy: text("accessed_by").notNull(),
  role: text("role").notNull(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentAccessLogSchema = createInsertSchema(documentAccessLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDocumentAccessLog = z.infer<typeof insertDocumentAccessLogSchema>;
export type DocumentAccessLog = typeof documentAccessLogTable.$inferSelect;
