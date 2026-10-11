"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PButton } from "@/components/portal/ui";

type Props = {
  open: boolean;
  initialIcao?: string | null;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: { airportIcao: string; description: string }) => Promise<void> | void;
};

export default function BugReportModal({
  open,
  initialIcao,
  submitting = false,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [airportIcao, setAirportIcao] = useState("");
  const [description, setDescription] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    setAirportIcao(String(initialIcao || "").trim().toUpperCase());
    setDescription("");
  }, [open, initialIcao]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-cw-bg-scrim px-4 py-6 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-cw-bg-surface text-cw-text shadow-cw-pop">
        <div className="border-b border-cw-divider px-5 py-4">
          <h2 className="text-base font-bold">Found a bug</h2>
          <p className="mt-1 text-xs text-cw-text-muted">
            Sends to the Clearway team
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-xs font-semibold text-cw-text-muted">Airport where bug appeared</span>
            <input
              value={airportIcao}
              onChange={(e) => setAirportIcao(e.target.value.toUpperCase())}
              placeholder="e.g. EHAM"
              className="mt-1.5 h-10 w-full rounded-[10px] border border-cw-border-control bg-cw-bg-surface px-3 font-mono text-sm text-cw-text outline-none transition-colors placeholder:text-cw-text-muted focus:border-cw-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-cw-text-muted">Describe a bug</span>
            <textarea
              className="mt-1.5 min-h-24 w-full rounded-[10px] border border-cw-border-control bg-cw-bg-surface px-3 py-2 text-sm leading-relaxed text-cw-text outline-none transition-colors placeholder:text-cw-text-muted focus:border-cw-primary"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what failed and what you expected."
            />
          </label>
          {error && (
            <div className="rounded-[10px] border border-cw-danger-border bg-cw-danger-tint px-3 py-2 text-xs text-cw-danger-text">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2.5 border-t border-cw-divider bg-cw-bg-page px-5 py-4">
          <PButton type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </PButton>
          <PButton
            type="button"
            variant="primary"
            onClick={() => onSubmit({ airportIcao, description })}
            disabled={submitting}
          >
            {submitting ? "Sending..." : "Send"}
          </PButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
