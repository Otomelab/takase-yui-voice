import {
  DEFAULT_EAGERNESS,
  DEFAULT_INTERRUPT,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_VOICE_ID,
} from "./config.js";
import { buildRealtimeSession } from "./session.js";
import {
  TARGET_RATE,
  base64ToBytes,
  bytesToBase64,
  concatFloat32,
  floatToPcm16,
  pcm16BytesToFloat32,
  resampleLinear,
} from "./audio-util.js";
import {
  GEMINI_DEFAULT_MODEL, GEMINI_DEFAULT_VOICE,
  GEMINI_INPUT_RATE,
  buildGeminiSetup,
  geminiAudioMessage,
  geminiUrl,
} from "./gemini.js";

const STORAGE_KEY = "slot018.elevenlabsApiKey";
const VOICE_KEY = "slot018.voice";
const TOKEN_URL_KEY = "slot018.tokenUrl";
const MODEL_KEY = "slot018.model";
const TEMPERATURE_KEY = "slot018.temperature";
const EAGERNESS_KEY = "slot018.eagerness";
const INTERRUPT_KEY = "slot018.interrupt";
const PROVIDER_KEY = "slot018.provider";
const GEMINI_KEY = "slot018.geminiKey";
const GEMINI_MODEL_KEY = "slot018.geminiModel";
const GEMINI_VOICE_KEY = "slot018.geminiVoice";
const CLIENT_SECRET_URL = "https://api.elevenlabs.io/v1/convai/realtime/client_secrets";
const SEND_SAMPLES = 2400;

const ui = {
  connect: document.querySelector("#connect-button"),
  status: document.querySelector("#status"),
  error: document.querySelector("#error"),
  transcript: document.querySelector("#transcript"),
  apiKey: document.querySelector("#api-key"),
  geminiKey: document.querySelector("#gemini-key"),
  geminiModel: document.querySelector("#gemini-model"),
  geminiVoice: document.querySelector("#gemini-voice"),
  voice: document.querySelector("#voice"),
  tokenUrl: document.querySelector("#token-url"),
  temperature: document.querySelector("#temperature"),
  temperatureValue: document.querySelector("#temperature-value"),
  interrupt: document.querySelector("#interrupt"),
  clear: document.querySelector("#clear-key"),
  sprite: document.querySelector("#sprite"),
  speakSeal: document.querySelector("#speak-seal"),
};

const state = {
  ws: null,
  audioContext: null,
  mediaStream: null,
  worklet: null,
  player: null,
  pending: new Float32Array(0),
  inputRate: TARGET_RATE,
  assistantBubble: null,
  userBubble: null,
  closing: false,
  provider: "elevenlabs",
};

function currentProvider() {
  const selected = document.querySelector("input[name='provider']:checked");
  return selected?.value === "elevenlabs" ? "elevenlabs" : "gemini";
}

function showProvider() {
  const gemini = currentProvider() === "gemini";
  document.querySelectorAll(".gemini-only").forEach((el) => { el.hidden = !gemini; });
  document.querySelectorAll(".eleven-only").forEach((el) => { el.hidden = gemini; });
}

function currentVoiceId() {
  return ui.voice.value.trim() || DEFAULT_VOICE_ID;
}

function currentModel() {
  const selected = document.querySelector("input[name='model']:checked");
  return selected && selected.value === "eleven_realtime_v1_max"
    ? "eleven_realtime_v1_max"
    : DEFAULT_MODEL;
}

function currentEagerness() {
  const selected = document.querySelector("input[name='eagerness']:checked");
  return ["low", "medium", "high"].includes(selected?.value) ? selected.value : DEFAULT_EAGERNESS;
}

function sessionOptions() {
  return {
    voiceId: currentVoiceId(),
    model: currentModel(),
    temperature: ui.temperature.value,
    eagerness: currentEagerness(),
    interruptResponse: ui.interrupt.checked,
  };
}

