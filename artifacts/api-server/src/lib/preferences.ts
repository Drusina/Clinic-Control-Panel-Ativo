import { db, teamTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface NotificationPrefs {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = { emailEnabled: true, whatsappEnabled: true };

export async function getRecipientPrefs(email: string): Promise<NotificationPrefs> {
  try {
    const [member] = await db
      .select({ notificationPreferences: teamTable.notificationPreferences })
      .from(teamTable)
      .where(eq(teamTable.email, email))
      .limit(1);

    if (!member) return { ...DEFAULT_PREFS };
    return {
      emailEnabled: member.notificationPreferences?.emailEnabled ?? true,
      whatsappEnabled: member.notificationPreferences?.whatsappEnabled ?? true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
