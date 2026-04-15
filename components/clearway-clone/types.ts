export type TimelineStatus = "not_departed" | "airborne" | "delayed" | "ctot" | "arrived";

export type WxStatus = "above" | "average" | "below" | "unknown";

export type FlightRow = {
  id: string;
  flight: string;
  adep: string;
  ades: string;
  wxDep: WxStatus;
  wxDes: WxStatus;
  etd: string;
  atd?: string;
  eta: string;
  ata?: string;
  delayMin: number;
  trip: string;
  dateCode: string;
  status: TimelineStatus;
  ctot?: string;
};

export type LimitationType = "MIXED" | "AIRPORT" | "COUNTRY" | "FLIGHT";

export type Limitation = {
  id: number;
  isPermanent: boolean;
  startDate?: string;
  endDate?: string;
  title: string;
  description: string;
  type: LimitationType;
  airports: string[];
  countries: string[];
  flights: string[];
};

export type Operator = {
  operatorId: string;
  name: string;
  flightCount: number;
  refreshTokenMasked: string;
};

export type CaaDetails = {
  country: string;
  authorityName: string;
  contactEmail: string;
  contactPhones: string;
  website: string;
  actualAddress: string;
  financialAddress: string;
  workingHours: string;
  notes: string;
};

export type UserRole = "ADMIN" | "USER";

export type UserRecord = {
  email: string;
  firstName: string;
  lastName: string;
  latestActivity: string;
  role: UserRole;
  active: boolean;
};

export type LogAction = "CREATE" | "UPDATE" | "DELETE";

export type LogRecord = {
  id: string;
  date: string;
  user: string;
  role: UserRole;
  action: LogAction;
  message: string;
};
