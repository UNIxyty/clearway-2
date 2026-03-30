/**
 * Verify four AIM URLs that failed under the old probe (UA / stale path / timeout).
 * Run: node scripts/aim-eaip-verify-four.mjs
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CASES = [
  {
    name: "Oman",
    url: "https://aim.caa.gov.om/eAIP_Oman/history-en-GB.html",
    note: "Use eAIP_Oman path (not old AIRAC_eAIPOman-* folder in stale link lists).",
  },
  {
    name: "Nepal",
    url: "https://e-aip.caanepal.gov.np/welcome/listall/1",
    note: "CAAN portal: AIP & Amendments as PDF downloads (_uploads/_pdf/…), not Eurocontrol frameset.",
  },
  {
    name: "Pakistan",
    url: "https://paa.gov.pk/aeronautical-information/electronic-aeronautical-information-publication",
    note: "React SPA (#root + bundled JS); list/API not visible without executing JS in a browser.",
  },
  {
    name: "South Korea (KOCA)",
    url: "https://aim.koca.go.kr/eaipPub/Package/history-en-GB.html",
    note: 'Eurocontrol-like history; "Currently Effective Issue" links dated AIRAC folders.',
  },
];

async function check(one) {
  const out = { ...one, ok: false, status: null, contentType: null, error: null, hints: [] };
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 45_000);
    const res = await fetch(one.url, {
      redirect: "follow",
      signal: ac.signal,
      headers: { Accept: "text/html,application/xhtml+xml,*/*;q=0.8", "User-Agent": UA },
    });
    clearTimeout(t);
    out.status = res.status;
    out.contentType = res.headers.get("content-type") || "";
    out.ok = res.ok;
    const ct = out.contentType.toLowerCase();
    if (!res.ok) {
      out.hints.push(`HTTP ${res.status}`);
      return out;
    }
    const text = await res.text();
    if (one.name === "Oman" && /New Publication/is.test(text) && /index-en-GB\.html/is.test(text)) {
      out.hints.push("has New Publication + index-en-GB (eAIP Oman)");
    }
    if (one.name === "Nepal" && text.includes("_uploads/_pdf")) {
      out.hints.push("CAAN PDF list (_uploads/_pdf)");
    }
    if (one.name === "Pakistan" && /<div id="root"><\/div>/is.test(text) && /assets\/index-.*\.js/is.test(text)) {
      out.hints.push("empty #root SPA shell");
    }
    if (one.name === "South Korea (KOCA)" && /Currently Effective Issue/is.test(text) && /index-en-GB\.html/is.test(text)) {
      out.hints.push("Currently Effective + index-en-GB");
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}

async function main() {
  console.error("AIM verify (browser UA, 45s timeout each)\n");
  for (const c of CASES) {
    const r = await check(c);
    const line = r.ok
      ? `OK ${r.status}  ${r.contentType?.split(";")[0] ?? ""}`
      : r.error
        ? `FAIL ${r.error}`
        : `FAIL HTTP ${r.status}`;
    console.error(`[${r.name}] ${line}`);
    console.error(`  URL: ${r.url}`);
    if (r.hints.length) console.error(`  Detected: ${r.hints.join("; ")}`);
    console.error(`  Note: ${r.note}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
