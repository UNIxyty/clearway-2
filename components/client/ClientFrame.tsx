"use client";

// The frame around the wall app's client surface (2026-11-10). Same origin, same session: the wall backend knows the
// client from the cookie and cuts every answer to their scope. The shell tells the frame which page the address names;
// the frame tells the shell when the person switched inside it, and the address follows without a reload.
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const pageOf = (pathname: string) => (pathname.startsWith("/client/flights") ? "flights" : pathname.startsWith("/client/settings") ? "settings" : "timeline");

export default function ClientFrame() {
  const pathname = usePathname() ?? "/client";
  const router = useRouter();
  const ref = useRef<HTMLIFrameElement>(null);
  const src = useRef(`/digital-wall/timeline/?in=client&page=${pageOf(pathname)}`); // fixed for the life of the frame
  useEffect(() => { ref.current?.contentWindow?.postMessage({ source: "cw-client-shell", type: "page", page: pageOf(pathname) }, window.location.origin); }, [pathname]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.source !== "cw-client-frame") return;
      if (e.data.type === "page") { const to = e.data.page === "flights" ? "/client/flights" : e.data.page === "settings" ? "/client/settings" : "/client"; if (to !== pathname) router.replace(to); }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pathname, router]);
  return <iframe ref={ref} src={src.current} title="Your flights" className="clw-frame" data-client-frame="" allow="screen-wake-lock" />;
}