function showTemperature(value) {
  const number = Number(value);
  ui.temperatureValue.textContent = Number.isFinite(number) ? number.toFixed(2) : String(DEFAULT_TEMPERATURE);
}

function collectText(value, into) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) into.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, into));
    return;
  }
  if (value && typeof value === "object") {
    ["message", "msg", "detail", "error", "code", "type"].forEach((key) => {
      if (key in value) collectText(value[key], into);
    });
  }
}

function describeError(payload) {
  const parts = [];
  collectText(payload, parts);
  return [...new Set(parts)].join("\n");
}

function setError(message) {
  ui.error.textContent = message || "";
  ui.error.hidden = !message;
}

function setStatus(text) {
  ui.status.textContent = text;
}

function setSpeaking(on) {
  ui.sprite.classList.toggle("is-speaking", on);
  ui.speakSeal.classList.toggle("is-speaking", on);
  if (!on && state.ws && state.ws.readyState === WebSocket.OPEN && ui.status.textContent === "由衣ちゃんが話しています") {
    setStatus("接続中");
  }
}

function loadSettings() {
  ui.apiKey.value = localStorage.getItem(STORAGE_KEY) || "";
  ui.geminiKey.value = localStorage.getItem(GEMINI_KEY) || "";
  ui.geminiModel.value = localStorage.getItem(GEMINI_MODEL_KEY) || GEMINI_DEFAULT_MODEL;
  if (!ui.geminiModel.value) ui.geminiModel.value = GEMINI_DEFAULT_MODEL;
  ui.geminiVoice.value = localStorage.getItem(GEMINI_VOICE_KEY) || GEMINI_DEFAULT_VOICE;
  const provider = localStorage.getItem(PROVIDER_KEY) === "elevenlabs" ? "elevenlabs" : "gemini";
  const providerInput = document.querySelector(`input[name='provider'][value='${provider}']`);
  if (providerInput) providerInput.checked = true;
  showProvider();
  ui.voice.value = localStorage.getItem(VOICE_KEY) || DEFAULT_VOICE_ID;
  ui.tokenUrl.value = localStorage.getItem(TOKEN_URL_KEY) || "";
  const model = localStorage.getItem(MODEL_KEY) === "eleven_realtime_v1_max"
    ? "eleven_realtime_v1_max"
    : DEFAULT_MODEL;
  const modelInput = document.querySelector(`input[name='model'][value='${model}']`);
  if (modelInput) modelInput.checked = true;
  const temperature = localStorage.getItem(TEMPERATURE_KEY);
  ui.temperature.value = temperature || String(DEFAULT_TEMPERATURE);
  showTemperature(ui.temperature.value);
  const eagerness = ["low", "medium", "high"].includes(localStorage.getItem(EAGERNESS_KEY))
    ? localStorage.getItem(EAGERNESS_KEY)
    : DEFAULT_EAGERNESS;
  const eagernessInput = document.querySelector(`input[name='eagerness'][value='${eagerness}']`);
  if (eagernessInput) eagernessInput.checked = true;
  const interrupt = localStorage.getItem(INTERRUPT_KEY);
  ui.interrupt.checked = interrupt === null ? DEFAULT_INTERRUPT : interrupt === "true";
}

function saveSettings() {
  const key = ui.apiKey.value.trim();
  const voice = currentVoiceId();
  const tokenUrl = ui.tokenUrl.value.trim();
  if (key) localStorage.setItem(STORAGE_KEY, key);
  else localStorage.removeItem(STORAGE_KEY);
  localStorage.setItem(VOICE_KEY, voice);
  if (tokenUrl) localStorage.setItem(TOKEN_URL_KEY, tokenUrl);
  else localStorage.removeItem(TOKEN_URL_KEY);
  localStorage.setItem(MODEL_KEY, currentModel());
  localStorage.setItem(TEMPERATURE_KEY, ui.temperature.value);
  localStorage.setItem(EAGERNESS_KEY, currentEagerness());
  localStorage.setItem(INTERRUPT_KEY, String(ui.interrupt.checked));
  const geminiKey = ui.geminiKey.value.trim();
  if (geminiKey) localStorage.setItem(GEMINI_KEY, geminiKey);
  else localStorage.removeItem(GEMINI_KEY);
  localStorage.setItem(GEMINI_MODEL_KEY, ui.geminiModel.value);
  if (ui.geminiVoice.value.trim()) localStorage.setItem(GEMINI_VOICE_KEY, ui.geminiVoice.value.trim());
  else localStorage.removeItem(GEMINI_VOICE_KEY);
  localStorage.setItem(PROVIDER_KEY, currentProvider());
  ui.voice.value = voice;
  showTemperature(ui.temperature.value);
}

