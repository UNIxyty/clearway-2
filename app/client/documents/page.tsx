// /client/documents (switch documents, lib/clients/allow.mjs): the AIP pages for the airports on their flights.
import { ClientDocuments } from "../wall";

export const metadata = { title: "Documents" };

export default function ClientDocumentsPage() {
  return <ClientDocuments />;
}
