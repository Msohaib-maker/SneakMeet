const INK = '#1b1b1b';
const YELLOW = '#ffd84d';

const eyesDot = '<circle cx="36" cy="42" r="4.5"/><circle cx="64" cy="42" r="4.5"/>';
const bigEyes = (dx = 0) => `<circle cx="35" cy="40" r="10" fill="#fff"/><circle cx="65" cy="40" r="10" fill="#fff"/>
  <circle cx="${35 + dx}" cy="41" r="3.5"/><circle cx="${65 + dx}" cy="41" r="3.5"/>`;
const happyEyes = '<path d="M27 43 Q35 31 43 43" fill="none"/><path d="M57 43 Q65 31 73 43" fill="none"/>';
const sweat = '<path d="M80 22 Q86 33 80 37 Q74 33 80 22Z" fill="#7cd3ff" stroke-width="2.5"/>';

const FACES = {
  happy: { fill: YELLOW, caption: 'VIBING', svg: `${happyEyes}
    <path d="M25 57 Q50 94 75 57Z" fill="${INK}"/><path d="M31 60 L69 60 L66 66 L34 66Z" fill="#fff" stroke="none"/>
    <path d="M40 79 Q50 72 60 79 Q50 86 40 79Z" fill="#ff6b8b" stroke="none"/>
    <ellipse cx="22" cy="58" rx="6" ry="3.5" fill="#ff8fa8" stroke="none"/><ellipse cx="78" cy="58" rx="6" ry="3.5" fill="#ff8fa8" stroke="none"/>` },
  neutral: { fill: YELLOW, caption: '...OK', svg: `${eyesDot}<path d="M34 67 L66 67" fill="none"/>` },
  surprise: { fill: YELLOW, caption: 'WAIT, WHAT', svg: `${bigEyes()}
    <path d="M22 24 Q35 16 46 23" fill="none"/><path d="M54 23 Q65 16 78 24" fill="none"/>
    <ellipse cx="50" cy="72" rx="8" ry="11" fill="${INK}"/>` },
  sad: { fill: YELLOW, caption: 'PAIN', svg: `<path d="M27 40 Q35 47 43 40" fill="none"/><path d="M57 40 Q65 47 73 40" fill="none"/>
    <path d="M34 46 L33 90" stroke="#4fb3ff" stroke-width="5" fill="none"/><path d="M66 46 L67 90" stroke="#4fb3ff" stroke-width="5" fill="none"/>
    <path d="M36 74 Q50 60 64 74" fill="none"/>` },
  angry: { fill: '#ff6b5b', caption: 'BRUH', svg: `<path d="M22 30 L44 40" fill="none" stroke-width="5"/><path d="M78 30 L56 40" fill="none" stroke-width="5"/>
    ${eyesDot}<rect x="32" y="62" width="36" height="14" rx="3" fill="#fff"/>
    <path d="M41 62 L41 76 M50 62 L50 76 M59 62 L59 76 M32 69 L68 69" fill="none" stroke-width="2.5"/>
    <path d="M10 18 q4 -6 0 -12 M90 18 q-4 -6 0 -12" fill="none" stroke="#aaa" stroke-width="3"/>` },
  fear: { fill: '#bfe3ff', caption: 'SWEATING', svg: `${bigEyes(0)}
    <path d="M30 72 L37 67 L44 73 L51 67 L58 73 L65 67 L70 72" fill="none"/>${sweat}` },
  disgust: { fill: '#9be36b', caption: 'EWW', svg: `<path d="M27 40 L43 44" fill="none"/><path d="M73 40 L57 44" fill="none"/>
    <path d="M32 66 Q50 58 68 66" fill="none"/><path d="M44 66 Q50 86 56 66Z" fill="#ff6b8b"/>` },
  contempt: { fill: YELLOW, caption: 'SURE, BUDDY', svg: `<path d="M25 30 Q35 22 45 30" fill="none"/><path d="M56 36 L76 36" fill="none"/>
    <path d="M27 44 L43 44" fill="none"/><circle cx="40" cy="44" r="3.5"/><path d="M57 44 L73 44" fill="none"/><circle cx="70" cy="44" r="3.5"/>
    <path d="M36 70 Q56 74 68 60" fill="none"/>` },
  cool: { fill: YELLOW, caption: 'CHILL', svg: `<path d="M18 36 L82 36 L78 50 Q70 56 60 50 L54 40 L46 40 L40 50 Q30 56 22 50Z" fill="${INK}"/>
    <path d="M25 40 L33 40" stroke="#fff" stroke-width="2.5" fill="none"/><path d="M34 66 Q50 78 66 64" fill="none"/>` },
  steady: { fill: YELLOW, caption: 'ALL GOOD', svg: `${eyesDot}<path d="M33 64 Q50 75 67 64" fill="none"/>` },
  tense: { fill: '#ffe08a', caption: 'HEH... FINE', svg: `${eyesDot}<rect x="30" y="61" width="40" height="13" rx="6" fill="#fff"/>
    <path d="M40 61 L40 74 M50 61 L50 74 M60 61 L60 74" fill="none" stroke-width="2.5"/>${sweat}` },
  panic: { fill: '#ff9a7a', caption: 'NOT FINE', svg: `${bigEyes(0)}<ellipse cx="50" cy="72" rx="12" ry="9" fill="${INK}"/>${sweat}
    <path d="M16 70 Q12 62 18 58 M84 70 Q88 62 82 58" fill="none" stroke="#7cd3ff" stroke-width="3"/>` },
};

export const CALM_FACE = { calm: 'cool', steady: 'steady', tense: 'tense', anxious: 'panic' };

export function memeSvg(kind) {
  const f = FACES[kind] || FACES.neutral;
  return `<svg class="meme-svg" viewBox="0 0 100 100" aria-hidden="true">
    <g stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="${INK}">
    <circle cx="50" cy="50" r="44" fill="${f.fill}"/>${f.svg}</g></svg>`;
}

export function memeCaption(kind) {
  return (FACES[kind] || FACES.neutral).caption;
}

export function memeFace(kind, { caption = true, cls = '' } = {}) {
  const wrap = document.createElement('span');
  wrap.className = `meme ${cls}`.trim();
  wrap.innerHTML = memeSvg(kind);
  if (caption) {
    const c = document.createElement('b');
    c.className = 'meme-cap';
    c.textContent = memeCaption(kind);
    wrap.appendChild(c);
  }
  return wrap;
}
