# Leon Software API: reference for ops agents

> Vendor documentation summarised from apidoc.leonsoftware.com on 2026-09-30. Reference, not company policy.

Every statement below comes from a page on https://apidoc.leonsoftware.com. The source URLs are listed at the end of each section. The site's `/sitemap.xml` lists 4,749 pages, and all of them were downloaded (every one returned HTTP 200, and none needed a login). "Not documented" means the docs do not say. It does not mean the thing is impossible.

---

## 1. What the API offers

- **One GraphQL API per operator.** The docs describe it as "strongly typed, hierarchical and self-documenting". The home page gives Leon's reason for choosing GraphQL over "the REST API endpoints". No REST data API is documented. The only non-GraphQL HTTP endpoints in the docs are for tokens (see section 2).
- **Endpoints:**
  - Production: `https://yourOprId.leon.aero/api/graphql/`
  - Development / sandbox: `https://yourOprId.sandbox.leon.aero/api/graphql/`. The docs say it "contains a copy of production data, and it is refreshed once a day (03:00 UTC)".
- **`oprId`** is the first part of the operator's Leon sign-in domain. For example, the `demo` operator signs in at `demo.leon.aero`.
- The current guides label the API "Leon GraphQL API (Beta)".
- **Release cadence:** "A new application version is released every two weeks. We aim to keep all changes backward compatible, but on rare occasions a breaking change may occur." Leon recommends validating your code automatically against the staging schema at `http://api-schema-doc.s3-website-eu-west-1.amazonaws.com/schema-staging.json`. That schema is "generated daily after 07:00 UTC, and will be applied on production during the rolling process, after the sprint is finished". A TypeScript/graphql-codegen example is provided.
- **The schema reference is auto-generated** ("automatically generated from the GraphQL schema with GraphQL-Markdown"). It has pages for queries (467), mutations (677), subscriptions (17), directives, and types: objects, inputs, enums, scalars, unions and interfaces.
- **MCP server:** each operator has one at `https://{oprId}.mcpserver.leon.aero/`. It uses the same Bearer access tokens as the API (API key or OAuth). A tools reference lists about 120 tools, including `create-flight`, `create-trip`, `search-flights` and `add-or-update-checklist-items`.
- **Claude plugin:** the FAQ points Claude Code users to "Leon API Tools" (github.com/leonaero/leon_software_marketplace, `leon-api-tools`).
- **Adding missing data:** "The API covers Leon's entire data model". To request a dedicated query or mutation, open a ticket at customer.leon.aero.
- **IP whitelisting:** see the "Leon Public IP List" article on the Leon Wiki.

Sources: https://apidoc.leonsoftware.com/ · https://apidoc.leonsoftware.com/api-reference/ · https://apidoc.leonsoftware.com/validation-example/TypeScript/ · https://apidoc.leonsoftware.com/mcp/ · https://apidoc.leonsoftware.com/mcp-tools-reference/ · https://apidoc.leonsoftware.com/standard-workflows/flight-synchronization-guide/ · https://apidoc.leonsoftware.com/sitemap.xml

---

## 2. Authentication

There are two methods. Both end with a short-lived **access token**, which you send as `Authorization: Bearer {ACCESS_TOKEN}` to `/api/graphql/`.

### 2.1 Manually created API key (single operator only)

- "This method can be used only in case of integrations created for single operator." These integrations are "not visible in Addons panel".
- The operator creates the key in Leon under Settings → API Keys. Instructions are at https://wiki.leonsoftware.com/leon/api-keys. When creating the key, the operator grants it resources (scopes). Creating the key produces a **refresh token**.
- To exchange the refresh token for an access token:
  ```
  curl -X POST -d 'refresh_token=_RefreshToken_' https://yourOprId.leon.aero/access_token/refresh/
  ```
  The RFQ guide says the response is "the access token, returned as plain text".
- "Access token is short-lived. It expires after 30 minutes." The RFQ guide also says: "Refresh proactively when fewer than 5 minutes remain rather than waiting for a 401."
- An API key can be created through the API too: `createApiKey(apiKey: ApiKeyCreate!, aircraftList: [AircraftNid!]): CreateApiKeyOutput!`. It requires `GRAPHQL_API_KEYS`. `ApiKeyCreate` has `resourceList: [PermissionResource!]!`, `name`, `description` and `usagePurpose`. The optional `aircraftList` suggests a key can be restricted to certain aircraft: the `ApiKey` object has `restrictionList: [Aircraft!]`.

### 2.2 OAuth2 authorization code grant (mandatory for third-party vendors)

