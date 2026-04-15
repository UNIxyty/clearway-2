import { caaDetails } from "@/components/clearway-clone/mockData";
import { PanelShell, TextInput } from "@/components/clearway-clone/ui";

export default function CaaDetailsPage() {
  return (
    <PanelShell
      title="CAA Details"
      actions={<button className="h-12 rounded-md bg-[#65a644] px-4 text-2xl text-slate-100">Update</button>}
    >
      <div className="grid gap-4 rounded-md bg-[#1f2e45] p-6">
        <div className="grid grid-cols-2 gap-4">
          <TextInput label="Country" placeholder={caaDetails.country} />
          <div />
          <TextInput label="Authority name" placeholder={caaDetails.authorityName} />
          <TextInput label="Contact email" placeholder={caaDetails.contactEmail} />
          <TextInput label="Contact phones" placeholder={caaDetails.contactPhones} />
          <TextInput label="Website" placeholder={caaDetails.website} />
          <TextInput label="Actual address" placeholder={caaDetails.actualAddress} />
          <TextInput label="Financial address" placeholder={caaDetails.financialAddress} />
          <TextInput label="Working hours" placeholder={caaDetails.workingHours} />
        </div>
        <TextInput label="Notes" placeholder={caaDetails.notes} />
      </div>
    </PanelShell>
  );
}
