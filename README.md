# slot-018 — 由衣ちゃんと話す（音声チャット）

slot-060（高瀬さんアプリ）のエンジンを流用した、小野寺由衣（由衣ちゃん）と声で話すブラウザアプリ。

- 本体: `docs/`（静的サイト）。ローカルで `python3 -m http.server -d docs 8000` → http://localhost:8000
- 既定: **Gemini Live**、モデル gemini-3.1-flash-live-preview、声 Leda、temperature 0.90、応答の積極性 high（初回訪問時＝localStorage なし）。ElevenLabs Realtime モードも切替で残しています。
- Gemini の声: 既定 **Leda**。選択肢 Zephyr / Leda / Aoede / Kore。
- ペルソナ: `docs/persona.js` の `YUI_INSTRUCTIONS`。slot-096 の設定資料と slot-097 の由衣のセリフのみから作成（作られた経歴なし）。
- 呼び方: 相手は基本「高瀬さん」、ときどき「わたるさん」（フルネームは高瀬わたる、ひらがな表記）。
- 画像: slot-097 の `yui_main.png` と表情差分。
- API キーはブラウザの localStorage にだけ保存。リポジトリには入れません。

リポジトリは **Private** のまま。Pages は未設定（公開していません）。
