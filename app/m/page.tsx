import { redirect } from "next/navigation";

// The phone's home is the wall app's phone surface (v3): one app for staff and clients.
export default function MobileHome() {
  redirect("/digital-wall/phone/");
}
