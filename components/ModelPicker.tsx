"use client";

import { useState } from "react";
import { ModelInfo, getModel, getModelsByProvider, formatCost, calculateAIPCost, calculateGENCost } from "@/lib/models";
import { ModelInfoCard } from "@/components/ModelInfoCard";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ModelPickerProps = {
  value: string;
  onChange: (modelId: string) => void;
  type: "aip" | "gen";
  label?: string;
  onExpensiveModelSelected?: (model: ModelInfo) => void;
};

export function ModelPicker({
  value,
  onChange,
  type,
  label,
  onExpensiveModelSelected,
}: ModelPickerProps) {
  const [showConsent, setShowConsent] = useState(false);
  const [pendingModel, setPendingModel] = useState<string | null>(null);

  const { openai, anthropic } = getModelsByProvider();
  const selectedModel = getModel(value);

  const handleChange = (modelId: string) => {
    const model = getModel(modelId);
    if (!model) return;

    // Show consent banner for expensive models
    if (model.expensive) {
      setPendingModel(modelId);
      setShowConsent(true);
      if (onExpensiveModelSelected) {
        onExpensiveModelSelected(model);
      }
    } else {
      setShowConsent(false);
      setPendingModel(null);
      onChange(modelId);
    }
  };

  const handleConfirmExpensive = () => {
    if (pendingModel) {
      onChange(pendingModel);
      setShowConsent(false);
      setPendingModel(null);
    }
  };

  const handleCancelExpensive = () => {
    setShowConsent(false);
    setPendingModel(null);
  };

  const pendingModelInfo = pendingModel ? getModel(pendingModel) : null;
  const pendingCost = pendingModelInfo
    ? type === "aip"
      ? calculateAIPCost(pendingModelInfo)
      : calculateGENCost(pendingModelInfo)
    : 0;

  return (
    <div className="space-y-4">
      {label && <Label>{label}</Label>}
      
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>OpenAI</SelectLabel>
            {openai.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
                {model.expensive && " 💎"}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Anthropic (OpenRouter)</SelectLabel>
            {anthropic.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
                {model.expensive && " 💎"}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {/* Expensive model consent banner */}
      {showConsent && pendingModelInfo && (
        <div className="border-l-4 border-destructive bg-destructive/10 p-4 rounded-lg space-y-3">
          <div>
            <p className="font-semibold text-destructive text-sm">⚠️ Warning: Expensive Model</p>
            <p className="text-sm text-foreground mt-1">
              {type === "aip"
                ? `An AIP extraction will cost approximately ${formatCost(pendingCost)}`
                : `A GEN rewrite will cost approximately ${formatCost(pendingCost)}`}
              .
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Continue only if you understand the cost implications.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmExpensive}
              className="px-3 py-1.5 text-xs font-medium rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              I understand, continue
            </button>
            <button
              type="button"
              onClick={handleCancelExpensive}
              className="px-3 py-1.5 text-xs font-medium rounded border border-border hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Model info card */}
      {selectedModel && !showConsent && (
        <ModelInfoCard model={selectedModel} type={type} />
      )}
    </div>
  );
}
