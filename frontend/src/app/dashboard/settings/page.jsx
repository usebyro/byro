import { redirect } from "next/navigation";

// Settings opens on the first tab.
export default function SettingsIndex() {
  redirect("/dashboard/settings/account");
}
