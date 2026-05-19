import {
  GLOBAL_APPLICATIONS_SCOPE,
  getApplications,
  type ApplicationRecord,
} from "@/lib/application-store";
import { getSessionUserId } from "@/lib/session";

export async function getApplicationsForSession(): Promise<ApplicationRecord[]> {
  const userId = await getSessionUserId();
  if (userId) {
    const userRecords = await getApplications(userId);
    if (userRecords.length > 0) {
      return userRecords;
    }
  }
  return getApplications(GLOBAL_APPLICATIONS_SCOPE);
}
