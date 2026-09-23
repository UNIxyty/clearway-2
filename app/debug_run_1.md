Debug Raw Stream
Run: b363ce26-b8cc-4bbc-a1ae-42db06ca3748
Back to Debug Runner
2026-05-01T02:47:39.691Z [info] LTAH Started.
2026-05-01T02:47:42.157Z [error] LTAF GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Turkey (LT)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:47:42.157Z [info] LSZS Started.
2026-05-01T02:47:42.791Z [error] LTAI GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Turkey (LT)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:47:42.791Z [info] LSZR Started.
2026-05-01T02:47:47.370Z [error] LSZS AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:47:47.370Z [info] LSZS Started.
2026-05-01T02:47:49.764Z [info] LSZR Completed.
2026-05-01T02:47:49.764Z [info] LSZR Started.
2026-05-01T02:47:50.742Z [info] LSZS Completed.
2026-05-01T02:47:50.742Z [info] LSZS Started.
2026-05-01T02:47:53.454Z [info] LSZR Completed.
2026-05-01T02:47:53.454Z [info] LSZR Started.
2026-05-01T02:47:54.412Z [info] LSZS Completed.
2026-05-01T02:47:54.412Z [info] LSZS Started.
2026-05-01T02:47:57.603Z [info] LSZR Completed.
2026-05-01T02:47:57.603Z [info] LSZR Started.
2026-05-01T02:47:57.605Z [info] LSZR Saved artifact aip/debug-runs/b363ce26-b8cc-4bbc-a1ae-42db06ca3748/switzerland/LSZR.pdf
2026-05-01T02:47:57.605Z [info] LSZR Completed.
2026-05-01T02:47:57.606Z [info] LSZR Started.
2026-05-01T02:48:04.944Z [error] LSZR GEN sync HTTP 502: GEN sync failed | node exited 1: Data`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LS_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Switzerland (LS), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:48:04.944Z [info] LSZH Started.
2026-05-01T02:48:12.725Z [info] LSZH Completed.
2026-05-01T02:48:12.725Z [info] LSZH Started.
2026-05-01T02:48:16.125Z [error] LTAH PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:48:16.125Z [info] LTAH Started.
2026-05-01T02:48:16.766Z [info] LSZH Completed.
2026-05-01T02:48:16.766Z [info] LSZH Started.
2026-05-01T02:48:20.867Z [info] LSZH Completed.
2026-05-01T02:48:20.867Z [info] LSZH Started.
2026-05-01T02:48:20.871Z [info] LSZH Artifact skipped: country already has one PDF.
2026-05-01T02:48:20.871Z [info] LSZH Completed.
2026-05-01T02:48:20.871Z [info] LSZH Started.
2026-05-01T02:48:23.225Z [error] LTAH GEN sync HTTP 502: GEN sync failed | node exited 1: EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Trying GEN candidate: LT_GEN_1_2_en.pdf | GEN 1.2 PROCEDURES FOR ENTRY, TRANSIT AND DEPARTURE OF AIRCRAFT
[EAD GEN] Skip candidate (not PDF): LT_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Turkey (LT), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:48:23.225Z [info] LSZG Started.
2026-05-01T02:48:30.274Z [info] LSZG Completed.
2026-05-01T02:48:30.274Z [info] LSZG Started.
2026-05-01T02:48:30.606Z [error] LSZS PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:48:30.606Z [info] LSZS Started.
2026-05-01T02:48:34.018Z [info] LSZG Completed.
2026-05-01T02:48:34.018Z [info] LSZG Started.
2026-05-01T02:48:37.577Z [error] LSZS GEN sync HTTP 502: GEN sync failed | node exited 1: Data`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LS_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Switzerland (LS), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:48:37.577Z [info] LSZC Started.
2026-05-01T02:48:37.977Z [info] LSZG Completed.
2026-05-01T02:48:37.977Z [info] LSZG Started.
2026-05-01T02:48:37.979Z [info] LSZG Artifact skipped: country already has one PDF.
2026-05-01T02:48:37.979Z [info] LSZG Completed.
2026-05-01T02:48:37.979Z [info] LSZG Started.
2026-05-01T02:48:41.805Z [error] LSZC AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:48:41.805Z [info] LSZC Started.
2026-05-01T02:48:45.175Z [info] LSZC Completed.
2026-05-01T02:48:45.175Z [info] LSZC Started.
2026-05-01T02:48:45.425Z [error] LSZG GEN sync HTTP 502: GEN sync failed | node exited 1: Data`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LS_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Switzerland (LS), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:48:45.425Z [info] LSZB Started.
2026-05-01T02:48:50.135Z [info] LSZC Completed.
2026-05-01T02:48:50.135Z [info] LSZC Started.
2026-05-01T02:48:56.785Z [info] LSZC Artifact skipped: country already has one PDF.
2026-05-01T02:48:56.785Z [info] LSZC Completed.
2026-05-01T02:48:56.785Z [info] LSZC Started.
2026-05-01T02:49:04.091Z [error] LSZC GEN sync HTTP 502: GEN sync failed | node exited 1: Data`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LS_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Switzerland (LS), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:49:04.091Z [info] LSZA Started.
2026-05-01T02:49:10.535Z [error] LSZH GEN sync HTTP 502: GEN sync failed | node exited 1: cting country: Switzerland (LS)
[EAD GEN] Error: locator.waitFor: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:selectAuthorityCode_input"]').or(locator('select[id$="selectAuthorityCode_input"]')).or(locator('select').filter({ has: getByRole('option', { name: 'Switzerland (LS)' }) })).first() to be visible

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:49:10.535Z [info] LSMP Started.
2026-05-01T02:49:11.027Z [info] LSZA Completed.
2026-05-01T02:49:11.027Z [info] LSZA Started.
2026-05-01T02:49:12.278Z [info] LSZB Completed.
2026-05-01T02:49:12.278Z [info] LSZB Started.
2026-05-01T02:49:15.417Z [info] LSZA Completed.
2026-05-01T02:49:15.417Z [info] LSZA Started.
2026-05-01T02:49:16.190Z [info] LSZB Completed.
2026-05-01T02:49:16.190Z [info] LSZB Started.
2026-05-01T02:49:18.428Z [info] LSMP Completed.
2026-05-01T02:49:18.428Z [info] LSMP Started.
2026-05-01T02:49:19.826Z [info] LSZA Completed.
2026-05-01T02:49:19.826Z [info] LSZA Started.
2026-05-01T02:49:19.828Z [info] LSZA Artifact skipped: country already has one PDF.
2026-05-01T02:49:19.828Z [info] LSZA Completed.
2026-05-01T02:49:19.828Z [info] LSZA Started.
2026-05-01T02:49:20.031Z [info] LSZB Completed.
2026-05-01T02:49:20.031Z [info] LSZB Started.
2026-05-01T02:49:20.033Z [info] LSZB Artifact skipped: country already has one PDF.
2026-05-01T02:49:20.033Z [info] LSZB Completed.
2026-05-01T02:49:20.033Z [info] LSZB Started.
2026-05-01T02:49:22.304Z [info] LSMP Completed.
2026-05-01T02:49:22.304Z [info] LSMP Started.
2026-05-01T02:49:26.051Z [info] LSMP Completed.
2026-05-01T02:49:26.051Z [info] LSMP Started.
2026-05-01T02:49:26.053Z [info] LSMP Artifact skipped: country already has one PDF.
2026-05-01T02:49:26.053Z [info] LSMP Completed.
2026-05-01T02:49:26.053Z [info] LSMP Started.
2026-05-01T02:49:27.422Z [error] LSZA GEN sync HTTP 502: GEN sync failed | node exited 1: Data`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LS_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Switzerland (LS), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:49:27.422Z [info] LSGS Started.
2026-05-01T02:49:34.117Z [error] LSZB GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Switzerland (LS)
[EAD GEN] Opening login page
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:49:34.117Z [info] LSGG Started.
2026-05-01T02:49:34.891Z [info] LSGS Completed.
2026-05-01T02:49:34.891Z [info] LSGS Started.
2026-05-01T02:49:38.768Z [info] LSGS Completed.
2026-05-01T02:49:38.768Z [info] LSGS Started.
2026-05-01T02:49:41.827Z [info] LSGG Completed.
2026-05-01T02:49:41.827Z [info] LSGG Started.
2026-05-01T02:49:42.497Z [info] LSGS Completed.
2026-05-01T02:49:42.497Z [info] LSGS Started.
2026-05-01T02:49:42.499Z [info] LSGS Artifact skipped: country already has one PDF.
2026-05-01T02:49:42.499Z [info] LSGS Completed.
2026-05-01T02:49:42.499Z [info] LSGS Started.
2026-05-01T02:49:46.226Z [info] LSGG Completed.
2026-05-01T02:49:46.226Z [info] LSGG Started.
2026-05-01T02:49:49.566Z [info] LSGG Completed.
2026-05-01T02:49:49.566Z [info] LSGG Started.
2026-05-01T02:49:49.569Z [info] LSGG Artifact skipped: country already has one PDF.
2026-05-01T02:49:49.569Z [info] LSGG Completed.
2026-05-01T02:49:49.569Z [info] LSGG Started.
2026-05-01T02:49:50.441Z [error] LSGS GEN sync HTTP 502: GEN sync failed | node exited 1: Data`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LS_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Switzerland (LS), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:49:50.441Z [info] LSGC Started.
2026-05-01T02:49:53.918Z [error] LSGG GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Switzerland (LS)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:49:53.918Z [info] LMML Started.
2026-05-01T02:50:01.374Z [info] LMML Completed.
2026-05-01T02:50:01.374Z [info] LMML Started.
2026-05-01T02:50:05.285Z [info] LMML Completed.
2026-05-01T02:50:05.285Z [info] LMML Started.
2026-05-01T02:50:08.982Z [info] LMML Completed.
2026-05-01T02:50:08.982Z [info] LMML Started.
2026-05-01T02:50:08.985Z [info] LMML Saved artifact aip/debug-runs/b363ce26-b8cc-4bbc-a1ae-42db06ca3748/malta/LMML.pdf
2026-05-01T02:50:08.985Z [info] LMML Completed.
2026-05-01T02:50:08.985Z [info] LMML Started.
2026-05-01T02:50:15.384Z [error] LSMP GEN sync HTTP 502: GEN sync failed | node exited 1: cting country: Switzerland (LS)
[EAD GEN] Error: locator.waitFor: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:selectAuthorityCode_input"]').or(locator('select[id$="selectAuthorityCode_input"]')).or(locator('select').filter({ has: getByRole('option', { name: 'Switzerland (LS)' }) })).first() to be visible

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:50:15.384Z [info] LIRZ Started.
2026-05-01T02:50:17.469Z [error] LMML GEN sync HTTP 502: GEN sync failed | node exited 1:  AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Trying GEN candidate: LM_GEN_1_2_EN.pdf | GEN 1.2 ENTRY, TRANSIT AND DEPARTURE OF AIRCRAFT
[EAD GEN] Skip candidate (not PDF): LM_GEN_1_2_EN.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Malta (LM), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:50:17.469Z [info] LIRV Started.
2026-05-01T02:50:25.702Z [info] LIRV Completed.
2026-05-01T02:50:25.702Z [info] LIRV Started.
2026-05-01T02:50:26.419Z [error] LSGC AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:50:26.419Z [info] LSGC Started.
2026-05-01T02:50:29.104Z [info] LIRV Completed.
2026-05-01T02:50:29.104Z [info] LIRV Started.
2026-05-01T02:50:30.615Z [info] LSGC Completed.
2026-05-01T02:50:30.615Z [info] LSGC Started.
2026-05-01T02:50:32.462Z [info] LIRV Completed.
2026-05-01T02:50:32.462Z [info] LIRV Started.
2026-05-01T02:50:32.469Z [info] LIRV Saved artifact aip/debug-runs/b363ce26-b8cc-4bbc-a1ae-42db06ca3748/italy/LIRV.pdf
2026-05-01T02:50:32.469Z [info] LIRV Completed.
2026-05-01T02:50:32.469Z [info] LIRV Started.
2026-05-01T02:50:34.741Z [info] LSGC Completed.
2026-05-01T02:50:34.741Z [info] LSGC Started.
2026-05-01T02:50:41.965Z [info] LSGC Artifact skipped: country already has one PDF.
2026-05-01T02:50:41.965Z [info] LSGC Completed.
2026-05-01T02:50:41.965Z [info] LSGC Started.
2026-05-01T02:50:49.370Z [error] LSGC GEN sync HTTP 502: GEN sync failed | node exited 1: Data`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LS_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Switzerland (LS), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:50:49.370Z [info] LIRU Started.
2026-05-01T02:50:51.137Z [error] LIRZ AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:50:51.137Z [info] LIRZ Started.
2026-05-01T02:50:55.304Z [info] LIRZ Completed.
2026-05-01T02:50:55.304Z [info] LIRZ Started.
2026-05-01T02:50:57.618Z [info] LIRU Completed.
2026-05-01T02:50:57.618Z [info] LIRU Started.
2026-05-01T02:50:59.254Z [info] LIRZ Completed.
2026-05-01T02:50:59.254Z [info] LIRZ Started.
2026-05-01T02:51:01.835Z [info] LIRU Completed.
2026-05-01T02:51:01.835Z [info] LIRU Started.
2026-05-01T02:51:05.645Z [info] LIRU Completed.
2026-05-01T02:51:05.645Z [info] LIRU Started.
2026-05-01T02:51:05.648Z [info] LIRU Artifact skipped: country already has one PDF.
2026-05-01T02:51:05.648Z [info] LIRU Completed.
2026-05-01T02:51:05.648Z [info] LIRU Started.
2026-05-01T02:51:07.296Z [info] LIRZ Artifact skipped: country already has one PDF.
2026-05-01T02:51:07.296Z [info] LIRZ Completed.
2026-05-01T02:51:07.296Z [info] LIRZ Started.
2026-05-01T02:51:14.452Z [error] LIRZ GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:51:14.452Z [info] LIRS Started.
2026-05-01T02:51:18.032Z [error] LIRV GEN sync HTTP 502: GEN sync failed | node exited 1: ditions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T02:51:18.032Z [info] LIRQ Started.
2026-05-01T02:51:26.257Z [info] LIRQ Completed.
2026-05-01T02:51:26.257Z [info] LIRQ Started.
2026-05-01T02:51:30.258Z [info] LIRQ Completed.
2026-05-01T02:51:30.258Z [info] LIRQ Started.
2026-05-01T02:51:33.771Z [info] LIRQ Completed.
2026-05-01T02:51:33.771Z [info] LIRQ Started.
2026-05-01T02:51:33.774Z [info] LIRQ Artifact skipped: country already has one PDF.
2026-05-01T02:51:33.774Z [info] LIRQ Completed.
2026-05-01T02:51:33.774Z [info] LIRQ Started.
2026-05-01T02:51:42.284Z [error] LIRQ GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:51:42.284Z [info] LIRP Started.
2026-05-01T02:51:50.439Z [info] LIRP Completed.
2026-05-01T02:51:50.439Z [info] LIRP Started.
2026-05-01T02:51:50.615Z [error] LIRS AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:51:50.615Z [info] LIRS Started.
2026-05-01T02:51:54.228Z [info] LIRP Completed.
2026-05-01T02:51:54.228Z [info] LIRP Started.
2026-05-01T02:51:55.037Z [info] LIRS Completed.
2026-05-01T02:51:55.037Z [info] LIRS Started.
2026-05-01T02:51:55.163Z [error] LIRU GEN sync HTTP 502: GEN sync failed | node exited 1: AD GEN] Selecting country: Italy (LI)
[EAD GEN] Error: locator.waitFor: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:selectAuthorityCode_input"]').or(locator('select[id$="selectAuthorityCode_input"]')).or(locator('select').filter({ has: getByRole('option', { name: 'Italy (LI)' }) })).first() to be visible

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:51:55.163Z [info] LIRN Started.
2026-05-01T02:51:58.626Z [info] LIRP Completed.
2026-05-01T02:51:58.626Z [info] LIRP Started.
2026-05-01T02:51:58.630Z [info] LIRP Artifact skipped: country already has one PDF.
2026-05-01T02:51:58.630Z [info] LIRP Completed.
2026-05-01T02:51:58.630Z [info] LIRP Started.
2026-05-01T02:51:59.498Z [info] LIRS Completed.
2026-05-01T02:51:59.498Z [info] LIRS Started.
2026-05-01T02:52:02.980Z [error] LIRP GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:52:02.980Z [info] LIRL Started.
2026-05-01T02:52:10.834Z [info] LIRL Completed.
2026-05-01T02:52:10.834Z [info] LIRL Started.
2026-05-01T02:52:14.571Z [info] LIRL Completed.
2026-05-01T02:52:14.571Z [info] LIRL Started.
2026-05-01T02:52:18.293Z [info] LIRL Completed.
2026-05-01T02:52:18.293Z [info] LIRL Started.
2026-05-01T02:52:18.296Z [info] LIRL Artifact skipped: country already has one PDF.
2026-05-01T02:52:18.296Z [info] LIRL Completed.
2026-05-01T02:52:18.296Z [info] LIRL Started.
2026-05-01T02:52:27.150Z [error] LIRL GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:52:27.150Z [info] LIRJ Started.
2026-05-01T02:52:31.079Z [error] LIRN AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:52:31.079Z [info] LIRN Started.
2026-05-01T02:52:34.720Z [info] LIRJ Completed.
2026-05-01T02:52:34.720Z [info] LIRJ Started.
2026-05-01T02:52:34.819Z [info] LIRN Completed.
2026-05-01T02:52:34.819Z [info] LIRN Started.
2026-05-01T02:52:35.689Z [error] LIRS PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:52:35.689Z [info] LIRS Started.
2026-05-01T02:52:38.547Z [info] LIRJ Completed.
2026-05-01T02:52:38.547Z [info] LIRJ Started.
2026-05-01T02:52:38.705Z [info] LIRN Completed.
2026-05-01T02:52:38.705Z [info] LIRN Started.
2026-05-01T02:52:42.338Z [info] LIRJ Completed.
2026-05-01T02:52:42.338Z [info] LIRJ Started.
2026-05-01T02:52:42.342Z [info] LIRJ Artifact skipped: country already has one PDF.
2026-05-01T02:52:42.342Z [info] LIRJ Completed.
2026-05-01T02:52:42.342Z [info] LIRJ Started.
2026-05-01T02:52:50.099Z [error] LIRJ GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:52:50.099Z [info] LIRI Started.
2026-05-01T02:52:57.545Z [info] LIRI Completed.
2026-05-01T02:52:57.545Z [info] LIRI Started.
2026-05-01T02:53:01.196Z [info] LIRI Completed.
2026-05-01T02:53:01.196Z [info] LIRI Started.
2026-05-01T02:53:05.058Z [info] LIRI Completed.
2026-05-01T02:53:05.058Z [info] LIRI Started.
2026-05-01T02:53:05.062Z [info] LIRI Artifact skipped: country already has one PDF.
2026-05-01T02:53:05.062Z [info] LIRI Completed.
2026-05-01T02:53:05.062Z [info] LIRI Started.
2026-05-01T02:53:13.097Z [error] LIRI GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:53:13.097Z [info] LIRG Started.
2026-05-01T02:53:14.795Z [error] LIRN PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:53:14.795Z [info] LIRN Started.
2026-05-01T02:53:18.301Z [error] LIRG AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:53:18.301Z [info] LIRG Started.
2026-05-01T02:53:21.558Z [error] LIRS GEN sync HTTP 502: GEN sync failed | node exited 1: ions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:53:21.558Z [info] LIRF Started.
2026-05-01T02:53:22.072Z [info] LIRG Completed.
2026-05-01T02:53:22.072Z [info] LIRG Started.
2026-05-01T02:53:22.465Z [error] LIRN GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:53:22.465Z [info] LIRA Started.
2026-05-01T02:53:26.377Z [info] LIRG Completed.
2026-05-01T02:53:26.377Z [info] LIRG Started.
2026-05-01T02:53:26.403Z [error] LIRF AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:53:26.403Z [info] LIRF Started.
2026-05-01T02:53:30.421Z [info] LIRF Completed.
2026-05-01T02:53:30.421Z [info] LIRF Started.
2026-05-01T02:53:33.402Z [info] LIRG Artifact skipped: country already has one PDF.
2026-05-01T02:53:33.402Z [info] LIRG Completed.
2026-05-01T02:53:33.402Z [info] LIRG Started.
2026-05-01T02:53:34.204Z [info] LIRF Completed.
2026-05-01T02:53:34.204Z [info] LIRF Started.
2026-05-01T02:53:37.893Z [error] LIRG GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:53:37.893Z [info] LIQW Started.
2026-05-01T02:53:46.700Z [info] LIQW Completed.
2026-05-01T02:53:46.700Z [info] LIQW Started.
2026-05-01T02:53:50.974Z [info] LIQW Completed.
2026-05-01T02:53:50.974Z [info] LIQW Started.
2026-05-01T02:53:54.684Z [info] LIQW Completed.
2026-05-01T02:53:54.684Z [info] LIQW Started.
2026-05-01T02:53:54.688Z [info] LIQW Artifact skipped: country already has one PDF.
2026-05-01T02:53:54.688Z [info] LIQW Completed.
2026-05-01T02:53:54.688Z [info] LIQW Started.
2026-05-01T02:53:59.509Z [error] LIRA AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:53:59.509Z [info] LIRA Started.
2026-05-01T02:54:02.211Z [error] LIQW GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:54:02.211Z [info] LIQS Started.
2026-05-01T02:54:03.372Z [info] LIRA Completed.
2026-05-01T02:54:03.372Z [info] LIRA Started.
2026-05-01T02:54:07.676Z [info] LIRA Completed.
2026-05-01T02:54:07.676Z [info] LIRA Started.
2026-05-01T02:54:09.373Z [info] LIQS Completed.
2026-05-01T02:54:09.373Z [info] LIQS Started.
2026-05-01T02:54:10.275Z [error] LIRF PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:54:10.275Z [info] LIRF Started.
2026-05-01T02:54:13.720Z [info] LIQS Completed.
2026-05-01T02:54:13.720Z [info] LIQS Started.
2026-05-01T02:54:16.985Z [info] LIQS Completed.
2026-05-01T02:54:16.985Z [info] LIQS Started.
2026-05-01T02:54:16.987Z [info] LIQS Artifact skipped: country already has one PDF.
2026-05-01T02:54:16.987Z [info] LIQS Completed.
2026-05-01T02:54:16.987Z [info] LIQS Started.
2026-05-01T02:54:17.678Z [error] LIRF GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:54:17.678Z [info] LIQN Started.
2026-05-01T02:54:21.356Z [error] LIQS GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:54:21.356Z [info] LIQL Started.
2026-05-01T02:54:30.018Z [info] LIQL Completed.
2026-05-01T02:54:30.018Z [info] LIQL Started.
2026-05-01T02:54:33.384Z [info] LIQL Completed.
2026-05-01T02:54:33.384Z [info] LIQL Started.
2026-05-01T02:54:36.655Z [info] LIQL Completed.
2026-05-01T02:54:36.655Z [info] LIQL Started.
2026-05-01T02:54:36.658Z [info] LIQL Artifact skipped: country already has one PDF.
2026-05-01T02:54:36.658Z [info] LIQL Completed.
2026-05-01T02:54:36.658Z [info] LIQL Started.
2026-05-01T02:54:43.773Z [error] LIRA PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:54:43.773Z [info] LIRA Started.
2026-05-01T02:54:44.061Z [error] LIQL GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:54:44.062Z [info] LIQB Started.
2026-05-01T02:54:46.037Z [info] LIQN Completed.
2026-05-01T02:54:46.037Z [info] LIQN Started.
2026-05-01T02:54:48.075Z [error] LIRA GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:54:48.075Z [info] LIPZ Started.
2026-05-01T02:54:49.859Z [info] LIQN Completed.
2026-05-01T02:54:49.859Z [info] LIQN Started.
2026-05-01T02:54:53.602Z [info] LIQN Completed.
2026-05-01T02:54:53.602Z [info] LIQN Started.
2026-05-01T02:54:53.606Z [info] LIQN Artifact skipped: country already has one PDF.
2026-05-01T02:54:53.606Z [info] LIQN Completed.
2026-05-01T02:54:53.606Z [info] LIQN Started.
2026-05-01T02:55:01.409Z [error] LIQN GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:55:01.409Z [info] LIPY Started.
2026-05-01T02:55:09.177Z [info] LIPY Completed.
2026-05-01T02:55:09.177Z [info] LIPY Started.
2026-05-01T02:55:13.048Z [info] LIPY Completed.
2026-05-01T02:55:13.048Z [info] LIPY Started.
2026-05-01T02:55:16.429Z [info] LIPZ Completed.
2026-05-01T02:55:16.429Z [info] LIPZ Started.
2026-05-01T02:55:16.717Z [info] LIPY Completed.
2026-05-01T02:55:16.717Z [info] LIPY Started.
2026-05-01T02:55:16.720Z [info] LIPY Artifact skipped: country already has one PDF.
2026-05-01T02:55:16.720Z [info] LIPY Completed.
2026-05-01T02:55:16.720Z [info] LIPY Started.
2026-05-01T02:55:20.240Z [error] LIQB AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:55:20.240Z [info] LIQB Started.
2026-05-01T02:55:20.434Z [info] LIPZ Completed.
2026-05-01T02:55:20.434Z [info] LIPZ Started.
2026-05-01T02:55:23.884Z [info] LIQB Completed.
2026-05-01T02:55:23.884Z [info] LIQB Started.
2026-05-01T02:55:23.895Z [info] LIPZ Completed.
2026-05-01T02:55:23.895Z [info] LIPZ Started.
2026-05-01T02:55:23.898Z [info] LIPZ Artifact skipped: country already has one PDF.
2026-05-01T02:55:23.898Z [info] LIPZ Completed.
2026-05-01T02:55:23.898Z [info] LIPZ Started.
2026-05-01T02:55:27.676Z [info] LIQB Completed.
2026-05-01T02:55:27.676Z [info] LIQB Started.
2026-05-01T02:55:31.488Z [error] LIPY GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:55:31.489Z [info] LIPX Started.
2026-05-01T02:55:40.182Z [info] LIPX Completed.
2026-05-01T02:55:40.182Z [info] LIPX Started.
2026-05-01T02:55:44.153Z [info] LIPX Completed.
2026-05-01T02:55:44.153Z [info] LIPX Started.
2026-05-01T02:55:47.919Z [info] LIPX Completed.
2026-05-01T02:55:47.919Z [info] LIPX Started.
2026-05-01T02:55:47.923Z [info] LIPX Artifact skipped: country already has one PDF.
2026-05-01T02:55:47.923Z [info] LIPX Completed.
2026-05-01T02:55:47.923Z [info] LIPX Started.
2026-05-01T02:55:55.457Z [error] LIPX GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:55:55.457Z [info] LIPV Started.
2026-05-01T02:56:03.068Z [info] LIPV Completed.
2026-05-01T02:56:03.068Z [info] LIPV Started.
2026-05-01T02:56:03.557Z [error] LIQB PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:56:03.557Z [info] LIQB Started.
2026-05-01T02:56:07.202Z [info] LIPV Completed.
2026-05-01T02:56:07.202Z [info] LIPV Started.
2026-05-01T02:56:10.052Z [error] LIPZ GEN sync HTTP 502: GEN sync failed | node exited 1: ions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:56:10.052Z [info] LIPU Started.
2026-05-01T02:56:10.848Z [info] LIPV Completed.
2026-05-01T02:56:10.848Z [info] LIPV Started.
2026-05-01T02:56:10.852Z [info] LIPV Artifact skipped: country already has one PDF.
2026-05-01T02:56:10.852Z [info] LIPV Completed.
2026-05-01T02:56:10.852Z [info] LIPV Started.
2026-05-01T02:56:11.459Z [error] LIQB GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:56:11.459Z [info] LIPR Started.
2026-05-01T02:56:20.057Z [info] LIPR Completed.
2026-05-01T02:56:20.057Z [info] LIPR Started.
2026-05-01T02:56:23.867Z [info] LIPR Completed.
2026-05-01T02:56:23.867Z [info] LIPR Started.
2026-05-01T02:56:24.160Z [error] LIPU AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:56:24.160Z [info] LIPU Started.
2026-05-01T02:56:24.206Z [error] LIPV GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:56:24.206Z [info] LIPQ Started.
2026-05-01T02:56:27.964Z [info] LIPU Completed.
2026-05-01T02:56:27.964Z [info] LIPU Started.
2026-05-01T02:56:28.116Z [info] LIPR Completed.
2026-05-01T02:56:28.116Z [info] LIPR Started.
2026-05-01T02:56:28.121Z [info] LIPR Artifact skipped: country already has one PDF.
2026-05-01T02:56:28.121Z [info] LIPR Completed.
2026-05-01T02:56:28.121Z [info] LIPR Started.
2026-05-01T02:56:31.727Z [info] LIPU Completed.
2026-05-01T02:56:31.727Z [info] LIPU Started.
2026-05-01T02:56:39.273Z [info] LIPU Artifact skipped: country already has one PDF.
2026-05-01T02:56:39.273Z [info] LIPU Completed.
2026-05-01T02:56:39.273Z [info] LIPU Started.
2026-05-01T02:56:46.955Z [error] LIPU GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:56:46.955Z [info] LIPO Started.
2026-05-01T02:56:55.902Z [info] LIPO Completed.
2026-05-01T02:56:55.902Z [info] LIPO Started.
2026-05-01T02:56:59.548Z [info] LIPO Completed.
2026-05-01T02:56:59.548Z [info] LIPO Started.
2026-05-01T02:57:00.287Z [error] LIPQ AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:57:00.287Z [info] LIPQ Started.
2026-05-01T02:57:03.365Z [info] LIPO Completed.
2026-05-01T02:57:03.365Z [info] LIPO Started.
2026-05-01T02:57:03.369Z [info] LIPO Artifact skipped: country already has one PDF.
2026-05-01T02:57:03.369Z [info] LIPO Completed.
2026-05-01T02:57:03.369Z [info] LIPO Started.
2026-05-01T02:57:03.929Z [info] LIPQ Completed.
2026-05-01T02:57:03.929Z [info] LIPQ Started.
2026-05-01T02:57:07.641Z [info] LIPQ Completed.
2026-05-01T02:57:07.641Z [info] LIPQ Started.
2026-05-01T02:57:13.784Z [error] LIPR GEN sync HTTP 502: GEN sync failed | node exited 1: ions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:57:13.784Z [info] LIPN Started.
2026-05-01T02:57:16.689Z [info] LIPQ Artifact skipped: country already has one PDF.
2026-05-01T02:57:16.689Z [info] LIPQ Completed.
2026-05-01T02:57:16.689Z [info] LIPQ Started.
2026-05-01T02:57:24.205Z [error] LIPQ GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:57:24.205Z [info] LIPM Started.
2026-05-01T02:57:37.336Z [error] LIPM AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:57:37.336Z [info] LIPM Started.
2026-05-01T02:57:40.986Z [info] LIPM Completed.
2026-05-01T02:57:40.986Z [info] LIPM Started.
2026-05-01T02:57:44.642Z [info] LIPM Completed.
2026-05-01T02:57:44.642Z [info] LIPM Started.
2026-05-01T02:57:44.668Z [error] LIPO GEN sync HTTP 502: GEN sync failed | node exited 1: EN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: No GEN 1.2 (en) document found for Italy (LI)
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T02:57:44.668Z [info] LIPK Started.
2026-05-01T02:57:48.936Z [error] LIPK AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:57:48.936Z [info] LIPK Started.
2026-05-01T02:57:49.984Z [error] LIPN AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:57:49.984Z [info] LIPN Started.
2026-05-01T02:57:51.817Z [info] LIPM Artifact skipped: country already has one PDF.
2026-05-01T02:57:51.817Z [info] LIPM Completed.
2026-05-01T02:57:51.817Z [info] LIPM Started.
2026-05-01T02:57:52.457Z [info] LIPK Completed.
2026-05-01T02:57:52.457Z [info] LIPK Started.
2026-05-01T02:57:53.686Z [info] LIPN Completed.
2026-05-01T02:57:53.686Z [info] LIPN Started.
2026-05-01T02:57:56.105Z [info] LIPK Completed.
2026-05-01T02:57:56.105Z [info] LIPK Started.
2026-05-01T02:57:57.845Z [info] LIPN Completed.
2026-05-01T02:57:57.845Z [info] LIPN Started.
2026-05-01T02:58:10.839Z [error] LIPN PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:58:10.839Z [info] LIPN Started.
2026-05-01T02:58:18.134Z [error] LIPN GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:58:18.134Z [info] LIPH Started.
2026-05-01T02:58:26.063Z [info] LIPH Completed.
2026-05-01T02:58:26.063Z [info] LIPH Started.
2026-05-01T02:58:29.856Z [info] LIPH Completed.
2026-05-01T02:58:29.856Z [info] LIPH Started.
2026-05-01T02:58:32.847Z [error] LIPM GEN sync HTTP 502: GEN sync failed | node exited 1: EN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: No GEN 1.2 (en) document found for Italy (LI)
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T02:58:32.847Z [info] LIPG Started.
2026-05-01T02:58:33.588Z [info] LIPH Completed.
2026-05-01T02:58:33.588Z [info] LIPH Started.
2026-05-01T02:58:33.591Z [info] LIPH Artifact skipped: country already has one PDF.
2026-05-01T02:58:33.591Z [info] LIPH Completed.
2026-05-01T02:58:33.591Z [info] LIPH Started.
2026-05-01T02:58:37.078Z [error] LIPG AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:58:37.078Z [info] LIPG Started.
2026-05-01T02:58:40.418Z [error] LIPH GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:58:40.418Z [info] LIPF Started.
2026-05-01T02:58:40.772Z [info] LIPG Completed.
2026-05-01T02:58:40.772Z [info] LIPG Started.
2026-05-01T02:58:44.966Z [info] LIPG Completed.
2026-05-01T02:58:44.966Z [info] LIPG Started.
2026-05-01T02:58:45.661Z [error] LIPK PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:58:45.661Z [info] LIPK Started.
2026-05-01T02:58:49.829Z [error] LIPK GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:58:49.829Z [info] LIPE Started.
2026-05-01T02:59:03.884Z [error] LIPE AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:59:03.884Z [info] LIPE Started.
2026-05-01T02:59:07.369Z [info] LIPE Completed.
2026-05-01T02:59:07.369Z [info] LIPE Started.
2026-05-01T02:59:07.689Z [info] LIPF Completed.
2026-05-01T02:59:07.689Z [info] LIPF Started.
2026-05-01T02:59:11.066Z [info] LIPE Completed.
2026-05-01T02:59:11.066Z [info] LIPE Started.
2026-05-01T02:59:11.107Z [info] LIPF Completed.
2026-05-01T02:59:11.107Z [info] LIPF Started.
2026-05-01T02:59:14.487Z [info] LIPF Completed.
2026-05-01T02:59:14.487Z [info] LIPF Started.
2026-05-01T02:59:14.490Z [info] LIPF Artifact skipped: country already has one PDF.
2026-05-01T02:59:14.490Z [info] LIPF Completed.
2026-05-01T02:59:14.490Z [info] LIPF Started.
2026-05-01T02:59:21.965Z [error] LIPF GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:59:21.965Z [info] LIPD Started.
2026-05-01T02:59:21.997Z [error] LIPG PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:59:21.997Z [info] LIPG Started.
2026-05-01T02:59:30.232Z [error] LIPG GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:59:30.232Z [info] LIPB Started.
2026-05-01T02:59:35.008Z [error] LIPD AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:59:35.008Z [info] LIPD Started.
2026-05-01T02:59:38.768Z [info] LIPD Completed.
2026-05-01T02:59:38.768Z [info] LIPD Started.
2026-05-01T02:59:39.093Z [info] LIPB Completed.
2026-05-01T02:59:39.093Z [info] LIPB Started.
2026-05-01T02:59:42.389Z [info] LIPD Completed.
2026-05-01T02:59:42.389Z [info] LIPD Started.
2026-05-01T02:59:42.935Z [info] LIPB Completed.
2026-05-01T02:59:42.935Z [info] LIPB Started.
2026-05-01T02:59:47.114Z [info] LIPB Completed.
2026-05-01T02:59:47.114Z [info] LIPB Started.
2026-05-01T02:59:47.119Z [info] LIPB Artifact skipped: country already has one PDF.
2026-05-01T02:59:47.119Z [info] LIPB Completed.
2026-05-01T02:59:47.119Z [info] LIPB Started.
2026-05-01T02:59:47.446Z [error] LIPE PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T02:59:47.446Z [info] LIPE Started.
2026-05-01T02:59:51.310Z [error] LIPB GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T02:59:51.310Z [info] LINL Started.
2026-05-01T02:59:58.914Z [info] LINL Completed.
2026-05-01T02:59:58.914Z [info] LINL Started.
2026-05-01T03:00:03.308Z [info] LINL Completed.
2026-05-01T03:00:03.308Z [info] LINL Started.
2026-05-01T03:00:07.043Z [info] LINL Completed.
2026-05-01T03:00:07.043Z [info] LINL Started.
2026-05-01T03:00:07.045Z [info] LINL Artifact skipped: country already has one PDF.
2026-05-01T03:00:07.045Z [info] LINL Completed.
2026-05-01T03:00:07.045Z [info] LINL Started.
2026-05-01T03:00:10.983Z [error] LIPD PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:00:10.983Z [info] LIPD Started.
2026-05-01T03:00:13.814Z [error] LINL GEN sync HTTP 502: GEN sync failed | node exited 1:  AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Trying GEN candidate: LI_GEN_1_2_en.pdf | GEN 1.2 ENTRY, TRANSIT AND DEPARTURE OF AIRCRAFT
[EAD GEN] Skip candidate (not PDF): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:00:13.814Z [info] LIMZ Started.
2026-05-01T03:00:21.963Z [info] LIMZ Completed.
2026-05-01T03:00:21.963Z [info] LIMZ Started.
2026-05-01T03:00:25.734Z [info] LIMZ Completed.
2026-05-01T03:00:25.734Z [info] LIMZ Started.
2026-05-01T03:00:29.550Z [info] LIMZ Completed.
2026-05-01T03:00:29.550Z [info] LIMZ Started.
2026-05-01T03:00:29.554Z [info] LIMZ Artifact skipped: country already has one PDF.
2026-05-01T03:00:29.554Z [info] LIMZ Completed.
2026-05-01T03:00:29.554Z [info] LIMZ Started.
2026-05-01T03:00:34.226Z [error] LIPE GEN sync HTTP 502: GEN sync failed | node exited 1: ions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:00:34.226Z [info] LIMW Started.
2026-05-01T03:00:41.861Z [info] LIMW Completed.
2026-05-01T03:00:41.861Z [info] LIMW Started.
2026-05-01T03:00:45.912Z [info] LIMW Completed.
2026-05-01T03:00:45.912Z [info] LIMW Started.
2026-05-01T03:00:50.061Z [info] LIMW Completed.
2026-05-01T03:00:50.061Z [info] LIMW Started.
2026-05-01T03:00:50.064Z [info] LIMW Artifact skipped: country already has one PDF.
2026-05-01T03:00:50.064Z [info] LIMW Completed.
2026-05-01T03:00:50.064Z [info] LIMW Started.
2026-05-01T03:00:58.429Z [error] LIMW GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:00:58.429Z [info] LIMR Started.
2026-05-01T03:01:01.556Z [error] LIPD GEN sync HTTP 502: GEN sync failed | node exited 1: AD GEN] Selecting country: Italy (LI)
[EAD GEN] Error: locator.waitFor: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:selectAuthorityCode_input"]').or(locator('select[id$="selectAuthorityCode_input"]')).or(locator('select').filter({ has: getByRole('option', { name: 'Italy (LI)' }) })).first() to be visible

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:01:01.556Z [info] LIMP Started.
2026-05-01T03:01:09.397Z [info] LIMP Completed.
2026-05-01T03:01:09.397Z [info] LIMP Started.
2026-05-01T03:01:11.041Z [error] LIMZ GEN sync HTTP 502: GEN sync failed | node exited 1: EN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: No GEN 1.2 (en) document found for Italy (LI)
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T03:01:11.041Z [info] LIML Started.
2026-05-01T03:01:12.757Z [info] LIMP Completed.
2026-05-01T03:01:12.757Z [info] LIMP Started.
2026-05-01T03:01:16.905Z [info] LIMP Completed.
2026-05-01T03:01:16.905Z [info] LIMP Started.
2026-05-01T03:01:16.908Z [info] LIMP Artifact skipped: country already has one PDF.
2026-05-01T03:01:16.908Z [info] LIMP Completed.
2026-05-01T03:01:16.908Z [info] LIMP Started.
2026-05-01T03:01:19.864Z [info] LIML Completed.
2026-05-01T03:01:19.864Z [info] LIML Started.
2026-05-01T03:01:24.200Z [info] LIML Completed.
2026-05-01T03:01:24.200Z [info] LIML Started.
2026-05-01T03:01:24.745Z [error] LIMP GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:01:24.745Z [info] LIMJ Started.
2026-05-01T03:01:27.592Z [info] LIML Completed.
2026-05-01T03:01:27.592Z [info] LIML Started.
2026-05-01T03:01:27.596Z [info] LIML Artifact skipped: country already has one PDF.
2026-05-01T03:01:27.596Z [info] LIML Completed.
2026-05-01T03:01:27.596Z [info] LIML Started.
2026-05-01T03:01:34.509Z [error] LIMR AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:01:34.509Z [info] LIMR Started.
2026-05-01T03:01:36.211Z [error] LIML GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:01:36.211Z [info] LIMG Started.
2026-05-01T03:01:38.428Z [info] LIMR Completed.
2026-05-01T03:01:38.428Z [info] LIMR Started.
2026-05-01T03:01:42.151Z [info] LIMR Completed.
2026-05-01T03:01:42.151Z [info] LIMR Started.
2026-05-01T03:01:44.996Z [info] LIMG Completed.
2026-05-01T03:01:44.996Z [info] LIMG Started.
2026-05-01T03:01:48.727Z [info] LIMG Completed.
2026-05-01T03:01:48.727Z [info] LIMG Started.
2026-05-01T03:01:49.306Z [info] LIMR Artifact skipped: country already has one PDF.
2026-05-01T03:01:49.306Z [info] LIMR Completed.
2026-05-01T03:01:49.306Z [info] LIMR Started.
2026-05-01T03:01:52.428Z [info] LIMG Completed.
2026-05-01T03:01:52.428Z [info] LIMG Started.
2026-05-01T03:01:52.433Z [info] LIMG Artifact skipped: country already has one PDF.
2026-05-01T03:01:52.433Z [info] LIMG Completed.
2026-05-01T03:01:52.433Z [info] LIMG Started.
2026-05-01T03:01:59.794Z [error] LIMG GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:01:59.794Z [info] LIMF Started.
2026-05-01T03:02:00.629Z [error] LIMJ AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:02:00.629Z [info] LIMJ Started.
2026-05-01T03:02:04.849Z [info] LIMJ Completed.
2026-05-01T03:02:04.849Z [info] LIMJ Started.
2026-05-01T03:02:07.518Z [info] LIMF Completed.
2026-05-01T03:02:07.518Z [info] LIMF Started.
2026-05-01T03:02:08.982Z [info] LIMJ Completed.
2026-05-01T03:02:08.982Z [info] LIMJ Started.
2026-05-01T03:02:11.019Z [info] LIMF Completed.
2026-05-01T03:02:11.019Z [info] LIMF Started.
2026-05-01T03:02:14.498Z [info] LIMF Completed.
2026-05-01T03:02:14.498Z [info] LIMF Started.
2026-05-01T03:02:14.503Z [info] LIMF Artifact skipped: country already has one PDF.
2026-05-01T03:02:14.503Z [info] LIMF Completed.
2026-05-01T03:02:14.503Z [info] LIMF Started.
2026-05-01T03:02:17.075Z [info] LIMJ Artifact skipped: country already has one PDF.
2026-05-01T03:02:17.075Z [info] LIMJ Completed.
2026-05-01T03:02:17.075Z [info] LIMJ Started.
2026-05-01T03:02:25.057Z [error] LIMJ GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:02:25.057Z [info] LIME Started.
2026-05-01T03:02:34.878Z [info] LIME Completed.
2026-05-01T03:02:34.878Z [info] LIME Started.
2026-05-01T03:02:35.506Z [error] LIMR GEN sync HTTP 502: GEN sync failed | node exited 1: ditions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T03:02:35.506Z [info] LIMC Started.
2026-05-01T03:02:39.223Z [info] LIME Completed.
2026-05-01T03:02:39.223Z [info] LIME Started.
2026-05-01T03:02:43.066Z [info] LIME Completed.
2026-05-01T03:02:43.066Z [info] LIME Started.
2026-05-01T03:02:43.071Z [info] LIME Artifact skipped: country already has one PDF.
2026-05-01T03:02:43.071Z [info] LIME Completed.
2026-05-01T03:02:43.071Z [info] LIME Started.
2026-05-01T03:02:45.029Z [info] LIMC Completed.
2026-05-01T03:02:45.029Z [info] LIMC Started.
2026-05-01T03:02:48.973Z [info] LIMC Completed.
2026-05-01T03:02:48.973Z [info] LIMC Started.
2026-05-01T03:02:50.758Z [error] LIME GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:02:50.758Z [info] LIMB Started.
2026-05-01T03:02:53.212Z [info] LIMC Completed.
2026-05-01T03:02:53.212Z [info] LIMC Started.
2026-05-01T03:02:53.216Z [info] LIMC Artifact skipped: country already has one PDF.
2026-05-01T03:02:53.216Z [info] LIMC Completed.
2026-05-01T03:02:53.216Z [info] LIMC Started.
2026-05-01T03:03:00.837Z [error] LIMF GEN sync HTTP 502: GEN sync failed | node exited 1: ditions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T03:03:00.837Z [info] LIMA Started.
2026-05-01T03:03:00.910Z [error] LIMC GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:03:00.910Z [info] LILY Started.
2026-05-01T03:03:14.542Z [error] LIMA AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:03:14.542Z [info] LIMA Started.
2026-05-01T03:03:14.693Z [error] LILY AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:03:14.693Z [info] LILY Started.
2026-05-01T03:03:18.449Z [info] LIMA Completed.
2026-05-01T03:03:18.449Z [info] LIMA Started.
2026-05-01T03:03:19.127Z [info] LILY Completed.
2026-05-01T03:03:19.127Z [info] LILY Started.
2026-05-01T03:03:22.155Z [info] LIMA Completed.
2026-05-01T03:03:22.155Z [info] LIMA Started.
2026-05-01T03:03:22.763Z [info] LILY Completed.
2026-05-01T03:03:22.763Z [info] LILY Started.
2026-05-01T03:03:26.670Z [error] LIMB AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:03:26.670Z [info] LIMB Started.
2026-05-01T03:03:30.383Z [info] LIMB Completed.
2026-05-01T03:03:30.383Z [info] LIMB Started.
2026-05-01T03:03:31.385Z [info] LILY Artifact skipped: country already has one PDF.
2026-05-01T03:03:31.385Z [info] LILY Completed.
2026-05-01T03:03:31.385Z [info] LILY Started.
2026-05-01T03:03:33.743Z [info] LIMB Completed.
2026-05-01T03:03:33.743Z [info] LIMB Started.
2026-05-01T03:03:35.541Z [error] LIMA PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:03:35.541Z [info] LIMA Started.
2026-05-01T03:03:43.705Z [error] LIMA GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:03:43.705Z [info] LILV Started.
2026-05-01T03:03:50.534Z [info] LILV Completed.
2026-05-01T03:03:50.534Z [info] LILV Started.
2026-05-01T03:03:54.727Z [info] LILV Completed.
2026-05-01T03:03:54.727Z [info] LILV Started.
2026-05-01T03:03:58.501Z [info] LILV Completed.
2026-05-01T03:03:58.501Z [info] LILV Started.
2026-05-01T03:03:58.503Z [info] LILV Artifact skipped: country already has one PDF.
2026-05-01T03:03:58.503Z [info] LILV Completed.
2026-05-01T03:03:58.503Z [info] LILV Started.
2026-05-01T03:04:05.521Z [error] LILV GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:04:05.521Z [info] LILR Started.
2026-05-01T03:04:12.840Z [info] LILR Completed.
2026-05-01T03:04:12.840Z [info] LILR Started.
2026-05-01T03:04:16.623Z [info] LILR Completed.
2026-05-01T03:04:16.623Z [info] LILR Started.
2026-05-01T03:04:17.568Z [error] LILY GEN sync HTTP 502: GEN sync failed | node exited 1: ditions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T03:04:17.568Z [info] LILQ Started.
2026-05-01T03:04:19.958Z [info] LILR Completed.
2026-05-01T03:04:19.958Z [info] LILR Started.
2026-05-01T03:04:19.961Z [info] LILR Artifact skipped: country already has one PDF.
2026-05-01T03:04:19.961Z [info] LILR Completed.
2026-05-01T03:04:19.961Z [info] LILR Started.
2026-05-01T03:04:23.626Z [error] LIMB PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:04:23.626Z [info] LIMB Started.
2026-05-01T03:04:31.671Z [error] LIMB GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:04:31.671Z [info] LILN Started.
2026-05-01T03:04:39.031Z [info] LILN Completed.
2026-05-01T03:04:39.031Z [info] LILN Started.
2026-05-01T03:04:42.819Z [info] LILN Completed.
2026-05-01T03:04:42.819Z [info] LILN Started.
2026-05-01T03:04:46.580Z [info] LILN Completed.
2026-05-01T03:04:46.580Z [info] LILN Started.
2026-05-01T03:04:46.583Z [info] LILN Artifact skipped: country already has one PDF.
2026-05-01T03:04:46.583Z [info] LILN Completed.
2026-05-01T03:04:46.583Z [info] LILN Started.
2026-05-01T03:04:53.895Z [error] LILQ AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)
    at runNextTicks (node:internal/process/task_queues:60:5)
    at process.processImmediate (node:internal/timers:454:9)
    at process.callbackTrampoline (node:internal/async_hooks:130:17)

Node.js v20.20.2

2026-05-01T03:04:53.895Z [info] LILQ Started.
2026-05-01T03:04:54.569Z [error] LILN GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:04:54.569Z [info] LILM Started.
2026-05-01T03:04:57.316Z [info] LILQ Completed.
2026-05-01T03:04:57.316Z [info] LILQ Started.
2026-05-01T03:05:01.039Z [info] LILQ Completed.
2026-05-01T03:05:01.039Z [info] LILQ Started.
2026-05-01T03:05:01.515Z [info] LILM Completed.
2026-05-01T03:05:01.515Z [info] LILM Started.
2026-05-01T03:05:05.022Z [info] LILM Completed.
2026-05-01T03:05:05.022Z [info] LILM Started.
2026-05-01T03:05:06.049Z [error] LILR GEN sync HTTP 502: GEN sync failed | node exited 1: ions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:05:06.049Z [info] LILI Started.
2026-05-01T03:05:09.687Z [info] LILM Completed.
2026-05-01T03:05:09.687Z [info] LILM Started.
2026-05-01T03:05:09.690Z [info] LILM Artifact skipped: country already has one PDF.
2026-05-01T03:05:09.690Z [info] LILM Completed.
2026-05-01T03:05:09.690Z [info] LILM Started.
2026-05-01T03:05:17.417Z [error] LILM GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:05:17.417Z [info] LILH Started.
2026-05-01T03:05:24.779Z [info] LILH Completed.
2026-05-01T03:05:24.779Z [info] LILH Started.
2026-05-01T03:05:28.498Z [info] LILH Completed.
2026-05-01T03:05:28.498Z [info] LILH Started.
2026-05-01T03:05:28.735Z [info] LILQ Artifact skipped: country already has one PDF.
2026-05-01T03:05:28.735Z [info] LILQ Completed.
2026-05-01T03:05:28.735Z [info] LILQ Started.
2026-05-01T03:05:32.158Z [info] LILH Completed.
2026-05-01T03:05:32.158Z [info] LILH Started.
2026-05-01T03:05:32.160Z [info] LILH Artifact skipped: country already has one PDF.
2026-05-01T03:05:32.160Z [info] LILH Completed.
2026-05-01T03:05:32.160Z [info] LILH Started.
2026-05-01T03:05:40.068Z [error] LILH GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:05:40.068Z [info] LILG Started.
2026-05-01T03:05:43.450Z [error] LILI AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:05:43.450Z [info] LILI Started.
2026-05-01T03:05:47.192Z [info] LILI Completed.
2026-05-01T03:05:47.192Z [info] LILI Started.
2026-05-01T03:05:48.748Z [info] LILG Completed.
2026-05-01T03:05:48.748Z [info] LILG Started.
2026-05-01T03:05:50.877Z [info] LILI Completed.
2026-05-01T03:05:50.877Z [info] LILI Started.
2026-05-01T03:05:52.446Z [info] LILG Completed.
2026-05-01T03:05:52.446Z [info] LILG Started.
2026-05-01T03:05:56.091Z [info] LILG Completed.
2026-05-01T03:05:56.091Z [info] LILG Started.
2026-05-01T03:05:56.094Z [info] LILG Artifact skipped: country already has one PDF.
2026-05-01T03:05:56.094Z [info] LILG Completed.
2026-05-01T03:05:56.094Z [info] LILG Started.
2026-05-01T03:06:03.398Z [error] LILG GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:06:03.398Z [info] LILE Started.
2026-05-01T03:06:12.390Z [info] LILE Completed.
2026-05-01T03:06:12.390Z [info] LILE Started.
2026-05-01T03:06:14.547Z [error] LILQ GEN sync HTTP 502: GEN sync failed | node exited 1: ions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:06:14.547Z [info] LILC Started.
2026-05-01T03:06:16.155Z [info] LILE Completed.
2026-05-01T03:06:16.155Z [info] LILE Started.
2026-05-01T03:06:18.458Z [info] LILI Artifact skipped: country already has one PDF.
2026-05-01T03:06:18.459Z [info] LILI Completed.
2026-05-01T03:06:18.459Z [info] LILI Started.
2026-05-01T03:06:19.944Z [info] LILE Completed.
2026-05-01T03:06:19.944Z [info] LILE Started.
2026-05-01T03:06:19.948Z [info] LILE Artifact skipped: country already has one PDF.
2026-05-01T03:06:19.948Z [info] LILE Completed.
2026-05-01T03:06:19.948Z [info] LILE Started.
2026-05-01T03:06:23.712Z [error] LILI GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:06:23.712Z [info] LILB Started.
2026-05-01T03:06:30.404Z [info] LILB Completed.
2026-05-01T03:06:30.404Z [info] LILB Started.
2026-05-01T03:06:34.372Z [info] LILB Completed.
2026-05-01T03:06:34.372Z [info] LILB Started.
2026-05-01T03:06:38.046Z [info] LILB Completed.
2026-05-01T03:06:38.046Z [info] LILB Started.
2026-05-01T03:06:38.048Z [info] LILB Artifact skipped: country already has one PDF.
2026-05-01T03:06:38.048Z [info] LILB Completed.
2026-05-01T03:06:38.048Z [info] LILB Started.
2026-05-01T03:06:45.698Z [error] LILB GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:06:45.698Z [info] LILA Started.
2026-05-01T03:06:50.931Z [error] LILC AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:06:50.931Z [info] LILC Started.
2026-05-01T03:06:53.887Z [info] LILA Completed.
2026-05-01T03:06:53.887Z [info] LILA Started.
2026-05-01T03:06:54.925Z [info] LILC Completed.
2026-05-01T03:06:54.925Z [info] LILC Started.
2026-05-01T03:06:57.583Z [info] LILA Completed.
2026-05-01T03:06:57.583Z [info] LILA Started.
2026-05-01T03:06:58.528Z [info] LILC Completed.
2026-05-01T03:06:58.528Z [info] LILC Started.
2026-05-01T03:07:01.205Z [info] LILA Completed.
2026-05-01T03:07:01.205Z [info] LILA Started.
2026-05-01T03:07:01.207Z [info] LILA Artifact skipped: country already has one PDF.
2026-05-01T03:07:01.207Z [info] LILA Completed.
2026-05-01T03:07:01.207Z [info] LILA Started.
2026-05-01T03:07:06.994Z [error] LILE GEN sync HTTP 502: GEN sync failed | node exited 1: ditions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T03:07:06.994Z [info] LIET Started.
2026-05-01T03:07:14.657Z [error] LILA GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:07:14.657Z [info] LIER Started.
2026-05-01T03:07:15.168Z [info] LIET Completed.
2026-05-01T03:07:15.168Z [info] LIET Started.
2026-05-01T03:07:18.820Z [info] LIET Completed.
2026-05-01T03:07:18.820Z [info] LIET Started.
2026-05-01T03:07:22.422Z [info] LIER Completed.
2026-05-01T03:07:22.422Z [info] LIER Started.
2026-05-01T03:07:23.001Z [info] LIET Completed.
2026-05-01T03:07:23.001Z [info] LIET Started.
2026-05-01T03:07:23.004Z [info] LIET Artifact skipped: country already has one PDF.
2026-05-01T03:07:23.004Z [info] LIET Completed.
2026-05-01T03:07:23.004Z [info] LIET Started.
2026-05-01T03:07:26.781Z [info] LIER Completed.
2026-05-01T03:07:26.781Z [info] LIER Started.
2026-05-01T03:07:30.612Z [info] LIER Completed.
2026-05-01T03:07:30.612Z [info] LIER Started.
2026-05-01T03:07:30.614Z [info] LIER Artifact skipped: country already has one PDF.
2026-05-01T03:07:30.614Z [info] LIER Completed.
2026-05-01T03:07:30.614Z [info] LIER Started.
2026-05-01T03:07:31.713Z [error] LIET GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:07:31.713Z [info] LIEO Started.
2026-05-01T03:07:34.378Z [error] LILC PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:07:34.378Z [info] LILC Started.
2026-05-01T03:07:35.292Z [error] LIER GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:07:35.292Z [info] LIEE Started.
2026-05-01T03:07:39.308Z [error] LILC GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:07:39.308Z [info] LIEA Started.
2026-05-01T03:07:48.285Z [info] LIEA Completed.
2026-05-01T03:07:48.285Z [info] LIEA Started.
2026-05-01T03:07:52.086Z [info] LIEA Completed.
2026-05-01T03:07:52.086Z [info] LIEA Started.
2026-05-01T03:07:56.429Z [info] LIEA Completed.
2026-05-01T03:07:56.429Z [info] LIEA Started.
2026-05-01T03:07:56.433Z [info] LIEA Artifact skipped: country already has one PDF.
2026-05-01T03:07:56.433Z [info] LIEA Completed.
2026-05-01T03:07:56.433Z [info] LIEA Started.
2026-05-01T03:08:04.113Z [error] LIEA GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:08:04.113Z [info] LIDV Started.
2026-05-01T03:08:07.709Z [error] LIEO AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:08:07.709Z [info] LIEO Started.
2026-05-01T03:08:11.120Z [info] LIEO Completed.
2026-05-01T03:08:11.120Z [info] LIEO Started.
2026-05-01T03:08:11.574Z [error] LIEE AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:08:11.574Z [info] LIEE Started.
2026-05-01T03:08:13.360Z [info] LIDV Completed.
2026-05-01T03:08:13.360Z [info] LIDV Started.
2026-05-01T03:08:14.928Z [info] LIEE Completed.
2026-05-01T03:08:14.928Z [info] LIEE Started.
2026-05-01T03:08:14.984Z [info] LIEO Completed.
2026-05-01T03:08:14.984Z [info] LIEO Started.
2026-05-01T03:08:16.693Z [info] LIDV Completed.
2026-05-01T03:08:16.693Z [info] LIDV Started.
2026-05-01T03:08:19.142Z [info] LIEE Completed.
2026-05-01T03:08:19.142Z [info] LIEE Started.
2026-05-01T03:08:20.937Z [info] LIDV Completed.
2026-05-01T03:08:20.937Z [info] LIDV Started.
2026-05-01T03:08:20.940Z [info] LIDV Artifact skipped: country already has one PDF.
2026-05-01T03:08:20.940Z [info] LIDV Completed.
2026-05-01T03:08:20.940Z [info] LIDV Started.
2026-05-01T03:08:29.226Z [error] LIDV GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:08:29.226Z [info] LIDU Started.
2026-05-01T03:08:36.640Z [info] LIDU Completed.
2026-05-01T03:08:36.640Z [info] LIDU Started.
2026-05-01T03:08:40.269Z [info] LIDU Completed.
2026-05-01T03:08:40.269Z [info] LIDU Started.
2026-05-01T03:08:44.236Z [info] LIDU Completed.
2026-05-01T03:08:44.236Z [info] LIDU Started.
2026-05-01T03:08:44.238Z [info] LIDU Artifact skipped: country already has one PDF.
2026-05-01T03:08:44.238Z [info] LIDU Completed.
2026-05-01T03:08:44.238Z [info] LIDU Started.
2026-05-01T03:08:51.375Z [error] LIEO PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:08:51.375Z [info] LIEO Started.
2026-05-01T03:08:52.926Z [error] LIDU GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:08:52.926Z [info] LIDT Started.
2026-05-01T03:08:54.989Z [error] LIEE PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:08:54.989Z [info] LIEE Started.
2026-05-01T03:08:56.190Z [error] LIEO GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:08:56.190Z [info] LIDR Started.
2026-05-01T03:09:00.438Z [error] LIEE GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:09:00.438Z [info] LIDP Started.
2026-05-01T03:09:08.460Z [info] LIDP Completed.
2026-05-01T03:09:08.460Z [info] LIDP Started.
2026-05-01T03:09:12.432Z [info] LIDP Completed.
2026-05-01T03:09:12.432Z [info] LIDP Started.
2026-05-01T03:09:16.172Z [info] LIDP Completed.
2026-05-01T03:09:16.172Z [info] LIDP Started.
2026-05-01T03:09:16.175Z [info] LIDP Artifact skipped: country already has one PDF.
2026-05-01T03:09:16.175Z [info] LIDP Completed.
2026-05-01T03:09:16.175Z [info] LIDP Started.
2026-05-01T03:09:23.941Z [error] LIDP GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:09:23.941Z [info] LIDH Started.
2026-05-01T03:09:28.988Z [error] LIDT AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:09:28.988Z [info] LIDT Started.
2026-05-01T03:09:32.280Z [info] LIDH Completed.
2026-05-01T03:09:32.280Z [info] LIDH Started.
2026-05-01T03:09:32.345Z [error] LIDR AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:09:32.345Z [info] LIDR Started.
2026-05-01T03:09:32.773Z [info] LIDT Completed.
2026-05-01T03:09:32.773Z [info] LIDT Started.
2026-05-01T03:09:36.133Z [info] LIDR Completed.
2026-05-01T03:09:36.133Z [info] LIDR Started.
2026-05-01T03:09:36.403Z [info] LIDH Completed.
2026-05-01T03:09:36.403Z [info] LIDH Started.
2026-05-01T03:09:36.665Z [info] LIDT Completed.
2026-05-01T03:09:36.665Z [info] LIDT Started.
2026-05-01T03:09:40.348Z [info] LIDH Completed.
2026-05-01T03:09:40.348Z [info] LIDH Started.
2026-05-01T03:09:40.350Z [info] LIDH Artifact skipped: country already has one PDF.
2026-05-01T03:09:40.350Z [info] LIDH Completed.
2026-05-01T03:09:40.350Z [info] LIDH Started.
2026-05-01T03:09:40.385Z [info] LIDR Completed.
2026-05-01T03:09:40.385Z [info] LIDR Started.
2026-05-01T03:09:45.270Z [error] LIDR PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:09:45.270Z [info] LIDR Started.
2026-05-01T03:09:52.725Z [error] LIDR GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:09:52.725Z [info] LIDG Started.
2026-05-01T03:10:00.061Z [info] LIDG Completed.
2026-05-01T03:10:00.061Z [info] LIDG Started.
2026-05-01T03:10:03.825Z [info] LIDG Completed.
2026-05-01T03:10:03.825Z [info] LIDG Started.
2026-05-01T03:10:07.704Z [info] LIDG Completed.
2026-05-01T03:10:07.704Z [info] LIDG Started.
2026-05-01T03:10:07.706Z [info] LIDG Artifact skipped: country already has one PDF.
2026-05-01T03:10:07.706Z [info] LIDG Completed.
2026-05-01T03:10:07.706Z [info] LIDG Started.
2026-05-01T03:10:13.491Z [error] LIDT PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:10:13.491Z [info] LIDT Started.
2026-05-01T03:10:15.522Z [error] LIDG GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:10:15.522Z [info] LIDF Started.
2026-05-01T03:10:21.870Z [error] LIDH GEN sync HTTP 502: GEN sync failed | node exited 1: EN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: No GEN 1.2 (en) document found for Italy (LI)
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T03:10:21.870Z [info] LIDE Started.
2026-05-01T03:10:29.100Z [info] LIDE Completed.
2026-05-01T03:10:29.100Z [info] LIDE Started.
2026-05-01T03:10:32.855Z [info] LIDE Completed.
2026-05-01T03:10:32.855Z [info] LIDE Started.
2026-05-01T03:10:36.106Z [info] LIDE Completed.
2026-05-01T03:10:36.106Z [info] LIDE Started.
2026-05-01T03:10:36.108Z [info] LIDE Artifact skipped: country already has one PDF.
2026-05-01T03:10:36.108Z [info] LIDE Completed.
2026-05-01T03:10:36.108Z [info] LIDE Started.
2026-05-01T03:10:44.404Z [error] LIDE GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:10:44.404Z [info] LIDB Started.
2026-05-01T03:10:45.573Z [error] LIDF AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:10:45.573Z [info] LIDF Started.
2026-05-01T03:10:48.867Z [info] LIDF Completed.
2026-05-01T03:10:48.867Z [info] LIDF Started.
2026-05-01T03:10:49.059Z [error] LIDT GEN sync HTTP 502: GEN sync failed | node exited 1:     58 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div id="termsDialog_modal" class="ui-widget-overlay ui-dialog-mask"></div> intercepts pointer events
     - retrying click action
       - waiting 500ms

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:10:49.059Z [info] LIDA Started.
2026-05-01T03:10:52.684Z [info] LIDF Completed.
2026-05-01T03:10:52.684Z [info] LIDF Started.
2026-05-01T03:11:00.161Z [info] LIDF Artifact skipped: country already has one PDF.
2026-05-01T03:11:00.161Z [info] LIDF Completed.
2026-05-01T03:11:00.161Z [info] LIDF Started.
2026-05-01T03:11:08.471Z [error] LIDF GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:11:08.471Z [info] LICT Started.
2026-05-01T03:11:18.078Z [info] LICT Completed.
2026-05-01T03:11:18.078Z [info] LICT Started.
2026-05-01T03:11:21.791Z [info] LICT Completed.
2026-05-01T03:11:21.791Z [info] LICT Started.
2026-05-01T03:11:22.153Z [error] LIDB AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:11:22.153Z [info] LIDB Started.
2026-05-01T03:11:25.674Z [info] LICT Completed.
2026-05-01T03:11:25.674Z [info] LICT Started.
2026-05-01T03:11:25.679Z [info] LICT Artifact skipped: country already has one PDF.
2026-05-01T03:11:25.679Z [info] LICT Completed.
2026-05-01T03:11:25.679Z [info] LICT Started.
2026-05-01T03:11:25.821Z [error] LIDA AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:11:25.821Z [info] LIDA Started.
2026-05-01T03:11:26.199Z [info] LIDB Completed.
2026-05-01T03:11:26.199Z [info] LIDB Started.
2026-05-01T03:11:29.717Z [info] LIDA Completed.
2026-05-01T03:11:29.717Z [info] LIDA Started.
2026-05-01T03:11:30.383Z [info] LIDB Completed.
2026-05-01T03:11:30.383Z [info] LIDB Started.
2026-05-01T03:11:33.321Z [info] LIDA Completed.
2026-05-01T03:11:33.321Z [info] LIDA Started.
2026-05-01T03:11:43.216Z [info] LIDA Artifact skipped: country already has one PDF.
2026-05-01T03:11:43.216Z [info] LIDA Completed.
2026-05-01T03:11:43.216Z [info] LIDA Started.
2026-05-01T03:11:51.668Z [error] LIDA GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:11:51.668Z [info] LICR Started.
2026-05-01T03:12:01.181Z [info] LICR Completed.
2026-05-01T03:12:01.181Z [info] LICR Started.
2026-05-01T03:12:04.824Z [info] LICR Completed.
2026-05-01T03:12:04.824Z [info] LICR Started.
2026-05-01T03:12:06.885Z [error] LIDB PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:12:06.885Z [info] LIDB Started.
2026-05-01T03:12:08.762Z [info] LICR Completed.
2026-05-01T03:12:08.762Z [info] LICR Started.
2026-05-01T03:12:08.766Z [info] LICR Artifact skipped: country already has one PDF.
2026-05-01T03:12:08.766Z [info] LICR Completed.
2026-05-01T03:12:08.766Z [info] LICR Started.
2026-05-01T03:12:11.863Z [error] LIDB GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:12:11.863Z [info] LICP Started.
2026-05-01T03:12:12.382Z [error] LICT GEN sync HTTP 502: GEN sync failed | node exited 1: ions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:12:12.382Z [info] LICJ Started.
2026-05-01T03:12:19.933Z [info] LICP Completed.
2026-05-01T03:12:19.933Z [info] LICP Started.
2026-05-01T03:12:23.759Z [info] LICP Completed.
2026-05-01T03:12:23.759Z [info] LICP Started.
2026-05-01T03:12:25.372Z [error] LICJ AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:12:25.372Z [info] LICJ Started.
2026-05-01T03:12:27.375Z [info] LICP Completed.
2026-05-01T03:12:27.375Z [info] LICP Started.
2026-05-01T03:12:27.377Z [info] LICP Artifact skipped: country already has one PDF.
2026-05-01T03:12:27.377Z [info] LICP Completed.
2026-05-01T03:12:27.377Z [info] LICP Started.
2026-05-01T03:12:28.696Z [info] LICJ Completed.
2026-05-01T03:12:28.696Z [info] LICJ Started.
2026-05-01T03:12:32.644Z [info] LICJ Completed.
2026-05-01T03:12:32.644Z [info] LICJ Started.
2026-05-01T03:12:34.499Z [error] LICP GEN sync HTTP 502: GEN sync failed | node exited 1:  AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Trying GEN candidate: LI_GEN_1_2_en.pdf | GEN 1.2 ENTRY, TRANSIT AND DEPARTURE OF AIRCRAFT
[EAD GEN] Skip candidate (not PDF): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:12:34.499Z [info] LICG Started.
2026-05-01T03:12:42.661Z [info] LICG Completed.
2026-05-01T03:12:42.661Z [info] LICG Started.
2026-05-01T03:12:46.374Z [info] LICG Completed.
2026-05-01T03:12:46.374Z [info] LICG Started.
2026-05-01T03:12:50.365Z [info] LICG Completed.
2026-05-01T03:12:50.365Z [info] LICG Started.
2026-05-01T03:12:50.368Z [info] LICG Artifact skipped: country already has one PDF.
2026-05-01T03:12:50.368Z [info] LICG Completed.
2026-05-01T03:12:50.368Z [info] LICG Started.
2026-05-01T03:12:54.548Z [error] LICR GEN sync HTTP 502: GEN sync failed | node exited 1: ions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:12:54.548Z [info] LICD Started.
2026-05-01T03:13:03.077Z [info] LICD Completed.
2026-05-01T03:13:03.078Z [info] LICD Started.
2026-05-01T03:13:07.250Z [info] LICD Completed.
2026-05-01T03:13:07.250Z [info] LICD Started.
2026-05-01T03:13:10.908Z [info] LICD Completed.
2026-05-01T03:13:10.908Z [info] LICD Started.
2026-05-01T03:13:10.912Z [info] LICD Artifact skipped: country already has one PDF.
2026-05-01T03:13:10.912Z [info] LICD Completed.
2026-05-01T03:13:10.912Z [info] LICD Started.
2026-05-01T03:13:18.532Z [error] LICD GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:13:18.532Z [info] LICC Started.
2026-05-01T03:13:22.454Z [error] LICJ PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:13:22.454Z [info] LICJ Started.
2026-05-01T03:13:30.115Z [error] LICJ GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:13:30.115Z [info] LICB Started.
2026-05-01T03:13:31.166Z [error] LICG GEN sync HTTP 502: GEN sync failed | node exited 1: EN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Italy (LI)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: No GEN 1.2 (en) document found for Italy (LI)
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T03:13:31.166Z [info] LICA Started.
2026-05-01T03:13:35.104Z [error] LICB AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:13:35.104Z [info] LICB Started.
2026-05-01T03:13:38.423Z [info] LICB Completed.
2026-05-01T03:13:38.423Z [info] LICB Started.
2026-05-01T03:13:39.700Z [info] LICA Completed.
2026-05-01T03:13:39.700Z [info] LICA Started.
2026-05-01T03:13:42.141Z [info] LICB Completed.
2026-05-01T03:13:42.141Z [info] LICB Started.
2026-05-01T03:13:43.031Z [info] LICA Completed.
2026-05-01T03:13:43.031Z [info] LICA Started.
2026-05-01T03:13:47.383Z [info] LICA Completed.
2026-05-01T03:13:47.383Z [info] LICA Started.
2026-05-01T03:13:47.387Z [info] LICA Artifact skipped: country already has one PDF.
2026-05-01T03:13:47.387Z [info] LICA Completed.
2026-05-01T03:13:47.387Z [info] LICA Started.
2026-05-01T03:13:55.131Z [error] LICA GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:13:55.131Z [info] LIBR Started.
2026-05-01T03:13:56.079Z [error] LICC AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:13:56.079Z [info] LICC Started.
2026-05-01T03:13:59.664Z [info] LICC Completed.
2026-05-01T03:13:59.664Z [info] LICC Started.
2026-05-01T03:14:03.041Z [info] LICC Completed.
2026-05-01T03:14:03.041Z [info] LICC Started.
2026-05-01T03:14:03.148Z [info] LIBR Completed.
2026-05-01T03:14:03.148Z [info] LIBR Started.
2026-05-01T03:14:07.214Z [info] LIBR Completed.
2026-05-01T03:14:07.214Z [info] LIBR Started.
2026-05-01T03:14:10.974Z [info] LIBR Completed.
2026-05-01T03:14:10.974Z [info] LIBR Started.
2026-05-01T03:14:10.978Z [info] LIBR Artifact skipped: country already has one PDF.
2026-05-01T03:14:10.978Z [info] LIBR Completed.
2026-05-01T03:14:10.978Z [info] LIBR Started.
2026-05-01T03:14:11.592Z [info] LICC Artifact skipped: country already has one PDF.
2026-05-01T03:14:11.592Z [info] LICC Completed.
2026-05-01T03:14:11.592Z [info] LICC Started.
2026-05-01T03:14:12.642Z [info] LICB Artifact skipped: country already has one PDF.
2026-05-01T03:14:12.642Z [info] LICB Completed.
2026-05-01T03:14:12.642Z [info] LICB Started.
2026-05-01T03:14:20.615Z [error] LICB GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:14:20.615Z [info] LIBP Started.
2026-05-01T03:14:25.425Z [error] LIBR GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:14:25.425Z [info] LIBG Started.
2026-05-01T03:14:28.312Z [info] LIBP Completed.
2026-05-01T03:14:28.312Z [info] LIBP Started.
2026-05-01T03:14:32.351Z [info] LIBP Completed.
2026-05-01T03:14:32.351Z [info] LIBP Started.
2026-05-01T03:14:34.641Z [info] LIBG Completed.
2026-05-01T03:14:34.641Z [info] LIBG Started.
2026-05-01T03:14:35.688Z [info] LIBP Completed.
2026-05-01T03:14:35.688Z [info] LIBP Started.
2026-05-01T03:14:35.691Z [info] LIBP Artifact skipped: country already has one PDF.
2026-05-01T03:14:35.691Z [info] LIBP Completed.
2026-05-01T03:14:35.691Z [info] LIBP Started.
2026-05-01T03:14:38.570Z [info] LIBG Completed.
2026-05-01T03:14:38.570Z [info] LIBG Started.
2026-05-01T03:14:42.222Z [info] LIBG Completed.
2026-05-01T03:14:42.222Z [info] LIBG Started.
2026-05-01T03:14:42.226Z [info] LIBG Artifact skipped: country already has one PDF.
2026-05-01T03:14:42.226Z [info] LIBG Completed.
2026-05-01T03:14:42.226Z [info] LIBG Started.
2026-05-01T03:14:43.563Z [error] LIBP GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:14:43.563Z [info] LIBF Started.
2026-05-01T03:14:46.776Z [error] LIBG GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:14:46.776Z [info] LIBD Started.
2026-05-01T03:14:55.354Z [info] LIBD Completed.
2026-05-01T03:14:55.354Z [info] LIBD Started.
2026-05-01T03:14:58.789Z [info] LIBD Completed.
2026-05-01T03:14:58.789Z [info] LIBD Started.
2026-05-01T03:15:01.205Z [error] LICC GEN sync HTTP 502: GEN sync failed | node exited 1: AD GEN] Selecting country: Italy (LI)
[EAD GEN] Error: locator.waitFor: Timeout 45000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:selectAuthorityCode_input"]').or(locator('select[id$="selectAuthorityCode_input"]')).or(locator('select').filter({ has: getByRole('option', { name: 'Italy (LI)' }) })).first() to be visible

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:15:01.205Z [info] LIBC Started.
2026-05-01T03:15:02.672Z [info] LIBD Completed.
2026-05-01T03:15:02.672Z [info] LIBD Started.
2026-05-01T03:15:02.676Z [info] LIBD Artifact skipped: country already has one PDF.
2026-05-01T03:15:02.676Z [info] LIBD Completed.
2026-05-01T03:15:02.676Z [info] LIBD Started.
2026-05-01T03:15:05.986Z [error] LIBC AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:15:05.986Z [info] LIBC Started.
2026-05-01T03:15:09.805Z [info] LIBC Completed.
2026-05-01T03:15:09.805Z [info] LIBC Started.
2026-05-01T03:15:10.513Z [error] LIBD GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:15:10.513Z [info] LIAU Started.
2026-05-01T03:15:13.303Z [info] LIBC Completed.
2026-05-01T03:15:13.303Z [info] LIBC Started.
2026-05-01T03:15:19.942Z [error] LIBF AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:15:19.942Z [info] LIBF Started.
2026-05-01T03:15:21.901Z [info] LIBC Artifact skipped: country already has one PDF.
2026-05-01T03:15:21.901Z [info] LIBC Completed.
2026-05-01T03:15:21.901Z [info] LIBC Started.
2026-05-01T03:15:23.854Z [info] LIBF Completed.
2026-05-01T03:15:23.854Z [info] LIBF Started.
2026-05-01T03:15:27.229Z [info] LIBF Completed.
2026-05-01T03:15:27.229Z [info] LIBF Started.
2026-05-01T03:15:30.159Z [error] LIBC GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:15:30.159Z [info] LIAQ Started.
2026-05-01T03:15:37.647Z [info] LIAQ Completed.
2026-05-01T03:15:37.647Z [info] LIAQ Started.
2026-05-01T03:15:41.361Z [info] LIAQ Completed.
2026-05-01T03:15:41.361Z [info] LIAQ Started.
2026-05-01T03:15:45.436Z [info] LIAQ Completed.
2026-05-01T03:15:45.436Z [info] LIAQ Started.
2026-05-01T03:15:45.439Z [info] LIAQ Artifact skipped: country already has one PDF.
2026-05-01T03:15:45.439Z [info] LIAQ Completed.
2026-05-01T03:15:45.439Z [info] LIAQ Started.
2026-05-01T03:15:46.690Z [error] LIAU AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:15:46.690Z [info] LIAU Started.
2026-05-01T03:15:51.250Z [info] LIAU Completed.
2026-05-01T03:15:51.250Z [info] LIAU Started.
2026-05-01T03:15:53.908Z [error] LIAQ GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:15:53.908Z [info] LIAP Started.
2026-05-01T03:15:55.639Z [info] LIAU Completed.
2026-05-01T03:15:55.639Z [info] LIAU Started.
2026-05-01T03:16:03.319Z [info] LIAU Artifact skipped: country already has one PDF.
2026-05-01T03:16:03.319Z [info] LIAU Completed.
2026-05-01T03:16:03.319Z [info] LIAU Started.
2026-05-01T03:16:03.657Z [error] LIBF PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)
    at runNextTicks (node:internal/process/task_queues:60:5)
    at process.processImmediate (node:internal/timers:454:9)
    at process.callbackTrampoline (node:internal/async_hooks:130:17)

Node.js v20.20.2

2026-05-01T03:16:03.657Z [info] LIBF Started.
2026-05-01T03:16:12.857Z [error] LIAU GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:16:12.857Z [info] LIAF Started.
2026-05-01T03:16:16.670Z [error] LIBF GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Italy (LI)
[EAD GEN] Opening login page
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:16:16.670Z [info] LIDL Started.
2026-05-01T03:16:24.399Z [info] LIDL Completed.
2026-05-01T03:16:24.399Z [info] LIDL Started.
2026-05-01T03:16:28.124Z [info] LIDL Completed.
2026-05-01T03:16:28.124Z [info] LIDL Started.
2026-05-01T03:16:29.506Z [error] LIAP AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)
    at runNextTicks (node:internal/process/task_queues:60:5)
    at process.processImmediate (node:internal/timers:454:9)
    at process.callbackTrampoline (node:internal/async_hooks:130:17)

Node.js v20.20.2

2026-05-01T03:16:29.506Z [info] LIAP Started.
2026-05-01T03:16:31.402Z [info] LIDL Completed.
2026-05-01T03:16:31.402Z [info] LIDL Started.
2026-05-01T03:16:31.404Z [info] LIDL Artifact skipped: country already has one PDF.
2026-05-01T03:16:31.404Z [info] LIDL Completed.
2026-05-01T03:16:31.404Z [info] LIDL Started.
2026-05-01T03:16:33.235Z [info] LIAP Completed.
2026-05-01T03:16:33.235Z [info] LIAP Started.
2026-05-01T03:16:37.235Z [info] LIAP Completed.
2026-05-01T03:16:37.235Z [info] LIAP Started.
2026-05-01T03:16:39.756Z [error] LIDL GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:16:39.756Z [info] LDZD Started.
2026-05-01T03:16:39.780Z [info] LDZD Completed.
2026-05-01T03:16:39.780Z [info] LDZD Started.
2026-05-01T03:16:43.180Z [error] LIAP PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:16:43.180Z [info] LIAP Started.
2026-05-01T03:16:43.958Z [info] LDZD Completed.
2026-05-01T03:16:43.958Z [info] LDZD Started.
2026-05-01T03:16:47.670Z [info] LDZD Completed.
2026-05-01T03:16:47.670Z [info] LDZD Started.
2026-05-01T03:16:47.690Z [info] LDZD Saved artifact aip/debug-runs/b363ce26-b8cc-4bbc-a1ae-42db06ca3748/croatia/LDZD.pdf
2026-05-01T03:16:47.690Z [info] LDZD Completed.
2026-05-01T03:16:47.690Z [info] LDZD Started.
2026-05-01T03:16:49.387Z [error] LIAF AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:16:49.387Z [info] LIAF Started.
2026-05-01T03:16:51.573Z [error] LIAP GEN sync HTTP 502: GEN sync failed | node exited 1:  AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Trying GEN candidate: LI_GEN_1_2_en.pdf | GEN 1.2 ENTRY, TRANSIT AND DEPARTURE OF AIRCRAFT
[EAD GEN] Skip candidate (not PDF): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:16:51.573Z [info] LDZA Started.
2026-05-01T03:16:53.710Z [info] LIAF Completed.
2026-05-01T03:16:53.710Z [info] LIAF Started.
2026-05-01T03:16:57.383Z [info] LIAF Completed.
2026-05-01T03:16:57.383Z [info] LIAF Started.
2026-05-01T03:16:58.799Z [info] LDZA Completed.
2026-05-01T03:16:58.799Z [info] LDZA Started.
2026-05-01T03:17:02.478Z [info] LDZA Completed.
2026-05-01T03:17:02.478Z [info] LDZA Started.
2026-05-01T03:17:05.105Z [info] LIAF Artifact skipped: country already has one PDF.
2026-05-01T03:17:05.105Z [info] LIAF Completed.
2026-05-01T03:17:05.105Z [info] LIAF Started.
2026-05-01T03:17:05.784Z [info] LDZA Completed.
2026-05-01T03:17:05.784Z [info] LDZA Started.
2026-05-01T03:17:05.787Z [info] LDZA Artifact skipped: country already has one PDF.
2026-05-01T03:17:05.787Z [info] LDZA Completed.
2026-05-01T03:17:05.787Z [info] LDZA Started.
2026-05-01T03:17:14.321Z [error] LIAF GEN sync HTTP 502: GEN sync failed | node exited 1: `ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LI_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Italy (LI), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:17:14.321Z [info] LDSP Started.
2026-05-01T03:17:18.852Z [error] LDZA GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Croatia (LD)
[EAD GEN] Opening login page
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:17:18.852Z [info] LDSB Started.
2026-05-01T03:17:25.570Z [info] LDSB Completed.
2026-05-01T03:17:25.570Z [info] LDSB Started.
2026-05-01T03:17:30.200Z [info] LDSB Completed.
2026-05-01T03:17:30.200Z [info] LDSB Started.
2026-05-01T03:17:33.934Z [error] LDZD GEN sync HTTP 502: GEN sync failed | node exited 1: ns
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Croatia (LD)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:17:33.935Z [info] LDRI Started.
2026-05-01T03:17:34.021Z [info] LDSB Completed.
2026-05-01T03:17:34.021Z [info] LDSB Started.
2026-05-01T03:17:34.023Z [info] LDSB Artifact skipped: country already has one PDF.
2026-05-01T03:17:34.023Z [info] LDSB Completed.
2026-05-01T03:17:34.023Z [info] LDSB Started.
2026-05-01T03:17:42.190Z [error] LDSB GEN sync HTTP 502: GEN sync failed | node exited 1: mageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LD_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Croatia (LD), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:17:42.190Z [info] LDPL Started.
2026-05-01T03:17:47.148Z [error] LDRI AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:17:47.148Z [info] LDRI Started.
2026-05-01T03:17:49.192Z [info] LDPL Completed.
2026-05-01T03:17:49.192Z [info] LDPL Started.
2026-05-01T03:17:50.455Z [info] LDRI Completed.
2026-05-01T03:17:50.455Z [info] LDRI Started.
2026-05-01T03:17:51.019Z [error] LDSP AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:17:51.019Z [info] LDSP Started.
2026-05-01T03:17:52.562Z [info] LDPL Completed.
2026-05-01T03:17:52.562Z [info] LDPL Started.
2026-05-01T03:17:54.820Z [info] LDRI Completed.
2026-05-01T03:17:54.820Z [info] LDRI Started.
2026-05-01T03:17:55.064Z [info] LDSP Completed.
2026-05-01T03:17:55.064Z [info] LDSP Started.
2026-05-01T03:17:56.112Z [info] LDPL Completed.
2026-05-01T03:17:56.112Z [info] LDPL Started.
2026-05-01T03:17:56.114Z [info] LDPL Artifact skipped: country already has one PDF.
2026-05-01T03:17:56.114Z [info] LDPL Completed.
2026-05-01T03:17:56.114Z [info] LDPL Started.
2026-05-01T03:17:59.071Z [info] LDSP Completed.
2026-05-01T03:17:59.071Z [info] LDSP Started.
2026-05-01T03:17:59.579Z [error] LDRI PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:17:59.579Z [info] LDRI Started.
2026-05-01T03:18:04.686Z [error] LDSP PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:18:04.686Z [info] LDSP Started.
2026-05-01T03:18:08.155Z [error] LDRI GEN sync HTTP 502: GEN sync failed | node exited 1: IP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Trying GEN candidate: LD_GEN_1_2_en.pdf | GEN 1.2 ENTRY, TRANSIT AND DEPARTURE OF AIRCRAFT
[EAD GEN] Skip candidate (not PDF): LD_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Croatia (LD), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:18:08.155Z [info] LDOS Started.
2026-05-01T03:18:16.186Z [info] LDOS Completed.
2026-05-01T03:18:16.186Z [info] LDOS Started.
2026-05-01T03:18:20.054Z [info] LDOS Completed.
2026-05-01T03:18:20.054Z [info] LDOS Started.
2026-05-01T03:18:23.926Z [info] LDOS Completed.
2026-05-01T03:18:23.926Z [info] LDOS Started.
2026-05-01T03:18:23.928Z [info] LDOS Artifact skipped: country already has one PDF.
2026-05-01T03:18:23.928Z [info] LDOS Completed.
2026-05-01T03:18:23.928Z [info] LDOS Started.
2026-05-01T03:18:32.387Z [error] LDOS GEN sync HTTP 502: GEN sync failed | node exited 1: mageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LD_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Croatia (LD), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:18:32.387Z [info] LDLO Started.
2026-05-01T03:18:38.954Z [info] LDLO Completed.
2026-05-01T03:18:38.954Z [info] LDLO Started.
2026-05-01T03:18:42.366Z [error] LDPL GEN sync HTTP 502: GEN sync failed | node exited 1: tions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Croatia (LD)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T03:18:42.366Z [info] LDDU Started.
2026-05-01T03:18:43.004Z [info] LDLO Completed.
2026-05-01T03:18:43.004Z [info] LDLO Started.
2026-05-01T03:18:46.820Z [info] LDLO Completed.
2026-05-01T03:18:46.820Z [info] LDLO Started.
2026-05-01T03:18:46.823Z [info] LDLO Artifact skipped: country already has one PDF.
2026-05-01T03:18:46.823Z [info] LDLO Completed.
2026-05-01T03:18:46.823Z [info] LDLO Started.
2026-05-01T03:18:51.081Z [error] LDSP GEN sync HTTP 502: GEN sync failed | node exited 1: ns
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Croatia (LD)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:18:51.081Z [info] LCPH Started.
2026-05-01T03:18:59.825Z [info] LCPH Completed.
2026-05-01T03:18:59.825Z [info] LCPH Started.
2026-05-01T03:19:03.312Z [info] LCPH Completed.
2026-05-01T03:19:03.312Z [info] LCPH Started.
2026-05-01T03:19:07.059Z [info] LCPH Completed.
2026-05-01T03:19:07.059Z [info] LCPH Started.
2026-05-01T03:19:07.061Z [info] LCPH Artifact skipped: country already has one PDF.
2026-05-01T03:19:07.061Z [info] LCPH Completed.
2026-05-01T03:19:07.061Z [info] LCPH Started.
2026-05-01T03:19:10.768Z [error] LDDU AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:19:10.768Z [info] LDDU Started.
2026-05-01T03:19:14.527Z [info] LDDU Completed.
2026-05-01T03:19:14.527Z [info] LDDU Started.
2026-05-01T03:19:15.219Z [error] LCPH GEN sync HTTP 502: GEN sync failed | node exited 1: ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LC_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Cyprus (LC), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:19:15.219Z [info] LCNC Started.
2026-05-01T03:19:18.755Z [info] LDDU Completed.
2026-05-01T03:19:18.755Z [info] LDDU Started.
2026-05-01T03:19:26.107Z [info] LDDU Artifact skipped: country already has one PDF.
2026-05-01T03:19:26.107Z [info] LDDU Completed.
2026-05-01T03:19:26.107Z [info] LDDU Started.
2026-05-01T03:19:27.698Z [error] LDLO GEN sync HTTP 502: GEN sync failed | node exited 1: wnloading GEN 1.2 (en) for Croatia (LD)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Croatia (LD)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: No GEN 1.2 (en) document found for Croatia (LD)
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T03:19:27.698Z [info] LCLK Started.
2026-05-01T03:19:31.380Z [error] LDDU GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Croatia (LD)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:19:31.380Z [info] LBWN Started.
2026-05-01T03:19:38.810Z [info] LBWN Completed.
2026-05-01T03:19:38.810Z [info] LBWN Started.
2026-05-01T03:19:42.533Z [info] LBWN Completed.
2026-05-01T03:19:42.533Z [info] LBWN Started.
2026-05-01T03:19:46.302Z [info] LBWN Completed.
2026-05-01T03:19:46.302Z [info] LBWN Started.
2026-05-01T03:19:46.304Z [info] LBWN Artifact skipped: country already has one PDF.
2026-05-01T03:19:46.304Z [info] LBWN Completed.
2026-05-01T03:19:46.304Z [info] LBWN Started.
2026-05-01T03:19:51.832Z [error] LCNC AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:19:51.832Z [info] LCNC Started.
2026-05-01T03:19:54.399Z [error] LBWN GEN sync HTTP 502: GEN sync failed | node exited 1: ageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LB_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Bulgaria (LB), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:19:54.400Z [info] LBWB Started.
2026-05-01T03:19:55.748Z [info] LCNC Completed.
2026-05-01T03:19:55.748Z [info] LCNC Started.
2026-05-01T03:19:59.495Z [info] LCNC Completed.
2026-05-01T03:19:59.495Z [info] LCNC Started.
2026-05-01T03:20:01.817Z [error] LBWB AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:20:01.817Z [info] LBWB Started.
2026-05-01T03:20:04.380Z [error] LCLK AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:20:04.380Z [info] LCLK Started.
2026-05-01T03:20:05.107Z [info] LBWB Completed.
2026-05-01T03:20:05.107Z [info] LBWB Started.
2026-05-01T03:20:07.607Z [info] LCNC Artifact skipped: country already has one PDF.
2026-05-01T03:20:07.607Z [info] LCNC Completed.
2026-05-01T03:20:07.607Z [info] LCNC Started.
2026-05-01T03:20:08.718Z [info] LCLK Completed.
2026-05-01T03:20:08.718Z [info] LCLK Started.
2026-05-01T03:20:09.412Z [info] LBWB Completed.
2026-05-01T03:20:09.412Z [info] LBWB Started.
2026-05-01T03:20:09.439Z [info] LBWB Artifact skipped: country already has one PDF.
2026-05-01T03:20:09.439Z [info] LBWB Completed.
2026-05-01T03:20:09.439Z [info] LBWB Started.
2026-05-01T03:20:12.773Z [info] LCLK Completed.
2026-05-01T03:20:12.773Z [info] LCLK Started.
2026-05-01T03:20:13.014Z [error] LCNC GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Cyprus (LC)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:20:13.014Z [info] LBSF Started.
2026-05-01T03:20:13.016Z [info] LBSF Completed.
2026-05-01T03:20:13.016Z [info] LBSF Started.
2026-05-01T03:20:17.580Z [info] LBSF Completed.
2026-05-01T03:20:17.580Z [info] LBSF Started.
2026-05-01T03:20:21.409Z [info] LCLK Artifact skipped: country already has one PDF.
2026-05-01T03:20:21.409Z [info] LCLK Completed.
2026-05-01T03:20:21.409Z [info] LCLK Started.
2026-05-01T03:20:21.598Z [info] LBSF Completed.
2026-05-01T03:20:21.598Z [info] LBSF Started.
2026-05-01T03:20:21.632Z [info] LBSF Artifact skipped: country already has one PDF.
2026-05-01T03:20:21.632Z [info] LBSF Completed.
2026-05-01T03:20:21.632Z [info] LBSF Started.
2026-05-01T03:20:26.445Z [error] LBSF GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Bulgaria (LB)
[EAD GEN] Opening login page
[EAD GEN] Accepting terms and conditions
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:20:26.445Z [info] LBPD Started.
2026-05-01T03:20:28.948Z [error] LCLK GEN sync HTTP 502: GEN sync failed | node exited 1: ImageData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): LC_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Cyprus (LC), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:20:28.948Z [info] BGUQ Started.
2026-05-01T03:20:31.951Z [error] LBPD AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:20:31.951Z [info] LBPD Started.
2026-05-01T03:20:35.844Z [info] LBPD Completed.
2026-05-01T03:20:35.844Z [info] LBPD Started.
2026-05-01T03:20:37.363Z [info] BGUQ Completed.
2026-05-01T03:20:37.363Z [info] BGUQ Started.
2026-05-01T03:20:39.646Z [info] LBPD Completed.
2026-05-01T03:20:39.647Z [info] LBPD Started.
2026-05-01T03:20:39.673Z [info] LBPD Artifact skipped: country already has one PDF.
2026-05-01T03:20:39.673Z [info] LBPD Completed.
2026-05-01T03:20:39.673Z [info] LBPD Started.
2026-05-01T03:20:41.192Z [info] BGUQ Completed.
2026-05-01T03:20:41.192Z [info] BGUQ Started.
2026-05-01T03:20:44.946Z [info] BGUQ Completed.
2026-05-01T03:20:44.946Z [info] BGUQ Started.
2026-05-01T03:20:44.949Z [info] BGUQ Artifact skipped: country already has one PDF.
2026-05-01T03:20:44.949Z [info] BGUQ Completed.
2026-05-01T03:20:44.949Z [info] BGUQ Started.
2026-05-01T03:20:47.380Z [error] LBPD GEN sync HTTP 502: GEN sync failed | node exited 1: P Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Trying GEN candidate: LB_GEN_1_2_en.pdf | GEN 1.2 ENTRY, TRANSIT AND DEPARTURE OF AIRCRAFT
[EAD GEN] Skip candidate (not PDF): LB_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Bulgaria (LB), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:20:47.380Z [info] BGUK Started.
2026-05-01T03:20:54.936Z [info] BGUK Completed.
2026-05-01T03:20:54.936Z [info] BGUK Started.
2026-05-01T03:20:55.993Z [error] LBWB GEN sync HTTP 502: GEN sync failed | node exited 1: s
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Bulgaria (LB)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:20:55.993Z [info] BGTL Started.
2026-05-01T03:20:58.841Z [info] BGUK Completed.
2026-05-01T03:20:58.841Z [info] BGUK Started.
2026-05-01T03:21:02.440Z [info] BGUK Completed.
2026-05-01T03:21:02.440Z [info] BGUK Started.
2026-05-01T03:21:02.443Z [info] BGUK Artifact skipped: country already has one PDF.
2026-05-01T03:21:02.443Z [info] BGUK Completed.
2026-05-01T03:21:02.443Z [info] BGUK Started.
2026-05-01T03:21:04.866Z [info] BGTL Completed.
2026-05-01T03:21:04.866Z [info] BGTL Started.
2026-05-01T03:21:08.631Z [info] BGTL Completed.
2026-05-01T03:21:08.631Z [info] BGTL Started.
2026-05-01T03:21:10.847Z [error] BGUK GEN sync HTTP 502: GEN sync failed | node exited 1: geData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): BG_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Greenland (BG), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:21:10.847Z [info] BGSS Started.
2026-05-01T03:21:12.162Z [info] BGTL Completed.
2026-05-01T03:21:12.162Z [info] BGTL Started.
2026-05-01T03:21:12.165Z [info] BGTL Artifact skipped: country already has one PDF.
2026-05-01T03:21:12.165Z [info] BGTL Completed.
2026-05-01T03:21:12.165Z [info] BGTL Started.
2026-05-01T03:21:15.355Z [error] BGSS AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:21:15.355Z [info] BGSS Started.
2026-05-01T03:21:19.418Z [info] BGSS Completed.
2026-05-01T03:21:19.418Z [info] BGSS Started.
2026-05-01T03:21:20.330Z [error] BGTL GEN sync HTTP 502: GEN sync failed | node exited 1: geData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): BG_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Greenland (BG), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:21:20.330Z [info] BGSF Started.
2026-05-01T03:21:23.168Z [info] BGSS Completed.
2026-05-01T03:21:23.168Z [info] BGSS Started.
2026-05-01T03:21:30.876Z [info] BGSS Artifact skipped: country already has one PDF.
2026-05-01T03:21:30.876Z [info] BGSS Completed.
2026-05-01T03:21:30.876Z [info] BGSS Started.
2026-05-01T03:21:31.744Z [error] BGUQ GEN sync HTTP 502: GEN sync failed | node exited 1: ons
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Greenland (BG)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/public/static/session_expired.faces

