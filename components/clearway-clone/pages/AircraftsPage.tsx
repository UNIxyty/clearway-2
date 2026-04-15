import { aircrafts } from "@/components/clearway-clone/mockData";
import { PanelShell } from "@/components/clearway-clone/ui";

export default function AircraftsPage() {
  return (
    <PanelShell title="Aircrafts">
      <div className="rounded-md bg-[#1f2e45] p-6">
        <div className="grid grid-cols-4 gap-4">
          {aircrafts.map((tail, index) => (
            <button
              key={tail}
              type="button"
              className={`h-14 rounded-sm text-3xl ${
                index % 4 === 1 || index % 7 === 0 ? "bg-[#111d2e] text-slate-100" : "bg-[#324059] text-slate-100"
              }`}
            >
              {tail}
            </button>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}
