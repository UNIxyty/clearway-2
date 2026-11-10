// The console's account-side theme calls (2026-11-10): the portal's /api/user/preferences, read on load and written
// on a change. Installed into theme/portalTheme.js by the console only, so the shared chunk a client's browser loads
// carries no staff address.
import { installAccountTheme } from '../../theme/portalTheme';

installAccountTheme({
  save: (choice) => { fetch('/api/user/preferences', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: choice }) }).catch(() => {}); },
  adopt: async () => { const r = await fetch('/api/user/preferences', { headers: { accept: 'application/json' } }); if (!r.ok) return null; return (await r.json())?.preferences ?? null; },
});
