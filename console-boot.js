// Self-contained mobile debug console — shared by index.html and ngrc.html.
// Load as the FIRST script in <head> (before body) so it captures load-time
// errors; the page sets window.__BUILD (stamped) beforehand for the version line.
  (function () {
    "use strict";
    var BUILD = window.__BUILD || { version: 0, built: "dev" };
    var STORE_KEY = "dbgConsole:v1";
    var MAX = 300;               // cap stored entries
    var buffer = [];             // {type, time, text}
    var errorCount = 0, warnCount = 0;
    var mounted = false;
    var els = {};                // cached DOM refs once mounted

    // ---- restore previous session (survives a crash/white-screen) ----
    try {
      var prev = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      if (prev.length) {
        buffer = prev.slice(-MAX);
        buffer.push({ type: "meta", time: nowStr(), text: "— reload — previous session above —" });
        for (var i = 0; i < buffer.length; i++) {
          if (buffer[i].type === "error") errorCount++;
          else if (buffer[i].type === "warn") warnCount++;
        }
      }
    } catch (e) { /* ignore */ }

    function nowStr() {
      var d = new Date();
      return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)+
             ":"+("0"+d.getSeconds()).slice(-2)+"."+("00"+d.getMilliseconds()).slice(-3);
    }

    function safeReplacer() {
      var seen = new WeakSet();
      return function (k, v) {
        if (v instanceof Error) return v.stack || v.message;
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        if (typeof v === "function") return "[Function " + (v.name || "anonymous") + "]";
        return v;
      };
    }

    function fmt(args) {
      var out = [];
      for (var i = 0; i < args.length; i++) {
        var a = args[i];
        if (typeof a === "string") { out.push(a); continue; }
        if (a instanceof Error) { out.push(a.stack || (a.name + ": " + a.message)); continue; }
        try { out.push(JSON.stringify(a, safeReplacer(), 2)); }
        catch (e) { out.push(String(a)); }
      }
      return out.join(" ");
    }

    function persist() {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(buffer.slice(-MAX))); }
      catch (e) { /* quota or disabled */ }
    }

    function record(type, text) {
      var entry = { type: type, time: nowStr(), text: text };
      buffer.push(entry);
      if (buffer.length > MAX) buffer.shift();
      if (type === "error") errorCount++;
      else if (type === "warn") warnCount++;
      persist();
      if (!mounted && (type === "error" || type === "warn")) mount(); // surface problems ASAP
      if (mounted) { appendRow(entry); updateBadge(); }
    }

    // ---- wrap console methods (keep originals working) ----
    var native = {};
    ["log", "info", "warn", "error", "debug"].forEach(function (m) {
      native[m] = (console[m] || console.log).bind(console);
      console[m] = function () {
        native[m].apply(console, arguments);
        var type = (m === "warn") ? "warn" : (m === "error") ? "error" :
                   (m === "info") ? "info" : (m === "debug") ? "debug" : "log";
        record(type, fmt(arguments));
      };
    });

    // ---- global error + promise rejection handlers ----
    window.addEventListener("error", function (e) {
      if (e && e.message) {
        record("error", e.message + (e.filename ? ("  @ " + e.filename + ":" + e.lineno + ":" + e.colno) : "") +
                        (e.error && e.error.stack ? "\n" + e.error.stack : ""));
      } else if (e && e.target && (e.target.src || e.target.href)) {
        record("error", "Failed to load resource: " + (e.target.src || e.target.href));
      }
    }, true); // capture phase -> also catches resource load errors
    window.addEventListener("unhandledrejection", function (e) {
      var r = e && e.reason;
      record("error", "Unhandled promise rejection: " +
        (r instanceof Error ? (r.stack || r.message) : fmt([r])));
    });

    // ---- copy helper (button-triggered = allowed by mobile browsers) ----
    function copyAll() {
      var text = buffer.map(function (b) {
        return "[" + b.time + "] " + b.type.toUpperCase() + "  " + b.text;
      }).join("\n");
      var done = function () { flash(els.copy, "Copied ✓"); };
      var fallback = function () {
        var ta = els.copyArea;
        ta.style.display = "block";
        ta.value = text; ta.focus(); ta.select();
        try { document.execCommand("copy"); flash(els.copy, "Copied ✓"); }
        catch (e) { flash(els.copy, "Select & copy ↑"); return; }
        ta.style.display = "none";
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else { fallback(); }
    }

    function flash(btn, msg) {
      if (!btn) return;
      var orig = btn.textContent; btn.textContent = msg;
      setTimeout(function () { btn.textContent = orig; }, 1200);
    }

    function clearAll() {
      buffer = []; errorCount = 0; warnCount = 0;
      persist();
      if (els.list) els.list.innerHTML = "";
      updateBadge();
      record("meta", "console cleared");
    }

    function runEval() {
      var code = els.input.value.trim();
      if (!code) return;
      record("meta", "› " + code);
      try {
        var result = (0, eval)(code); // indirect eval -> global scope
        record("log", (typeof result === "object") ? fmt([result]) : String(result));
      } catch (err) {
        record("error", (err && err.stack) ? err.stack : String(err));
      }
      els.input.value = "";
    }

    // ---- version / stale detection -----------------------------------
    function builtLocal() {
      try { return new Date(BUILD.built).toLocaleString(); }
      catch (e) { return BUILD.built; }
    }

    function setBuildText(txt, cls) {
      if (!els.build) return;
      els.build.textContent = txt;
      els.build.className = cls || "";
    }

    function checkVersion() {
      if (!BUILD.version) { setBuildText("dev build", ""); return; } // unstamped page (e.g. demo): no stale-detection
      setBuildText("v" + BUILD.version + " · checking…", "checking");
      var url = "version.json?t=" + (new Date().getTime());
      fetch(url, { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (latest) {
          var t = (new Date()).toLocaleTimeString();
          var stale = String(latest.version) !== String(BUILD.version);
          if (stale) {
            setBuildText("v" + BUILD.version + " · ⚠ STALE — latest is v" + latest.version + " (checked " + t + ")", "stale");
            showStale(latest.version);
            record("warn", "Stale page: you have v" + BUILD.version + ", server has v" + latest.version + ". Tap the banner to reload.");
          } else {
            setBuildText("v" + BUILD.version + " · ✓ latest (checked " + t + ")", "ok");
            hideStale();
          }
        })
        .catch(function () {
          setBuildText("v" + BUILD.version + " · (offline / no version.json)", "");
        });
    }

    function showStale(latest) {
      if (!els.stale) return;
      els.staleText.textContent = "New version v" + latest + " available — tap to reload";
      els.stale.style.display = "block";
    }
    function hideStale() { if (els.stale) els.stale.style.display = "none"; }

    function reloadFresh() {
      var base = location.href.split("#")[0].split("?")[0];
      location.href = base + "?v=" + (new Date().getTime());
    }

    // ---- UI ----------------------------------------------------------
    function css() {
      return "" +
      "#dbg-launch{position:fixed;right:14px;bottom:14px;z-index:2147483646;width:46px;height:46px;border-radius:12px;" +
        "background:#1e293b;color:#cbd5e1;border:1px solid #334155;box-shadow:0 4px 14px rgba(0,0,0,.4);display:flex;" +
        "align-items:center;justify-content:center;cursor:pointer;padding:0}" +
      "#dbg-launch:active{background:#273449}#dbg-launch svg{width:22px;height:22px;display:block}" +
      "#dbg-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;" +
        "background:#64748b;color:#fff;font-size:12px;font-weight:700;display:none;align-items:center;justify-content:center;" +
        "font-family:monospace}" +
      "#dbg-badge.err{background:#ef4444;display:flex}#dbg-badge.warn{background:#f59e0b;display:flex}" +
      "#dbg-panel{position:fixed;inset:auto 0 0 0;z-index:2147483647;height:72vh;max-height:72vh;background:#0b1220;" +
        "color:#e2e8f0;font-family:ui-monospace,Menlo,Consolas,monospace;display:none;flex-direction:column;" +
        "border-top:2px solid #4f46e5;box-shadow:0 -6px 24px rgba(0,0,0,.5)}" +
      "#dbg-panel.open{display:flex}" +
      "#dbg-head{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#111827;flex:0 0 auto}" +
      "#dbg-head .t{font-weight:700;font-size:13px}#dbg-head .sp{flex:1}" +
      "#dbg-head button{background:#334155;color:#fff;border:none;border-radius:8px;padding:8px 10px;font-size:13px;cursor:pointer;width:auto;flex:0 0 auto}" +
      "#dbg-build{padding:6px 10px;background:#0b1220;color:#94a3b8;font-size:11px;border-bottom:1px solid #1e293b;flex:0 0 auto;white-space:nowrap;overflow-x:auto}" +
      "#dbg-build.ok{color:#4ade80}#dbg-build.stale{color:#fca5a5;background:rgba(239,68,68,.12)}#dbg-build.checking{color:#94a3b8}" +
      "#dbg-stale{position:fixed;top:0;left:0;right:0;z-index:2147483647;display:none;background:#b91c1c;color:#fff;" +
        "font-family:-apple-system,Roboto,sans-serif;font-size:14px;font-weight:600;text-align:center;padding:12px 14px;" +
        "cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.4)}" +
      "#dbg-stale .r{display:inline-block;margin-left:8px;background:rgba(255,255,255,.2);border-radius:6px;padding:2px 8px;font-size:12px}" +
      "#dbg-head button:active{background:#475569}" +
      "#dbg-list{flex:1 1 auto;overflow-y:auto;padding:6px 8px;font-size:12px;line-height:1.45;-webkit-overflow-scrolling:touch}" +
      ".dbg-row{padding:4px 6px;border-bottom:1px solid #1e293b;white-space:pre-wrap;word-break:break-word}" +
      ".dbg-row .ts{color:#64748b;margin-right:6px}" +
      ".dbg-row.error{color:#fca5a5;background:rgba(239,68,68,.08)}" +
      ".dbg-row.warn{color:#fcd34d;background:rgba(245,158,11,.06)}" +
      ".dbg-row.info{color:#93c5fd}.dbg-row.debug{color:#a5b4fc}.dbg-row.meta{color:#64748b;font-style:italic}" +
      "#dbg-foot{flex:0 0 auto;display:flex;gap:6px;padding:8px;background:#111827;width:100%;box-sizing:border-box}" +
      "#dbg-input{flex:1 1 auto;min-width:0;width:auto;margin:0;background:#0b1220;color:#e2e8f0;border:1px solid #334155;" +
        "border-radius:8px;padding:12px;font-family:inherit;font-size:16px;box-sizing:border-box}" +
      "#dbg-run{background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:0 18px;font-size:14px;" +
        "width:auto;flex:0 0 auto;white-space:nowrap}" +
      "#dbg-copyarea{display:none;width:100%;height:60px;margin-top:6px;background:#0b1220;color:#e2e8f0;" +
        "border:1px solid #334155;border-radius:8px;font-size:11px}";
    }

    function el(tag, attrs, html) {
      var n = document.createElement(tag);
      if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
      if (html != null) n.innerHTML = html;
      return n;
    }

    function appendRow(entry) {
      if (!els.list) return;
      var row = el("div", { "class": "dbg-row " + entry.type });
      var ts = el("span", { "class": "ts" }); ts.textContent = entry.time;
      row.appendChild(ts);
      row.appendChild(document.createTextNode(entry.text));
      els.list.appendChild(row);
      els.list.scrollTop = els.list.scrollHeight;
    }

    function updateBadge() {
      if (!els.badge) return;
      els.badge.className = "";
      if (errorCount > 0) { els.badge.className = "err"; els.badge.textContent = errorCount; }
      else if (warnCount > 0) { els.badge.className = "warn"; els.badge.textContent = warnCount; }
      else { els.badge.style.display = "none"; els.badge.textContent = ""; return; }
      els.badge.style.display = "flex";
    }

    function mount() {
      if (mounted) return;
      var root = document.body || document.documentElement;
      if (!root) return;
      mounted = true;

      var style = el("style"); style.textContent = css();
      (document.head || document.documentElement).appendChild(style);

      var launch = el("button", { id: "dbg-launch", "aria-label": "Open debug console" },
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 8 9 12 5 16"></polyline><line x1="12" y1="16" x2="19" y2="16"></line></svg>');
      var badge = el("span", { id: "dbg-badge" });
      launch.appendChild(badge);

      var panel = el("div", { id: "dbg-panel" });
      var head = el("div", { id: "dbg-head" });
      var title = el("span", { "class": "t" }); title.textContent = "Console";
      var recheck = el("button", { id: "dbg-recheck", title: "Check for new version" }, "⟳");
      var copy = el("button", { id: "dbg-copy" }, "Copy all");
      var clr = el("button", { id: "dbg-clear" }, "Clear");
      var close = el("button", { id: "dbg-close" }, "Close ✕");
      head.appendChild(title);
      head.appendChild(el("span", { "class": "sp" }));
      head.appendChild(recheck); head.appendChild(copy); head.appendChild(clr); head.appendChild(close);

      var build = el("div", { id: "dbg-build" }, "v" + BUILD.version + " · built " + builtLocal());
      var list = el("div", { id: "dbg-list" });
      var copyArea = el("textarea", { id: "dbg-copyarea", readonly: "readonly" });

      var foot = el("div", { id: "dbg-foot" });
      var input = el("input", { id: "dbg-input", type: "text", placeholder: "run JS…  e.g. document.title",
                                autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
      var run = el("button", { id: "dbg-run" }, "Run");
      foot.appendChild(input); foot.appendChild(run);

      panel.appendChild(head); panel.appendChild(build); panel.appendChild(list); panel.appendChild(copyArea); panel.appendChild(foot);

      // stale-version banner (top of screen, independent of the panel)
      var stale = el("div", { id: "dbg-stale" });
      var staleText = el("span"); staleText.textContent = "New version available — tap to reload";
      stale.appendChild(staleText);
      stale.appendChild(el("span", { "class": "r" }, "Reload"));

      root.appendChild(launch); root.appendChild(panel); root.appendChild(stale);

      els = { launch: launch, badge: badge, panel: panel, list: list, input: input,
              copy: copy, copyArea: copyArea, build: build, stale: stale, staleText: staleText };

      launch.addEventListener("click", function () { panel.classList.toggle("open"); list.scrollTop = list.scrollHeight; });
      close.addEventListener("click", function () { panel.classList.remove("open"); });
      copy.addEventListener("click", copyAll);
      clr.addEventListener("click", clearAll);
      recheck.addEventListener("click", checkVersion);
      run.addEventListener("click", runEval);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") runEval(); });
      stale.addEventListener("click", reloadFresh);

      // paint existing buffer
      for (var i = 0; i < buffer.length; i++) appendRow(buffer[i]);
      updateBadge();
      record("meta", "build v" + BUILD.version + " · built " + builtLocal());
      checkVersion();
    }

    // expose a tiny API for manual use / testing
    window.__dbg = { mount: mount, clear: clearAll, log: function (m) { record("log", fmt([m])); }, buffer: function () { return buffer.slice(); } };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount);
    } else { mount(); }
  })();
