// One place to change the voice sent with every Realtime session.
// Set a bright female ElevenLabs voice id (e.g. Hijiri) for 由衣ちゃん. Yusuke (male) left until replaced.
// Replace DEFAULT_VOICE_ID, or type the new id in the page settings.

export const DEFAULT_MODEL = "eleven_realtime_v1_mini";

export const DEFAULT_VOICE_ID = "94gBdmmazJ025HbvF78b";

export const DEFAULT_TEMPERATURE = 0.9;

export const DEFAULT_EAGERNESS = "high";

export const DEFAULT_INTERRUPT = true;

export const DEFAULT_MAX_DURATION_SECONDS = 600;

// Kept for a later dedicated voice. Do not send these on session.update.
// Live check: stability, similarity_boost, style, speed, and voice_settings
// are silently ignored. session.speed is rejected as unknown_parameter.
export const VOICE_SETTINGS_NOT_SENT = {
  speed: 1.1,
  stability: 0.7,
  similarity_boost: 0.75,
};
