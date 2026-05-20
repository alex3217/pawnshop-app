import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = "reports/marketplace-button-inspect";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`http://127.0.0.1:5176/marketplace?fresh=${Date.now()}`, {
  waitUntil: "networkidle",
});

const result = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button"));

  return buttons
    .map((button, index) => {
      const text = (button.textContent || "").trim();
      const styles = window.getComputedStyle(button);
      const parent = button.parentElement;
      const rect = button.getBoundingClientRect();

      return {
        index,
        text,
        className: button.className,
        id: button.id,
        type: button.getAttribute("type"),
        disabled: button.disabled,
        ariaPressed: button.getAttribute("aria-pressed"),
        ariaSelected: button.getAttribute("aria-selected"),
        dataActive: button.getAttribute("data-active"),
        inlineStyle: button.getAttribute("style"),
        parentTag: parent?.tagName,
        parentClass: parent?.className,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor,
        opacity: styles.opacity,
        display: styles.display,
        width: rect.width,
        height: rect.height,
      };
    })
    .filter((item) =>
      ["clear", "grid", "list", "map"].some((word) =>
        item.text.toLowerCase().includes(word),
      ),
    );
});

fs.writeFileSync(
  path.join(outDir, "marketplace-buttons.json"),
  JSON.stringify(result, null, 2),
);

await page.screenshot({
  path: path.join(outDir, "marketplace-buttons.png"),
  fullPage: true,
});

console.log(JSON.stringify(result, null, 2));
console.log("");
console.log(`Saved: ${outDir}/marketplace-buttons.json`);
console.log(`Saved: ${outDir}/marketplace-buttons.png`);

await browser.close();
