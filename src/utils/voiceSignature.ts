/**
 * RODEX Atmos Signature Voice Specification & Constants
 * Approved Voice Identity: RODEX Atmos Signature (voice_nv4v693k2132)
 *
 * This voice profile represents the warm, confident, personable, and lightly playful
 * feminine persona approved for the RODEX Atmos AI weather assistant.
 */

export const ATMOS_SIGNATURE_VOICE_ID = 'voice_nv4v693k2132';
export const ATMOS_SIGNATURE_VOICE_NAME = 'RODEX Atmos Signature';
export const ATMOS_SIGNATURE_GENDER = 'female';
export const ATMOS_SIGNATURE_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
export const ATMOS_SIGNATURE_LIVE_VOICE = 'Aoede';
export const ATMOS_SIGNATURE_STYLE = 'Warm, confident, personable, lightly playful, clear and concise';
export const ATMOS_SIGNATURE_AUDITION_URL = '/atmos-signature-audition.wav';

export interface VoiceMetadata {
  id: string;
  displayName: string;
  gender: string;
  languageCode: string;
  context: string;
  type: string;
  ttsModel: string;
  liveVoice: string;
  description: string;
  hasAuditionSample: boolean;
  auditionUrl: string;
}

export const ATMOS_SIGNATURE_METADATA: VoiceMetadata = {
  id: ATMOS_SIGNATURE_VOICE_ID,
  displayName: ATMOS_SIGNATURE_VOICE_NAME,
  gender: ATMOS_SIGNATURE_GENDER,
  languageCode: 'en-US',
  context: 'Conversational',
  type: 'prompted',
  ttsModel: ATMOS_SIGNATURE_TTS_MODEL,
  liveVoice: ATMOS_SIGNATURE_LIVE_VOICE,
  description: 'An original, distinctive feminine voice for a premium modern AI assistant. Warm, sophisticated, confident and charismatic, with a bright playful sparkle and understated glamour.',
  hasAuditionSample: true,
  auditionUrl: ATMOS_SIGNATURE_AUDITION_URL
};