- This method is for integrations "accessible to multiple operators and will be visible in Addons panel". It is "mandatory for 3rd party software providers". The integration-lifecycle page adds that "static API keys are not permitted" for software offered to Leon operators.
- **Registration:** you submit a form with the app name, type, redirect URI(s) (all `https://`), description, logo, phone number (used to secure the delivery of the client secret) and contacts. In return you get:
  - a `client_id`
  - a `client_secret`, delivered as a single-use link that "cannot be retrieved later"
  - a **scope set** "derived from what your category of application genuinely needs"
  - a sandbox developer account

  The client works only against the sandbox until Leon signs it off after a recorded demo meeting. "Production (https://{oprId}.leon.aero) will reject your client until sign-off."
- **Step 1, authorize.** Send the browser to:
  ```
  {BASE_URI}/oauth2/code/authorize/?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope={SCOPE_LIST}&state={OPTIONAL_STATE}
  ```
  `SCOPE_LIST` is space-delimited. The returned `code` is "single-use, valid for 10 minutes". "For most applications, only users with admin privileges are able to authorize 3rd party application." Personal apps are the exception.
- **Step 2, get tokens.** Send `POST {BASE_URI}/oauth2/code/token/` ("mind the trailing slash!") as form data with `grant_type=authorization_code`, `client_id`, `client_secret`, `redirect_uri` and `code`. The response is JSON: `{"token_type":"Bearer","expires_in":{EXPIRY_TIMESTAMP},"access_token":…,"refresh_token":…}`.
- **Refresh.** Send the same endpoint `grant_type=refresh_token`, `client_id`, `client_secret` and `refresh_token`. The flight-sync guide says the response is "a new access_token (and optionally a new refresh_token)".
- **Lifetimes and limits:**

  | Item | Limit |
  |---|---|
  | Authorization code | Single use, valid 10 minutes |
  | Access token | Valid 30 minutes |
  | Active access tokens per refresh token | 500. Exceeding this returns **HTTP 429 Too Many Requests** with a `Retry-After` header |
  | Refresh token | "valid 30 days since its last use" |

- Leon's rules on token use: "access tokens must be reused for the entire duration of their validity — do not generate a new access token for each API call." Keep one refresh token per connected operator.
- The operator can see the permissions granted to an OAuth app in the Add-ons panel and can disconnect it at any time.
- **Authorization models:**
  - Operator-level: approved by an operator admin.
  - Personal: approved by the individual user.
  - Full user-permission: "limited to their own current Leon privileges". This is for AI assistants and MCP-type clients.

### 2.3 Identity types

Some fields also carry the note "Requires user to be authenticated using one of the following identity types". The identity types named are: user session, user access token, and personal API key. For example:
- `permission`, `privilegeLevel` and `loggedUser` need user session, user access token or personal API key.
- `accessToken.create` and `accessToken.prolong` need a user session.
- `accessToken.logoutOAuth` needs a user access token.
- Some operations have the `@isAuthenticatedByOauth` directive ("Requires to be authenticated by OAuth"). The crew-certificate guide says its external-endorsement mutations "will not work with an API Key".

Sources: https://apidoc.leonsoftware.com/authentication/ApiKey/ · https://apidoc.leonsoftware.com/authentication/OAuthCodeGrant/ · https://apidoc.leonsoftware.com/integration-lifecycle-3rd-party-providers/ · https://apidoc.leonsoftware.com/standard-workflows/flight-synchronization-guide/ · https://apidoc.leonsoftware.com/standard-workflows/rfq_quotes_management_guide/ · https://apidoc.leonsoftware.com/standard-workflows/crew_certificates_sync_quide/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/create-api-key/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/api-key-create/ · https://apidoc.leonsoftware.com/api-reference/types/objects/api-key/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/access-token/create/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/access-token/prolong/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/access-token/logout-oauth/ · https://apidoc.leonsoftware.com/api-reference/types/directives/is-authenticated-by-oauth/ · https://apidoc.leonsoftware.com/api-reference/types/directives/has-identity-type/

---

## 3. Permissions, scopes and privileges

- **Scopes are "resources".** The Scope list page has about 190 names, such as `GRAPHQL_FLIGHT - Flight see` and `GRAPHQL_FLIGHT_EDIT - Flight edit`. The same names make up the `PermissionResource` enum used by API keys. Most start with `GRAPHQL_`; some do not (for example `FUEL_EDIT`, `LANDING_PERMITS_SEE` and `INTEGRATION_FLIGHT_SUPPORT`).
- **How scopes are granted:**
  - API key: the operator picks resources when creating the key (`ApiKeyCreate.resourceList`).
  - OAuth: Leon assigns a scope set at registration and narrows it "from the permissive development set to the agreed production set" at sign-off. The app then requests scopes in the `scope` parameter of the authorize URL, and the operator admin consents.
