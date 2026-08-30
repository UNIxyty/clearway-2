import PortalShell from "@/components/portal/Shell";
import { PCard } from "@/components/portal/ui";

export default function GuidePage() {
  return (
    <PortalShell
      title="Guide"
      crumb="/account/guide"
      subtitle="The Digital Wall & Console user guide."
    >
      <div className="px-[30px] pb-10 pt-[26px]">
        <PCard className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#eef0f2] px-[18px] py-2.5">
            <span className="text-[12.5px] font-semibold text-[#6c7079]">
              Digital Wall &amp; Console user guide
            </span>
            <a
              href="/digital-wall/guide/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12.5px] font-semibold text-[#2563eb] hover:underline"
            >
              Open full screen
            </a>
          </div>
          <iframe
            src="/digital-wall/guide/"
            title="Digital Wall & Console user guide"
            className="h-[calc(100vh-220px)] w-full border-0"
          />
        </PCard>
      </div>
    </PortalShell>
  );
}
