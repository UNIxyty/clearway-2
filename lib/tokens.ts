// Service-state chips (dashboard, service status): the four states as --cw-* tokens, so they follow the portal's
// light/dark theme. (This used to re-export shared/design-tokens.json — the wall's file — which the portal no longer
// imports.)
import { cw } from "@/lib/portal-tokens";

export const STATE_CHIP = {
  operational: { fg: cw.successText, bg: cw.successTint, dot: cw.success },
  degraded: { fg: cw.warningText, bg: cw.warningTint, dot: cw.warning },
  down: { fg: cw.dangerText, bg: cw.dangerTint, dot: cw.danger },
  unknown: { fg: cw.neutralText, bg: cw.neutralTint, dot: cw.neutral },
} as const;
export type StateChipKey = keyof typeof STATE_CHIP;
