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
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }
  return float32Array;
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
