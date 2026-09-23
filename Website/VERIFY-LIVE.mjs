#!/usr/bin/env node
// Confirms a deployed Sreon website serves the fixed Try-it search.
// Usage: node VERIFY-LIVE.mjs [https://opensreon.com]
const base = process.argv[2] || "https://opensreon.com";
const join = (path) => new URL(path, base.endsWith("/") ? base : base + "/");

const checks = [
  ["landing page", async () => {
    const page = await (await fetch(join("index.html"), { redirect: "follow" })).text();
    return [
      page.includes("site/assets/runtime.js") && "runtime module referenced",
      page.includes('data-kind="videos"') && "YouTube chip present",
      page.includes('data-query=') && "suggestions present",
      page.includes("SearXNG") && "full-web search described on the page",
    ];
  }],
  ["runtime module", async () => {
    const code = await (await fetch(join("site/assets/runtime.js"), { redirect: "follow" })).text();
    return [
      code.includes("createRuntime") && "createRuntime exported",
      code.includes("searx.be") && "SearXNG full-web sources present",
      code.includes("format=json") && "SearXNG JSON API used",
      code.includes("pipedapi") && "YouTube Piped sources present",
      code.includes("commons.wikimedia.org") && "Commons source present",
      code.includes("globalThis.SreonSiteRuntime") && "global registration present",
    ];
  }],
  ["updated site.js", async () => {
    const code = await (await fetch(join("site/assets/site.js"), { redirect: "follow" })).text();
    return [
      code.includes("SreonSiteRuntime") && "fallback wiring present",
      code.includes("target = '_blank'") && "new-tab anchors present",
    ];
  }],
];

let ok = true;
for (const [name, run] of checks) {
  try {
    const parts = await run();
    const passed = parts.filter(Boolean);
    if (passed.length !== parts.length) ok = false;
    console.log(`${passed.length === parts.length ? "PASS" : "FAIL"}  ${name}: ${passed.join(", ") || "nothing found"}`);
  } catch (error) {
    ok = false;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
console.log(ok ? "\nDeployed site looks correct — open it and search the web and YouTube." : "\nSite is missing the fix — re-check the uploaded files.");
process.exit(ok ? 0 : 1);
