import { makeBot, setBotMood } from '../host/host-ai.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function makeBodyBot(mood = 'idle') {
  const wrap = el('div', 'bodybot');
  const head = makeBot(mood);
  head.className = 'bb-head';
  const body = el('div', 'bb-body');
  const screen = el('div', 'bb-screen');
  screen.innerHTML = '<svg viewBox="0 0 40 16"><polyline points="0,9 10,9 13,3 17,14 21,6 24,9 40,9"/></svg>';
  body.appendChild(screen);
  const legs = el('div', 'bb-legs');
  legs.append(el('i', 'bb-leg'), el('i', 'bb-leg'));
  wrap.append(head, el('i', 'bb-arm l'), el('i', 'bb-arm r'), body, legs);
  wrap._head = head;
  return wrap;
}

export function setBodyBotMood(wrap, mood) {
  if (!wrap?._head) return;
  clearTimeout(wrap._talkTimer);
  wrap.classList.toggle('talking', false);
  setBotMood(wrap._head, mood);
}

export function botTalk(wrap, ms = 3500) {
  if (!wrap?._head) return;
  setBotMood(wrap._head, 'happy');
  wrap.classList.add('talking');
  clearTimeout(wrap._talkTimer);
  wrap._talkTimer = setTimeout(() => {
    wrap.classList.remove('talking');
    setBotMood(wrap._head, 'idle');
  }, ms);
}