function clearKey() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(GEMINI_KEY);
  ui.apiKey.value = "";
  ui.geminiKey.value = "";
  if (state.ws) disconnect();
  setStatus("未接続");
  setError("このブラウザに保存していた API キーを削除しました。");
}

function addBubble(role, text) {
  const empty = ui.transcript.querySelector(".empty");
  if (empty) empty.remove();
  const item = document.createElement("article");
  item.className = `bubble ${role}`;
  const image = document.createElement("img");
  if (role === "user") {
    image.src = "assets/expressions/takase/02_笑顔.png";
    image.alt = "高瀬さん";
  } else {
    image.src = "assets/expressions/yui/training_expression_02.png";
    image.alt = "由衣ちゃん";
  }
  const body = document.createElement("p");
  body.textContent = text;
  item.append(image, body);
  ui.transcript.append(item);
  ui.transcript.scrollTop = ui.transcript.scrollHeight;
  return body;
}

function ensureAssistant() {
  if (!state.assistantBubble) state.assistantBubble = addBubble("assistant", "");
  return state.assistantBubble;
}

function appendAssistant(text) {
  if (!text) return;
  const body = ensureAssistant();
  body.dataset.raw = (body.dataset.raw || "") + text;
  body.textContent = stripTags(body.dataset.raw);
  ui.transcript.scrollTop = ui.transcript.scrollHeight;
}

function ensureUser() {
  if (!state.userBubble) state.userBubble = addBubble("user", "");
  return state.userBubble;
}

class PcmPlayer {
  constructor(context) {
    this.context = context;
    this.nextTime = 0;
    this.sources = new Set();
    this.generation = 0;
  }

  enqueue(bytes) {
    const floats = pcm16BytesToFloat32(bytes);
    if (!floats.length) return;
    const generation = this.generation;
    const buffer = this.context.createBuffer(1, floats.length, TARGET_RATE);
    buffer.getChannelData(0).set(floats);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const startAt = Math.max(this.context.currentTime + 0.04, this.nextTime);
    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
    this.sources.add(source);
    setSpeaking(true);
    source.onended = () => {
      this.sources.delete(source);
      if (generation === this.generation && this.sources.size === 0) setSpeaking(false);
    };
  }

  stop() {
    this.generation += 1;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    this.nextTime = 0;
    setSpeaking(false);
  }
}

async function mintClientSecret(apiKey, options) {
  let response;
  try {
    response = await fetch(CLIENT_SECRET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        session: buildRealtimeSession(options),
        expires_after: { anchor: "created_at", seconds: 600 },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    throw new Error(
      `ブラウザから client secret を発行できませんでした（${error.message}）。CORS で止められている場合は、README の任意トークンサーバーを使い、設定の「トークン取得 URL」にそのアドレスを入れてください。`,
    );
  }
  const raw = await response.text();
  let payload = raw;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = raw;
  }
  if (!response.ok) {
    throw new Error(describeError(payload) || `client secret の発行に失敗しました（HTTP ${response.status}）`);
  }
  if (!payload || typeof payload.value !== "string" || !payload.value) {
    throw new Error("client secret の value が応答にありません。");
  }
  return payload.value;
}

