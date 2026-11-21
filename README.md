# BetterZoom

A Windows desktop app (Electron) for **solo practice** and **video meetings** with opt-in, camera-based
wellness readings from the [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/docs/nodejs)
and AI coaching from Google Gemini.

Built for the [DEV.to Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04).

> Wellness information only. Not a medical device; no diagnosis.

BetterZoom is split into **two modules**:

| Module | Who it's for | What it does |
|---|---|---|
| **Self mode** ("Practice solo") | One person, alone | Practise an interview, pitch, presentation or speech in front of your camera. An AI host watches your readings and coaches you live. |
| **Meetings** | 2–6 people, peer-to-peer | Normal video meetings. Participants can opt in to share wellness readings with the meeting host, who gets a minimal dashboard and on-demand AI summaries. |

Both modules use the same on-device readings from the SmartSpectra SDK: pulse, breathing rate, HRV,
breathing and pulse waveforms, heart-rhythm figures (average beat gap, SDNN, stress index), and face
signals (face in frame, facing the screen, talking, blinks, expressions).

## Module 1: Self mode

Open it from the lobby card **Practice solo**: pick a scenario (job interview, pitch, presentation,
public speaking, difficult conversation, or your own) and optionally add coaching instructions.

- **Your camera and the AI host side by side**, like a two-person call.
- **Three readings** (pulse, breathing, HRV), each compared with *your own* usual.
- **Calm meter:** Calm / Steady / Tense / Anxious, computed on your laptop from pulse and breathing
  against your own baseline, with the reason shown ("Pulse 74, near your baseline").
- **Breathing & heart:** live chest/belly breathing waves, pulse waveform, and heart-rhythm figures.
- **AI coach (Gemini):** every 30 s (or **Ask now**) it turns your numbers into one practical tip.
  The bot only speaks what Gemini writes; if Gemini is unavailable it says it will get back to you.
- **Debrief** at the end (headline, summary, strengths, things to work on, timeline), downloadable as
  Markdown.
- **Bot personality** (⚙ AI): *Normal* friendly coach, or *Humorous*: "Smokey", a rowdy cigar-chomping
  boxing-coach robot with meme faces for your expressions. Same advice, different delivery.
- **Voice:** the bot can read its messages aloud (Windows built-in voices, offline). Toggle **🔊 Voice**.

## Module 2: Meetings

Enter your name and a room code (share it with the others) and join. Tick **Join as host** to receive
wellness reports.

- **Video and audio** for up to 6 people per room (WebRTC, peer-to-peer).
- **Consent first:** when a meeting has a host, each participant is asked whether to send wellness
  reports to the host. Everyone sees a **Reporting to host** badge on a consenting participant's video,
  and they can stop at any time with **Report to host**.
- **Host dashboard (minimal by default):** one line per participant (Calm / Steady / Tense / Anxious) on
  their tile and card. Tap the participant's **bot** for a 3–4 line Gemini summary; tap **›** for the full
  report (trend charts, heart rhythm & breathing, engagement signals, expressions). CSV and Markdown
  downloads.
- **Floating bot** (host): stands over the video area and reads summaries out. Hide it with ✕.
- **My vitals:** each participant can measure privately, or **Share** live values with the room.
- Lobby scan, a decorative scanner on your own tile, and echo suppression for laptop speakers.

## Download and setup (Windows)

