// Builds backend/services/product-service/src/main/resources/catalog.json: the VAYU men's catalog.
//   node scripts/catalog/build-vayu-catalog.mjs
// Prices are in rupees and include GST. Stock per size is generated deterministically (a few sizes
// are sold out on purpose, so the "sold out" state is visible). One photo per product *type*.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backend/services/product-service/src/main/resources/catalog.json");

const SIZES = {
  apparel: ["S", "M", "L", "XL", "XXL"],
  waist: ["28", "30", "32", "34", "36"],
  shoe: ["6", "7", "8", "9", "10", "11"],
  belt: ["32", "34", "36", "38"],
  none: null,
};

// [category, name, price, discount%, photo, sizeType, colours, description]
const P = [
  // ---- T-Shirts
  ["T-Shirts", "Essential Crew Tee", 699, 0, "tshirt-i2", "apparel", ["White", "Black", "Navy"], "Our everyday tee in 180 GSM combed cotton. Soft, breathable and cut to sit clean under a jacket or on its own."],
  ["T-Shirts", "Drop-Shoulder Oversized Tee", 999, 10, "tshirt-i2", "apparel", ["Black", "Stone"], "A relaxed, drop-shoulder fit in heavy cotton jersey with a ribbed collar that keeps its shape wash after wash."],
  ["T-Shirts", "Heavyweight Boxy Tee", 1199, 0, "tshirt-i2", "apparel", ["Off White", "Olive"], "240 GSM cotton with a boxy, cropped-at-the-hip cut. Structured enough to hold its line, soft enough to live in."],
  ["T-Shirts", "Pique Polo", 1299, 15, "polo-k3", "apparel", ["Navy", "White", "Forest"], "Classic pique-knit polo with a two-button placket and a clean collar that stays flat all day."],
  ["T-Shirts", "Waffle Henley Tee", 1099, 0, "tshirt-i2", "apparel", ["Charcoal", "Sand"], "Waffle-knit cotton henley with a three-button placket. Textured, warm and easy to layer."],
  ["T-Shirts", "Pocket Tee", 799, 0, "tshirt-i2", "apparel", ["Grey Melange", "Navy"], "A soft cotton tee with a single chest pocket and a straight hem. Simple, honest and goes with everything."],
  ["T-Shirts", "Breton Stripe Tee", 899, 20, "tshirt-i2", "apparel", ["Navy Stripe", "Black Stripe"], "Horizontal-stripe cotton tee inspired by classic sailor shirts, with a slim crew neck."],
  ["T-Shirts", "Longline Curved-Hem Tee", 849, 0, "tshirt-i2", "apparel", ["Black", "White"], "A longer back and curved hem for a streetwear silhouette, in lightweight cotton."],
  ["T-Shirts", "Open Skies Graphic Tee", 949, 10, "tshirt-i2", "apparel", ["White", "Black"], "Soft-hand screen print on 200 GSM cotton. The artwork is water-based ink that will not crack."],

  // ---- Shirts
  ["Shirts", "Oxford Button-Down Shirt", 1799, 0, "shirt-i0", "apparel", ["Sky Blue", "White"], "Brushed Oxford cotton with a button-down collar. Smart enough for work, easy enough for a weekend."],
  ["Shirts", "Linen Resort Shirt", 1899, 10, "shirt-i0", "apparel", ["Sand", "White", "Sage"], "Breathable pure linen with a relaxed camp collar. Made for hot days and long evenings."],
  ["Shirts", "Brushed Flannel Check Shirt", 1699, 0, "flannel-shirt", "apparel", ["Red Check", "Navy Check"], "Double-brushed cotton flannel in a classic check. Warm, soft and gets better with every wash."],
  ["Shirts", "Chambray Work Shirt", 1599, 0, "shirt-i0", "apparel", ["Light Indigo", "Dark Indigo"], "Lightweight chambray with chest pockets and a relaxed fit, inspired by classic workwear."],
  ["Shirts", "Mandarin Collar Shirt", 1499, 15, "shirt-black", "apparel", ["Black", "White", "Mustard"], "A band-collar shirt that sits between a kurta and a shirt. Wear it out over trousers or tucked in."],
  ["Shirts", "Slim Formal Shirt", 1599, 0, "shirt-maroon", "apparel", ["Burgundy", "White"], "Wrinkle-resistant cotton-blend poplin with a slim cut and a stiff, clean collar."],
  ["Shirts", "Cuban Collar Printed Shirt", 1399, 20, "shirt-i0", "apparel", ["Palm Print", "Geo Print"], "Open-collar rayon shirt with an all-over print. Light, drapey and made for holidays."],
  ["Shirts", "Field Overshirt", 2299, 0, "flannel-shirt", "apparel", ["Olive", "Rust"], "A heavier cotton overshirt with two chest pockets. Wear it as a light jacket or over a tee."],

  // ---- Jeans
  ["Jeans", "Slim Fit Stretch Jeans", 1999, 0, "jeans-men", "waist", ["Indigo", "Black"], "Soft stretch denim in a slim fit that moves with you. Mid-rise, five-pocket and built for everyday wear."],
  ["Jeans", "Straight Fit Jeans", 2099, 0, "jeans-men", "waist", ["Mid Blue", "Dark Indigo"], "A classic straight leg in rigid-feel denim. Comfortable through the thigh with a clean, even line."],
  ["Jeans", "Relaxed Baggy Jeans", 2299, 10, "jeans-men", "waist", ["Washed Blue", "Washed Black"], "Wide-leg, low-slung and roomy, the 90s way. Heavy 12 oz denim with a faded wash."],
  ["Jeans", "Tapered Fit Jeans", 2199, 0, "jeans-men", "waist", ["Indigo", "Grey"], "Room in the thigh, narrower at the ankle. A modern cut that works with sneakers or boots."],
  ["Jeans", "Black Skinny Jeans", 1899, 15, "jeans-men", "waist", ["Jet Black"], "High-stretch black denim that keeps its colour. A close fit from hip to ankle."],
  ["Jeans", "Light Wash Jeans", 1999, 0, "jeans-men", "waist", ["Ice Blue", "Sky Wash"], "A sun-faded light wash with subtle whiskering. Pairs with white tees and everything else."],
  ["Jeans", "Raw Selvedge Jeans", 3499, 0, "jeans-men", "waist", ["Raw Indigo"], "Unwashed 14 oz selvedge denim. Stiff at first, then it fades to the way you wear it."],

  // ---- Trousers
  ["Trousers", "Stretch Chinos", 1799, 0, "trousers-i3", "waist", ["Khaki", "Navy", "Olive"], "Cotton-stretch chinos with a slim-straight fit. Smart-casual and comfortable all day."],
  ["Trousers", "Utility Cargo Pants", 2199, 10, "cargo-pants", "waist", ["Olive", "Stone"], "Relaxed cargos with six pockets in sturdy cotton twill. Practical and good looking."],
  ["Trousers", "Fleece Joggers", 1399, 0, "joggers", "apparel", ["Grey Melange", "Black"], "Brushed-fleece joggers with a drawcord waist, side pockets and ribbed cuffs."],
  ["Trousers", "Tailored Formal Trousers", 2299, 0, "trousers-i3", "waist", ["Charcoal", "Navy"], "Flat-front trousers in a wool-blend suiting fabric with a clean crease and a comfortable waistband."],
  ["Trousers", "Linen Drawstring Pants", 1699, 15, "trousers-i3", "apparel", ["Sand", "White"], "Easy pull-on linen trousers with an elastic drawstring waist. Cool and light for summer."],
  ["Trousers", "Everyday Track Pants", 1199, 0, "joggers", "apparel", ["Black", "Navy"], "Lightweight stretch track pants with a tapered leg and zip pockets."],

  // ---- Jackets
  ["Jackets", "Satin Bomber Jacket", 3499, 0, "bomber-jacket", "apparel", ["Copper", "Black"], "A glossy satin bomber with ribbed cuffs and a zip front. The one piece that finishes the outfit."],
  ["Jackets", "Classic Denim Jacket", 2999, 0, "denim-jacket-men", "apparel", ["Mid Blue", "Black"], "A structured trucker jacket in washed denim. Gets better as it breaks in."],
  ["Jackets", "Vegan Leather Biker Jacket", 4499, 10, "leather-jacket", "apparel", ["Black"], "An asymmetric-zip biker in soft vegan leather with a quilted lining."],
  ["Jackets", "Quilted Puffer Jacket", 3999, 20, "puffer-men", "apparel", ["Black", "Olive"], "Lightweight puffer with a warm synthetic fill, a stand collar and zipped pockets."],
  ["Jackets", "Packable Windbreaker", 2499, 0, "windbreaker", "apparel", ["Slate", "Navy"], "Water-resistant ripstop that folds into its own pocket. A light layer for rain and wind."],
  ["Jackets", "Unstructured Blazer", 4999, 0, "blazer-i3", "apparel", ["Charcoal", "Navy"], "A soft-shouldered, half-lined blazer in a textured blend. Dresses up a tee or dresses down a shirt."],
  ["Jackets", "Varsity Jacket", 3799, 15, "bomber-jacket", "apparel", ["Navy/Cream", "Black/Grey"], "Wool-blend body with ribbed trims and snap buttons, a campus classic in clean colours."],

  // ---- Hoodies & Sweatshirts
  ["Hoodies & Sweatshirts", "Pullover Hoodie", 1799, 0, "hoodie-i3", "apparel", ["Black", "Grey Melange", "Navy"], "Midweight brushed-fleece hoodie with a double-layer hood and a kangaroo pocket."],
  ["Hoodies & Sweatshirts", "Zip-Through Hoodie", 1999, 10, "zip-hoodie", "apparel", ["Grey Melange", "Charcoal"], "A full-zip hoodie in soft loopback cotton with metal-tipped drawcords."],
  ["Hoodies & Sweatshirts", "Crewneck Sweatshirt", 1499, 0, "sweatshirt", "apparel", ["Black", "Navy", "Cream"], "A clean crewneck in 320 GSM terry cotton with a ribbed hem and cuffs."],
  ["Hoodies & Sweatshirts", "Oversized Hoodie", 2199, 0, "hoodie-i3", "apparel", ["Washed Black", "Stone"], "An oversized, dropped-shoulder hoodie in heavyweight fleece with a washed finish."],
  ["Hoodies & Sweatshirts", "Quarter-Zip Sweatshirt", 1799, 15, "sweatshirt", "apparel", ["Navy", "Forest"], "A pullover with a short zip and a stand collar. Smarter than a hoodie, as warm as one."],
  ["Hoodies & Sweatshirts", "Chunky Knit Sweater", 2499, 0, "sweater", "apparel", ["Navy/Grey", "Cream"], "A textured, stripe-knit sweater in a soft cotton-acrylic blend. Layers over a shirt or a tee."],

  // ---- Footwear
  ["Footwear", "Court Low Sneakers", 2999, 0, "sneakers-white", "shoe", ["White", "Off White"], "Clean leather-look low-tops with a cushioned insole and a durable rubber cupsole."],
  ["Footwear", "Chunky Street Sneakers", 3499, 10, "chunky-sneakers", "shoe", ["White/Navy", "Grey/Red"], "A bold, chunky-soled sneaker with a mesh and synthetic upper for all-day comfort."],
  ["Footwear", "Leather Penny Loafers", 3299, 0, "loafers", "shoe", ["Tan", "Brown"], "Hand-finished leather loafers with a flexible sole. Wear them with or without socks."],
  ["Footwear", "Chelsea Boots", 4299, 0, "boots", "shoe", ["Dark Brown"], "Full-grain leather Chelsea boots with elastic side panels and a stacked heel."],
  ["Footwear", "Cushioned Slides", 899, 0, "slides", "shoe", ["Navy", "Black"], "Moulded footbed slides with a double strap. Easy for the house, the beach or the gym."],
  ["Footwear", "Featherlight Runners", 3799, 20, "running-shoes-i1", "shoe", ["Black/Lime", "Grey/Orange"], "Breathable knit runners with responsive foam and a grippy outsole."],
  ["Footwear", "Derby Formal Shoes", 3999, 0, "formal-shoes", "shoe", ["Black"], "Polished leather derbies with a cushioned footbed and a Goodyear-style welt look."],

  // ---- Accessories
  ["Accessories", "Reversible Leather Belt", 999, 0, "belt", "belt", ["Black/Brown"], "One belt, two colours: black on one side, brown on the other. Rotating buckle."],
  ["Accessories", "Slim Leather Wallet", 1299, 10, "wallet-pocket", "none", ["Brown"], "A slim bifold with six card slots and a full-length bill pocket, in soft leather."],
  ["Accessories", "Everyday Cap", 699, 0, "cap", "none", ["Stone", "Black"], "A six-panel cotton cap with an adjustable strap and a curved brim."],
  ["Accessories", "Ribbed Beanie", 599, 0, "beanie", "none", ["Black", "Charcoal"], "A stretchy ribbed-knit beanie with a soft inner lining. One size."],
  ["Accessories", "Aviator Sunglasses", 1499, 15, "sunglasses-men", "none", ["Gold/Green"], "Lightweight metal aviators with UV400 lenses and adjustable nose pads."],
  ["Accessories", "Minimal Analog Watch", 3499, 0, "wristwatch-i0", "none", ["Black/Steel"], "A 40 mm analog watch with a sapphire-coated dial, mesh strap and 3 ATM water resistance."],
  ["Accessories", "Daypack Backpack", 2499, 0, "backpack-leather", "none", ["Black"], "A water-resistant backpack with a padded 15-inch laptop sleeve and two side pockets."],
  ["Accessories", "Ankle Socks (Pack of 3)", 499, 0, "socks", "none", ["Assorted"], "Soft combed-cotton ankle socks with a cushioned sole. A pack of three."],
  ["Accessories", "Wool-Blend Scarf", 1199, 0, "scarf", "none", ["Black", "Charcoal"], "A soft, wide wool-blend scarf with fringed ends. Warm without being bulky."],
  ["Accessories", "Printed Silk Tie", 899, 20, "tie", "none", ["Multi Dot"], "A woven silk-blend tie with a classic dot pattern. 7 cm width."],
];