2026-05-01T03:21:31.744Z [info] BGQQ Started.
2026-05-01T03:21:40.995Z [error] BGSS GEN sync HTTP 502: GEN sync failed | node exited 1: geData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): BG_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Greenland (BG), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:21:40.995Z [info] BGPT Started.
2026-05-01T03:21:45.848Z [error] BGQQ AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:21:45.848Z [info] BGQQ Started.
2026-05-01T03:21:49.525Z [info] BGQQ Completed.
2026-05-01T03:21:49.525Z [info] BGQQ Started.
2026-05-01T03:21:49.593Z [info] BGPT Completed.
2026-05-01T03:21:49.593Z [info] BGPT Started.
2026-05-01T03:21:52.830Z [info] BGQQ Completed.
2026-05-01T03:21:52.830Z [info] BGQQ Started.
2026-05-01T03:21:52.855Z [info] BGQQ Artifact skipped: country already has one PDF.
2026-05-01T03:21:52.855Z [info] BGQQ Completed.
2026-05-01T03:21:52.855Z [info] BGQQ Started.
2026-05-01T03:21:53.793Z [info] BGPT Completed.
2026-05-01T03:21:53.793Z [info] BGPT Started.
2026-05-01T03:21:57.679Z [info] BGPT Completed.
2026-05-01T03:21:57.680Z [info] BGPT Started.
2026-05-01T03:21:57.682Z [info] BGPT Artifact skipped: country already has one PDF.
2026-05-01T03:21:57.682Z [info] BGPT Completed.
2026-05-01T03:21:57.682Z [info] BGPT Started.
2026-05-01T03:22:00.330Z [error] BGSF Timeout after 40000ms
2026-05-01T03:22:00.330Z [info] BGSF Started.
2026-05-01T03:22:04.008Z [info] BGSF Completed.
2026-05-01T03:22:04.008Z [info] BGSF Started.
2026-05-01T03:22:06.310Z [error] BGPT GEN sync HTTP 502: GEN sync failed | node exited 1: geData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): BG_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Greenland (BG), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:22:06.310Z [info] BGMQ Started.
2026-05-01T03:22:07.869Z [info] BGSF Completed.
2026-05-01T03:22:07.869Z [info] BGSF Started.
2026-05-01T03:22:07.873Z [info] BGSF Artifact skipped: country already has one PDF.
2026-05-01T03:22:07.873Z [info] BGSF Completed.
2026-05-01T03:22:07.873Z [info] BGSF Started.
2026-05-01T03:22:11.339Z [error] BGMQ AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:22:11.339Z [info] BGMQ Started.
2026-05-01T03:22:15.008Z [info] BGMQ Completed.
2026-05-01T03:22:15.008Z [info] BGMQ Started.
2026-05-01T03:22:15.262Z [error] BGSF GEN sync HTTP 502: GEN sync failed | node exited 1: geData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): BG_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Greenland (BG), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:22:15.262Z [info] BGKK Started.
2026-05-01T03:22:18.740Z [info] BGMQ Completed.
2026-05-01T03:22:18.740Z [info] BGMQ Started.
2026-05-01T03:22:18.762Z [info] BGMQ Artifact skipped: country already has one PDF.
2026-05-01T03:22:18.762Z [info] BGMQ Completed.
2026-05-01T03:22:18.762Z [info] BGMQ Started.
2026-05-01T03:22:26.777Z [error] BGMQ GEN sync HTTP 502: GEN sync failed | node exited 1: geData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): BG_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Greenland (BG), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:22:26.777Z [info] BGJN Started.
2026-05-01T03:22:35.223Z [info] BGJN Completed.
2026-05-01T03:22:35.223Z [info] BGJN Started.
2026-05-01T03:22:38.889Z [info] BGJN Completed.
2026-05-01T03:22:38.889Z [info] BGJN Started.
2026-05-01T03:22:40.156Z [error] BGQQ GEN sync HTTP 502: GEN sync failed | node exited 1: 
[EAD GEN] Opening AIP Library
[EAD GEN] Selecting country: Greenland (BG)
[EAD GEN] Selecting AIP Part: GEN
[EAD GEN] Opening Advanced Search and searching for GEN 1.2
[EAD GEN] Error: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('[id="mainForm:documentHeader"]').or(locator('input[id$="documentHeader"]'))

