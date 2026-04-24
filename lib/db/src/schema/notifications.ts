import { pgTable, text, uuid, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationsTable = pgTable("notificacoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id"),
  tipo: text("tipo").notNull(),
  titulo: text("titulo").notNull(),
  mensagem: text("mensagem"),
  lida: boolean("lida").notNull().default(false),
  acaoUrl: text("acao_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
