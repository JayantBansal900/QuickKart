// Re-creates the catalog photos from Pixabay, exactly as committed, using photo-manifest.json
// (the Pixabay photo id chosen for every file after a manual review).
//
//   cd frontend && npm i --no-save sharp && cd ..
//   node scripts/catalog/fetch-photos.mjs            # only files that are missing
//   node scripts/catalog/fetch-photos.mjs --force    # re-download everything
//
// Needs PIXABAY_API_KEY in .env (free key from pixabay.com/api/docs). The key is read from the
// file and never printed. Pixabay Content Licence: free to use, attribution not required
// (credits are kept in docs/photo-credits.md anyway).
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const force = process.argv.includes("--force");

let sharp;
try {
  sharp = createRequire(join(ROOT, "frontend", "package.json"))("sharp");
} catch {
  console.error("sharp is not installed. Run: cd frontend && npm i --no-save sharp");
  process.exit(2);
}

const env = existsSync(join(ROOT, ".env")) ? readFileSync(join(ROOT, ".env"), "utf8") : "";
const KEY = (process.env.PIXABAY_API_KEY || env.match(/^PIXABAY_API_KEY=(.*)$/m)?.[1] || "").trim();
if (!KEY) {
  console.error("PIXABAY_API_KEY is not set (in .env or the environment).");
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(join(ROOT, "scripts", "catalog", "photo-manifest.json"), "utf8"));
const jobs = [
  ...Object.entries(manifest.products).map(([file, e]) => ({ ...e, out: join(ROOT, "frontend/public/products/photos", file), size: [640, 640] })),
  ...Object.entries(manifest.categories).map(([slug, e]) => ({ ...e, out: join(ROOT, "frontend/public/categories", `${slug}.webp`) })),
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let done = 0;
let skipped = 0;
const failed = [];
for (const job of jobs) {
  if (!force && existsSync(job.out)) {
    skipped++;
    continue;
  }
  try {
    const api = await fetch(`https://pixabay.com/api/?${new URLSearchParams({ key: KEY, id: String(job.pixabayId) })}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (api.status === 429) {
      console.log("Rate limited by Pixabay; waiting 65 s");
      await sleep(65000);
    }
    if (!api.ok) throw new Error(`API HTTP ${api.status}`);
    const hit = (await api.json()).hits?.[0];
    if (!hit) throw new Error("photo no longer available");
    const image = await fetch(hit.largeImageURL, { signal: AbortSignal.timeout(30000) });
    if (!image.ok) throw new Error(`image HTTP ${image.status}`);
    const buf = Buffer.from(await image.arrayBuffer());
    mkdirSync(dirname(job.out), { recursive: true });
    const [width, height] = job.size;
    await sharp(buf).resize(width, height, { fit: "cover" }).webp({ quality: 74 }).toFile(job.out);
    done++;
    await sleep(700); // Pixabay allows 100 requests per minute
  } catch (err) {
    failed.push(`${job.out.replace(ROOT, "")}: ${err.message}`);
  }
}
console.log(`downloaded ${done}, already present ${skipped}, failed ${failed.length}`);
if (failed.length) {
  console.log(failed.join("\n"));
  process.exit(1);
}
