import { isRowdy } from './persona.js';
import { botTalk } from './bot-body.js';

const KEY = 'botVoice';
const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function voiceOn() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setVoiceOn(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  if (!on) stopSpeaking();
}

function pickVoice(rowdy) {
  const all = speechSynthesis.getVoices();
  const en = all.filter((v) => /^en/i.test(v.lang));
  const deep = en.find((v) => /david|guy|mark|george|ryan|male/i.test(v.name));
  const soft = en.find((v) => /zira|aria|jenny|hazel|susan|female/i.test(v.name));
  return (rowdy ? deep : soft) || en[0] || all[0] || null;
}

export function speak(text, bot) {
  if (!voiceOn() || !supported() || !text) return;
  speechSynthesis.cancel();
  const rowdy = isRowdy();
  const u = new SpeechSynthesisUtterance(String(text).slice(0, 600));
  const v = pickVoice(rowdy);
  if (v) u.voice = v;
  u.rate = rowdy ? 1.08 : 1;
  u.pitch = rowdy ? 0.65 : 1.05;
  if (bot) {
    u.onstart = () => botTalk(bot, Math.max(2500, text.length * 70));
  }
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (supported()) speechSynthesis.cancel();
}

if (supported()) speechSynthesis.getVoices();
