(() => {
  const WIKI = "https://en.wikipedia.org/w/api.php";
  const COMMONS = "https://commons.wikimedia.org/w/api.php";
  const TIMEOUT = 15000;
const TUBE_SOURCES = [
  { host: "https://pipedapi.kavin.rocks", kind: "piped" },
  { host: "https://pipedapi.adminforge.de", kind: "piped" },
  { host: "https://inv.nadeko.net", kind: "invidious" },
  { host: "https://invidious.nerdvpn.de", kind: "invidious" },
];
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
    const extra = category === "videos" ? "filetype:video" : category === "photos" ? "filemime:image/jpeg" : "filetype:bitmap";
    return commonsSearch(fetchImpl, query, extra, offset).then((data) => {
      const pages = Object.values(data?.query?.pages || {});
      let rows = pages
        .map((page) => ({ page, info: page.imageinfo?.[0] }))
        .filter((row) => row.info?.descriptionurl);
      if (extra === "filemime:image/jpeg") rows = rows.filter((row) => row.info.mime === "image/jpeg");
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

  function parseTubeCursor(cursor) {
    try {
      const parsed = JSON.parse(cursor);
      const index = Number(parsed?.i);
      const token = typeof parsed?.p === "string" ? parsed.p : "";
      if (Number.isInteger(index) && index >= 0 && index < TUBE_SOURCES.length) return { index, token };
    } catch {}
    return { index: -1, token: "" };
  }

  function pipedRows(payload) {
    const rows = Array.isArray(payload?.items) ? payload.items : [];
    return rows
      .filter((item) => typeof item?.url === "string" && item.url.startsWith("/watch?v="))
      .map((item) => {
        const bits = [];
        if (item.uploaderName) bits.push(String(item.uploaderName));
        if (Number.isFinite(item.duration) && item.duration > 0) bits.push(`${Math.max(1, Math.round(item.duration / 60))} min`);
        if (Number.isFinite(item.views) && item.views > 0) bits.push(`${Math.round(item.views / 1000)}K views`);
        return {
          title: String(item.title || "YouTube video"),
          url: `https://www.youtube.com${item.url}`,
          content: bits.join(" · "),
          thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : null,
          credit: "YouTube",
        };
      });
  }

  function invidiousRows(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    return rows
      .filter((item) => typeof item?.videoId === "string")
      .map((item) => {
        const bits = [];
        if (item.author) bits.push(String(item.author));
        if (Number.isFinite(item.lengthSeconds) && item.lengthSeconds > 0) bits.push(`${Math.max(1, Math.round(item.lengthSeconds / 60))} min`);
        if (Number.isFinite(item.viewCount) && item.viewCount > 0) bits.push(`${Math.round(item.viewCount / 1000)}K views`);
        return {
          title: String(item.title || "YouTube video"),
          url: `https://www.youtube.com/watch?v=${item.videoId}`,
          content: bits.join(" · "),
          thumbnail: item.videoThumbnails?.find((t) => typeof t?.url === "string")?.url || null,
          credit: "YouTube",
        };
      });
  }

  async function youtube(fetchImpl, query, cursor) {
    const remembered = cursor ? parseTubeCursor(cursor) : { index: -1, token: "" };
    for (let index = Math.max(0, remembered.index); index < TUBE_SOURCES.length; index++) {
      const source = TUBE_SOURCES[index];
      const continueToken = remembered.index === index ? remembered.token : "";
      const params = source.kind === "piped"
        ? `search?q=${encodeURIComponent(query)}&filter=videos${continueToken ? `&nextpage=${encodeURIComponent(continueToken)}` : ""}`
        : `api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      let payload;
      try {
        payload = await getJSON(fetchImpl, `${source.host}/${params}`, 6000);
      } catch {
        continue;
      }
      const rows = source.kind === "piped" ? pipedRows(payload) : invidiousRows(payload);
      if (!rows.length) continue;
      const pageToken = source.kind === "piped" && typeof payload?.nextpage === "string" ? payload.nextpage : "";
      return {
        results: rows,
        overview: [],
        nextCursor: pageToken ? JSON.stringify({ i: index, p: pageToken }) : null,
        notice: "Browser demo — live YouTube results via the community Piped network. The installed Sreon app searches more sources.",
        elapsed: 0,
        cached: false,
      };
    }
    throw new Error("all tube sources unavailable");
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
      try {
        let data;
        if (category === "web") data = await webResults(fetchImpl, query, offset);
        else if (category === "videos") {
          try {
            data = await youtube(fetchImpl, query, cursor);
          } catch {
            data = await mediaResults(fetchImpl, query, "videos", offset);
          }
        } else data = await mediaResults(fetchImpl, query, category, offset);
        return { ...data, elapsed: (Date.now() - started) / 1000 };
      } catch (error) {
        if (error.message === "unreachable" || error.message === "unreadable" || error.message === "all tube sources unavailable") {
          throw new Error("Live sources are unreachable right now. Check your connection and try again.");
        }
        throw error;
      }
    }

    return {
      isNative: false,
      externalLinks: true,
      search,
      openPage: (url) => {
        window.open(url, "_blank", "noopener");
        return Promise.resolve();
      },
      navigate: () => Promise.resolve(),
    };
  }

  globalThis.SreonBrowserRuntime = Object.freeze({ createRuntime });
})();
