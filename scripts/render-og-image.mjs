import { chromium } from "@playwright/test";
import path from "path";
import fs from "fs";

const ROOT_DIR = process.cwd();
const svgPath = path.join(ROOT_DIR, "public", "brand", "opengraph-cover.svg");
const pngPath = path.join(ROOT_DIR, "public", "brand", "opengraph-cover.png");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2, // Retina 2x crispness
  });

  const svgContent = fs.readFileSync(svgPath, "utf-8");
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { width: 1200px; height: 630px; overflow: hidden; background: #020617; }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>
  `);

  await page.screenshot({ path: pngPath, type: "png" });
  await browser.close();
  console.log(`[SUCCESS] Rendered ${pngPath}`);
}

main().catch((err) => {
  console.error("Failed to render OG image:", err);
  process.exit(1);
});
