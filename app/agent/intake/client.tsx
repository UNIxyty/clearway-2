"use client";

// Rendered in the browser only: everything on this page is fetched after sign-in, and a server render
// could only produce a skeleton whose relative times would not match the browser's (React #425/#422).
import dynamic from "next/dynamic";

const Page = dynamic(() => import("@/components/agent/intake/IntakePage"), { ssr: false });
export default function ClientPage() { return <Page />; }
