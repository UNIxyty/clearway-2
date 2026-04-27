import { HitlCountryAutoTestPage } from "@/components/hitl-country-auto-test-page";

export default function GreeceHitlAutoTestPage() {
  return (
    <HitlCountryAutoTestPage
      countryKey="greece"
      countryName="Greece"
      defaultIcao="LGAV"
      pageHref="/greece-hitl-auto-test"
      viewerHref="/greece-hitl-auto-test/viewer"
      windowName="greece_hitl_auto_viewer"
      title="Greece HITL auto test"
      description="Lithuania-style Selenium + noVNC workflow for Greece captcha solve, then auto run collect/GEN/AD2."
    />
  );
}
