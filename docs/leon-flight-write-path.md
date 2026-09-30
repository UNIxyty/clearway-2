# Leon: creating flights through the API (write path facts)

> Vendor documentation summarised from apidoc.leonsoftware.com on 2026-09-30. Reference, not company policy.

This file contains only what the Leon docs say. Every section ends with its source URLs. Where the docs are silent, the text says "not documented". The GraphQL signatures are copied from the API reference pages; only whitespace was reflowed.

---

## 1. Mutations that create flights

Leon groups flights (legs) inside a **trip**. There are two documented ways to create a flight.

### 1a. `createTrip` creates a trip together with its flights

The API reference describes it as "Create trip with specified flights. Requires access to resource GRAPHQL_FLIGHT_EDIT. Requires access to resource GRAPHQL_FLIGHT".

```graphql
createTrip(
  trip: TripCreate!
): Trip!
```

```graphql
input TripCreate {
  flights: [FlightCreate!]!
  number: String
  tripType: ScheduleTripType
  status: FlightStatus
  clientNid: ClientNid
  representativeNid: RepresentativeNid
  tags: [TagDefinitionNid]
  isCommercial: Boolean
  externalId: TripExternalIdInput
}
```

| Field | Type | Required? | What the docs say |
|---|---|---|---|
| `flights` | `[FlightCreate!]!` | **yes** | At least a list. See 1c |
| `number` | `String` | no | MCP `create-trip` tool: "Trip number. If not provided, it will be generated automatically." |
| `tripType` | `ScheduleTripType` enum | no | `owner_flight`, `training`, `technical`, `ambulance`, `other`, `pax` ("PAX Charter"), `regular_pax_transport`, `cargo`, `mission`, `aircraft_repositioning`, `frequent_flyer`, `state`, `head`, `owner_charter` |
| `status` | `FlightStatus` enum | no | `CONFIRMED`, `OPTION`, `OPPORTUNITY`. The default when omitted is not documented |
| `clientNid` | `ClientNid` | no | "Client contact numerical identifier" |
| `representativeNid` | `RepresentativeNid` | no | "Client company representative contact numerical identifier" |
| `tags` | `[TagDefinitionNid]` | no | "Tag definition numerical identifier" |
| `isCommercial` | `Boolean` | no | |
| `externalId` | `TripExternalIdInput` | no | `input TripExternalIdInput { salesforceId: String }` |

**Return type `Trip!`.** Selected fields: `tripNid: Int`, `tripNumber: String!`, `tripStatus: String!`, `flightList(...): [Flight!]!`, `externalId: TripExternalId!` (`{ salesforceId: String }`) and `creationDateTime: DateTime` ("Trip creation UTC time").

**Sample from the docs** (sample-queries/createTripMutation, abridged to one leg):
```graphql
mutation {
  createTrip(
    trip: {
      flights: [
        {
          flightNo: "AB"
          aircraftNid: 6207
          startTimeUTC: "2020-05-16UTC17:00:00"
          endTimeUTC: "2020-05-16UTC20:13:53"
          adepCode: "EGGW"
          adesCode: "UUWW"
          isEmptyLeg: true
        }
      ]
    }
  ) {
    tripNid
    flightList{
      flightNid
    }
  }
}
```
The time format in this sample (`"2020-05-16UTC17:00:00"`) differs from the ISO 8601 examples in the `DateTime` scalar definition. See section 7.

### 1b. `flightCreate` adds one flight to an existing trip

The API reference describes it as "Create flight and assign to trip with specified tripNid. Requires access to resource GRAPHQL_FLIGHT_EDIT. Requires access to resource GRAPHQL_FLIGHT. Requires access to given flight".

```graphql
flightCreate(
  tripNid: TripNid!
  flight: FlightCreate!
): Flight!
```

The return type is `Flight!` ("Represents single flight activity."). The MCP `create-flight` tool wraps this mutation and takes `tripNid` (required) and `flight`.

### 1c. `FlightCreate`, the per-leg input shared by both mutations

```graphql
input FlightCreate {
  flightNo: FlightNo!
  arcid: Arcid
  aircraftNid: AircraftNid
  virtualAircraftNid: AircraftVirtualNid
  startTimeUTC: DateTime!
  endTimeUTC: DateTime!
  adepCode: AirportCodeScalar!
  adesCode: AirportCodeScalar!
  distance: IntNonNegative
  isEmptyLeg: Boolean!
  icaoType: IcaoType
  paxNumber: Int
  salesNotes: String
  opsNotes: String
  tags: [TagDefinitionNid]
  aocSource: AocSource
  aoc: AocNid
  altAirport: AirportCodeScalar
  altAirport2: AirportCodeScalar
  externalId: FlightExternalIdInput
}
```

