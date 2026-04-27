import { HitlCountryViewerClient } from "@/components/hitl-country-viewer-client";

type NetherlandsHitlViewerClientProps = {
  noVncUrl: string;
  sessionId: string;
  closeOnClear: boolean;
};

export default function NetherlandsHitlViewerClient({
  noVncUrl,
  sessionId,
  closeOnClear,
}: NetherlandsHitlViewerClientProps) {
  return (
    <HitlCountryViewerClient
      countryKey="netherlands"
      countryName="Netherlands"
      backHref="/netherlands-hitl-auto-test"
      noVncUrl={noVncUrl}
      sessionId={sessionId}
      closeOnClear={closeOnClear}
    />
  );
}
