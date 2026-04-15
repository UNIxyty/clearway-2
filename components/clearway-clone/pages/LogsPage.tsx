import { logs } from "@/components/clearway-clone/mockData";
import { CellRow, DataTable, PanelShell } from "@/components/clearway-clone/ui";

export default function LogsPage() {
  return (
    <PanelShell
      title="Logs"
      actions={
        <div className="flex items-center gap-1 text-2xl text-slate-200">
          <button type="button" className="size-10 rounded-sm bg-[#63718e]">|&lt;</button>
          <button type="button" className="size-10 rounded-sm bg-[#63718e]">&lt;</button>
          <button type="button" className="size-10 rounded-sm bg-[#63718e]">1</button>
          <button type="button" className="size-10 rounded-sm bg-[#63718e]">2</button>
        </div>
      }
    >
      <DataTable headers={["Date", "User", "Role", "Action", "Log"]}>
        {logs.map((item) => (
          <CellRow key={item.id}>
            <td className="px-4 py-3 tabular-nums">{item.date}</td>
            <td className="px-4 py-3">{item.user}</td>
            <td className="px-4 py-3">{item.role}</td>
            <td className="px-4 py-3">{item.action}</td>
            <td className="px-4 py-3 text-pretty">{item.message}</td>
          </CellRow>
        ))}
      </DataTable>
    </PanelShell>
  );
}
