import { redirect } from "next/navigation";

// Rendered per request so the redirect is a real 307 (a static page would answer 200 with a meta refresh).
export const dynamic = "force-dynamic";

// /admin is the portal's Admin section; its first page is Users. (It used to forward to the Pickem console.)
export default function Page() {
  redirect("/admin/users");
}