- **How to tell what a node needs.** Every field that checks scopes says so in its description: "Requires access to resource X". The OAuth page says: "Required scopes will be mentioned in descriptions of every node that checks the scopes." Other description notes you will see:
  - "Requires access to given flight", "given aircraft", "given quote realization" and similar. These are object-level checks, implemented by directives such as `@canAccessFlight` ("Checks if user can access flight on requested endpoint"), `@canAccessFlightNid` and `@canAccessAcftNid`.
  - "Access to resource X will soon be required", a forward warning.
  - The `@canAccessResource(resource: String)` and `@canAccessResourceList(resourceOrList: [String!])` directives, which check user permissions against a named resource or list of resources.
- **How to tell what a token may do (read-only):**
  - `echo(text: String!): String!` "can be used for testing API connection and credentials". It carries no resource requirement.
  - `apiKeyList: [ApiKey!]!` and `apiKey(apiKeyNid: Int!)` return `ApiKey.resourceList: [PermissionResource!]!` and `restrictionList: [Aircraft!]`. Both require `GRAPHQL_API_KEYS`.
  - `permission(place: PrivilegePlaceScalar!): PermissionLevel!` returns `{ level: EDIT|SEE|NOT_ALLOWED, isPersonalOnly }`. `place` is a string such as `"crew_panel"`. It needs a user-type identity (see 2.3).
  - For OAuth, the token response shown in the docs does not include a scope list. The operator sees the granted permissions in the Add-ons panel.
  - No query is documented that returns "the scopes of the calling token".
- **Scopes the flight-sync guide lists** for reading flights: `GRAPHQL_FLIGHT`, `GRAPHQL_ACFT`, `GRAPHQL_CREW_MEMBER` and `GRAPHQL_PASSENGER`.
- **Scopes the API reference shows** for the flight and checklist nodes that matter here:

  | Operation | Resources required |
  |---|---|
  | `createTrip` / `updateTrip` | `GRAPHQL_FLIGHT_EDIT` and `GRAPHQL_FLIGHT` |
  | `flightCreate` | `GRAPHQL_FLIGHT_EDIT`, `GRAPHQL_FLIGHT`, and "access to given flight" |
  | `flights.flightListUpdate` | `GRAPHQL_FLIGHT_EDIT`, `GRAPHQL_FLIGHT`, and access to the flight |
  | `flightDelete` / `deleteTrip` | `GRAPHQL_FLIGHT_EDIT` |
  | Reading `Flight.crewMemberList` | `GRAPHQL_FLIGHT_CREW_SEE` and `GRAPHQL_FLIGHT` |
  | Reading `Flight.passengerList` | `GRAPHQL_PASSENGER` |
  | Reading `Flight.acft` | `GRAPHQL_ACFT` |
  | Reading `Flight.startAirport` / `Flight.endAirport` | `GRAPHQL_AIRPORT` |
  | OPS checklist, read / write | `GRAPHQL_CHECKLIST_OPS_SEE` / `GRAPHQL_CHECKLIST_OPS_EDIT` |
  | SALES checklist, read / write | `GRAPHQL_CHECKLIST_SALES_SEE` / `GRAPHQL_CHECKLIST_SALES_EDIT` |
  | `checklist.getAvailableDefinitions` | `GRAPHQL_CHECKLIST_EDIT` |

Sources: https://apidoc.leonsoftware.com/authentication/ScopeList/ · https://apidoc.leonsoftware.com/authentication/OAuthCodeGrant/ · https://apidoc.leonsoftware.com/integration-lifecycle-3rd-party-providers/ · https://apidoc.leonsoftware.com/api-reference/types/enums/permission-resource/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/echo/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/api-key-list/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/api-key/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/permission/ · https://apidoc.leonsoftware.com/api-reference/types/objects/permission-level/ · https://apidoc.leonsoftware.com/api-reference/types/enums/privilege-level-enum/ · https://apidoc.leonsoftware.com/api-reference/types/directives/can-access-flight/ · https://apidoc.leonsoftware.com/api-reference/types/directives/can-access-resource/ · https://apidoc.leonsoftware.com/api-reference/types/objects/flight/ · https://apidoc.leonsoftware.com/standard-workflows/flight-synchronization-guide/

---

## 4. Rate limits and quotas

