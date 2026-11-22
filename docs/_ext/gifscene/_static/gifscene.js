/* gifscene.js : a scene of GIFs that play when they are clicked.
 *
 * Used two ways:
 *   1. By the Sphinx ``gifscene`` directive, which writes <div class="gifscene" data-gifscene="{...}">.
 *   2. By a student kit (index.html + my_scene.js), where my_scene.js sets sceneTitle,
 *      sceneBackground, the myGifs list and the other settings, and the page has
 *      <div data-gifscene-kit>.
 */
(function () {
  "use strict";

  var NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
  var audio = null;

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
    var b = el("button", "gs-btn", label);
    b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }

  // move= values. left/right/up/down go off one side and come back in on the other.
  // wave-* bob up and down as they go, hop-* bounce along, jump leaps up and lands again.
  var MOVES = ["left", "right", "up", "down", "wave-left", "wave-right", "hop-left", "hop-right", "jump"];
  // play modes, for the whole scene (:play: / playMode) or one picture (play=)
  var PLAY_MODES = ["once", "toggle", "hover"];
  // spread= values for spawned GIFs (see Scene.prototype.spawn).
  var SPREADS = ["burst", "up", "down", "fountain", "trail"];
  // Most copies of spawned GIFs on screen at once in one scene, so the page stays smooth.
  var MAX_SPAWNED = 60;

  // spawnWidth can be one number (every copy that size) or a range "2-5" (each copy a random size).
  function parseRange(v) {
    if (typeof v === "number" && v > 0) return [v, v];
    if (Array.isArray(v) && v.length === 2) return [Math.min(v[0], v[1]), Math.max(v[0], v[1])];
    if (typeof v === "string") {
      var m = v.match(/^\s*([\d.]+)\s*(?:-\s*([\d.]+))?\s*$/);
      if (m) {
        var a = parseFloat(m[1]), b = m[2] ? parseFloat(m[2]) : a;
        if (a > 0 && b > 0) return [Math.min(a, b), Math.max(a, b)];
      }
    }
    return null;
  }

  function positive(v) { return typeof v === "number" && v > 0 ? v : null; }
  var EFFECTS = {
    snow: { label: "❄ Snow", title: "Turn the snow on or off" },
    bubbles: { label: "○ Bubbles", title: "Turn the bubbles on or off" },
    confetti: { label: "✦ Confetti", title: "Turn the confetti on or off" },
    wind: { label: "≋ Wind", title: "Turn the wind on or off" }
  };
  // :intensity: / effectIntensity: how many pieces there are and how fast they go.
  var INTENSITY = {
    light: { pieces: 0.45, speed: 0.75 },
    medium: { pieces: 1, speed: 1 },
    heavy: { pieces: 2.2, speed: 1.5 }
  };
  // choices in the effect button's panel
  var EFFECT_CHOICES = [
    { level: "off", label: "Off" },
    { level: "light", label: "Light ●○○" },
    { level: "medium", label: "Medium ●●○" },
    { level: "heavy", label: "Heavy ●●●" }
  ];

  // What each theme uses for anything the page does not set itself.
  var THEMES = {
    none: { title: "Scene", effect: "confetti", icon: "★", message: "You found them all!" },
    christmas: { title: "Christmas", effect: "snow", icon: "🎄", message: "You found them all. Merry Christmas!" },
    beach: { title: "At the beach", effect: "wind", icon: "☀", message: "You found them all. Have a sunny summer holiday!" },
    reef: { title: "Coral reef", effect: "bubbles", icon: "🐠", message: "You found them all. What a reef!" },
    toyroom: { title: "Toy room", effect: "confetti", icon: "🧸", message: "You found them all. Time to tidy up!" }
  };

  function withThemeDefaults(cfg) {
    var theme = THEMES[cfg.theme] ? cfg.theme : "none";
    var defaults = THEMES[theme];
    var out = {};
    Object.keys(cfg).forEach(function (k) { out[k] = cfg[k]; });
    out.theme = theme;
    ["title", "effect", "icon", "message"].forEach(function (k) {
      if (out[k] === undefined || out[k] === null) out[k] = defaults[k];
    });
    if (!EFFECTS[out.effect]) out.effect = defaults.effect;
    return out;
  }

  function round1(n) { return Math.round(n * 10) / 10; }
  function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }

  // ------------------------------------------------------------------ scene

  function Scene(root, cfg) {
    var self = this;
    cfg = withThemeDefaults(cfg);
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
      seconds: typeof it.seconds === "number" && it.seconds > 0 ? it.seconds : (it.move === "jump" ? 1.5 : it.move ? 6 : 3),
      secondsGiven: typeof it.seconds === "number",
      keep: it.keep || "",
      move: MOVES.indexOf(it.move) >= 0 ? it.move : null,
      mode: PLAY_MODES.indexOf(it.play) >= 0 ? it.play : null,
      spawn: it.spawn ? this.url(it.spawn) : null,
      count: typeof it.count === "number" ? clamp(Math.round(it.count), 1, 20) : 5,
      spread: SPREADS.indexOf(it.spread) >= 0 ? it.spread : "burst",
      spawnWidth: parseRange(it.spawnWidth),
      every: positive(it.every),
      spawnFor: positive(it.spawnFor),
      life: positive(it.life),
      distance: positive(it.distance),
      spawnTimer: null,
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
    root.classList.add("gifscene");
    root.classList.toggle("gs-is-scene", this.isScene);
    root.classList.toggle("gs-is-grid", !this.isScene);
    root.classList.toggle("gs-hide-names", cfg.showNames === false);
    root.classList.add("gs-" + cfg.theme);
    this.effect = cfg.effect;
    this.intensity = INTENSITY[cfg.intensity] ? cfg.intensity : "medium";
    root.textContent = "";

    var head = el("div", "gs-head");
    head.appendChild(el("div", "gs-title", cfg.title));
    this.counter = el("div", "gs-counter");
    this.counter.setAttribute("aria-live", "polite");
    head.appendChild(this.counter);
    root.appendChild(head);

    var bar = el("div", "gs-bar");
    bar.appendChild(button("▶ Play all", "Play every picture", function () { self.playAll(); }));
    bar.appendChild(button("■ Stop all", "Stop every picture", function () { self.stopAll(); }));
    var fx = EFFECTS[this.effect];
    // The effect button opens a small panel: Off, Light, Medium, Heavy. The button shows the
    // current choice, e.g. "❄ Snow: Medium".
    var fxWrap = el("span", "gs-fx-wrap");
    this.effectBtn = button("", fx.title, function () { self.toggleEffectPanel(); });
    this.effectBtn.setAttribute("aria-haspopup", "true");
    this.effectBtn.setAttribute("aria-expanded", "false");
    this.effectPanel = el("div", "gs-fx-panel");
    this.effectPanel.hidden = true;
    this.effectPanel.setAttribute("role", "group");
    this.effectPanel.setAttribute("aria-label", "How much " + this.effect);
    this.effectChoices = EFFECT_CHOICES.map(function (c) {
      var b = button(c.label, "", function () { self.chooseEffect(c.level); });
      b.classList.add("gs-fx-choice");
      b.dataset.level = c.level;
      self.effectPanel.appendChild(b);
      return b;
    });
    fxWrap.appendChild(this.effectBtn);
    fxWrap.appendChild(this.effectPanel);
    bar.appendChild(fxWrap);
    // close the panel when something else is clicked, or with Escape
    document.addEventListener("click", function (e) {
      if (!self.effectPanel.hidden && !fxWrap.contains(e.target)) self.toggleEffectPanel(false);
    });
    fxWrap.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !self.effectPanel.hidden) {
        self.toggleEffectPanel(false);
        self.effectBtn.focus();
      }
    });
    this.soundBtn = button("🔔 Sound", "Turn the sound on or off", function () {
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

    this.stage = el("div", "gs-stage");
    if (this.isScene) {
      var bg = el("img", "gs-bg");
      bg.alt = "";
      bg.draggable = false;
      bg.addEventListener("error", function () {
        self.stage.classList.add("gs-no-bg");
        self.problem("I cannot find the background picture “" + cfg.background + "”. Check its name and folder.");
      });
      bg.addEventListener("load", function () { self.fitFullscreen(); });
      bg.src = cfg.backgroundUrl || this.url(cfg.background);
      this.bg = bg;
      this.stage.appendChild(bg);
    } else {
      this.stage.style.setProperty("--gs-columns", cfg.columns || 4);
    }
    this.items.forEach(function (item) { self.stage.appendChild(self.buildItem(item)); });
    this.spawnLayer = el("div", "gs-spawns");
    this.spawnLayer.setAttribute("aria-hidden", "true");
    this.stage.appendChild(this.spawnLayer);
    this.effectLayer = el("div", "gs-effects");
    this.effectLayer.setAttribute("aria-hidden", "true");
    this.stage.appendChild(this.effectLayer);
    root.appendChild(this.stage);

    this.message = el("div", "gs-message");
    this.message.hidden = true;
    root.appendChild(this.message);
    this.problems = el("div", "gs-problems");
    this.problems.hidden = true;
    root.appendChild(this.problems);

    if (this.isScene) this.buildArrangePanel();
    if (!this.items.length) this.problem("There are no pictures in this scene yet.");

    this.stage.addEventListener("click", function (e) {
      if (self.arranging && !e.target.closest(".gs-item")) self.select(null);
    });
    document.addEventListener("fullscreenchange", function () { self.fitFullscreen(); });
    window.addEventListener("resize", function () { self.fitFullscreen(); });

    this.updateCounter();
    this.setEffect(!!cfg.startEffect);
  };

  Scene.prototype.problem = function (text) {
    this.problems.hidden = false;
    this.problems.appendChild(el("div", "gs-problem", "⚠ " + text));
  };

  // ------------------------------------------------------------------ pictures

  Scene.prototype.buildItem = function (item) {
    var self = this;
    var b = el("button", "gs-item");
    b.type = "button";
    b.setAttribute("aria-label", item.name + ". Click to play.");
    item.el = b;

    var frame = el("span", "gs-frame");
    frame.style.aspectRatio = String(item.ratio);
    var still;
    if (item.still) {
      still = el("img", "gs-still");
      still.alt = "";
      still.src = item.still;
    } else {
      still = el("canvas", "gs-still");
      var probe = new Image();
      probe.onload = function () {
        still.width = probe.naturalWidth;
        still.height = probe.naturalHeight;
        frame.style.aspectRatio = probe.naturalWidth + " / " + probe.naturalHeight;
        still.getContext("2d").drawImage(probe, 0, 0);   // draws the first frame of the GIF
      };
      probe.onerror = function () {
        b.classList.add("gs-missing");
        frame.appendChild(el("span", "gs-missing-text", "Cannot find " + item.file));
        self.problem("I cannot find “" + item.file + "”. Check the spelling, the .gif ending and the folder.");
      };
      probe.src = item.src;
    }
    still.draggable = false;
    frame.appendChild(still);

    var gif = el("img", "gs-gif");
    gif.alt = "";
    gif.draggable = false;
    gif.addEventListener("load", function () {
      if (!item.playing) return;
      b.classList.add("gs-playing");
      clearTimeout(item.timer);
      if (item.timed) item.timer = setTimeout(function () { self.stop(item, true); }, item.seconds * 1000);
    });
    item.gif = gif;
    frame.appendChild(gif);
    b.appendChild(frame);
    b.appendChild(el("span", "gs-name", item.name));
    this.place(item);

    // http pages can fetch the GIF once and replay it from memory; file:// pages cannot.
    if (/^https?:$/.test(location.protocol) && window.fetch) {
      fetch(item.src).then(function (r) { return r.ok ? r.blob() : null; })
        .then(function (blob) { item.blob = blob; }).catch(function () {});
    }

    var mode = this.modeOf(item);
    b.addEventListener("click", function () {
      if (self.arranging) { self.select(item); return; }
      var hovering = mode === "hover" && window.matchMedia("(hover: hover)").matches;
      if (mode === "once") self.play(item, true);
      else if (hovering) self.play(item, false);
      else if (item.playing) self.stop(item);
      else self.play(item, false);
      self.markFound(item);
      if (self.soundOn) chime(item.index);
    });
    if (mode === "hover") {
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

  // A picture's own play= mode, or the scene's mode if it has none.
  Scene.prototype.modeOf = function (item) {
    return item.mode || this.mode;
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
    if (item.el.classList.contains("gs-missing")) return;
    clearTimeout(item.timer);
    item.playing = true;
    item.timed = timed;
    item.gif.src = this.freshUrl(item);
    this.travel(item, timed);
    this.startSpawning(item);
  };

  // A picture with a move= setting travels when it plays (see MOVES). One lap takes item.seconds,
  // and every lap ends back where the picture started.
  Scene.prototype.travel = function (item, timed) {
    if (item.trip) { item.trip.cancel(); item.trip = null; }
    if (!item.move || !this.isScene || !item.el.animate) return;
    item.trip = item.el.animate(this.tripFrames(item), {
      duration: item.seconds * 1000, iterations: timed ? 1 : Infinity, easing: "linear"
    });
  };

  Scene.prototype.tripFrames = function (item) {
    var move = item.move;
    var w = this.stage.offsetWidth, h = this.stage.offsetHeight;
    // the picture's height as a percentage of the scene's height
    var high = item.width * (w && h ? w / h : 16 / 9) / (item.ratio || 1);
    var i, t;

    if (move === "jump") {
      // up in an arc and back down, nose up on the way up and nose down on the way down
      var lift = high * 1.1, jump = [];
      for (i = 0; i <= 24; i++) {
        t = i / 24;
        jump.push({
          left: item.x + "%",
          top: round1(item.y - lift * 4 * t * (1 - t)) + "%",
          transform: "translate(-50%, -50%) rotate(" + round1(-30 * Math.sin(2 * Math.PI * t)) + "deg)"
        });
      }
      return jump;
    }

    if (move === "up" || move === "down") {
      var halfH = high / 2 + 1;
      var exitY = move === "down" ? 100 + halfH : -halfH;
      var enterY = move === "down" ? -halfH : 100 + halfH;
      var outY = Math.abs(exitY - item.y), backY = Math.abs(item.y - enterY);
      var turnY = outY / (outY + backY);
      return [
        { left: item.x + "%", top: item.y + "%" },
        { left: item.x + "%", top: exitY + "%", offset: turnY },
        { left: item.x + "%", top: enterY + "%", offset: turnY },
        { left: item.x + "%", top: item.y + "%" }
      ];
    }

    var right = /right$/.test(move);
    var sign = right ? 1 : -1;
    var half = item.width / 2 + 1;
    var exit = right ? 100 + half : -half;
    var enter = right ? -half : 100 + half;
    var out = Math.abs(exit - item.x);
    var total = out + Math.abs(item.x - enter);
    var turn = out / total;

    if (move === "left" || move === "right") {
      return [
        { left: item.x + "%", top: item.y + "%" },
        { left: exit + "%", top: item.y + "%", offset: turn },
        { left: enter + "%", top: item.y + "%", offset: turn },
        { left: item.x + "%", top: item.y + "%" }
      ];
    }

    // wave-* and hop-*: work out the height from the distance travelled, with a whole number
    // of waves or hops in a lap so the picture lands back exactly where it started.
    var hop = /^hop/.test(move);
    var step = hop ? item.width * 1.4 : item.width * 3;
    var count = Math.max(1, Math.round(total / step));
    step = total / count;
    var size = hop ? high * 0.7 : high * 0.18;
    function lift(d) {
      return hop ? -size * Math.abs(Math.sin(Math.PI * d / step)) : size * Math.sin(2 * Math.PI * d / step);
    }
    function at(d, x, offset) {
      return { left: round1(x) + "%", top: round1(item.y + lift(d)) + "%", offset: offset };
    }
    var frames = [], samples = Math.max(40, count * (hop ? 12 : 16));
    var turned = false;
    for (i = 0; i <= samples; i++) {
      var d = total * i / samples;
      if (!turned && d >= out) {
        frames.push(at(out, exit, turn));
        frames.push(at(out, enter, turn));
        turned = true;
        if (d === out) continue;
      }
      frames.push(at(d, d < out ? item.x + sign * d : enter + sign * (d - out), d / total));
    }
    return frames;
  };

  // ended = the picture finished playing by itself. A spawnfor= stream then carries on for its
  // own time; anything else (Stop all, a second click in toggle mode) stops it straight away.
  Scene.prototype.stop = function (item, ended) {
    clearTimeout(item.timer);
    if (!(ended && item.spawnFor)) {
      clearInterval(item.spawnTimer);
      item.spawnTimer = null;
    }
    item.playing = false;
    if (item.trip) { item.trip.cancel(); item.trip = null; }
    item.el.classList.remove("gs-playing");
    item.gif.removeAttribute("src");
  };

  Scene.prototype.playAll = function () {
    var self = this;
    this.items.forEach(function (item, i) {
      setTimeout(function () { self.play(item, self.modeOf(item) === "once"); self.markFound(item); }, i * 150);
    });
  };

  Scene.prototype.stopAll = function () {
    var self = this;
    this.items.forEach(function (item) { self.stop(item); });
    if (this.spawnLayer) this.spawnLayer.textContent = "";
  };

  // ------------------------------------------------------------------ spawned GIFs

  // spawn=small.gif makes copies of a small GIF come out of the picture when it plays.
  //   One go:  count copies come out at once (burst, up, down, fountain).
  //   Stream:  one copy at a time, every every= seconds. A stream is used when every= is set,
  //            for spread=trail (count copies over the picture's seconds), or when spawnfor= is
  //            set without every= (count copies spread over spawnfor seconds).
  //            It lasts spawnfor= seconds, or for as long as the picture plays.
  // life= is how long each copy takes, distance= how far it goes (percent of the scene) and
  // spawnwidth= its size (a number, or a range like 2-5 for random sizes).
  Scene.prototype.startSpawning = function (item) {
    var self = this;
    clearInterval(item.spawnTimer);
    item.spawnTimer = null;
    // Spawning follows a click, like travelling, so it happens even when the computer is set to
    // reduce motion (Windows: Settings > Accessibility > Visual effects > Animation effects).
    if (!item.spawn || !this.isScene || !document.body.animate) return;
    var gap = null;
    if (item.every) gap = item.every * 1000;
    else if (item.spread === "trail") gap = item.seconds * 1000 / item.count;
    else if (item.spawnFor) gap = item.spawnFor * 1000 / item.count;
    if (gap === null) {
      for (var i = 0; i < item.count; i++) this.spawnOne(item, i, i * 70);
      return;
    }
    gap = Math.max(50, gap);
    var stopAt = item.spawnFor ? Date.now() + item.spawnFor * 1000 : null;
    var n = 0;
    function tick() {
      var done = stopAt ? Date.now() >= stopAt : !item.playing;
      if (done) {
        clearInterval(item.spawnTimer);
        item.spawnTimer = null;
        return;
      }
      self.spawnOne(item, n++, 0);
    }
    tick();
    item.spawnTimer = setInterval(tick, gap);
  };

  Scene.prototype.spawnOne = function (item, i, delay) {
    if (this.spawnLayer.childElementCount >= MAX_SPAWNED) return;
    var stage = this.stage.getBoundingClientRect();
    var box = item.el.getBoundingClientRect();
    if (!stage.width) return;
    var rnd = function (a, b) { return a + Math.random() * (b - a); };
    // start from the middle of the picture, wherever it has travelled to
    var x = (box.left + box.width / 2 - stage.left) / stage.width * 100;
    var y = (box.top + box.height / 2 - stage.top) / stage.height * 100;
    var w = item.spawnWidth ? round1(rnd(item.spawnWidth[0], item.spawnWidth[1])) : Math.max(2, round1(item.width * 0.35));
    var img = el("img", "gs-spawned");
    img.alt = "";
    img.src = item.spawn;
    img.style.left = x + "%";
    img.style.top = y + "%";
    img.style.width = w + "%";
    this.spawnLayer.appendChild(img);

    var W = stage.width, H = stage.height;
    // distance= (percent of the scene) sets how far the copies go, give or take 15%
    var far = item.distance ? function () { return item.distance / 100 * rnd(0.85, 1.15); } : null;
    var frames = [], duration, easing = "linear", k, t;
    var base = "translate(-50%, -50%) ";
    function at(dx, dy, scale, opacity, offset) {
      var f = { transform: base + "translate(" + Math.round(dx) + "px, " + Math.round(dy) + "px) scale(" + scale + ")", opacity: opacity };
      if (offset !== undefined) f.offset = offset;
      return f;
    }
    var spread = item.spread;
    if (spread === "burst") {
      var a = (i / item.count) * Math.PI * 2 + rnd(-0.3, 0.3), dist = (far ? far() : rnd(0.12, 0.22)) * W;
      frames = [at(0, 0, 0.4, 1), at(Math.cos(a) * dist * 0.8, Math.sin(a) * dist * 0.8, 1, 1, 0.7),
                at(Math.cos(a) * dist, Math.sin(a) * dist, 1, 0)];
      duration = rnd(1000, 1400);
      easing = "cubic-bezier(0.2, 0.7, 0.3, 1)";
    } else if (spread === "up") {
      var rise = (far ? far() : rnd(0.3, 0.5)) * H, sway = rnd(0.02, 0.05) * W, ph = rnd(0, 6);
      for (k = 0; k <= 12; k++) {
        t = k / 12;
        frames.push(at(sway * Math.sin(ph + t * 7), -rise * t, 0.6 + 0.4 * Math.min(1, t * 4), t < 0.75 ? 1 : (1 - t) * 4));
      }
      duration = rnd(2500, 3500);
    } else if (spread === "fountain") {
      var peak = (far ? far() : rnd(0.18, 0.3)) * H;
      var dx = (far ? peak / H * rnd(-0.6, 0.6) : rnd(-0.14, 0.14)) * W, drop = peak * rnd(0.4, 0.7);
      for (k = 0; k <= 16; k++) {
        t = k / 16;
        frames.push(at(dx * t, -peak * 4 * t * (1 - t) + drop * t * t, 1, t < 0.8 ? 1 : (1 - t) * 5));
      }
      duration = rnd(1300, 1700);
    } else {
      // down and trail: fall, speeding up, and fade out
      var fall = (far ? far() : spread === "trail" ? rnd(0.12, 0.2) : rnd(0.3, 0.45)) * H, drift = rnd(-0.04, 0.04) * W;
      for (k = 0; k <= 10; k++) {
        t = k / 10;
        frames.push(at(drift * t, fall * t * t, 1, t < 0.7 ? 1 : (1 - t) / 0.3));
      }
      duration = spread === "trail" ? rnd(1400, 1800) : rnd(1500, 2000);
    }
    // life= (seconds) sets how long each copy takes, give or take 10%
    if (item.life) duration = item.life * 1000 * rnd(0.9, 1.1);
    var anim = img.animate(frames, { duration: duration, delay: delay, easing: easing, fill: "both" });
    anim.onfinish = function () { img.remove(); };
  };

  Scene.prototype.markFound = function (item) {
    if (item.found) return;
    item.found = true;
    item.el.classList.add("gs-found");
    this.updateCounter();
    var all = this.items.every(function (it) { return it.found || it.el.classList.contains("gs-missing"); });
    if (all && !this.celebrated && this.items.length > 1) {
      this.celebrated = true;
      this.message.textContent = (this.cfg.icon ? this.cfg.icon + " " : "") + this.cfg.message;
      this.message.hidden = false;
      this.setEffect(true);
    }
  };

  Scene.prototype.updateCounter = function () {
    var found = this.items.filter(function (it) { return it.found; }).length;
    this.counter.textContent = "Clicked " + found + " of " + this.items.length;
  };

  // ------------------------------------------------------------------ effects

  // The effect: snow (falls), bubbles (rise), confetti (falls and spins) or wind (gusts of
  // streaks and grains of sand blowing across from left to right).
  // Open or close the effect panel (open = true/false, or leave it out to switch).
  Scene.prototype.toggleEffectPanel = function (open) {
    if (open === undefined) open = this.effectPanel.hidden;
    this.effectPanel.hidden = !open;
    this.effectBtn.setAttribute("aria-expanded", open);
    if (open) {
      var current = this.effectOn ? this.intensity : "off";
      this.effectChoices.forEach(function (b) { if (b.dataset.level === current) b.focus(); });
    }
  };

  // A choice in the panel: "off", or a level that turns the effect on at that amount.
  Scene.prototype.chooseEffect = function (level) {
    if (level === "off") {
      this.setEffect(false);
    } else if (INTENSITY[level]) {
      this.intensity = level;
      this.setEffect(true);
    }
    this.toggleEffectPanel(false);
    this.effectBtn.focus();
  };

  // Show the current choice on the effect button and in the panel.
  Scene.prototype.showEffectState = function () {
    var state = this.effectOn ? this.intensity : "off";
    var word = state.charAt(0).toUpperCase() + state.slice(1);
    this.effectBtn.textContent = EFFECTS[this.effect].label + ": " + word;
    this.effectBtn.title = "Choose how much " + this.effect + " (now " + state + ")";
    this.effectChoices.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.level === state); });
  };

  Scene.prototype.setEffect = function (on) {
    this.effectOn = on;
    this.effectBtn.setAttribute("aria-pressed", on);
    this.showEffectState();
    this.effectLayer.textContent = "";
    if (!on) return;
    var effect = this.effect;
    var level = INTENSITY[this.intensity];
    var count = Math.round(40 * level.pieces);
    var i, piece, time;
    if (effect === "wind") {
      for (i = 0; i < count; i++) {
        var sand = i % 3 === 0;
        piece = el("span", "gs-piece gs-fx-wind " + (sand ? "gs-wind-sand" : "gs-wind-streak"));
        var len = sand ? 3 + Math.random() * 3 : (60 + Math.random() * 140) * (0.8 + 0.2 * level.speed);
        time = (sand ? 2.5 + Math.random() * 3 : 1.4 + Math.random() * 1.8) / level.speed;
        piece.style.top = 4 + Math.random() * 92 + "%";
        piece.style.width = len + "px";
        piece.style.height = (sand ? len : 2 + Math.random() * 2) + "px";
        piece.style.animationDuration = time + "s";
        piece.style.animationDelay = -Math.random() * time + "s";
        piece.style.setProperty("--gs-lift", (Math.random() * 40 - 20) * level.speed + "px");
        piece.style.setProperty("--gs-o", (sand ? 0.7 : 0.55) + Math.random() * 0.3);
        this.effectLayer.appendChild(piece);
      }
      return;
    }
    var colours = ["#f43f5e", "#f59e0b", "#22c55e", "#0ea5e9", "#a855f7", "#facc15"];
    for (i = 0; i < count; i++) {
      piece = el("span", "gs-piece gs-fx-" + effect);
      var size = effect === "bubbles" ? 8 + Math.random() * 18 : 4 + Math.random() * 8;
      if (effect === "snow" && this.intensity === "heavy") size *= 1.2;
      time = (6 + Math.random() * 8) / level.speed;
      piece.style.left = Math.random() * 100 + "%";
      piece.style.width = size + "px";
      piece.style.height = (effect === "confetti" ? size * 0.5 : size) + "px";
      piece.style.opacity = 0.5 + Math.random() * 0.5;
      piece.style.animationDuration = time + "s";
      piece.style.animationDelay = -Math.random() * time + "s";
      piece.style.setProperty("--gs-drift", (Math.random() * 60 - 30) * level.speed + "px");
      if (effect === "confetti") piece.style.background = colours[i % colours.length];
      this.effectLayer.appendChild(piece);
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
    var panel = el("div", "gs-arrange");
    panel.hidden = true;
    panel.appendChild(el("p", "gs-arrange-help",
      "Drag a picture to move it. Click a picture, then use the slider to change its size. " +
      "The arrow keys move the chosen picture a little at a time."));
    var row = el("label", "gs-size-row");
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
    panel.appendChild(el("p", "gs-arrange-help", this.cfg.standalone
      ? "When you are happy, copy these lines and paste them over the lines inside myGifs = [ ... ] in my_scene.js."
      : "When you are happy, copy these lines and paste them over the picture lines in the directive."));
    this.output = el("textarea", "gs-output");
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
    this.root.classList.toggle("gs-arranging", on);
    this.arrangeBtn.setAttribute("aria-pressed", on);
    this.arrangePanel.hidden = !on;
    if (!on) this.select(null);
    this.writePositions();
  };

  Scene.prototype.select = function (item) {
    if (this.selected) this.selected.el.classList.remove("gs-selected");
    this.selected = item;
    this.sizeSlider.disabled = !item;
    if (item) {
      item.el.classList.add("gs-selected");
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
          ", width: " + it.width + (it.keep ? ", " + it.keep : "") + " },";
      }
      return it.file + " | " + it.name + " | x=" + it.x + " y=" + it.y + " width=" + it.width +
        (it.keep ? " " + it.keep : "");
    }).join("\n");
  };

  // ------------------------------------------------------------------ start up

  function startSphinx() {
    document.querySelectorAll("div.gifscene[data-gifscene]").forEach(function (root) {
      if (root.dataset.gifsceneReady) return;
      root.dataset.gifsceneReady = "1";
      try {
        new Scene(root, JSON.parse(root.dataset.gifscene));
      } catch (e) {
        root.textContent = "The scene could not be shown.";
        if (window.console) console.error(e);
      }
    });
  }

  // Student kit: my_scene.js makes sceneTitle, sceneBackground, myGifs and the other settings.
  // Anything it leaves out comes from the theme (see THEMES).
  // settings the Arrange button must keep when it writes a kit line out again
  function kitKeep(g) {
    var out = [];
    ["seconds", "move", "play", "spawn", "count", "spread", "spawnWidth", "every", "spawnFor", "life", "distance", "still"].forEach(function (k) {
      if (g[k] !== undefined) out.push(k + ": " + (typeof g[k] === "string" ? JSON.stringify(g[k]) : g[k]));
    });
    return out.join(", ");
  }

  function startKit() {
    var root = document.querySelector("div[data-gifscene-kit]");
    if (!root) return;
    if (typeof myGifs === "undefined" || !Array.isArray(myGifs)) {
      root.className = "gifscene gs-kit-error";
      root.innerHTML = "<strong>I cannot read my_scene.js.</strong><br>" +
        "Check that every line in your list ends with a comma, every name has speech marks " +
        "at both ends, and every { has a matching }.<br>Tip: press F12 and click Console to see which line has the mistake.";
      return;
    }
    new Scene(root, {
      standalone: true,
      base: typeof gifFolder !== "undefined" ? gifFolder : "gifs/",
      title: typeof sceneTitle !== "undefined" ? sceneTitle : undefined,
      background: typeof sceneBackground !== "undefined" ? sceneBackground : "",
      backgroundUrl: typeof sceneBackground !== "undefined" ? sceneBackground : "",
      play: typeof playMode !== "undefined" ? playMode : "once",
      startEffect: typeof startEffect !== "undefined" ? startEffect : false,
      effect: typeof sceneEffect !== "undefined" ? sceneEffect : undefined,
      intensity: typeof effectIntensity !== "undefined" ? effectIntensity : "medium",
      theme: typeof sceneTheme !== "undefined" ? sceneTheme : "",
      icon: typeof finishIcon !== "undefined" ? finishIcon : undefined,
      sound: typeof playSound !== "undefined" ? playSound : true,
      message: typeof finishMessage !== "undefined" ? finishMessage : undefined,
      columns: typeof gridColumns !== "undefined" ? gridColumns : 4,
      items: myGifs.filter(function (g) { return g && g.file; }).map(function (g) {
        return {
          file: g.file, src: g.file, name: g.name, x: g.x, y: g.y, width: g.width, seconds: g.seconds,
          still: g.still, move: g.move, play: g.play, spawn: g.spawn, count: g.count, spread: g.spread, spawnWidth: g.spawnWidth,
          every: g.every, spawnFor: g.spawnFor, life: g.life, distance: g.distance,
          keep: kitKeep(g)
        };
      })
    });
  }

  function start() { startSphinx(); startKit(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
