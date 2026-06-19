'use client';

import React, { useState } from 'react';

interface FlagImageProps {
  /** ISO 3166-1 alpha-2 lowercase (or flagcdn subdivision code like "gb-eng"). */
  countryCode: string | null | undefined;
  size?: number;
  alt?: string;
  /** Emoji shown as a text fallback if the image is missing or fails to load. */
  emoji?: string;
}

/**
 * Country flag rendered from the flagcdn.com CDN (real images), so flags display
 * on Windows Chrome where regional-indicator emoji don't render as flags.
 * Falls back to the emoji (or a neutral box) if the code is missing or the image
 * fails to load. Memoized — it renders many times in bracket views.
 *
 * NOTE: task spec lists src/components/FlagImage.tsx; this repo uses components/.
 */
export const FlagImage = React.memo(function FlagImage({ countryCode, size = 20, alt, emoji }: FlagImageProps) {
  const [failed, setFailed] = useState(false);
  const height = Math.round(size * 0.75);

  if (!countryCode || failed) {
    if (emoji) {
      return (
        <span aria-label={alt} style={{ fontSize: size, lineHeight: 1, display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
          {emoji}
        </span>
      );
    }
    return <span style={{ width: size, height, display: 'inline-block', background: '#e5e7eb', borderRadius: 2, verticalAlign: 'middle', flexShrink: 0 }} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${countryCode}.png`}
      alt={alt ?? countryCode}
      width={size}
      height={height}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ display: 'inline-block', objectFit: 'cover', verticalAlign: 'middle', flexShrink: 0, borderRadius: 2 }}
    />
  );
});
