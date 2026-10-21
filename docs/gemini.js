// Gemini Live API (raw WebSocket, browser-direct with an AI Studio key).
// Docs: https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket
// Mic in: audio/pcm;rate=16000 (PCM16 LE). Model out: PCM16 24 kHz in serverContent.modelTurn.parts[].inlineData.
import { YUI_INSTRUCTIONS } from "./persona.js?v=20261021-1125";

export const GEMINI_INPUT_RATE = 16000;
export const GEMINI_MODELS = ["gemini-3.1-flash-live-preview", "gemini-3.8-live"];
export const GEMINI_DEFAULT_MODEL = "gemini-3.1-flash-live-preview";
export const GEMINI_DEFAULT_VOICE = "Leda";

export function geminiUrl(apiKey) {
  return "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key="
    + encodeURIComponent(apiKey);
}

export function buildGeminiSetup({ model, voice, temperature } = {}) {
  const m = GEMINI_MODELS.includes(model) ? model : GEMINI_DEFAULT_MODEL;
  const t = Number(temperature);
  return {
    setup: {
      model: `models/${m}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        ...(Number.isFinite(t) ? { temperature: t } : {}),
        speechConfig: {
          languageCode: "ja-JP",
          voiceConfig: { prebuiltVoiceConfig: { voiceName: (voice || "").trim() || GEMINI_DEFAULT_VOICE } },
        },
      },
      systemInstruction: { parts: [{ text: YUI_INSTRUCTIONS }] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  };
}

export function geminiAudioMessage(base64) {
  return { realtimeInput: { audio: { data: base64, mimeType: `audio/pcm;rate=${GEMINI_INPUT_RATE}` } } };
}
