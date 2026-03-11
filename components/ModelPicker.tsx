"use client";

import { useState } from "react";
import { ModelInfo, getModel, getModelsByProvider, formatCost, calculateAIPCost, calculateGENCost } from "@/lib/models";
import { ModelInfoCard } from "@/components/ModelInfoCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { AlertTriangleIcon, ShieldAlertIcon, SparklesIcon } from "lucide-react";

type ModelPickerProps = {
  value: string;
  onChange: (modelId: string) => void;
  type: "aip" | "gen";
  label?: string;
  onExpensiveModelSelected?: (model: ModelInfo) => void;
};

function ExpensiveBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
      <SparklesIcon className="size-2.5" />
      Premium
    </span>
  );
}

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
                <span className="flex items-center">
                  {model.name}
                  {model.expensive && <ExpensiveBadge />}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Anthropic (OpenRouter)</SelectLabel>
            {anthropic.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <span className="flex items-center">
                  {model.name}
                  {model.expensive && <ExpensiveBadge />}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {/* Expensive model consent */}
      {showConsent && pendingModelInfo && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div className="flex items-center justify-center size-8 rounded-full bg-amber-100 dark:bg-amber-900/50">
                <ShieldAlertIcon className="size-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="font-semibold text-amber-800 dark:text-amber-300">Premium Model Selected</div>
                <div className="font-normal text-xs text-amber-700/80 dark:text-amber-400/70">{pendingModelInfo.name}</div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="rounded-lg bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-amber-800/80 dark:text-amber-300/80">
                  Estimated cost per {type === "aip" ? "extraction" : "rewrite"}
                </span>
                <span className="text-lg font-bold text-amber-900 dark:text-amber-200">
                  {formatCost(pendingCost)}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-amber-800/70 dark:text-amber-400/60">
              <AlertTriangleIcon className="size-3.5 mt-0.5 shrink-0" />
              <span>
                This model is significantly more expensive than standard options.
                Confirm only if you understand the cost implications.
              </span>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmExpensive}
                className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
              >
                Confirm selection
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancelExpensive}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Model info card */}
      {selectedModel && !showConsent && (
        <ModelInfoCard model={selectedModel} type={type} />
      )}
    </div>
  );
}
