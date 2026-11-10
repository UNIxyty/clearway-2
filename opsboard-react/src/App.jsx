import { Suspense, lazy } from 'react';
import AuthGate from './AuthGate';
import { useRoute } from './router';

// Three surfaces share one SPA, each its own chunk (2026-11-10), so a browser downloads only the surface it shows:
//   /digital-wall/timeline               -> Display (the wall screen, read-only)
//   /digital-wall/console/<page>         -> Display Console (management app; the Ops Agent dock lives here)
//   /digital-wall/timeline/?in=client    -> the client surface, framed by the portal's client shell (src/client/)
// A client's browser must download no agent code and no console code: ConsoleApp (and useAgentDock inside it) is a
// separate chunk that the client route never imports. rig/bundle-sweep.mjs reads the client's downloads to prove it.
const DisplayApp = lazy(() => import('./DisplayApp'));
const ConsoleApp = lazy(() => import('./ConsoleApp'));
const ClientApp = lazy(() => import('./client/ClientApp'));

export default function App() {
  const { route, navigate } = useRoute();
  const surface = route.surface === 'console' ? 'console' : route.client ? 'client' : 'display';

  return (
    <AuthGate surface={surface}>
      <Suspense fallback={null}>
        {surface === 'console' ? (
          <ConsoleApp page={route.page} navigate={navigate} />
        ) : surface === 'client' ? (
          <ClientApp />
        ) : (
          <DisplayApp />
        )}
      </Suspense>
    </AuthGate>
  );
}