- **Request volume** for a third-party integration, across all its requests:

  | Window | Limit |
  |---|---|
  | Per minute | 150 |
  | Per hour | 4,500 |
  | Per 24 hours | 54,000 |

  Higher volumes need Leon's prior approval. If you go over, Leon notifies you and you have 14 days to comply. The docs do not describe an HTTP status or header for going over these request limits.
- **Token limit:** 500 active access tokens per refresh token. Going over returns HTTP 429 with `Retry-After`.
- **Webhooks:** at most 10 webhooks per refresh token.
- **Query window limits:**
  - `flightList`: "Period cannot be greater that 3 months".
  - `flights.getModifiedFlightList`: "max one week until now".
  - `flights.getModifiedTripList`: max period 7 days.
  - `schedule.updateSchedFlightsBySsim`: no more than 3,000 entries per request. Larger requests "return a generic HTTP 400 response without a GraphQL error body".
- **MCP `search-flights`:** `limit` defaults to 10, max 50. The time range can be at most 6 calendar months.

Sources: https://apidoc.leonsoftware.com/integration-lifecycle-3rd-party-providers/ · https://apidoc.leonsoftware.com/authentication/OAuthCodeGrant/ · https://apidoc.leonsoftware.com/subscriptions/Webhook/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/flight-list/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/flights/get-modified-flight-list/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/flights/get-modified-trip-list/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/schedule/update-sched-flights-by-ssim/ · https://apidoc.leonsoftware.com/mcp-tools-reference/

---

## 5. Main objects

Identifiers are numeric "Nid" scalars, for example `FlightNid` ("Flight numerical identifier"), `TripNid`, `AircraftNid`, `ChecklistDefinitionNid` and `ClientNid`. Times are exposed both as `DateTime` (ISO 8601) and, in some older fields, as `Int` (for example `Flight.startTime`).

### Flight (one leg)
`type Flight implements ActivityInterface`, "Represents single flight activity." Key fields:

| Area | Fields |
|---|---|
| Identity | `flightNid: FlightNid`, `flightNo: String!`, `arcid: String!`, `tripNid: Int`, `trip: Trip`, `legNumber` ("All legs, including cancelled"), `activeLegNumber` |
| Status | `status: FlightStatus!` (CONFIRMED / OPTION / OPPORTUNITY), `isCnl`, `isConfirmed`, `isActive`, `isFerry`, `isEmptyLeg` (deprecated: "use passengerList.isFerry"), `isCommercial` |
| Type | `flightType: FlightType!`, `icaoType: IcaoType!` (S / N / G / M / X), `flightRules` |
| Times | `startTimeUTC` / `endTimeUTC: DateTime!`, `startTimeLocal` / `endTimeLocal: DateTimeWithTimezone!`, `startTimeBase(baseNid)` / `endTimeBase(baseNid)` (converted to an operator base timezone), `isTimesToBeConfirmed` |
| Airports | `startAirport` / `endAirport: Airport!`, `altAirport`, `altAirport2` |
| Aircraft | `acftNid: Int!`, `acft: Aircraft`, `acftType`, `acftVirtualNid` / `acftVirtual` |
| People | `crewMemberList: [CrewMemberOnLeg!]!`, `passengerList: PassengerList`, `passengerListCount`, `passengerListInfantCount` |
| Checklist and notes | `checklist: Checklist!`, `notes: FlightNotesType` (`sales`, `ops`), `ops: FlightOps` (slot and GAR times, `note`) |
| Other | `flightTags: [TagDefinition!]!`, `externalId: FlightExternalId!` (only `salesforceId`), `foreFlightId`, `journeyLog`, `flightWatch`, `landingPermits`, `overflightPermits` |
| Timestamps | `flightLastModificationTime`, `crewLastModificationTime`, `passengerListLastModificationTime`, `flightConfirmationTime`, `creationDateTime` (all UTC) |

Reading flights:
- `flight(flightNid)`
- `flightList(filter: FlightFilter!)`. `FlightFilter` has: `timeInterval` (required), `flightType`, `flightStatus`, `aircraftNidList`, `aircraftTypeId`, `requestedByNid`, `isCnl`, `isFerry`, `adepLocationNid`, `adesLocationNid`, `icaoType`, `flightNumber`, `tripNumber`, `aocNidList`, `tagNidList`, `operatorBaseNameList` and `limit`.
- `flights { getModifiedFlightList(dateTime) }`, which returns `created`, `changed`, `deleted`, `createdFlightNidList`, `modifiedFlightNidList` and `timestamp: Int!`.
- `flights { getFlightListOnWhichModifiedCrew }` and `flights { getFlightListOnWhichModifiedPassengerList }`.

