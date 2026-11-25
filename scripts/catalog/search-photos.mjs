// Helper for choosing catalog photos: searches Pixabay for each term, downloads the first few
// candidates and writes numbered contact sheets so the right photo can be picked by eye.
//   node scripts/catalog/search-photos.mjs <outDir> term1=query1 term2=query2 ...
// The Pixabay key is read from .env and never printed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sharp = createRequire(join(ROOT, "frontend", "package.json"))("sharp");
const env = existsSync(join(ROOT, ".env")) ? readFileSync(join(ROOT, ".env"), "utf8") : "";
const KEY = (process.env.PIXABAY_API_KEY || env.match(/^PIXABAY_API_KEY=(.*)$/m)?.[1] || "").trim();
const [outDir, ...terms] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const PER = 6, T = 190, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const meta = {};
const rows = [];
for (const t of terms) {
  const [name, q] = t.split("=");
  const res = await fetch(`https://pixabay.com/api/?${new URLSearchParams({ key: KEY, q, image_type: "photo", per_page: "12", safesearch: "true", orientation: "all" })}`);
  if (res.status === 429) { await sleep(65000); }
  const hits = ((await res.json()).hits || []).slice(0, PER);
  meta[name] = hits.map((h) => ({ id: h.id, page: h.pageURL, user: h.user }));
  const thumbs = [];
  for (const h of hits) {
    const img = Buffer.from(await (await fetch(h.previewURL)).arrayBuffer());
    thumbs.push(await sharp(img).resize(T, T, { fit: "cover" }).toBuffer());
  }
  rows.push({ name, thumbs });
  await sleep(700);
}
const perSheet = 6;
for (let s = 0; s * perSheet < rows.length; s++) {
  const chunk = rows.slice(s * perSheet, (s + 1) * perSheet);
  const comps = [];
  chunk.forEach((row, r) => {
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PER * (T + 4)}" height="18"><text x="2" y="14" font-size="14" font-family="Arial" fill="#000">${row.name}  (1-${row.thumbs.length} left to right)</text></svg>`), left: 0, top: r * (T + 24) });
    row.thumbs.forEach((b, i) => comps.push({ input: b, left: i * (T + 4), top: r * (T + 24) + 20 }));
  });
  await sharp({ create: { width: PER * (T + 4), height: chunk.length * (T + 24), channels: 3, background: "#ffffff" } })
    .composite(comps).jpeg({ quality: 82 }).toFile(join(outDir, `sheet${s + 1}.jpg`));
}
writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta, null, 1));
console.log("sheets:", Math.ceil(rows.length / perSheet));
