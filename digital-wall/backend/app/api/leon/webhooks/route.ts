import { NextRequest, NextResponse } from "next/server";
import { processLeonWebhook } from "@/lib/leon/webhooks";

function hasWebhookAccess(request: NextRequest) {
  const expected = String(process.env.LEON_WEBHOOK_SECRET || "").trim();
  if (!expected) return false;
  const provided =
    String(request.headers.get("x-leon-webhook-secret") || "").trim() ||
    String(request.nextUrl.searchParams.get("secret") || "").trim();
  return provided && provided === expected;
}

export async function POST(request: NextRequest) {
  try {
    if (!hasWebhookAccess(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await request.text();
    const payload = (rawBody ? JSON.parse(rawBody) : {}) as Record<string, unknown>;
    const eventId = request.headers.get("x-leon-event-id");
    const result = await processLeonWebhook({
      rawBody,
      payload,
      headerEventId: eventId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
