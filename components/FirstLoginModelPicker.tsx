"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/ModelPicker";

type FirstLoginModelPickerProps = {
  onComplete: () => void;
};

export function FirstLoginModelPicker({ onComplete }: FirstLoginModelPickerProps) {
  const [aipModel, setAipModel] = useState<string>("gpt-4.1-mini");
  const [genModel, setGenModel] = useState<string>("gpt-4.1-mini");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aip_model: aipModel,
          gen_model: genModel,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save preferences");
        return;
      }

      onComplete();
    } catch (e) {
      setError((e as Error).message || "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl border-border/70 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Welcome to Clearway</CardTitle>
          <CardDescription>
            Before you begin, please select which AI models you'd like to use for data extraction and processing.
            You can change these later in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">AIP Extraction Model</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Used to extract airport data from AIP PDFs (~45k tokens per extraction)
              </p>
              <ModelPicker
                value={aipModel}
                onChange={setAipModel}
                type="aip"
              />
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">GEN Rewriting Model</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Used to rewrite GEN 1.2 sections into prose (~50k tokens per rewrite)
              </p>
              <ModelPicker
                value={genModel}
                onChange={setGenModel}
                type="gen"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border/60">
            <Button onClick={handleContinue} disabled={saving} size="lg" className="w-full sm:w-auto">
              {saving ? "Saving…" : "Continue to Portal"}
            </Button>
          </div>

          <div className="rounded-lg bg-muted/30 border border-border/60 p-3 text-xs text-muted-foreground">
            <strong>Note:</strong> Model selection affects processing costs. Review the pricing and performance
            metrics for each model before proceeding. You can change these settings at any time from your profile.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
