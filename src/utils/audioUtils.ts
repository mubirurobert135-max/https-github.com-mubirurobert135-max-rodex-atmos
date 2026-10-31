/**
 * Audio processing utilities for Gemini Live API
 * Input: 16kHz 16-bit linear PCM little-endian
 * Output: 24kHz 16-bit linear PCM little-endian
 */

export function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); // true for little-endian
  }
  return buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToFloat32Array(base64: string): Float32Array {
  if (!base64) return new Float32Array(0);
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    // Gemini Live audio is signed 16-bit PCM: reject truncated samples instead of decoding partial audio.
    if (len === 0 || len % 2 !== 0) return new Float32Array(0);
    const sampleCount = len / 2;

    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const dataView = new DataView(bytes.buffer, bytes.byteOffset, len);
    const float32Array = new Float32Array(sampleCount);

    for (let i = 0; i < sampleCount; i++) {
      const int16 = dataView.getInt16(i * 2, true); // true for little-endian
      float32Array[i] = int16 < 0 ? int16 / 32768.0 : int16 / 32767.0;
    }
    return float32Array;
  } catch (err) {
    console.warn('[RODEX Audio Decoding Notice]', err);
    return new Float32Array(0);
  }
}

/**
 * Linear interpolation audio resampler.
 * Accurately converts arbitrary source sample rates (e.g. 44.1kHz, 48kHz) to target sample rate (16kHz).
 */
export function resampleAudioBuffer(
  input: Float32Array,
  sourceRate: number,
  targetRate: number = 16000
): Float32Array {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 ||
      !Number.isFinite(targetRate) || targetRate <= 0) {
    return new Float32Array(0);
  }
  if (sourceRate === targetRate || input.length === 0) {
    return input;
  }
  const ratio = sourceRate / targetRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const indexFloor = Math.floor(srcIndex);
    const indexCeil = Math.min(input.length - 1, indexFloor + 1);
    const fraction = srcIndex - indexFloor;
    result[i] = input[indexFloor] * (1 - fraction) + input[indexCeil] * fraction;
  }
  return result;
}