### Trip (container of legs)
"Represents single trip belonging to operator specified in request endpoint." Key fields:
- `tripNid: Int`, `tripNumber: String!`, `tripStatus: String!`, `tripType: FlightType`, `isCommercial`
- `flightList(isCnl, filterAircraftList, onlyAllowedAircraftList): [Flight!]!`
- `client` / `representative: Contact`, `checklist: Checklist!`, `notes`, `tripSupplementaryInfo`, `tripTags`, `tripFiles`
- `externalId: TripExternalId!` (only `salesforceId`), `creationDateTime`, `isDeleted`

Queries:
- `trip { getTrip(tripNid) }`, `trip { tripList(tripNidList) }`, `trip { getTripByTripNumber(tripNumber) }`, `trip { findTripByWildcard(wildcard) }`
- `flights { getModifiedTripList(timeInterval, …) }`

### Leg
`type Leg` is a generic activity revision. It has `isFlight`, `isPositioning`, `isSimulator` and `isQuotation`, times as `std` / `sta` (Int) plus `startDateTimeUTC` / `endDateTimeUTC`, and `crewList`, `passengerList` and `checklist`. Flights created by the API are exposed as `Flight`. A trip is the multi-leg container.

### Aircraft
"Represents single aircraft belonging to operator specified in request endpoint." Key fields:
- `aircraftNid: AircraftNid!` (`acftNid` is deprecated), `registration: String!`, `registrationWithoutSpecialChars`
- `acftType` / `acftTypeId`, `paxCapacity`, `homeBase`, `defFltNo`, `autoIncDefFltNo`, `isActive`, `notUsed`, `deleted`, `defaultFlightType: IcaoType`

Queries:
- `aircraftList(filterSpecialAircraft, onlyActive, easaType)`, which needs `GRAPHQL_ACFT`
- `aircraftByRegistration(registration: AircraftRegistrationActive!)`, which needs `GRAPHQL_ACFT` and "access to given aircraft"
- `aircraftVirtualList`, `aircraftTypeList(wildcard)`

### Airport
"Represents single airport." Key fields:
- `locationNid: Int!`, `name`, `city`, `country`, `timezone`, `timezoneOffset`
- `code: AirportCode!`. `AirportCode` has `icao`, `iata`, `faa`, `cust`, `mostDescriptive` and `mostDescriptiveWithPriority(priority)`. The flat `icao`, `iata` and `faa` fields are deprecated.

Airport inputs use `AirportCodeScalar`: "Airport code, one of: IATA, ICAO, FAA or custom".

Queries:
- `airportByCode(airportCode: AirportCodeScalar!): Airport`, which needs `GRAPHQL_AIRPORT`
- `airportByWildcard(wildcard)`, `airport`, `airportByLocation`
- `airportsTimezoneDetailsByCodesAndDates`

### Crew
- `CrewMember` "Represents a person, who has at least one rating for aircraft." Fields include `crewMemberNid`, `login`, `code`, `crewExternalId`, `email`, `contact`, `ratingList`, `endorsementList` and `homebase`.
- `CrewMemberOnLeg` is crew on a flight. Fields: `posNid`, `position`, `loginNid`, `contact`, `isCaptain`, `isFirstOfficer`, `isFlightAttendant`, `reportingTime` / `reportingTimeLocal` and `confirmationStatus`.
- Crew is assigned to flights through `crewPanel { crew { assign | assignByPositionName | deleteFromFlight | deleteFromFlightByPosition | deleteAllCrewFromFlight } }`. These need `GRAPHQL_DUTY_EDIT` and "Execution is not allowed during publishing". The top-level `crewPanel.assignCrew` is deprecated.

### Passengers
- `PassengerList` "Information about passengers either as contacts or in textual form". Fields: `count`, `maleCount`, `femaleCount`, `childCount`, `infantCount`, `animalCount`, `realCount`, `isFerry`, `passengerContactList`, `passengerText` and `boardingStatus`.
- `PassengerContact` fields: `contact`, `isLead`, departure and arrival passports or national IDs, `ticketNo`, luggage fields and others.
- Writes go through `passengerList { addPassengersToList | savePassengerText(flightNid, passengerText: {count, text}) | removePassengersFromList | clearPassengersFromList | setPassengerListDetails … }`. These need `GRAPHQL_PASSENGER_EDIT` and `GRAPHQL_PASSENGER`. The top-level versions are deprecated.

### Checklist and checklist items

