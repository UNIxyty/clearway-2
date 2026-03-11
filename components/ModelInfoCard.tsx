import { ModelInfo, calculateAIPCost, calculateGENCost, formatCost } from "@/lib/models";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type ModelInfoCardProps = {
  model: ModelInfo;
  type: "aip" | "gen";
};

export function ModelInfoCard({ model, type }: ModelInfoCardProps) {
  const cost = type === "aip" ? calculateAIPCost(model) : calculateGENCost(model);
  const costFormatted = formatCost(cost);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{model.name}</CardTitle>
        <CardDescription className="text-xs">
          {model.provider === "openai" ? "OpenAI" : "Anthropic (via OpenRouter)"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Performance metrics */}
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Speed</span>
              <span className="font-medium">{model.speed}/10</span>
            </div>
            <Progress value={model.speed * 10} className="h-1.5" />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Thinking Power</span>
              <span className="font-medium">{model.thinking}/10</span>
            </div>
            <Progress value={model.thinking * 10} className="h-1.5" />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Consistency</span>
              <span className="font-medium">{model.consistency}/10</span>
            </div>
            <Progress value={model.consistency * 10} className="h-1.5" />
          </div>
        </div>

        {/* Pricing */}
        <div className="pt-2 border-t border-border/60">
          <div className="text-xs text-muted-foreground mb-1">
            {type === "aip" ? "AIP Extraction Cost" : "GEN Rewriting Cost"}
          </div>
          <div className="text-lg font-semibold">{costFormatted}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            per {type === "aip" ? "extraction" : "rewrite"} (~{type === "aip" ? "45k" : "50k"} tokens)
          </div>
        </div>

        {/* Token pricing breakdown */}
        <div className="text-[10px] text-muted-foreground pt-2 border-t border-border/60">
          ${model.inputPrice}/1M input • ${model.outputPrice}/1M output
        </div>
      </CardContent>
    </Card>
  );
}
