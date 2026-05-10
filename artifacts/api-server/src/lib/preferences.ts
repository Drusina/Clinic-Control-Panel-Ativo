import { db, teamTable } from "@workspace/db";
import { and, sql } from "drizzle-orm";

export interface NotificationPrefs {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = { emailEnabled: true, whatsappEnabled: true };

export async function getRecipientPrefs(
  email: string,
  clinicId?: string,
): Promise<NotificationPrefs> {
  try {
    const emailMatch = sql`lower(${teamTable.email}) = lower(${email})`;
    const where = clinicId
      ? and(emailMatch, sql`${teamTable.clinicId} = ${clinicId}`)
      : emailMatch;

    const [member] = await db
      .select({ notificationPreferences: teamTable.notificationPreferences })
      .from(teamTable)
      .where(where)
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
