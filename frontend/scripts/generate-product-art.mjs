// Generates the catalog's product artwork: one clean, consistent SVG per catalog product.
//
//   node scripts/generate-product-art.mjs            (run from frontend/)
//
// Why generated art: the demo catalog has no licensed product photography. Instead of fake
// "photos", each product gets a soft category-tinted tile with a line icon that matches the
// product type (headphones, sneakers, coffee…). Icons come from Lucide (ISC licence), already a
// dependency of the app. Output paths are the imageUrl values stored in the database, so no data
// migration is needed — re-running simply overwrites the files.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, "..");
const catalogPath = join(frontend, "..", "backend", "services", "product-service", "src", "main", "resources", "catalog.json");
const iconDir = join(frontend, "node_modules", "lucide-react", "dist", "esm", "icons");

// Light pastel tile + one saturated ink colour per category.
const PALETTES = {
  electronics: ["#eef2ff", "#e0e7ff", "#4338ca"],
  fashion: ["#fff1f2", "#ffe4e6", "#be123c"],
  "home & living": ["#ecfdf5", "#d1fae5", "#047857"],
  sports: ["#fff7ed", "#ffedd5", "#c2410c"],
  books: ["#f5f3ff", "#ede9fe", "#6d28d9"],
  beauty: ["#fdf2f8", "#fce7f3", "#be185d"],
  groceries: ["#f7fee7", "#ecfccb", "#4d7c0f"],
  accessories: ["#f0f9ff", "#e0f2fe", "#0369a1"],
};

// First matching rule wins. [regex on the product name, lucide icon file name]
const RULES = {
  electronics: [
    [/headphone|headset|earbud|ear \(2\)|quietcomfort|momentum/, "headphones"],
    [/smartwatch|watch|forerunner/, "watch"],
    [/keyboard|air75/, "keyboard"],
    [/monitor|ultrasharp|rog swift|ultragear/, "monitor"],
    [/mouse|deathadder/, "mouse"],
    [/speaker|soundcore|emberton|flip 6/, "speaker"],
    [/charger|charging|power strip|maggo/, "plug-zap"],
    [/ssd|nvme|t7 shield/, "hard-drive"],
    [/webcam|streamcam|c920/, "webcam"],
    [/router|wi-fi|mesh|nighthawk|deco/, "router"],
    [/tablet|ipad|tab s9/, "tablet"],
    [/smartphone|phone/, "smartphone"],
    [/e-reader|paperwhite|kindle/, "book-open"],
    [/power bank/, "battery-charging"],
    [/mic|quadcast|mv7/, "mic"],
    [/lamp|screenbar/, "lamp-desk"],
    [/dock|thunderbolt/, "cable"],
    [/stream deck|controller/, "gamepad-2"],
  ],
  fashion: [
    [/sneaker|shoe|boot|loafer|sandal|heel/, "footprints"],
    [/backpack|duffel|duffle/, "backpack"],
    [/bag|handbag|crossbody/, "shopping-bag"],
    [/sunglass|aviator|wayfarer/, "glasses"],
    [/watch/, "watch"],
    [/wallet/, "wallet"],
    [/hat|beanie|fedora/, "crown"],
    [/scarf|belt/, "ribbon"],
    [/.*/, "shirt"],
  ],
  "home & living": [
    [/chair/, "armchair"],
    [/mug|coffee|espresso|cold brew|kettle|frother/, "coffee"],
    [/lamp/, "lamp"],
    [/cookware|dutch oven|baking|air fryer/, "cooking-pot"],
    [/sheet|pillow|towel|cushion|curtain/, "bed-double"],
    [/purifier|diffuser/, "wind"],
    [/flask/, "milk"],
    [/shel|organizer|caddy|container/, "archive"],
    [/scale/, "scale"],
    [/vacuum/, "sparkles"],
    [/trash/, "trash-2"],
    [/vase/, "flower-2"],
    [/candle/, "flame"],
    [/desk/, "monitor"],
    [/.*/, "house"],
  ],
  sports: [
    [/dumbbell|kettlebell|grip|pull-up|push-up/, "dumbbell"],
    [/racket|tennis|badminton|table tennis|paddle/, "trophy"],
    [/ball/, "volleyball"],
    [/helmet/, "hard-hat"],
    [/bike/, "bike"],
    [/goggle/, "glasses"],
    [/bag|vest/, "backpack"],
    [/bottle/, "milk"],
    [/shoe/, "footprints"],
    [/golf/, "flag"],
    [/trekking|hiking/, "mountain"],
    [/glove/, "hand"],
    [/cricket/, "trophy"],
    [/.*/, "activity"],
  ],
  books: [[/.*/, "book-open"]],
  beauty: [
    [/sunscreen|spf/, "sun"],
    [/lipstick|mascara|eyeliner|highlighter|powder/, "sparkles"],
    [/toner|spray|water/, "spray-can"],
    [/mask/, "moon"],
    [/scrub|tea tree|green tea|centella/, "leaf"],
    [/serum|oil|drop/, "droplet"],
    [/cleanser|face wash|foam|cleansing/, "droplets"],
    [/.*/, "flask-conical"],
  ],
  groceries: [
    [/coffee/, "coffee"],
    [/tea/, "leaf"],
    [/almond|cashew|walnut|pistachio|seed|peanut/, "nut"],
    [/oat|rice|quinoa|bean|rajma/, "wheat"],
    [/honey/, "hexagon"],
    [/chocolate|stevia/, "candy"],
    [/biscuit/, "cookie"],
    [/oil|vinegar|ghee/, "milk"],
    [/date|fig|anjeer/, "apple"],
    [/.*/, "leaf"],
  ],
  accessories: [
    [/phone case|tough armor/, "smartphone"],
    [/key/, "key-round"],
    [/wallet|cardholder|card sleeve/, "wallet"],
    [/passport/, "book"],
    [/cable|lightning|usb-c/, "cable"],
    [/screen protector/, "shield"],
    [/car /, "car"],
    [/laptop stand/, "laptop"],
    [/laptop sleeve|pouch|dry bag/, "briefcase"],
    [/tracker|airtag/, "map-pin"],
    [/lock/, "lock"],
    [/earphone/, "headphones"],
    [/adapter/, "plug"],
    [/pillow/, "bed"],
    [/mouse pad|desk mat/, "mouse-pointer"],
    [/lens|camera/, "camera"],
    [/umbrella/, "umbrella"],
    [/luggage/, "luggage"],
    [/webcam/, "webcam"],
    [/.*/, "gem"],
  ],
};

