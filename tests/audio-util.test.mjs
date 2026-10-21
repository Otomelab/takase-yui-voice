import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TARGET_RATE,
  base64ToBytes,
  bytesToBase64,
  floatToPcm16,
  pcm16BytesToFloat32,
  resampleLinear,
} from "../docs/audio-util.js";
import {
  DEFAULT_EAGERNESS,
  DEFAULT_INTERRUPT,
  DEFAULT_MAX_DURATION_SECONDS,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_VOICE_ID,
  VOICE_SETTINGS_NOT_SENT,
} from "../docs/config.js";
import { TAKASE_INSTRUCTIONS } from "../docs/persona.js";
import { buildRealtimeSession } from "../docs/session.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");

const sine = new Float32Array(48000);
for (let i = 0; i < sine.length; i += 1) {
  sine[i] = Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.5;
}
const resampled = resampleLinear(sine, 48000, TARGET_RATE);
assert.equal(resampled.length, 24000);
assert.equal(resampleLinear(resampled, TARGET_RATE, TARGET_RATE), resampled);

const pcm = floatToPcm16(resampled.subarray(0, 8));
assert.equal(pcm.byteLength, 16);
const roundTrip = pcm16BytesToFloat32(base64ToBytes(bytesToBase64(new Uint8Array(pcm))));
assert.equal(roundTrip.length, 8);
assert.ok(Math.abs(roundTrip[3] - resampled[3]) < 1 / 32768 + 0.0001);

assert.match(TAKASE_INSTRUCTIONS, /ゆいちゃん/);
assert.match(TAKASE_INSTRUCTIONS, /高瀬航/);
assert.match(TAKASE_INSTRUCTIONS, /都度払い/);
assert.match(TAKASE_INSTRUCTIONS, /店じまいだから/);
assert.match(TAKASE_INSTRUCTIONS, /標準語/);

const html = fs.readFileSync(path.join(docs, "index.html"), "utf8");
const css = fs.readFileSync(path.join(docs, "style.css"), "utf8");
const app = fs.readFileSync(path.join(docs, "app.js"), "utf8");
const refs = [
  ...html.matchAll(/(?:src|href)="([^"]+)"/g),
].map((match) => match[1]).filter((ref) => !ref.startsWith("http"));

for (const ref of refs) {
  assert.equal(ref.startsWith("/"), false, ref);
  assert.ok(fs.existsSync(path.join(docs, ref)), ref);
}

for (const needle of [
  "assets/takase_main.png",
  "assets/bg_entrance.png",
  "assets/bg_training.png",
  "assets/expressions/takase/02_笑顔.png",
  "assets/expressions/takase/07_楽しみ.png",
  "assets/expressions/yui/training_expression_02.png",
]) {
  assert.ok(html.includes(needle), needle);
  assert.ok(fs.statSync(path.join(docs, needle)).size > 1000, needle);
}

assert.match(css, /bg-photo|object-fit/);
assert.match(app, /input_audio_buffer\.append/);
assert.match(app, /response\.output_audio\.delta/);
assert.equal(DEFAULT_MODEL, "eleven_realtime_v1_mini");
assert.equal(DEFAULT_VOICE_ID, "94gBdmmazJ025HbvF78b");
assert.equal(DEFAULT_TEMPERATURE, 0.7);
assert.equal(DEFAULT_EAGERNESS, "high");
assert.equal(DEFAULT_INTERRUPT, true);
assert.equal(DEFAULT_MAX_DURATION_SECONDS, 600);
assert.deepEqual(VOICE_SETTINGS_NOT_SENT, { speed: 1.1, stability: 0.7, similarity_boost: 0.75 });
assert.match(TAKASE_INSTRUCTIONS, /178cm/);
assert.match(TAKASE_INSTRUCTIONS, /78kg/);
assert.match(TAKASE_INSTRUCTIONS, /160cm/);
assert.match(TAKASE_INSTRUCTIONS, /がっしりした筋肉質/);
assert.match(TAKASE_INSTRUCTIONS, /細マッチョではない/);
assert.match(TAKASE_INSTRUCTIONS, /肩幅がめっちゃ広い/);
assert.match(TAKASE_INSTRUCTIONS, /ハキハキしたテンポの良い口調/);
assert.doesNotMatch(TAKASE_INSTRUCTIONS, /70kg|75kg|急がない/);
const session = buildRealtimeSession();
assert.equal(Object.hasOwn(session, "voice"), false);
assert.equal(Object.hasOwn(session, "speed"), false);
assert.equal(session.audio.output.voice, DEFAULT_VOICE_ID);
assert.deepEqual(session.audio.input.format, { type: "audio/pcm", rate: 24000 });
assert.equal(session.audio.input.transcription.language, "ja");
assert.equal(session.audio.input.turn_detection.type, "semantic_vad");
assert.equal(session.audio.input.turn_detection.eagerness, "high");
assert.equal(session.audio.input.turn_detection.interrupt_response, true);
assert.equal(session.temperature, 0.7);
assert.equal(session.max_duration_seconds, 600);
assert.equal(session.model, "eleven_realtime_v1_mini");
assert.doesNotMatch(JSON.stringify(session), /stability|similarity_boost|voice_settings|style|"speed"/);
const tuned = buildRealtimeSession({
  model: "eleven_realtime_v1_max",
  temperature: 1.2,
  eagerness: "low",
  interruptResponse: false,
});
assert.equal(tuned.model, "eleven_realtime_v1_max");
assert.equal(tuned.temperature, 1.2);
assert.equal(tuned.audio.input.turn_detection.eagerness, "low");
assert.equal(tuned.audio.input.turn_detection.interrupt_response, false);
assert.equal(tuned.audio.input.transcription.language, "ja");
assert.equal(buildRealtimeSession({ temperature: 9, eagerness: "server_vad" }).temperature, 1.2);
assert.equal(buildRealtimeSession({ temperature: 0 }).temperature, 0.3);
assert.equal(buildRealtimeSession({ eagerness: "server_vad" }).audio.input.turn_detection.type, "semantic_vad");
assert.equal(buildRealtimeSession({ eagerness: "server_vad" }).audio.input.turn_detection.eagerness, "high");
const update = { type: "session.update", session: buildRealtimeSession("94gBdmmazJ025HbvF78b") };
assert.equal(update.session.audio.output.voice, "94gBdmmazJ025HbvF78b");
assert.equal(update.session.voice, undefined);
assert.match(app, /buildRealtimeSession\(options\)/);
assert.doesNotMatch(app, /buildRealtimeSession\(voice\)/);
assert.match(app, /type: "session.update"/);
assert.doesNotMatch(app, /session\.voice|voice: voice \|\| "brian"|brian|similarity_boost|voice_settings|stability/);
assert.match(html, /name="model"/);
assert.match(html, /eleven_realtime_v1_max/);
assert.match(html, /id="temperature"/);
assert.match(html, /min="0.3"/);
assert.match(html, /max="1.2"/);
assert.match(html, /name="eagerness"/);
assert.match(html, /value="high" checked/);
assert.match(html, /id="interrupt"/);
assert.doesNotMatch(html, /id="(speed|stability|similarity|style)"/);
assert.match(app, /localStorage/);
assert.doesNotMatch(`${html}\n${app}\n${TAKASE_INSTRUCTIONS}`, /sk-[A-Za-z0-9]{12,}|xi-[A-Za-z0-9]{12,}/);

console.log("audio and page checks ok");
