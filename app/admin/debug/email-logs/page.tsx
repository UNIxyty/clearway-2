import { redirect } from "next/navigation";

export default function EmailLogsRedirect() {
  redirect("/admin/email/logs");
}
