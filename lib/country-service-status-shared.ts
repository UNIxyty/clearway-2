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
  { label: string; dotClass: string; description: string; /** the state's colour, as a --cw-* token (follows the theme) */ colour: string; /** its text colour (AA on a tint) */ text: string }
> = {
  not_checked: {
    label: "Not checked",
    dotClass: "bg-cw-neutral",
    colour: "var(--cw-neutral)",
    text: "var(--cw-neutral-text)",
    description: "Grey - not checked",
  },
  in_work: {
    label: "In work",
    dotClass: "bg-cw-orange",
    colour: "var(--cw-orange)",
    text: "var(--cw-orange-text)",
    description: "Orange - in work",
  },
  partially_works: {
    label: "Partially works",
    dotClass: "bg-transparent border border-cw-warning",
    colour: "var(--cw-warning)",
    text: "var(--cw-warning-text)",
    description: "Amber - service works partially and may fail for some airports/endpoints",
  },
  operational: {
    label: "Fully operational",
    dotClass: "bg-cw-success",
    colour: "var(--cw-success)",
    text: "var(--cw-success-text)",
    description: "Green - fully operational",
  },
  issues: {
    label: "Experiencing troubles",
    dotClass: "bg-cw-danger-solid",
    colour: "var(--cw-danger)",
    text: "var(--cw-danger-text)",
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
