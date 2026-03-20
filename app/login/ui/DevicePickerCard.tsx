"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

type DeviceProfile = {
  id: string;
  display_name: string | null;
};

export function DevicePickerCard({
  accountId,
  profiles,
  ipAddress,
  uaHash,
  onComplete,
  onBack,
}: {
  accountId: string;
  profiles: DeviceProfile[];
  ipAddress: string;
  uaHash: string;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueWithProfile() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          selectedProfileId: selectedProfileId || undefined,
          profileName: selectedProfileId ? undefined : profileName.trim(),
          ipAddress,
          uaHash,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to continue");
      onComplete();
    } catch (e: unknown) {
      setError((e as { message?: string })?.message || "Failed to continue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">New device detected</p>
        <p className="text-xs text-muted-foreground">
          Choose an existing profile or create a new one for this corporate login.
        </p>
      </div>
      {profiles.length > 0 && (
        <div className="space-y-2">
          <Label>Existing profiles</Label>
          <div className="space-y-2">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProfileId(p.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  selectedProfileId === p.id
                    ? "border-primary bg-primary/10"
                    : "border-border/60 bg-background hover:bg-muted/30"
                }`}
              >
                {p.display_name || "Unnamed profile"}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="profileName">Create new profile</Label>
        <Input
          id="profileName"
          value={profileName}
          onChange={(e) => {
            setProfileName(e.target.value);
            if (selectedProfileId) setSelectedProfileId("");
          }}
          placeholder="e.g. Ops Laptop 1"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          className="flex-1"
          onClick={continueWithProfile}
          disabled={loading || (!selectedProfileId && !profileName.trim())}
        >
          {loading ? "Saving..." : "Continue"}
        </Button>
        <Button type="button" variant="outline" onClick={onBack} disabled={loading}>
          Back
        </Button>
      </div>
    </div>
  );
}

