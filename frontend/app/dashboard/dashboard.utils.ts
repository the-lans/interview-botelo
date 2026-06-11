import { DISPLAY_TIME_ZONE } from "./dashboard.config";
import { dashboardCopy } from "./dashboard.copy";

export function formatProgressDate(value: string | null): string {
  if (!value) {
    return dashboardCopy.step4.unchangedDate;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return dashboardCopy.step4.unavailableDate;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(parsed);
}
