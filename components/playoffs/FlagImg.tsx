'use client';

import { FlagImage } from '@/components/FlagImage';
import { flagCdnCode } from '@/lib/playoffs/flags';

interface FlagImgProps {
  emoji: string;
  size?: number;
}

/**
 * Bracket flag — kept its emoji-based prop signature so existing call sites work,
 * but now renders via the flagcdn FlagImage (real images, Windows-safe) with the
 * emoji as fallback.
 */
export function FlagImg({ emoji, size = 20 }: FlagImgProps) {
  return <FlagImage countryCode={flagCdnCode(emoji)} emoji={emoji} size={size} />;
}