async function fetchEphemeralToken(tokenUrl) {
  let response;
  try {
    response = await fetch(tokenUrl, { method: "GET" });
  } catch (error) {
    throw new Error(`トークン取得 URL に接続できませんでした（${error.message}）`);
  }
  const raw = await response.text();
  let payload = raw;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = raw;
  }
  if (!response.ok) {
    throw new Error(describeError(payload) || `トークン取得に失敗しました（HTTP ${response.status}）`);
  }
  const value = payload.value || payload.token || payload.client_secret;
  if (!value) throw new Error("トークン取得 URL の応答に value がありません。");
  return value;
}

function handleServerEvent(event) {
  switch (event.type) {
    case "error":
      setError(describeError(event) || "Realtime API エラー");
      setStatus("エラー");
      break;
    case "input_audio_buffer.speech_started":
      state.player?.stop();
      state.assistantBubble = null;
      state.userBubble = null;
      setStatus("由衣さんの声を聞いています");
      break;
    case "input_audio_buffer.speech_stopped":
      setStatus("由衣ちゃんが考えています");
      break;
    case "conversation.item.input_audio_transcription.delta":
      ensureUser().textContent += event.delta || "";
      ui.transcript.scrollTop = ui.transcript.scrollHeight;
      break;
    case "conversation.item.input_audio_transcription.completed":
      ensureUser().textContent = event.transcript || ensureUser().textContent;
      state.userBubble = null;
      break;
    case "response.output_audio.delta":
    case "response.audio.delta":
      if (event.delta) state.player?.enqueue(base64ToBytes(event.delta));
      setStatus("由衣ちゃんが話しています");
      break;
    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta":
    case "response.output_text.delta":
      appendAssistant(event.delta || "");
      break;
    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done":
      if (event.transcript) ensureAssistant().textContent = stripTags(event.transcript);
      break;
    case "response.done":
      state.assistantBubble = null;
      if (ui.status.textContent === "由衣ちゃんが考えています") setStatus("接続中");
      break;
    default:
      break;
  }
}

function sendAudioChunk(samples) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN || samples.length === 0) return;
  const pcm = floatToPcm16(samples);
  state.ws.send(JSON.stringify({
    type: "input_audio_buffer.append",
    audio: bytesToBase64(new Uint8Array(pcm)),
  }));
}

function onMicSamples(samples) {
  if (state.provider === "gemini") {
    const down = resampleLinear(samples, state.inputRate, GEMINI_INPUT_RATE);
    state.pending = concatFloat32(state.pending, down);
    const chunk = GEMINI_INPUT_RATE / 10;
    while (state.pending.length >= chunk) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        const pcm = floatToPcm16(state.pending.subarray(0, chunk));
        state.ws.send(JSON.stringify(geminiAudioMessage(bytesToBase64(new Uint8Array(pcm)))));
      }
      state.pending = state.pending.slice(chunk);
    }
    return;
  }
  const resampled = resampleLinear(samples, state.inputRate, TARGET_RATE);
  state.pending = concatFloat32(state.pending, resampled);
  while (state.pending.length >= SEND_SAMPLES) {
    sendAudioChunk(state.pending.subarray(0, SEND_SAMPLES));
    state.pending = state.pending.slice(SEND_SAMPLES);
  }
}

async function startMicrophone() {
  state.mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
    video: false,
  });
  await state.audioContext.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
  const source = state.audioContext.createMediaStreamSource(state.mediaStream);
  state.inputRate = state.audioContext.sampleRate;
  state.worklet = new AudioWorkletNode(state.audioContext, "pcm-capture");
  state.worklet.port.onmessage = (message) => onMicSamples(message.data);
  source.connect(state.worklet);
}

function stopMicrophone() {
  state.worklet?.disconnect();
  state.worklet = null;
  state.mediaStream?.getTracks().forEach((track) => track.stop());
  state.mediaStream = null;
  state.pending = new Float32Array(0);
}

