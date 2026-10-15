(function () {
    'use strict';

    var COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    var MAX_VISIBLE = 10;           /* names shown in the stack while it cycles */
    var CARD_H = 56;                /* must match .np-card height in the CSS */
    var STEP = 46;                  /* vertical distance between stacked cards (cards overlap) */
    var SETTLE_GAP = 10;            /* gap between the chosen cards once the stack settles */
    var XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    var FILE_APP = 'namepicker', FILE_VERSION = 2;
    var MAX_JSON_BYTES = 2 * 1024 * 1024;
    var HISTORY_MAX = 200;          /* rounds kept in the pick history */
    var xlsxPromise = null;

    /* Bright card colours. "dark" means the card uses dark text for contrast. */
    var PALETTE = [
        { c: '#ff2d55' }, { c: '#ff8a00' }, { c: '#ffd60a', dark: true }, { c: '#8be31a', dark: true },
        { c: '#00c46a' }, { c: '#00d4d4', dark: true }, { c: '#0aa5ff' }, { c: '#3b6bff' },
        { c: '#8b5cff' }, { c: '#d935f5' }, { c: '#ff4fa3' }, { c: '#ff5e3a' }
    ];

    /* Easing: how the spin speeds up and slows down. make(s, ctx) builds the curve for a
       strength s (0..1); the curve takes time 0..1 and returns how far through the spin the
       stack is (0..1; some styles go past 1, or below 0, and come back). ctx.n is the number
       of names the spin passes, so name-by-name styles can stop exactly on a name; ctx.m
       (1 or 2) is how many names Near miss falls short by. */
    function eo(t, p) { return 1 - Math.pow(1 - t, p); }                  /* ease out */
    function eio(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }   /* ease in-out cubic */
    function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
    function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }       /* 0..1 within [a, b] */
    function names(ctx) { return Math.max(2, Math.round((ctx && ctx.n) || 30)); }

    var EASINGS = [
        { key: 'linear', label: 'Linear (constant speed)', make: function () { return function (t) { return t; }; } },
        {
            key: 'ease-out', label: 'Ease out (smooth slow down)', strength: 'How hard it brakes', def: 0.3,
            make: function (s) { var p = 1.5 + s * 5; return function (t) { return eo(t, p); }; }
        },
        {
            key: 'ease-in-out', label: 'Ease in-out (slow start and end)', strength: 'Steepness in the middle', def: 0.25,
            make: function (s) {
                var p = 2 + s * 4;
                return function (t) { return t < 0.5 ? Math.pow(2, p - 1) * Math.pow(t, p) : 1 - Math.pow(-2 * t + 2, p) / 2; };
            }
        },
        {
            key: 'ease-out-strong', label: 'Ease out strong (fast, then crawl)', strength: 'Length of the crawl', def: 0.4,
            make: function (s) { var p = 3 + s * 5; return function (t) { return eo(t, p); }; }
        },
        { key: 'sine', label: 'Sine (gentle slow down)', make: function () { return function (t) { return Math.sin(t * Math.PI / 2); }; } },
        {
            key: 'expo', label: 'Exponential (very fast, sudden brake)', strength: 'How sudden the brake is', def: 0.4,
            make: function (s) {
                var k = 4 + s * 12, d = 1 - Math.pow(2, -k);
                return function (t) { return (1 - Math.pow(2, -k * t)) / d; };
            }
        },
        { key: 'circ', label: 'Circular (fast, then a smooth glide)', make: function () { return function (t) { return Math.sqrt(1 - (t - 1) * (t - 1)); }; } },
        {
            key: 'back', label: 'Overshoot (slips past, settles back)', strength: 'How far it slips past', def: 0.4,
            make: function (s) {
                var c1 = 0.5 + s * 3, c3 = c1 + 1;
                return function (t) { return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
            }
        },
        {
            key: 'elastic', label: 'Elastic (springy)', strength: 'Springiness', def: 0.5,
            make: function (s) {
                var k = 16 - s * 12;   /* how quickly the wobble dies away */
                return function (t) {
                    if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1;
                    return Math.pow(2, -k * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
                };
            }
        },
        {
            key: 'spring', label: 'Spring (wobbles to a stop)', strength: 'Bounciness', def: 0.4,
            make: function (s) {
                var k = 10 - s * 5, w = (2 + s * 3) * Math.PI;
                return function (t) { return t >= 1 ? 1 : 1 - Math.exp(-k * t) * Math.cos(w * t); };
            }
        },
        {
            key: 'bounce', label: 'Bounce',
            make: function () {
                return function (t) {
                    var n1 = 7.5625, d1 = 2.75;
                    if (t < 1 / d1) return n1 * t * t;
                    if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
                    if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
                    t -= 2.625 / d1; return n1 * t * t + 0.984375;
                };
            }
        },
        {
            key: 'rubber-band', label: 'Rubber band (stretches past, snaps back)', strength: 'How far it stretches', def: 0.4,
            make: function (s, ctx) {
                var a = Math.min(0.3, (1 + s * 4) / names(ctx));
                return function (t) {
                    if (t < 0.6) return (1 + a) * eo(t / 0.6, 2.5);
                    if (t < 0.8) return 1 + a - 1.6 * a * eio(seg(t, 0.6, 0.8));
                    return 1 - 0.6 * a + 0.6 * a * eio(seg(t, 0.8, 1));
                };
            }
        },
        {
            key: 'anticipate', label: 'Anticipate (pulls back, then spins)', strength: 'How far it pulls back', def: 0.4,
            make: function (s, ctx) {
                var a = Math.min(0.25, (1 + s * 3) / names(ctx));
                return function (t) {
                    if (t < 0.2) return -a * smooth(t / 0.2);
                    return -a + (1 + a) * eo(seg(t, 0.2, 1), 3);
                };
            }
        },
        {
            key: 'steps', label: 'Steps (name by name)', strength: 'How quickly each name snaps', def: 0.5,
            make: function (s, ctx) {
                var n = names(ctx), j = 0.6 - s * 0.5;
                return function (t) {
                    if (t >= 1) return 1;
                    var u = t * n, k = Math.floor(u);
                    return (k + smooth((u - k) / j)) / n;
                };
            }
        },
        {
            key: 'ratchet', label: 'Ratchet (slows down click by click)', strength: 'Pause on each name', def: 0.4,
            make: function (s, ctx) {
                var n = names(ctx), pause = 0.3 + s * 0.5;
                return function (t) {
                    if (t >= 1) return 1;
                    var u = eo(t, 2.5) * n, k = Math.floor(u), f = u - k;
                    return (k + (f < pause ? 0 : smooth((f - pause) / (1 - pause)))) / n;
                };
            }
        },
        {
            key: 'drumroll', label: 'Drumroll (waits, then the last name)', strength: 'Length of the drumroll', def: 0.5,
            make: function (s, ctx) {
                var n = names(ctx), h = 0.15 + s * 0.3, a = 0.85 - h, hold = (n - 1) / n;
                return function (t) {
                    if (t < a) return hold * eo(t / a, 3);
                    if (t < 0.85) return hold + 0.08 / n * Math.sin((t - a) * 160) * Math.sin(Math.PI * seg(t, a, 0.85));
                    return hold + (1 - hold) * eio(seg(t, 0.85, 1));
                };
            }
        },
        {
            key: 'near-miss', label: 'Near miss (stops, then creeps on)', strength: 'How long it seems to stop', def: 0.4,
            make: function (s, ctx) {
                var n = names(ctx), m = (ctx && ctx.m) || (Math.random() < 0.5 ? 1 : 2);
                var stop = (n - m) / n, h = 0.05 + s * 0.25, b = 0.6 + h;
                return function (t) {
                    if (t < 0.6) return stop * eo(t / 0.6, 3);
                    if (t < b) return stop;
                    return stop + (1 - stop) * eio(seg(t, b, 1));
                };
            }
        },
        { key: 'random', label: 'Random (a different style each pick)', make: null }
    ];
    /* Styles Random can choose from (everything but Random itself); state.randomPool picks a subset. */
    var RANDOM_ALL = EASINGS.filter(function (e) { return e.make; }).map(function (e) { return e.key; });
    var GRAPH_COLOURS = ['#94a3b8', '#2563eb', '#0d9488', '#7c3aed', '#0891b2', '#4f46e5', '#65a30d', '#ea580c',
        '#db2777', '#c026d3', '#16a34a', '#d97706', '#0284c7', '#9333ea', '#e11d48', '#059669', '#b45309'];
    function graphColour(key) { return GRAPH_COLOURS[Math.max(0, RANDOM_ALL.indexOf(key)) % GRAPH_COLOURS.length]; }
    function cleanPool(v) {
        if (!Array.isArray(v)) return null;
        var keep = RANDOM_ALL.filter(function (k) { return v.indexOf(k) >= 0; });
        return keep.length ? keep : null;
    }

    /* The order picked students are shown in (who is picked is always random). */
    var ORDERS = [
        { key: 'RANDOM', label: 'Random', tip: 'In the order they landed' },
        { key: 'AZ', label: 'A → Z', tip: 'By surname, A to Z' },
        { key: 'ZA', label: 'Z → A', tip: 'By surname, Z to A' },
        { key: 'HOMEROOM', label: 'Homeroom', tip: 'By homeroom, then surname' }
    ];
    function orderKey(k) {
        for (var i = 0; i < ORDERS.length; i++) if (ORDERS[i].key === String(k).toUpperCase()) return ORDERS[i].key;
        return 'RANDOM';
    }
    var MIN_SPEED = 1, MAX_SPEED = 15, DEFAULT_SPEED = 6;

    /* Small Web Audio sound effects, made on the fly (no files). The context is created on
       the first click, as browsers require. */
    var sound = (function () {
        var ctx = null;
        function unlock() {
            if (!ctx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                try { ctx = new AC(); } catch (e) { return null; }
            }
            if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
            return ctx;
        }
        function blip(freq, start, length, volume, type) {
            var c = unlock();
            if (!c) return;
            var t = c.currentTime + (start || 0);
            var o = c.createOscillator(), g = c.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(volume, t + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, t + length);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + length + 0.02);
        }
        return {
            unlock: unlock,
            tick: function () { blip(1400, 0, 0.035, 0.08, 'triangle'); },
            chime: function () {
                blip(784, 0, 0.35, 0.18); blip(988, 0.09, 0.35, 0.16); blip(1319, 0.18, 0.6, 0.16);
            }
        };
    })();

    var PRINT_CSS =
        '@page{size:portrait;margin:15mm}' +
        'body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#000}' +
        'h1{font-size:26px;margin:0 0 16px;border-bottom:2px solid #000;padding-bottom:6px}' +
        'ol{list-style:none;margin:0;padding:0}' +
        'li{font-size:34px;font-weight:700;padding:10px 0;border-bottom:1px solid #999}' +
        'li span.n{display:inline-block;min-width:1.4em;color:#555}' +
        'li small{font-size:18px;font-weight:400;color:#333;margin-left:8px}';

    function make(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function esc(v) {
        return String(v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function clean(v) { return v == null ? '' : String(v).trim(); }
    function mod(a, b) { return ((a % b) + b) % b; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    function easingByKey(key) {
        for (var i = 0; i < EASINGS.length; i++) if (EASINGS[i].key === key) return EASINGS[i];
        return EASINGS[1];
    }

    /* The easing curve for a key and its strength (0..1, or the default). ctx: { n: names in the spin }. */
    function easeFn(key, strength, ctx) {
        var e = easingByKey(key);
        if (!e.make) e = easingByKey('ease-out');
        return e.make(strength == null ? e.def : strength, ctx || {});
    }

    function formatHomeroom(hr) {
        var str = clean(hr);
        if (!str) return '';
        var digits = str.replace(/\D/g, '');
        return str.charAt(0) + (digits.length >= 2 ? digits.slice(-2) : digits);
    }

    function icon(path) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="np-btn-icon">' +
            path + '</svg>';
    }

    /* ---------------- roster reading (same approach as studentgroups) ---------------- */
    function loadXlsx() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        if (!xlsxPromise) {
            xlsxPromise = new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = XLSX_URL;
                s.onload = function () { resolve(window.XLSX); };
                s.onerror = function () { xlsxPromise = null; reject(new Error('Could not load Excel reader.')); };
                document.head.appendChild(s);
            });
        }
        return xlsxPromise;
    }

    function decodeBuffer(buf) {
        var b = new Uint8Array(buf);
        if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b);
        if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b);
        return new TextDecoder('utf-8').decode(b);
    }

    function parseCSV(text) {
        var firstLine = text.split(/\r?\n/, 1)[0] || '';
        var delim = ',';
        [',', '\t', ';'].forEach(function (d) {
            if (firstLine.split(d).length > firstLine.split(delim).length) delim = d;
        });
        var rows = [], row = [], field = '', inQuotes = false;
        for (var i = 0; i < text.length; i++) {
            var c = text.charAt(i);
            if (inQuotes) {
                if (c === '"') {
                    if (text.charAt(i + 1) === '"') { field += '"'; i++; } else { inQuotes = false; }
                } else { field += c; }
            } else if (c === '"') {
                inQuotes = true;
            } else if (c === delim) {
                row.push(field); field = '';
            } else if (c === '\n' || c === '\r') {
                if (c === '\r' && text.charAt(i + 1) === '\n') i++;
                row.push(field); rows.push(row); row = []; field = '';
            } else {
                field += c;
            }
        }
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        if (!rows.length) return [];
        var headers = rows[0].map(clean);
        return rows.slice(1).map(function (r) {
            var o = {};
            headers.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i]; });
            return o;
        });
    }

    function rowsToStudents(rows) {
        var students = [];
        rows.forEach(function (row) {
            var r = {};
            Object.keys(row).forEach(function (k) { r[clean(k).toLowerCase()] = clean(row[k]); });
            var hasData = Object.keys(r).some(function (k) { return r[k] !== ''; });
            if (!hasData) return;
            var idx = students.length;
            var first = r['preferred'] || r['first name'] || r['firstname'] || 'Student';
            var surname = r['surname'] || r['last name'] || r['lastname'] || '';
            students.push({
                id: 'student-' + idx,
                firstName: first,
                surname: surname,
                fullName: (first + ' ' + surname).trim(),
                homeroom: formatHomeroom(r['homeroom'])
            });
        });
        return students;
    }

    /* ---------------- the picker ---------------- */
    function NamePicker(root, cfg) {
        var storageKey = 'namepicker:' + cfg.id;
        var state = {
            title: 'Name Picker',
            students: [],
            absent: {},
            picked: {},
            count: 1,
            duration: 6,
            easing: 'ease-out',
            easingStrength: {},         /* easing key -> 0..1, when changed from its default */
            randomPool: RANDOM_ALL.slice(),   /* styles Random chooses from */
            spinSpeed: DEFAULT_SPEED,   /* names passing the top per second (sets how far it spins) */
            order: 'RANDOM',            /* how the picked students are shown: RANDOM (as landed), AZ, ZA, HOMEROOM */
            noRepeat: false,
            surnameInitial: false,
            showHomeroom: true,
            skipAnimation: false,
            sound: false,
            lastResult: [],
            history: []                 /* [{ t: time in ms, ids: [student ids] }], newest last */
        };
        var ui = {};
        var modal = null;
        var mui = {};
        var byId = {};

        /* view = the stack on screen. ids is a (random) cyclic ordering of the names in play; "base" is the
           absolute position in that cycle that currently sits at the top of the stack. */
        var view = null;

        function defaultsFromConfig() {
            state.title = cfg.title || 'Name Picker';
            state.count = clamp(parseInt(cfg.count, 10) || 1, 1, 10);
            state.duration = clamp(parseFloat(cfg.duration) || 6, 1, 20);
            state.easing = easingByKey(cfg.easing).key;
            state.easingStrength = {};
            if (typeof cfg.easingStrength === 'number') state.easingStrength[state.easing] = clamp(cfg.easingStrength, 0, 1);
            state.randomPool = cleanPool(cfg.randomPool) || RANDOM_ALL.slice();
            state.spinSpeed = clamp(parseFloat(cfg.spinSpeed) || DEFAULT_SPEED, MIN_SPEED, MAX_SPEED);
            state.order = orderKey(cfg.order || 'RANDOM');
            state.noRepeat = !!cfg.noRepeat;
            state.surnameInitial = !!cfg.surnameInitial;
            state.showHomeroom = cfg.showHomeroom !== false;
            state.skipAnimation = !!cfg.skipAnimation;
            state.sound = !!cfg.sound;
            state.absent = {};
            state.picked = {};
            state.lastResult = [];
            state.history = [];
            state.students = (cfg.students || []).map(function (s, idx) {
                var first = clean(s.firstName) || 'Student';
                var surname = clean(s.surname);
                return {
                    id: 'student-' + idx,
                    firstName: first,
                    surname: surname,
                    fullName: (first + ' ' + surname).trim(),
                    homeroom: formatHomeroom(s.homeroom)
                };
            });
            indexStudents();
        }

        function indexStudents() {
            byId = {};
            state.students.forEach(function (s) { byId[s.id] = s; });
        }

        function currentTitle() { return ui.title ? ui.title.textContent.trim() : state.title; }

        function idList(map) { return Object.keys(map).filter(function (id) { return map[id] && byId[id]; }); }

        /* Everything Export JSON writes; the browser keeps the same after every change. */
        function planData() {
            return {
                app: FILE_APP,
                version: FILE_VERSION,
                title: currentTitle() || 'Name Picker',
                count: state.count,
                duration: state.duration,
                easing: state.easing,
                easingStrength: state.easingStrength,
                randomPool: state.randomPool,
                spinSpeed: state.spinSpeed,
                order: state.order,
                noRepeat: state.noRepeat,
                surnameInitial: state.surnameInitial,
                showHomeroom: state.showHomeroom,
                skipAnimation: state.skipAnimation,
                sound: state.sound,
                students: state.students,
                absent: idList(state.absent),
                picked: idList(state.picked),
                lastResult: state.lastResult,
                history: state.history
            };
        }

        function save() {
            try { localStorage.setItem(storageKey, JSON.stringify(planData())); } catch (e) { /* storage blocked */ }
        }

        /* {id: true} or [id, ...] -> {id: true}, known students only */
        function idMap(v, known) {
            var out = {};
            if (Array.isArray(v)) v.forEach(function (id) { if (known[id]) out[id] = true; });
            else if (v && typeof v === 'object') Object.keys(v).forEach(function (id) { if (v[id] && known[id]) out[id] = true; });
            return out;
        }

        /* Check a file (or the browser copy) and tidy it. Throws before anything changes if it
           can't be used. Student groups and seating plan files bring their class (and, for
           student groups, who is away); settings and picks stay as they are. */
        function cleanPlan(data) {
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('that file does not contain a name picker.');
            var from = null;
            if (data.app === 'studentgroups') from = 'student groups';
            else if (data.app === 'seatingplan' || (!data.app && Array.isArray(data.layout))) from = 'seating plan';
            else if (data.app && data.app !== FILE_APP) throw new Error('that file was saved by "' + String(data.app) + '", not the name picker.');
            if (!Array.isArray(data.students)) throw new Error('that file has no list of students.');
            if (!from && typeof data.version === 'number' && data.version > FILE_VERSION) {
                throw new Error('that file was made by a newer version of the name picker.');
            }
            var seen = {}, students = [];
            data.students.forEach(function (st, idx) {
                if (!st || typeof st !== 'object') return;
                var id = st.id != null ? String(st.id) : 'student-' + idx;
                if (seen[id]) return;
                seen[id] = true;
                var first = clean(st.firstName) || 'Student';
                var surname = clean(st.surname);
                students.push({ id: id, firstName: first, surname: surname,
                                fullName: (first + ' ' + surname).trim(), homeroom: clean(st.homeroom) });
            });
            if (data.students.length && !students.length) throw new Error('none of the students in that file could be read.');
            var known = {};
            students.forEach(function (st) { known[st.id] = true; });

            var plan = { from: from, students: students, absent: idMap(data.absent, known),
                         title: typeof data.title === 'string' ? data.title.trim().slice(0, 200) : '' };
            if (from) return plan;

            plan.picked = idMap(data.picked, known);
            plan.lastResult = (Array.isArray(data.lastResult) ? data.lastResult : []).map(String).filter(function (id) { return known[id]; });
            plan.history = (Array.isArray(data.history) ? data.history : []).filter(function (h) {
                return h && typeof h.t === 'number' && Array.isArray(h.ids);
            }).map(function (h) {
                return { t: h.t, ids: h.ids.map(String).filter(function (id) { return known[id]; }) };
            }).filter(function (h) { return h.ids.length; }).slice(-HISTORY_MAX);
            var n = parseInt(data.count, 10);
            if (n >= 1) plan.count = clamp(n, 1, 10);
            var d = parseFloat(data.duration);
            if (d > 0) plan.duration = clamp(d, 1, 20);
            if (typeof data.easing === 'string') plan.easing = easingByKey(data.easing).key;
            if (data.easingStrength && typeof data.easingStrength === 'object') {
                plan.easingStrength = {};
                Object.keys(data.easingStrength).forEach(function (k) {
                    var v = Number(data.easingStrength[k]);
                    if (easingByKey(k).key === k && easingByKey(k).strength && isFinite(v)) plan.easingStrength[k] = clamp(v, 0, 1);
                });
            }
            var rp = cleanPool(data.randomPool);
            if (rp) plan.randomPool = rp;
            if (typeof data.order === 'string') plan.order = orderKey(data.order);
            var sp = parseFloat(data.spinSpeed);
            if (sp > 0) plan.spinSpeed = clamp(sp, MIN_SPEED, MAX_SPEED);
            ['noRepeat', 'surnameInitial', 'showHomeroom', 'skipAnimation', 'sound'].forEach(function (k) {
                if (typeof data[k] === 'boolean') plan[k] = data[k];
            });
            return plan;
        }

        /* Copy a cleaned plan into state. A class from another tool replaces the students and
           clears the picks (they belonged to the old list). */
        function applyPlan(plan) {
            state.students = plan.students;
            state.absent = plan.absent;
            if (plan.title) state.title = plan.title;
            if (plan.from) {
                state.picked = {};
                state.lastResult = [];
                state.history = [];
            } else {
                state.picked = plan.picked;
                state.lastResult = plan.lastResult;
                state.history = plan.history;
                ['count', 'duration', 'easing', 'easingStrength', 'randomPool', 'spinSpeed', 'order', 'noRepeat', 'surnameInitial', 'showHomeroom', 'skipAnimation', 'sound'].forEach(function (k) {
                    if (plan[k] !== undefined) state[k] = plan[k];
                });
            }
            indexStudents();
        }

        function load() {
            try {
                var raw = localStorage.getItem(storageKey);
                if (!raw) return false;
                applyPlan(cleanPlan(JSON.parse(raw)));
                return true;
            } catch (e) { /* ignore: start from the page */ }
            return false;
        }

        function present() {
            return state.students.filter(function (s) { return !state.absent[s.id]; });
        }

        /* ---------- UI ---------- */
        function build() {
            root.innerHTML =
                '<div class="np-title" data-role="title" title="Click to edit title"></div>' +
                '<button type="button" class="np-projector-exit" data-action="projector-exit">✕ Exit projector view</button>' +
                '<div class="np-toolbar">' +
                '<div class="np-toolbar-row">' +
                '<button type="button" class="np-btn" data-action="import" title="Import Roster: load a class list from Excel or CSV">' +
                icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>') +
                'Roster</button>' +
                '<input type="file" class="np-file" accept=".xlsx,.xls,.csv" data-role="file">' +

                '<button type="button" class="np-btn np-btn-teal" data-action="import-json" title="Import JSON: open a saved name picker, or a class from student groups or a seating plan">' +
                icon('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L8.6 3.3A2 2 0 0 0 6.9 2.5H4a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/>') +
                'Import</button>' +
                '<input type="file" class="np-file" accept=".json" data-role="json-file">' +

                '<button type="button" class="np-btn np-btn-teal" data-action="export-json" title="Export JSON: save the whole picker as a file">' +
                icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>') +
                'Export</button>' +

                '<button type="button" class="np-btn np-btn-grey" data-action="reset" title="Reset: go back to the class list and settings written on the page">' +
                icon('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>') +
                'Reset</button>' +

                '<button type="button" class="np-btn np-btn-grey" data-action="revert" data-role="revert" disabled title="Revert: nothing imported yet">' +
                icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>') +
                'Revert</button>' +

                '<button type="button" class="np-btn np-btn-teal" data-action="print" title="Print the last pick">' +
                icon('<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>') +
                'Print</button>' +
                '<button type="button" class="np-btn np-btn-teal" data-action="projector" title="Projector View: full screen, large cards">' +
                icon('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>') +
                'Projector</button>' +






                '</div>' +

                '<div class="np-toolbar-row">' +
                '<span class="np-toolbar-label" title="How many students to pick at once">Pick:</span>' +
                '<div class="np-sizes" data-role="counts">' +
                COUNTS.map(function (n) {
                    return '<button type="button" class="np-btn np-btn-size" data-action="count" data-count="' + n + '">' + n + '</button>';
                }).join('') +
                '</div>' +
                '<span class="np-toolbar-label" title="The order the picked students are shown, numbered and printed in">Order:</span>' +
                '<div class="np-sizes" data-role="orders">' +
                ORDERS.map(function (o) {
                    return '<button type="button" class="np-btn np-btn-size np-btn-order" data-action="order" data-order="' + o.key +
                        '" title="' + esc(o.tip) + '">' + esc(o.label) + '</button>';
                }).join('') +
                '</div>' +
                '</div>' +

                '<div class="np-toolbar-row">' +
                '<span class="np-toolbar-label">Time:</span>' +
                '<input type="range" class="np-range" min="1" max="20" step="0.5" data-role="duration" aria-label="Animation time in seconds">' +
                '<span class="np-time-out" data-role="duration-out"></span>' +
                '<span class="np-toolbar-label" title="How many names pass the top each second">Speed:</span>' +
                '<input type="range" class="np-range np-range-speed" min="' + MIN_SPEED + '" max="' + MAX_SPEED + '" step="1" data-role="speed" ' +
                'aria-label="Spin speed: names per second">' +
                '<span class="np-time-out" data-role="speed-out"></span>' +
                '<span class="np-toolbar-label">Easing:</span>' +
                '<select class="np-select" data-role="easing" aria-label="Easing">' +
                EASINGS.map(function (e) {
                    return '<option value="' + e.key + '" title="' + esc(e.label) + '">' + esc(e.label.replace(/ \(.*$/, '')) + '</option>';
                }).join('') +
                '</select>' +
                '<button type="button" class="np-btn np-btn-purple np-btn-gear" data-action="anim-settings" ' +
                'title="Animation settings: spin speed, easing strength and the styles Random uses">' +
                icon('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>') +
                'Settings</button>' +

                '</div>' +

                '<div class="np-toolbar-row np-toolbar-row--options">' +
                '<label class=\"np-checkbox-label\" title=\"Show Smith as S.\"><input type="checkbox" data-role="toggle-surname-initial" class="np-checkbox">Surname initial</label>' +
                '<label class=\"np-checkbox-label\" title=\"Show each student&#39;s homeroom\"><input type="checkbox" data-role="toggle-homeroom" class="np-checkbox">Homeroom</label>' +
                '<label class=\"np-checkbox-label\" title=\"Skip students already picked until everyone has had a turn\"><input type="checkbox" data-role="toggle-no-repeat" class="np-checkbox">No repeats</label>' +
                '<label class=\"np-checkbox-label\" title=\"Show the result straight away\"><input type="checkbox" data-role="toggle-skip-animation" class="np-checkbox">No animation</label>' +
                '<label class="np-checkbox-label" title="A tick as each name passes the top, and a chime when the pick lands">' +
                '<input type="checkbox" data-role="toggle-sound" class="np-checkbox">Sound</label>' +
                '<button type="button" class="np-btn np-btn-amber" data-action="forget-picks" title="Put everyone back in the hat (the history is kept)">Forget</button>' +
                '<button type="button" class="np-btn np-btn-purple" data-action="class-list" title="Class List: who is here today">' +
                icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') +
                'Class</button>' +
                '<button type="button" class="np-btn np-btn-purple" data-action="history" title="Who has been picked, and how often">' +
                icon('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>') +
                'History</button>' +
                '</div>' +
                '</div>' +

                '<div class="np-status" data-role="status" role="status" aria-live="polite"></div>' +
                '<div class="np-body">' +
                '<div class="np-pick-row">' +
                '<button type="button" class="np-btn np-pick" data-action="pick">Pick!</button>' +
                '<button type="button" class="np-btn np-btn-grey np-putback" data-action="put-back" data-role="put-back" hidden ' +
                'title="That pick doesn\'t count: put these students back in the hat">↩ Put Back</button>' +
                '</div>' +
                '<div class="np-stage" data-role="stage"></div>' +
                '<div class="np-empty" data-role="empty">No names yet. Use Import Roster, or add names to the directive.</div>' +
                '<div class="np-result" data-role="result" aria-live="polite"></div>' +
                '<div class="np-info" data-role="info"></div>' +
                '</div>';

            ['title', 'file', 'json-file', 'counts', 'duration', 'duration-out', 'speed', 'speed-out', 'easing', 'orders', 'toggle-surname-initial',
                'toggle-homeroom', 'toggle-no-repeat', 'toggle-skip-animation', 'toggle-sound', 'revert', 'put-back', 'status', 'stage', 'empty', 'result', 'info'].forEach(function (r) {
                ui[r] = root.querySelector('[data-role="' + r + '"]');
            });
            ui.pick = root.querySelector('[data-action="pick"]');

            ui.title.textContent = state.title;
            ui.title.contentEditable = 'true';
            ui.title.addEventListener('click', function () { ui.title.focus(); });
            ui.title.addEventListener('blur', function () { state.title = ui.title.textContent.trim(); save(); });
            ui.title.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); ui.title.blur(); }
            });

            root.addEventListener('click', onRootClick);
            ui.status.addEventListener('click', function (e) {
                if (e.target.closest('[data-action="close-status"]')) setStatus('');
            });
            ui.file.addEventListener('change', onFileChosen);
            ui['json-file'].addEventListener('change', onJsonFileChosen);

            ui.duration.addEventListener('input', function () {
                state.duration = parseFloat(ui.duration.value) || 6;
                updateControls();
            });
            ui.duration.addEventListener('change', save);
            ui.speed.addEventListener('input', function () {
                state.spinSpeed = clamp(parseInt(ui.speed.value, 10) || DEFAULT_SPEED, MIN_SPEED, MAX_SPEED);
                updateControls();
            });
            ui.speed.addEventListener('change', save);
            ui.easing.addEventListener('change', function () {
                state.easing = ui.easing.value;
                updateControls();
                save();
            });
            ui['toggle-surname-initial'].addEventListener('change', function () {
                state.surnameInitial = ui['toggle-surname-initial'].checked; save(); refreshView();
            });
            ui['toggle-homeroom'].addEventListener('change', function () {
                state.showHomeroom = ui['toggle-homeroom'].checked; save(); refreshView();
            });
            ui['toggle-no-repeat'].addEventListener('change', function () {
                state.noRepeat = ui['toggle-no-repeat'].checked; save(); updateInfo();
            });
            ui['toggle-skip-animation'].addEventListener('change', function () {
                state.skipAnimation = ui['toggle-skip-animation'].checked; save();
            });
            ui['toggle-sound'].addEventListener('change', function () {
                state.sound = ui['toggle-sound'].checked; save();
                if (state.sound) { sound.unlock(); sound.chime(); }
            });

            document.addEventListener('fullscreenchange', function () {
                if (!document.fullscreenElement && root.classList.contains('np-projector')) exitProjector();
            });
            document.addEventListener('keydown', function (e) {
                if (!root.classList.contains('np-projector')) return;
                if (e.key === 'Escape') { exitProjector(); return; }
                /* space bar (or a presentation clicker) picks, unless the title is being edited */
                if ((e.key === ' ' || e.key === 'PageDown' || e.key === 'ArrowRight') && e.target !== ui.title) {
                    e.preventDefault();
                    if (!ui.pick.disabled) spin();
                }
            });
            window.addEventListener('resize', fitProjector);
        }

        /* ---------- projector view ---------- */
        function enterProjector() {
            root.classList.add('np-projector');
            document.documentElement.classList.add('np-projector-open');
            fitProjector();
            if (root.requestFullscreen) {
                root.requestFullscreen().then(fitProjector).catch(function () { /* stays as a full-window overlay */ });
            }
        }

        function exitProjector() {
            if (!root.classList.contains('np-projector')) return;
            root.classList.remove('np-projector');
            document.documentElement.classList.remove('np-projector-open');
            ui.stage.style.zoom = '';
            if (document.fullscreenElement === root && document.exitFullscreen) {
                document.exitFullscreen().catch(function () {});
            }
        }

        /* Scale the whole card stack so the full stack fits the screen. The cards are positioned in
           pixels by the script, so zooming the stage keeps the animation maths unchanged. */
        function fitProjector() {
            if (!root.classList.contains('np-projector')) return;
            var vis = view && view.vis ? view.vis : MAX_VISIBLE;
            var byHeight = (window.innerHeight - 260) / stackHeight(vis);
            var byWidth = (window.innerWidth - 64) / 440;
            ui.stage.style.zoom = clamp(Math.min(byHeight, byWidth), 1, 2.4).toFixed(2);
        }

        function setStatus(msg) {
            if (!msg) { ui.status.textContent = ''; ui.status.classList.remove('np-show'); return; }
            ui.status.innerHTML = '<span class="np-status-text">' + esc(msg) + '</span>' +
                '<button type="button" class="np-status-close" data-action="close-status" aria-label="Dismiss">✕</button>';
            ui.status.classList.add('np-show');
        }

        function updateControls() {
            Array.prototype.forEach.call(ui.counts.querySelectorAll('[data-count]'), function (b) {
                b.classList.toggle('np-active', parseInt(b.getAttribute('data-count'), 10) === state.count);
            });
            ui.duration.value = state.duration;
            ui['duration-out'].textContent = (Math.round(state.duration * 10) / 10) + ' s';
            ui.speed.value = state.spinSpeed;
            ui['speed-out'].textContent = state.spinSpeed + '/s';
            ui.easing.value = state.easing;
            Array.prototype.forEach.call(ui.orders.querySelectorAll('[data-order]'), function (b) {
                b.classList.toggle('np-active', b.getAttribute('data-order') === state.order);
            });
            if (anim) updateAnimPanel();
            ui['toggle-surname-initial'].checked = state.surnameInitial;
            ui['toggle-homeroom'].checked = state.showHomeroom;
            ui['toggle-no-repeat'].checked = state.noRepeat;
            ui['toggle-skip-animation'].checked = state.skipAnimation;
            ui['toggle-sound'].checked = state.sound;
            updatePutBack();
        }

        function updatePutBack() {
            if (!ui['put-back']) return;
            ui['put-back'].hidden = !(view && view.settled && !view.busy && state.lastResult.length);
        }

        function updateInfo() {
            var total = state.students.length;
            if (!total) { ui.info.textContent = ''; return; }
            var here = present().length;
            var parts = [here + ' of ' + total + ' students in the hat'];
            if (state.noRepeat) {
                var left = present().filter(function (s) { return !state.picked[s.id]; }).length;
                parts.push(left + ' not picked yet');
            }
            if (state.easing === 'random' && usedEasing && view && view.settled) {
                parts.push('easing this pick: ' + shortLabel(usedEasing));
            }
            ui.info.textContent = parts.join(' · ');
        }

        function onRootClick(e) {
            var t = e.target.closest('[data-action]');
            if (!t || !root.contains(t)) return;
            var action = t.getAttribute('data-action');
            if (view && view.busy && action !== 'print' && action !== 'projector-exit' && action !== 'close-status') return;
            switch (action) {
                case 'pick': spin(); break;
                case 'count':
                    state.count = parseInt(t.getAttribute('data-count'), 10);
                    save(); updateControls();
                    break;
                case 'class-list': openModal(); break;
                case 'history': openHistory(); break;
                case 'order':
                    state.order = t.getAttribute('data-order');
                    updateControls();
                    if (view && view.settled && !view.busy) arrangeChosen(true);   /* re-order the result now */
                    else renderIdle();                                             /* show the stack in this order */
                    save();
                    updateResult();
                    break;
                case 'anim-settings': openAnimSettings(); break;
                case 'put-back': putBack(); break;
                case 'revert': revertToImport(); break;
                case 'import': ui.file.click(); break;
                case 'export-json': exportJson(); break;
                case 'import-json': ui['json-file'].click(); break;
                case 'forget-picks': forgetPicks(); break;
                case 'reset': resetToPage(); break;
                case 'print': printResult(); break;
                case 'projector': enterProjector(); break;
                case 'projector-exit': exitProjector(); break;
            }
        }

        /* ---------- the card stack ---------- */
        function displayName(s) {
            var surname = s.surname;
            if (state.surnameInitial && surname) surname = surname.charAt(0) + '.';
            return { first: s.firstName, last: surname };
        }

        function fillCard(el, i) {
            el._i = i;
            var s = byId[view.ids[mod(i, view.n)]];
            var col = PALETTE[mod(i, PALETTE.length)];
            el.style.backgroundColor = col.c;
            el.classList.toggle('np-dark-text', !!col.dark);
            el.textContent = '';
            el.appendChild(make('span', 'np-rank'));
            if (!s) return;
            var n = displayName(s);
            el.appendChild(make('span', 'np-first', n.first));
            if (n.last) el.appendChild(make('span', 'np-last', n.last));
            if (state.showHomeroom && s.homeroom) el.appendChild(make('span', 'np-hr', s.homeroom));
        }

        function stackHeight(vis) { return (vis - 1) * STEP + CARD_H; }

        /* Rebuild the stack from scratch with a fresh random ordering of everyone in play. */
        function buildView(pool) {
            ui.stage.className = 'np-stage';
            ui.stage.innerHTML = '';
            /* the stack cycles through the names in the chosen order (shuffled for Random) */
            var ids = state.order === 'RANDOM' ? shuffle(pool.map(function (s) { return s.id; }))
                : sortIds(pool.map(function (s) { return s.id; }));
            var n = ids.length;
            view = { ids: ids, n: n, vis: Math.min(MAX_VISIBLE, n), M: 0, els: [], base: 0, busy: false, settled: false, key: poolKey(pool) };
            ui.empty.style.display = n ? 'none' : '';
            ui.stage.style.display = n ? '' : 'none';
            ui.pick.disabled = !n;
            if (!n) return;
            view.M = view.vis + 3;
            for (var s = 0; s < view.M; s++) {
                var el = make('div', 'np-card');
                view.els.push(el);
                ui.stage.appendChild(el);
            }
            ui.stage.style.height = stackHeight(view.vis) + 'px';
            draw(0);
            fitProjector();
        }

        function poolKey(pool) {
            return state.order + ':' + pool.map(function (s) { return s.id; }).sort().join('|');
        }

        /* Position every card for a (fractional) offset p from the current base. Names move UP the stack. */
        function draw(p) {
            if (!view || !view.n) return;
            var P = view.base + p, M = view.M, vis = view.vis;
            var lo = Math.floor(P) - 1;
            for (var s = 0; s < M; s++) {
                var el = view.els[s];
                var i = lo + mod(s - lo, M);
                if (el._i !== i) fillCard(el, i);
                var d = i - P;
                var op = 1;
                if (d < 0) op = 1 + d; else if (d > vis - 1) op = vis - d;
                op = clamp(op, 0, 1);
                var sc = 1 - 0.018 * clamp(d, 0, vis - 1);
                el.style.transform = 'translate3d(0,' + (d * STEP).toFixed(2) + 'px,0) scale(' + sc.toFixed(3) + ')';
                el.style.opacity = op;
                el.style.zIndex = 1000 - Math.round(d * 10);
            }
        }

        function refreshView() {
            if (!view || !view.n) return;
            view.els.forEach(function (el) {
                if (el._i == null) return;
                var wasChosen = el.classList.contains('np-chosen');
                var rank = el.firstChild ? el.firstChild.textContent : '';
                fillCard(el, el._i);
                if (wasChosen) { el.firstChild.textContent = rank; }
            });
            updateResult();
        }

        function renderIdle() {
            var pool = present();
            buildView(pool);
            updateResult();
            updateInfo();
            updatePutBack();
        }

        /* ---------- picking ---------- */
        function spin() {
            if (view && view.busy) return;
            setStatus('');
            var here = present();
            if (!here.length) { setStatus('There are no students to pick from. Import a roster or mark students present in Class List.'); return; }

            var pool = here;
            if (state.noRepeat) {
                var fresh = here.filter(function (s) { return !state.picked[s.id]; });
                if (fresh.length < Math.min(state.count, here.length)) {
                    state.picked = {};
                    setStatus('Fewer unpicked students were left than you asked for, so everyone is back in the hat.');
                } else {
                    pool = fresh;
                }
            }

            var N = Math.min(state.count, pool.length);
            if (state.count > pool.length) setStatus('Only ' + pool.length + ' students are available, so ' + pool.length + ' will be picked.');

            var wasSettled = view && view.settled;
            if (!view || view.key !== poolKey(pool)) {
                buildView(pool);
                wasSettled = false;
            } else if (state.order === 'RANDOM') {
                /* keep the names currently on screen, but give everything off-screen a fresh random order */
                var shown = {}, k;
                for (k = 0; k < view.vis; k++) shown[mod(view.base + k, view.n)] = true;
                var rest = [];
                for (k = 0; k < view.n; k++) if (!shown[k]) rest.push(k);
                var names = shuffle(rest.map(function (pos) { return view.ids[pos]; }));
                rest.forEach(function (pos, j) { view.ids[pos] = names[j]; });
                view.els.forEach(function (el) { el._i = null; });
            } else {
                view.els.forEach(function (el) { el._i = null; });   /* sorted: keep the order */
            }

            view.busy = true;
            ui.pick.disabled = true;
            ui.pick.textContent = 'Picking…';
            ui['put-back'].hidden = true;
            if (state.sound) sound.unlock();
            ui.result.textContent = '';

            var begin = function () {
                ui.stage.className = 'np-stage';
                view.els.forEach(function (el) { el.classList.remove('np-chosen'); });
                ui.stage.style.height = stackHeight(view.vis) + 'px';
                animate(N);
            };

            if (wasSettled) {
                /* ease the previous result back into a full stack before cycling again */
                view.els.forEach(function (el) { el.classList.remove('np-chosen'); el.firstChild && (el.firstChild.textContent = ''); });
                ui.stage.classList.add('np-settled');
                ui.stage.style.height = stackHeight(view.vis) + 'px';
                draw(0);
                view.settled = false;
                setTimeout(begin, state.skipAnimation ? 0 : 520);
            } else {
                begin();
            }
        }

        function animate(N) {
            var steps = Math.max(view.vis + N + 3, Math.round(state.duration * state.spinSpeed)) +
                Math.floor(Math.random() * view.n);
            var ease = currentEase(steps);
            var total = state.duration * 1000;

            if (state.skipAnimation) { draw(steps); settle(steps, N); return; }

            var start = null, lastTick = 0;
            function frame(ts) {
                if (start === null) start = ts;
                var t = Math.min(1, (ts - start) / total);
                var pos = steps * ease(t);
                /* one tick each time a new name reaches the top (at most one per frame) */
                if (state.sound && Math.floor(pos) !== lastTick && t < 1) { lastTick = Math.floor(pos); sound.tick(); }
                draw(pos);
                if (t < 1) window.requestAnimationFrame(frame);
                else { draw(steps); settle(steps, N); }
            }
            window.requestAnimationFrame(frame);
        }

        function settle(steps, N) {
            var top = view.base + steps;
            ui.stage.classList.add('np-settled');
            ui.stage.classList.toggle('np-multi', N > 1);
            ui.stage.classList.toggle('np-big', N <= 3);
            void ui.stage.offsetWidth; /* make the browser notice the class before the transitions run */

            var result = [];
            view.els.forEach(function (el) {
                var k = el._i - top;
                if (k >= 0 && k < N) {
                    el.classList.add('np-chosen');
                    el._sid = view.ids[mod(el._i, view.n)];
                } else {
                    el.classList.remove('np-chosen');
                    el.style.opacity = 0;
                }
            });
            ui.stage.style.height = (N * CARD_H + (N - 1) * SETTLE_GAP) + 'px';

            /* remember who was "picked" before this round, so Put Back can undo exactly this round */
            pickedBeforeRound = {};
            Object.keys(state.picked).forEach(function (id) { pickedBeforeRound[id] = state.picked[id]; });
            for (var k2 = 0; k2 < N; k2++) {
                var s = byId[view.ids[mod(top + k2, view.n)]];
                if (s) { result.push(s.id); state.picked[s.id] = true; }
            }
            state.lastResult = result;
            arrangeChosen(false);
            view.base = top;
            view.busy = false;
            view.settled = true;
            ui.pick.disabled = false;
            ui.pick.textContent = 'Pick Again!';
            if (result.length) {
                state.history.push({ t: Date.now(), ids: result.slice() });
                if (state.history.length > HISTORY_MAX) state.history = state.history.slice(-HISTORY_MAX);
            }
            if (state.sound) sound.chime();
            save();
            updateResult();
            updateInfo();
            updatePutBack();
        }

        /* lastResult is the order the students landed in; this is the order they are shown in. */
        function orderedResult() {
            var ids = state.lastResult.filter(function (id) { return byId[id]; });
            return state.order === 'RANDOM' ? ids : sortIds(ids);
        }

        /* Sort student ids by the chosen order: AZ / ZA by surname, HOMEROOM by homeroom then surname. */
        function sortIds(ids) {
            function bySurname(a, b) {
                return String(a.surname).localeCompare(String(b.surname)) || String(a.firstName).localeCompare(String(b.firstName));
            }
            var list = ids.map(function (id) { return byId[id]; }).filter(Boolean);
            if (state.order === 'ZA') list.sort(function (a, b) { return bySurname(b, a); });
            else if (state.order === 'HOMEROOM') list.sort(function (a, b) {
                var ha = clean(a.homeroom), hb = clean(b.homeroom);
                if (ha !== hb) { if (!ha) return 1; if (!hb) return -1; return ha.localeCompare(hb); }
                return bySurname(a, b);
            });
            else list.sort(bySurname);
            return list.map(function (st) { return st.id; });
        }

        /* Put the chosen cards in display order, numbered 1, 2, 3 … (animated if moved). */
        function arrangeChosen(animate) {
            var order = orderedResult();
            if (animate) ui.stage.classList.add('np-settled');
            view.els.forEach(function (el) {
                if (!el.classList.contains('np-chosen')) return;
                var k = order.indexOf(el._sid);
                if (k < 0) return;
                el.firstChild.textContent = String(k + 1);
                el.style.transform = 'translate3d(0,' + (k * (CARD_H + SETTLE_GAP)) + 'px,0) scale(1)';
                el.style.opacity = 1;
                el.style.zIndex = 1000 - k;
            });
        }

        var pickedBeforeRound = null;   /* "picked" list as it was before the last round (this visit only) */

        /* "That pick doesn't count": back in the hat, and out of the history. */
        function putBack() {
            if (!state.lastResult.length) return;
            var names = resultNames();
            var last = state.history[state.history.length - 1];
            if (last && last.ids.join('|') === state.lastResult.join('|')) state.history.pop();
            if (pickedBeforeRound) state.picked = pickedBeforeRound;
            else state.lastResult.forEach(function (id) { delete state.picked[id]; });
            pickedBeforeRound = null;
            state.lastResult = [];
            save();
            ui.pick.textContent = 'Pick!';
            renderIdle();
            setStatus('Put back: ' + names.join(', ') + '. ' + (names.length === 1 ? 'They can' : 'They can all') + ' be picked again.');
        }

        function resultNames() {
            return orderedResult().map(function (id) { return byId[id]; }).filter(Boolean).map(function (s) {
                var n = displayName(s);
                return (n.first + ' ' + n.last).trim();
            });
        }

        function updateResult() {
            var names = view && view.settled && !view.busy ? resultNames() : [];
            ui.result.textContent = names.length ? 'Picked: ' + names.join(', ') : '';
        }

        function forgetPicks() {
            state.picked = {};
            save();
            updateInfo();
            setStatus('Picks forgotten. Everyone who is present can be chosen again.');
        }

        function resetToPage() {
            if (!window.confirm('Reset the name picker to the class list and settings written on the page? Your imported class, picks and history will be removed.')) return;
            try { localStorage.removeItem(storageKey); } catch (e) {}
            clearImportSnapshot();
            defaultsFromConfig();
            if (ui.title) ui.title.textContent = state.title;
            updateControls();
            ui.pick.textContent = 'Pick!';
            renderIdle();
            setStatus('Reset to the class list and settings written on the page.');
        }

        function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

        /* After any import or revert: show the new class. */
        function afterLoad() {
            if (ui.title) ui.title.textContent = state.title;
            updateControls();
            ui.pick.textContent = 'Pick!';
            renderIdle();
            save();
        }

        /* ---------- export / import ---------- */
        function exportJson() {
            var payload = planData();
            var json = JSON.stringify(payload, null, 2);
            var suggested = (payload.title || 'name_picker').toLowerCase().replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '') || 'name_picker';
            save();
            storeImportSnapshot('export', suggested + '.json', JSON.parse(json));
            saveJsonFile(json, suggested + '.json');
        }

        /* Chrome/Edge: a Save As box. Other browsers: ask for a name, then download. */
        function saveJsonFile(json, suggestedName) {
            if (window.showSaveFilePicker) {
                window.showSaveFilePicker({
                    suggestedName: suggestedName,
                    types: [{ description: 'Name picker (JSON)', accept: { 'application/json': ['.json'] } }]
                }).then(function (handle) {
                    return handle.createWritable().then(function (w) {
                        return w.write(json).then(function () { return w.close(); });
                    }).then(function () { setStatus('Saved ' + handle.name + '.'); });
                }).catch(function (err) {
                    if (err && err.name === 'AbortError') return;
                    downloadJson(json, suggestedName);
                });
                return;
            }
            downloadJson(json, suggestedName);
        }

        function downloadJson(json, suggestedName) {
            var name = window.prompt('File name for the exported name picker:', suggestedName);
            if (name == null) return;
            name = name.trim().replace(/[\\/:*?"<>|]+/g, '_') || suggestedName;
            if (!/\.json$/i.test(name)) name += '.json';
            var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            var a = document.createElement('a');
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            setStatus('Downloaded ' + name + '.');
        }

        /* Revert: back to the last JSON imported or exported, or class list imported. */
        var importKey = storageKey + ':imported';

        function readImportSnapshot() {
            try {
                var raw = localStorage.getItem(importKey);
                var snap = raw ? JSON.parse(raw) : null;
                return snap && snap.data ? snap : null;
            } catch (e) { return null; }
        }

        function storeImportSnapshot(kind, name, data) {
            try { localStorage.setItem(importKey, JSON.stringify({ kind: kind, name: name || '', data: data })); } catch (e) { /* blocked */ }
            updateRevertButton();
        }

        function clearImportSnapshot() {
            try { localStorage.removeItem(importKey); } catch (e) { /* ignore */ }
            updateRevertButton();
        }

        function updateRevertButton() {
            if (!ui.revert) return;
            var snap = readImportSnapshot();
            ui.revert.disabled = !snap;
            ui.revert.title = 'Revert: ' + (snap
                ? 'go back to ' + (snap.name || 'the imported file') + ' as it was ' + (snap.kind === 'export' ? 'exported' : 'imported')
                : 'nothing imported yet');
        }

        function revertToImport() {
            var snap = readImportSnapshot();
            if (!snap) return;
            var how = snap.kind === 'export' ? 'exported' : 'imported';
            var what = snap.name || 'the ' + how + ' file';
            if (!window.confirm('Revert to ' + what + ' as it was ' + how + '? Changes since then, including picks, will be lost.')) return;
            try {
                applyPlan(cleanPlan(snap.data));
                afterLoad();
                setStatus('Reverted to ' + what + ' as ' + how + '.');
            } catch (err) {
                setStatus('Could not revert: ' + (err.message || err));
            }
        }

        function onJsonFileChosen(e) {
            var file = e.target.files[0];
            if (!file) return;
            var input = e.target;
            if (file.size > MAX_JSON_BYTES) {
                setStatus('Failed to import JSON: ' + file.name + ' is too large to be a name picker file.');
                input.value = '';
                return;
            }
            var reader = new FileReader();
            reader.onerror = function () { setStatus('Could not read that file.'); input.value = ''; };
            reader.onload = function (evt) {
                try {
                    var data;
                    try { data = JSON.parse(evt.target.result); } catch (pe) { throw new Error(file.name + ' is not valid JSON.'); }
                    var plan = cleanPlan(data);
                    if (plan.from && (state.history.length || idList(state.picked).length) &&
                        !window.confirm('Load the class from this ' + plan.from + ' file? Your picks and history will be cleared.')) return;
                    applyPlan(plan);
                    afterLoad();
                    storeImportSnapshot('json', file.name, data);
                    var away = idList(state.absent).length;
                    var cls = plural(state.students.length, 'student') + (away ? ' (' + away + ' away)' : '');
                    setStatus(plan.from
                        ? 'Loaded the class from the ' + plan.from + ' file ' + file.name + ': ' + cls + '. Your picker settings are unchanged.'
                        : 'Imported ' + file.name + ': ' + cls + ', ' + plural(state.history.length, 'round') + ' of picks in the history.');
                } catch (err) {
                    setStatus('Failed to import JSON: ' + (err.message || err));
                } finally {
                    input.value = '';
                }
            };
            reader.readAsText(file);
        }

        /* "8_Science_Period_3.xlsx" -> "8 Science Period 3" */
        function titleFromFileName(name) {
            return String(name || '').replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
        }

        function applyRows(rows, fileName) {
            var students = rowsToStudents(rows);
            if (!students.length) {
                setStatus('No students found in that file. It needs a header row with Preferred (or First Name), Surname (or Last Name) and optionally Homeroom.');
                return;
            }
            if (state.history.length && !window.confirm('Importing a new class list clears the picks and history. Continue?')) return;
            state.students = students;
            state.absent = {};
            state.picked = {};
            state.lastResult = [];
            state.history = [];
            var t = titleFromFileName(fileName);
            if (t) state.title = t;
            indexStudents();
            afterLoad();
            storeImportSnapshot('roster', fileName, planData());
            setStatus('Imported ' + plural(students.length, 'student') + ' from ' + fileName + '.');
        }

        function onFileChosen(e) {
            var file = e.target.files[0];
            if (!file) return;
            var input = e.target;
            var reader = new FileReader();
            reader.onerror = function () { setStatus('Could not read that file.'); input.value = ''; };
            reader.onload = function (evt) {
                if (/\.csv$/i.test(file.name)) {
                    applyRows(parseCSV(decodeBuffer(evt.target.result)), file.name);
                    input.value = '';
                } else {
                    loadXlsx().then(function (XLSX) {
                        var wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
                        applyRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]), file.name);
                    }).catch(function (err) {
                        setStatus(err.message || 'Could not read that Excel file.');
                    }).then(function () { input.value = ''; });
                }
            };
            reader.readAsArrayBuffer(file);
        }

        function printResult() {
            var picks = orderedResult().map(function (id) { return byId[id]; }).filter(Boolean);
            if (!picks.length) { setStatus('Pick some students first, then print the result.'); return; }
            var title = currentTitle() || 'Name Picker';
            var items = picks.map(function (s, i) {
                var n = displayName(s);
                var hr = state.showHomeroom && s.homeroom ? '<small>' + esc(s.homeroom) + '</small>' : '';
                return '<li><span class="n">' + (i + 1) + '.</span>' + esc((n.first + ' ' + n.last).trim()) + hr + '</li>';
            }).join('');
            var win = window.open('', '_blank');
            if (!win) { window.print(); return; }
            win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) +
                '</title><style>' + PRINT_CSS + '</style></head><body><h1>' + esc(title) +
                '</h1><ol>' + items + '</ol></body></html>');
            win.document.close();
            win.focus();
            setTimeout(function () { win.print(); }, 250);
        }

        /* ---------- panels (Class List, History), same style as the Rules panel elsewhere ---------- */
        function makePanel(title, extra) {
            var m = make('div', 'np-modal');
            m.innerHTML =
                '<div class="np-modal-card np-rp ' + (extra || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
                '<div class="np-modal-head"><span>' + esc(title) + '</span>' +
                '<button type="button" class="np-modal-close" data-p="close" aria-label="Close">✕</button></div>' +
                '<div class="np-rp-top" data-p="top"></div>' +
                '<div class="np-modal-body" data-p="body"></div>' +
                '<div class="np-rp-foot" data-p="foot"></div></div>';
            document.body.appendChild(m);
            var p = { modal: m };
            ['top', 'body', 'foot'].forEach(function (k) { p[k] = m.querySelector('[data-p="' + k + '"]'); });
            p.open = function () { m.classList.add('np-open'); };
            p.close = function () { m.classList.remove('np-open'); };
            m.addEventListener('click', function (e) {
                if (e.target === m || e.target.closest('[data-p="close"]')) p.close();
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && m.classList.contains('np-open')) p.close();
            });
            return p;
        }

        /* How many times each student has been picked (from the history). */
        function pickCounts() {
            var c = {};
            state.history.forEach(function (h) { h.ids.forEach(function (id) { c[id] = (c[id] || 0) + 1; }); });
            return c;
        }

        function sortedStudents() {
            return state.students.slice().sort(function (a, b) {
                return String(a.surname).localeCompare(String(b.surname)) || String(a.firstName).localeCompare(String(b.firstName));
            });
        }

        /* --- Class List: who is here today --- */
        var search = '';

        function buildModal() {
            modal = makePanel('Class List: Who Is Here?');
            modal.top.innerHTML = '<div class="np-rp-help">Untick students who are away; they are left out of the picking. ' +
                'Students already picked are tagged, with how many times.</div>';
            modal.modal.addEventListener('input', function (e) {
                if (e.target.getAttribute('data-m') !== 'search') return;
                search = e.target.value;
                filterClassList();
            });
            modal.modal.addEventListener('change', function (e) {
                var box = e.target.closest('input[data-sid]');
                if (!box) return;
                var id = box.getAttribute('data-sid');
                if (box.checked) delete state.absent[id]; else state.absent[id] = true;
                box.closest('.np-rp-row').classList.toggle('np-absent', !box.checked);
                box.closest('.np-rp-row').classList.toggle('np-rp-on', box.checked);
                classListChanged();
            });
            modal.modal.addEventListener('click', function (e) {
                var b = e.target.closest('[data-m]');
                if (!b || b.tagName === 'INPUT') return;
                var m = b.getAttribute('data-m');
                if (m === 'all') setAllPresent(true);
                else if (m === 'none') setAllPresent(false);
                else if (m === 'forget') { forgetPicks(); renderClassList(); }
            });
        }

        function openModal() {
            search = '';
            renderClassList();
            modal.open();
        }

        function closeModal() { if (modal) modal.close(); }

        function setAllPresent(flag) {
            state.absent = {};
            if (!flag) state.students.forEach(function (st) { state.absent[st.id] = true; });
            renderClassList();
            classListChanged();
        }

        function classListChanged() {
            state.lastResult = state.lastResult.filter(function (id) { return !state.absent[id]; });
            save();
            ui.pick.textContent = 'Pick!';
            renderIdle();
            updateClassFoot();
        }

        function updateClassFoot() {
            var here = present().length, total = state.students.length;
            var pickedN = idList(state.picked).length;
            modal.foot.innerHTML =
                '<span class="np-rp-count">' + here + ' of ' + total + ' here' +
                (pickedN ? ' · ' + pickedN + ' picked so far' : '') + '</span>' +
                '<span><button type="button" class="np-btn np-btn-teal" data-m="all">All Present</button> ' +
                '<button type="button" class="np-btn np-btn-grey" data-m="none">None Present</button> ' +
                '<button type="button" class="np-btn np-btn-amber" data-m="forget"' + (pickedN ? '' : ' disabled') +
                ' title="Everyone can be picked again (the history is kept)">Forget Picks</button> ' +
                '<button type="button" class="np-btn" data-p="close">Done</button></span>';
        }

        function renderClassList() {
            var body = modal.body, top = body.scrollTop;
            body.innerHTML = '';
            if (!state.students.length) {
                body.appendChild(make('div', 'np-rp-empty', 'No students yet. Use Import Roster first.'));
            } else {
                body.innerHTML = '<div class="np-rp-tools"><input type="search" class="np-rp-search" data-m="search" ' +
                    'placeholder="Search students" aria-label="Search students" value="' + esc(search) + '"></div>';
                var list = make('div', 'np-rp-list');
                list.setAttribute('data-m', 'list');
                var counts = pickCounts();
                sortedStudents().forEach(function (st) {
                    var here = !state.absent[st.id];
                    var row = make('label', 'np-rp-row' + (here ? ' np-rp-on' : ' np-absent'));
                    row.dataset.name = (st.fullName + ' ' + (st.homeroom || '')).toLowerCase();
                    var box = make('input');
                    box.type = 'checkbox';
                    box.checked = here;
                    box.setAttribute('data-sid', st.id);
                    row.appendChild(box);
                    row.appendChild(make('span', 'np-rp-name', st.fullName));
                    if (st.homeroom) row.appendChild(make('span', 'np-rp-hr', st.homeroom));
                    if (state.picked[st.id] || counts[st.id]) {
                        var tag = make('span', 'np-class-tag' + (state.picked[st.id] ? '' : ' np-class-tag-old'),
                            (state.picked[st.id] ? 'picked' : 'picked before') + (counts[st.id] ? ' ×' + counts[st.id] : ''));
                        tag.title = state.picked[st.id] ? 'Picked since picks were last forgotten' : 'In the history, but can be picked again';
                        row.appendChild(tag);
                    }
                    list.appendChild(row);
                });
                body.appendChild(list);
                filterClassList();
            }
            updateClassFoot();
            body.scrollTop = top;
        }

        function filterClassList() {
            var list = modal.body.querySelector('[data-m="list"]');
            if (!list) return;
            var q = search.trim().toLowerCase();
            Array.prototype.forEach.call(list.children, function (row) {
                row.style.display = q && row.dataset.name.indexOf(q) === -1 ? 'none' : '';
            });
        }

        /* --- Animation Settings: easing, strength, the styles Random uses, time and spin speed --- */
        var anim = null;
        var GX0 = 34, GX1 = 290, GY0 = 12, GY1 = 196, VMIN = -0.58, VMAX = 1.58;   /* graph area */

        function strengthOf(key) {
            var e = easingByKey(key);
            return state.easingStrength[key] != null ? state.easingStrength[key] : e.def;
        }
        function shortLabel(key) { return easingByKey(key).label.replace(/ \(.*$/, ''); }
        function poolNow() { return cleanPool(state.randomPool) || RANDOM_ALL.slice(); }

        /* The easing to use now, for a spin past n names. Random draws one style from the
           chosen styles each time it is asked (once per pick); usedEasing remembers which. */
        var usedEasing = null;
        function currentEase(n) {
            var key = state.easing;
            if (key === 'random') { var pool = poolNow(); key = pool[Math.floor(Math.random() * pool.length)]; }
            usedEasing = key;
            return easeFn(key, strengthOf(key), { n: n });
        }
        /* names in a typical spin, for the graph */
        function graphCtx() { return { n: Math.max(4, Math.round(state.duration * state.spinSpeed)), m: 1 }; }

        function gx(t) { return GX0 + t * (GX1 - GX0); }
        function gy(v) { return GY1 - (v - VMIN) / (VMAX - VMIN) * (GY1 - GY0); }

        function openAnimSettings() {
            if (!anim) {
                anim = makePanel('Animation Settings', 'np-anim');
                anim.top.innerHTML = '<div class="np-rp-help">Change how the stack spins. Changes are saved straight away; ' +
                    'press <b>Preview</b> to try them without picking anyone.</div>';
                anim.body.innerHTML =
                    '<div class="np-an-cols">' +
                    '<section class="np-an-controls">' +
                    '<h5>Timing</h5>' +
                    '<label class="np-an-field"><span>Animation time <b data-a="dur-out"></b></span>' +
                    '<input type="range" min="1" max="20" step="0.5" data-a="dur" aria-label="Animation time in seconds"></label>' +
                    '<label class="np-an-field" title="How many names pass the top each second. More names means a faster, longer spin.">' +
                    '<span>Spin speed <b data-a="speed-out"></b></span>' +
                    '<input type="range" min="' + MIN_SPEED + '" max="' + MAX_SPEED + '" step="1" data-a="speed" aria-label="Names per second"></label>' +
                    '<h5>Easing</h5>' +
                    '<select class="np-an-select" data-a="easing" aria-label="Easing">' +
                    EASINGS.map(function (e) { return '<option value="' + e.key + '">' + esc(e.label) + '</option>'; }).join('') +
                    '</select>' +
                    '<label class="np-an-field" data-a="strength-row"><span><i data-a="strength-label"></i> <b data-a="strength-out"></b></span>' +
                    '<input type="range" min="0" max="100" step="1" data-a="strength" aria-label="Strength"></label>' +
                    '<button type="button" class="np-btn np-btn-grey np-an-small" data-a="strength-reset">Default strength</button>' +
                    '<div class="np-an-random" data-a="random-row">' +
                    '<p class="np-an-hint">Each pick uses one of the ticked styles, chosen at random, with each style&#39;s own ' +
                    'strength (choose a style above to change its strength). <b data-a="random-note"></b></p>' +
                    '<div class="np-an-pool" data-a="pool">' +
                    RANDOM_ALL.map(function (k) {
                        return '<label title="' + esc(easingByKey(k).label) + '"><input type="checkbox" data-pool="' + k + '">' +
                            '<i class="np-an-swatch" style="background:' + graphColour(k) + '"></i>' + esc(shortLabel(k)) + '</label>';
                    }).join('') +
                    '</div>' +
                    '<div class="np-an-pool-btns">' +
                    '<button type="button" class="np-btn np-btn-grey np-an-small" data-a="pool-all">All</button>' +
                    '<button type="button" class="np-btn np-btn-grey np-an-small" data-a="pool-none">None</button>' +
                    '<span class="np-an-pool-count" data-a="pool-count"></span>' +
                    '</div></div>' +
                    '</section>' +
                    '<section class="np-an-graph-wrap"><h5>How the spin moves</h5>' +
                    '<svg class="np-an-graph" viewBox="0 0 300 220" data-a="graph" role="img" aria-label="Easing curve"></svg>' +
                    '<div class="np-an-track" data-a="track"><span class="np-an-end"></span><span class="np-an-dot" data-a="dot"></span></div>' +
                    '<button type="button" class="np-btn np-btn-teal" data-a="preview">▶ Preview</button>' +
                    '</section></div>';
                anim.modal.addEventListener('input', onAnimInput);
                anim.modal.addEventListener('change', function (e) {
                    var t = e.target;
                    if (t.getAttribute('data-a') === 'easing') {
                        state.easing = t.value;
                        animChanged(true);
                    } else if (t.hasAttribute('data-pool')) {
                        var k = t.getAttribute('data-pool'), pool = poolNow().filter(function (x) { return x !== k; });
                        if (t.checked) pool.push(k);
                        if (!pool.length) {
                            t.checked = true;
                            af('random-note').textContent = 'At least one style must stay ticked.';
                            return;
                        }
                        state.randomPool = cleanPool(pool);
                        af('random-note').textContent = '';
                        animChanged(true);
                    } else if (t.matches('input')) save();
                });
                anim.modal.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-a]');
                    if (!b) return;
                    switch (b.getAttribute('data-a')) {
                        case 'strength-reset': delete state.easingStrength[state.easing]; animChanged(true); break;
                        case 'pool-all': state.randomPool = RANDOM_ALL.slice(); af('random-note').textContent = ''; animChanged(true); break;
                        case 'pool-none':
                            /* keep one, so Random always has something to choose */
                            state.randomPool = [poolNow()[0]];
                            af('random-note').textContent = 'Only ' + shortLabel(state.randomPool[0]) + ' is left ticked; tick the styles you want.';
                            animChanged(true);
                            break;
                        case 'preview': previewAnim(); break;
                    }
                });
            }
            updateAnimPanel();
            anim.open();
        }

        function af(name) { return anim.modal.querySelector('[data-a="' + name + '"]'); }

        function onAnimInput(e) {
            var t = e.target, k = t.getAttribute('data-a');
            if (k === 'dur') state.duration = parseFloat(t.value) || 6;
            else if (k === 'speed') state.spinSpeed = clamp(parseInt(t.value, 10) || DEFAULT_SPEED, MIN_SPEED, MAX_SPEED);
            else if (k === 'strength') state.easingStrength[state.easing] = clamp((parseInt(t.value, 10) || 0) / 100, 0, 1);
            else return;
            animChanged(false);
        }

        /* A setting changed: update the toolbar, the panel and the graph; save. */
        function animChanged(full) {
            updateControls();     /* also refreshes the panel */
            if (!full) drawGraph();
            save();
        }

        function updateAnimPanel() {
            if (!anim) return;
            var e = easingByKey(state.easing), isRandom = e.key === 'random';
            af('dur').value = state.duration;
            af('dur-out').textContent = (Math.round(state.duration * 10) / 10) + ' s';
            af('speed').value = state.spinSpeed;
            af('speed-out').textContent = state.spinSpeed + ' names/s';
            af('easing').value = e.key;
            af('strength-row').hidden = !e.strength;
            af('strength-reset').hidden = !e.strength;
            if (e.strength) {
                af('strength-label').textContent = e.strength;
                af('strength').value = Math.round(strengthOf(e.key) * 100);
                af('strength-out').textContent = Math.round(strengthOf(e.key) * 100) + '%';
                af('strength-reset').disabled = state.easingStrength[e.key] == null;
            }
            af('random-row').hidden = !isRandom;
            if (isRandom) {
                var pool = poolNow();
                Array.prototype.forEach.call(af('pool').querySelectorAll('[data-pool]'), function (cb) {
                    cb.checked = pool.indexOf(cb.getAttribute('data-pool')) >= 0;
                });
                af('pool-count').textContent = pool.length + ' of ' + RANDOM_ALL.length + ' styles';
                af('pool-all').disabled = pool.length === RANDOM_ALL.length;
                af('pool-none').disabled = pool.length === 1;
            } else {
                af('random-note').textContent = '';
            }
            anim.foot.innerHTML = '<span class="np-rp-count">' + esc(shortLabel(e.key)) + ' · ' +
                (Math.round(state.duration * 10) / 10) + ' s · about ' + Math.round(state.duration * state.spinSpeed) + ' names spin past</span>' +
                '<button type="button" class="np-btn" data-p="close">Done</button>';
            drawGraph();
        }

        function curvePoints(ease) {
            var pts = [];
            for (var i = 0; i <= 240; i++) { var t = i / 240; pts.push(gx(t).toFixed(1) + ',' + gy(clamp(ease(t), VMIN, VMAX)).toFixed(1)); }
            return pts.join(' ');
        }

        function drawGraph(highlight) {
            var svg = af('graph'), isRandom = state.easing === 'random', ctx = graphCtx();
            var html =
                '<rect x="' + GX0 + '" y="' + gy(1) + '" width="' + (GX1 - GX0) + '" height="' + (gy(0) - gy(1)) + '" class="np-g-box"/>' +
                '<line x1="' + GX0 + '" x2="' + GX1 + '" y1="' + gy(1) + '" y2="' + gy(1) + '" class="np-g-line"/>' +
                '<line x1="' + GX0 + '" x2="' + GX1 + '" y1="' + gy(0) + '" y2="' + gy(0) + '" class="np-g-line"/>' +
                '<text x="' + (GX0 - 6) + '" y="' + (gy(1) + 4) + '" class="np-g-lab" text-anchor="end">end</text>' +
                '<text x="' + (GX0 - 6) + '" y="' + (gy(0) + 4) + '" class="np-g-lab" text-anchor="end">start</text>' +
                '<text x="' + GX1 + '" y="' + (GY1 + 18) + '" class="np-g-lab" text-anchor="end">time →</text>' +
                (isRandom
                    ? poolNow().map(function (k) {
                        var on = highlight === k;
                        return '<polyline points="' + curvePoints(easeFn(k, strengthOf(k), ctx)) + '" class="np-g-curve np-g-many' +
                            (on ? ' np-g-on' : '') + '" data-k="' + k + '" style="stroke:' + graphColour(k) + '"><title>' +
                            esc(easingByKey(k).label) + '</title></polyline>';
                    }).join('')
                    : '<polyline points="' + curvePoints(easeFn(state.easing, strengthOf(state.easing), ctx)) + '" class="np-g-curve"/>');
            svg.innerHTML = html;
        }

        /* Run the current settings on the dot (and the curve) without picking anyone. */
        var previewing = false;
        function previewAnim() {
            if (previewing) return;
            previewing = true;
            var steps = Math.max(4, Math.round(state.duration * state.spinSpeed));
            var ease = currentEase(steps), total = state.duration * 1000, dot = af('dot'), start = null, lastTick = 0;
            if (state.easing === 'random') {
                drawGraph(usedEasing);
                af('random-note').textContent = 'This preview: ' + shortLabel(usedEasing);
            }
            var marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            marker.setAttribute('r', '5');
            marker.setAttribute('class', 'np-g-marker');
            af('graph').appendChild(marker);
            if (state.sound) sound.unlock();
            function frame(ts) {
                if (start === null) start = ts;
                var t = Math.min(1, (ts - start) / total), v = ease(t);
                dot.style.left = clamp(v, -0.2, 1.3) * 70 + 12 + '%';
                marker.setAttribute('cx', gx(t));
                marker.setAttribute('cy', gy(clamp(v, VMIN, VMAX)));
                if (state.sound && Math.floor(v * steps) !== lastTick && t < 1) { lastTick = Math.floor(v * steps); sound.tick(); }
                if (t < 1 && anim.modal.classList.contains('np-open')) window.requestAnimationFrame(frame);
                else {
                    if (state.sound && t >= 1) sound.chime();
                    previewing = false;
                    setTimeout(function () { if (marker.parentNode) marker.parentNode.removeChild(marker); }, 600);
                }
            }
            window.requestAnimationFrame(frame);
        }

        /* --- History: rounds of picks, and times each student was picked --- */
        var hist = null;

        function openHistory() {
            if (!hist) {
                hist = makePanel('Pick History', 'np-hist');
                hist.top.innerHTML = '<div class="np-rp-help">Every pick, newest first, and how many times each student ' +
                    'has been picked. The history is kept with the class and saved in Export JSON.</div>';
                hist.modal.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-h]');
                    if (!b) return;
                    if (b.getAttribute('data-h') === 'clear') {
                        if (!window.confirm('Clear the whole pick history? (Who is "picked" for No repeats is kept.)')) return;
                        state.history = [];
                        save();
                        renderHistory();
                    }
                });
            }
            renderHistory();
            hist.open();
        }

        function whenText(t) {
            var d = new Date(t), now = new Date();
            var time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            if (d.toDateString() === now.toDateString()) return time;
            return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + time;
        }

        function renderHistory() {
            var body = hist.body;
            if (!state.history.length) {
                body.innerHTML = '<div class="np-rp-empty">No picks yet.</div>';
            } else {
                var rounds = state.history.slice().reverse().map(function (h, i) {
                    var names = h.ids.map(function (id) { return byId[id]; }).filter(Boolean).map(function (st) { return esc(st.fullName); });
                    return '<li><span class="np-h-when">' + esc(whenText(h.t)) + '</span>' +
                        '<span class="np-h-names">' + (names.join(', ') || '<em>(no longer in the class)</em>') + '</span></li>';
                }).join('');
                var counts = pickCounts();
                var tally = sortedStudents().map(function (st) { return { st: st, n: counts[st.id] || 0 }; })
                    .sort(function (a, b) { return a.n - b.n; })
                    .map(function (x) {
                        return '<li class="' + (x.n ? '' : 'np-h-zero') + (state.absent[x.st.id] ? ' np-absent' : '') + '">' +
                            '<span class="np-h-names">' + esc(x.st.fullName) + '</span><span class="np-h-n">' + x.n + '</span></li>';
                    }).join('');
                body.innerHTML =
                    '<div class="np-h-cols"><section><h5>Recent picks</h5><ol class="np-h-rounds">' + rounds + '</ol></section>' +
                    '<section><h5>Times picked (fewest first)</h5><ol class="np-h-tally">' + tally + '</ol></section></div>';
            }
            hist.foot.innerHTML =
                '<span class="np-rp-count">' + plural(state.history.length, 'round') + '</span>' +
                '<span><button type="button" class="np-btn np-btn-grey" data-h="clear"' + (state.history.length ? '' : ' disabled') + '>Clear history</button> ' +
                '<button type="button" class="np-btn" data-p="close">Done</button></span>';
        }

        defaultsFromConfig();
        load();
        build();
        buildModal();
        updateControls();
        updateRevertButton();
        renderIdle();
    }

    function init() {
        Array.prototype.forEach.call(document.querySelectorAll('.namepicker[data-namepicker]'), function (el) {
            if (el.getAttribute('data-np-ready')) return;
            el.setAttribute('data-np-ready', '1');
            try {
                new NamePicker(el, JSON.parse(el.getAttribute('data-namepicker')));
            } catch (err) {
                if (window.console) console.error('namepicker failed:', err);
                el.textContent = 'Name picker failed to load: ' + (err && err.message ? err.message : err);
                el.style.padding = '12px';
                el.style.color = '#b91c1c';
            }
        });
    }

    init();
    document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('load', init);
})();
