import GreeceHitlViewerClient from "./viewer-client";

type ViewerPageProps = {
  searchParams?: {
    src?: string | string[];
    sessionId?: string | string[];
    closeOnClear?: string | string[];
  };
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function GreeceHitlViewerPage({ searchParams }: ViewerPageProps) {
  return (
    <GreeceHitlViewerClient
      noVncUrl={firstParam(searchParams?.src)}
      sessionId={firstParam(searchParams?.sessionId)}
      closeOnClear={firstParam(searchParams?.closeOnClear) !== "0"}
    />
  );
}
