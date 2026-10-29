export interface BrowserVoiceOption {
  name: string;
  lang: string;
  localService?: boolean;
}

const FEMININE_VOICE_HINTS =
  /\b(female|samantha|ava|jenny|aria|sara|sonia|hazel|libby|zira|victoria|karen|moira|fiona|tessa|serena|stephanie|salli|joanna|kendra|kimberly|michelle|ivy|heera|natasha|laura|lisa|susan|allison|emma|olivia|june|kate|google us english|google uk english female)\b/i;

const KNOWN_MASCULINE_VOICE_HINTS =
  /\b(male|david|mark|daniel|james|guy|tom|fred|ralph|george|brian|christopher|matthew|thomas|michael|andrew|aaron|arthur|oliver|ryan|liam|jordan|joseph|richard|jason|alexander)\b/i;

const LOW_QUALITY_VOICE_HINTS = /\b(compact|robotic|novelty|whisper|old default)\b/i;

/** Slightly quicker than default without pushing into unnatural fast speech. */
export const ATMOS_BROWSER_SPEECH_RATE = 1.12;
export const ATMOS_BROWSER_SPEECH_PITCH = 1.10;

/**
 * Rank voices by practical fallback quality. Web Speech exposes no standard
 * gender, timbre, or naturalness metadata, so named voice hints are heuristics.
 */
export function choosePreferredAtmosVoice<T extends BrowserVoiceOption>(
  voices: readonly T[],
  preferredLanguage = 'en-US'
): T | null {
  if (!voices.length) return null;

  const englishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('en'));
  const candidates = englishVoices.length ? englishVoices : [...voices];
  const preferredBaseLanguage = preferredLanguage.toLowerCase().split('-')[0];
  const preferredLocale = preferredLanguage.toLowerCase();

  const score = (voice: T): number => {
    const name = voice.name || '';
    const lang = (voice.lang || '').toLowerCase();
    let points = 0;

    if (lang === preferredLocale) points += 24;
    else if (lang.startsWith(preferredBaseLanguage)) points += 12;
    if (lang.startsWith('en-us')) points += 5;
    if (FEMININE_VOICE_HINTS.test(name)) points += 80;
    if (/\b(online|natural|neural|premium|enhanced)\b/i.test(name)) points += 14;
    if (voice.localService === false) points += 2;
    if (KNOWN_MASCULINE_VOICE_HINTS.test(name)) points -= 100;
    if (LOW_QUALITY_VOICE_HINTS.test(name)) points -= 35;
    return points;
  };

  const ranked = candidates
    .map((voice) => ({ voice, points: score(voice) }))
    .sort((a, b) => b.points - a.points);

  // Do not deliberately prefer a clearly masculine voice for the Atmos persona.
  const feminineOrNeutral = ranked.find(({ voice }) => !KNOWN_MASCULINE_VOICE_HINTS.test(voice.name || ''));
  return (feminineOrNeutral?.voice || ranked[0]?.voice || null) as T | null;
}
