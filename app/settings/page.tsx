"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/ModelPicker";
import { ArrowLeftIcon } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();

  const [aipModel, setAipModel] = useState<string>("gpt-4.1-mini");
  const [genModel, setGenModel] = useState<string>("gpt-4.1-mini");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((res) => res.json())
      .then((data) => {
        if (data.preferences) {
          setAipModel(data.preferences.aip_model || "gpt-4.1-mini");
          setGenModel(data.preferences.gen_model || "gpt-4.1-mini");
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load preferences");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setError(null);
    setSuccess(false);
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
        setError(data.error || "Failed to save");
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError((e as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
          >
            <ArrowLeftIcon className="size-4 mr-1" />
            Back
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Model Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which AI models to use for AIP extraction and GEN rewriting
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            Settings saved successfully
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">AIP Extraction Model</CardTitle>
              <CardDescription>
                Model used to extract airport data from AIP PDFs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ModelPicker
                value={aipModel}
                onChange={setAipModel}
                type="aip"
              />
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">GEN Rewriting Model</CardTitle>
              <CardDescription>
                Model used to rewrite GEN 1.2 sections into prose
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ModelPicker
                value={genModel}
                onChange={setGenModel}
                type="gen"
              />
            </CardContent>
          </Card>
        </div>
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Browser Notifications</CardTitle>
            <CardDescription>Manage notification permissions and event toggles on a separate page.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={() => router.push("/settings/notifications")}>
              Open Notification Settings
            </Button>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
          <Button variant="outline" onClick={() => router.push("/profile")}>
            Back to Profile
          </Button>
        </div>

        <Card className="border-border/70 bg-muted/20">
          <CardHeader>
            <CardTitle className="text-sm">About AI Models</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>
              <strong>Speed:</strong> How quickly the model processes requests.
            </p>
            <p>
              <strong>Thinking Power:</strong> Reasoning ability and handling of complex extraction tasks.
            </p>
            <p>
              <strong>Consistency:</strong> How reliably the model produces high-quality, structured output.
            </p>
            <p className="pt-2 border-t border-border/60">
              Costs are approximate based on typical token usage. Actual costs may vary.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