| Field | Type | Required? | Format / meaning per the docs |
|---|---|---|---|
| `flightNo` | `FlightNo` scalar ("Flight number") | **yes** | MCP `create-flight`: "If not provided or an empty string is provided, it MUST be set to "???" or generated according to operator settings." |
| `arcid` | `Arcid` scalar ("Aircraft Identification") | no | Callsign-style aircraft identification. There is no separate "callsign" field |
| `aircraftNid` | `AircraftNid` ("Aircraft numerical identifier") | no | **A numeric id, not a registration.** Get it from `aircraftByRegistration(registration)`, `aircraftList` or `Aircraft.aircraftNid` |
| `virtualAircraftNid` | `AircraftVirtualNid` ("Virtual aircraft numerical identifier") | no | MCP: set only one of `aircraftNid` or `virtualAircraftNid`. Setting both gives the validation error "Required aircraftNid or virtualAircraftNid, only one field". If neither is provided, both "MUST NOT be set" |
| `startTimeUTC` | `DateTime` | **yes** | **UTC.** Scalar: "Date and time expressed according to ISO 8601, ex. 2019-06-05, 2019-06-05T12:00:00" |
| `endTimeUTC` | `DateTime` | **yes** | Same as `startTimeUTC` |
| `adepCode` | `AirportCodeScalar` | **yes** | "Airport code, one of: IATA, ICAO, FAA or custom" (a code, not a `locationNid`) |
| `adesCode` | `AirportCodeScalar` | **yes** | Same as `adepCode` |
| `distance` | `IntNonNegative` | no | MCP: "Flight distance (in nautical miles, integer)" |
| `isEmptyLeg` | `Boolean` | **yes** | MCP: "Mark TRUE if leg is empty" |
| `icaoType` | `IcaoType` enum | no | `S` Scheduled air service, `N` Non-scheduled air service, `G` General aviation, `M` Military, `X` Other |
| `paxNumber` | `Int` | no | MCP: "Number of passengers (PAX)". **A single count.** FlightCreate has no adult/child/infant or male/female split |
| `salesNotes` | `String` | no | Sales notes |
| `opsNotes` | `String` | no | OPS notes |
| `tags` | `[TagDefinitionNid]` | no | Ids of operator-defined tag definitions, not free text |
| `aocSource` | `AocSource` enum | no | `NONE` ("Activity will not be included in FTL calculations"), `DEFAULT` (operator's default AOC preset), `PRESET` ("Preset must be defined in separate field") |
| `aoc` | `AocNid` ("AOC preset numerical identifier") | no | |
| `altAirport` | `AirportCodeScalar` | no | Alternate airport |
| `altAirport2` | `AirportCodeScalar` | no | Second alternate |
| `externalId` | `FlightExternalIdInput` | no | `input FlightExternalIdInput { salesforceId: String }` |

**Not settable on creation:** crew, a passenger list, and a separate trip status per leg. `status` is on `TripCreate`. Crew and passengers are written afterwards (see 1e).

### 1d. Updating, cancelling and deleting

- `flights { flightListUpdate(flightList: [FlightUpdateInput!]!): [Flight!]! }` requires `GRAPHQL_FLIGHT_EDIT`, `GRAPHQL_FLIGHT` and access to the flight. `FlightUpdateInput` has `flightNid: FlightNid!` plus every `FlightCreate` field as optional, and adds `unsetAircraft` and `extendedRange`.
- The top-level `flightUpdate` is **DEPRECATED**, "use flights.flightListUpdate mutation".
- `updateTrip(tripNid: TripNid!, trip: TripUpdate!): Trip!`. `TripUpdate` has `number`, `tripType`, `status`, `clientNid`, `notes`, `supplementaryInfo`, `representativeNid`, `tags`, `isCommercial` and `externalId`.
- `flightDelete(flightNid: FlightNid!): Boolean!`: "Cancel or delete flight (accordingly to operator settings)." The MCP `cancel-flight` tool says: "Flights are never deleted in the Leon system, they can only be canceled. Once the flight has been canceled, the Journey Log data will be deleted."
- `restoreFlights(flightNid)`, `deleteTrip(tripNid): Boolean!` and `flights { moveFlightToAnotherTrip, copyTrip }` also exist.

### 1e. Crew and passengers after creation

- **Crew:** `crewPanel { crew { assign(crewRecordList: [CrewPanelAssignCrewRecord!]!, isInDraftsMode: Boolean!) } }`.
  - `CrewPanelAssignCrewRecord { flightNid: FlightNid!, positionNid: PositionNid!, loginNid: CrewMemberNid! }`.
  - `assignByPositionName` takes `positionName: PositionNameString!` in place of `positionNid`.
  - Both return `NonNullBooleanValueOrErrorList!`. They require `GRAPHQL_DUTY_EDIT`, and "Execution is not allowed during publishing".
- **Passengers:** there are two options.
  - A count plus free text: `passengerList { savePassengerText(flightNid: FlightNid!, passengerText: PassengerTextInput!): PassengerList! }`, where `PassengerTextInput { count: Int!, text: String! }`.
  - Contacts: `passengerList { addPassengersToList(flightNid, passengerContactList: [PassengerContactInput!], leadPassenger: ContactNid) }`.

  Both require `GRAPHQL_PASSENGER_EDIT` and `GRAPHQL_PASSENGER`. The male, female, child and infant counts exist only on the read side (`PassengerList`).

### 1f. Other creation paths (for completeness)

- **`integration { common { sched { createSchedFlightList(versionName, flightList: [SchedSpecifiedFlightInput!]!, removeNotMatchedFlights: Boolean!) } } }`** creates SCHED (schedule) flights, not operational flights.
  - Its input takes `flightNumber`, `adep`, `ades`, `std`, `sta` ("Date and time of departure in UTC"), `aircraftRegistration` ("Aircraft registration or virtual aircraft name"), `aircraftTypeIata`, `arcid` and `icaoType`.
  - This is the only documented flight-creating input that takes a **registration** rather than an id.
  - `removeNotMatchedFlights`: "If enabled, removes all flights in the time period from the sent flightList".
  - SCHED flights become real flights through `schedule { publishSchedFlightList(...) }`, which requires `GRAPHQL_SCHEDULE_ORDER_PUBLICATION`.
- **`externalMarketplace { createTrip(trip, client, flights: [ExternalMarketplaceOAuthFlightCreateInput!]!) }`** is the marketplace variant. Its flight input has `startAirport`, `endAirport`, `paxNumber: Int!`, `isFerry: Boolean!`, `startTime`, `endTime` and `aircraft`. It returns `NonNullExternalMarketplaceOAuthMutationValueOrErrorList!`, which is a union with `ErrorList`.

Sources: https://apidoc.leonsoftware.com/api-reference/operations/mutations/create-trip/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/flight-create/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/trip-create/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/flight-create/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/flight-external-id-input/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/trip-external-id-input/ · https://apidoc.leonsoftware.com/api-reference/types/objects/trip/ · https://apidoc.leonsoftware.com/api-reference/types/objects/flight/ · https://apidoc.leonsoftware.com/api-reference/types/scalars/date-time/ · https://apidoc.leonsoftware.com/api-reference/types/scalars/airport-code-scalar/ · https://apidoc.leonsoftware.com/api-reference/types/scalars/aircraft-nid/ · https://apidoc.leonsoftware.com/api-reference/types/scalars/flight-no/ · https://apidoc.leonsoftware.com/api-reference/types/scalars/arcid/ · https://apidoc.leonsoftware.com/api-reference/types/enums/icao-type/ · https://apidoc.leonsoftware.com/api-reference/types/enums/aoc-source/ · https://apidoc.leonsoftware.com/api-reference/types/enums/schedule-trip-type/ · https://apidoc.leonsoftware.com/api-reference/types/enums/flight-status/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/flight-update-input/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/trip-update/ · https://apidoc.leonsoftware.com/api-reference/types/objects/flight-mutation-query/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/flight-update/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/update-trip/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/flight-delete/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/delete-trip/ · https://apidoc.leonsoftware.com/api-reference/types/objects/crew-panel-crew-mutation-section/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/crew-panel-assign-crew-record/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/passenger-list/save-passenger-text/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/passenger-list/add-passengers-to-list/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/sched-specified-flight-input/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/integration/common/sched/create-sched-flight-list/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/schedule/publish-sched-flight-list/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/external-marketplace/create-trip/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/external-marketplace-oauth-flight-create-input/ · https://apidoc.leonsoftware.com/sample-queries/createTripMutation/ · https://apidoc.leonsoftware.com/sample-queries/createSchedFlightList/ · https://apidoc.leonsoftware.com/mcp-tools-reference/

---

## 2. Checklist items: read and set

The MCP docs describe the model this way:
- A checklist item on a flight is keyed by its **definition id**, called `cdNid`, `checklistItemNid` or `checklistDefinitionNid` depending on the node.
- Each definition has an operator-configured list of statuses.
- Items belong to groups `OPS`, `SALES` or `FLIGHT_CARE`, and are either FLIGHT-level or TRIP-level.

### 2a. Discover definitions and their allowed statuses

```graphql
checklist {
  getAvailableDefinitions(
    groupId: ChecklistGroup
  ): [ChecklistDefType!]!
}
```
- Requires `GRAPHQL_CHECKLIST_EDIT`.
- `ChecklistGroup` is `SALES | OPS | FLIGHT_CARE | ALL`.
- `ChecklistDefType` has `nid`, `groupId`, `typeId`, `label`, `shortLabel`, `section`, `statuses: [ChecklistStatusType!]!`, `defaultStatus` and `isAutoAddToLeg` ("The checklist item will be automatically added to the flight"), among others.
- `checklist { getDefinition(checklistItemNid) }` returns one definition.
- `checklist { fullStatusList: [ChecklistStatusType!]! }` returns all statuses.

```graphql
type ChecklistStatusType {
  status: String!
  checklistStatusId: ChecklistStatusId!
  abbreviation: String!
  caption: String!
  order: Int!
  typeNid: Int!
  color: String!
}
```

**Status values** are strings configured per operator. The docs do not give a fixed enum.
- The flight-support guide names, among others: Confirmed (CNF), Requested (RQS), Not Applicable (NAP), Rejected (REJ), In progress (PRS), Yes (YES), Completed (COM), Acknowledged (ACK), OK (OKI), Pending (PND), and "? (QSM)" (the question-mark status).
- The MCP docs say a new item gets the default status "QSM" unless one is specified.
- The checklist sample uses `"UNT"`.

### 2b. Read items on a flight

```graphql
checklist {
  getFlightOpsChecklistItems(
    flightNid: FlightNid!
  ): [FlightAndTripChecklistItemType!]!
}
```
- "All flight and trip checklist OPS items." Requires `GRAPHQL_CHECKLIST_OPS_SEE` and access to the flight.
- It returns a union of `NonNull…ChecklistItemValue` wrappers (Slot, Catering, Fuel, Handling, Hotel, permits, PaxTransport, and `NonNullChecklistItemValue` among others). Select fields with inline fragments; the checklistQuery sample shows how.
- There is a multi-flight version, `getFlightListOpsChecklistItems(flightNidList: [FlightNid!]!): [FlightCorrelatedChecklist!]!`, which returns `{ flightNid, checklistItem }` per item.
- SALES and FLIGHT_CARE equivalents exist: `getFlightSalesChecklistItems` and `getFlightFlightCareChecklistItems`.

A simpler path goes through the flight object: `flight(flightNid) { checklist { allItems { cdNid csId } item(cd_nid: Int!) { … } } }`.
- `ChecklistItem` has `cdNid: Int!`, `csId: String!` (the status id), `status: ChecklistStatusType`, `statusCaption`, `definition`, `comment`, `files` and `confirmationCode`.
- `Checklist.allExtra` is described as "All "extra" records (comments) associated with this checklist."

The overall colour is available from `getChecklistOverallStatusOps(flightNid): ChecklistColorEnum!`, which returns `Green`, `Red`, `Yellow` or `Gray`.

### 2c. Set the status of one item

```graphql
checklist {
  opsItemStatusUpdate(
    flightNid: FlightNid!
    checklistItemNid: ChecklistDefinitionNid!
    checklistStatusId: String!
  ): Boolean
}
```
- "Update OPS checklist item status." Requires `GRAPHQL_CHECKLIST_OPS_EDIT` and access to the flight.
- Sample: `opsItemStatusUpdate(flightNid: 18595001, checklistItemNid: 1, checklistStatusId: "UNT")`.
- For the SALES group, `salesItemStatusUpdate` has the same arguments and requires `GRAPHQL_CHECKLIST_SALES_EDIT`.

### 2d. Write a note or comment on one item

```graphql
checklist {
  opsItemNoteUpdate(
    flightNid: FlightNid!
    checklistItemNid: ChecklistDefinitionNid!
    note: String
  ): Boolean
}
```
- "Update OPS checklist item note." Requires `GRAPHQL_CHECKLIST_OPS_EDIT` and access to the flight.
- `salesItemNoteUpdate`, `flightCareItemNoteUpdate` and `positioningItemNoteUpdate` are the equivalents for the other groups.
- The note is read back as `ChecklistItem.comment`. The MCP docs describe `comment` as the "note to checklist item".

### 2e. Add or update several items at once, with status and note together

```graphql
checklist {
  addOrUpdateOpsItems(
    flightNid: FlightNid!
    checklistItems: [ChecklistItemInput!]!
  ): Boolean
}
```
```graphql
input ChecklistItemInput {
  checklistDefinitionNid: ChecklistDefinitionNid!
  checklistStatusId: String
  note: String
  files: [FileInput!]
}
```
- Requires `GRAPHQL_CHECKLIST_OPS_EDIT` and access to the flight.
- The MCP tool built on this mutation says: "If item exists on flight: it will be UPDATED. If item doesn't exist: it will be CREATED with default status "QSM" (unless specified)." All items must be for the same flight.
- Also available:
  - `updateOpsItems(checklistNid: ChecklistNid!, checklistItems: [ChecklistItemInput!]!)`, which is keyed by checklist, not by flight
  - `removeOpsItems(flightNid, checklistItems: [ChecklistDefinitionNid!]!)`. Its reference page states that it requires **`GRAPHQL_CHECKLIST_SALES_EDIT`**.
  - SALES and FLIGHT_CARE equivalents

Sources: https://apidoc.leonsoftware.com/api-reference/operations/queries/checklist/get-available-definitions/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/checklist/get-definition/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/checklist/full-status-list/ · https://apidoc.leonsoftware.com/api-reference/types/objects/checklist-def-type/ · https://apidoc.leonsoftware.com/api-reference/types/objects/checklist-status-type/ · https://apidoc.leonsoftware.com/api-reference/types/enums/checklist-group/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/checklist/get-flight-ops-checklist-items/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/checklist/get-flight-list-ops-checklist-items/ · https://apidoc.leonsoftware.com/api-reference/types/unions/flight-and-trip-checklist-item-type/ · https://apidoc.leonsoftware.com/api-reference/types/objects/checklist/ · https://apidoc.leonsoftware.com/api-reference/types/objects/checklist-item/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/checklist/get-checklist-overall-status-ops/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/checklist/ops-item-status-update/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/checklist/sales-item-status-update/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/checklist/ops-item-note-update/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/checklist/sales-item-note-update/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/checklist/add-or-update-ops-items/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/checklist/update-ops-items/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/checklist/remove-ops-items/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/checklist-item-input/ · https://apidoc.leonsoftware.com/sample-queries/checklist/ · https://apidoc.leonsoftware.com/sample-queries/checklistQuery/ · https://apidoc.leonsoftware.com/standard-workflows/flight-support/FlightSupport/ · https://apidoc.leonsoftware.com/mcp-tools-reference/

---

## 3. What happens with a duplicate flight

**Not documented.** No page on `createTrip`, `flightCreate`, `FlightCreate`, `TripCreate`, the guides or the MCP `create-flight` / `create-trip` tools says what happens when a flight with the same aircraft, time or flight number already exists.
- `ErrorCategory` has no flight-duplicate value. The duplicate categories it does have are for crew members, passports, visas, aircraft registration and currency labels.
- The flight-sync guide lists "Write flight data back to Leon via this flow" as "❌ Not in scope".
- The only related statement is about a different object. The crew-certificate guide says `createExternalDefinition` "always creates a new row; there is no uniqueness check on the name". That says nothing about flights.

Sources: https://apidoc.leonsoftware.com/api-reference/operations/mutations/create-trip/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/flight-create/ · https://apidoc.leonsoftware.com/api-reference/types/enums/error-category/ · https://apidoc.leonsoftware.com/standard-workflows/flight-synchronization-guide/ · https://apidoc.leonsoftware.com/standard-workflows/crew_certificates_sync_quide/ · https://apidoc.leonsoftware.com/mcp-tools-reference/

---

## 4. Error shapes

- **`createTrip`, `flightCreate` and the checklist mutations do not return an error union.** They return `Trip!`, `Flight!` and `Boolean` respectively. The docs do not describe how these mutations report a failure.
  - The MCP `create-flight` text mentions validation errors, for example "Required aircraftNid or virtualAircraftNid, only one field", and a missing date "will result in a validation error". It does not show the payload.
  - The docs never show a top-level GraphQL `errors` array, `extensions` or error codes for any mutation.
- **Structured error union (used by newer mutations):**
  ```graphql
  type ErrorList {
    errorList: [Error!]!
  }
  type Error {
    message: String!
    category: ErrorCategory!
    path: [String!]
  }
  ```
  `ErrorCategory` includes `RESOURCE_EDITION_BLOCKED`, `RESOURCE_INVALID`, `VALIDATION`, `RESOURCE_NOT_FOUND`, `LOCAL_TIME_UTC_DST_ERROR`, `AIRCRAFT_REGISTRATION_DUPLICATE` and others. The RFQ guide says: "a successful call returns a value object, a failure returns errorList. Branch on which key is present."
- **Violation lists.** Some mutations use `…ViolationList { value { message path } }` with codes listed as "Possible violation list: …". For example, `createSchedFlightList` lists `IS_NOT_SOME_ERROR` and `REGEX_FAILED_ERROR`. The sample reads it as:
  ```graphql
  ... on IntegrationSchedMutationCreateSchedFlightListViolationList { errors: value { path message } }
  ```
- **"Generic GraphQL error".** The crew guide says that in one case Leon "returns a generic GraphQL error rather than a structured violation". Its shape is not shown.
- **HTTP statuses documented:**

  | Status | What the docs say |
  |---|---|
  | 401 Unauthorized | "Token expired or missing". A 401 on the refresh call means the refresh token expired |
  | 429 Too Many Requests | More than 500 active access tokens per refresh token. Check `Retry-After` |
  | 400 Bad Request | "Wrong variable type or format". For example, dates must be ISO 8601 UTC such as `"2026-03-23T12:00:00Z"` |
  | 400 with no GraphQL error body | SSIM requests over 3,000 entries |

Sources: https://apidoc.leonsoftware.com/api-reference/types/objects/error-list/ · https://apidoc.leonsoftware.com/api-reference/types/objects/error/ · https://apidoc.leonsoftware.com/api-reference/types/enums/error-category/ · https://apidoc.leonsoftware.com/sample-queries/createSchedFlightList/ · https://apidoc.leonsoftware.com/standard-workflows/rfq_quotes_management_guide/ · https://apidoc.leonsoftware.com/standard-workflows/crew_certificates_sync_quide/ · https://apidoc.leonsoftware.com/standard-workflows/flight-synchronization-guide/ · https://apidoc.leonsoftware.com/authentication/OAuthCodeGrant/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/schedule/update-sched-flights-by-ssim/ · https://apidoc.leonsoftware.com/mcp-tools-reference/

---

## 5. Tying a created flight to an id we hold (idempotency options)

These fields exist in the schema. None of them is described as an idempotency key, and no uniqueness guarantee is documented for any of them.

- **`externalId.salesforceId`**
  - Can be written on `FlightCreate.externalId` / `FlightUpdateInput.externalId` (as `FlightExternalIdInput { salesforceId: String }`) and on `TripCreate.externalId` / `TripUpdate.externalId` (as `TripExternalIdInput { salesforceId: String }`).
  - Read back as `Flight.externalId: FlightExternalId!` and `Trip.externalId: TripExternalId!`. `FlightExternalId` is described as "External IDs for flight integrations".
  - This is the only field of either type, and its name refers to Salesforce. It was added in Sprint 193.
  - In a search of every API reference page, this field appears in no query argument or filter. `FlightFilter` does not accept it. **There is no documented lookup by external id.**
- **`TripCreate.number`** (the trip number). The MCP docs say it is auto-generated if omitted. It can be looked up with `trip { getTripByTripNumber(tripNumber: TripNumber!): Trip! }` and filtered by `FlightFilter.tripNumber`. Whether Leon enforces unique trip numbers is not documented.
- **`FlightCreate.flightNo`**. It can be filtered with `FlightFilter.flightNumber`. The MCP `search-flights` tool describes this as a "Wildcard search for flight number". Uniqueness is not documented.
- **`opsNotes` / `salesNotes`**. These are free text, read back as `Flight.notes { sales ops }`. They cannot be filtered in `FlightFilter`.
- **`tags`**. These are `TagDefinitionNid` references to operator-defined tags, created with `operator { tagSettings { addFlightTag(label, color) } }`, not free-form values. They can be filtered with `FlightFilter.tagNidList`.
- There is no `customField` or free `externalId: String` on the flight input.

Sources: https://apidoc.leonsoftware.com/api-reference/types/inputs/flight-create/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/flight-external-id-input/ · https://apidoc.leonsoftware.com/api-reference/types/objects/flight-external-id/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/trip-external-id-input/ · https://apidoc.leonsoftware.com/api-reference/types/objects/trip-external-id/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/flight-filter/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/trip/get-trip-by-trip-number/ · https://apidoc.leonsoftware.com/api-reference/types/objects/flight-notes-type/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/operator/tag-settings/add-flight-tag/ · https://apidoc.leonsoftware.com/changelogs/changelog-193/ · https://apidoc.leonsoftware.com/mcp-tools-reference/

---

## 6. Permissions needed, and checking them without writing

**Resources required, as stated on each reference page:**

| Operation | Resources |
|---|---|
| `createTrip` | `GRAPHQL_FLIGHT_EDIT` and `GRAPHQL_FLIGHT` |
| `flightCreate` | `GRAPHQL_FLIGHT_EDIT`, `GRAPHQL_FLIGHT`, and "access to given flight" |
| `flights.flightListUpdate` | `GRAPHQL_FLIGHT_EDIT`, `GRAPHQL_FLIGHT`, and flight access |
| `aircraftByRegistration` (to resolve `aircraftNid`) | `GRAPHQL_ACFT` and "access to given aircraft" |
| `airportByCode` | `GRAPHQL_AIRPORT` |
| `checklist.getAvailableDefinitions` | `GRAPHQL_CHECKLIST_EDIT` |
| `getFlightOpsChecklistItems` | `GRAPHQL_CHECKLIST_OPS_SEE` |
| `opsItemStatusUpdate` / `opsItemNoteUpdate` / `addOrUpdateOpsItems` | `GRAPHQL_CHECKLIST_OPS_EDIT`, plus flight access |
| `removeOpsItems` | `GRAPHQL_CHECKLIST_SALES_EDIT`, as printed on its page |
| Crew assignment | `GRAPHQL_DUTY_EDIT` |
| Passengers | `GRAPHQL_PASSENGER_EDIT` and `GRAPHQL_PASSENGER` |

**How scopes are granted:**
- API key: the operator grants resources to the key when creating it (`ApiKeyCreate.resourceList: [PermissionResource!]!`).
- OAuth: Leon assigns a scope set at registration, the app requests scopes in the authorize URL, and an admin consents.
- In both cases the `createApiKey(..., aircraftList: [AircraftNid!])` argument and the "access to given flight/aircraft" directives (`@canAccessFlight`, `@canAccessAcftNid`) indicate that access can also be restricted per object.

**Read-only checks the docs offer:**
1. `query { echo(text: "x") }` "can be used for testing API connection and credentials". It requires no resource.
2. `query { apiKeyList { name resourceList restrictionList { registration } } }` lists each key's granted resources and aircraft restrictions. It requires `GRAPHQL_API_KEYS`, so it only works if the key itself has that resource.
3. `permission(place: PrivilegePlaceScalar!)` returns `{ level: EDIT | SEE | NOT_ALLOWED, isPersonalOnly }`. It only accepts "user session, user access token, personal API key" identities, and `place` is a UI place string such as `"crew_panel"`, not a `PermissionResource`.
4. For OAuth apps, the operator sees the permissions granted in the Add-ons panel. The token endpoint response documented in the docs contains only `token_type`, `expires_in`, `access_token` and `refresh_token`, with no scope list.
5. Running a read query that needs the `…_SEE` resource (for example `flightList` or `getFlightOpsChecklistItems`) shows that read access works. The docs give no read-only way to prove an `…_EDIT` resource other than reading `ApiKey.resourceList`.

**Not documented:** a "whoami" or "token scopes" query for the calling token.

Sources: https://apidoc.leonsoftware.com/api-reference/operations/mutations/create-trip/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/flight-create/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/aircraft-by-registration/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/airport-by-code/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/checklist/remove-ops-items/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/echo/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/api-key-list/ · https://apidoc.leonsoftware.com/api-reference/types/objects/api-key/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/permission/ · https://apidoc.leonsoftware.com/api-reference/types/scalars/privilege-place-scalar/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/create-api-key/ · https://apidoc.leonsoftware.com/authentication/ScopeList/ · https://apidoc.leonsoftware.com/authentication/OAuthCodeGrant/ · https://apidoc.leonsoftware.com/integration-lifecycle-3rd-party-providers/ · https://apidoc.leonsoftware.com/api-reference/types/directives/can-access-flight/ · https://apidoc.leonsoftware.com/api-reference/types/directives/can-access-acft-nid/

---

## 7. Surprises and things that contradict common assumptions

- **Aircraft is set by numeric id (`aircraftNid`), not by registration.** Resolve the id first with `aircraftByRegistration`. Only the SCHED `createSchedFlightList` input takes a registration.
- **Airports are set by code, not by id.** `adepCode` / `adesCode` accept "IATA, ICAO, FAA or custom" codes. Filters on the read side use `locationNid` instead (`FlightFilter.adepLocationNid`). How an ambiguous code is resolved is not documented.
- **Create-time inputs are in UTC.** The field names are `startTimeUTC` and `endTimeUTC`. `DateTime` examples in the scalar definition have no zone (`2019-06-05T12:00:00`), while the sync guide uses `Z` (`"2025-02-15T08:00:00Z"`). The createTrip sample uses a third format, `"2020-05-16UTC17:00:00"`. Local times are returned as separate read fields (`startTimeLocal: DateTimeWithTimezone`, "local in respect to applicable airport" per the MCP docs). The SCHED API has a separate `createSchedFlightsLocalTime`.
- **Trip status lives on the trip, not the leg.** It is `TripCreate.status: FlightStatus`, with values `CONFIRMED`, `OPTION` and `OPPORTUNITY`.
- **The PAX count on creation is one integer.** `paxNumber` has no split. `isEmptyLeg` is required, even though the read-side `Flight.isEmptyLeg` is deprecated in favour of `passengerList.isFerry`.
- **`flightNo` is required.** The MCP guidance is to send `"???"` when unknown.
- **Only one of `aircraftNid` / `virtualAircraftNid` may be set.** The MCP docs say setting both causes a validation error.
- **`flightCreate` says "Requires access to given flight"** even though it creates the flight.
- **`removeOpsItems` requires `GRAPHQL_CHECKLIST_SALES_EDIT`** on its reference page, not `…_OPS_EDIT`.
- **`flightDelete` may cancel instead of delete**, "accordingly to operator settings". The MCP docs say flights are never deleted, only cancelled, and that cancellation deletes Journey Log data.
- **Checklist status ids are operator-configured strings**, typed `String!` on the mutations. They are not a GraphQL enum.
- **New checklist items may appear automatically.** `ChecklistDefType.isAutoAddToLeg` means some items are added to new flights without any API call.
- **The `externalId` object is Salesforce-specific** (`salesforceId`), and nothing documented looks flights up by it.

Sources: https://apidoc.leonsoftware.com/api-reference/types/inputs/flight-create/ · https://apidoc.leonsoftware.com/api-reference/types/scalars/date-time/ · https://apidoc.leonsoftware.com/api-reference/types/scalars/date-time-with-timezone/ · https://apidoc.leonsoftware.com/sample-queries/createTripMutation/ · https://apidoc.leonsoftware.com/standard-workflows/flight-synchronization-guide/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/flight-filter/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/schedule/create-sched-flights-local-time/ · https://apidoc.leonsoftware.com/api-reference/types/objects/flight/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/flight-create/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/checklist/remove-ops-items/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/flight-delete/ · https://apidoc.leonsoftware.com/api-reference/types/objects/checklist-def-type/ · https://apidoc.leonsoftware.com/mcp-tools-reference/

---

## Not documented / unclear

1. What Leon does on a duplicate flight (same aircraft, time or flight number). There is no uniqueness rule, no duplicate error category and no guidance.
2. Any idempotency key. There is no "create or get" behaviour, no documented uniqueness for `externalId.salesforceId` or trip `number`, and no query that looks flights or trips up by `externalId`.
3. How `createTrip`, `flightCreate` and the checklist mutations report failure: the top-level GraphQL `errors` shape, `extensions`, error codes, and HTTP status on validation failure.
4. Which `DateTime` string format is canonical for `startTimeUTC` and `endTimeUTC`: no zone, `Z`, or the sample's `…UTC…` form. Whether a date-only value is accepted for a flight time.
5. The default trip `status` and `tripType` when omitted, and what the operator's default flight number or AOC does when fields are omitted. The MCP docs mention "generated according to operator settings" without detail.
6. How an airport code that matches more than one airport (IATA vs ICAO vs custom) is resolved.
7. Whether `paxNumber` interacts with a passenger list created later.
8. Whether `createTrip` is atomic when one of several legs fails validation.
9. What "Requires access to given flight" means on `flightCreate`, and how per-aircraft API-key restrictions affect creation.
10. The HTTP status or response when the request-rate limits (150 per minute, 4,500 per hour, 54,000 per day) are exceeded.
11. A read-only way to confirm an `…_EDIT` resource on an OAuth token. For API keys, `apiKeyList.resourceList` works only if the key also has `GRAPHQL_API_KEYS`.
12. What `FlightFilter.limit` does (no description).
13. A fixed list of checklist status ids. They are operator-configured and must be read from `getAvailableDefinitions` / `fullStatusList`.
