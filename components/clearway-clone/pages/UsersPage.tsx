"use client";

import { users } from "@/components/clearway-clone/mockData";
import { CellRow, DataTable, Modal, PanelShell, TextInput } from "@/components/clearway-clone/ui";
import { useState } from "react";

export default function UsersPage() {
  const [open, setOpen] = useState(false);
  return (
    <PanelShell
      title="Users"
      actions={
        <button
          type="button"
          className="h-12 rounded-md bg-[#63718e] px-4 text-2xl text-slate-100"
          onClick={() => setOpen(true)}
        >
          Invite new user
        </button>
      }
    >
      <DataTable headers={["Email", "First name", "Last name", "Latest activity", "Role", "Actions"]}>
        {users.map((item) => (
          <CellRow key={item.email}>
            <td className="px-4 py-3">{item.email}</td>
            <td className="px-4 py-3">{item.firstName}</td>
            <td className="px-4 py-3">{item.lastName}</td>
            <td className="px-4 py-3 tabular-nums">{item.latestActivity}</td>
            <td className="px-4 py-3">{item.role}</td>
            <td className="px-4 py-3">
              <div className="flex gap-2">
                <button type="button" className="h-10 rounded-md bg-[#63718e] px-3 text-xl">
                  Delete
                </button>
                <button type="button" className="h-10 rounded-md bg-[#63718e] px-3 text-xl">
                  {item.active ? "Ban" : "Unban"}
                </button>
              </div>
            </td>
          </CellRow>
        ))}
      </DataTable>
      <Modal
        open={open}
        title="User invitation form"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="h-12 rounded-md bg-[#8f9197] px-8 text-2xl" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="h-12 rounded-md bg-[#65a644] px-8 text-2xl">
              Save
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Email" placeholder="Email" />
          <label htmlFor="inv-role" className="block text-2xl text-slate-300">
            <span className="mb-2 block">Role</span>
            <select id="inv-role" className="h-14 w-full rounded-md border border-slate-800 bg-[#0f1a2b] px-3 text-2xl">
              <option>ADMIN</option>
              <option>USER</option>
            </select>
          </label>
          <TextInput label="First name" placeholder="First name" />
          <TextInput label="Last name" placeholder="Last name" />
        </div>
      </Modal>
    </PanelShell>
  );
}
