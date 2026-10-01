#!/usr/bin/env python3
import json
import time
from pathlib import Path
from io import BytesIO
from urllib.parse import urlparse, unquote, quote

import requests
from PIL import Image

MANIFEST = "clearway-airport-image-manifest.json"
OUT = Path("assets")
TIMEOUT = 60

TARGETS = {
    "hero": (1200, 690),
    "pax": (800, 540),
}

# Wikimedia prefers thumbnail delivery for automated downloading.
WIKIMEDIA_WIDTH = {
    "hero": 1600,
    "pax": 1200,
}

REQUEST_DELAY = 2.5
MAX_RETRIES = 8

HEADERS = {
    "User-Agent": "ClearwayAirportSheets/2.0 (clearway.aero; airport-image-downloader)"
}


def crop_to_ratio(img, target_w, target_h):
    img = img.convert("RGB")
    target_ratio = target_w / target_h
    w, h = img.size
    current_ratio = w / h

    if current_ratio > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    elif current_ratio < target_ratio:
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))

    return img.resize((target_w, target_h), Image.Resampling.LANCZOS)


def commons_filename_from_source_page(source_page: str):
    if not source_page:
        return None

    parsed = urlparse(source_page)
    path = unquote(parsed.path)

    marker = "/wiki/File:"
    if marker not in path:
        return None

    return path.split(marker, 1)[1]


def build_download_url(entry, kind):
    source_page = entry.get("sourcePage") or ""
    filename = commons_filename_from_source_page(source_page)

    if filename:
        width = WIKIMEDIA_WIDTH[kind]
        encoded = quote(filename, safe="()[],'-_.%")
        return f"https://commons.wikimedia.org/wiki/Special:Redirect/file/{encoded}?width={width}"

    url = (entry.get("imageUrl") or "").strip()
    if not url:
        return None

    # Strip tracking params that can make Wikimedia requests noisier.
    if "upload.wikimedia.org" in url:
        return url.split("?", 1)[0]

    return url


def get_image(session, url):
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = session.get(
                url,
                timeout=TIMEOUT,
                allow_redirects=True,
                headers=HEADERS,
            )

            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    wait = max(int(retry_after), 20)
                else:
                    wait = min(20 * (2 ** (attempt - 1)), 300)

                print(f"    429 rate limited, waiting {wait}s")
                time.sleep(wait)
                last_error = RuntimeError("HTTP 429 Too Many Requests")
                continue

            if response.status_code in (500, 502, 503, 504):
                wait = min(10 * attempt, 60)
                print(f"    server error {response.status_code}, waiting {wait}s")
                time.sleep(wait)
                last_error = RuntimeError(f"HTTP {response.status_code}")
                continue

            response.raise_for_status()

            content_type = (response.headers.get("Content-Type") or "").lower()
            if "image" not in content_type:
                raise RuntimeError(
                    f"Expected image, got content-type: {content_type or 'unknown'}"
                )

            return Image.open(BytesIO(response.content))

        except (requests.RequestException, OSError, RuntimeError) as exc:
            last_error = exc

            if attempt < MAX_RETRIES:
                wait = min(5 * attempt, 30)
                print(f"    retry {attempt}/{MAX_RETRIES} in {wait}s: {exc}")
                time.sleep(wait)

    raise last_error or RuntimeError("Download failed")


def main():
    manifest_path = Path(MANIFEST)

    if not manifest_path.exists():
        raise SystemExit(
            f"Manifest not found: {MANIFEST}\n"
            "Put this script in the same folder as clearway-airport-image-manifest.json"
        )

    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    airports = data.get("airports", [])

    if not airports:
        raise SystemExit("Manifest contains no airports.")

    for kind in ("hero", "pax"):
        (OUT / kind).mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update(HEADERS)

    downloaded = 0
    skipped = 0
    failed = []

    for index, airport in enumerate(airports, start=1):
        icao = airport.get("icao", "UNKNOWN")
        print(f"[{index}/{len(airports)}] {icao}")

        for kind in ("hero", "pax"):
            out_file = OUT / kind / f"{icao}.jpg"

            # Resume mode: skip existing valid-looking files.
            if out_file.exists() and out_file.stat().st_size > 10_000:
                print(f"  {kind}: SKIP (already exists)")
                skipped += 1
                continue

            entry = airport.get(kind)
            if not entry:
                msg = "missing manifest entry"
                failed.append((icao, kind, msg))
                print(f"  {kind}: FAILED: {msg}")
                continue

            url = build_download_url(entry, kind)
            if not url:
                msg = "no usable image URL"
                failed.append((icao, kind, msg))
                print(f"  {kind}: FAILED: {msg}")
                continue

            try:
                image = get_image(session, url)
                image = crop_to_ratio(image, *TARGETS[kind])
                image.save(out_file, "JPEG", quality=92, optimize=True)
                downloaded += 1
                print(f"  {kind}: OK -> {out_file}")
            except Exception as exc:
                failed.append((icao, kind, str(exc)))
                print(f"  {kind}: FAILED: {exc}")

            time.sleep(REQUEST_DELAY)

    print("\n=== SUMMARY ===")
    print(f"Downloaded this run: {downloaded}")
    print(f"Already existed:     {skipped}")
    print(f"Failed:              {len(failed)}")

    failed_path = Path("failed-images.txt")

    if failed:
        failed_path.write_text(
            "\n".join(f"{icao}\t{kind}\t{error}" for icao, kind, error in failed),
            encoding="utf-8",
        )
        print(f"Failure log: {failed_path}")
    elif failed_path.exists():
        failed_path.unlink()


if __name__ == "__main__":
    main()
