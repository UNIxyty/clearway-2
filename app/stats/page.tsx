import { redirect } from "next/navigation";

export default function StatsRedirect() {
  redirect("/account/search-stats");
}
