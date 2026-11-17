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
    [/headphone|headset|earbud|airpods|airdopes|buds/, "headphones"],
    [/smartwatch|watch|forerunner|band 8/, "watch"],
    [/keyboard|keys/, "keyboard"],
    [/monitor|ultrasharp|odyssey|ultragear/, "monitor"],
    [/mouse/, "mouse"],
    [/speaker|soundcore|emberton|flip 6|charge 5|echo dot/, "speaker"],
    [/power bank|powercore/, "battery-charging"],
    [/charger|gan/, "plug-zap"],
    [/ssd|hard drive|my passport/, "hard-drive"],
    [/microsd|dual drive/, "save"],
    [/webcam|c920/, "webcam"],
    [/security camera|tapo/, "cctv"],
    [/router|mesh|deco/, "router"],
    [/kindle/, "book-open"],
    [/tablet|ipad|tab |pad 6/, "tablet"],
    [/fire tv|chromecast/, "tv"],
    [/printer/, "printer"],
    [/microphone|mic\b/, "mic"],
    [/screenbar|light/, "lamp-desk"],
    [/hub|dock/, "cable"],
    [/stream deck/, "layout-grid"],
    [/controller/, "gamepad-2"],
  ],
  fashion: [
    [/sneaker|shoe|boot|loafer|sandal|heel|clog|flats/, "footprints"],
    [/backpack|duffel|duffle/, "backpack"],
    [/bag|handbag|crossbody|tote|satchel/, "shopping-bag"],
    [/sunglass|aviator|wayfarer/, "glasses"],
    [/watch/, "watch"],
    [/wallet/, "wallet"],
    [/beanie|cap\b/, "crown"],
    [/scarf|belt|muffler|dupatta|socks/, "ribbon"],
    [/.*/, "shirt"],
  ],
  "home & living": [
    [/chair/, "armchair"],
    [/table/, "table"],
    [/candle/, "flame"],
    [/water purifier/, "droplet"],
    [/kettle|coffee|espresso/, "coffee"],
    [/lamp|bulb/, "lamp"],
    [/cooker|cookware|kadhai|skillet|tawa|dutch oven|air fryer|stove|cooktop/, "cooking-pot"],
    [/otg|oven/, "microwave"],
    [/mixer|grinder/, "chef-hat"],
    [/bedsheet|pillow|towel|cushion|comforter|mattress/, "bed-double"],
    [/curtain/, "blinds"],
    [/purifier|chimney/, "wind"],
    [/fan/, "fan"],
    [/heater|geyser/, "heater"],
    [/flask|bottle|glass set/, "milk"],
    [/lunch box|container|jar|tupperware/, "package-open"],
    [/dinner set/, "utensils"],
    [/shel|cabinet|bookshelf|kallax|hook rack|hamper/, "archive"],
    [/scale/, "scale"],
    [/vacuum|mop/, "sparkles"],
    [/iron/, "shirt"],
    [/vase|plant/, "flower-2"],
    [/clock/, "clock"],
    [/doormat/, "rectangle-horizontal"],
    [/paint/, "paint-roller"],
    [/screwdriver|tool kit/, "wrench"],
    [/adhesive/, "pipette"],
    [/.*/, "house"],
  ],
  sports: [
    [/glove/, "hand"],
    [/skipping/, "activity"],
    [/dumbbell|kettlebell|grip|pull-up|weight bench|resistance band/, "dumbbell"],
    [/racquet|racket|shuttle|tennis|badminton/, "trophy"],
    [/cricket|bat\b/, "trophy"],
    [/football|basketball|volleyball|ball/, "volleyball"],
    [/helmet/, "hard-hat"],
    [/bike/, "bike"],
    [/goggle/, "glasses"],
    [/swim|jammer/, "waves"],
    [/bag|backpack/, "backpack"],
    [/bottle|shaker/, "milk"],
    [/shoe/, "footprints"],
    [/tent/, "tent"],
    [/trekking|hiking/, "mountain"],
    [/glove/, "hand"],
    [/tracker|watch|smartwatch/, "watch"],
    [/chess|carrom/, "crown"],
    [/knee|ankle|pads|shin/, "shield"],
    [/skipping/, "activity"],
    [/.*/, "activity"],
  ],
  books: [[/.*/, "book-open"]],
  beauty: [
    [/sunscreen|sunblock|spf/, "sun"],
    [/lipstick|lipcolor|mascara|kajal|foundation|compact|fixer/, "sparkles"],
    [/perfume|parfum|toilette|body spray|scent/, "spray-can"],
    [/micellar|toner/, "spray-can"],
    [/mask|ubtan|scrub/, "moon"],
    [/shampoo|conditioner/, "bath"],
    [/hair dryer|straighten/, "wind"],
    [/trimmer|shaver|razor/, "scissors"],
    [/serum|oil|solution|hyaluronic|niacinamide/, "droplet"],
    [/cleanser|face wash|foaming|facial wash|bathing bar/, "droplets"],
    [/cream|lotion|moisturi/, "pipette"],
    [/.*/, "flask-conical"],
  ],
  groceries: [
    [/biscuit|cookie|fills|parle/, "cookie"],
    [/juice|drink|aamras|bournvita|horlicks|whitener/, "cup-soda"],
    [/\bdates?\b/, "apple"],
    [/coffee/, "coffee"],
    [/tea\b|tea gold|green tea|tea 500/, "leaf"],
    [/almond|cashew|walnut|seed|peanut|raisin/, "nut"],
    [/\boats\b|rice|atta|dal|rajma|muesli|corn flakes|chocos|pasta/, "wheat"],
    [/honey|chyawanprash/, "hexagon"],
    [/chocolate|silk|soan papdi/, "candy"],
    [/biscuit|cookie|fills|parle/, "cookie"],
    [/oil|ghee|butter/, "milk"],
    [/juice|drink|aamras|bournvita|horlicks|whitener/, "cup-soda"],
    [/date/, "apple"],
    [/noodles/, "soup"],
    [/bhujia|chips/, "popcorn"],
    [/ketchup|sauce|jam|dressing/, "salad"],
    [/salt|masala|powder|turmeric/, "flame"],
    [/.*/, "leaf"],
  ],
  accessories: [
    [/case for|screen protector/, "smartphone"],
    [/keychain/, "key-round"],
    [/wallet|cardholder/, "wallet"],
    [/passport/, "book"],
    [/cable|lightning/, "cable"],
    [/power bank|battery/, "battery-charging"],
    [/charger|adapter/, "plug"],
    [/car /, "car"],
    [/laptop stand/, "laptop"],
    [/laptop bag|laptop sleeve|pouch|carry case|organiser/, "briefcase"],
    [/backpack|waistpack|rain cover/, "backpack"],
    [/luggage tag/, "tag"],
    [/trolley|spinner|luggage/, "luggage"],
    [/airtag|smarttag|tracker/, "map-pin"],
    [/lock/, "lock"],
    [/earphone/, "headphones"],
    [/pillow/, "bed"],
    [/mouse pad|desk mat/, "mouse-pointer"],
    [/glasses|sunglasses/, "glasses"],
    [/lens|tripod|gimbal|gopro|selfie/, "camera"],
    [/umbrella/, "umbrella"],
    [/webcam cover/, "webcam"],
    [/pen drive|datatraveler|usb 3/, "save"],
    [/watch|strap/, "watch"],
    [/glasses|sunglasses/, "glasses"],
    [/pen\b|pens/, "pen"],
    [/notebook/, "notebook"],
    [/calculator/, "calculator"],
    [/cap\b/, "crown"],
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
