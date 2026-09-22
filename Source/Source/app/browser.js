(() => {
  const WIKI = "https://en.wikipedia.org/w/api.php";
  const COMMONS = "https://commons.wikimedia.org/w/api.php";
  const TIMEOUT = 15000;
  const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

  function textOf(markup) {
    let value = String(markup || "").replace(/<[^>]*>/g, " ").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
    for (const [entity, character] of Object.entries(ENTITIES)) value = value.split(entity).join(character);
    return value.replace(/\s+/g, " ").trim();
  }

  function clip(value, limit) {
    const single = textOf(value);
    return single.length > limit ? single.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…" : single;
  }

  async function getJSON(fetchImpl, url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    let response;
    try {
      response = await fetchImpl(url, { signal: controller.signal, mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
    } catch {
      throw new Error("Live sources are unreachable right now. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error("Live sources are unreachable right now. Check your connection and try again.");
    try {
      return await response.json();
    } catch {
      throw new Error("The live source sent a response that could not be read. Please try again.");
    }
  }

  function wikiSearch(fetchImpl, query, offset) {
    const params = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", origin: "*",
      list: "search", srsearch: query, srlimit: "20", sroffset: String(offset), srprop: "snippet",
    });
    return getJSON(fetchImpl, `${WIKI}?${params}`);
  }

  function commonsSearch(fetchImpl, query, extra, offset) {
    const params = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", origin: "*",
      generator: "search", gsrsearch: `${query} ${extra}`.trim(), gsrnamespace: "6",
      gsrlimit: "30", gsroffset: String(offset),
      prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "340",
    });
    return getJSON(fetchImpl, `${COMMONS}?${params}`);
  }

  function webResults(fetchImpl, query, offset) {
    return wikiSearch(fetchImpl, query, offset).then((data) => {
      const rows = data?.query?.search || [];
      const total = data?.query?.searchinfo?.totalhits || 0;
      const results = rows.map((row) => ({
        title: row.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title.replace(/ /g, "_"))}`,
        content: clip(row.snippet, 300),
        thumbnail: null,
        credit: "",
      }));
      const overview = results.slice(0, 3)
        .filter((item) => item.content)
        .map((item) => ({ title: item.title, url: item.url, content: item.content }));
      const next = offset + rows.length;
      return {
        results,
        overview,
        nextCursor: next < total && rows.length > 0 ? JSON.stringify({ w: next }) : null,
        notice: "Browser demo — web results come from Wikipedia. The installed Sreon app searches the wider web with its own engine.",
        elapsed: 0,
        cached: false,
      };
    });
  }

  function mediaResults(fetchImpl, query, category, offset) {
    const extra = category === "videos" ? "filetype:video" : "filetype:bitmap";
    return commonsSearch(fetchImpl, query, extra, offset).then((data) => {
      const pages = Object.values(data?.query?.pages || {});
      let rows = pages
        .map((page) => ({ page, info: page.imageinfo?.[0] }))
        .filter((row) => row.info?.descriptionurl);
      if (category === "photos") rows = rows.filter((row) => row.info.mime === "image/jpeg");
      const label = { images: "images", photos: "photos (JPEG)", videos: "videos" }[category] || "media";
      const results = rows.map(({ page, info }) => {
        const meta = info.extmetadata || {};
        const artist = textOf(meta.Artist?.value);
        const license = textOf(meta.LicenseShortName?.value);
        return {
          title: page.title.replace(/^File:/, ""),
          url: info.descriptionurl,
          content: clip(meta.ImageDescription?.value || meta.Categories?.value || "", 220),
          thumbnail: info.thumburl || null,
          credit: [artist, license].filter(Boolean).join(" · "),
        };
      });
      const next = data?.continue?.gsroffset;
      return {
        results,
        overview: [],
        nextCursor: next != null ? JSON.stringify({ c: next }) : null,
        notice: `Browser demo — ${label} come from the Wikimedia Commons library, with author and licence credits on every card. The installed Sreon app searches more sources.`,
        elapsed: 0,
        cached: false,
      };
    });
  }

  function createRuntime({ fetchImpl = (...args) => fetch(...args) } = {}) {
    async function search(q, category = "web", cursor = null) {
      const query = String(q || "").trim();
      if (!query) throw new Error("Type something to search.");
      if (query.length > 500) throw new Error("Use up to 500 characters for a search.");
      let offset = 0;
      if (cursor != null) {
        try {
          const parsed = JSON.parse(cursor);
          offset = Number(parsed?.w ?? parsed?.c ?? 0);
        } catch {
          offset = 0;
        }
        if (!Number.isInteger(offset) || offset < 0 || offset > 100000) offset = 0;
      }
      const started = Date.now();
      const data = category === "web"
        ? await webResults(fetchImpl, query, offset)
        : await mediaResults(fetchImpl, query, category, offset);
      return { ...data, elapsed: (Date.now() - started) / 1000 };
    }

    return {
      isNative: false,
      externalLinks: true,
      search,
      openPage: (url) => {
        const opened = window.open(url, "_blank", "noopener");
        if (!opened) throw new Error("Allow pop-ups for this page, or the site opens in this tab.");
        return Promise.resolve();
      },
      navigate: () => Promise.resolve(),
    };
  }

  globalThis.SreonBrowserRuntime = Object.freeze({ createRuntime });
})();
