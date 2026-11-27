// Draws the QuickKart catalog: 30 flat product illustrations in one house style, each carrying the
// QuickKart logo, plus the three category tiles. Writes catalog.json for product-service as well.
//
//   cd frontend && npm i --no-save sharp && cd ..
//   node scripts/catalog/design-products.mjs
//
// Everything is drawn from code (SVG -> WebP), so there are no third-party photos or licences.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sharp = createRequire(join(ROOT, "frontend", "package.json"))("sharp");
const PHOTO_DIR = join(ROOT, "frontend/public/products/qk");
const CATEGORY_DIR = join(ROOT, "frontend/public/categories");
const CATALOG = join(ROOT, "backend/services/product-service/src/main/resources/catalog.json");

// ---------------------------------------------------------------- colour helpers
const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (r, g, b) => "#" + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
/** amount < 0 darkens, > 0 lightens */
const tone = (c, amount) => {
  const [r, g, b] = rgb(c);
  return amount < 0 ? hex(r * (1 + amount), g * (1 + amount), b * (1 + amount))
    : hex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
};
const isLight = (c) => { const [r, g, b] = rgb(c); return r * 0.299 + g * 0.587 + b * 0.114 > 170; };
/** Outline colour: dark enough to read on light garments, subtle on dark ones. */
const line = (c) => (isLight(c) ? tone(c, -0.35) : tone(c, -0.45));

// ---------------------------------------------------------------- brand
/** The QuickKart mark (bag + lightning bolt) at (x, y), `s` px wide. */
function logo(x, y, s, onDark = false) {
  const k = s / 32;
  const plate = onDark ? "#f5f5f3" : "#111111";
  const bag = onDark ? "#111111" : "#ffffff";
  return `<g transform="translate(${x} ${y}) scale(${k})">
    <rect width="32" height="32" rx="8" fill="${plate}"/>
    <path d="M11.5 11V9.5a4.5 4.5 0 0 1 9 0V11" fill="none" stroke="${bag}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M7.5 11.5h17l-1.3 13.1a2 2 0 0 1-2 1.9H10.8a2 2 0 0 1-2-1.9z" fill="${bag}"/>
    <path d="M17.4 13.6l-4.6 6h3.1l-1.3 4.6 4.8-6.3h-3.2z" fill="#f5b700"/>
  </g>`;
}
const wordmark = () => `<g opacity="0.55">${logo(343, 712, 22)}
  <text x="373" y="729" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#3a3a3a"><tspan font-weight="700">Quick</tspan>Kart</text></g>`;

