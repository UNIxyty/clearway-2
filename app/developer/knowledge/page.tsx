import { redirect } from "next/navigation";

// The knowledge base moved under Ops Agent (design spec §5, §10). Old links keep working.
export default function KnowledgePage() {
  redirect("/agent/knowledge");
}