| Type | Fields |
|---|---|
| `Checklist` | `checklistNid`, `allItems: [ChecklistItem!]!`, `item(cd_nid: Int!)`, `allExtra` ("comments"), `extra(cd_nid)`, `notes`, `isArchived` |
| `ChecklistItem` | `cdNid: Int!` (the definition id), `csId: String!` (the status id), `status: ChecklistStatusType`, `statusCaption`, `definition: ChecklistDefType`, `comment`, `files`, `confirmationCode`, `itemLinks` |
| `ChecklistDefType` (a definition) | `nid`, `groupId` (SALES / OPS / FLIGHT_CARE), `typeId` (FLIGHT or TRIP level, per the MCP docs), `label`, `shortLabel`, `section`, `statuses: [ChecklistStatusType!]!`, `defaultStatus`, `isAutoAddToLeg`, `autoAddToLegCondition` |
| `ChecklistStatusType` | `status`, `checklistStatusId`, `abbreviation`, `caption`, `order`, `typeNid`, `color` |

- Each operator configures its own status set. The flight-support guide names statuses that include: Confirmed (CNF), Requested (RQS), Not Applicable (NAP), Rejected (REJ), In progress (PRS), Yes (YES), Completed (COM), Acknowledged (ACK), OK (OKI), Pending (PND), and "? (QSM)". QSM is the question-mark status and the default for new items (per the MCP docs).
- The full write path is in `docs/leon-flight-write-path.md`.

### Operator
"Represents operator data in Leon." Key fields: `oprNid`, `oprId`, `name`, `oprIcao`, `oprIata`, `baseList`, `baseDefault`, `aocList`, `acfts` and `roleList`. Query: `operator: Operator!`, which needs `GRAPHQL_OPERATOR`.

Sources: https://apidoc.leonsoftware.com/api-reference/types/objects/flight/ · https://apidoc.leonsoftware.com/api-reference/types/objects/trip/ · https://apidoc.leonsoftware.com/api-reference/types/objects/leg/ · https://apidoc.leonsoftware.com/api-reference/types/objects/aircraft/ · https://apidoc.leonsoftware.com/api-reference/types/objects/airport/ · https://apidoc.leonsoftware.com/api-reference/types/objects/airport-code/ · https://apidoc.leonsoftware.com/api-reference/types/scalars/airport-code-scalar/ · https://apidoc.leonsoftware.com/api-reference/types/objects/crew-member/ · https://apidoc.leonsoftware.com/api-reference/types/objects/crew-member-on-leg/ · https://apidoc.leonsoftware.com/api-reference/types/objects/crew-panel-crew-mutation-section/ · https://apidoc.leonsoftware.com/api-reference/types/objects/passenger-list/ · https://apidoc.leonsoftware.com/api-reference/types/objects/passenger-contact/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/passenger-list/save-passenger-text/ · https://apidoc.leonsoftware.com/api-reference/types/objects/checklist/ · https://apidoc.leonsoftware.com/api-reference/types/objects/checklist-item/ · https://apidoc.leonsoftware.com/api-reference/types/objects/checklist-def-type/ · https://apidoc.leonsoftware.com/api-reference/types/objects/checklist-status-type/ · https://apidoc.leonsoftware.com/api-reference/types/objects/operator/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/flight-filter/ · https://apidoc.leonsoftware.com/api-reference/types/objects/flights-changes/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/aircraft-by-registration/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/airport-by-code/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/trip/get-trip-by-trip-number/ · https://apidoc.leonsoftware.com/standard-workflows/flight-support/FlightSupport/ · https://apidoc.leonsoftware.com/mcp-tools-reference/

---

## 6. Pagination

The API has no generic cursor pagination.
- The flight-sync guide says `flightList` "returns all flights in a single response with no pagination". Its advice is to split the range into sequential 3-month chunks. `FlightFilter` does have a `limit: Int` field, but the docs do not describe it.
- Incremental sync uses `getModifiedFlightList(dateTime)`. Save the returned `timestamp` (a Unix integer) and pass it in the next call. Leon's instruction: "Do not use the current wall clock time". Leon recommends polling every 5 to 15 minutes. The `changed` list can include flights outside your time window.
- Some nodes are page-based. For example, `contact { contactListByPage(page: Int!, sortBy, sortDirection) }`.
- The MCP `search-flights` tool uses `limit` and `offset`. Its result includes `shouldRerunRequestForNextPageWithOffset`.

Sources: https://apidoc.leonsoftware.com/standard-workflows/flight-synchronization-guide/ · https://apidoc.leonsoftware.com/api-reference/types/inputs/flight-filter/ · https://apidoc.leonsoftware.com/api-reference/operations/queries/contact/contact-list-by-page/ · https://apidoc.leonsoftware.com/mcp-tools-reference/

---

## 7. Errors

