import { Suspense, lazy } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
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
// The phone app (v3, 2026-11-12): /digital-wall/phone, one app for staff and for clients, its own chunk and its own
// tokens (src/phone/tokens.css — no portal token). Staff-only parts load as a further chunk inside it.
const PhoneApp = lazy(() => import('./phone/PhoneApp'));

export default function App() {
  const { route, navigate } = useRoute();
  const surface = route.surface === 'console' ? 'console' : route.surface === 'phone' ? 'phone' : route.client ? 'client' : 'display';

  return (
    <AuthGate surface={surface}>
      {/* the last net: a surface that fails outside every inner boundary shows the small message, never a blank page */}
      <ErrorBoundary where={`surface/${surface}`}>
      <Suspense fallback={null}>
        {surface === 'console' ? (
          <ConsoleApp page={route.page} navigate={navigate} />
        ) : surface === 'phone' ? (
          <PhoneApp />
        ) : surface === 'client' ? (
          <ClientApp />
        ) : (
          <DisplayApp />
        )}
      </Suspense>
      </ErrorBoundary>
    </AuthGate>
  );
}
