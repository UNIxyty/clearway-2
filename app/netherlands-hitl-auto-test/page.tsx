import { HitlCountryAutoTestPage } from "@/components/hitl-country-auto-test-page";

export default function NetherlandsHitlAutoTestPage() {
  return (
    <HitlCountryAutoTestPage
      countryKey="netherlands"
      countryName="Netherlands"
      defaultIcao="EHAM"
      pageHref="/netherlands-hitl-auto-test"
      viewerHref="/netherlands-hitl-auto-test/viewer"
      windowName="netherlands_hitl_auto_viewer"
      title="Netherlands HITL auto test"
      description="Dedicated Selenium + noVNC workflow for Netherlands Cloudflare/captcha solve, then auto run collect/GEN/AD2 from the unlocked browser session."
    />
  );
}
