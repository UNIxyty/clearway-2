"use client";

import { operators } from "@/components/clearway-clone/mockData";
import { CellRow, DataTable, Modal, PanelShell, TextInput } from "@/components/clearway-clone/ui";
import { useState } from "react";

export default function OperatorsPage() {
  const [open, setOpen] = useState(false);
  return (
    <PanelShell
      title="Operators"
      actions={
        <button
          type="button"
          className="h-12 rounded-md bg-[#63718e] px-4 text-2xl text-slate-100"
          onClick={() => setOpen(true)}
        >
          Create new operator
        </button>
      }
    >
      <DataTable headers={["", "Operator ID", "Name", "Flight count"]}>
        {operators.map((item) => (
          <CellRow key={item.operatorId}>
            <td className="px-4 py-3">▾</td>
            <td className="px-4 py-3">{item.operatorId}</td>
            <td className="px-4 py-3">{item.name}</td>
            <td className="px-4 py-3 tabular-nums">{item.flightCount}</td>
          </CellRow>
        ))}
      </DataTable>
      <Modal
        open={open}
        title="Operator creation form"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="mr-auto h-12 rounded-md bg-[#677592] px-8 text-2xl">
              Check refresh token
            </button>
            <button type="button" className="h-12 rounded-md bg-[#65a644] px-8 text-2xl">
              Save
            </button>
            <button type="button" className="h-12 rounded-md bg-[#8f9197] px-8 text-2xl" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Operator ID (leon credential)" placeholder="Operator ID" />
          <TextInput label="Operator name (custom)" placeholder="Custom name" />
        </div>
        <TextInput label="Refresh token" placeholder="Refresh token" />
      </Modal>
    </PanelShell>
  );
}
