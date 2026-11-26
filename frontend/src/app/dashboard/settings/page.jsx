import { redirect } from "next/navigation";

// Settings opens on Notifications until the other tabs exist.
export default function SettingsIndex() {
  redirect("/dashboard/settings/notifications");
}
