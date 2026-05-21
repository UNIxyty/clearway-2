import { useEffect, useState } from "react";
import type { WorldClock } from "../types";

function formatTime(timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function WorldClockBar({ clocks }: { clocks: WorldClock[] }) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <header className="clockBar" aria-label="World clocks">
      {clocks.map((clock) => (
        <div key={clock.city} className="clockCard">
          <p className="clockTime" aria-live="polite">
            {formatTime(clock.timeZone)}
          </p>
          <p className="clockCity">{clock.city}</p>
        </div>
      ))}
      <span className="srOnly">{tick}</span>
    </header>
  );
}
