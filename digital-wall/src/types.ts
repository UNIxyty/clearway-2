export type FlightStatus = "not_departed" | "airborne" | "delayed" | "ctot" | "arrived";

export type WorldClock = {
  city: string;
  timeZone: string;
};

export type Flight = {
  id: string;
  flightNumber: string;
  tripNo?: string;
  dateCode?: string;
  aircraftReg: string;
  departureAirport: string;
  arrivalAirport: string;
  plannedDeparture: string;
  plannedArrival: string;
  actualDeparture?: string;
  status: FlightStatus;
  ctot?: string;
};

export type ManualLimitation = {
  id: string;
  title: string;
  details: string;
};
