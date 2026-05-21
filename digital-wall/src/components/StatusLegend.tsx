import type { FlightStatus } from "../types";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

const statusItems: Array<{ status: FlightStatus; label: string; colorClass: string }> = [
  { status: "not_departed", label: "Grey - not departed", colorClass: "statusNotDeparted" },
  { status: "airborne", label: "Blue - airborne", colorClass: "statusAirborne" },
  { status: "delayed", label: "Yellow - delayed", colorClass: "statusDelayed" },
  { status: "ctot", label: "Purple - CTOT", colorClass: "statusCtot" },
  { status: "arrived", label: "Pink - arrived", colorClass: "statusArrived" },
];

export function StatusLegend() {
  return (
    <Card className="sidePanelSection">
      <CardHeader className="pb-3">
        <CardTitle>Status Legend</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="pt-3">
        <ul className="statusLegendList">
          {statusItems.map((item) => (
            <li key={item.status}>
              <span className={`statusSwatch ${item.colorClass}`} aria-hidden="true" />
              <span>{item.label}</span>
              <Badge variant={item.status} className="ml-auto">
                {item.status.replace("_", " ")}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
