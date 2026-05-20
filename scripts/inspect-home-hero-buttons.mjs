import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = "reports/home-button-inspect";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`http://127.0.0.1:5176/?fresh=${Date.now()}`, {
  waitUntil: "networkidle",
});

const result = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll("a, button"));

  return items
    .map((el, index) => {
      const text = (el.textContent || "").trim();
      const styles = window.getComputedStyle(el);
      const parent = el.parentElement;
      const grandparent = parent?.parentElement;
      const rect = el.getBoundingClientRect();

      return {
        index,
        tag: el.tagName,
        text,
        href: el.getAttribute("href"),
        className: el.className,
        id: el.id,
        role: el.getAttribute("role"),
        type: el.getAttribute("type"),
        disabled: "disabled" in el ? el.disabled : null,
        inlineStyle: el.getAttribute("style"),
        parentTag: parent?.tagName,
        parentClass: parent?.className,
        grandparentTag: grandparent?.tagName,
        grandparentClass: grandparent?.className,
        color: styles.color,
        webkitTextFillColor: styles.webkitTextFillColor,
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor,
        opacity: styles.opacity,
        display: styles.display,
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y,
      };
    })
    .filter((item) =>
      ["browse marketplace", "find an item", "sell / pawn item", "dashboard"].some((word) =>
        item.text.toLowerCase().includes(word),
      ),
    );
});

fs.writeFileSync(
  path.join(outDir, "home-hero-buttons.json"),
  JSON.stringify(result, null, 2),
);

await page.screenshot({
  path: path.join(outDir, "home-hero-buttons.png"),
  fullPage: true,
});

console.log(JSON.stringify(result, null, 2));
console.log("");
console.log(`Saved: ${outDir}/home-hero-buttons.json`);
console.log(`Saved: ${outDir}/home-hero-buttons.png`);

await browser.close();
