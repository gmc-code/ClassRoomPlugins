/* christmas.js : a Christmas scene of GIFs that play when they are clicked.
 *
 * Used two ways:
 *   1. By the Sphinx ``christmas`` directive, which writes <div class="christmas" data-christmas="{...}">.
 *   2. By the student kit (index.html + my_scene.js), where my_scene.js sets sceneTitle,
 *      sceneBackground and the myGifs list, and the page has <div data-christmas-kit>.
 */
(function () {
  "use strict";

  var NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
  var audio = null;
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function chime(index) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var now = audio.currentTime;
      var base = NOTES[index % NOTES.length];
      [1, 2.4, 3.9].forEach(function (partial, k) {
        var osc = audio.createOscillator();
        var gain = audio.createGain();
        osc.type = "sine";
        osc.frequency.value = base * partial;
        gain.gain.setValueAtTime(0.18 / (k + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2 / (k + 1));
        osc.connect(gain).connect(audio.destination);
        osc.start(now);
        osc.stop(now + 1.3);
      });
    } catch (e) { /* no sound available */ }
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, title, onClick) {
    var b = el("button", "xmas-btn", label);
    b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }

  function round1(n) { return Math.round(n * 10) / 10; }
  function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }

  // ------------------------------------------------------------------ scene

  function Scene(root, cfg) {
    var self = this;
    this.root = root;
    this.cfg = cfg;
    this.base = cfg.base || "";
    this.isScene = !!cfg.background;
    this.mode = cfg.play || "once";
    this.soundOn = !!cfg.sound;
    this.arranging = false;
    this.selected = null;
    this.celebrated = false;
    this.items = (cfg.items || []).map(function (it, i) { return self.makeItem(it, i); });
    this.build();
  }

  Scene.prototype.url = function (name) {
    return /^(https?:|data:|blob:|\/)/.test(name) ? name : this.base + name;
  };

  Scene.prototype.makeItem = function (it, index) {
    var count = (this.cfg.items || []).length;
    return {
      index: index,
      file: it.file || it.src,
      src: this.url(it.src || it.file),
      still: it.still ? this.url(it.still) : null,
      name: it.name || String(it.file || "").replace(/\.[^.]+$/, ""),
      x: typeof it.x === "number" ? it.x : round1((index + 0.5) * 100 / count),
      y: typeof it.y === "number" ? it.y : 80,
      width: typeof it.width === "number" ? it.width : clamp(Math.floor(80 / count), 6, 14),
      seconds: typeof it.seconds === "number" && it.seconds > 0 ? it.seconds : (it.move ? 6 : 3),
      secondsGiven: typeof it.seconds === "number",
      keep: it.keep || "",
      move: it.move === "left" || it.move === "right" ? it.move : null,
      trip: null,
      ratio: it.w && it.h ? it.w / it.h : 1,
      playing: false,
      found: false,
      plays: 0,
      blob: null,
      blobUrl: null,
      timer: null
    };
  };

  Scene.prototype.build = function () {
    var self = this;
    var root = this.root;
    var cfg = this.cfg;
    root.classList.add("xmas");
    root.classList.toggle("xmas-is-scene", this.isScene);
    root.classList.toggle("xmas-is-grid", !this.isScene);
    root.classList.toggle("xmas-hide-names", cfg.showNames === false);
    root.textContent = "";

    var head = el("div", "xmas-head");
    head.appendChild(el("div", "xmas-title", cfg.title || "Christmas"));
    this.counter = el("div", "xmas-counter");
    this.counter.setAttribute("aria-live", "polite");
    head.appendChild(this.counter);
    root.appendChild(head);

    var bar = el("div", "xmas-bar");
    bar.appendChild(button("▶ Play all", "Play every picture", function () { self.playAll(); }));
    bar.appendChild(button("■ Stop all", "Stop every picture", function () { self.stopAll(); }));
    this.snowBtn = button("❄ Snow", "Turn the snow on or off", function () { self.setSnow(!self.snowing); });
    bar.appendChild(this.snowBtn);
    this.soundBtn = button("🔔 Sound", "Turn the bell sound on or off", function () {
      self.soundOn = !self.soundOn;
      self.soundBtn.setAttribute("aria-pressed", self.soundOn);
      if (self.soundOn) chime(0);
    });
    this.soundBtn.setAttribute("aria-pressed", this.soundOn);
    bar.appendChild(this.soundBtn);
    if (this.isScene) {
      this.arrangeBtn = button("✥ Arrange", "Drag the pictures to new places", function () { self.setArranging(!self.arranging); });
      this.arrangeBtn.setAttribute("aria-pressed", "false");
      bar.appendChild(this.arrangeBtn);
    }
    if (root.requestFullscreen) {
      bar.appendChild(button("⛶ Full screen", "Fill the screen", function () {
        if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen();
      }));
    }
    root.appendChild(bar);

    this.stage = el("div", "xmas-stage");
    if (this.isScene) {
      var bg = el("img", "xmas-bg");
      bg.alt = "";
      bg.draggable = false;
      bg.addEventListener("error", function () {
        self.stage.classList.add("xmas-no-bg");
        self.problem("I cannot find the background picture “" + cfg.background + "”. Check its name and folder.");
      });
      bg.addEventListener("load", function () { self.fitFullscreen(); });
      bg.src = cfg.backgroundUrl || this.url(cfg.background);
      this.bg = bg;
      this.stage.appendChild(bg);
    } else {
      this.stage.style.setProperty("--xmas-columns", cfg.columns || 4);
    }
    this.items.forEach(function (item) { self.stage.appendChild(self.buildItem(item)); });
    this.snowLayer = el("div", "xmas-snow");
    this.snowLayer.setAttribute("aria-hidden", "true");
    this.stage.appendChild(this.snowLayer);
    root.appendChild(this.stage);

    this.message = el("div", "xmas-message");
    this.message.hidden = true;
    root.appendChild(this.message);
    this.problems = el("div", "xmas-problems");
    this.problems.hidden = true;
    root.appendChild(this.problems);

    if (this.isScene) this.buildArrangePanel();
    if (!this.items.length) this.problem("There are no pictures in this scene yet.");

    this.stage.addEventListener("click", function (e) {
      if (self.arranging && !e.target.closest(".xmas-item")) self.select(null);
    });
    document.addEventListener("fullscreenchange", function () { self.fitFullscreen(); });
    window.addEventListener("resize", function () { self.fitFullscreen(); });

    this.updateCounter();
    this.setSnow(!!cfg.snow && !reducedMotion);
  };

  Scene.prototype.problem = function (text) {
    this.problems.hidden = false;
    this.problems.appendChild(el("div", "xmas-problem", "⚠ " + text));
  };

  // ------------------------------------------------------------------ pictures

  Scene.prototype.buildItem = function (item) {
    var self = this;
    var b = el("button", "xmas-item");
    b.type = "button";
    b.setAttribute("aria-label", item.name + ". Click to play.");
    item.el = b;

    var frame = el("span", "xmas-frame");
    frame.style.aspectRatio = String(item.ratio);
    var still;
    if (item.still) {
      still = el("img", "xmas-still");
      still.alt = "";
      still.src = item.still;
    } else {
      still = el("canvas", "xmas-still");
      var probe = new Image();
      probe.onload = function () {
        still.width = probe.naturalWidth;
        still.height = probe.naturalHeight;
        frame.style.aspectRatio = probe.naturalWidth + " / " + probe.naturalHeight;
        still.getContext("2d").drawImage(probe, 0, 0);   // draws the first frame of the GIF
      };
      probe.onerror = function () {
        b.classList.add("xmas-missing");
        frame.appendChild(el("span", "xmas-missing-text", "Cannot find " + item.file));
        self.problem("I cannot find “" + item.file + "”. Check the spelling, the .gif ending and the folder.");
      };
      probe.src = item.src;
    }
    still.draggable = false;
    frame.appendChild(still);

    var gif = el("img", "xmas-gif");
    gif.alt = "";
    gif.draggable = false;
    gif.addEventListener("load", function () {
      if (!item.playing) return;
      b.classList.add("xmas-playing");
      clearTimeout(item.timer);
      if (item.timed) item.timer = setTimeout(function () { self.stop(item); }, item.seconds * 1000);
    });
    item.gif = gif;
    frame.appendChild(gif);
    b.appendChild(frame);
    b.appendChild(el("span", "xmas-name", item.name));
    this.place(item);

    // http pages can fetch the GIF once and replay it from memory; file:// pages cannot.
    if (/^https?:$/.test(location.protocol) && window.fetch) {
      fetch(item.src).then(function (r) { return r.ok ? r.blob() : null; })
        .then(function (blob) { item.blob = blob; }).catch(function () {});
    }

    b.addEventListener("click", function () {
      if (self.arranging) { self.select(item); return; }
      var hovering = self.mode === "hover" && window.matchMedia("(hover: hover)").matches;
      if (self.mode === "once") self.play(item, true);
      else if (hovering) self.play(item, false);
      else if (item.playing) self.stop(item);
      else self.play(item, false);
      self.markFound(item);
      if (self.soundOn) chime(item.index);
    });
    if (this.mode === "hover") {
      b.addEventListener("pointerenter", function (e) {
        if (e.pointerType === "mouse" && !self.arranging) { self.play(item, false); self.markFound(item); }
      });
      b.addEventListener("pointerleave", function (e) {
        if (e.pointerType === "mouse" && !self.arranging) self.stop(item);
      });
    }
    b.addEventListener("pointerdown", function (e) { self.startDrag(item, e); });
    b.addEventListener("keydown", function (e) { self.nudge(item, e); });
    return b;
  };

  Scene.prototype.place = function (item) {
    if (!this.isScene) return;
    item.el.style.left = item.x + "%";
    item.el.style.top = item.y + "%";
    item.el.style.width = item.width + "%";
  };

  // A GIF only starts again from its first frame when the browser sees a new address,
  // so every play gets a fresh one.
  Scene.prototype.freshUrl = function (item) {
    item.plays += 1;
    if (item.blob) {
      if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
      item.blobUrl = URL.createObjectURL(item.blob);
      return item.blobUrl;
    }
    return item.src + (item.src.indexOf("?") < 0 ? "?" : "&") + "play=" + Date.now() + "-" + item.plays;
  };

  Scene.prototype.play = function (item, timed) {
    if (item.el.classList.contains("xmas-missing")) return;
    clearTimeout(item.timer);
    item.playing = true;
    item.timed = timed;
    item.gif.src = this.freshUrl(item);
    this.travel(item, timed);
  };

  // A picture with move=left or move=right goes off that side of the scene, comes back in
  // on the other side and returns to its place. One lap takes item.seconds.
  Scene.prototype.travel = function (item, timed) {
    if (item.trip) { item.trip.cancel(); item.trip = null; }
    if (!item.move || !this.isScene || !item.el.animate) return;
    var half = item.width / 2 + 1;
    var offRight = 100 + half;
    var offLeft = -half;
    var exit = item.move === "right" ? offRight : offLeft;
    var enter = item.move === "right" ? offLeft : offRight;
    var out = Math.abs(exit - item.x);
    var back = Math.abs(item.x - enter);
    var turn = out / (out + back);
    item.trip = item.el.animate([
      { left: item.x + "%" },
      { left: exit + "%", offset: turn },
      { left: enter + "%", offset: turn },
      { left: item.x + "%" }
    ], { duration: item.seconds * 1000, iterations: timed ? 1 : Infinity, easing: "linear" });
  };

  Scene.prototype.stop = function (item) {
    clearTimeout(item.timer);
    item.playing = false;
    if (item.trip) { item.trip.cancel(); item.trip = null; }
    item.el.classList.remove("xmas-playing");
    item.gif.removeAttribute("src");
  };

  Scene.prototype.playAll = function () {
    var self = this;
    this.items.forEach(function (item, i) {
      setTimeout(function () { self.play(item, self.mode === "once"); self.markFound(item); }, i * 150);
    });
  };

  Scene.prototype.stopAll = function () {
    var self = this;
    this.items.forEach(function (item) { self.stop(item); });
  };

  Scene.prototype.markFound = function (item) {
    if (item.found) return;
    item.found = true;
    item.el.classList.add("xmas-found");
    this.updateCounter();
    var all = this.items.every(function (it) { return it.found || it.el.classList.contains("xmas-missing"); });
    if (all && !this.celebrated && this.items.length > 1) {
      this.celebrated = true;
      this.message.textContent = "🎄 " + (this.cfg.message || "You found them all. Merry Christmas!");
      this.message.hidden = false;
      if (!reducedMotion) this.setSnow(true);
    }
  };

  Scene.prototype.updateCounter = function () {
    var found = this.items.filter(function (it) { return it.found; }).length;
    this.counter.textContent = "Clicked " + found + " of " + this.items.length;
  };

  // ------------------------------------------------------------------ snow

  Scene.prototype.setSnow = function (on) {
    this.snowing = on;
    this.snowBtn.setAttribute("aria-pressed", on);
    this.snowLayer.textContent = "";
    if (!on) return;
    for (var i = 0; i < 40; i++) {
      var flake = el("span", "xmas-flake");
      var size = 4 + Math.random() * 8;
      flake.style.left = Math.random() * 100 + "%";
      flake.style.width = flake.style.height = size + "px";
      flake.style.opacity = 0.5 + Math.random() * 0.5;
      flake.style.animationDuration = 6 + Math.random() * 8 + "s";
      flake.style.animationDelay = -Math.random() * 14 + "s";
      flake.style.setProperty("--xmas-drift", (Math.random() * 60 - 30) + "px");
      this.snowLayer.appendChild(flake);
    }
  };

  // ------------------------------------------------------------------ full screen

  Scene.prototype.fitFullscreen = function () {
    var full = document.fullscreenElement === this.root;
    if (!this.isScene || !this.bg) return;
    if (full && this.bg.naturalWidth) {
      var spare = window.innerHeight - (this.root.offsetHeight - this.stage.offsetHeight) - 8;
      this.stage.style.maxWidth = Math.floor(spare * this.bg.naturalWidth / this.bg.naturalHeight) + "px";
    } else {
      this.stage.style.maxWidth = "";
    }
  };

  // ------------------------------------------------------------------ arranging

  Scene.prototype.buildArrangePanel = function () {
    var self = this;
    var panel = el("div", "xmas-arrange");
    panel.hidden = true;
    panel.appendChild(el("p", "xmas-arrange-help",
      "Drag a picture to move it. Click a picture, then use the slider to change its size. " +
      "The arrow keys move the chosen picture a little at a time."));
    var row = el("label", "xmas-size-row");
    this.sizeLabel = el("span", "", "Size: click a picture first");
    row.appendChild(this.sizeLabel);
    this.sizeSlider = el("input");
    this.sizeSlider.type = "range";
    this.sizeSlider.min = 3;
    this.sizeSlider.max = 60;
    this.sizeSlider.step = 0.5;
    this.sizeSlider.disabled = true;
    this.sizeSlider.addEventListener("input", function () {
      if (!self.selected) return;
      self.selected.width = Number(self.sizeSlider.value);
      self.place(self.selected);
      self.writePositions();
    });
    row.appendChild(this.sizeSlider);
    panel.appendChild(row);
    panel.appendChild(el("p", "xmas-arrange-help", this.cfg.standalone
      ? "When you are happy, copy these lines and paste them over the lines inside myGifs = [ ... ] in my_scene.js."
      : "When you are happy, copy these lines and paste them over the picture lines in the directive."));
    this.output = el("textarea", "xmas-output");
    this.output.readOnly = true;
    this.output.rows = Math.min(12, Math.max(3, this.items.length));
    this.output.setAttribute("aria-label", "Picture positions to copy");
    panel.appendChild(this.output);
    var copy = button("Copy", "Copy the lines", function () {
      self.output.select();
      var done = function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(self.output.value).then(done, function () { document.execCommand("copy"); done(); });
      } else { document.execCommand("copy"); done(); }
    });
    panel.appendChild(copy);
    this.arrangePanel = panel;
    this.root.appendChild(panel);
  };

  Scene.prototype.setArranging = function (on) {
    this.arranging = on;
    if (on) this.stopAll();
    this.root.classList.toggle("xmas-arranging", on);
    this.arrangeBtn.setAttribute("aria-pressed", on);
    this.arrangePanel.hidden = !on;
    if (!on) this.select(null);
    this.writePositions();
  };

  Scene.prototype.select = function (item) {
    if (this.selected) this.selected.el.classList.remove("xmas-selected");
    this.selected = item;
    this.sizeSlider.disabled = !item;
    if (item) {
      item.el.classList.add("xmas-selected");
      this.sizeSlider.value = item.width;
      this.sizeLabel.textContent = "Size of " + item.name + ":";
    } else {
      this.sizeLabel.textContent = "Size: click a picture first";
    }
  };

  Scene.prototype.startDrag = function (item, e) {
    if (!this.arranging || !this.isScene) return;
    var self = this;
    var rect = this.stage.getBoundingClientRect();
    var grabX = e.clientX - (rect.left + rect.width * item.x / 100);
    var grabY = e.clientY - (rect.top + rect.height * item.y / 100);
    this.select(item);
    item.el.setPointerCapture(e.pointerId);
    function move(ev) {
      item.x = round1(clamp((ev.clientX - grabX - rect.left) / rect.width * 100, 0, 100));
      item.y = round1(clamp((ev.clientY - grabY - rect.top) / rect.height * 100, 0, 100));
      self.place(item);
      self.writePositions();
    }
    function up() {
      item.el.removeEventListener("pointermove", move);
      item.el.removeEventListener("pointerup", up);
      item.el.removeEventListener("pointercancel", up);
    }
    item.el.addEventListener("pointermove", move);
    item.el.addEventListener("pointerup", up);
    item.el.addEventListener("pointercancel", up);
    e.preventDefault();
  };

  Scene.prototype.nudge = function (item, e) {
    if (!this.arranging) return;
    var step = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] }[e.key];
    if (!step) return;
    e.preventDefault();
    this.select(item);
    item.x = round1(clamp(item.x + step[0], 0, 100));
    item.y = round1(clamp(item.y + step[1], 0, 100));
    this.place(item);
    this.writePositions();
  };

  Scene.prototype.writePositions = function () {
    if (!this.output) return;
    var standalone = this.cfg.standalone;
    this.output.value = this.items.map(function (it) {
      if (standalone) {
        return '  { file: "' + it.file + '", name: "' + it.name + '", x: ' + it.x + ", y: " + it.y +
          ", width: " + it.width + (it.secondsGiven ? ", seconds: " + it.seconds : "") +
          (it.move ? ', move: "' + it.move + '"' : "") + " },";
      }
      return it.file + " | " + it.name + " | x=" + it.x + " y=" + it.y + " width=" + it.width +
        (it.keep ? " " + it.keep : "");
    }).join("\n");
  };

  // ------------------------------------------------------------------ start up

  function startSphinx() {
    document.querySelectorAll("div.christmas[data-christmas]").forEach(function (root) {
      if (root.dataset.xmasReady) return;
      root.dataset.xmasReady = "1";
      try {
        new Scene(root, JSON.parse(root.dataset.christmas));
      } catch (e) {
        root.textContent = "The Christmas scene could not be shown.";
        if (window.console) console.error(e);
      }
    });
  }

  // Student kit: my_scene.js makes sceneTitle, sceneBackground and myGifs.
  function startKit() {
    var root = document.querySelector("div[data-christmas-kit]");
    if (!root) return;
    if (typeof myGifs === "undefined" || !Array.isArray(myGifs)) {
      root.className = "xmas xmas-kit-error";
      root.innerHTML = "<strong>I cannot read my_scene.js.</strong><br>" +
        "Check that every line in your list ends with a comma, every name has speech marks " +
        "at both ends, and every { has a matching }.<br>Tip: press F12 and click Console to see which line has the mistake.";
      return;
    }
    new Scene(root, {
      standalone: true,
      base: typeof gifFolder !== "undefined" ? gifFolder : "gifs/",
      title: typeof sceneTitle !== "undefined" ? sceneTitle : "My Christmas scene",
      background: typeof sceneBackground !== "undefined" ? sceneBackground : "",
      backgroundUrl: typeof sceneBackground !== "undefined" ? sceneBackground : "",
      play: typeof playMode !== "undefined" ? playMode : "once",
      snow: typeof letItSnow !== "undefined" ? letItSnow : true,
      sound: typeof bellSound !== "undefined" ? bellSound : true,
      message: typeof finishMessage !== "undefined" ? finishMessage : "You found them all. Merry Christmas!",
      columns: typeof gridColumns !== "undefined" ? gridColumns : 4,
      items: myGifs.filter(function (g) { return g && g.file; }).map(function (g) {
        return { file: g.file, src: g.file, name: g.name, x: g.x, y: g.y, width: g.width, seconds: g.seconds, still: g.still, move: g.move };
      })
    });
  }

  function start() { startSphinx(); startKit(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
