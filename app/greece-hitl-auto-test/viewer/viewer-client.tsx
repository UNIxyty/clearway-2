import { HitlCountryViewerClient } from "@/components/hitl-country-viewer-client";

type GreeceHitlViewerClientProps = {
  noVncUrl: string;
  sessionId: string;
  closeOnClear: boolean;
};

export default function GreeceHitlViewerClient({ noVncUrl, sessionId, closeOnClear }: GreeceHitlViewerClientProps) {
  return (
    <HitlCountryViewerClient
      countryKey="greece"
      countryName="Greece"
      noVncUrl={noVncUrl}
      sessionId={sessionId}
      closeOnClear={closeOnClear}
    />
  );
}
