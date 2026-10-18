// The console pages' names, main actions and table grids: one source for a page's TableShell and for the skeleton
// that stands in for it (PageSkeleton.jsx), so the two can never drift. No components here (fast refresh).
export const TABLE_GRID = {
  flights: { columns: '.85fr 1.1fr 1.2fr .8fr 1fr .7fr .9fr', header: ['CALLSIGN', 'MARKERS', 'ROUTE', 'REG', 'OPERATOR', 'ETD', 'STATUS'] },
  operators: { columns: '1.4fr .8fr 1fr 1fr .9fr', header: ['OPERATOR', 'PREFIX', 'LAST SYNC', 'STATUS', 'ACTIVE'], right: ['ACTIVE'] },
  aircraft: { columns: '1fr 1.2fr 1.3fr 1.2fr .9fr', header: ['REGISTRATION', 'OPERATOR', 'UPCOMING (7 DAYS)', 'NEXT FLIGHT', 'SHOW ON WALL'], right: ['SHOW ON WALL'] },
  reports: { columns: '.7fr 2fr 1fr 1.1fr 1.1fr .8fr', header: ['CATEGORY', 'REPORT', 'STATUS', 'CREATED', 'LAST UPDATE', 'ACTIONS'], right: ['ACTIONS'] },
};
export const gridHeader = (key, onSort = {}) => TABLE_GRID[key].header.map((label) => ({ label, align: TABLE_GRID[key].right?.includes(label) ? 'right' : undefined, ...(onSort[label] ? { sort: true, onSort: onSort[label] } : {}) }));

export const PAGE_META = {
  flights: { title: 'Flights', kind: 'table' },
  'notam-check': { title: 'NOTAM Check', kind: 'notam' },
  operators: { title: 'Operators', action: 'Add operator', kind: 'table' },
  aircraft: { title: 'Aircraft', kind: 'table' },
  limitations: { title: 'Limitations', kind: 'cards' },
  important: { title: 'Important', kind: 'cards' },
  caa: { title: 'CAA details', action: 'Add CAA', kind: 'cards' },
  webhooks: { title: 'Webhooks', action: 'Refresh health', kind: 'cards' },
  reports: { title: 'Reports', action: 'New report', kind: 'table' },
  settings: { title: 'Settings', kind: 'settings' },
};
