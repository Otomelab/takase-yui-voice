// Optional local token server.
// The static page can mint a client secret in the browser (ElevenLabs returns
// Access-Control-Allow-Origin: *). Use this only when that browser call is blocked.
//
//   ELEVENLABS_API_KEY=... node optional-token-server/server.mjs
//
// Then set トークン取得 URL to http://127.0.0.1:8787/token
// Do not commit the API key. Do not expose this process to the public internet.

import http from "node:http";
import { DEFAULT_VOICE_ID } from "../docs/config.js";
import { buildRealtimeSession } from "../docs/session.js";

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY を環境変数で渡してください。ファイルや Git には書かないでください。");
  process.exit(1);
}

const port = Number(process.env.PORT || 8787);
const voice = process.env.ELEVENLABS_VOICE || DEFAULT_VOICE_ID;
const allowOrigin = process.env.ALLOW_ORIGIN || "*";

const payload = JSON.stringify({
  session: buildRealtimeSession(voice),
  expires_after: { anchor: "created_at", seconds: 600 },
});

const server = http.createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", allowOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  const path = (request.url || "").split("?")[0];
  if (request.method !== "GET" || path !== "/token") {
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not found" }));
    return;
  }
  try {
    const upstream = await fetch("https://api.elevenlabs.io/v1/convai/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: payload,
      signal: AbortSignal.timeout(20000),
    });
    const text = await upstream.text();
    response.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(text);
  } catch (error) {
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}/token`);
});
