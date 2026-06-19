/*
 * Flag emoji lookup keyed by team short_name (FIFA tri-code).
 *
 * IMPORTANT: pickem_teams has NO flag_emoji column — flags are derived here from
 * short_name. Do not SELECT flag_emoji from pickem_teams; it does not exist and
 * the query will 500. Use flagFor(shortName) instead.
 */
export const FLAG_BY_CODE: Record<string, string> = {
  MEX:'🇲🇽', RSA:'🇿🇦', KOR:'🇰🇷', CZE:'🇨🇿', CAN:'🇨🇦', BIH:'🇧🇦', QAT:'🇶🇦', SUI:'🇨🇭',
  BRA:'🇧🇷', MAR:'🇲🇦', HAI:'🇭🇹', SCO:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', USA:'🇺🇸', PAR:'🇵🇾', AUS:'🇦🇺', TUR:'🇹🇷',
  GER:'🇩🇪', CUW:'🇨🇼', CIV:'🇨🇮', ECU:'🇪🇨', NED:'🇳🇱', JPN:'🇯🇵', SWE:'🇸🇪', TUN:'🇹🇳',
  BEL:'🇧🇪', EGY:'🇪🇬', IRN:'🇮🇷', NZL:'🇳🇿', ESP:'🇪🇸', CPV:'🇨🇻', KSA:'🇸🇦', URU:'🇺🇾',
  FRA:'🇫🇷', SEN:'🇸🇳', IRQ:'🇮🇶', NOR:'🇳🇴', ARG:'🇦🇷', ALG:'🇩🇿', AUT:'🇦🇹', JOR:'🇯🇴',
  POR:'🇵🇹', COD:'🇨🇩', UZB:'🇺🇿', COL:'🇨🇴', ENG:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', CRO:'🇭🇷', GHA:'🇬🇭', PAN:'🇵🇦',
};

export function flagFor(shortName: string | null | undefined): string {
  if (!shortName) return '';
  return FLAG_BY_CODE[shortName] ?? '';
}

/**
 * Derive a flagcdn.com country code from a flag emoji.
 * - Regional-indicator pair (🇩🇪) → ISO 3166-1 alpha-2 ("de").
 * - Subdivision tag flags (🏴 England/Scotland/Wales) → "gb-eng" / "gb-sct" / "gb-wls".
 * Returns null when it can't be derived (caller falls back to the emoji).
 */
export function flagCdnCode(emoji: string | null | undefined): string | null {
  if (!emoji) return null;
  const cps = [...emoji].map(c => c.codePointAt(0) ?? 0);
  const ri = cps.filter(cp => cp >= 0x1f1e6 && cp <= 0x1f1ff);
  if (ri.length === 2) return ri.map(cp => String.fromCharCode(cp - 0x1f1e6 + 97)).join('');
  const tags = cps.filter(cp => cp >= 0xe0061 && cp <= 0xe007a)
    .map(cp => String.fromCharCode(cp - 0xe0061 + 97)).join('');
  if (tags.startsWith('gb') && tags.length >= 4) return `gb-${tags.slice(2)}`;
  return null;
}

/** flagcdn code straight from a team short_name (FIFA tri-code) via its emoji. */
export function flagCdnCodeFor(shortName: string | null | undefined): string | null {
  return flagCdnCode(flagFor(shortName));
}
