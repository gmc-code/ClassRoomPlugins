/**
 * Noise Level Monitor (v2)
 *
 * - Web Audio microphone metering (time-domain RMS → dBFS, 0–100 scale)
 *   with browser auto-gain / noise suppression turned off for honest readings
 * - Six levels between Min and Max; instant step-up, timed step-down
 * - Settings dialog (gear button) with live reading and one-tap calibration
 * - Settings remembered per monitor in this browser (localStorage)
 * - Export / import settings as JSON (same format the :config: option reads)
 * - Full-screen mode for projecting; screen kept awake while monitoring
 */
(function () {
  'use strict';

  const NUM_LEVELS = 6;
  const FORMAT_VERSION = 2;

  // Keys and ranges mirror DEFAULTS / NUMERIC_LIMITS in noisemonitor.py.
  const SCHEMA = {
    title:           { type: 'string', max: 120 },
    scene:           { type: 'enum', values: ['classroom', 'lab', 'groups'] },
    finale:          { type: 'enum', values: ['room', 'tornado', 'foam', 'rocket', 'dino'] },
    threshold:       { type: 'int',   min: 0,   max: 100 },
    imageMin:        { type: 'int',   min: 0,   max: 99 },
    imageMax:        { type: 'int',   min: 1,   max: 100 },
    stepDownSeconds: { type: 'float', min: 0.5, max: 30 },
    sceneCycleMinutes: { type: 'int', min: 0, max: 60 },
    sessionMinutes:  { type: 'int',   min: 0,   max: 240 },
    sensitivity:     { type: 'int',   min: -30, max: 30 },
    smoothing:       { type: 'float', min: 0,   max: 0.95 },
    showDb:          { type: 'bool' },
    showMeter:       { type: 'bool' },
    showStatus:      { type: 'bool' },
  };

  const KEY_ALIASES = {
    'image-min': 'imageMin', image_min: 'imageMin',
    'image-max': 'imageMax', image_max: 'imageMax',
    'step-down': 'stepDownSeconds', stepDown: 'stepDownSeconds',
    'scene-cycle': 'sceneCycleMinutes', session: 'sessionMinutes',
    'show-db': 'showDb', 'show-meter': 'showMeter', 'show-status': 'showStatus',
  };

  const FALLBACK_DEFAULTS = {
    title: '🔊 Noise Level Monitor',
    scene: 'classroom',
    finale: 'room',
    threshold: 70, imageMin: 35, imageMax: 85,
    stepDownSeconds: 3, sensitivity: 0, smoothing: 0.8,
    sceneCycleMinutes: 0, sessionMinutes: 0,
    showDb: true, showMeter: true, showStatus: true,
    messages: ['Level 0', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'],
  };

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  /**
   * Merge every valid field from `raw` onto a copy of `base`.
   * Returns { settings, applied } where `applied` counts accepted fields.
   */
  function mergeSettings(base, raw) {
    const out = { ...base, messages: base.messages.slice() };
    let applied = 0;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { settings: out, applied };

    for (let [key, value] of Object.entries(raw)) {
      key = KEY_ALIASES[key] || key;
      const spec = SCHEMA[key];

      if (spec) {
        if (spec.type === 'bool') {
          if (typeof value === 'boolean') { out[key] = value; applied++; }
        } else if (spec.type === 'enum') {
          if (spec.values.includes(value)) { out[key] = value; applied++; }
        } else if (spec.type === 'string') {
          if (typeof value === 'string') { out[key] = value.slice(0, spec.max); applied++; }
        } else {
          const num = typeof value === 'number' ? value : parseFloat(value);
          if (Number.isFinite(num)) {
            let v = clamp(num, spec.min, spec.max);
            if (spec.type === 'int') v = Math.round(v);
            out[key] = v;
            applied++;
          }
        }
      } else if (key === 'messages' && value && typeof value === 'object') {
        let any = false;
        for (const [idx, msg] of Object.entries(value)) {
          const i = parseInt(idx, 10);
          if (i >= 0 && i < NUM_LEVELS && typeof msg === 'string') {
            out.messages[i] = msg.slice(0, 400);
            any = true;
          }
        }
        if (any) applied++;
      } else if (/^msg[0-5]$/.test(key) && typeof value === 'string') {
        out.messages[+key[3]] = value.slice(0, 400);
        applied++;
      }
    }

    if (out.imageMax <= out.imageMin) out.imageMax = Math.min(100, out.imageMin + 1);
    return { settings: out, applied };
  }

  const storage = {
    get(key) {
      if (!key) return null;
      try { return JSON.parse(window.localStorage.getItem(key)); } catch (e) { return null; }
    },
    set(key, value) {
      if (!key) return;
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* unavailable */ }
    },
    remove(key) {
      if (!key) return;
      try { window.localStorage.removeItem(key); } catch (e) { /* unavailable */ }
    },
  };

  function parseJSONAttr(el, name, fallback) {
    try { return JSON.parse(el.getAttribute(name)); } catch (e) { return fallback; }
  }

  // ------------------------------------------------------------------------ //

  function initNoiseMonitor(card) {
    if (card._noiseMonitorReady) return;
    card._noiseMonitorReady = true;

    const $ = (sel) => card.querySelector(sel);
    const $$ = (sel) => Array.from(card.querySelectorAll(sel));

    const els = {
      toggle: $('.noise-btn-toggle'),
      toggleLabel: $('.noise-btn-toggle .noise-btn-label'),
      fullscreen: $('.noise-btn-fullscreen'),
      timer: $('.noise-timer'),
      timerText: $('.noise-timer-text'),
      settingsBtn: $('.noise-btn-settings'),
      title: $('.noise-title'),
      message: $('.noise-level-message'),
      meter: $('.noise-meter'),
      bar: $('.noise-meter-bar'),
      peak: $('.noise-meter-peak'),
      thresholdMark: $('.noise-meter-threshold'),
      dbRow: $('.noise-readout-level'),
      db: $('.noise-db-value'),
      status: $('.noise-status-text'),
      dialog: $('.noise-settings'),
      close: $('.noise-btn-close'),
      liveDb: $('.noise-live-db'),
      liveLevel: $('.noise-live-level'),
      miniBar: $('.noise-mini-bar'),
      miniThreshold: $('.noise-mini-threshold'),
      calibrate: $('.noise-btn-calibrate'),
      exportBtn: $('.noise-btn-export'),
      importBtn: $('.noise-btn-import'),
      resetBtn: $('.noise-btn-reset'),
      file: $('.noise-file-import'),
      feedback: $('.noise-io-feedback'),
    };

    const scenes = parseJSONAttr(card, 'data-scenes', null);
    const imageWrap = $('.noise-image-wrap');
    let sceneEl = null;
    let sceneLayers = [];
    let preloadedScenes = false;
    const pageDefaults = mergeSettings(FALLBACK_DEFAULTS, parseJSONAttr(card, 'data-config', {})).settings;
    const storageKey = card.getAttribute('data-storage-key') || '';
    let settings = mergeSettings(pageDefaults, storage.get(storageKey)).settings;


    // Runtime state
    const state = {
      running: false,
      audioContext: null,
      stream: null,
      analyser: null,
      buffer: null,
      rafId: null,
      smoothed: 0,
      peak: 0,
      level: 0,
      levelChangedAt: 0,
      wakeLock: null,
      calibrating: null,
      bg: null,            // background currently shown (changes when cycling)
      teaser: null,        // Level 4 gag peeking in at Level 3
      nextTeaser: 0,
      startedAt: 0,
      lastCycleAt: 0,
      ticker: null,
    };

    // ---------------------------------------------------------------- settings UI

    function scaleToPercent(db) {
      const range = settings.imageMax - settings.imageMin;
      return range > 0 ? clamp(((db - settings.imageMin) / range) * 100, 0, 100) : 0;
    }

    function formatValue(key, v) {
      if (key === 'smoothing') return v.toFixed(2);
      if (key === 'stepDownSeconds') return Number.isInteger(v) ? String(v) : v.toFixed(1);
      if (key === 'sensitivity') return (v > 0 ? '+' : '') + v;
      return String(v);
    }

    function fillForm() {
      $$('[data-setting]').forEach((input) => {
        const key = input.getAttribute('data-setting');
        if (input.type === 'checkbox') input.checked = !!settings[key];
        else {
          if (input.tagName === 'SELECT' && !Array.from(input.options).some((o) => o.value === String(settings[key]))) {
            const opt = document.createElement('option');
            opt.value = String(settings[key]);
            opt.textContent = key === 'sessionMinutes' ? `${settings[key]} minutes`
              : key === 'sceneCycleMinutes' ? `Every ${settings[key]} minutes` : String(settings[key]);
            input.appendChild(opt);
          }
          input.value = settings[key];
        }
        const out = card.querySelector(`[data-out="${key}"]`);
        if (out) out.textContent = formatValue(key, settings[key]);
      });
      $$('.noise-msg-input').forEach((ta) => {
        ta.value = settings.messages[+ta.getAttribute('data-level')] || '';
      });
    }

    function applySettings() {
      els.title.textContent = settings.title;
      els.title.hidden = !settings.title.trim();
      els.meter.hidden = !settings.showMeter;
      els.dbRow.hidden = !settings.showDb;
      els.status.hidden = !settings.showStatus;
      const thrPct = scaleToPercent(settings.threshold);
      els.thresholdMark.style.left = `${thrPct}%`;
      if (els.miniThreshold) els.miniThreshold.style.left = `${thrPct}%`;
      applyScene();
      if (typeof showIdleTimer === 'function') showIdleTimer();
    }

    // ---------------------------------------------------------------- scenes

    const isScene = () => !!scenes && !!scenes.backgrounds[settings.scene];
    const finaleFor = (room) => (settings.finale && settings.finale !== 'room'
      ? settings.finale : (scenes.roomFinale || {})[room]);

    // The scene is a stack: room base (walls + floor), then depth slots with the
    // furniture rows between them (back row first), so a gag placed in a slot
    // is hidden by every row of desks in front of it. Flying things use the top slot.
    let gags = [];          // [{ img, level, random }]
    const levelWasOn = {};

    function buildScene() {
      if (sceneEl) return;
      sceneEl = document.createElement('div');
      sceneEl.className = 'noise-scene';
      imageWrap.appendChild(sceneEl);
    }

    function makeImg(cls, src) {
      const im = document.createElement('img');
      im.className = cls;
      im.alt = '';
      im.src = src;
      return im;
    }

    // Show a fresh random selection of one level's pool.
    function pickGags(level) {
      const spec = (((scenes.layers || {})[state.bg]) || [])[level - 1] || {};
      const pool = gags.filter((gg) => gg.level === level && gg.random);
      pool.forEach((gg) => { gg.picked = false; });
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool.slice(0, spec.pick || 0).forEach((gg) => { gg.picked = true; });
    }

    // Build the layered picture for one room (background, rows, gags, finale).
    function setRoomImages(room) {
      const finale = finaleFor(room);
      const key = `${room}|${finale}`;
      if (sceneEl.getAttribute('data-room') === key) return;
      sceneEl.setAttribute('data-room', key);
      sceneEl.textContent = '';
      gags = [];

      const rows = (scenes.rows || {})[room] || [];
      sceneEl.appendChild(makeImg('noise-scene-bg', scenes.backgrounds[room]));
      const slots = [];
      for (let d = 0; d <= rows.length; d++) {
        const slot = document.createElement('div');
        slot.className = 'noise-depth';
        slot.setAttribute('data-depth', String(d));
        sceneEl.appendChild(slot);
        slots.push(slot);
        if (d < rows.length) sceneEl.appendChild(makeImg('noise-scene-row', rows[d]));
      }
      const slotFor = (depth) => slots[depth === 'top' || depth == null ? rows.length : Math.min(+depth, rows.length)];

      const add = (item, level, random) => {
        const img = makeImg('noise-gag', item.src);
        slotFor(item.depth).appendChild(img);
        gags.push({ img, level, random, picked: false, src: item.src, quiet: item.quiet || null });
      };
      const layers = (scenes.layers || {})[room] || [];
      layers.forEach((spec, i) => {
        (spec.always || []).forEach((item) => add(item, i + 1, false));
        (spec.random || []).forEach((item) => add(item, i + 1, true));
      });
      const fin = scenes.finales[finale];
      if (fin) add(fin, NUM_LEVELS - 1, false);
      for (let L = 1; L < NUM_LEVELS; L++) { pickGags(L); levelWasOn[L] = L <= state.level; }
      updateSceneLayers(true);
    }

    function updateSceneLayers(force) {
      for (let L = 1; L < NUM_LEVELS; L++) {
        const on = L <= state.level;
        // A level that is switching on gets a new random mix of its gags.
        if (on && !levelWasOn[L] && !force) pickGags(L);
        levelWasOn[L] = on;
      }
      // From Level 4 up the room gets busy, so each lower level keeps just one gag.
      const busy = state.level >= 4;
      const keptPerLevel = {};
      gags.forEach((gg) => {
        let on = gg.level <= state.level && (!gg.random || gg.picked);
        if (on && busy && gg.level < 4 && gg.level !== NUM_LEVELS - 1) {
          keptPerLevel[gg.level] = (keptPerLevel[gg.level] || 0) + 1;
          if (keptPerLevel[gg.level] > 1) on = false;
        }
        // Level 3 teaser: one Level 4 gag pops in now and then.
        if (state.teaser && state.teaser.gg === gg) on = true;
        // No speech bubbles once the room is busy.
        if (gg.quiet) {
          const want = busy ? gg.quiet : gg.src;
          if (gg.img.getAttribute('src') !== want) gg.img.setAttribute('src', want);
        }
        gg.img.classList.toggle('is-on', on);
      });
    }

    // At Level 3, every 15-25 s show one random Level 4 gag for about 6 s.
    function updateTeaser(now) {
      const t = state.teaser;
      if (t && (now > t.until || state.level !== 3)) {
        state.teaser = null;
        state.nextTeaser = now + 15000 + Math.random() * 10000;
        updateSceneLayers();
        return;
      }
      if (!t && state.level === 3 && isScene()) {
        if (!state.nextTeaser) state.nextTeaser = now + 8000 + Math.random() * 7000;
        if (now >= state.nextTeaser) {
          const pool = gags.filter((gg) => gg.level === 4);
          if (pool.length) {
            state.teaser = { gg: pool[Math.floor(Math.random() * pool.length)], until: now + 6000 };
            updateSceneLayers();
          }
        }
      } else if (state.level !== 3) {
        state.nextTeaser = 0;
      }
    }

    // Untouched default messages follow the room on screen; custom ones always win.
    function isDefaultMessage(m, level) {
      return !!scenes && Object.values(scenes.messages || {}).some((set) => set[level] === m);
    }
    function messageFor(level) {
      const m = settings.messages[level];
      if (isScene() && isDefaultMessage(m, level) && scenes.messages[state.bg]) return scenes.messages[state.bg][level];
      return m;
    }

    function applyScene() {
      const on = isScene();
      card.classList.toggle('is-scene', on);
      if (on) {
        buildScene();
        if (!state.bg || !scenes.backgrounds[state.bg] || !settings.sceneCycleMinutes) state.bg = settings.scene;
        setRoomImages(state.bg);
        sceneEl.setAttribute('role', 'img');
        sceneEl.setAttribute('aria-label', `Classroom scene, noise level ${state.level} of ${NUM_LEVELS - 1}`);
        updateSceneLayers();
        if (!preloadedScenes) {
          preloadedScenes = true;
          Object.values(scenes.backgrounds).concat(...Object.values(scenes.rows || {}))
            .forEach((u) => { const im = new Image(); im.src = u; });
        }
      }
      els.message.textContent = messageFor(state.level);
      updateThumbs();
    }

    function updateThumbs() {
      if (!isScene()) return;
      const room = settings.scene;
      const layers = (scenes.layers || {})[room] || [];
      const full = (scenes.full || {})[room] || scenes.backgrounds[room];
      $$('.noise-msg-thumb').forEach((thumb, i) => {
        let src = full;
        const fin = scenes.finales[finaleFor(room)];
        if (i === NUM_LEVELS - 1 && fin) src = fin.src;
        else if (i > 0 && layers[i - 1]) {
          const first = (layers[i - 1].always || [])[0] || (layers[i - 1].random || [])[0];
          if (first) src = first.src;
        }
        thumb.src = src;
        thumb.style.backgroundImage = i === 0 ? '' : `url("${full}")`;
        thumb.classList.add('is-scene-thumb');
      });
    }

    function cycleBackground() {
      if (!sceneEl) return;
      const names = Object.keys(scenes.backgrounds);
      const next = names[(names.indexOf(state.bg) + 1) % names.length];
      state.bg = next;
      sceneEl.classList.add('is-changing');
      setTimeout(() => {
        setRoomImages(next);
        els.message.textContent = messageFor(state.level);
        const bg = sceneEl.querySelector('.noise-scene-bg');
        const show = () => sceneEl.classList.remove('is-changing');
        if (bg.complete) setTimeout(show, 60); else bg.addEventListener('load', show, { once: true });
      }, 500);
    }

    // ---------------------------------------------------------------- session timer

    function formatClock(ms) {
      const total = Math.max(0, Math.round(ms / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const sec = String(total % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
    }

    // Before starting, show the planned session length (if one is set).
    function showIdleTimer() {
      if (state.running || els.timer.classList.contains('is-done')) return;
      const limit = settings.sessionMinutes * 60000;
      els.timer.hidden = !(limit > 0);
      els.timer.classList.add('is-idle');
      els.timer.classList.remove('is-ending');
      if (limit > 0) {
        els.timerText.textContent = formatClock(limit);
        els.timer.title = `Monitor will run for ${formatClock(limit)}`;
        els.timer.setAttribute('aria-label', els.timer.title);
      }
    }

    function updateTimer() {
      if (!state.running) return;
      const now = Date.now();
      const elapsed = now - state.startedAt;
      const limit = settings.sessionMinutes * 60000;
      els.timer.hidden = false;
      els.timer.classList.remove('is-done', 'is-idle');
      if (limit > 0) {
        const left = limit - elapsed;
        els.timerText.textContent = formatClock(left);
        els.timer.classList.toggle('is-ending', left <= 60000);
        els.timer.title = `Monitor stops in ${formatClock(left)}`;
        els.timer.setAttribute('aria-label', `${formatClock(left)} left`);
        if (left <= 0) { stop('timeup'); return; }
      } else {
        els.timerText.textContent = formatClock(elapsed);
        els.timer.classList.remove('is-ending');
        els.timer.title = 'Time monitoring';
        els.timer.setAttribute('aria-label', `Monitoring for ${formatClock(elapsed)}`);
      }
      updateTeaser(now);
      if (isScene() && settings.sceneCycleMinutes > 0 &&
          now - state.lastCycleAt >= settings.sceneCycleMinutes * 60000) {
        state.lastCycleAt = now;
        cycleBackground();
      }
    }

    // When the picture style changes, swap untouched default messages to the new set.
    function swapDefaultMessages(fromScene, toScene) {
      if (!scenes || !scenes.messages) return settings.messages;
      const target = scenes.messages[toScene] || scenes.messages.classroom;
      return settings.messages.map((m, i) => (isDefaultMessage(m, i) ? target[i] : m));
    }

    let saveTimer = null;
    function persist() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => storage.set(storageKey, settings), 250);
    }

    function setSettings(next, { refillForm = true } = {}) {
      settings = next;
      if (refillForm) fillForm();
      applySettings();
      render(state.smoothed);
      persist();
    }

    $$('[data-setting]').forEach((input) => {
      const key = input.getAttribute('data-setting');
      const evt = input.type === 'checkbox' ? 'change' : 'input';
      input.addEventListener(evt, () => {
        const type = SCHEMA[key].type;
        const value = input.type === 'checkbox' ? input.checked
          : (type === 'string' || type === 'enum') ? input.value : parseFloat(input.value);
        const patch = { [key]: value };
        if (key === 'scene') {
          patch.messages = swapDefaultMessages(settings.scene, value);
          state.bg = value;
          state.lastCycleAt = Date.now();
        }

        // Keep Min < Max by nudging the other slider rather than refusing input.
        if (key === 'imageMin' && value >= settings.imageMax) patch.imageMax = Math.min(100, value + 1);
        if (key === 'imageMax' && value <= settings.imageMin) patch.imageMin = Math.max(0, value - 1);

        const next = mergeSettings(settings, patch).settings;
        // Refill only the sliders that were nudged, so typing in text fields isn't disturbed.
        setSettings(next, { refillForm: key === 'imageMin' || key === 'imageMax' || key === 'scene' });
        if (key === 'sessionMinutes' || key === 'sceneCycleMinutes') updateTimer();
        const out = card.querySelector(`[data-out="${key}"]`);
        if (out) out.textContent = formatValue(key, next[key]);
      });
    });

    $$('.noise-msg-input').forEach((ta) => {
      ta.addEventListener('input', () => {
        const messages = settings.messages.slice();
        messages[+ta.getAttribute('data-level')] = ta.value;
        setSettings({ ...settings, messages }, { refillForm: false });
      });
    });

    // ---------------------------------------------------------------- dialog

    function openSettings() {
      fillForm();
      setFeedback('');
      if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
      else els.dialog.setAttribute('open', '');
    }
    function closeSettings() {
      if (typeof els.dialog.close === 'function') els.dialog.close();
      else els.dialog.removeAttribute('open');
      els.settingsBtn.focus();
    }
    els.settingsBtn.addEventListener('click', openSettings);
    els.close.addEventListener('click', closeSettings);
    // Click on the backdrop (outside the panel) closes it.
    els.dialog.addEventListener('click', (e) => {
      if (e.target !== els.dialog) return;
      const r = els.dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeSettings();
    });

    let feedbackTimer = null;
    function setFeedback(text, kind) {
      clearTimeout(feedbackTimer);
      els.feedback.textContent = text;
      els.feedback.className = 'noise-io-feedback' + (kind ? ` is-${kind}` : '');
      if (text) feedbackTimer = setTimeout(() => setFeedback(''), 6000);
    }

    // ---------------------------------------------------------------- export / import / reset

    els.exportBtn.addEventListener('click', () => {
      const payload = {
        app: 'noisemonitor',
        version: FORMAT_VERSION,
        exported: new Date().toISOString(),
        ...settings,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
      const slug = (settings.title || 'noise-monitor')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'noise-monitor';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}-settings.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setFeedback(`Saved ${a.download}`, 'ok');
    });

    els.importBtn.addEventListener('click', () => els.file.click());

    els.file.addEventListener('change', async () => {
      const file = els.file.files && els.file.files[0];
      els.file.value = '';
      if (!file) return;
      try {
        if (file.size > 100000) throw new Error('That file is too large to be a settings file.');
        const raw = JSON.parse(await file.text());
        if (raw && raw.app && raw.app !== 'noisemonitor') {
          throw new Error(`That file is for "${raw.app}", not the noise monitor.`);
        }
        const { settings: next, applied } = mergeSettings(settings, raw);
        if (!applied) throw new Error('No noise monitor settings were found in that file.');
        setSettings(next);
        setFeedback(`Imported ${applied} setting${applied === 1 ? '' : 's'} from ${file.name}`, 'ok');
      } catch (err) {
        const msg = err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message;
        setFeedback(msg, 'error');
      }
    });

    els.resetBtn.addEventListener('click', () => {
      storage.remove(storageKey);
      setSettings(mergeSettings(pageDefaults, {}).settings);
      setFeedback('Settings reset to this page’s defaults.', 'ok');
    });

    // ---------------------------------------------------------------- audio

    async function start() {
      if (state.running) return true;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showStatus('Microphone access needs a secure (https) page in a modern browser.', 'danger');
        return false;
      }
      try {
        // Turn off the browser's voice processing: auto-gain in particular
        // flattens loud and quiet rooms to the same level.
        state.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false,
        });
        const Ctx = window.AudioContext || window.webkitAudioContext;
        state.audioContext = new Ctx();
        if (state.audioContext.state === 'suspended') await state.audioContext.resume();

        const source = state.audioContext.createMediaStreamSource(state.stream);
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 2048;
        state.analyser.smoothingTimeConstant = 0;
        source.connect(state.analyser);
        state.buffer = new Float32Array(state.analyser.fftSize);

        state.running = true;
        state.startedAt = state.lastCycleAt = Date.now();
        clearInterval(state.ticker);
        state.ticker = setInterval(updateTimer, 1000);
        updateTimer();
        state.firstFrame = true;
        state.levelChangedAt = performance.now();
        card.classList.add('is-running');
        els.toggle.setAttribute('aria-pressed', 'true');
        els.toggleLabel.textContent = 'Stop monitor';
        requestWakeLock();
        tick();
        return true;
      } catch (err) {
        console.error('noisemonitor: microphone error', err);
        cleanupAudio();
        const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        showStatus(denied
          ? 'Microphone blocked. Allow microphone access in the browser’s address bar, then try again.'
          : 'No microphone could be opened. Check one is connected and not in use by another app.', 'danger');
        return false;
      }
    }

    function cleanupAudio() {
      if (state.rafId) cancelAnimationFrame(state.rafId);
      state.rafId = null;
      if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
      if (state.audioContext && state.audioContext.state !== 'closed') state.audioContext.close();
      state.stream = state.audioContext = state.analyser = null;
    }

    function stop(reason) {
      const timeUp = reason === 'timeup';
      clearInterval(state.ticker);
      state.ticker = null;
      state.running = false;
      cleanupAudio();
      cancelCalibration();
      releaseWakeLock();
      card.classList.remove('is-running');
      els.toggle.setAttribute('aria-pressed', 'false');
      els.toggleLabel.textContent = 'Start monitor';
      state.smoothed = state.peak = 0;
      els.bar.style.width = '0%';
      els.peak.style.left = '0%';
      els.bar.classList.remove('is-danger');
      if (els.miniBar) els.miniBar.style.width = '0%';
      if (timeUp) {
        setLevel(0);
        els.timer.hidden = false;
        els.timer.classList.remove('is-ending');
        els.timer.classList.add('is-done');
        els.timerText.textContent = 'Time’s up!';
        showStatus('Time’s up! The monitor has stopped.', 'safe');
      } else {
        showIdleTimer();
        showStatus('Monitoring stopped.');
      }
    }

    els.toggle.addEventListener('click', () => (state.running ? stop() : start()));

    function measure() {
      state.analyser.getFloatTimeDomainData(state.buffer);
      let sum = 0;
      for (let i = 0; i < state.buffer.length; i++) sum += state.buffer[i] * state.buffer[i];
      const rms = Math.sqrt(sum / state.buffer.length);
      const dbfs = 20 * Math.log10(Math.max(rms, 1e-7)); // ≈ -140 … 0
      return clamp(dbfs + 100 + settings.sensitivity, 0, 100);
    }

    function tick() {
      if (!state.running) return;
      const instant = measure();
      const k = settings.smoothing;
      state.smoothed = state.firstFrame ? instant : k * state.smoothed + (1 - k) * instant;
      state.firstFrame = false;
      if (state.calibrating) state.calibrating.samples.push(state.smoothed);
      render(state.smoothed);
      state.rafId = requestAnimationFrame(tick);
    }

    // ---------------------------------------------------------------- rendering

    function showStatus(text, kind) {
      els.status.textContent = text;
      els.status.className = 'noise-status-text' + (kind ? ` is-${kind}` : '');
    }

    function rawLevelFor(db) {
      const range = settings.imageMax - settings.imageMin;
      if (range <= 0) return 0;
      const ratio = clamp((db - settings.imageMin) / range, 0, 1);
      return Math.min(NUM_LEVELS - 1, Math.floor(ratio * NUM_LEVELS));
    }

    function setLevel(level) {
      if (level === state.level) return;
      state.level = level;
      card.setAttribute('data-level', level);
      if (sceneEl) {
        updateSceneLayers();
        sceneEl.setAttribute('aria-label', `Classroom scene, noise level ${level} of ${NUM_LEVELS - 1}`);
      }
      els.message.textContent = messageFor(level);
    }

    function render(db) {
      const pct = scaleToPercent(db);
      const over = state.running && db >= settings.threshold;

      els.bar.style.width = `${pct}%`;
      els.bar.classList.toggle('is-danger', over);
      els.meter.setAttribute('aria-valuenow', Math.round(db));

      state.peak = Math.max(pct, state.peak - 0.15);
      els.peak.style.left = `${state.peak}%`;

      els.db.textContent = Math.round(db);
      if (els.liveDb) els.liveDb.textContent = state.running ? Math.round(db) : '–';
      if (els.miniBar) {
        els.miniBar.style.width = `${pct}%`;
        els.miniBar.classList.toggle('is-danger', over);
      }

      if (!state.running) return;

      if (over) showStatus('Too loud — above the warning threshold!', 'danger');
      else showStatus('Listening…', 'safe');

      // Level: instant step up, one step down per stepDownSeconds of quieter sound.
      const now = performance.now();
      const target = rawLevelFor(db);
      if (target > state.level) {
        setLevel(target);
        state.levelChangedAt = now;
      } else if (target < state.level) {
        if (now - state.levelChangedAt >= settings.stepDownSeconds * 1000) {
          setLevel(state.level - 1);
          state.levelChangedAt = now;
        }
      } else {
        state.levelChangedAt = now;
      }
      if (els.liveLevel) els.liveLevel.textContent = `Level ${target}`;
    }

    // ---------------------------------------------------------------- calibration

    function cancelCalibration() {
      if (!state.calibrating) return;
      clearInterval(state.calibrating.timer);
      state.calibrating = null;
      els.calibrate.disabled = false;
      els.calibrate.textContent = 'Calibrate to quiet room';
    }

    els.calibrate.addEventListener('click', async () => {
      if (state.calibrating) return;
      if (!(await start())) {
        setFeedback('Calibration needs microphone access.', 'error');
        return;
      }
      let remaining = 4;
      els.calibrate.disabled = true;
      els.calibrate.textContent = `Listening… ${remaining}`;
      state.calibrating = { samples: [], timer: null };
      state.calibrating.timer = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) {
          els.calibrate.textContent = `Listening… ${remaining}`;
          return;
        }
        const samples = state.calibrating.samples.slice().sort((a, b) => a - b);
        cancelCalibration();
        if (samples.length < 10) {
          setFeedback('Not enough audio was captured. Try again.', 'error');
          return;
        }
        // Use the 75th percentile so ordinary quiet-room rustle still reads as Level 0.
        const quiet = Math.round(samples[Math.floor(samples.length * 0.75)]);
        const shift = quiet - settings.imageMin;
        const next = mergeSettings(settings, {
          imageMin: settings.imageMin + shift,
          imageMax: settings.imageMax + shift,
          threshold: settings.threshold + shift,
        }).settings;
        setSettings(next);
        state.level = -1; setLevel(0);
        setFeedback(`Calibrated: quiet room reads ${quiet} dB. Scale moved ${shift >= 0 ? 'up' : 'down'} ${Math.abs(shift)} dB.`, 'ok');
      }, 1000);
    });

    // ---------------------------------------------------------------- full screen

    const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
    function toggleFullscreen() {
      if (fsElement() === card) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const req = card.requestFullscreen || card.webkitRequestFullscreen;
        if (req) req.call(card);
      }
    }
    if (!(card.requestFullscreen || card.webkitRequestFullscreen)) {
      els.fullscreen.hidden = true;
    } else {
      els.fullscreen.addEventListener('click', toggleFullscreen);
      const onFs = () => {
        const on = fsElement() === card;
        card.classList.toggle('is-fullscreen', on);
        els.fullscreen.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
        els.fullscreen.title = on ? 'Exit full screen' : 'Full screen';
      };
      document.addEventListener('fullscreenchange', onFs);
      document.addEventListener('webkitfullscreenchange', onFs);
    }

    // ---------------------------------------------------------------- wake lock

    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          state.wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (e) { /* not supported or refused; harmless */ }
    }
    function releaseWakeLock() {
      if (state.wakeLock) state.wakeLock.release().catch(() => {});
      state.wakeLock = null;
    }
    document.addEventListener('visibilitychange', () => {
      if (state.running && document.visibilityState === 'visible') requestWakeLock();
    });

    els.timer.addEventListener('click', () => {
      if (els.timer.classList.contains('is-done')) { els.timer.classList.remove('is-done'); showIdleTimer(); }
    });

    // ---------------------------------------------------------------- go

    fillForm();
    applySettings();
    card.setAttribute('data-level', '0');
  }

  function initAll() {
    document.querySelectorAll('.noise-monitor-card').forEach(initNoiseMonitor);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();

  window.NoiseMonitor = { init: initNoiseMonitor, initAll };
})();
