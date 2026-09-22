(() => {
  const invoke = window.__TAURI__?.core?.invoke;
  const isNative = typeof invoke === "function";
  async function call(command, payload) {
    if (!isNative) throw new Error("Search and browsing require the installed Sreon desktop app.");
    return invoke(command, payload);
  }
  if (isNative) {
    window.sreonRuntime = Object.freeze({
      isNative,
      externalLinks: false,
      search: (q, category = "web", cursor = null) => call("search", { request: { q, category, cursor } }),
      openPage: (url) => call("open_page", { url }),
      navigate: (action) => call("navigate", { action }),
    });
    document.documentElement.classList.add("native-app");
    for (const name of ["focus-search", "location"])
      window.__TAURI__.event?.listen(`sreon:${name}`, (event) => window.dispatchEvent(new CustomEvent(`sreon:${name}`, { detail: event.payload }))).catch(() => {});
    return;
  }
  window.sreonRuntime = Object.freeze(window.SreonBrowserRuntime.createRuntime());
  document.documentElement.classList.add("browser-demo");
})();
