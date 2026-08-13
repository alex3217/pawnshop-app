import { expect, test, type Page } from "@playwright/test";

const linkedItemImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const auction = {
  id: "auction-readable-1",
  itemId: "item-linked-1",
  shopId: "shop-1",
  status: "SCHEDULED",
  startingPrice: "125.50",
  currentPrice: "148.75",
  minIncrement: "7.25",
  startsAt: "2020-01-01T12:00:00.000Z",
  endsAt: "2099-01-01T12:00:00.000Z",
  extendedEndsAt: "2099-01-02T12:00:00.000Z",
  item: {
    id: "item-linked-1",
    title: "Linked auction item",
    description: "Public auction card regression fixture",
    category: "Jewelry",
    condition: "Excellent",
    images: [linkedItemImage],
  },
  shop: {
    id: "shop-1",
    name: "Readable Pawn",
  },
};

async function mockAuctions(
  page: Page,
  row: Record<string, unknown> = auction,
) {
  await page.route("**/api/auctions?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        page: 1,
        limit: 100,
        total: 1,
        rows: [row],
      }),
    });
  });
}

test("one public auction stays bounded and renders API values visibly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockAuctions(page);
  await page.goto("/auctions");

  const card = page.locator(".auction-result-card");
  const image = card.locator(".auction-result-image");
  const frame = card.locator(".auction-result-image-frame");

  await expect(card).toHaveCount(1);
  await expect(card.getByText("$148.75", { exact: true })).toBeVisible();
  await expect(card.getByText("$125.50", { exact: true })).toBeVisible();
  await expect(card.getByText("$7.25", { exact: true })).toBeVisible();
  await expect(card.getByText("Excellent", { exact: true })).toBeVisible();
  await expect(card.getByRole("status", { name: "Auction status: LIVE" })).toBeVisible();
  await expect(image).toHaveAttribute("src", linkedItemImage);
  await expect(card.getByRole("link", { name: "View Item" })).toHaveAttribute(
    "href",
    "/items/item-linked-1",
  );
  await expect(card.getByRole("link", { name: "View Shop" })).toHaveAttribute(
    "href",
    "/shops/shop-1",
  );

  const geometry = await page.evaluate(() => {
    const cardElement = document.querySelector<HTMLElement>(".auction-result-card")!;
    const frameElement = document.querySelector<HTMLElement>(".auction-result-image-frame")!;
    const imageElement = document.querySelector<HTMLElement>(".auction-result-image")!;
    return {
      cardWidth: cardElement.getBoundingClientRect().width,
      frameWidth: frameElement.getBoundingClientRect().width,
      frameHeight: frameElement.getBoundingClientRect().height,
      objectFit: getComputedStyle(imageElement).objectFit,
      objectPosition: getComputedStyle(imageElement).objectPosition,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(geometry.cardWidth).toBeLessThanOrEqual(400);
  expect(geometry.frameWidth / geometry.frameHeight).toBeCloseTo(4 / 3, 1);
  expect(geometry.objectFit).toBe("cover");
  expect(geometry.objectPosition).toBe("50% 50%");
  expect(geometry.overflow).toBe(0);

  await expect(frame).toBeVisible();
  await expect(card.getByText("Jan 2, 2099", { exact: false })).toBeVisible();
});

test("missing auction values use fallbacks and remain readable in both themes", async ({
  page,
}) => {
  await mockAuctions(page, {
    ...auction,
    startingPrice: null,
    currentPrice: "invalid",
    minIncrement: "",
    startsAt: null,
    endsAt: "invalid",
    extendedEndsAt: null,
    item: { ...auction.item, condition: null, images: [] },
  });
  await page.goto("/auctions");

  const card = page.locator(".auction-result-card");
  await expect(card.getByText("Unavailable", { exact: true })).toHaveCount(5);
  await expect(card.getByText("Not listed", { exact: true })).toBeVisible();
  await expect(card.getByText("$0.00", { exact: true })).toHaveCount(0);
  await expect(card.getByRole("img", { name: "Linked auction item photo unavailable" })).toBeVisible();

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((nextTheme) => {
      document.documentElement.dataset.theme = nextTheme;
    }, theme);

    const contrast = await card.locator("dd").first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        fill: style.webkitTextFillColor,
        background: getComputedStyle(element.closest("article")!).backgroundColor,
      };
    });

    expect(contrast.color).toBe(contrast.fill);
    expect(contrast.color).not.toBe(contrast.background);
  }
});

test("public auction card does not overflow a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockAuctions(page);
  await page.goto("/auctions");
  await expect(page.locator(".auction-result-card")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".auction-result-card")!;
    return {
      cardWidth: card.getBoundingClientRect().width,
      viewportWidth: document.documentElement.clientWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(metrics.cardWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.overflow).toBe(0);
});
