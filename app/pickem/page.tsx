import { PickemApp } from "@/components/pickem/pickem-app";

export const dynamic = "force-dynamic";

export default function PickemPage() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-10 pt-6">
      <PickemApp />
    </main>
  );
}
