import type { ManualLimitation } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

export function LimitationsPanel({ items }: { items: ManualLimitation[] }) {
  return (
    <Card className="sidePanelSection">
      <CardHeader className="pb-3">
        <CardTitle>Manual Limitations</CardTitle>
        <p className="sidePanelHint">These placeholders are intended for manual user input later.</p>
      </CardHeader>
      <Separator />
      <CardContent className="pt-3">
        <ul className="limitationList">
          {items.map((item) => (
            <li key={item.id}>
              <p className="limitationTitle">{item.title}</p>
              <p className="limitationDetails">{item.details}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
