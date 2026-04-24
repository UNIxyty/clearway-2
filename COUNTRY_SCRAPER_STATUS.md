# Country Scraper Status

Status meanings:
- `created`: country marked done in `eaip_links.json`
- `already created`: scraper script exists, but country not marked done
- `awaiting`: non-EAD country without dedicated scraper yet
- `skipped`: intentionally skipped (currently EAD/Login/Unavailable)

## Created (15)

| Country | ICAO | Link | Status in JSON | Reason | Script |
|---|---|---|---|---|---|
| Albania | LA | https://www.albcontrol.al/aip/ | done | Implemented in this workflow | albania-aip-interactive.mjs |
| Armenia | UD | https://armats.am/activities/ais/eaip | done | Implemented in this workflow | armenia-eaip-interactive.mjs |
| Austria | LO | https://eaip.austrocontrol.at/ | done | Implemented in this workflow | austria-eaip-interactive.mjs |
| Belgium | EB | https://ops.skeyes.be/htmlAIP/ | done | Implemented in this workflow | belgium-eaip-interactive.mjs |
| Czech Republic | LK | https://aim.rlp.cz/ | done | Implemented in this workflow | czech-republic-eaip-interactive.mjs |
| Denmark | EK | https://aim.naviair.dk/ | done | Implemented in this workflow | denmark-eaip-interactive.mjs |
| Estonia | EE | https://aim.eans.ee/et/eaip | done | Implemented in this workflow | estonia-eaip-interactive.mjs |
| Finland | EF | https://ais.fi/eaip/ | done | Implemented in this workflow | finland-eaip-interactive.mjs |
| Georgia | UG | https://airnav.ge/eaip/history-en-GB.html | done | Implemented in this workflow | georgia-eaip-interactive.mjs |
| Hungary | LH | https://ais-en.hungarocontrol.hu/aip/aip-archive/ | done | Implemented in this workflow | hungary-eaip-interactive.mjs |
| Ireland | EI | https://www.airnav.ie/air-traffic-management/aeronautical-information-management/aip-package#Part_III_-_Aerodromes_(AD) | done | Implemented in this workflow | ireland-aip-interactive.mjs |
| Kazakhstan | UA | https://www.ans.kz/en/ais/eaip | done | Implemented in this workflow | kazakhstan-eaip-interactive.mjs |
| Poland | EP | https://www.ais.pansa.pl/en/publications/aip-poland/ | done | Implemented in this workflow | poland-eaip-interactive.mjs |
| Portugal | LP | https://ais.nav.pt/wp-content/uploads/AIS_Files/eAIP_Current/eAIP_Online/eAIP/html/index.html | done | Implemented in this workflow | portugal-eaip-interactive.mjs |
| Spain | LE | https://aip.enaire.es/AIP/AIP-en.html | done | Implemented in this workflow | spain-aip-interactive.mjs |

## Already created (1)

| Country | ICAO | Link | Status in JSON | Reason | Script |
|---|---|---|---|---|---|
| Bosnia | LQ | https://eaip.bhansa.gov.ba/ | correct | Scraper file already exists | bosnia-eaip-interactive.mjs |

## Awaiting (13)

| Country | ICAO | Link | Status in JSON | Reason | Script |
|---|---|---|---|---|---|
| France | LF | https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_16_APR_2026/FRANCE/home.html | correct | No dedicated scraper yet | - |
| Germany | ED | https://aip.dfs.de/BasicIFR/2026APR20/chapter/279afdc243b210751d2f9f2401e5e4db.html | correct | No dedicated scraper yet | - |
| Greece | LG | https://aisgr.hasp.gov.gr/main.php?rand=0.7276487307378027#publications | correct | No dedicated scraper yet | - |
| Iceland | BI | https://eaip.isavia.is/ | correct | No dedicated scraper yet | - |
| Latvia | EV | https://ais.lgs.lv/aiseaip | correct | No dedicated scraper yet | - |
| Lithuania | EY | https://www.ans.lt/a1/aip/02_16Apr2026/EY-history-en-US.html | correct | No dedicated scraper yet | - |
| Netherlands | EH | https://eaip.lvnl.nl/web/eaip/default.html | correct | No dedicated scraper yet | - |
| Norway | EN | https://aim-prod.avinor.no/no/AIP/View/Index/152/history-no-NO.html | correct | No dedicated scraper yet | - |
| Romania | LR | https://www.aisro.ro/ | correct | No dedicated scraper yet | - |
| Slovakia | LZ | https://aim.lps.sk/web/index.php?fn=200&lng=en&sess=rqBc1HuJxz891d9R5BfbUNRh83mTpGFzJADGIIGH | correct | No dedicated scraper yet | - |
| Slovenia | LJ | https://aim.sloveniacontrol.si/aim/products/aip/ | correct | No dedicated scraper yet | - |
| Sweden | ES | https://aro.lfv.se/content/eaip/default_offline.html | correct | No dedicated scraper yet | - |
| United Kingdom | EG | https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/ | correct | No dedicated scraper yet | - |

## Skipped (11)

| Country | ICAO | Link | Status in JSON | Reason | Script |
|---|---|---|---|---|---|
| Azerbaijan | UB | EAD | correct | EAD country (outside dedicated non-EAD scraper scope) | - |
| Bulgaria | LB | EAD | correct | EAD country (outside dedicated non-EAD scraper scope) | - |
| Croatia | LD | EAD | correct | EAD country (outside dedicated non-EAD scraper scope) | - |
| Cyprus | LC | EAD | correct | EAD country (outside dedicated non-EAD scraper scope) | - |
| Italy | LI | EAD | correct | EAD country (outside dedicated non-EAD scraper scope) | - |
| Malta | LM | EAD | correct | EAD country (outside dedicated non-EAD scraper scope) | - |
| Moldova | LU | EAD | correct | EAD country (outside dedicated non-EAD scraper scope) | - |
| Serbia | LY | EAD | correct | EAD country (outside dedicated non-EAD scraper scope) | - |
| Switzerland | LS | EAD | correct | EAD country (outside dedicated non-EAD scraper scope) | - |
| Turkey | LT | EAD | correct | EAD country (outside dedicated non-EAD scraper scope) | - |
| Ukraine | UK | EAD | correct | EAD country (outside dedicated non-EAD scraper scope) | - |