1. Download `BetterZoom-Setup-<version>.exe` from the
   [Releases page](https://github.com/Msohaib-maker/SneakMeet/releases) and run it.
   The installer is not code-signed, so Windows SmartScreen may warn you: choose
   **More info → Run anyway**.
2. That's it: **no API keys needed.** The BetterZoom server provides the SmartSpectra and Gemini access.
   Optional, in **⚙ Settings**:
   - **Vitals:** **Real readings** (default) or **Simulated** (demo numbers, labelled **SIMULATED**
     everywhere). You can paste your own SmartSpectra key (free at
     https://physiology.presagetech.com/auth/register) to use your own credits.
   - **AI:** bot personality, voice, and optionally your own Gemini key
     (https://aistudio.google.com/apikey).
   - **Meeting:** the `wss://…` address of the server. Everyone in a meeting must use the same one.
     The default is the project's public server.
3. **Self mode:** pick a scenario and press **Practice solo**. **Meetings:** enter a name and room code
   and press **Join**.

**How keys work:** the installer contains **no API keys**. They live on the server as secrets. Gemini
requests go through the server (`/api/gemini`), so the Gemini key never reaches users' computers. The
SmartSpectra SDK must be given its key on the device, so the app fetches it from the server
(`/api/sdk-key`) when measuring starts. The server rate-limits both. SmartSpectra usage is billed in
credits (1 credit = 30 s of measuring); measuring only runs while readings are on.

## Run from source

Requires Node.js 20+ on Windows (the SmartSpectra native library used here is win32-x64). On Node 20, if
Electron's binary is missing after install, run `node node_modules/electron/install.js`.

```
git clone https://github.com/Msohaib-maker/SneakMeet.git
cd SneakMeet
npm install
copy .env.example .env   # optional: put your keys here instead of in ⚙ Settings
npm start                # builds and opens the app
```

Optional:

```
npm run server        # local signaling server on ws://localhost:8787 (then set it in ⚙ Meeting)
npm run start:second  # a second window to test a meeting alone (audio off)
npm run sdk-test      # SDK metric test page (development only, uses credits)
```

`.env` keys (all optional, never committed):

```
SMARTSPECTRA_API_KEY=...
GEMINI_API_KEY=...
MEET_SERVER_URL=wss://your-server.example.com   # default meeting server
```

**Build the installer:** `npm run dist` (output: `release/BetterZoom-Setup-<version>.exe`). Release
builds never include the Gemini key, and include the SmartSpectra key only if
`RELEASE_INCLUDE_SMARTSPECTRA_KEY=1` is set.

Testing a meeting on one laptop runs two app windows plus the SDK at once and can trigger
"frame rate too low"; a real meeting (one person per computer) doesn't have that load. For best
readings use Windows **Power mode → Best performance**.

### Project structure

```
main.js            Electron main process (window, permissions, SDK native bridge)
index.html, styles.css
src/app/           renderer entry (index.js), lobby, settings, toolbar, meeting join/leave, consent
src/practice/      Self mode: session, live view, breathing & heart panel, debrief export
src/host/          Meetings host: dashboard, report window, AI summary panel
src/meeting/       WebRTC mesh and signaling client
src/vitals/        SmartSpectra wrapper, simulated vitals, calm meter, 25 s reports, waveforms
src/ai/            Gemini client, host summaries, Self mode coach
src/ui/            bot (body, voice, persona), meme faces, scan overlay, waveform drawing
src/media/         camera, microphone, echo suppression
server/            signaling server (Node + ws), Fly.io config
sdk-test/          SDK metric test page (development only)
```

### Testing switches (development only)

Environment variables for automated testing, not reachable from the app UI: `MEET_PROFILE` (separate
second instance), `MEET_AUTOJOIN=room:name[:host]`, `MEET_AUTOCONSENT=1`, `MEET_AUTOPRACTICE=1`,
`MEET_PERSONA=rowdy`, `MEET_SIMULATED=0|1`, `MEET_SHOTS=<dir>` (saves UI screenshots).

## Deploy the meeting server

`server/` is a standalone Node app (only dependency: `ws`). It answers plain HTTP with a health message
and accepts WebSocket connections on the same port (`PORT` env var, default 8787).

Example (Render, Railway, Fly.io or any Node host):

- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`

Then use `wss://<your-service-host>` as the meeting server in the app.

**Keys on the server (optional):** set them as secrets so app users need none.

```
cd server
fly secrets set GEMINI_API_KEY=... SMARTSPECTRA_API_KEY=...   # Fly.io (or your host's env vars)
fly deploy
```

Endpoints: `GET /api/status` (which keys are configured), `GET /api/sdk-key`, `POST /api/gemini`
(Gemini `generateContent` proxy, fixed model). Limits: 60 Gemini calls / 10 min and 20 key requests /
10 min per IP, `GEMINI_DAILY_CAP` (default 1500) calls per day in total. Without the secrets the
server works as a plain signaling server and users enter their own keys.
Participants behind strict corporate networks may additionally need a TURN relay. The app uses
public STUN only.

## How it works

```
 SELF MODE (one laptop)
 camera → SmartSpectra SDK → readings + calm meter → AI host ──► Google Gemini
                              (all on-device)                    (anonymous numbers only)

 MEETINGS
 Participant laptop                          Host laptop
 ┌────────────────────────────┐             ┌──────────────────────────────┐
 │ camera → SmartSpectra SDK  │  WebRTC     │ dashboard, report cards       │
 │ (on-device vitals + face)  │ ──────────► │ bot summary ──► Google Gemini │
 │ consent dialog, badge      │ peer-to-peer│ (anonymised numbers only)     │
 └────────────────────────────┘             └──────────────────────────────┘
              ▲  connection setup only (no media, no vitals)  ▲
              └──────────── signaling server (server/) ───────┘
```

## Camera consent and data handling

**Camera consent**
- The app asks Windows/Electron for camera and microphone access; only this app's own local page can
  use them (all other permission requests are denied).
- Measuring is **off by default**. Vitals are computed only after you click **Measure** (or the lobby
  **Start scan**), or after you accept a host's report request.
- When a meeting has a host, each participant sees a **consent dialog** naming the host and explaining
  what is sent, how often, to whom, the AI processing, and how to stop. Declining has no effect on the
  meeting.
- Transparency: everyone sees a **"Reporting to host"** badge on a consenting participant's video.
  Participants can stop at any time with **Report to host**. There is no covert or background monitoring.

**What is collected and where it goes**
- **Video and audio** go directly between participants (peer-to-peer, encrypted by WebRTC). They are
  never recorded or stored.
- **Vitals and face signals** are computed on each participant's own laptop. They leave it only if the
  participant chooses: **Share** (live values to everyone in the room) or **host reports** (live values
  plus a summary every ~25 s, to the host only). No images or video frames are ever sent with them.
- **BetterZoom server:** relays connection setup (names, room codes, network offers). It never sees
  media. When you use the server's AI (no Gemini key of your own), it relays the same anonymous numbers
  that go to Gemini (no names, no video) and returns Gemini's answer. It stores nothing.
- **STUN** (`stun.l.google.com`) is used only to discover network addresses for peer connections.

**AI processing (optional)**
- **Self mode:** with Gemini selected, your own recent numbers (no video, no name) are sent to Google's
  Gemini API every 30 s, when you press **Ask now**, and once for the debrief.
- **Meetings:** when the host taps a participant's bot, the host's app sends that participant's recent
  report numbers to Gemini. Participants are identified only as `P1`, `P2`…; **names and video are never
  sent**; the real name is put back on the host's laptop. The full report shows exactly what is sent.
- On Gemini's free tier, Google may use submitted data to improve its products; participants are told
  this in the consent dialog. Hosts can choose **Rule-based preview** (local, no network) or **Off**.

**Storage, retention and deletion**
- Reports and AI briefs exist only in the host's app memory and are discarded when the host leaves the
  meeting or closes the app. Nothing is stored on any server by this app.
- If the host downloads a CSV or report card, that file is stored wherever the host saves it and is the
  host's responsibility to protect and delete.
- The app stores only settings locally (API keys, name, preferences) in the app's local storage on that
  computer. Uninstalling the app or clearing its data removes them.

**SDK telemetry**
- The SmartSpectra SDK authenticates with Presage using the API key, and sends session telemetry by
  default. See Presage's [Telemetry and Privacy](https://smartspectra.presagetech.com/docs/telemetry-and-privacy)
  documentation for exactly what is included.

**Not medical**
- All values are wellness estimates. The app makes no diagnosis or treatment claims and must not be used
  for medical decisions. Engagement and expression signals are estimates from camera data, not facts
  about a person's attention or feelings.

## Getting good readings

- At least 25 fps is required. **Lock exposure** keeps the camera at 30 fps (the image may be darker).
- Light your face evenly (desk lamp, or ⚙ **Screen light**), sit still, and face the camera.
- Warm-up: pulse ~12 s, breathing ~30 s, HRV ~60 s (HRV needs good signal quality). Talking disturbs
  breathing readings.

## Credits

- [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/) (`@smartspectra/node-sdk`):
  on-device vitals and face signals. Used under its own license; see its package for terms and
  third-party notices.
- [Electron](https://www.electronjs.org/), [electron-builder](https://www.electron.build/),
  [esbuild](https://esbuild.github.io/), [ws](https://github.com/websockets/ws).
- [Google Gemini API](https://ai.google.dev/) for AI briefs.
- Built with help from Claude Code (Anthropic).

## License

MIT for this project's code (see [LICENSE](LICENSE)). The SmartSpectra SDK and other dependencies keep
their own licenses.
