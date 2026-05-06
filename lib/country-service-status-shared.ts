export type CountryServiceState =
  | "not_checked"
  | "in_work"
  | "partially_works"
  | "operational"
  | "issues";

export type CountryServiceStatusRow = {
  country: string;
  state: CountryServiceState;
  note: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const COUNTRY_SERVICE_STATE_META: Record<
  CountryServiceState,
  { label: string; dotClass: string; description: string }
> = {
  not_checked: {
    label: "Not checked",
    dotClass: "bg-gray-400",
    description: "Grey - not checked",
  },
  in_work: {
    label: "In work",
    dotClass: "bg-orange-500 ring-1 ring-orange-300",
    description: "Orange - in work",
  },
  partially_works: {
    label: "Partially works",
    dotClass: "bg-amber-500",
    description: "Amber - service works partially and may fail for some airports/endpoints",
  },
  operational: {
    label: "Fully operational",
    dotClass: "bg-green-500",
    description: "Green - fully operational",
  },
  issues: {
    label: "Experiencing troubles",
    dotClass: "bg-red-500",
    description: "Red - we are experiencing troubles with this service, work in progress",
  },
};

export const COUNTRY_SERVICE_STATES: CountryServiceState[] = [
  "not_checked",
  "in_work",
  "partially_works",
  "operational",
  "issues",
];

export type CountryServiceSummaryRow = CountryServiceStatusRow & {
  runningDebug: boolean;
};

export type CountryServiceSummaryResponse = {
  countries: CountryServiceSummaryRow[];
  hasGlobalRunningDebug: boolean;
  generatedAt: string;
};
