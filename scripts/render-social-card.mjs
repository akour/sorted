import sharp from "sharp";
await sharp(new URL("../public/social-card.svg", import.meta.url).pathname).png().toFile(new URL("../public/social-card.png", import.meta.url).pathname);
console.log("Rendered public/social-card.png (1200 × 630).");
