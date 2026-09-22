import { test, expect } from "./interface-fixture.js";

async function app(page, mode = "normal") {
  await page.addInitScript(({ mode }) => {
    window.calls = [];
    window.__TAURI__ = {
      event: { listen: async () => () => {} },
      core: { invoke: async (command, payload) => {
        window.calls.push({ command, payload });
        if (command !== "search") return null;
        const { q, category, cursor } = payload.request;
        if (mode === "error" && window.calls.filter(x => x.command === "search").length === 1) throw { message: "Web search is unavailable right now." };
        if (mode === "race" && q === "old") await new Promise(resolve => setTimeout(resolve, 400));
        const item = { title: mode === "unsafe" ? "<img src=x onerror=alert(1)>" : `${q}${cursor ? " page 2" : ""}`, url: "https://www.youtube.com/", content: "Watch and share videos.", thumbnail: category === "images" ? "https://thumb.wikimedia.org/example.jpg" : null, credit: category === "images" ? "Photographer · CC BY-SA" : null };
        return { results: mode === "empty" ? [] : [item], overview: category === "web" && mode !== "empty" ? [item] : [], nextCursor: cursor ? null : { source: "web", fields: { s: "10", vqd: "test" } }, notice: category === "images" ? "Images from Wikimedia Commons." : null };
      } },
    };
  }, { mode });
  await page.goto("/");
}

async function search(page, q) {
  await page.getByRole("searchbox").fill(q);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

test("start page retains logo, media tabs, and dark mode without settings", async ({ page }) => {
  await app(page);
  await expect(page.getByRole("img", { name: "Sreon logo" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Dark mode" })).toBeVisible();
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/settings|service address|open source/i);
});

test("keyword searches show actual website links through IPC", async ({ page }) => {
  await app(page);
  await search(page, "YouTube");
  await expect(page.locator("#results a")).toHaveAttribute("href", "https://www.youtube.com/");
  expect(await page.evaluate(() => window.calls.find(x => x.command === "search").payload)).toEqual({ request: { q: "YouTube", category: "web", cursor: null } });
});

test("domain input visits a website without sending it as a search", async ({ page }) => {
  await app(page);
  await search(page, "YouTube.com");
  await expect(page.locator("body")).toHaveClass(/browsing/);
  expect(await page.evaluate(() => window.calls)).toEqual([{ command: "open_page", payload: { url: "https://youtube.com/" } }]);
});

test("domain plus words remains a search", async ({ page }) => {
  await app(page);
  await search(page, "youtube.com music");
  await expect(page.locator("#results a")).toBeVisible();
  expect(await page.evaluate(() => window.calls.some(x => x.command === "open_page"))).toBe(false);
});

test("Shift-Return explicitly searches a domain", async ({ page }) => {
  await app(page);
  await page.getByRole("searchbox").fill("youtube.com");
  await page.getByRole("searchbox").press("Shift+Enter");
  await expect(page.locator("#results a")).toBeVisible();
  expect(await page.evaluate(() => window.calls.find(x => x.command === "search").payload.request.q)).toBe("youtube.com");
});

test("result opens in the same app view and Back restores its results", async ({ page, context }) => {
  await app(page);
  await search(page, "YouTube");
  await page.locator("#results a").click();
  await expect(page.locator("body")).toHaveClass(/browsing/);
  expect(context.pages()).toHaveLength(1);
  await page.getByRole("button", { name: "Back to results" }).click();
  await expect(page.locator("#results a")).toBeVisible();
  await expect(page.getByRole("button", { name: "Forward to website" })).toBeEnabled();
});

test("address field searches while a site is open", async ({ page }) => {
  await app(page);
  await search(page, "youtube.com");
  await page.getByLabel("Search or enter website", { exact: true }).fill("forests");
  await page.getByLabel("Search or enter website", { exact: true }).press("Enter");
  await expect(page.locator("#results a")).toHaveText("forests");
  await expect(page.locator("body")).not.toHaveClass(/browsing/);
});

test("overview references results rather than generating an unsupported answer", async ({ page }) => {
  await app(page);
  await search(page, "YouTube");
  await expect(page.locator("#overview")).toContainText("Excerpts from the top results");
  await expect(page.locator("#overview a")).toHaveAttribute("href", "https://www.youtube.com/");
});

test("image category requests real media data and displays attribution", async ({ page }) => {
  await page.route("https://thumb.wikimedia.org/**", route => route.abort());
  await app(page);
  await search(page, "forest");
  await page.getByRole("tab", { name: "Images", exact: true }).click();
  await expect(page.locator("#notice")).toContainText("Commons");
  await expect(page.locator(".credit")).toContainText("Photographer · CC BY-SA");
  await expect(page.locator("#overview")).toBeHidden();
  expect(await page.evaluate(() => window.calls.filter(x => x.command === "search").at(-1).payload.request.category)).toBe("images");
});

test("photos and videos have separate category requests", async ({ page }) => {
  await app(page);
  await search(page, "forest");
  for (const name of ["Photos", "Videos"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => window.calls.filter(x => x.command === "search").at(-1).payload.request.category)).toBe(name.toLowerCase());
  }
});

test("theme persists and obsolete preferences are cleared", async ({ page }) => {
  await app(page);
  await page.getByRole("button", { name: "Dark mode" }).click();
  await page.evaluate(() => { localStorage.setItem("sreon.preferences", "bad json"); localStorage.setItem("sreon.endpoint", "old"); });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["sreon.theme"]);
});

test("errors can be retried without encyclopedia substitution", async ({ page }) => {
  await app(page, "error");
  await search(page, "YouTube");
  await expect(page.getByRole("status")).toContainText("Web search is unavailable");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("#results a")).toBeVisible();
});

test("pagination uses opaque source cursors", async ({ page }) => {
  await app(page);
  await search(page, "YouTube");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("#results a")).toHaveText("YouTube page 2");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.locator("#results a")).toHaveText("YouTube");
  expect(await page.evaluate(() => window.calls.filter(x => x.command === "search").length)).toBe(2);
});

test("older searches cannot overwrite a newer query", async ({ page }) => {
  await app(page, "race");
  await search(page, "old");
  await search(page, "new");
  await page.waitForTimeout(500);
  await expect(page.locator("#results a")).toHaveText("new");
});

test("unsafe result markup stays text", async ({ page }) => {
  await app(page, "unsafe");
  await search(page, "test");
  await expect(page.locator("#results a")).toHaveText("<img src=x onerror=alert(1)>");
  await expect(page.locator("#results img")).toHaveCount(0);
});

test("narrow windows retain the address field without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 560 });
  await app(page);
  await expect(page.getByLabel("Search or enter website", { exact: true })).toBeInViewport();
  await search(page, "forest");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("interface refuses search without the native runtime", async ({ page }) => {
  await page.goto("/");
  await search(page, "forest");
  await expect(page.getByRole("status")).toContainText("installed Sreon desktop app");
  await expect(page.locator("#results a")).toHaveCount(0);
});

test("address navigation still works when a media category is selected", async ({ page }) => {
  await app(page);
  await page.getByRole("tab", { name: "Videos", exact: true }).click();
  await page.getByLabel("Search or enter website", { exact: true }).fill("youtube.com");
  await page.getByLabel("Search or enter website", { exact: true }).press("Enter");
  await expect(page.locator("body")).toHaveClass(/browsing/);
  expect(await page.evaluate(() => window.calls.find(x => x.command === "open_page").payload.url)).toBe("https://youtube.com/");
});
