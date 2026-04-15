"use client";

import { limitations } from "@/components/clearway-clone/mockData";
import { CellRow, DataTable, Modal, PanelShell, TextInput } from "@/components/clearway-clone/ui";
import type { LimitationType } from "@/components/clearway-clone/types";
import { useMemo, useState } from "react";

export default function LimitationsPage() {
  const [typeFilter, setTypeFilter] = useState<LimitationType | "ALL">("ALL");
  const [open, setOpen] = useState(false);

  const visibleRows = useMemo(
    () => limitations.filter((item) => typeFilter === "ALL" || item.type === typeFilter),
    [typeFilter]
  );

  return (
    <PanelShell
      title="Limitations"
      actions={
        <div className="flex items-center gap-3">
          <label className="text-2xl text-slate-300" htmlFor="limit-type">
            Type
          </label>
          <select
            id="limit-type"
            className="h-12 rounded-md border border-slate-700 bg-[#111d2e] px-3 text-2xl"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as LimitationType | "ALL")}
          >
            <option value="ALL">All</option>
            <option value="MIXED">Mixed</option>
            <option value="AIRPORT">Airport</option>
            <option value="COUNTRY">Country</option>
            <option value="FLIGHT">Flight</option>
          </select>
          <button
            type="button"
            className="h-12 rounded-md bg-[#63718e] px-4 text-2xl text-slate-100"
            onClick={() => setOpen(true)}
          >
            Create new limitation
          </button>
        </div>
      }
    >
      <DataTable headers={["", "ID", "Permanent", "Start date", "End date", "Title", "Description", "Type"]}>
        {visibleRows.map((item) => (
          <CellRow key={item.id}>
            <td className="px-4 py-3">▾</td>
            <td className="px-4 py-3 tabular-nums">{item.id}</td>
            <td className="px-4 py-3">{String(item.isPermanent)}</td>
            <td className="px-4 py-3">{item.startDate || "Undefined"}</td>
            <td className="px-4 py-3">{item.endDate || "Undefined"}</td>
            <td className="px-4 py-3">{item.title}</td>
            <td className="px-4 py-3">{item.description}</td>
            <td className="px-4 py-3">{item.type}</td>
          </CellRow>
        ))}
      </DataTable>
      <Modal
        open={open}
        title="Limitation creation form"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="h-12 rounded-md bg-[#677592] px-8 text-2xl" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="h-12 rounded-md bg-[#65a644] px-8 text-2xl">
              Save
            </button>
          </>
        }
      >
        <div className="grid grid-cols-4 gap-4">
          <label className="flex items-center gap-2 text-2xl text-slate-300">
            <input type="checkbox" className="size-5 rounded border border-slate-600 bg-[#0f1a2b]" />
            Is permanent
          </label>
          <TextInput label="Start date" placeholder="09/04/2026, 17:04" />
          <TextInput label="End date" placeholder="09/04/2026, 17:04" />
          <label htmlFor="limitation-type" className="block text-2xl text-slate-300">
            <span className="mb-2 block">Type</span>
            <select id="limitation-type" className="h-14 w-full rounded-md border border-slate-800 bg-[#0f1a2b] px-3 text-2xl">
              <option>MIXED</option>
              <option>AIRPORT</option>
              <option>COUNTRY</option>
              <option>FLIGHT</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Title" placeholder="Title" />
          <TextInput label="Description" placeholder="Description" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <TextInput label="Airports" placeholder="Select airport" />
          <TextInput label="Countries" placeholder="Select country" />
          <TextInput label="Flights" placeholder="Select flight" />
        </div>
      </Modal>
    </PanelShell>
  );
}
