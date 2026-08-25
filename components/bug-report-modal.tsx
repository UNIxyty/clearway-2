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
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-[rgba(16,18,22,.42)] px-4 py-6 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white text-[#17181c] shadow-[0_24px_70px_rgba(16,18,22,.28)]">
        <div className="border-b border-[#eef0f2] px-5 py-4">
          <h2 className="text-base font-bold">Found a bug</h2>
          <p className="mt-1 text-xs text-[#6c7079]">
            Sends to the Clearway team
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-xs font-semibold text-[#6c7079]">Airport where bug appeared</span>
            <input
              value={airportIcao}
              onChange={(e) => setAirportIcao(e.target.value.toUpperCase())}
              placeholder="e.g. EHAM"
              className="mt-1.5 h-10 w-full rounded-[10px] border border-[#d6d8dc] bg-white px-3 font-mono text-sm text-[#17181c] outline-none transition-colors placeholder:text-[#9aa0a8] focus:border-[#2563eb]"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-[#6c7079]">Describe a bug</span>
            <textarea
              className="mt-1.5 min-h-24 w-full rounded-[10px] border border-[#d6d8dc] bg-white px-3 py-2 text-sm leading-relaxed text-[#17181c] outline-none transition-colors placeholder:text-[#9aa0a8] focus:border-[#2563eb]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what failed and what you expected."
            />
          </label>
          {error && (
            <div className="rounded-[10px] border border-[#f6cdcf] bg-[#fdf2f2] px-3 py-2 text-xs text-[#a12a2e]">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2.5 border-t border-[#eef0f2] bg-[#fbfbfc] px-5 py-4">
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
