// Live-verified session shape for Eleven Realtime.
// Send only fields the API accepts.
// voice: session.audio.output.voice (a workspace voice id). session.voice is unknown_parameter.
// turn_detection.type must be semantic_vad. server_vad errors.
// transcription.language is always "ja".
// Do not send speed, stability, similarity_boost, style, or voice_settings.
// Those are ignored, and session.speed is unknown_parameter.
// Input audio is audio/pcm at 24000 Hz.

import { TARGET_RATE } from "./audio-util.js?v=20261021-1125";
import {
  DEFAULT_EAGERNESS,
  DEFAULT_INTERRUPT,
  DEFAULT_MAX_DURATION_SECONDS,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_VOICE_ID,
} from "./config.js?v=20261021-1125";
import { YUI_INSTRUCTIONS } from "./persona.js?v=20261021-1125";

const MODELS = new Set(["eleven_realtime_v1_mini", "eleven_realtime_v1_max"]);
const EAGERNESS = new Set(["low", "medium", "high"]);

function clampTemperature(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_TEMPERATURE;
  return Math.min(1.2, Math.max(0.3, Math.round(number * 100) / 100));
}

export function buildRealtimeSession(input = {}) {
  const options = typeof input === "string" ? { voiceId: input } : (input || {});
  const voice = String(options.voiceId || "").trim() || DEFAULT_VOICE_ID;
  const model = MODELS.has(options.model) ? options.model : DEFAULT_MODEL;
  const eagerness = EAGERNESS.has(options.eagerness) ? options.eagerness : DEFAULT_EAGERNESS;
  const interruptResponse = options.interruptResponse === undefined
    ? DEFAULT_INTERRUPT
    : Boolean(options.interruptResponse);

  return {
    type: "realtime",
    model,
    instructions: YUI_INSTRUCTIONS,
    output_modalities: ["audio"],
    temperature: clampTemperature(options.temperature),
    max_duration_seconds: DEFAULT_MAX_DURATION_SECONDS,
    audio: {
      input: {
        format: { type: "audio/pcm", rate: TARGET_RATE },
        transcription: { language: "ja" },
        turn_detection: {
          type: "semantic_vad",
          eagerness,
          create_response: true,
          interrupt_response: interruptResponse,
        },
      },
      output: {
        format: { type: "audio/pcm" },
        voice,
      },
    },
  };
}
