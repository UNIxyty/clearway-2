import ClientPage from "./client";
import PhoneRedirect from "@/components/m/PhoneRedirect";

export const dynamic = "force-dynamic";

export default function Page() {
  return <><PhoneRedirect to="/m/intake" /><ClientPage /></>;
}