[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:22:40.156Z [info] BGGH Started.
2026-05-01T03:22:42.967Z [info] BGJN Completed.
2026-05-01T03:22:42.967Z [info] BGJN Started.
2026-05-01T03:22:42.970Z [info] BGJN Artifact skipped: country already has one PDF.
2026-05-01T03:22:42.970Z [info] BGJN Completed.
2026-05-01T03:22:42.970Z [info] BGJN Started.
2026-05-01T03:22:50.744Z [error] BGJN GEN sync HTTP 502: GEN sync failed | node exited 1: geData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): BG_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Greenland (BG), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:22:50.744Z [info] BGCO Started.
2026-05-01T03:22:51.689Z [error] BGKK AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:22:51.689Z [info] BGKK Started.
2026-05-01T03:22:55.585Z [info] BGKK Completed.
2026-05-01T03:22:55.585Z [info] BGKK Started.
2026-05-01T03:22:59.392Z [info] BGKK Completed.
2026-05-01T03:22:59.392Z [info] BGKK Started.
2026-05-01T03:22:59.416Z [info] BGKK Artifact skipped: country already has one PDF.
2026-05-01T03:22:59.416Z [info] BGKK Completed.
2026-05-01T03:22:59.416Z [info] BGKK Started.
2026-05-01T03:22:59.458Z [info] BGCO Completed.
2026-05-01T03:22:59.458Z [info] BGCO Started.
2026-05-01T03:23:03.224Z [info] BGCO Completed.
2026-05-01T03:23:03.224Z [info] BGCO Started.
2026-05-01T03:23:07.116Z [info] BGCO Completed.
2026-05-01T03:23:07.116Z [info] BGCO Started.
2026-05-01T03:23:07.120Z [info] BGCO Artifact skipped: country already has one PDF.
2026-05-01T03:23:07.120Z [info] BGCO Completed.
2026-05-01T03:23:07.120Z [info] BGCO Started.
2026-05-01T03:23:07.209Z [error] BGKK GEN sync HTTP 502: GEN sync failed | node exited 1: geData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): BG_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Greenland (BG), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:23:07.209Z [info] BGBW Started.
2026-05-01T03:23:16.690Z [error] BGGH AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:23:16.690Z [info] BGGH Started.
2026-05-01T03:23:20.540Z [info] BGGH Completed.
2026-05-01T03:23:20.540Z [info] BGGH Started.
2026-05-01T03:23:20.543Z [error] BGBW AIP HTTP 502: Sync failed | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:23:20.543Z [info] BGBW Started.
2026-05-01T03:23:20.872Z [error] BGCO GEN sync HTTP 502: GEN sync failed | node exited 1: [EAD GEN] Downloading GEN 1.2 (en) for Greenland (BG)
[EAD GEN] Opening login page
[EAD GEN] Opening AIP Library
[EAD GEN] Error: EAD returned "Access denied". Run from your PC or a non-datacenter network. See scripts/AIP-AWS-SETUP.md.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:23:24.607Z [info] BGGH Completed.
2026-05-01T03:23:24.607Z [info] BGGH Started.
2026-05-01T03:23:24.827Z [info] BGBW Completed.
2026-05-01T03:23:24.827Z [info] BGBW Started.
2026-05-01T03:23:28.190Z [info] BGBW Completed.
2026-05-01T03:23:28.190Z [info] BGBW Started.
2026-05-01T03:23:35.866Z [info] BGBW Artifact skipped: country already has one PDF.
2026-05-01T03:23:35.866Z [info] BGBW Completed.
2026-05-01T03:23:35.866Z [info] BGBW Started.
2026-05-01T03:23:44.624Z [error] BGBW GEN sync HTTP 502: GEN sync failed | node exited 1: geData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): BG_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Greenland (BG), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:24:01.159Z [error] BGGH PDF HTTP 502: Failed to load PDF | node exited 1: file:///app/scripts/ead-download-aip-pdf.mjs:555
      const currentUrl = await page.url().catch(() => "");
                                               ^

TypeError: page.url(...).catch is not a function
    at main (file:///app/scripts/ead-download-aip-pdf.mjs:555:48)

Node.js v20.20.2

2026-05-01T03:24:01.159Z [info] BGGH Started.
2026-05-01T03:24:09.275Z [error] BGGH GEN sync HTTP 502: GEN sync failed | node exited 1: geData`, rendering may be broken.
Warning: Cannot polyfill `Path2D`, rendering may be broken.
[EAD GEN] Could not extract PDF text: DOMMatrix is not defined
[EAD GEN] Reject candidate (likely chart/non-GEN): BG_GEN_1_2_en.pdf
[EAD GEN] Error: GEN 1.2 candidates found for Greenland (BG), but all were rejected as non-GEN/chart artifacts.
[EAD GEN] Screenshot: /app/data/ead-gen/ead-gen-debug.png
[EAD GEN] Page URL: https://www.ead.eurocontrol.int/fwf-eadbasic/restricted/user/aip/aip_overview.faces

2026-05-01T03:24:09.276Z [info] Run completed.
2026-05-01T03:24:09.443Z [info] Telegram summary sent.