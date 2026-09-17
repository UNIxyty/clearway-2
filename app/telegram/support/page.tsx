import Script from "next/script";
import TelegramSupportApp from "@/components/help/TelegramSupportApp";

export const dynamic = "force-dynamic";

// The mini app shell. No Supabase session here — it runs inside Telegram's
// webview; every API call authenticates with HMAC-signed initData and the
// developer allow-list (TELEGRAM_DEVELOPER_USER_IDS).
export default function TelegramSupportPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <TelegramSupportApp />
    </>
  );
}