const iconCache = new Map();
async function loadIcon(name) {
  if (!iconCache.has(name)) {
    const file = join(iconDir, `${name}.js`);
    if (!existsSync(file)) throw new Error(`Lucide icon not found: ${name}`);
    const mod = await import(pathToFileURL(file).href);
    iconCache.set(name, mod.__iconNode);
  }
  return iconCache.get(name);
}

const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function renderNode([tag, attrs]) {
  const a = Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${esc(v)}"`).join(" ");
  return `<${tag} ${a}/>`;
}

function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function svg({ palette: [from, to, ink], icon, seed }) {
  // Small deterministic variations so a grid of same-category items doesn't look stamped.
  const angle = 20 + (seed % 50);
  const blobX = 140 + (seed % 320);
  const blobY = 120 + ((seed >> 8) % 300);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="${blobX}" cy="${blobY}" r="230" fill="url(#glow)" opacity=".55"/>
  <ellipse cx="300" cy="452" rx="120" ry="14" fill="${ink}" opacity=".08"/>
  <g transform="translate(180 170) scale(10)" fill="none" stroke="${ink}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
    ${icon.map(renderNode).join("\n    ")}
  </g>
</svg>
`;
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const used = new Map();
let written = 0;
for (const product of catalog) {
  const category = String(product.category || "").toLowerCase();
  const palette = PALETTES[category];
  const rules = RULES[category];
  if (!palette || !rules) throw new Error(`No art style for category "${product.category}" (${product.sku})`);
  const name = product.name.toLowerCase();
  let iconName = rules.find(([re]) => re.test(name))?.[1] ?? "package";
  if (iconName === "book-open") {
    // Books are all "a book": vary the drawing so the books grid doesn't repeat one icon.
    const BOOK_ICONS = ["book-open", "book-marked", "library-big", "notebook-pen", "book-open-text"];
    iconName = BOOK_ICONS[hash(product.sku) % BOOK_ICONS.length];
  }
  const icon = await loadIcon(iconName);
  for (const url of new Set([product.imageUrl, product.thumbnailUrl].filter(Boolean))) {
    if (!url.startsWith("/products/") || !url.endsWith(".svg")) continue;
    const target = join(frontend, "public", ...url.split("/").filter(Boolean));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, svg({ palette, icon, seed: hash(product.sku) }));
    written++;
  }
  used.set(iconName, (used.get(iconName) ?? 0) + 1);
}
console.log(`Wrote ${written} SVG files for ${catalog.length} products.`);
console.log("Icon usage:", Object.fromEntries([...used].sort((a, b) => b[1] - a[1])));
