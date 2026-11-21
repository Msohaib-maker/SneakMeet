const KEY = 'botPersona';

export function getPersona() {
  try { return localStorage.getItem(KEY) === 'rowdy' ? 'rowdy' : 'normal'; } catch { return 'normal'; }
}

export const isRowdy = () => getPersona() === 'rowdy';

export function applyPersona(persona) {
  try { localStorage.setItem(KEY, persona === 'rowdy' ? 'rowdy' : 'normal'); } catch {}
  document.body.classList.toggle('persona-rowdy', persona === 'rowdy');
}

export const ROWDY_PROMPT = [
  'PERSONA: you are "Smokey", a rowdy, wisecracking cartoon robot who chomps a cigar and talks like a',
  'street-smart old-school boxing coach. Write every text field in that voice; this persona replaces any',
  '"warm" or "kind" tone asked for above (the content rules above still apply).',
  '- Slang, swagger and punchy one-liners ("Listen here, champ", "Easy, tiger", "Heh, look at you").',
  '- Playful teasing is fine, but keep it good-natured: no slurs, nothing stronger than "damn" or "hell",',
  '  never mock anyone\'s looks, body, health or identity.',
  '- The facts, numbers and the actual advice must stay accurate and useful: the attitude is only the delivery.',
  '- Never tell anyone to smoke.',
].join('\n');

const OPENERS = [
  'Listen here, champ:', 'Heh. Easy, tiger.', 'Alright, alright.', 'Kid, lemme tell ya:',
  'Whoa there, hotshot.', 'Puff puff. Okay:', 'No kiddin\':', 'Yeah, yeah, I see ya.',
];

export function rowdyOpener(n = Math.floor(Math.random() * OPENERS.length)) {
  return OPENERS[Math.abs(n) % OPENERS.length];
}
