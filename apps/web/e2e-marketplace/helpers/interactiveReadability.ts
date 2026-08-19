import { expect, type Locator, type Page } from "@playwright/test";

export type InteractionState =
  | "default"
  | "hover"
  | "focus-visible"
  | "active";

export type ControlMeasurement = {
  selector: string;
  name: string;
  state: InteractionState;
  color: string;
  textFillColor: string;
  backgroundColor: string;
  opacity: number;
  contrastRatio: number;
  width: number;
  height: number;
  focusOutlineColor: string;
  focusOutlineWidth: number;
  focusContrastRatio: number;
};

type Rgba = [number, number, number, number];

type InteractionMeasurementOptions = {
  interactionTimeoutMs?: number;
};

function rgba(value: string): Rgba {
  const values = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground[3] + background[3] * (1 - foreground[3]);
  if (alpha === 0) return [255, 255, 255, 1];
  return [
    (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
    (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
    (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
    alpha,
  ];
}

function luminance(color: Rgba) {
  const channels = color.slice(0, 3).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = luminance(rgba(foreground));
  const backgroundLuminance = luminance(rgba(background));
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

async function applyState(
  page: Page,
  locator: Locator,
  state: InteractionState,
  interactionTimeoutMs: number,
) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  if (state === "hover") await locator.hover({ force: true, timeout: interactionTimeoutMs });
  if (state === "focus-visible") {
    await locator.evaluate((element) => (element as HTMLElement).focus());
  }
  if (state === "active") {
    await locator.hover({ force: true, timeout: interactionTimeoutMs });
    await page.mouse.down();
  }
}

export async function measureControl(
  page: Page,
  locator: Locator,
  state: InteractionState,
  { interactionTimeoutMs = 500 }: InteractionMeasurementOptions = {},
): Promise<ControlMeasurement> {
  await applyState(page, locator, state, interactionTimeoutMs);
  const measurement = await locator.evaluate((element, measuredState) => {
    const style = getComputedStyle(element);
    let background = style.backgroundColor;
    let ancestor = element.parentElement;
    while (rgbaAlpha(background) === 0 && ancestor) {
      background = getComputedStyle(ancestor).backgroundColor;
      ancestor = ancestor.parentElement;
    }
    const box = element.getBoundingClientRect();
    return {
      selector: element.id ? `#${element.id}` : element.className || element.tagName.toLowerCase(),
      name: element.getAttribute("aria-label") || element.textContent?.trim() || "",
      state: measuredState,
      color: style.color,
      textFillColor: style.getPropertyValue("-webkit-text-fill-color") || style.color,
      backgroundColor: background,
      opacity: Number(style.opacity),
      width: box.width,
      height: box.height,
      focusOutlineColor: style.outlineColor,
      focusOutlineWidth: Number.parseFloat(style.outlineWidth) || 0,
    };

    function rgbaAlpha(value: string) {
      const match = value.match(/[\d.]+/g);
      return match?.[3] === undefined ? 1 : Number(match[3]);
    }
  }, state);
  if (state === "active") {
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
  const foreground = composite(rgba(measurement.textFillColor), rgba(measurement.backgroundColor));
  return {
    ...measurement,
    contrastRatio: contrastRatio(
      `rgb(${foreground[0]}, ${foreground[1]}, ${foreground[2]})`,
      measurement.backgroundColor,
    ),
    focusContrastRatio: contrastRatio(
      measurement.focusOutlineColor,
      measurement.backgroundColor,
    ),
  };
}

export function expectReadable(
  measurement: ControlMeasurement,
  context: { route: string; role: string; theme: string; viewport: string },
) {
  const details = JSON.stringify({ ...context, ...measurement });
  expect(measurement.name, details).not.toBe("");
  expect(measurement.opacity, details).toBeGreaterThan(0);
  expect(measurement.textFillColor, details).not.toBe("rgba(0, 0, 0, 0)");
  expect(measurement.contrastRatio, details).toBeGreaterThanOrEqual(4.5);
  if (measurement.state === "focus-visible") {
    expect(measurement.focusOutlineWidth, details).toBeGreaterThan(0);
    expect(measurement.focusContrastRatio, details).toBeGreaterThanOrEqual(3);
  }
}
