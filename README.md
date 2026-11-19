# Presage Meet

Desktop video meetings (Windows, Electron) where participants can **opt in** to camera-based
wellness readings with the [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/docs/nodejs),
and a meeting **host** (a team lead, coach or clinician) can receive consented wellness reports with
short AI briefs.

Built for the [DEV.to Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04).

> Wellness information only. Not a medical device; no diagnosis.

## Features

- **Meetings:** peer-to-peer video and audio for up to 6 people per room (WebRTC).
- **On-device vitals:** pulse, breathing rate and HRV (RMSSD) from each person's own camera, plus face
  signals (face in frame, facing the screen, talking, blinks, expression scores). Everything is computed
  on that person's laptop by the SmartSpectra SDK.
- **Lobby scan:** a private HUD over your own preview to check lighting and readings before joining.
- **Host dashboard** (with consent): a compact report card per participant, a small scan readout on their
  video (visible to the host only), full reports with trend charts, and CSV/Markdown downloads.
- **"Pixel", the AI analyst:** every ~40 s the host's app turns the latest reports into a short brief
  per person (headline, summary, engagement estimate with reasons) using Google Gemini.
- **Simulated vitals** for demos and development, so testing doesn't spend SDK credits. Always labelled
  **SIMULATED**.

## Download (Windows)

1. Download `Presage-Meet-Setup-<version>.exe` from the
   [Releases page](https://github.com/Msohaib-maker/SneakMeet/releases) and run it.
   The installer is not code-signed, so Windows SmartScreen may warn you: choose
   **More info → Run anyway**.
2. Open **⚙ Settings**:
   - **SmartSpectra API key** for real vitals (free at https://physiology.presagetech.com/auth/register),
     or keep **Simulated vitals** on to try the app without one.
   - **Gemini API key** (host only, optional) from https://aistudio.google.com/apikey for AI briefs,
     or choose **Rule-based preview (no AI)**.
   - **Meeting server:** the `wss://…` address of a deployed signaling server (see below), or a
     `ws://<ip>:8787` address on your local network.
3. Enter your name and a room code (share it with the others) and join. Tick **Join as host** to receive
   wellness reports.

The installer contains **no API keys**. Each user enters their own.

## Run from source

Requires Node.js 22+ (on Node 20, if Electron's binary is missing after install, run
`node node_modules/electron/install.js`).

```
npm install
npm run server        # terminal 1: signaling server on ws://localhost:8787
npm start             # terminal 2: the app
npm run start:second  # optional: a second window to test a meeting alone (audio off, placeholder video)
```

Keys can go in ⚙ Settings or in a `.env` file (see `.env.example`):

```
SMARTSPECTRA_API_KEY=...
GEMINI_API_KEY=...
MEET_SERVER_URL=wss://your-server.example.com   # optional default meeting server
```

Build the Windows installer with `npm run dist` (output in `release/`). Release builds never include the
Gemini key, and include the SmartSpectra key only if `RELEASE_INCLUDE_SMARTSPECTRA_KEY=1` is set.
`MEET_SERVER_URL` from `.env` becomes the default meeting server.

### Testing switches (development only)

These environment variables exist for automated testing and are not reachable from the app UI:
`MEET_PROFILE` (separate second instance), `MEET_AUTOJOIN=room:name[:host]`, `MEET_AUTOCONSENT=1`
(auto-accepts the consent dialog in a test instance), `MEET_SIMULATED=0|1`.

## Deploy the meeting server

`server/` is a standalone Node app (only dependency: `ws`). It answers plain HTTP with a health message
and accepts WebSocket connections on the same port (`PORT` env var, default 8787).

Example (Render, Railway, Fly.io or any Node host):

- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`

Then use `wss://<your-service-host>` as the meeting server in the app.
Participants behind strict corporate networks may additionally need a TURN relay. The app uses
public STUN only.

## How it works

```
 Participant laptop                          Host laptop
 ┌────────────────────────────┐             ┌──────────────────────────────┐
 │ camera → SmartSpectra SDK  │  WebRTC     │ dashboard, report cards       │
 │ (on-device vitals + face)  │ ──────────► │ Pixel AI ──► Google Gemini    │
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
- **Signaling server:** relays connection setup (names, room codes, network offers). It never sees
  media, vitals or reports, and stores nothing.
- **STUN** (`stun.l.google.com`) is used only to discover network addresses for peer connections.

**AI processing (optional, host side)**
- If the host enables Gemini, the host's app sends the recent report numbers of consenting
  participants to Google's Gemini API about every 40 s. Participants are identified only as `P1`, `P2`…;
  **names and video are never sent**. The full report shows exactly what is sent ("Data sent to …").
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
