// NOT MOUNTED YET (2026-11-11): the groundwork for the staff phone restyle. ResponsiveWall still mounts phone/PhoneWall.jsx,
// whose passenger viewer, airport sheets, service status, notifications and deep links three suites prove; this surface
// replaces it once those parts are carried over and the tab question is decided (see the 2026-11-11 report).
// The wall's phone for staff (design "Phone Views" › Staff): the SAME surface a client gets (ClientPhone:
// the Board, the list, the flight page with Map and Passengers) with the staff parts on — every section, the
// unconfirmed ring, both markers, the open checks as chips on the list rows and the five checks on the flight page
// (StaffChecks.jsx). It follows the portal's theme and tokens, as the design says, instead of the room's wall colours
// the October phone wall drew with. The ops-room display never loads this: ResponsiveWall mounts it lazily only for a
// signed-in person framed by the portal's /m/wall, so its stylesheet never reaches the display (rig/stage1-check).
// The data is the display's (DisplayApp fetches; this arranges), the look is this person's own display profile.
import { useMemo, useState } from 'react';
import { WallColorsProvider } from '../theme/WallColorsContext';
import { useWallDisplay } from '../theme/WallDisplayContext';
import { useClientTheme } from './ClientApp';
import { clientWallColors } from './clientColors';
import ClientPhone from './ClientPhone';
import StaffChecks, { openCheckChips } from './StaffChecks';
import '../../../shared/portal-tokens.css';
import '../../../shared/client-tokens.css';
import '../../../shared/timeline-tokens.css';
import './client.css';

// staff see every section a client could, and passengers with their documents
const STAFF = { switches: ['flight_board', 'weather', 'notams', 'limitations', 'important', 'caa', 'radar', 'service_status', 'notam_check_status'], passengerLevel: 'documents' };
const NO_HIDE = { start: 'timeline', hidden: { operators: [], registrations: [] } };

export default function StaffPhone({ aircraft = [], windowStartUtc, windowEndUtc, clocks = [], loadedOnce, error, onReload, settings = {} }) {
  const theme = useClientTheme();
  const [page, setPage] = useState('timeline');
  const display = useWallDisplay();
  const colors = useMemo(() => ({ ...clientWallColors(theme), ...(display?.colors ?? {}) }), [theme, display]);
  const look = useMemo(() => { const n = (k, d) => (Number.isFinite(settings[k]) ? settings[k] : d); return { scale: n('scale', 1.3), timeZoom: n('timeZoom', 1), rowZoom: n('rowZoom', 1), pillHeight: n('pillHeight', 1), markerScale: n('markerScale', 1), labelScale: n('labelScale', 1), acColScale: n('acColScale', 1), autoFitRows: settings.autoFitRows === true }; }, [settings]);
  return (
    <WallColorsProvider colors={colors}>
      <div data-client-surface="phone" data-staff-phone="" data-theme={theme} className="cw-client">
        <ClientPhone role="staff" staffParts={{ Checks: StaffChecks, openChips: openCheckChips }} page={page} goPage={setPage} me={STAFF} prefs={NO_HIDE} setHidden={() => {}} aircraft={aircraft} visible={aircraft}
          windowStartUtc={windowStartUtc} windowEndUtc={windowEndUtc} clocks={clocks} loadedOnce={loadedOnce} error={error} feed={null} serviceOn={false} onReload={onReload} look={look} />
      </div>
    </WallColorsProvider>
  );
}
