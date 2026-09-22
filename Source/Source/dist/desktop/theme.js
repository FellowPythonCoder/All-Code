(() => {
  let theme = "light";
  try {
    let value = localStorage.getItem("sreon.theme");
    if (!["light", "dark"].includes(value)) {
      try { value = JSON.parse(localStorage.getItem("sreon.preferences") || "{}")?.theme; } catch {}
    }
    theme = value === "dark" || (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    try { localStorage.setItem("sreon.theme", theme); } catch {}
    for (const key of ["sreon.preferences", "sreon.endpoint", "sreon.history"]) {
      try { localStorage.removeItem(key); } catch {}
    }
  } catch {}
  document.documentElement.dataset.theme = theme;
})();