function handleGeminiMessage(msg) {
  if (msg.error) {
    setError(describeError(msg.error) || "Gemini Live エラー");
    setStatus("エラー");
    return;
  }
  if (msg.setupComplete) {
    setStatus("接続中（Gemini）。マイクで由衣さんとして話しかけてください");
    return;
  }
  if (msg.goAway) setError("Gemini のセッションがまもなく終了します。接続し直してください。");
  const sc = msg.serverContent;
  if (!sc) return;
  if (sc.interrupted) {
    state.player?.stop();
    state.assistantBubble = null;
  }
  if (sc.inputTranscription?.text) {
    const body = ensureUser();
    body.textContent += sc.inputTranscription.text;
    ui.transcript.scrollTop = ui.transcript.scrollHeight;
  }
  for (const part of sc.modelTurn?.parts || []) {
    if (part.inlineData?.data && String(part.inlineData.mimeType || "audio/pcm").startsWith("audio/")) {
      state.userBubble = null;
      state.player?.enqueue(base64ToBytes(part.inlineData.data));
      setStatus("由衣ちゃんが話しています");
    }
  }
  if (sc.outputTranscription?.text) {
    state.userBubble = null;
    appendAssistant(sc.outputTranscription.text);
  }
  if (sc.turnComplete) {
    state.assistantBubble = null;
    state.userBubble = null;
  }
}

async function connectGemini() {
  const apiKey = ui.geminiKey.value.trim();
  if (!apiKey) {
    setError("設定に Gemini の API キーを入力してください。キーはこのブラウザの localStorage にだけ保存されます。");
    return;
  }
  ui.connect.disabled = true;
  setStatus("Gemini に接続しています");
  try {
    state.provider = "gemini";
    state.audioContext = new AudioContext();
    await state.audioContext.resume();
    state.player = new PcmPlayer(state.audioContext);
    state.closing = false;
    const socket = new WebSocket(geminiUrl(apiKey));
    state.ws = socket;
    socket.addEventListener("open", async () => {
      socket.send(JSON.stringify(buildGeminiSetup({
        model: ui.geminiModel.value,
        voice: ui.geminiVoice.value,
        temperature: ui.temperature.value,
      })));
      try {
        await startMicrophone();
      } catch (error) {
        setError(`マイクを開始できませんでした。${error.message}`);
        setStatus("マイクエラー");
      }
      ui.connect.disabled = false;
      ui.connect.textContent = "切断する";
      ui.connect.dataset.mode = "disconnect";
    });
    socket.addEventListener("message", async (message) => {
      let text = message.data;
      if (typeof text !== "string") text = await text.text();
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      handleGeminiMessage(msg);
    });
    socket.addEventListener("error", () => {
      setError("Gemini への WebSocket 接続でエラーが起きました。API キーとネットワークを確認してください。");
      setStatus("エラー");
    });
    socket.addEventListener("close", (closeEvent) => {
      if (!state.closing && /credit|depleted|api key|permission|invalid|unauthenticated/i.test(closeEvent.reason || "")) {
        localStorage.removeItem(GEMINI_KEY);
        ui.geminiKey.value = "";
        setError("この Gemini キーは使えません（残高切れか無効なキー）。保存していたキーは消しました。設定に新しいキーを貼ってから接続してください。");
        setStatus("キーが必要です");
      } else if (!state.closing) {
        setError(`接続が閉じました（${[closeEvent.code, closeEvent.reason].filter(Boolean).join(" ") || "理由なし"}）`);
        setStatus("切断されました");
      } else {
        setStatus("未接続");
      }
      cleanupAudio();
      ui.connect.disabled = false;
      ui.connect.textContent = "接続する";
      ui.connect.dataset.mode = "connect";
      state.ws = null;
    });
  } catch (error) {
    setError(error.message || String(error));
    setStatus("エラー");
    cleanupAudio();
    ui.connect.disabled = false;
  }
}