// ---------------------------------------------------------------- scene
function scene(inner, { shadowY = 655, shadowW = 230 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="#fbfaf7"/><stop offset="1" stop-color="#ecebe6"/>
    </radialGradient>
  </defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <ellipse cx="400" cy="${shadowY}" rx="${shadowW}" ry="22" fill="#000" opacity="0.08"/>
  ${inner}
  ${wordmark()}
</svg>`;
}

// ---------------------------------------------------------------- tops
function tee(c, { oversized = false } = {}) {
  const o = line(c), d = tone(c, -0.12);
  const s = oversized ? 30 : 0;
  return `
  <path d="M${250 - s} ${230 + s / 2} L330 192 Q400 238 470 192 L${550 + s} ${230 + s / 2} L${650 + s} ${315 + s} L${598 + s} ${388 + s} L${548 + s / 2} ${352 + s}
           L${548 + s / 2} 640 Q400 656 ${252 - s / 2} 640 L${252 - s / 2} ${352 + s} L${202 - s} ${388 + s} L${150 - s} ${315 + s} Z"
        fill="${c}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M${548 + s / 2} ${352 + s} L${548 + s / 2} 640 Q500 648 470 650 L480 360 Z" fill="${d}" opacity="0.55"/>
  <path d="M330 192 Q400 262 470 192" fill="none" stroke="${o}" stroke-width="12" stroke-linecap="round" opacity="0.9"/>
  <path d="M${202 - s} ${388 + s} L${150 - s} ${315 + s}" stroke="${o}" stroke-width="4" opacity="0.6"/>
  ${logo(372, 300, 56, !isLight(c))}`;
}

function polo(c) {
  const o = line(c), d = tone(c, -0.15);
  return `${tee(c)}
  <path d="M332 194 L400 262 L366 292 L318 214 Z" fill="${d}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M468 194 L400 262 L434 292 L482 214 Z" fill="${d}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <rect x="388" y="262" width="24" height="88" rx="4" fill="${d}" stroke="${o}" stroke-width="3"/>
  <circle cx="400" cy="290" r="5" fill="${tone(c, 0.6)}"/><circle cx="400" cy="325" r="5" fill="${tone(c, 0.6)}"/>`.replace(logo(372, 300, 56, !isLight(c)), logo(470, 330, 46, !isLight(c)));
}

/** Long-sleeved body used by shirts, hoodies, sweatshirts and jackets. */
function longBody(c, { cuff = false, hem = false } = {}) {
  const o = line(c), d = tone(c, -0.12), b = tone(c, -0.18);
  return `
  <path d="M255 222 L335 190 Q400 228 465 190 L545 222 Q600 250 612 320 L648 560 L590 574 L548 372 L548 646 Q400 660 252 646 L252 372 L210 574 L152 560 L188 320 Q200 250 255 222 Z"
        fill="${c}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M548 372 L548 646 Q505 652 472 654 L480 380 Z" fill="${d}" opacity="0.55"/>
  ${cuff ? `<path d="M590 574 L648 560 L652 590 L594 604 Z M210 574 L152 560 L148 590 L206 604 Z" fill="${b}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>` : ""}
  ${hem ? `<path d="M252 616 Q400 630 548 616 L548 646 Q400 660 252 646 Z" fill="${b}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>` : ""}`;
}

function shirt(c) {
  const o = line(c), d = tone(c, -0.14), btn = tone(c, 0.65);
  return `${longBody(c, { cuff: true })}
  <path d="M335 190 L400 240 L370 282 L322 214 Z M465 190 L400 240 L430 282 L478 214 Z" fill="${d}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <line x1="400" y1="240" x2="400" y2="650" stroke="${o}" stroke-width="4" opacity="0.7"/>
  ${[300, 370, 440, 510, 580].map((y) => `<circle cx="412" cy="${y}" r="6" fill="${btn}" stroke="${o}" stroke-width="2"/>`).join("")}
  <rect x="440" y="318" width="70" height="80" rx="6" fill="none" stroke="${o}" stroke-width="3" opacity="0.8"/>
  ${logo(325, 330, 46, !isLight(c))}`;
}

function hoodie(c, { zip = false } = {}) {
  const o = line(c), d = tone(c, -0.16);
  return `
  <path d="M318 214 Q312 120 400 112 Q488 120 482 214 Z" fill="${d}" stroke="${o}" stroke-width="4"/>
  ${longBody(c, { cuff: true, hem: true })}
  <path d="M330 196 Q400 300 470 196" fill="${d}" stroke="${o}" stroke-width="4"/>
  <line x1="378" y1="250" x2="372" y2="345" stroke="${tone(c, 0.7)}" stroke-width="5" stroke-linecap="round"/>
  <line x1="422" y1="250" x2="428" y2="345" stroke="${tone(c, 0.7)}" stroke-width="5" stroke-linecap="round"/>
  ${zip ? `<line x1="400" y1="250" x2="400" y2="652" stroke="${o}" stroke-width="5"/><rect x="393" y="300" width="14" height="26" rx="3" fill="#c9c9c9"/>`
        : `<path d="M300 500 L500 500 L530 600 L270 600 Z" fill="${d}" stroke="${o}" stroke-width="4" stroke-linejoin="round" opacity="0.9"/>`}
  ${zip ? logo(455, 380, 44, !isLight(c)) : logo(372, 395, 56, !isLight(c))}`;
}

function sweatshirt(c) {
  const o = line(c);
  return `${longBody(c, { cuff: true, hem: true })}
  <path d="M330 194 Q400 258 470 194" fill="none" stroke="${tone(c, -0.2)}" stroke-width="16" stroke-linecap="round"/>
  <path d="M330 194 Q400 258 470 194" fill="none" stroke="${o}" stroke-width="3" opacity="0.6"/>
  ${logo(360, 330, 80, !isLight(c))}`;
}

function denimJacket(c) {
  const o = line(c), d = tone(c, -0.18), st = "#e3b45f";
  return `${longBody(c, { cuff: true, hem: true })}
  <path d="M335 190 L400 250 L362 300 L300 214 Z M465 190 L400 250 L438 300 L500 214 Z" fill="${d}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <line x1="400" y1="250" x2="400" y2="650" stroke="${o}" stroke-width="5"/>
  <path d="M290 330 h80 v70 h-80 Z M430 330 h80 v70 h-80 Z" fill="none" stroke="${st}" stroke-width="3" stroke-dasharray="8 6"/>
  <path d="M290 330 h80 l-40 26 Z M430 330 h80 l-40 26 Z" fill="${d}" stroke="${o}" stroke-width="3"/>
  ${[300, 380, 460, 540].map((y) => `<circle cx="414" cy="${y}" r="7" fill="#c9a24b" stroke="${o}" stroke-width="2"/>`).join("")}
  ${logo(300, 470, 50, true)}`;
}

function bomber(c) {
  const o = line(c), rib = tone(c, -0.3);
  return `${longBody(c, { cuff: true, hem: true })}
  <path d="M330 196 Q400 236 470 196 L470 214 Q400 256 330 214 Z" fill="${rib}" stroke="${o}" stroke-width="3"/>
  <path d="M590 574 L648 560 L652 590 L594 604 Z M210 574 L152 560 L148 590 L206 604 Z" fill="${rib}"/>
  <path d="M252 616 Q400 630 548 616 L548 646 Q400 660 252 646 Z" fill="${rib}"/>
  <line x1="400" y1="232" x2="400" y2="652" stroke="#bdbdbd" stroke-width="5"/>
  <path d="M478 300 L520 300 L512 316 L478 316 Z" fill="${tone(c, -0.25)}"/>
  ${logo(300, 300, 48, !isLight(c))}`;
}

function puffer(c) {
  const o = line(c), d = tone(c, -0.2);
  return `${longBody(c, { cuff: true, hem: true })}
  ${[300, 380, 460, 540].map((y) => `<path d="M256 ${y} Q400 ${y + 18} 546 ${y}" fill="none" stroke="${d}" stroke-width="5"/>`).join("")}
  ${[330, 400, 470].map((y) => `<path d="M196 ${y} Q215 ${y + 10} 238 ${y + 4} M562 ${y + 4} Q585 ${y + 10} 604 ${y}" fill="none" stroke="${d}" stroke-width="5"/>`).join("")}
  <path d="M328 196 L328 168 Q400 150 472 168 L472 196 Q400 214 328 196 Z" fill="${d}" stroke="${o}" stroke-width="4"/>
  <line x1="400" y1="200" x2="400" y2="652" stroke="${tone(c, 0.45)}" stroke-width="5"/>
  ${logo(300, 316, 46, !isLight(c))}`;
}

// ---------------------------------------------------------------- bottoms
function trousers(c, { length = 640, taper = 0, cuffs = false, rivets = false, shorts = false } = {}) {
  const o = line(c), d = tone(c, -0.14), b = tone(c, -0.22);
  const L = shorts ? 470 : length;
  const outL = shorts ? 268 : 276 + taper, outR = shorts ? 532 : 524 - taper;
  const inL = shorts ? 392 : 378 + taper / 3, inR = shorts ? 408 : 422 - taper / 3;
  return `
  <path d="M296 178 L504 178 L${outR} ${L} L${inR} ${L} L400 ${shorts ? 360 : 330} L${inL} ${L} L${outL} ${L} Z"
        fill="${c}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M504 178 L${outR} ${L} L${inR + 20} ${L} L470 260 Z" fill="${d}" opacity="0.5"/>
  <rect x="296" y="178" width="208" height="34" fill="${b}" stroke="${o}" stroke-width="4"/>
  ${[318, 372, 428, 482].map((x) => `<rect x="${x - 4}" y="174" width="8" height="42" rx="2" fill="${d}" stroke="${o}" stroke-width="2"/>`).join("")}
  <path d="M400 212 L400 300" stroke="${o}" stroke-width="3" opacity="0.7"/>
  <path d="M308 212 Q330 262 372 268 M492 212 Q470 262 428 268" fill="none" stroke="${o}" stroke-width="3" opacity="0.8"/>
  ${rivets ? `<circle cx="330" cy="236" r="5" fill="#c9a24b"/><circle cx="470" cy="236" r="5" fill="#c9a24b"/>
             <path d="M${outL + 10} ${L - 20} L${inL - 10} ${L - 20} M${inR + 10} ${L - 20} L${outR - 10} ${L - 20}" stroke="#e3b45f" stroke-width="3" stroke-dasharray="7 6"/>` : ""}
  ${cuffs ? `<path d="M${outL} ${L - 34} L${inL} ${L - 34} L${inL} ${L} L${outL} ${L} Z M${inR} ${L - 34} L${outR} ${L - 34} L${outR} ${L} L${inR} ${L} Z" fill="${b}" stroke="${o}" stroke-width="3"/>` : ""}
  ${logo(444, 226, 34, !isLight(c))}`;
}

// ---------------------------------------------------------------- shoes (side view, toe to the right)
function sneaker(c, { sole = "#f7f7f5", high = false, runner = false, canvas = false } = {}) {
  const o = line(c), d = tone(c, -0.14), so = line(sole);
  const top = high ? 255 : 360;
  const soleH = runner ? 78 : 56;
  return `
  <path d="M160 ${520} L660 ${520} Q682 520 682 ${540} L682 ${520 + soleH - 18} Q682 ${520 + soleH} 660 ${520 + soleH} L184 ${520 + soleH} Q156 ${520 + soleH} 156 ${520 + soleH - 26} Z"
        fill="${sole}" stroke="${so}" stroke-width="4" stroke-linejoin="round"/>
  ${runner ? `<path d="M176 ${560} Q300 540 420 562 T664 560" fill="none" stroke="${tone(c, -0.05)}" stroke-width="10" stroke-linecap="round"/>` : `<line x1="170" y1="${546}" x2="670" y2="${546}" stroke="${so}" stroke-width="3" opacity="0.6"/>`}
  <path d="M180 520 L190 ${top + 40} Q194 ${top} 236 ${top - 4} L${high ? 330 : 350} ${top - 8} Q${high ? 352 : 410} ${top + (high ? 60 : 10)} ${high ? 380 : 462} ${high ? 360 : 412}
           L600 452 Q666 468 666 520 Z" fill="${c}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M560 446 Q660 462 666 520 L540 520 Q560 480 560 446 Z" fill="${d}" opacity="${canvas ? 0.9 : 0.6}"/>
  ${[0.2, 0.4, 0.6, 0.8].map((t) => {
    // Laces sit just inside the top edge of the vamp (the same curve the upper is drawn with).
    const p0 = [high ? 330 : 350, top - 8], c1 = [high ? 352 : 410, top + (high ? 60 : 10)], p2 = [high ? 380 : 462, high ? 360 : 412];
    const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c1[0] + t * t * p2[0];
    const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c1[1] + t * t * p2[1];
    return `<line x1="${x - 18}" y1="${y + 26}" x2="${x + 4}" y2="${y + 8}" stroke="${tone(c, isLight(c) ? -0.5 : 0.75)}" stroke-width="6" stroke-linecap="round"/>`;
  }).join("")}
  ${canvas ? `<rect x="168" y="512" width="500" height="12" fill="${sole}"/>` : `<path d="M240 ${top + 70} Q330 470 470 470" fill="none" stroke="${d}" stroke-width="6" opacity="0.6"/>`}
  ${logo(232, 430, 52, !isLight(c))}`;
}

function chelsea(c) {
  const o = line(c), d = tone(c, -0.2);
  return `
  <path d="M190 520 L190 225 Q190 205 212 205 L372 205 Q392 205 392 228 L398 380 Q430 420 600 448 Q664 462 664 520 Z"
        fill="${c}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M300 220 L352 220 L360 400 L300 400 Z" fill="${d}" stroke="${o}" stroke-width="3"/>
  ${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="${310 + i * 8}" y1="226" x2="${312 + i * 8}" y2="394" stroke="${o}" stroke-width="2" opacity="0.5"/>`).join("")}
  <path d="M200 205 L212 170 L236 205 Z" fill="${d}" stroke="${o}" stroke-width="3"/>
  <path d="M176 520 L672 520 L672 556 Q672 568 660 568 L176 568 Z" fill="#2b2420" stroke="#14110f" stroke-width="3"/>
  <rect x="176" y="520" width="86" height="64" fill="#2b2420"/>
  ${logo(222, 300, 50, true)}`;
}

function loafer(c) {
  const o = line(c), d = tone(c, -0.2);
  return `
  <path d="M168 520 L190 430 Q205 405 250 405 L370 410 Q440 405 520 430 L610 460 Q670 476 670 520 Z" fill="${c}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M370 412 Q470 400 560 444 L540 468 Q460 444 380 450 Z" fill="${d}" stroke="${o}" stroke-width="3"/>
  <rect x="420" y="430" width="70" height="18" rx="6" fill="${tone(c, -0.35)}"/>
  <path d="M520 430 Q600 450 640 480" fill="none" stroke="${o}" stroke-width="3" stroke-dasharray="8 6" opacity="0.7"/>
  <path d="M156 520 L678 520 L678 548 Q678 560 666 560 L170 560 Q156 560 156 548 Z" fill="#3b2a1e" stroke="#1d150f" stroke-width="3"/>
  ${logo(232, 440, 46, true)}`;
}

function slide(c) {
  const o = line(c);
  return `
  <path d="M150 520 Q150 480 210 476 L600 470 Q680 470 680 520 Q680 560 600 566 L210 570 Q150 566 150 520 Z" fill="#e9e6df" stroke="#b9b4aa" stroke-width="4"/>
  <path d="M160 520 Q170 540 210 542 L600 538 Q670 536 672 520" fill="none" stroke="#cfcac0" stroke-width="5"/>
  <path d="M330 486 Q330 360 440 352 Q560 360 572 482 Z" fill="${c}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M352 486 Q360 392 440 384 Q540 392 548 482" fill="none" stroke="${tone(c, -0.25)}" stroke-width="4"/>
  ${logo(414, 404, 52, !isLight(c))}`;
}

// ---------------------------------------------------------------- accessories
function cap(c) {
  const o = line(c), d = tone(c, -0.15);
  return `
  <path d="M520 470 Q690 470 700 512 Q700 536 640 534 Q560 528 470 500 Z" fill="${d}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M190 500 Q186 280 400 262 Q590 270 600 492 Q400 530 190 500 Z" fill="${c}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M400 262 Q340 380 330 510 M400 262 Q470 380 480 505" fill="none" stroke="${o}" stroke-width="3" opacity="0.6"/>
  <ellipse cx="400" cy="262" rx="16" ry="8" fill="${d}" stroke="${o}" stroke-width="3"/>
  <path d="M190 500 Q400 530 600 492 L600 476 Q400 512 190 484 Z" fill="${d}" opacity="0.7"/>
  ${logo(366, 360, 68, !isLight(c))}`;
}

function beanie(c) {
  const o = line(c), d = tone(c, -0.15);
  return `
  <path d="M220 470 Q216 230 400 220 Q584 230 580 470 Z" fill="${c}" stroke="${o}" stroke-width="4"/>
  ${[260, 300, 340, 380, 420, 460, 500, 540].map((x) => `<path d="M${x} 450 Q${x + (x - 400) * 0.1} 330 ${400 + (x - 400) * 0.6} 240" fill="none" stroke="${d}" stroke-width="4" opacity="0.7"/>`).join("")}
  <path d="M200 440 L600 440 L600 560 Q400 580 200 560 Z" fill="${d}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  ${[220, 250, 280, 310, 340, 370, 400, 430, 460, 490, 520, 550, 580].map((x) => `<line x1="${x}" y1="448" x2="${x}" y2="556" stroke="${tone(c, -0.28)}" stroke-width="4" opacity="0.6"/>`).join("")}
  <rect x="356" y="470" width="88" height="58" rx="8" fill="#f5f5f3" stroke="${o}" stroke-width="3"/>
  ${logo(380, 479, 40)}`;
}

function backpack(c) {
  const o = line(c), d = tone(c, -0.15);
  return `
  <path d="M340 190 Q340 140 400 140 Q460 140 460 190" fill="none" stroke="${d}" stroke-width="18" stroke-linecap="round"/>
  <rect x="250" y="180" width="300" height="460" rx="70" fill="${c}" stroke="${o}" stroke-width="4"/>
  <path d="M250 300 Q400 270 550 300" fill="none" stroke="${o}" stroke-width="4" opacity="0.6"/>
  <rect x="290" y="420" width="220" height="180" rx="40" fill="${d}" stroke="${o}" stroke-width="4"/>
  <path d="M310 450 L490 450" stroke="#c9c9c9" stroke-width="5"/><rect x="478" y="444" width="14" height="22" rx="3" fill="#bdbdbd"/>
  ${logo(362, 320, 76, !isLight(c))}`;
}

function wallet(c) {
  const o = line(c), d = tone(c, -0.18);
  return `
  <g transform="rotate(-6 400 420)">
    <rect x="240" y="270" width="330" height="250" rx="22" fill="${c}" stroke="${o}" stroke-width="4"/>
    <rect x="262" y="292" width="286" height="206" rx="14" fill="none" stroke="#e3c38f" stroke-width="3" stroke-dasharray="9 7"/>
    <path d="M240 330 L570 330" stroke="${d}" stroke-width="6" opacity="0.6"/>
    <rect x="460" y="240" width="90" height="56" rx="6" fill="#4b7bd1" stroke="#2f5aa8" stroke-width="3"/>
    ${logo(368, 380, 74, true)}
  </g>`;
}

function belt(c) {
  const o = line(c);
  return `
  <path d="M110 430 L520 430 L520 490 L110 490 Z" fill="${c}" stroke="${o}" stroke-width="4"/>
  <path d="M120 440 L510 440 M120 480 L510 480" stroke="${tone(c, 0.25)}" stroke-width="2" stroke-dasharray="8 6"/>
  ${[180, 230, 280, 330].map((x) => `<ellipse cx="${x}" cy="460" rx="6" ry="8" fill="${tone(c, -0.5)}"/>`).join("")}
  <rect x="520" y="400" width="140" height="120" rx="18" fill="none" stroke="#b8b8b8" stroke-width="16"/>
  <line x1="520" y1="460" x2="610" y2="460" stroke="#a5a5a5" stroke-width="10" stroke-linecap="round"/>
  <path d="M660 430 L700 430 L700 490 L660 490 Z" fill="${c}" stroke="${o}" stroke-width="4"/>
  ${logo(400, 436, 48, !isLight(c))}`;
}

function watch(c) {
  const o = line(c);
  return `
  <rect x="350" y="150" width="100" height="190" rx="18" fill="${c}" stroke="${o}" stroke-width="4"/>
  <rect x="350" y="470" width="100" height="190" rx="18" fill="${c}" stroke="${o}" stroke-width="4"/>
  <circle cx="400" cy="405" r="130" fill="#d7d7d7" stroke="#8f8f8f" stroke-width="6"/>
  <circle cx="400" cy="405" r="112" fill="#fafafa" stroke="#bdbdbd" stroke-width="3"/>
  ${Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; const r1 = i % 3 ? 98 : 90;
      return `<line x1="${400 + Math.sin(a) * r1}" y1="${405 - Math.cos(a) * r1}" x2="${400 + Math.sin(a) * 104}" y2="${405 - Math.cos(a) * 104}" stroke="#333" stroke-width="${i % 3 ? 3 : 6}"/>`; }).join("")}
  <line x1="400" y1="405" x2="400" y2="330" stroke="#222" stroke-width="7" stroke-linecap="round"/>
  <line x1="400" y1="405" x2="460" y2="440" stroke="#222" stroke-width="5" stroke-linecap="round"/>
  <circle cx="400" cy="405" r="8" fill="#f5b700"/>
  <rect x="528" y="392" width="18" height="28" rx="4" fill="#a8a8a8"/>
  ${logo(384, 340, 32)}`;
}

function sunglasses(c) {
  const lens = "#2d3b45";
  return `
  <path d="M170 360 Q170 320 210 320 L360 320 Q380 320 378 345 L370 420 Q362 470 310 470 L230 470 Q180 470 174 420 Z" fill="${lens}" stroke="${c}" stroke-width="14"/>
  <path d="M630 360 Q630 320 590 320 L440 320 Q420 320 422 345 L430 420 Q438 470 490 470 L570 470 Q620 470 626 420 Z" fill="${lens}" stroke="${c}" stroke-width="14"/>
  <path d="M378 340 Q400 322 422 340" fill="none" stroke="${c}" stroke-width="12"/>
  <path d="M170 330 L110 310 M630 330 L690 310" stroke="${c}" stroke-width="12" stroke-linecap="round"/>
  <path d="M200 345 L250 345 M460 345 L510 345" stroke="#ffffff" stroke-width="8" stroke-linecap="round" opacity="0.35"/>
  ${logo(214, 322, 26, true)}`;
}

function tote(c) {
  const o = line(c);
  return `
  <path d="M320 260 Q320 150 400 150 Q480 150 480 260" fill="none" stroke="${tone(c, -0.25)}" stroke-width="16"/>
  <path d="M240 250 L560 250 L590 640 L210 640 Z" fill="${c}" stroke="${o}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M248 280 L552 280" stroke="${o}" stroke-width="3" stroke-dasharray="9 7" opacity="0.7"/>
  ${logo(340, 360, 120)}
  <text x="400" y="540" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#1a1a1a"><tspan font-weight="700">Quick</tspan>Kart</text>`;
}

// ---------------------------------------------------------------- the catalog
const APPAREL = ["S", "M", "L", "XL", "XXL"];
const WAIST = ["28", "30", "32", "34", "36"];
const SHOES = ["6", "7", "8", "9", "10", "11"];
const BELT = ["32", "34", "36", "38"];

// [slug, category, name, price, discount%, colour name, hex, draw, sizes, description]
const P = [
  ["essential-crew-tee", "Clothing", "Essential Crew Tee", 599, 0, "White", "#f6f6f3", (c) => tee(c), APPAREL, "Our everyday tee in soft 180 GSM combed cotton with a ribbed neck that keeps its shape."],
  ["oversized-tee", "Clothing", "Heavyweight Oversized Tee", 899, 10, "Black", "#262626", (c) => tee(c, { oversized: true }), APPAREL, "A relaxed, drop-shoulder fit in heavy 240 GSM cotton. Structured, soft and made to be lived in."],
  ["pique-polo", "Clothing", "Pique Polo", 1099, 0, "Navy", "#1f2e4d", polo, APPAREL, "Classic pique-knit polo with a two-button placket and a collar that stays flat all day."],
  ["oxford-shirt", "Clothing", "Oxford Button-Down Shirt", 1499, 15, "Sky Blue", "#a9c3e0", shirt, APPAREL, "Brushed Oxford cotton with a button-down collar. Smart enough for work, easy for the weekend."],
  ["linen-shirt", "Clothing", "Linen Shirt", 1599, 0, "Sand", "#d9c8a7", shirt, APPAREL, "Breathable pure linen with a relaxed fit. Made for hot days."],
  ["pullover-hoodie", "Clothing", "Pullover Hoodie", 1799, 0, "Grey", "#9b9ea3", (c) => hoodie(c), APPAREL, "Midweight brushed fleece with a double-layer hood and a front pocket."],
  ["zip-hoodie", "Clothing", "Zip-Through Hoodie", 1999, 10, "Forest Green", "#2f4a3a", (c) => hoodie(c, { zip: true }), APPAREL, "A full-zip hoodie in soft loopback cotton with flat drawcords."],
  ["crewneck-sweatshirt", "Clothing", "Crewneck Sweatshirt", 1399, 0, "Cream", "#ebe3d3", sweatshirt, APPAREL, "A clean crewneck in 320 GSM terry cotton with ribbed hem and cuffs."],
  ["denim-jacket", "Clothing", "Classic Denim Jacket", 2999, 0, "Mid Blue", "#4a6e9b", denimJacket, APPAREL, "A structured trucker jacket in washed denim that gets better as it breaks in."],
  ["bomber-jacket", "Clothing", "Bomber Jacket", 3299, 20, "Olive", "#5b6340", bomber, APPAREL, "A lightweight bomber with ribbed collar, cuffs and hem, and a smooth zip front."],
  ["puffer-jacket", "Clothing", "Quilted Puffer Jacket", 3999, 0, "Rust", "#c2622d", puffer, APPAREL, "Warm, light synthetic fill with a stand collar. Packs small, keeps you warm."],
  ["slim-jeans", "Clothing", "Slim Fit Jeans", 1999, 0, "Indigo", "#2f4a73", (c) => trousers(c, { taper: 26, rivets: true }), WAIST, "Soft stretch denim in a slim fit that moves with you. Mid-rise and five-pocket."],
  ["stretch-chinos", "Clothing", "Stretch Chinos", 1699, 10, "Khaki", "#b9a27a", (c) => trousers(c, { taper: 14 }), WAIST, "Cotton-stretch chinos with a slim-straight leg. Smart-casual and comfortable."],
  ["fleece-joggers", "Clothing", "Fleece Joggers", 1299, 0, "Charcoal", "#3b3d42", (c) => trousers(c, { taper: 40, cuffs: true }), APPAREL, "Brushed-fleece joggers with a drawcord waist and ribbed cuffs."],
  ["everyday-shorts", "Clothing", "Everyday Shorts", 899, 0, "Navy", "#2b3a55", (c) => trousers(c, { shorts: true }), APPAREL, "Lightweight cotton shorts with a 7-inch inseam and side pockets."],

  ["court-sneakers", "Shoes", "Court Low Sneakers", 2999, 0, "White", "#f4f4f1", (c) => sneaker(c), SHOES, "Clean low-tops with a cushioned insole and a hard-wearing rubber cupsole."],
  ["high-top-sneakers", "Shoes", "Street High-Tops", 3299, 15, "Black", "#262626", (c) => sneaker(c, { high: true }), SHOES, "High-top sneakers with a padded collar for ankle support and all-day comfort."],
  ["runners", "Shoes", "Featherlight Runners", 3499, 0, "Red", "#d9473b", (c) => sneaker(c, { runner: true, sole: "#f1f1ee" }), SHOES, "Breathable runners with responsive foam and a grippy outsole."],
  ["chelsea-boots", "Shoes", "Chelsea Boots", 4299, 0, "Brown", "#6b4329", chelsea, SHOES, "Leather Chelsea boots with elastic side panels and a stacked heel."],
  ["penny-loafers", "Shoes", "Penny Loafers", 3199, 10, "Tan", "#a0673b", loafer, SHOES, "Leather loafers with a flexible sole. Wear them with or without socks."],
  ["cushioned-slides", "Shoes", "Cushioned Slides", 799, 0, "Black", "#262626", slide, SHOES, "Moulded footbed slides for the house, the beach or the gym."],
  ["canvas-low-tops", "Shoes", "Canvas Low-Tops", 1799, 0, "Navy", "#24365a", (c) => sneaker(c, { canvas: true, sole: "#efeae0" }), SHOES, "Classic canvas low-tops with a vulcanised rubber sole."],

  ["everyday-cap", "Accessories", "Everyday Cap", 599, 0, "Black", "#262626", cap, null, "Six-panel cotton cap with an adjustable strap and a curved brim."],
  ["ribbed-beanie", "Accessories", "Ribbed Beanie", 499, 0, "Mustard", "#d4a23c", beanie, null, "A stretchy ribbed-knit beanie with a turn-up cuff. One size."],
  ["daypack", "Accessories", "Daypack Backpack", 2499, 0, "Charcoal", "#3a3d44", backpack, null, "Water-resistant backpack with a padded 15-inch laptop sleeve and a quick-access front pocket."],
  ["leather-wallet", "Accessories", "Slim Leather Wallet", 999, 0, "Brown", "#7a4b2c", wallet, null, "A slim bifold with six card slots and a full-length note pocket."],
  ["leather-belt", "Accessories", "Leather Belt", 899, 0, "Black", "#2a2a2a", belt, BELT, "A full-grain leather belt with a brushed metal buckle."],
  ["analog-watch", "Accessories", "Minimal Analog Watch", 2999, 10, "Black", "#2a2a2a", watch, null, "A clean 40 mm analog watch with a leather strap and 3 ATM water resistance."],
  ["classic-sunglasses", "Accessories", "Classic Sunglasses", 1299, 0, "Black", "#1d1d1d", sunglasses, null, "Lightweight frames with UV400 lenses."],
  ["canvas-tote", "Accessories", "Canvas Tote Bag", 699, 0, "Natural", "#e8dec8", tote, null, "A sturdy cotton canvas tote for groceries, books and everything else."],
];

const CODE = { Clothing: "CLO", Shoes: "SHO", Accessories: "ACC" };
let seed = 20261127;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const counters = {};
const catalog = [];

mkdirSync(PHOTO_DIR, { recursive: true });
for (const [slug, category, name, price, discount, colour, hexColour, draw, sizes, description] of P) {
  counters[category] = (counters[category] || 0) + 1;
  const svg = scene(draw(hexColour));
  await sharp(Buffer.from(svg)).resize(800, 800).webp({ quality: 88 }).toFile(join(PHOTO_DIR, `${slug}.webp`));
  const variants = sizes?.map((size) => ({ size, color: colour, stockQuantity: rnd() < 0.08 ? 0 : 4 + Math.floor(rnd() * 16) }));
  const stock = variants ? variants.reduce((s, v) => s + v.stockQuantity, 0) : 15 + Math.floor(rnd() * 40);
  catalog.push({
    sku: `QK-${CODE[category]}-${String(counters[category]).padStart(3, "0")}`,
    name: `QuickKart ${name}`,
    brand: "QuickKart",
    description,
    category,
    price,
    discountPercentage: discount,
    rating: null,
    reviewCount: 0,
    stockQuantity: stock,
    imageUrl: `/products/qk/${slug}.webp`,
    thumbnailUrl: `/products/qk/${slug}.webp`,
    availability: stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
    ...(variants ? { variants } : {}),
  });
}
writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + "\n");

// Category tiles: three products of the category side by side.
const tile = (draws) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs><radialGradient id="bg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#fbfaf7"/><stop offset="1" stop-color="#ecebe6"/></radialGradient></defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  ${draws.map((d, i) => `<g transform="translate(${[-40, 250, 120][i]} ${[150, 150, 380][i]}) scale(0.55)">${d}</g>`).join("")}
  ${logo(30, 30, 44)}
</svg>`;
mkdirSync(CATEGORY_DIR, { recursive: true });
const tiles = {
  clothing: [tee("#f6f6f3"), hoodie("#9b9ea3"), trousers("#2f4a73", { taper: 26, rivets: true })],
  shoes: [sneaker("#f4f4f1"), chelsea("#6b4329"), sneaker("#d9473b", { runner: true, sole: "#f1f1ee" })],
  accessories: [cap("#262626"), watch("#2a2a2a"), backpack("#3a3d44")],
};
for (const [name, draws] of Object.entries(tiles)) {
  await sharp(Buffer.from(tile(draws))).resize(480, 480).webp({ quality: 88 }).toFile(join(CATEGORY_DIR, `${name}.webp`));
}
console.log(`drew ${catalog.length} products and ${Object.keys(tiles).length} category tiles`);