const CODE = { "T-Shirts": "TEE", Shirts: "SHT", Jeans: "JNS", Trousers: "TRS", Jackets: "JKT", "Hoodies & Sweatshirts": "HOD", Footwear: "FTW", Accessories: "ACC" };
let seed = 20261126;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const counters = {};
const catalog = P.map(([category, name, price, discount, photo, sizeType, colours, description]) => {
  counters[category] = (counters[category] || 0) + 1;
  const sku = `VY-${CODE[category]}-${String(counters[category]).padStart(3, "0")}`;
  const sizes = SIZES[sizeType];
  let variants;
  if (sizes) {
    variants = [];
    for (const color of colours) {
      for (const size of sizes) {
        const roll = rnd();
        variants.push({ size, color, stockQuantity: roll < 0.1 ? 0 : 3 + Math.floor(rnd() * 22) });
      }
    }
  }
  const stock = variants ? variants.reduce((s, v) => s + v.stockQuantity, 0) : 20 + Math.floor(rnd() * 60);
  const colourLine = colours.length > 1 || sizes ? `\n\nColours: ${colours.join(", ")}.` : "";
  return {
    sku,
    name: `VAYU ${name}`,
    brand: "VAYU",
    description: description + colourLine,
    category,
    price,
    discountPercentage: discount,
    rating: Math.round((4.0 + rnd() * 0.8) * 10) / 10,
    reviewCount: 8 + Math.floor(rnd() * 470),
    stockQuantity: stock,
    imageUrl: `/products/photos/${photo}.webp`,
    thumbnailUrl: `/products/photos/${photo}.webp`,
    availability: stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
    ...(variants ? { variants } : {}),
  };
});
writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");
const perCat = Object.entries(counters).map(([c, n]) => `${c}: ${n}`).join(", ");
console.log(`wrote ${catalog.length} products (${perCat}), ${catalog.reduce((s, p) => s + (p.variants?.length || 0), 0)} size rows`);
