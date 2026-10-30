/**
 * Safely acquire microphone access and a server-issued Live API token in parallel.
 * A token failure must not leave an already-opened (or late-arriving) microphone
 * stream running in the background.
 */
export async function resolveVoicePrerequisites<TMicrophone, TToken>(
  microphonePromise: Promise<TMicrophone>,
  tokenPromise: Promise<TToken>,
  disposeMicrophone: (microphone: TMicrophone) => void
): Promise<[TMicrophone, TToken]> {
  let discardWhenReady = false;
  let hasAcquiredMicrophone = false;
  let acquiredMicrophone!: TMicrophone;

  const trackedMicrophonePromise = microphonePromise.then((microphone) => {
    acquiredMicrophone = microphone;
    hasAcquiredMicrophone = true;
    if (discardWhenReady) {
      try {
        disposeMicrophone(microphone);
      } catch (disposeError) {
        console.warn('[RODEX Voice] Could not dispose a late microphone stream:', disposeError);
      }
    }
    return microphone;
  });

  try {
    const [microphone, token] = await Promise.all([trackedMicrophonePromise, tokenPromise]);
    return [microphone, token];
  } catch (error) {
    discardWhenReady = true;
    if (hasAcquiredMicrophone) {
      try {
        disposeMicrophone(acquiredMicrophone);
      } catch (disposeError) {
        console.warn('[RODEX Voice] Could not dispose microphone after setup failure:', disposeError);
      }
      hasAcquiredMicrophone = false;
    }
    throw error;
  }
}
