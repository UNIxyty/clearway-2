import { redirect } from "next/navigation";

export default function NotificationSettingsRedirect() {
  redirect("/account/notifications");
}
