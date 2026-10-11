(function () {
    'use strict';

    var COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    var MAX_VISIBLE = 10;           /* names shown in the stack while it cycles */
    var CARD_H = 56;                /* must match .np-card height in the CSS */
    var STEP = 46;                  /* vertical distance between stacked cards (cards overlap) */
    var SETTLE_GAP = 10;            /* gap between the chosen cards once the stack settles */
    var STEPS_PER_SECOND = 6;       /* how many names pass the top per second of animation time */
    var XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    var xlsxPromise = null;

    /* Bright card colours. "dark" means the card uses dark text for contrast. */
    var PALETTE = [
        { c: '#ff2d55' }, { c: '#ff8a00' }, { c: '#ffd60a', dark: true }, { c: '#8be31a', dark: true },
        { c: '#00c46a' }, { c: '#00d4d4', dark: true }, { c: '#0aa5ff' }, { c: '#3b6bff' },
        { c: '#8b5cff' }, { c: '#d935f5' }, { c: '#ff4fa3' }, { c: '#ff5e3a' }
    ];

    /* Easing functions: take 0..1, return 0..1 (back / elastic / bounce overshoot on purpose). */
    var EASINGS = [
        { key: 'linear', label: 'Linear (constant speed)', fn: function (t) { return t; } },
        { key: 'ease-out', label: 'Ease out (smooth slow down)', fn: function (t) { return 1 - Math.pow(1 - t, 3); } },
        {
            key: 'ease-in-out', label: 'Ease in-out (slow start and end)',
            fn: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
        },
        { key: 'ease-out-strong', label: 'Ease out strong (fast, then crawl)', fn: function (t) { return 1 - Math.pow(1 - t, 5); } },
        {
            key: 'back', label: 'Overshoot (slips past, settles back)',
            fn: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
        },
        {
            key: 'elastic', label: 'Elastic (springy)',
            fn: function (t) {
                if (t === 0 || t === 1) return t;
                return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
            }
        },
        {
            key: 'bounce', label: 'Bounce',
            fn: function (t) {
                var n1 = 7.5625, d1 = 2.75;
                if (t < 1 / d1) return n1 * t * t;
                if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
                if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
                t -= 2.625 / d1; return n1 * t * t + 0.984375;
            }
        }
    ];

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
            noRepeat: false,
            surnameInitial: false,
            showHomeroom: true,
            skipAnimation: false,
            lastResult: []
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
            state.noRepeat = !!cfg.noRepeat;
            state.surnameInitial = !!cfg.surnameInitial;
            state.showHomeroom = cfg.showHomeroom !== false;
            state.skipAnimation = !!cfg.skipAnimation;
            state.absent = {};
            state.picked = {};
            state.lastResult = [];
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

        function save() {
            try {
                localStorage.setItem(storageKey, JSON.stringify({
                    title: currentTitle(),
                    students: state.students,
                    absent: state.absent,
                    picked: state.picked,
                    count: state.count,
                    duration: state.duration,
                    easing: state.easing,
                    noRepeat: state.noRepeat,
                    surnameInitial: state.surnameInitial,
                    showHomeroom: state.showHomeroom,
                    skipAnimation: state.skipAnimation,
                    lastResult: state.lastResult
                }));
            } catch (e) { /* storage blocked */ }
        }

        function applyData(d) {
            if (d.title) state.title = d.title;
            state.students = d.students;
            state.absent = d.absent && typeof d.absent === 'object' && !Array.isArray(d.absent) ? d.absent : {};
            state.picked = d.picked && typeof d.picked === 'object' && !Array.isArray(d.picked) ? d.picked : {};
            if (d.count) state.count = clamp(parseInt(d.count, 10) || 1, 1, 10);
            if (d.duration) state.duration = clamp(parseFloat(d.duration) || 6, 1, 20);
            if (d.easing) state.easing = easingByKey(d.easing).key;
            if (typeof d.noRepeat === 'boolean') state.noRepeat = d.noRepeat;
            if (typeof d.surnameInitial === 'boolean') state.surnameInitial = d.surnameInitial;
            if (typeof d.showHomeroom === 'boolean') state.showHomeroom = d.showHomeroom;
            if (typeof d.skipAnimation === 'boolean') state.skipAnimation = d.skipAnimation;
            state.lastResult = Array.isArray(d.lastResult) ? d.lastResult : [];
            indexStudents();
        }

        function load() {
            try {
                var raw = localStorage.getItem(storageKey);
                if (!raw) return false;
                var d = JSON.parse(raw);
                if (d && Array.isArray(d.students)) { applyData(d); return true; }
            } catch (e) { /* ignore */ }
            return false;
        }

        function present() {
            return state.students.filter(function (s) { return !state.absent[s.id]; });
        }

        /* ---------- UI ---------- */
        function build() {
            var optHtml = EASINGS.map(function (e) {
                return '<option value="' + e.key + '">' + esc(e.label) + '</option>';
            }).join('');

            root.innerHTML =
                '<div class="np-title" data-role="title" title="Click to edit title"></div>' +
                '<button type="button" class="np-projector-exit" data-action="projector-exit">✕ Exit projector view</button>' +
                '<div class="np-toolbar">' +
                '<div class="np-toolbar-row">' +
                '<button type="button" class="np-btn" data-action="import">' +
                icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>') +
                'Import Roster</button>' +
                '<input type="file" class="np-file" accept=".xlsx,.xls,.csv" data-role="file">' +

                '<button type="button" class="np-btn np-btn-teal" data-action="import-json">' +
                icon('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L8.6 3.3A2 2 0 0 0 6.9 2.5H4a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/>') +
                'Import JSON</button>' +
                '<input type="file" class="np-file" accept=".json" data-role="json-file">' +

                '<button type="button" class="np-btn np-btn-teal" data-action="export-json">' +
                icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>') +
                'Export JSON</button>' +

                '<button type="button" class="np-btn np-btn-grey" data-action="reset">' +
                icon('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>') +
                'Reset</button>' +

                '<button type="button" class="np-btn np-btn-teal" data-action="print">' +
                icon('<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>') +
                'Print</button>' +

                '<button type="button" class="np-btn np-btn-purple" data-action="class-list">' +
                icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') +
                'Class List</button>' +

                '<button type="button" class="np-btn np-btn-teal" data-action="projector">' +
                icon('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>') +
                'Projector View</button>' +
                '</div>' +

                '<div class="np-toolbar-row">' +
                '<span class="np-toolbar-label">Students to pick:</span>' +
                '<div class="np-sizes" data-role="counts">' +
                COUNTS.map(function (n) {
                    return '<button type="button" class="np-btn np-btn-size" data-action="count" data-count="' + n + '">' + n + '</button>';
                }).join('') +
                '</div>' +
                '</div>' +

                '<div class="np-toolbar-row">' +
                '<span class="np-toolbar-label">Animation time:</span>' +
                '<input type="range" class="np-range" min="1" max="20" step="0.5" data-role="duration" aria-label="Animation time in seconds">' +
                '<span class="np-time-out" data-role="duration-out"></span>' +
                '<span class="np-toolbar-label">Easing:</span>' +
                '<select class="np-select" data-role="easing" aria-label="Easing">' + optHtml + '</select>' +
                '</div>' +

                '<div class="np-toolbar-row np-toolbar-row--options">' +
                '<label class="np-checkbox-label"><input type="checkbox" data-role="toggle-surname-initial" class="np-checkbox">Surname Initial Only</label>' +
                '<label class="np-checkbox-label"><input type="checkbox" data-role="toggle-homeroom" class="np-checkbox">Show Homeroom</label>' +
                '<label class="np-checkbox-label"><input type="checkbox" data-role="toggle-no-repeat" class="np-checkbox">Skip Students Already Picked</label>' +
                '<label class="np-checkbox-label"><input type="checkbox" data-role="toggle-skip-animation" class="np-checkbox">Skip Animation</label>' +
                '<button type="button" class="np-btn np-btn-amber" data-action="forget-picks">Forget Picks</button>' +
                '</div>' +
                '</div>' +

                '<div class="np-status" data-role="status" role="status" aria-live="polite"></div>' +
                '<div class="np-body">' +
                '<button type="button" class="np-btn np-pick" data-action="pick">Pick!</button>' +
                '<div class="np-stage" data-role="stage"></div>' +
                '<div class="np-empty" data-role="empty">No names yet. Use Import Roster, or add names to the directive.</div>' +
                '<div class="np-result" data-role="result" aria-live="polite"></div>' +
                '<div class="np-info" data-role="info"></div>' +
                '</div>';

            ['title', 'file', 'json-file', 'counts', 'duration', 'duration-out', 'easing', 'toggle-surname-initial',
                'toggle-homeroom', 'toggle-no-repeat', 'toggle-skip-animation', 'status', 'stage', 'empty', 'result', 'info'].forEach(function (r) {
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
            ui.status.addEventListener('click', function () { setStatus(''); });
            ui.file.addEventListener('change', onFileChosen);
            ui['json-file'].addEventListener('change', onJsonFileChosen);

            ui.duration.addEventListener('input', function () {
                state.duration = parseFloat(ui.duration.value) || 6;
                updateControls();
            });
            ui.duration.addEventListener('change', save);
            ui.easing.addEventListener('change', function () { state.easing = ui.easing.value; save(); });
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
            ui.status.innerHTML = '<span class="np-status-text">' + esc(msg) + '</span><button type="button" class="np-status-close">✕</button>';
            ui.status.classList.add('np-show');
        }

        function updateControls() {
            Array.prototype.forEach.call(ui.counts.querySelectorAll('[data-count]'), function (b) {
                b.classList.toggle('np-active', parseInt(b.getAttribute('data-count'), 10) === state.count);
            });
            ui.duration.value = state.duration;
            ui['duration-out'].textContent = (Math.round(state.duration * 10) / 10) + ' s';
            ui.easing.value = state.easing;
            ui['toggle-surname-initial'].checked = state.surnameInitial;
            ui['toggle-homeroom'].checked = state.showHomeroom;
            ui['toggle-no-repeat'].checked = state.noRepeat;
            ui['toggle-skip-animation'].checked = state.skipAnimation;
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
            ui.info.textContent = parts.join(' · ');
        }

        function onRootClick(e) {
            var t = e.target.closest('[data-action]');
            if (!t || !root.contains(t)) return;
            var action = t.getAttribute('data-action');
            if (view && view.busy && action !== 'print' && action !== 'projector-exit') return;
            switch (action) {
                case 'pick': spin(); break;
                case 'count':
                    state.count = parseInt(t.getAttribute('data-count'), 10);
                    save(); updateControls();
                    break;
                case 'class-list': openModal(); break;
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
            var ids = shuffle(pool.map(function (s) { return s.id; }));
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
            return pool.map(function (s) { return s.id; }).sort().join('|');
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
            } else {
                /* keep the names currently on screen, but give everything off-screen a fresh random order */
                var shown = {}, k;
                for (k = 0; k < view.vis; k++) shown[mod(view.base + k, view.n)] = true;
                var rest = [];
                for (k = 0; k < view.n; k++) if (!shown[k]) rest.push(k);
                var names = shuffle(rest.map(function (pos) { return view.ids[pos]; }));
                rest.forEach(function (pos, j) { view.ids[pos] = names[j]; });
                view.els.forEach(function (el) { el._i = null; });
            }

            view.busy = true;
            ui.pick.disabled = true;
            ui.pick.textContent = 'Picking…';
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
            var steps = Math.max(view.vis + N + 3, Math.round(state.duration * STEPS_PER_SECOND)) +
                Math.floor(Math.random() * view.n);
            var ease = easingByKey(state.easing).fn;
            var total = state.duration * 1000;

            if (state.skipAnimation) { draw(steps); settle(steps, N); return; }

            var start = null;
            function frame(ts) {
                if (start === null) start = ts;
                var t = Math.min(1, (ts - start) / total);
                draw(steps * ease(t));
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
                    el.firstChild.textContent = String(k + 1);
                    el.style.transform = 'translate3d(0,' + (k * (CARD_H + SETTLE_GAP)) + 'px,0) scale(1)';
                    el.style.opacity = 1;
                    el.style.zIndex = 1000 - k;
                } else {
                    el.style.opacity = 0;
                }
            });
            ui.stage.style.height = (N * CARD_H + (N - 1) * SETTLE_GAP) + 'px';

            for (var k2 = 0; k2 < N; k2++) {
                var s = byId[view.ids[mod(top + k2, view.n)]];
                if (s) { result.push(s.id); state.picked[s.id] = true; }
            }
            state.lastResult = result;
            view.base = top;
            view.busy = false;
            view.settled = true;
            ui.pick.disabled = false;
            ui.pick.textContent = 'Pick Again!';
            save();
            updateResult();
            updateInfo();
        }

        function resultNames() {
            return state.lastResult.map(function (id) { return byId[id]; }).filter(Boolean).map(function (s) {
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
            if (!window.confirm('Reset the name picker to the roster and settings written on the page?')) return;
            try { localStorage.removeItem(storageKey); } catch (e) {}
            defaultsFromConfig();
            if (ui.title) ui.title.textContent = state.title;
            updateControls();
            setStatus('');
            ui.pick.textContent = 'Pick!';
            renderIdle();
        }

        /* ---------- import / export / print ---------- */
        function exportJson() {
            var payload = {
                title: currentTitle(),
                count: state.count,
                duration: state.duration,
                easing: state.easing,
                noRepeat: state.noRepeat,
                surnameInitial: state.surnameInitial,
                showHomeroom: state.showHomeroom,
                skipAnimation: state.skipAnimation,
                students: state.students,
                absent: state.absent,
                picked: state.picked,
                lastResult: state.lastResult
            };
            var dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
            var anchor = document.createElement('a');
            anchor.setAttribute('href', dataStr);
            anchor.setAttribute('download', (currentTitle() || 'name_picker').toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.json');
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        }

        function onJsonFileChosen(e) {
            var file = e.target.files[0];
            if (!file) return;
            var input = e.target;
            var reader = new FileReader();
            reader.onload = function (evt) {
                try {
                    var data = JSON.parse(evt.target.result);
                    if (!data || !Array.isArray(data.students)) throw new Error('Invalid format');
                    applyData(data);
                    if (ui.title) ui.title.textContent = state.title;
                    save();
                    updateControls();
                    ui.pick.textContent = 'Pick!';
                    renderIdle();
                    setStatus('Successfully imported JSON.');
                } catch (err) {
                    setStatus('Failed to import JSON: ' + err.message);
                } finally {
                    input.value = '';
                }
            };
            reader.readAsText(file);
        }

        function applyRows(rows) {
            var students = rowsToStudents(rows);
            if (!students.length) { setStatus('No students found in file.'); return; }
            state.students = students;
            state.absent = {};
            state.picked = {};
            state.lastResult = [];
            indexStudents();
            save();
            ui.pick.textContent = 'Pick!';
            renderIdle();
            setStatus('Imported ' + students.length + ' students.');
        }

        function onFileChosen(e) {
            var file = e.target.files[0];
            if (!file) return;
            var input = e.target;
            var reader = new FileReader();
            reader.onload = function (evt) {
                if (/\.csv$/i.test(file.name)) {
                    applyRows(parseCSV(decodeBuffer(evt.target.result)));
                    input.value = '';
                } else {
                    loadXlsx().then(function (XLSX) {
                        var wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
                        applyRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
                    }).catch(function (err) {
                        setStatus(err.message || 'Could not read Excel file.');
                    }).then(function () { input.value = ''; });
                }
            };
            reader.readAsArrayBuffer(file);
        }

        function printResult() {
            var picks = state.lastResult.map(function (id) { return byId[id]; }).filter(Boolean);
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

        /* ---------- class list dialog (who is here today) ---------- */
        function buildModal() {
            modal = make('div', 'np-modal');
            modal.innerHTML =
                '<div class="np-modal-card" role="dialog" aria-modal="true">' +
                '<div class="np-modal-head"><span>Class List: Who Is Here?</span>' +
                '<button type="button" class="np-modal-close" data-m="close">✕</button></div>' +
                '<div class="np-modal-body">' +
                '<div class="np-modal-actions">' +
                '<button type="button" class="np-btn np-btn-teal" data-m="all">All Present</button>' +
                '<button type="button" class="np-btn np-btn-grey" data-m="none">None Present</button>' +
                '<span class="np-modal-count" data-m="count"></span>' +
                '</div>' +
                '<div class="np-class-list" data-m="list"></div>' +
                '</div></div>';
            document.body.appendChild(modal);
            ['list', 'count'].forEach(function (k) { mui[k] = modal.querySelector('[data-m="' + k + '"]'); });

            modal.addEventListener('click', function (e) {
                if (e.target === modal) { closeModal(); return; }
                var btn = e.target.closest('[data-m]');
                if (!btn) return;
                var m = btn.getAttribute('data-m');
                if (m === 'close') closeModal();
                else if (m === 'all') setAllPresent(true);
                else if (m === 'none') setAllPresent(false);
            });
            mui.list.addEventListener('change', function (e) {
                var box = e.target.closest('input[data-sid]');
                if (!box) return;
                var id = box.getAttribute('data-sid');
                if (box.checked) delete state.absent[id]; else state.absent[id] = true;
                box.closest('.np-class-item').classList.toggle('np-absent', !box.checked);
                classListChanged();
            });
        }

        function openModal() {
            renderClassList();
            modal.classList.add('np-open');
        }

        function closeModal() { if (modal) modal.classList.remove('np-open'); }

        function setAllPresent(flag) {
            state.absent = {};
            if (!flag) state.students.forEach(function (s) { state.absent[s.id] = true; });
            renderClassList();
            classListChanged();
        }

        function classListChanged() {
            save();
            state.lastResult = state.lastResult.filter(function (id) { return !state.absent[id]; });
            ui.pick.textContent = 'Pick!';
            renderIdle();
            mui.count.textContent = present().length + ' of ' + state.students.length + ' present';
        }

        function renderClassList() {
            mui.list.innerHTML = '';
            if (!state.students.length) {
                mui.list.appendChild(make('div', 'np-rules-empty', 'No students yet. Use Import Roster first.'));
            }
            state.students.forEach(function (s) {
                var item = make('label', 'np-class-item' + (state.absent[s.id] ? ' np-absent' : ''));
                var box = make('input');
                box.type = 'checkbox';
                box.checked = !state.absent[s.id];
                box.setAttribute('data-sid', s.id);
                item.appendChild(box);
                item.appendChild(make('span', 'np-class-name', s.fullName + (s.homeroom ? ' (' + s.homeroom + ')' : '')));
                if (state.picked[s.id]) item.appendChild(make('span', 'np-class-tag', 'picked'));
                mui.list.appendChild(item);
            });
            mui.count.textContent = present().length + ' of ' + state.students.length + ' present';
        }

        defaultsFromConfig();
        load();
        build();
        buildModal();
        updateControls();
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
