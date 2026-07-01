// Resize public/icon-absen-512.png → public/icon-absen-192.png
// Jalankan: node scripts/resize-icon.js
const sharp = require("sharp");
const path = require("path");

const src = path.join(__dirname, "..", "public", "icon-absen-512.png");
const out = path.join(__dirname, "..", "public", "icon-absen-192.png");

sharp(src)
  .resize(192, 192)
  .toFile(out)
  .then(() => console.log("✓ Dibuat:", out))
  .catch((err) => {
    console.error("✗ Gagal resize. Pastikan public/icon-absen-512.png ada.");
    console.error(err.message);
    process.exit(1);
  });
