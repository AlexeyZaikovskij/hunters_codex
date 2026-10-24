// Векторные миниатюры персонажей для «рисованной» графики. Холст 128×128, ноги около y = 116,
// все смотрят вправо (влево — зеркалим). Овал команды под ногами рисует сцена.

const svg = (defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><defs>${defs}</defs>${body}</svg>`;

/** Одарённый: маг в капюшоне с посохом, в навершии светится сфера. */
const hero = svg(
  `<linearGradient id="robe" x1="0" y1="0" x2="1" y2="1">
     <stop offset="0" stop-color="#5a78e0"/><stop offset="1" stop-color="#1c2560"/></linearGradient>
   <linearGradient id="cloak" x1="0" y1="0" x2="0" y2="1">
     <stop offset="0" stop-color="#2b3a86"/><stop offset="1" stop-color="#121842"/></linearGradient>
   <radialGradient id="orb" cx="0.4" cy="0.4" r="0.6">
     <stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#9ff0ff"/><stop offset="1" stop-color="#2fa7ff" stop-opacity="0"/></radialGradient>
   <radialGradient id="face" cx="0.6" cy="0.5" r="0.6">
     <stop offset="0" stop-color="#3a2f3a"/><stop offset="1" stop-color="#0d0b12"/></radialGradient>`,
  `<path d="M40 112 C36 92 40 70 48 54 L74 54 C84 72 88 94 86 112 Z" fill="url(#cloak)" stroke="#0a0d24" stroke-width="2.5"/>
   <path d="M46 112 C44 94 47 74 54 58 L72 58 C78 76 80 96 78 112 Z" fill="url(#robe)" stroke="#0a0d24" stroke-width="2"/>
   <path d="M60 60 L62 112" stroke="#e8c45a" stroke-width="2.5" stroke-linecap="round"/>
   <path d="M50 78 L76 78" stroke="#e8c45a" stroke-width="3"/>
   <path d="M44 56 C42 36 52 22 64 20 C78 22 84 36 80 56 C74 62 52 62 44 56 Z" fill="url(#cloak)" stroke="#0a0d24" stroke-width="2.5"/>
   <path d="M56 54 C54 42 60 34 68 34 C76 36 78 46 76 54 Z" fill="url(#face)"/>
   <circle cx="66" cy="45" r="2.2" fill="#9ff0ff"/><circle cx="73" cy="45" r="2.2" fill="#9ff0ff"/>
   <path d="M90 116 L96 30" stroke="#5b3a1e" stroke-width="5" stroke-linecap="round"/>
   <path d="M90 116 L96 30" stroke="#9a6a3a" stroke-width="2" stroke-linecap="round"/>
   <path d="M92 34 C88 26 92 18 97 16 C102 18 105 26 100 34" fill="none" stroke="#c9a24a" stroke-width="2.5"/>
   <circle cx="97" cy="24" r="14" fill="url(#orb)"/>
   <circle cx="97" cy="24" r="5" fill="#ffffff"/>
   <path d="M76 70 C84 70 90 72 93 76" stroke="#1c2560" stroke-width="8" stroke-linecap="round" fill="none"/>
   <circle cx="93" cy="76" r="4.5" fill="#d8b49a" stroke="#0a0d24" stroke-width="1.5"/>`,
);

/** Червеглот: сегментированный червь с круглой пастью, полной зубов. */
const gnawer = svg(
  `<radialGradient id="seg" cx="0.35" cy="0.3" r="0.8">
     <stop offset="0" stop-color="#f08a63"/><stop offset="0.6" stop-color="#b8462a"/><stop offset="1" stop-color="#5a1b0f"/></radialGradient>
   <radialGradient id="maw" cx="0.5" cy="0.5" r="0.5">
     <stop offset="0" stop-color="#0a0204"/><stop offset="0.7" stop-color="#3a0a10"/><stop offset="1" stop-color="#7a1a22"/></radialGradient>`,
  `<ellipse cx="26" cy="104" rx="14" ry="11" fill="url(#seg)" stroke="#2a0a05" stroke-width="2"/>
   <ellipse cx="40" cy="96" rx="17" ry="14" fill="url(#seg)" stroke="#2a0a05" stroke-width="2"/>
   <ellipse cx="56" cy="84" rx="20" ry="17" fill="url(#seg)" stroke="#2a0a05" stroke-width="2"/>
   <path d="M44 74 C48 70 54 68 60 70" stroke="#ffb08a" stroke-width="2" fill="none" opacity="0.6"/>
   <ellipse cx="76" cy="66" rx="26" ry="25" fill="url(#seg)" stroke="#2a0a05" stroke-width="2.5"/>
   <ellipse cx="86" cy="64" rx="16" ry="18" fill="url(#maw)" stroke="#2a0a05" stroke-width="2"/>
   <g fill="#f4ecd6" stroke="#3a2a1a" stroke-width="0.8">
     <path d="M86 46 L83 54 L89 54 Z"/><path d="M97 50 L91 56 L96 59 Z"/><path d="M102 62 L94 62 L95 67 Z"/>
     <path d="M98 76 L92 70 L90 75 Z"/><path d="M87 82 L84 74 L90 74 Z"/><path d="M75 76 L80 70 L82 75 Z"/>
     <path d="M71 62 L79 61 L78 66 Z"/><path d="M75 50 L81 56 L77 58 Z"/>
   </g>
   <circle cx="66" cy="50" r="3" fill="#ffd34a"/><circle cx="66" cy="50" r="1.2" fill="#000"/>`,
);

/** Иглобрюх: круглое тело, спина в иглах, трубчатая пасть для плевков. */
const spines = Array.from({ length: 13 }, (_, i) => {
  const a = Math.PI * (0.95 + (i / 12) * 0.95);
  const x1 = 60 + Math.cos(a) * 26;
  const y1 = 76 + Math.sin(a) * 22;
  const x2 = 60 + Math.cos(a) * 46;
  const y2 = 76 + Math.sin(a) * 40;
  return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" />`;
}).join('');
const spitter = svg(
  `<radialGradient id="body" cx="0.4" cy="0.35" r="0.75">
     <stop offset="0" stop-color="#c6e07a"/><stop offset="0.6" stop-color="#6f9a2e"/><stop offset="1" stop-color="#2c4410"/></radialGradient>
   <linearGradient id="spine" x1="0" y1="1" x2="0" y2="0">
     <stop offset="0" stop-color="#5a4a2a"/><stop offset="1" stop-color="#f2e6b8"/></linearGradient>`,
  `<g stroke="#2a2410" stroke-width="5" stroke-linecap="round">${spines}</g>
   <g stroke="url(#spine)" stroke-width="3" stroke-linecap="round">${spines}</g>
   <path d="M44 96 L40 114 M56 100 L54 116 M70 100 L72 116 M82 96 L86 112" stroke="#3a4a18" stroke-width="5" stroke-linecap="round"/>
   <ellipse cx="62" cy="80" rx="32" ry="26" fill="url(#body)" stroke="#1f300a" stroke-width="2.5"/>
   <ellipse cx="58" cy="90" rx="18" ry="9" fill="#e6efb0" opacity="0.35"/>
   <path d="M88 74 C96 72 104 72 110 74 L110 82 C104 84 96 84 90 84 Z" fill="#8fb04a" stroke="#1f300a" stroke-width="2"/>
   <ellipse cx="110" cy="78" rx="3" ry="4.5" fill="#1a1006"/>
   <circle cx="82" cy="66" r="5.5" fill="#fff6c8" stroke="#1f300a" stroke-width="1.5"/>
   <circle cx="84" cy="66" r="2.6" fill="#c0201a"/>`,
);

