"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

  useEffect(() => {
    if (!open) return;
    setAirportIcao(String(initialIcao || "").trim().toUpperCase());
    setDescription("");
  }, [open, initialIcao]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 px-4 py-6">
      <div className="mx-auto max-w-md rounded-lg border bg-background shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Found a bug</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Send bug details and airport ICAO to support.
          </p>
        </div>
        <div className="space-y-3 px-4 py-3">
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Airport where bug appeared</span>
            <Input
              value={airportIcao}
              onChange={(e) => setAirportIcao(e.target.value.toUpperCase())}
              placeholder="e.g. EHAM"
              className="mt-1"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Describe a bug</span>
            <textarea
              className="mt-1 w-full min-h-24 rounded-md border bg-background px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what failed and what you expected."
            />
          </label>
          {error && (
            <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ airportIcao, description })}
            disabled={submitting}
          >
            {submitting ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
