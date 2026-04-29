"use client";

import { Button } from "@/components/ui/button";

type CaptchaConsentDialogProps = {
  open: boolean;
  country: string;
  onContinue: () => void;
  onDontShowAgain: () => void;
  onClose: () => void;
};

export function CaptchaConsentDialog({
  open,
  country,
  onContinue,
  onDontShowAgain,
  onClose,
}: CaptchaConsentDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-lg border bg-background p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Captcha verification required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {country || "This country"} uses reCAPTCHA and may require manual verification.
          Wait for automatic solve, or press the captcha checkbox in the popup if prompted.
          The popup closes automatically when verification is complete.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={onContinue}>
            Continue and open popup
          </Button>
          <Button type="button" variant="outline" onClick={onDontShowAgain}>
            Don&apos;t show again
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