- **Structured errors in the data.** Many newer operations return a union of a value type and an error type. The union names follow the pattern `…ValueOrErrorList`, for example `NonNullBooleanValueOrErrorList`.
  - The error side is `type ErrorList { errorList: [Error!]! }`, where `type Error { message: String! category: ErrorCategory! path: [String!] }`.
  - `ErrorCategory` values include `RESOURCE_EDITION_BLOCKED`, `RESOURCE_INVALID`, `VALIDATION`, `RESOURCE_NOT_FOUND`, `AIRCRAFT_REGISTRATION_DUPLICATE`, `LOCAL_TIME_UTC_DST_ERROR`, `MARKETPLACE_INTEGRATION_ERROR` and a set of crew, passport and visa categories.
  - Guides tell you to branch on the `__typename`: "a successful call returns a value object, a failure returns errorList".
- **Violation lists.** Some operations return `…ViolationList { value { message path } }` instead. The reference marks their arguments "Possible violation list: …", with codes such as `IS_NOT_SOME_ERROR`, `REGEX_FAILED_ERROR`, `TOO_SHORT_ERROR`, `TOKEN_EXPIRES_ERROR` and `DUPLICATE_SUBSCRIPTION_WEBHOOK_ERROR`.
- **Plain return types.** Older mutations return plain types, such as `createTrip: Trip!`, `flightCreate: Flight!` and the checklist mutations' `Boolean`. The docs do not describe how these report failure. The crew guide mentions a "generic GraphQL error rather than a structured violation" in one case, but the docs never show the JSON shape of top-level GraphQL `errors` (no `extensions` or codes).
- **HTTP statuses the guides document:**

  | Status | Meaning given in the docs |
  |---|---|
  | 401 Unauthorized | "Token expired or missing". A 401 on the refresh call itself means the refresh token expired (30 days unused), and the operator admin must re-authorize |
  | 429 Too Many Requests | Token limit reached. Check `Retry-After` |
  | 400 Bad Request | "Wrong variable type or format", for example a `dateTime` that is not ISO 8601 UTC. Also returned for SSIM requests over 3,000 entries, "without a GraphQL error body" |

Sources: https://apidoc.leonsoftware.com/api-reference/types/objects/error-list/ · https://apidoc.leonsoftware.com/api-reference/types/objects/error/ · https://apidoc.leonsoftware.com/api-reference/types/enums/error-category/ · https://apidoc.leonsoftware.com/api-reference/types/objects/webhook-mutation-section/ · https://apidoc.leonsoftware.com/standard-workflows/flight-synchronization-guide/ · https://apidoc.leonsoftware.com/standard-workflows/crew_certificates_sync_quide/ · https://apidoc.leonsoftware.com/standard-workflows/rfq_quotes_management_guide/ · https://apidoc.leonsoftware.com/api-reference/operations/mutations/schedule/update-sched-flights-by-ssim/

---

## 8. Subscriptions and webhooks

- **Webhooks are backed by GraphQL subscriptions.** Register one with:
  ```
  webhook { createSubscriptionWebhook(refreshToken, label, subscription, variables: Json!, webhookUrl, includeAuthorizationHeader = true) }
  ```
  List them with `webhook { subscriptionList }` and remove them with `webhook { deleteSubscriptionWebhook(label) }`.
  - `label` must be more than 5 characters.
  - Each refresh token can have at most 10 webhooks.
  - Every dynamic value must be passed as a GraphQL variable. Inline literals "will not be substituted".
- **Delivery:** a POST with a JSON body. The `Authorization` header carries a JWT signed with RS512. The JWT has `iat`, `exp` and `jti`, `iss` "Leon Software", and `aud` equal to the webhook URL. The public key is at `https://{oprId}.leon.aero/.well-known/keys/leon-subscriptions-webhook-1.pub`.
- **Flight subscriptions:**
  - `flight.flightCreate(operatorId)`
  - `flightScheduleChange(operatorId)` (departure or arrival time or airport)
  - `flightCancellation`
  - `flightCrewChanges(operatorId)`
  - `checklist.flightChecklistChanged(checklistDefinitionNid)`, `flightOpsChecklistItemChanged`, `flightSalesChecklistItemChanged`, `flightFuelChanged`
  - `passengerList`, `flightWatch`, `journeyLog`
- **Other subscriptions:**
  - `trip.tripStatusChanged` (Option / Confirmed / Opportunity), `trip.tripDoneWithCarbonOffsetItem`
  - `duty.create` / `duty.update` / `duty.delete`
  - Quote-request events (`rfqCreated`, `quoteCreated` and others)
  - Integration events for flight support and empty legs
  - `echo` (for testing)
