# ClearWay Reverse Engineering Report

## Phase 1 - Browser Analysis

### 1) `http://164.92.164.35/timeline`

**A. Page identity**
- Name/route: Timeline wall board (`/timeline`)
- Purpose: high-density real-time flight ops timeline + weather and permanent notices
- Audience: dispatcher / ops manager / duty controller

**B. Layout structure**
- Full-bleed dark layout; top horizontal world clock strip
- Left fixed column with date + legends (WX, timeline statuses, permanent notices)
- Right dominant grid/table with flight operational fields
- Bottom-right sticky notice detail card
- No visible sidebar on this route; appears to be wall-display mode

**C. Data entities displayed**
- Flight rows: `flight`, `adep`, `wxDep`, `etd`, `dly`, `atd`, `ades`, `wxDes`, `eta`, `ata`, `trip`, `date`
- Notice rows: numeric marker + title + long description text
- Status/weather indicators:
  - Green = above average WX
  - Orange = average WX
  - Red = below average WX
  - White = forecast unavailable
  - Timeline legend: white(not departed), light-blue(airborne), yellow(delayed), purple(CTOT), pink(arrived)

**D. UI components inventory**
- World clock tiles (time + city)
- Dense data grid (flight operations)
- Colored dot status indicators
- Legend list blocks
- Numbered permanent notice list + detail pane

**E. Interactivity and logic**
- Data auto-refresh observed via network polling
- API polling interval ~15s:
  - `GET /api/flights/data`
  - `GET /api/limitations`
- No websocket observed during session

**F. Color system and visual language**
- Background: deep navy/blue (`#0d1726` to `#1f2e45` range)
- Header/table accents: slate blue (`#63718e` range)
- Typography: sans-serif, heavy numeric emphasis, tabular-leaning alignment
- Status mapping is color-led with minimal text duplication

**G. Cross-page relationships**
- Permanent notices shown on timeline are aligned with limitation objects in admin panel
- Flight/operator identifiers appear shared with admin entities

---

### 2) Authenticated admin shell (`/limitations`, `/operators`, `/caa-details`, `/aircrafts`, `/users`, `/logs`)

**A. Page identity**
- Left nav shell branded "ClearWay API"
- Purpose: configuration/admin for timeline feed inputs
- Audience: operations admin / dispatcher supervisor

**B. Layout structure**
- Left persistent sidebar: navigation, profile card, logout
- Right content canvas: page title + action button + table/form content
- Reusable modal overlay pattern on create/invite forms

**C. Data entities**
- **Limitations**: `id`, `isPermanent`, `startDate`, `endDate`, `title`, `description`, `type`, `airports`, `countries`, `flights`
- **Operators**: `operatorId`, `name`, `flightCount`, `refreshToken`
- **CAA details**: country + authority/contact fields
- **Aircrafts**: tail-number inventory
- **Users**: email/name/activity/role/action state
- **Logs**: date, user, role, action, message

**D. Component inventory**
- Sidebar nav + active item state
- Data tables with expandable-row affordance (`▾` icon)
- Primary action buttons ("Create", "Invite", "Update")
- Modal forms:
  - Limitation creation form
  - Operator creation form
  - User invitation form
- Pagination controls (logs)

**E. Interactivity and logic**
- Limitations filter/select behavior implied through type in form and table segmentation
- Modal open/close from action buttons; cancel closes
- Logs page has pagination controls (`|<`, `<`, page numbers)
- Timeline and limitation data are linked via shared backend polling endpoints

**F. Visual language**
- Same dark palette as timeline for continuity
- Large headings (~display size), medium table text, muted secondary labels
- Green action button for save/update, gray-blue for neutral actions/cancel

**G. Cross-page relationships**
- `Limitations` directly influences `timeline` permanent notice section
- `Operators` and `Aircrafts` align with flight rows/flight ownership contexts
- `Logs` records CRUD actions for limitations and likely other config entities

## Phase 2 - Reconstruction Plan

### Component map
- `ClearwayCloneApp` (shell + section switching)
- Shared:
  - `PanelShell`
  - `DataTable`
  - `CellRow`
  - `Modal`
  - `TextInput`
- Page components:
  - `TimelinePage`
  - `LimitationsPage`
  - `OperatorsPage`
  - `CaaDetailsPage`
  - `AircraftsPage`
  - `UsersPage`
  - `LogsPage`

### Data schema
- `FlightRow`
- `Limitation`
- `Operator`
- `CaaDetails`
- `UserRecord`
- `LogRecord`
- Status enums:
  - `TimelineStatus`
  - `WxStatus`
  - `LimitationType`
  - `UserRole`
  - `LogAction`

### Routing plan
- Clone entry route: `/clearway-clone`
- Internal navigation in-app mirrors original sections:
  - Timeline
  - Limitations
  - Operators
  - CAA Details
  - Aircrafts
  - Users
  - Logs

### Fake data plan
- Timeline flights: 18 rows
- Limitations: 6 records
- Operators: 10 records
- Aircrafts: 22 tail numbers
- Users: 5 users
- Logs: 7 log entries
- CAA details: single structured profile object
