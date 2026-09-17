import HelpThread from "@/components/help/HelpThread";

export const dynamic = "force-dynamic";

export default function HelpThreadPage({ params }: { params: { ref: string } }) {
  return <HelpThread reference={decodeURIComponent(params.ref)} />;
}
