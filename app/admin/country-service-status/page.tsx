import { redirect } from "next/navigation";

export default function CountryServiceStatusRedirect() {
  redirect("/admin/service-status");
}
