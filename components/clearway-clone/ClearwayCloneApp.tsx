"use client";

import AircraftsPage from "@/components/clearway-clone/pages/AircraftsPage";
import CaaDetailsPage from "@/components/clearway-clone/pages/CaaDetailsPage";
import LimitationsPage from "@/components/clearway-clone/pages/LimitationsPage";
import LogsPage from "@/components/clearway-clone/pages/LogsPage";
import OperatorsPage from "@/components/clearway-clone/pages/OperatorsPage";
import TimelinePage from "@/components/clearway-clone/pages/TimelinePage";
import UsersPage from "@/components/clearway-clone/pages/UsersPage";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

const sections = [
  { key: "timeline", label: "Timeline" },
  { key: "limitations", label: "Limitations" },
  { key: "operators", label: "Operators" },
  { key: "caa", label: "CAA Details" },
  { key: "aircrafts", label: "Aircrafts" },
  { key: "users", label: "Users" },
  { key: "logs", label: "Logs" },
] as const;

type SectionKey = (typeof sections)[number]["key"];

function getClock() {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(Date.now());
}

export default function ClearwayCloneApp() {
  const [active, setActive] = useState<SectionKey>("timeline");
  const [updatedAt, setUpdatedAt] = useState(getClock());

  const page = useMemo(() => {
    if (active === "timeline") {
      return <TimelinePage />;
    }

    return (
      <div className="min-h-dvh bg-[#0e1827] p-6">
        <div className="grid grid-cols-[340px_1fr] gap-6">
          <aside className="rounded-md bg-[#1c2a3e] p-6">
            <h1 className="text-balance text-5xl font-semibold text-slate-100">ClearWay API</h1>
            <nav className="mt-8 space-y-4">
              {sections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActive(section.key)}
                  className={cn(
                    "block w-full rounded-md px-4 py-2 text-left text-3xl text-slate-400",
                    section.key === active && "bg-[#273a56] text-slate-100"
                  )}
                >
                  {section.label}
                </button>
              ))}
            </nav>
            <div className="mt-16 rounded-md bg-[#172437] p-4 text-slate-300">
              <div className="text-xl">PROFILE</div>
              <div className="mt-2 text-3xl text-slate-100">Valerijs Zujevics</div>
              <div className="text-2xl text-slate-400">Admin</div>
              <button type="button" className="mt-4 h-12 w-full rounded-md bg-[#63718e] text-2xl text-slate-100">
                Log out
              </button>
            </div>
          </aside>
          <div className="space-y-4">
            <header className="flex items-center justify-between rounded-md bg-[#1c2a3e] px-6 py-3">
              <div className="text-2xl text-slate-300">Static clone mode (mock data only)</div>
              <div className="flex items-center gap-4">
                <div className="text-2xl text-slate-300 tabular-nums">Last updated: {updatedAt} UTC</div>
                <button
                  type="button"
                  className="h-10 rounded-md bg-[#63718e] px-3 text-xl text-slate-100"
                  onClick={() => setUpdatedAt(getClock())}
                >
                  Refresh timestamp
                </button>
              </div>
            </header>
            {active === "limitations" && <LimitationsPage />}
            {active === "operators" && <OperatorsPage />}
            {active === "caa" && <CaaDetailsPage />}
            {active === "aircrafts" && <AircraftsPage />}
            {active === "users" && <UsersPage />}
            {active === "logs" && <LogsPage />}
          </div>
        </div>
      </div>
    );
  }, [active, updatedAt]);

  return (
    <div className="bg-[#0e1827]">
      {active === "timeline" ? (
        <div>
          <div className="fixed right-3 top-3 z-10 rounded bg-[#1f2f46]/90 px-3 py-1 text-xl text-slate-200">
            <button
              type="button"
              className="rounded bg-[#63718e] px-2 py-1 text-lg text-slate-100"
              onClick={() => setActive("limitations")}
            >
              Open admin shell
            </button>
          </div>
          {page}
        </div>
      ) : (
        page
      )}
    </div>
  );
}
