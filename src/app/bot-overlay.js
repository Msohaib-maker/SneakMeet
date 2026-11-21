import { els } from "./dom.js";
import { state } from "./state.js";
import { saveSettings } from "./settings.js";
import { botTalk, makeBodyBot, setBodyBotMood } from "../ui/bot-body.js";
import { isRowdy } from "../ui/persona.js";
import { CALM_FACE, memeFace } from "../ui/meme-faces.js";
import { speak, stopSpeaking } from "../ui/voice.js";

const MOOD = { cooldown: "sleep", capped: "sleep", off: "sleep", error: "error" };
let bot = null;
let spoke = false;

function say(text, head = "", face = null) {
  const b = els.botOverlayBubble;
  b.textContent = "";
  if (face && isRowdy()) b.appendChild(memeFace(face, { cls: "meme-sm" }));
  const words = document.createElement("div");
  if (head) {
    const h = document.createElement("b");
    h.textContent = head;
    words.appendChild(h);
  }
  words.appendChild(document.createTextNode(text));
  b.appendChild(words);
  b.hidden = false;
}

function greet() {
  say(isRowdy()
    ? "Yo boss. Tap the lil' bot on a card and I'll give ya the lowdown."
    : "Hi! Tap the bot on a participant's card and I'll summarise them here.");
}

export function renderBotOverlay() {
  const on = state.isHost && state.joined && els.showBot.checked;
  els.botOverlay.hidden = !on;
  if (on && !bot) {
    bot = makeBodyBot();
    els.botOverlayBot.appendChild(bot);
  }
  if (on && !spoke) greet();
}

export function botOverlayStatus() {
  if (!bot) return;
  const br = state.briefer;
  if (br?.busy) {
    if (!bot.classList.contains("talking")) setBodyBotMood(bot, "thinking");
    say(isRowdy() ? "Hold up, lemme take a puff and look at the numbers…" : "Looking at the readings…");
    return;
  }
  if (!bot.classList.contains("talking")) setBodyBotMood(bot, MOOD[br?.status] || "idle");
}

export function botOverlaySpeak(ids) {
  if (!bot || !ids.length) return;
  const id = ids[0];
  const m = state.dashboard?.getMember(id);
  const b = state.briefer?.latest(id);
  if (!m || !b) return;
  if (b.source !== "gemini") {
    const line = isRowdy() ? "Keep it rollin', boss. I'll have the lowdown shortly." : "I'll have a summary for you shortly.";
    say(line);
    speak(line, bot);
    return;
  }
  const calm = state.dashboard.stateOf(m);
  say(b.summary, `${m.name}: ${b.headline}${/[.!?]$/.test(b.headline) ? "" : "."} `, calm ? CALM_FACE[calm.id] : "neutral");
  spoke = true;
  botTalk(bot, 6000);
  speak(`${m.name}: ${b.headline}. ${b.summary}`, bot);
}

export function hideBotOverlay() {
  els.showBot.checked = false;
  saveSettings();
  renderBotOverlay();
}

export function showBotOverlay() {
  els.showBot.checked = true;
  saveSettings();
  renderBotOverlay();
}

export function destroyBotOverlay() {
  stopSpeaking();
  bot?.remove();
  bot = null;
  spoke = false;
  els.botOverlay.hidden = true;
  els.botOverlayBubble.hidden = true;
}