/** Костяной страж: скелет с круглым щитом и тесаком, в глазницах — свет Червоточины. */
const boneGuard = svg(
  `<linearGradient id="bone" x1="0" y1="0" x2="1" y2="1">
     <stop offset="0" stop-color="#fbf4dc"/><stop offset="1" stop-color="#a99d7a"/></linearGradient>
   <radialGradient id="shield" cx="0.4" cy="0.35" r="0.7">
     <stop offset="0" stop-color="#8a8f9c"/><stop offset="1" stop-color="#2e323c"/></radialGradient>
   <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
     <stop offset="0" stop-color="#ffffff"/><stop offset="0.4" stop-color="#7affd9"/><stop offset="1" stop-color="#7affd9" stop-opacity="0"/></radialGradient>`,
  `<g stroke="#3a3324" stroke-width="2" stroke-linecap="round" fill="url(#bone)">
     <path d="M54 92 L50 114" stroke-width="7" stroke="#3a3324"/><path d="M54 92 L50 114" stroke-width="4" stroke="#e6dcc0"/>
     <path d="M66 92 L70 114" stroke-width="7" stroke="#3a3324"/><path d="M66 92 L70 114" stroke-width="4" stroke="#e6dcc0"/>
     <path d="M48 112 L56 114 M66 114 L76 112" stroke-width="5"/>
     <path d="M50 86 C52 80 68 80 70 86 L68 94 L52 94 Z"/>
     <rect x="57" y="58" width="6" height="26" rx="2"/>
     <path d="M46 60 C52 56 68 56 74 60" fill="none" stroke-width="5" stroke="#3a3324"/>
     <path d="M46 60 C52 56 68 56 74 60" fill="none" stroke-width="3" stroke="#e6dcc0"/>
     <path d="M48 66 C54 63 66 63 72 66 M49 72 C55 69 65 69 71 72 M51 78 C56 75 64 75 69 78" fill="none" stroke-width="4" stroke="#3a3324"/>
     <path d="M48 66 C54 63 66 63 72 66 M49 72 C55 69 65 69 71 72 M51 78 C56 75 64 75 69 78" fill="none" stroke-width="2" stroke="#e6dcc0"/>
     <path d="M47 60 L40 82" stroke-width="7" stroke="#3a3324"/><path d="M47 60 L40 82" stroke-width="4" stroke="#e6dcc0"/>
   </g>
   <path d="M38 84 L22 40" stroke="#2b2b30" stroke-width="7" stroke-linecap="round"/>
   <path d="M38 84 L22 40" stroke="#b8bec9" stroke-width="4" stroke-linecap="round"/>
   <path d="M34 82 L44 78" stroke="#5b3a1e" stroke-width="5" stroke-linecap="round"/>
   <path d="M58 32 C58 20 82 18 84 32 C86 42 80 48 78 52 L64 52 C60 48 56 42 58 32 Z" fill="url(#bone)" stroke="#3a3324" stroke-width="2.5"/>
   <path d="M66 52 L66 57 M70 52 L70 57 M74 52 L74 57" stroke="#3a3324" stroke-width="1.5"/>
   <path d="M64 52 L78 52 L76 58 L66 58 Z" fill="#e6dcc0" stroke="#3a3324" stroke-width="2"/>
   <ellipse cx="70" cy="36" rx="5" ry="5.5" fill="#15121a"/><ellipse cx="80" cy="36" rx="3.5" ry="5" fill="#15121a"/>
   <circle cx="70" cy="36" r="6" fill="url(#glow)"/><circle cx="80" cy="36" r="5" fill="url(#glow)"/>
   <path d="M76 42 L78 47 L74 47 Z" fill="#15121a"/>
   <circle cx="82" cy="78" r="22" fill="url(#shield)" stroke="#16181e" stroke-width="3"/>
   <circle cx="82" cy="78" r="15" fill="none" stroke="#b07a3a" stroke-width="3"/>
   <circle cx="82" cy="78" r="5" fill="#d9d2c0" stroke="#16181e" stroke-width="1.5"/>
   <path d="M70 66 L76 72 M92 88 L96 92" stroke="#1a1c22" stroke-width="2"/>`,
);

export const UNIT_ART: Record<string, string> = {
  hero,
  gnawer,
  spitter,
  bone_guard: boneGuard,
};

export const svgDataUrl = (s: string) => `data:image/svg+xml;base64,${btoa(s)}`;
