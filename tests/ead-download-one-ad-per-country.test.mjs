import test from 'node:test';
import assert from 'node:assert/strict';
import {
  argValueFromArgv,
  isAd2Heading,
  isAd2DocumentName,
  isAd2AirportDocumentName,
  isAd2SectionZeroBundle,
  isPreferredAd2AerodromeFile,
  extractIcaoFromAd2Filename,
  icaoPrefixFromAuthorityLabel,
  countryNeedsEadRetry,
} from '../scripts/ead-download-one-ad-per-country-lib.mjs';

test('argValueFromArgv supports --flag value', () => {
  const argv = ['node', 'script', '--max-countries', '2'];
  assert.equal(argValueFromArgv(argv, '--max-countries', ''), '2');
});

test('argValueFromArgv supports --flag=value', () => {
  const argv = ['node', 'script', '--max-countries=2'];
  assert.equal(argValueFromArgv(argv, '--max-countries', ''), '2');
});

test('isAd2Heading matches AD2 airport headings', () => {
  assert.equal(isAd2Heading('AD 2 EVRA'), true);
  assert.equal(isAd2Heading('AD 2   UUEE'), true);
  assert.equal(isAd2Heading('AD 1.3'), false);
});

test('isAd2DocumentName matches AD2 files only', () => {
  assert.equal(isAd2DocumentName('LO_AD_2_LOWI_0_en.pdf'), true);
  assert.equal(isAd2DocumentName('LO_AD_0_1_en.pdf'), false);
});

test('isAd2AirportDocumentName only matches AD2 airport docs', () => {
  assert.equal(isAd2AirportDocumentName('LO_AD_2_LOWI_0_en.pdf'), true);
  assert.equal(isAd2AirportDocumentName('LO_AD_2_ENRT_0_en.pdf'), true);
  assert.equal(isAd2AirportDocumentName('LO_AD_2_0_en.pdf'), false);
  assert.equal(isAd2AirportDocumentName('LO_AD_0_1_en.pdf'), false);
});

test('isAd2SectionZeroBundle detects bundled AD2 section 0', () => {
  assert.equal(isAd2SectionZeroBundle('LG_AD_2_0_en_2023-12-28.pdf'), true);
  assert.equal(isAd2SectionZeroBundle('LG_AD_2_LGAV_en.pdf'), false);
});

test('isPreferredAd2AerodromeFile excludes section 0 and ENRT slots', () => {
  assert.equal(isPreferredAd2AerodromeFile('LO_AD_2_LOWI_0_en.pdf'), true);
  assert.equal(isPreferredAd2AerodromeFile('LG_AD_2_0_en.pdf'), false);
  assert.equal(isPreferredAd2AerodromeFile('LO_AD_2_ENRT_0_en.pdf'), false);
});

test('extractIcaoFromAd2Filename and icaoPrefixFromAuthorityLabel', () => {
  assert.equal(extractIcaoFromAd2Filename('LG_AD_2_LGAV_en.pdf'), 'LGAV');
  assert.equal(icaoPrefixFromAuthorityLabel('Greece (LG)'), 'LG');
  assert.equal(icaoPrefixFromAuthorityLabel('KFOR SECTOR (BK)'), 'BK');
});

test('countryNeedsEadRetry', () => {
  assert.equal(countryNeedsEadRetry(null), true);
  assert.equal(countryNeedsEadRetry(undefined), true);
  assert.equal(countryNeedsEadRetry({ status: 'downloaded' }), false);
  assert.equal(countryNeedsEadRetry({ status: 'skipped_already_downloaded' }), false);
  assert.equal(countryNeedsEadRetry({ status: 'failed' }), true);
  assert.equal(countryNeedsEadRetry({ status: 'no_results' }), true);
});