- **RFQ webhooks are a separate mechanism.** The sales webhook mutations (`setWebhookAccept` and related) send "No HMAC, JWT, or shared-secret header", Leon does not retry, and a failure comes back as `MARKETPLACE_INTEGRATION_ERROR`.

Sources: https://apidoc.leonsoftware.com/subscriptions/Webhook/ · https://apidoc.leonsoftware.com/subscriptions/SubscriptionTriggers/ · https://apidoc.leonsoftware.com/api-reference/types/objects/webhook-mutation-section/ · https://apidoc.leonsoftware.com/api-reference/types/objects/flight-subscriptions/ · https://apidoc.leonsoftware.com/api-reference/types/objects/flight-checklist-subscriptions/ · https://apidoc.leonsoftware.com/sample-queries/echoWebhook/ · https://apidoc.leonsoftware.com/standard-workflows/rfq_quotes_management_guide/

---

## 9. Changelog highlights

- The changelogs are sprint-numbered schema diffs, Sprint 77 to Sprint 226. They carry no calendar dates.
- Recent sprints have many breaking changes (✖):
  - Sprint 217: 26 breaking changes
  - Sprint 222: 12, including `createApiKey` changing from `String!` to `CreateApiKeyOutput!`
  - Sprint 225: 13
  - Sprint 226: 27, including checklist-settings arguments moving from `ChecklistDefinitionNid!` to `ChecklistDefinitionNidScalar!`
- Milestones for the flight write path:
  - **Sprint 84:** `ChecklistMutation.opsItemNoteUpdate` added.
  - **Sprint 86:** `flightListUpdate` added to `FlightMutationQuery`. `Mutation.flightUpdate` deprecated ("use flights.flightListUpdate mutation").
  - **Sprint 92:** `tags` added to `FlightCreate`. `clientNid`, `representativeNid` and `tags` added to `TripCreate`.
  - **Sprint 94:** `addOrUpdateOpsItems`, `addOrUpdateSalesItems`, `removeOpsItems` and `removeSalesItems` added.
  - **Sprint 105:** `aoc` and `aocSource` added to `FlightCreate`.
  - **Sprint 121:** `icaoType` added to `FlightCreate`.
  - **Sprint 131:** `altAirport` and `altAirport2` added.
  - **Sprint 184:** `arcid` added.
  - **Sprint 186:** `distance` added.
  - **Sprint 191:** `isCommercial` added to `TripCreate`.
  - **Sprint 193:** `externalId` (`FlightExternalIdInput` and `TripExternalIdInput`, each only `salesforceId`) added to `FlightCreate`, `FlightUpdateInput` and `TripCreate`.
  - **Sprint 221:** `flightCareItemNoteUpdate` and `positioningItemNoteUpdate` added.

Sources: https://apidoc.leonsoftware.com/changelogs/ · https://apidoc.leonsoftware.com/changelogs/changelog-84/ · https://apidoc.leonsoftware.com/changelogs/changelog-86/ · https://apidoc.leonsoftware.com/changelogs/changelog-92/ · https://apidoc.leonsoftware.com/changelogs/changelog-94/ · https://apidoc.leonsoftware.com/changelogs/changelog-105/ · https://apidoc.leonsoftware.com/changelogs/changelog-121/ · https://apidoc.leonsoftware.com/changelogs/changelog-131/ · https://apidoc.leonsoftware.com/changelogs/changelog-184/ · https://apidoc.leonsoftware.com/changelogs/changelog-186/ · https://apidoc.leonsoftware.com/changelogs/changelog-191/ · https://apidoc.leonsoftware.com/changelogs/changelog-193/ · https://apidoc.leonsoftware.com/changelogs/changelog-217/ · https://apidoc.leonsoftware.com/changelogs/changelog-221/ · https://apidoc.leonsoftware.com/changelogs/changelog-222/ · https://apidoc.leonsoftware.com/changelogs/changelog-225/ · https://apidoc.leonsoftware.com/changelogs/changelog-226/

---

## 10. Terms that affect integrators (summary page, not the binding Terms)

- **Cost:** the API licence is free. Marketplace and flight-support integrations, and access to empty-leg or availability data, need separate paid agreements.
- **Prohibited:** using the API for charter brokerage or availability aggregation, or deploying to production before sign-off.
- **AI agents:** "Anything an agent sends is treated as sent by you."
- **Operator data:** it "belongs to that operator. Do not reuse it across customers."
- **Termination:** either party can terminate with one month's notice.
- **Governing law:** Polish law.

Source: https://apidoc.leonsoftware.com/integration-lifecycle-3rd-party-providers/
