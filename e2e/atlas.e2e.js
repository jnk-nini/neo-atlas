import { expect, test } from "@playwright/test";

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
// A ticket shaped like the hub's (the browser only reads the name, role and expiry; the API checks the signature).
const TICKET = `${b64({ alg: "HS256" })}.${b64({ username: "tester", role: "user", exp: 4102444800 })}.signature`;

const rock = (n, date) => ({
  neo_reference_id: String(2000000 + n),
  name: `${n} Test Rock (${date.slice(0, 4)} XX)`,
  estimated_diameter_km: 0.3 + n / 10,
  is_potentially_hazardous: n === 2,
  close_approach_date: date,
  relative_velocity_km_h: 40000 + n * 1000,
  miss_distance_km: 3_000_000 * n,
  absolute_magnitude: 20 + n,
  is_featured: false,
});

/** A guest (no ticket) is served nothing for this day; a visitor with a ticket gets three asteroids. */
async function mockApi(page) {
  await page.route("**/api/neo/asteroids**", async (route) => {
    const ticket = route.request().headers()["x-aegisneo-ticket"];
    const list = ticket ? [rock(1, "1990-11-24"), rock(2, "2001-11-24"), rock(3, "2015-11-24")] : [];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        count: list.length,
        matched: list.length,
        total: ticket ? 33511 : 10,
        offset: 0,
        limit: 100,
        asteroids: list,
      }),
    });
  });
}

async function revealBirthday(page) {
  await page.getByRole("button", { name: /Reveal my stars/ }).click();
  await expect(
    page.getByText(/real asteroids that passed Earth|real asteroids passed Earth/).first(),
  ).toBeVisible();
}

test("a guest whose sky is empty is told why, with a way to sign in", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await revealBirthday(page);
  await expect(page.locator(".sky-guest")).toContainText("Guests see only 10 featured asteroids");
  await expect(page.locator(".sky-guest a")).toHaveAttribute("href", /aegisneo-hub\.vercel\.app\/auth/);
  await expect(page.locator(".aegis-pill")).toContainText("Guest mode");
});

test("a visitor from the hub gets the whole catalog, and the ticket leaves the address bar", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto(`/#aegis_ticket=${TICKET}`);
  await expect(page).not.toHaveURL(/aegis_ticket/);
  await revealBirthday(page);
  await expect(
    page.getByText("Made from 3 real asteroids that passed Earth on 24 Nov").first(),
  ).toBeVisible();
  await expect(page.locator(".sky-guest")).toHaveCount(0);
  await expect(page.locator(".aegis-pill")).toContainText("@tester");
  await expect(page.locator(".aegis-pill a")).toHaveAttribute("href", "https://aegisneo-hub.vercel.app/hub");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the hub badge is a small dot at the top and never covers the tab bar", async ({ page }) => {
    await mockApi(page);
    await page.goto(`/#aegis_ticket=${TICKET}`);
    await revealBirthday(page);
    const toggle = page.locator(".aegis-toggle");
    await expect(toggle).toBeVisible();
    const box = await toggle.boundingBox();
    expect(box.y).toBeLessThan(60);
    const list = page
      .getByRole("tab", { name: /List/ })
      .or(page.getByRole("button", { name: /List/ }))
      .first();
    await list.tap();
    await expect(page.locator(".aegis-pill")).toBeVisible();
    await toggle.tap();
    await expect(page.locator(".aegis-pill")).toHaveAttribute("data-open", "true");
    await expect(page.locator(".aegis-pill .aegis-body")).toContainText("@tester");
  });

  test("nothing scrolls sideways", async ({ page }) => {
    await mockApi(page);
    await page.goto(`/#aegis_ticket=${TICKET}`);
    await revealBirthday(page);
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth > (window.visualViewport?.width ?? innerWidth) + 1,
    );
    expect(wide).toBe(false);
  });
});
