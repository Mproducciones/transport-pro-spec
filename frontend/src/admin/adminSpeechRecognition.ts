/**
 * Reconocimiento de voz del navegador (Chrome / Edge / Safari reciente).
 * Sin envío a servidor: el audio lo procesa el motor del dispositivo.
 */
export function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionAvailable(): boolean {
  return getSpeechRecognitionCtor() !== null;
}
