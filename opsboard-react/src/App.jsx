import AuthGate from './AuthGate';
import ConsoleApp from './ConsoleApp';
import DisplayApp from './DisplayApp';
import { useRoute } from './router';

// Two surfaces share one SPA:
//   /digital-wall/timeline       -> Display (the wall screen, read-only)
//   /digital-wall/console/<page> -> Display Console (management app)
export default function App() {
  const { route, navigate } = useRoute();

  return (
    <AuthGate>
      {route.surface === 'console' ? (
        <ConsoleApp page={route.page} navigate={navigate} />
      ) : (
        <DisplayApp />
      )}
    </AuthGate>
  );
}
