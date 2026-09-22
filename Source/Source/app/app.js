(() => {
  const $ = (id) => document.getElementById(id);
  const input = $("search-input");
  const address = $("address-input");
  const results = $("results");
  const status = $("status");
  let query = "";
  let category = "web";
  let sequence = 0;
  let pages = [];
  let pageIndex = 0;
  let pendingCursor = null;
  let browsing = false;
  let lastWebsite = "";

  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url : null;
    } catch { return null; }
  };

  function directUrl(value) {
    if (/\s/.test(value)) return null;
    if (/^https?:\/\//i.test(value)) return safeUrl(value);
    if (/^[\p{L}\p{N}](?:[\p{L}\p{N}-]*\.)+[\p{L}]{2,}(?::\d+)?(?:[/?#].*)?$/u.test(value)) return safeUrl(`https://${value}`);
    return null;
  }

  function showError(error) {
    $("results-section").hidden = false;
    status.textContent = error?.message || "Something went wrong. Please try again.";
  }

  function setBrowsing(value) {
    browsing = value;
    document.body.classList.toggle("browsing", value);
    $("back").disabled = !value;
    $("forward").disabled = value || !lastWebsite;
  }

  async function returnToSearch() {
    if (window.sreonRuntime.isNative) await window.sreonRuntime.navigate("search");
    setBrowsing(false);
    address.value = query;
  }

  async function openPage(raw) {
    const url = safeUrl(raw);
    if (!url) return;
    sequence++;
    if (window.sreonRuntime.externalLinks) {
      try { await window.sreonRuntime.openPage(url.href); lastWebsite = url.href; }
      catch (error) { showError(error); }
      return;
    }
    setBrowsing(true);
    address.value = url.href;
    try {
      await window.sreonRuntime.openPage(url.href);
      lastWebsite = url.href;
    } catch (error) {
      setBrowsing(false);
      showError(error);
    }
  }

  function linkTo(url, title) {
    const link = document.createElement("a");
    link.href = url;
    link.textContent = title;
    if (window.sreonRuntime.externalLinks) {
      link.target = "_blank";
      link.rel = "noopener";
      link.addEventListener("click", () => { lastWebsite = url; if (browsing || document.body.classList.contains("browsing")) address.value = url; });
      link.addEventListener("auxclick", (event) => event.preventDefault());
      return link;
    }
    link.addEventListener("click", (event) => { event.preventDefault(); openPage(url); });
    link.addEventListener("auxclick", (event) => event.preventDefault());
    return link;
  }

  function showPage(index) {
    const data = pages[index];
    pageIndex = index;
    results.replaceChildren();
    results.classList.toggle("media-grid", category !== "web");
    results.setAttribute("aria-busy", "false");
    $("retry").hidden = true;
    $("notice").textContent = data.notice || "";
    $("notice").hidden = !data.notice;
    const overview = $("overview-items");
    overview.replaceChildren();
    if (category === "web" && index === 0) {
      for (const item of data.overview || []) {
        const url = safeUrl(item.url);
        if (!url || !item.content) continue;
        const point = document.createElement("li");
        point.append(document.createTextNode(item.content), linkTo(url.href, item.title));
        overview.append(point);
      }
    }
    $("overview").hidden = !overview.childElementCount;
    let count = 0;
    for (const item of data.results) {
      const url = safeUrl(item.url);
      if (!url || !item.title) continue;
      const article = document.createElement("article");
      article.className = "result";
      if (category !== "web") {
        const preview = linkTo(url.href, "");
        preview.className = "media-preview";
        preview.setAttribute("aria-label", `Open ${item.title}`);
        const thumbnail = safeUrl(item.thumbnail);
        if (thumbnail?.protocol === "https:" && ["upload.wikimedia.org", "thumb.wikimedia.org", "i.ytimg.com"].includes(thumbnail.hostname)) {
          const image = document.createElement("img");
          image.src = thumbnail.href;
          image.alt = item.title;
          image.loading = "lazy";
          image.referrerPolicy = "no-referrer";
          image.addEventListener("error", () => { image.remove(); preview.textContent = category === "videos" ? "▷" : "Image"; preview.classList.add("placeholder"); });
          preview.append(image);
        } else { preview.textContent = category === "videos" ? "▷" : "Image"; preview.classList.add("placeholder"); }
        article.append(preview);
      }
      const site = document.createElement("span");
      site.className = "result-url";
      site.textContent = url.hostname + (category === "web" && url.pathname !== "/" ? url.pathname : "");
      const title = document.createElement("h2");
      title.append(linkTo(url.href, item.title));
      const description = document.createElement("p");
      description.textContent = item.content || "";
      article.append(site, title, description);
      if (item.credit) {
        const credit = document.createElement("span");
        credit.className = "credit";
        credit.textContent = item.credit;
        article.append(credit);
      }
      results.append(article);
      count++;
    }
    status.textContent = count ? `${count} result${count === 1 ? "" : "s"}${data.cached ? " · recent search" : ""}` : "No results found. Try another search.";
    $("pagination").hidden = index === 0 && !data.nextCursor;
    $("previous").disabled = index === 0;
    $("next").disabled = !data.nextCursor;
    $("page-number").textContent = `Page ${index + 1}`;
  }

  async function loadPage(cursor, index) {
    const current = ++sequence;
    pendingCursor = cursor;
    pageIndex = index;
    document.body.classList.add("has-results");
    $("results-section").hidden = false;
    results.replaceChildren();
    results.setAttribute("aria-busy", "true");
    status.textContent = "Searching…";
    for (const id of ["notice", "retry", "pagination", "overview"]) $(id).hidden = true;
    document.title = `${query} — Sreon`;
    try {
      const data = await window.sreonRuntime.search(query, category, cursor);
      if (current !== sequence) return;
      if (!Array.isArray(data?.results)) throw new Error("The search response could not be read. Please try again.");
      pages[index] = data;
      showPage(index);
    } catch (error) {
      if (current !== sequence) return;
      results.setAttribute("aria-busy", "false");
      showError(error);
      $("retry").hidden = false;
      if (index > 0) {
        $("pagination").hidden = false;
        $("previous").disabled = false;
        $("next").disabled = true;
      }
    }
  }

  async function submit(value, forceSearch = false) {
    const text = value.trim();
    if (!text) return;
    const intent = ++sequence;
    const direct = !forceSearch ? directUrl(text) : null;
    if (direct) { await openPage(direct.href); return; }
    if (text.length > 500) { showError(new Error("Use up to 500 characters for a search.")); return; }
    try { await returnToSearch(); } catch (error) { showError(error); return; }
    if (intent !== sequence) return;
    query = text;
    input.value = text;
    address.value = text;
    pages = [];
    loadPage(null, 0);
  }

  for (const [form, field] of [["search-form", input], ["address-form", address]])
    $(form).addEventListener("submit", (event) => { event.preventDefault(); submit(field.value, event.shiftKey); });
  for (const tab of document.querySelectorAll("[data-category]")) {
    tab.addEventListener("click", () => {
      category = tab.dataset.category;
      for (const item of document.querySelectorAll("[data-category]")) item.setAttribute("aria-selected", String(item === tab));
      if (input.value.trim()) submit(input.value, true);
    });
  }
  $("back").addEventListener("click", () => returnToSearch().catch(showError));
  $("forward").addEventListener("click", async () => {
    if (window.sreonRuntime.externalLinks) { if (lastWebsite) await openPage(lastWebsite); return; }
    try { await window.sreonRuntime.navigate("show"); setBrowsing(true); address.value = lastWebsite; } catch (error) { showError(error); }
  });
  $("reload").addEventListener("click", () => {
    if (browsing) window.sreonRuntime.navigate("reload").catch(showError);
    else if (query) loadPage(pendingCursor, pageIndex);
  });
  $("retry").addEventListener("click", () => loadPage(pendingCursor, pageIndex));
  $("previous").addEventListener("click", () => { if (pageIndex > 0 && pages[pageIndex - 1]) showPage(pageIndex - 1); });
  $("next").addEventListener("click", () => {
    const cursor = pages[pageIndex]?.nextCursor;
    if (!cursor) return;
    if (pages[pageIndex + 1]) showPage(pageIndex + 1);
    else loadPage(cursor, pageIndex + 1);
  });
  $("home").addEventListener("click", async () => {
    sequence++;
    try { await returnToSearch(); } catch (error) { showError(error); }
    query = "";
    pages = [];
    input.value = "";
    address.value = "";
    results.replaceChildren();
    $("results-section").hidden = true;
    document.body.classList.remove("has-results");
    document.title = "Sreon";
    input.focus();
  });
  const theme = $("theme-toggle");
  const updateTheme = () => theme.setAttribute("aria-pressed", String(document.documentElement.dataset.theme === "dark"));
  theme.addEventListener("click", () => {
    const value = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem("sreon.theme", value); } catch {}
    updateTheme();
  });
  updateTheme();
  const focusAddress = () => { address.focus(); address.select(); };
  window.addEventListener("sreon:focus-search", focusAddress);
  window.addEventListener("sreon:location", (event) => {
    if (safeUrl(event.detail)) { lastWebsite = event.detail; if (browsing) address.value = event.detail; }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") { event.preventDefault(); focusAddress(); }
    if (event.key === "Enter" && event.shiftKey && [input, address].includes(event.target)) { event.preventDefault(); submit(event.target.value, true); }
  });
})();
