const WIKI = "https://en.wikipedia.org/w/api.php";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const SEARX_SOURCES = [
  "https://searx.be",
  "https://search.inetol.net",
  "https://searx.tiekoetter.com",
  "https://priv.au",
  "https://opnxng.com",
  "https://searxng.site",
  "https://paulgo.io",
];
const TUBE_SOURCES = [
  { host: "https://pipedapi.kavin.rocks", kind: "piped" },
  { host: "https://pipedapi.adminforge.de", kind: "piped" },
  { host: "https://inv.nadeko.net", kind: "invidious" },
  { host: "https://invidious.nerdvpn.de", kind: "invidious" },
];
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

function getJSON(fetchImpl, url, timeout = TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  return Promise.resolve()
    .then(() => fetchImpl(url, { signal: controller.signal, mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" }))
    .then((res) => {
      response = res;
      clearTimeout(timer);
      if (!response.ok) throw new Error("unreachable");
      return response.json();
    })
    .catch((error) => {
      clearTimeout(timer);
      if (error instanceof SyntaxError) throw new Error("unreadable");
      if (error.message === "unreachable" || error.message === "unreadable") throw error;
      throw new Error("unreachable");
    })
    .then((body) => body);
}

function parseWebCursor(cursor) {
  try {
    const parsed = JSON.parse(cursor);
    const offset = Number(parsed?.w ?? parsed?.c ?? 0);
    if (Number.isInteger(offset) && offset >= 0 && offset <= 100000) return offset;
  } catch {}
  return 0;
}

function parseSearxCursor(cursor) {
  try {
    const parsed = JSON.parse(cursor);
    const page = Number(parsed?.s);
    const index = Number(parsed?.i);
    return {
      page: Number.isInteger(page) && page >= 1 && page <= 100 ? page : 1,
      index: Number.isInteger(index) && index >= 0 && index < SEARX_SOURCES.length ? index : -1,
    };
  } catch {}
  return { page: 1, index: -1 };
}

async function searxWebFrom(fetchImpl, query, state) {
  for (let index = Math.max(0, state.index); index < SEARX_SOURCES.length; index++) {
    const host = SEARX_SOURCES[index];
    const url = `${host}/search?q=${encodeURIComponent(query)}&format=json&language=en&page=${state.page}`;
    let data;
    try {
      data = await getJSON(fetchImpl, url, 7000);
    } catch {
      if (index === SEARX_SOURCES.length - 1) throw new Error("all searx sources unavailable");
      continue;
    }
    const rows = Array.isArray(data?.results) ? data.results : [];
    const mapped = [];
    const seen = new Set();
    for (const row of rows) {
      if (!row || typeof row.url !== "string" || !row.title) continue;
      try {
        const url2 = new URL(row.url);
        if (!["https:", "http:"].includes(url2.protocol) || url2.username || url2.password || seen.has(url2.href)) continue;
        seen.add(url2.href);
        mapped.push({
          title: clip(row.title, 200),
          url: url2.href,
          content: clip(row.content, 300),
          thumbnail: typeof row.thumbnail === "string" ? row.thumbnail : null,
          credit: typeof row.engine === "string" ? row.engine : "",
        });
      } catch {}
    }
    if (!mapped.length) {
      if (index === SEARX_SOURCES.length - 1) throw new Error("all searx sources unavailable");
      continue;
    }
    return {
      results: mapped,
      overview: mapped.slice(0, 3).filter((item) => item.content).map((item) => ({ title: item.title, url: item.url, content: item.content })),
      nextCursor: state.page < 50 ? JSON.stringify({ s: state.page + 1, i: index }) : null,
      notice: "Full-web results via the open SearXNG network. The installed Sreon app searches even more sources.",
      elapsed: 0,
      cached: false,
    };
  }
  throw new Error("all searx sources unavailable");
}

function wikiWeb(fetchImpl, query, offset) {
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", origin: "*",
    list: "search", srsearch: query, srlimit: "20", sroffset: String(offset), srprop: "snippet",
  });
  return getJSON(fetchImpl, `${WIKI}?${params}`).then((data) => {
    const rows = data?.query?.search || [];
    const total = data?.query?.searchinfo?.totalhits || 0;
    const results = rows.map((row) => ({
      title: row.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title.replace(/ /g, "_"))}`,
      content: clip(row.snippet, 300),
      thumbnail: null,
      credit: "",
    }));
    const overview = results.slice(0, 3).filter((item) => item.content)
      .map((item) => ({ title: item.title, url: item.url, content: item.content }));
    const next = offset + rows.length;
    return {
      results,
      overview,
      nextCursor: rows.length > 0 && next < total ? JSON.stringify({ w: next }) : null,
      notice: "Full-web sources are unreachable right now, so these results come from Wikipedia. The installed Sreon app searches the wider web.",
      elapsed: 0,
      cached: false,
    };
  });
}

function commons(fetchImpl, query, extra, offset) {
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", origin: "*",
    generator: "search", gsrsearch: `${query} ${extra}`.trim(), gsrnamespace: "6",
    gsrlimit: "30", gsroffset: String(offset),
    prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "340",
  });
  return getJSON(fetchImpl, `${COMMONS}?${params}`).then((data) => {
    const pages = Object.values(data?.query?.pages || {});
    let rows = pages.map((page) => ({ page, info: page.imageinfo?.[0] })).filter((row) => row.info?.descriptionurl);
    if (extra === "filemime:image/jpeg") rows = rows.filter((row) => row.info.mime === "image/jpeg");
    return { rows, next: data?.continue?.gsroffset };
  });
}

function commonsMedia(fetchImpl, query, kind, offset) {
  const extra = kind === "videos" ? "filetype:video" : kind === "photos" ? "filemime:image/jpeg" : "filetype:bitmap";
  return commons(fetchImpl, query, extra, offset).then(({ rows, next }) => {
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
    return {
      results,
      overview: [],
      nextCursor: next != null ? JSON.stringify({ c: next }) : null,
      notice: `${kind === "photos" ? "Photos (JPEG)" : kind[0].toUpperCase() + kind.slice(1)} come from the Wikimedia Commons library, credited on every card. The installed Sreon app searches more sources.`,
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
      notice: "Live YouTube results via the community Piped network. The installed Sreon app searches more sources.",
      elapsed: 0,
      cached: false,
    };
  }
  throw new Error("all tube sources unavailable");
}

async function search(fetchImpl, q, category = "web", cursor = null) {
  const query = String(q || "").trim();
  if (!query) throw new Error("Type something to search.");
  if (query.length > 500) throw new Error("Use up to 500 characters for a search.");
  const started = Date.now();
  try {
    let data;
    if (category === "web") {
      try {
        data = await searxWebFrom(fetchImpl, query, parseSearxCursor(cursor));
      } catch {
        data = await wikiWeb(fetchImpl, query, parseWebCursor(cursor));
      }
    } else if (category === "videos") {
      try {
        data = await youtube(fetchImpl, query, cursor);
      } catch {
        data = await commonsMedia(fetchImpl, query, "videos", parseWebCursor(cursor));
      }
    } else if (category === "images" || category === "photos") {
      data = await commonsMedia(fetchImpl, query, category, parseWebCursor(cursor));
    } else {
      data = await searxWebFrom(fetchImpl, query, { page: 1, index: -1 }).catch(() => wikiWeb(fetchImpl, query, 0));
    }
    return { ...data, elapsed: (Date.now() - started) / 1000 };
  } catch (error) {
    if (error.message === "unreachable" || error.message === "unreadable" || error.message === "all tube sources unavailable" || error.message === "all searx sources unavailable") {
      throw new Error("Live sources are unreachable right now. Check your connection and try again.");
    }
    throw error;
  }
}

function createRuntime({ fetchImpl = (...args) => fetch(...args) } = {}) {
  return {
    isNative: false,
    externalLinks: true,
    search: (q, category, cursor) => search(fetchImpl, q, category, cursor),
    openPage: (url) => {
      window.open(url, "_blank", "noopener");
      return Promise.resolve();
    },
    navigate: () => Promise.resolve(),
  };
}

export { createRuntime };
globalThis.SreonSiteRuntime = { createRuntime };