async function connect() {
  saveSettings();
  if (currentProvider() === "gemini") {
    setError("");
    return connectGemini();
  }
  state.provider = "elevenlabs";
  setError("");
  const apiKey = ui.apiKey.value.trim();
  const options = sessionOptions();
  const tokenUrl = ui.tokenUrl.value.trim();
  if (!apiKey && !tokenUrl) {
    setError("設定に ElevenLabs の API キーを入力してください。キーはこのブラウザの localStorage にだけ保存されます。");
    return;
  }

  ui.connect.disabled = true;
  setStatus("接続しています");
  try {
    state.audioContext = new AudioContext();
    await state.audioContext.resume();
    state.player = new PcmPlayer(state.audioContext);
    const secret = tokenUrl
      ? await fetchEphemeralToken(tokenUrl)
      : await mintClientSecret(apiKey, options);
    state.closing = false;
    const socket = new WebSocket(
      `wss://api.elevenlabs.io/v1/convai/realtime?model=${encodeURIComponent(options.model)}`,
      [
      "realtime",
      `openai-insecure-api-key.${secret}`,
      "openai-agents-sdk.0.21.0",
    ]);
    state.ws = socket;
    socket.addEventListener("open", async () => {
      socket.send(JSON.stringify({
        type: "session.update",
        session: buildRealtimeSession(options),
      }));
      try {
        await startMicrophone();
        setStatus("接続中。マイクで由衣さんとして話しかけてください");
      } catch (error) {
        setError(`マイクを開始できませんでした。${error.message}`);
        setStatus("マイクエラー");
      }
      ui.connect.disabled = false;
      ui.connect.textContent = "切断する";
      ui.connect.dataset.mode = "disconnect";
    });
    socket.addEventListener("message", (message) => {
      let event;
      try {
        event = JSON.parse(message.data);
      } catch {
        setError("サーバーから JSON でないメッセージが届きました。");
        return;
      }
      handleServerEvent(event);
    });
    socket.addEventListener("error", () => {
      setError(`WebSocket 接続でエラーが起きました。API キー、モデル ${options.model}、ネットワークを確認してください。`);
      setStatus("エラー");
    });
    socket.addEventListener("close", (closeEvent) => {
      const reason = [closeEvent.code, closeEvent.reason].filter(Boolean).join(" ");
      if (!state.closing) {
        setError(describeError(closeEvent.reason) || `接続が閉じました（${reason || "理由なし"}）`);
        setStatus("切断されました");
      } else {
        setStatus("未接続");
      }
      cleanupAudio();
      ui.connect.disabled = false;
      ui.connect.textContent = "接続する";
      ui.connect.dataset.mode = "connect";
      state.ws = null;
    });
  } catch (error) {
    setError(error.message || String(error));
    setStatus("エラー");
    cleanupAudio();
    ui.connect.disabled = false;
  }
}

function cleanupAudio() {
  stopMicrophone();
  state.player?.stop();
  state.player = null;
  if (state.audioContext) {
    state.audioContext.close().catch(() => {});
    state.audioContext = null;
  }
  setSpeaking(false);
}

function disconnect() {
  state.closing = true;
  state.ws?.close(1000, "client disconnect");
  cleanupAudio();
  state.ws = null;
  ui.connect.textContent = "接続する";
  ui.connect.dataset.mode = "connect";
  ui.connect.disabled = false;
  setStatus("未接続");
}

ui.temperature.addEventListener("input", () => showTemperature(ui.temperature.value));

document.querySelector("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  saveSettings();
  setError("");
  setStatus(ui.apiKey.value.trim() ? "API キーをこのブラウザに保存しました" : "API キーは空です");
});

ui.clear.addEventListener("click", clearKey);
document.querySelectorAll("input[name='provider']").forEach((el) => el.addEventListener("change", showProvider));

ui.connect.addEventListener("click", () => {
  if (ui.connect.dataset.mode === "disconnect") disconnect();
  else connect();
});

loadSettings();
setStatus("未接続");

function stripTags(s) {
  return s.replace(/\[[^\]\n]{0,30}\]\s*/g, "").replace(/\[[^\]\n]{0,30}$/, "");
}
