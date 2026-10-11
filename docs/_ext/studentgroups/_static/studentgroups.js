(function () {
    'use strict';

    var SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    var XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    var xlsxPromise = null;

    var PRINT_CSS =
        '@page{size:landscape;margin:10mm}' +
        'body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#000}' +
        'h1{font-size:22px;margin:0 0 8px}' +
        '.sg-grid{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}' +
        '.sg-group-box{border:1px solid #000;border-radius:6px;padding:4px 6px;break-inside:avoid;width:23% !important}' +
        '/* Specific 5-column layout for group size 6 when printing */' +
        '.sg-group-box[data-size="6"]{width:17.5% !important}' +
        '.sg-group-header{font-weight:700;font-size:12px;border-bottom:1px solid #000;padding-bottom:2px;margin-bottom:4px}' +
        '.sg-group-slots{display:flex;flex-direction:column;gap:3px}' +
        '.sg-slot{border:1px solid #000;border-radius:3px;height:52px;display:flex;align-items:center;justify-content:center}' +
        '.sg-card{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;width:98%}' +
        '.sg-first{font-weight:700;font-size:17px;line-height:1.1}.sg-last{font-size:13px;line-height:1.1}' +
        '/* Print homerooms without borders */' +
        '.sg-badge-stack { display: flex !important; flex-direction: row; gap: 4px; justify-content: center; align-items: center; margin-top: 1px; }' +
        '.sg-badge-hr { display: inline-block !important; font-size: 10.5px; font-weight: 700; border: none !important; padding: 0 2px; background: transparent !important; color: #000; }' +
        '.sg-badges { display: none !important; }' +
        '/* One-line names: shorter cards with first name and surname side by side */' +
        '.sg-compact .sg-slot{height:30px}' +
        '.sg-compact .sg-card{flex-direction:row;gap:6px;flex-wrap:nowrap}' +
        '.sg-compact .sg-name-line{display:flex;align-items:baseline;gap:4px;white-space:nowrap;overflow:hidden}' +
        '.sg-compact .sg-first{font-size:15px}.sg-compact .sg-last{font-size:13px}' +
        '.sg-compact .sg-badge-stack{margin-top:0 !important}';

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

    function formatHomeroom(hr) {
        var str = clean(hr);
        if (!str) return '';
        var digits = str.replace(/\D/g, '');
        return str.charAt(0) + (digits.length >= 2 ? digits.slice(-2) : digits);
    }

    /* ---------------- grouping solver (pure: no DOM) ---------------- */
    function planGroups(students, rules, groupSize, opts) {
        opts = opts || {};
        var randomise = !!opts.randomise;
        var n = students.length;
        var numGroups = Math.max(1, Math.ceil(n / groupSize));

        var known = {};
        students.forEach(function (s) { known[s.id] = true; });
        var usable = (rules || []).filter(function (r) {
            return (r.type === 'SEPARATE' || r.type === 'PAIR') && r.student2Id &&
                r.student1Id !== r.student2Id && known[r.student1Id] && known[r.student2Id];
        });

        function shuffle(arr) {
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
            }
            return arr;
        }

        var balancedCaps = [], looseCaps = [];
        for (var g = 0; g < numGroups; g++) {
            balancedCaps.push(Math.floor(n / numGroups) + (g < n % numGroups ? 1 : 0));
            looseCaps.push(groupSize);
        }

        function pack(ruleSet) {
            var parent = {};
            students.forEach(function (s) { parent[s.id] = s.id; });
            function find(x) {
                while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
                return x;
            }
            ruleSet.forEach(function (r) {
                if (r.type === 'PAIR') parent[find(r.student1Id)] = find(r.student2Id);
            });

            var blocks = {}, order = [];
            students.forEach(function (s) {
                var root = find(s.id);
                if (!blocks[root]) { blocks[root] = { id: root, members: [], nbrs: {}, deg: 0 }; order.push(root); }
                blocks[root].members.push(s.id);
            });

            var bad = false;
            ruleSet.forEach(function (r) {
                if (r.type !== 'SEPARATE') return;
                var a = find(r.student1Id), b = find(r.student2Id);
                if (a === b) { bad = true; return; }
                if (!blocks[a].nbrs[b]) { blocks[a].nbrs[b] = true; blocks[a].deg++; }
                if (!blocks[b].nbrs[a]) { blocks[b].nbrs[a] = true; blocks[b].deg++; }
            });
            if (bad) return null;

            var constrained = [];
            order.forEach(function (id) {
                var b = blocks[id];
                if (b.members.length > groupSize) bad = true;
                if (b.members.length > 1 || b.deg > 0) constrained.push(b);
            });
            if (bad) return null;

            var tiers = [balancedCaps, looseCaps];
            for (var t = 0; t < tiers.length; t++) {
                var caps = tiers[t];
                var gOf = dfs(constrained, caps, blocks);
                if (gOf) return { gOf: gOf, blocks: blocks, constrained: constrained, caps: caps };
            }
            return null;
        }

        function dfs(constrained, caps, blocks) {
            var remaining = caps.slice(), gOf = {}, nodes = 0, LIMIT = 20000;

            function domain(b) {
                var d = [];
                for (var g = 0; g < numGroups; g++) {
                    if (remaining[g] < b.members.length) continue;
                    var clash = false;
                    for (var nid in b.nbrs) { if (gOf[nid] === g) { clash = true; break; } }
                    if (!clash) d.push(g);
                }
                return d;
            }

            function rec(left) {
                if (!left.length) return true;
                if (++nodes > LIMIT) return false;
                var bi = -1, bd = null;
                for (var i = 0; i < left.length; i++) {
                    var d = domain(left[i]);
                    if (!d.length) return false;
                    if (bd === null || d.length < bd.length ||
                        (d.length === bd.length && (left[i].members.length > left[bi].members.length ||
                            (left[i].members.length === left[bi].members.length && left[i].deg > left[bi].deg)))) {
                        bi = i; bd = d;
                    }
                }
                var b = left[bi];
                if (randomise) shuffle(bd);
                var fill = function (g) { return caps[g] - remaining[g]; };
                bd = bd.map(function (g, k) { return { g: g, k: k }; })
                    .sort(function (x, y) { return (fill(x.g) - fill(y.g)) || (x.k - y.k); })
                    .map(function (o) { return o.g; });
                var rest = left.slice(0, bi).concat(left.slice(bi + 1));
                for (var k = 0; k < bd.length; k++) {
                    var g = bd[k];
                    gOf[b.id] = g; remaining[g] -= b.members.length;
                    if (rec(rest)) return true;
                    remaining[g] += b.members.length; delete gOf[b.id];
                    if (nodes > LIMIT) return false;
                }
                return false;
            }

            return rec(constrained.slice()) ? gOf : null;
        }

        var placed = pack(usable), dropped = [];
        if (!placed) {
            var kept = [];
            placed = pack([]);
            usable.forEach(function (rule) {
                var trial = kept.concat([rule]);
                var p = pack(trial);
                if (p) { kept = trial; placed = p; } else { dropped.push(rule); }
            });
        }

        var groups = [];
        for (var gi = 0; gi < numGroups; gi++) groups.push([]);
        var isBlocked = {};
        placed.constrained.forEach(function (b) {
            b.members.forEach(function (id) { isBlocked[id] = true; groups[placed.gOf[b.id]].push(id); });
        });
        var singles = students.filter(function (s) { return !isBlocked[s.id]; });

        var caps = placed.caps, extra = [];
        for (var e = 0; e < numGroups; e++) extra.push(0);
        for (var k = 0; k < singles.length; k++) {
            var best = [], bestSize = Infinity;
            for (var q = 0; q < numGroups; q++) {
                var size = groups[q].length + extra[q];
                if (size >= caps[q]) continue;
                if (size < bestSize) { bestSize = size; best = [q]; } else if (size === bestSize) best.push(q);
            }
            if (!best.length) break;
            extra[randomise ? best[Math.floor(Math.random() * best.length)] : best[0]]++;
        }

        var cursor = 0;
        for (var gg = 0; gg < numGroups; gg++) {
            for (var x = 0; x < extra[gg] && cursor < singles.length; x++) groups[gg].push(singles[cursor++].id);
        }

        return { groups: groups, dropped: dropped };
    }

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
            var surname = r['surname'] || r['last name'] || r['lastname'] || String(idx + 1);
            students.push({
                id: 'student-' + idx,
                firstName: first,
                surname: surname,
                fullName: first + ' ' + surname,
                homeroom: formatHomeroom(r['homeroom'])
            });
        });
        return students;
    }

    function StudentGroups(root, cfg) {
        var storageKey = 'studentgroups:' + cfg.id;
        var state = {
            title: cfg.title || 'Student Groups',
            students: [],
            rules: [],
            groupSize: cfg.groupSize || 4,
            sortMode: cfg.sort || 'DEFAULT',
            groupCustomNames: {},
            display: {}
        };
        var DISPLAY_TOGGLES = {
            surnameInitial: 'toggle-surname-initial',
            homeroom: 'toggle-homeroom',
            ignoreRules: 'toggle-ignore-rules',
            oneLine: 'toggle-oneline',
            hideBadges: 'toggle-hide-badges'
        };
        var draggingId = null;
        var ui = {};
        var modal = null;
        var mui = {};

        function displayFromConfig() {
            var d = cfg.display || {};
            return {
                surnameInitial: d.surnameInitial === true,
                homeroom: d.homeroom !== false,
                ignoreRules: d.ignoreRules === true,
                oneLine: d.oneLine === true,
                hideBadges: d.hideBadges === true
            };
        }

        function syncDisplayControls() {
            Object.keys(DISPLAY_TOGGLES).forEach(function (key) {
                var box = ui[DISPLAY_TOGGLES[key]];
                if (box) box.checked = state.display[key];
            });
            applyDisplayClasses();
        }

        function defaultsFromConfig() {
            state.display = displayFromConfig();
            state.title = cfg.title || 'Student Groups';
            state.groupSize = cfg.groupSize || 4;
            state.students = (cfg.students || []).map(function (s, idx) {
                var first = clean(s.firstName) || 'Student';
                var surname = clean(s.surname) || String(idx + 1);
                return {
                    id: 'student-' + idx,
                    firstName: first,
                    surname: surname,
                    fullName: first + ' ' + surname,
                    homeroom: formatHomeroom(s.homeroom)
                };
            });
            state.rules = (cfg.rules || []).map(function (r, i) {
                return {
                    id: 'rule-cfg-' + i,
                    student1Id: 'student-' + r.a,
                    student2Id: r.b == null ? null : 'student-' + r.b,
                    type: r.type
                };
            });
        }

        function save() {
            try {
                var currentTitle = ui.title ? ui.title.textContent.trim() : state.title;
                localStorage.setItem(storageKey, JSON.stringify({
                    title: currentTitle,
                    students: state.students,
                    rules: state.rules,
                    groupSize: state.groupSize,
                    groupCustomNames: state.groupCustomNames,
                    display: state.display
                }));
            } catch (e) { /* storage blocked */ }
        }

        function load() {
            try {
                var raw = localStorage.getItem(storageKey);
                if (!raw) return false;
                var d = JSON.parse(raw);
                if (d && Array.isArray(d.students)) {
                    if (d.title) state.title = d.title;
                    state.students = d.students;
                    state.rules = Array.isArray(d.rules) ? d.rules : [];
                    if (d.groupSize) state.groupSize = d.groupSize;
                    if (d.groupCustomNames) state.groupCustomNames = d.groupCustomNames;
                    if (d.display && typeof d.display === 'object') {
                        Object.keys(state.display).forEach(function (k) {
                            if (typeof d.display[k] === 'boolean') state.display[k] = d.display[k];
                        });
                    }
                    return true;
                }
            } catch (e) { /* ignore */ }
            return false;
        }

        function studentById(id) {
            for (var i = 0; i < state.students.length; i++) {
                if (state.students[i].id === id) return state.students[i];
            }
            return null;
        }

        function rulesFor(id) {
            return state.rules.filter(function (r) { return r.student1Id === id || r.student2Id === id; });
        }

        function build() {
            root.innerHTML =
                '<div class="sg-title" data-role="title" title="Click to edit title"></div>' +
                '<button type="button" class="sg-projector-exit" data-action="projector-exit">✕ Exit projector view</button>' +
                '<div class="sg-toolbar">' +
                /* Row 1 */
                '<div class="sg-toolbar-row">' +
                '<button type="button" class="sg-btn" data-action="import">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>' +
                'Import Roster</button>' +
                '<input type="file" class="sg-file" accept=".xlsx,.xls,.csv" data-role="file">' +

                '<button type="button" class="sg-btn sg-btn-teal" data-action="import-json">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L8.6 3.3A2 2 0 0 0 6.9 2.5H4a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/></svg>' +
                'Import JSON</button>' +
                '<input type="file" class="sg-file" accept=".json" data-role="json-file">' +

                '<button type="button" class="sg-btn sg-btn-teal" data-action="export-json">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>' +
                'Export JSON</button>' +

                '<button type="button" class="sg-btn sg-btn-grey" data-action="reset">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>' +
                'Reset</button>' +

                '<button type="button" class="sg-btn sg-btn-teal" data-action="print">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>' +
                'Print</button>' +

                '<button type="button" class="sg-btn sg-btn-teal" data-action="projector">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>' +
                'Projector View</button>' +
                '</div>' +

                /* Row 2: Added Homeroom A -> Z sort button */
                '<div class="sg-toolbar-row">' +
                '<button type="button" class="sg-btn sg-btn-red" data-action="clear">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>' +
                'Clear</button>' +

                '<button type="button" class="sg-btn sg-btn-purple" data-action="sort" data-mode="AZ">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="M15 4h5l-5 6h5"/><path d="M15 20v-3.5a1.5 1.5 0 0 1 3 0V20"/><path d="M15 17h3"/></svg>' +
                'A → Z</button>' +

                '<button type="button" class="sg-btn sg-btn-purple" data-action="sort" data-mode="ZA">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M15 4h5l-5 6h5"/><path d="M15 20v-3.5a1.5 1.5 0 0 1 3 0V20"/><path d="M15 17h3"/></svg>' +
                'Z → A</button>' +

                '<button type="button" class="sg-btn sg-btn-purple" data-action="sort" data-mode="HOMEROOM">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M4 6h16M4 12h16M4 18h7"/></svg>' +
                'Homeroom A → Z</button>' +

                '<button type="button" class="sg-btn sg-btn-amber" data-action="sort" data-mode="RANDOM">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l6.1 8.6c.7 1.1 2 1.7 3.3 1.7H22"/><path d="m18 14 4 4-4 4"/></svg>' +
                'Random Grouping</button>' +

                '<button type="button" class="sg-btn sg-btn-teal" data-action="rules">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><line x1="4" x2="20" y1="21" y2="21"/><line x1="4" x2="8" y1="14" y2="14"/><line x1="12" x2="20" y1="14" y2="14"/><line x1="16" x2="20" y1="7" y2="7"/><line x1="4" x2="12" y1="7" y2="7"/><circle cx="10" cy="14" r="2"/><circle cx="14" cy="7" r="2"/></svg>' +
                'Rules</button>' +
                '</div>' +

                /* Row 3: Group size selectors */
                '<div class="sg-toolbar-row">' +
                '<span style="color:#94a3b8; font-size:12px; font-weight:600;">Group Size:</span>' +
                '<div class="sg-sizes" data-role="sizes">' +
                SIZES.map(function (sz) {
                    return '<button type="button" class="sg-btn sg-btn-size" data-action="size" data-size="' + sz + '">' + sz + '</button>';
                }).join('') +
                '</div>' +
                '</div>' +

                /* Row 4: Display Options (Mix Homerooms checkbox removed) */
                '<div class="sg-toolbar-row sg-toolbar-row--options">' +
                '<label class="sg-checkbox-label">' +
                '<input type="checkbox" data-role="toggle-surname-initial" class="sg-checkbox">' +
                'Surname Initial Only' +
                '</label>' +
                '<label class="sg-checkbox-label">' +
                '<input type="checkbox" data-role="toggle-homeroom" class="sg-checkbox" checked>' +
                'Show Homeroom' +
                '</label>' +
                '<label class="sg-checkbox-label">' +
                '<input type="checkbox" data-role="toggle-ignore-rules" class="sg-checkbox">' +
                'Ignore Rules' +
                '</label>' +
                '<label class="sg-checkbox-label">' +
                '<input type="checkbox" data-role="toggle-oneline" class="sg-checkbox">' +
                'One-line Names' +
                '</label>' +
                '<label class="sg-checkbox-label">' +
                '<input type="checkbox" data-role="toggle-hide-badges" class="sg-checkbox">' +
                'Hide Rule Badges' +
                '</label>' +
                '</div>' +

                '</div>' +
                '<div class="sg-status" data-role="status" role="status" aria-live="polite"></div>' +
                '<div class="sg-body">' +
                '<div class="sg-sidebar"><div class="sg-side-title">Unassigned (<span data-role="count">0</span>)</div>' +
                '<div class="sg-pool" data-role="pool"></div></div>' +
                '<div class="sg-canvas"><div class="sg-grid" data-role="grid"></div></div>' +
                '</div>';

            ['title', 'sizes', 'file', 'json-file', 'toggle-surname-initial', 'toggle-homeroom', 'toggle-ignore-rules', 'toggle-oneline', 'toggle-hide-badges', 'status', 'count', 'pool', 'grid'].forEach(function (r) {
                ui[r] = root.querySelector('[data-role="' + r + '"]');
            });

            ui.title.textContent = state.title;
            ui.title.contentEditable = "true";

            ui.title.addEventListener('click', function () { ui.title.focus(); });
            ui.title.addEventListener('blur', function () {
                state.title = ui.title.textContent.trim();
                save();
            });
            ui.title.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); ui.title.blur(); }
            });

            root.addEventListener('click', onRootClick);
            ui.status.addEventListener('click', function () { setStatus(''); });
            ui.file.addEventListener('change', onFileChosen);
            ui['json-file'].addEventListener('change', onJsonFileChosen);
            Object.keys(DISPLAY_TOGGLES).forEach(function (key) {
                var box = ui[DISPLAY_TOGGLES[key]];
                box.checked = state.display[key];
                box.addEventListener('change', function () {
                    state.display[key] = box.checked;
                    applyDisplayClasses();
                    save();
                    if (key !== 'ignoreRules') refreshCards();
                });
            });
            applyDisplayClasses();
            document.addEventListener('fullscreenchange', function () {
                if (!document.fullscreenElement && root.classList.contains('sg-projector')) exitProjector();
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && root.classList.contains('sg-projector')) exitProjector();
            });
            ui.pool.addEventListener('dragover', function (e) { e.preventDefault(); });
            ui.pool.addEventListener('drop', onPoolDrop);
        }

        /* Projector view: groups only, large text, filling the screen */
        function enterProjector() {
            root.classList.add('sg-projector');
            document.documentElement.classList.add('sg-projector-open');
            if (root.requestFullscreen) {
                root.requestFullscreen().catch(function () { /* stays as a full-window overlay */ });
            }
        }

        function exitProjector() {
            root.classList.remove('sg-projector');
            document.documentElement.classList.remove('sg-projector-open');
            if (document.fullscreenElement === root && document.exitFullscreen) {
                document.exitFullscreen().catch(function () {});
            }
        }

        function applyDisplayClasses() {
            root.classList.toggle('sg-compact', state.display.oneLine);
            root.classList.toggle('sg-hide-badges', state.display.hideBadges);
        }

        function setStatus(msg) {
            if (!msg) { ui.status.textContent = ''; ui.status.classList.remove('sg-show'); return; }
            ui.status.innerHTML = '<span class="sg-status-text">' + esc(msg) + '</span><button type="button" class="sg-status-close">✕</button>';
            ui.status.classList.add('sg-show');
        }

        function updateToolbar() {
            Array.prototype.forEach.call(ui.sizes.querySelectorAll('[data-size]'), function (b) {
                b.classList.toggle('sg-active', parseInt(b.getAttribute('data-size'), 10) === state.groupSize);
            });
        }

        function onRootClick(e) {
            var t = e.target.closest('[data-action]');
            if (!t || !root.contains(t)) return;
            switch (t.getAttribute('data-action')) {
                case 'size':
                    state.groupSize = parseInt(t.getAttribute('data-size'), 10);
                    autoArrange(state.sortMode);
                    break;
                case 'rules': openModal(); break;
                case 'import': ui.file.click(); break;
                case 'export-json': exportJson(); break;
                case 'import-json': ui['json-file'].click(); break;
                case 'sort': autoArrange(t.getAttribute('data-mode')); break;
                case 'clear': clearGroups(); break;
                case 'reset': resetToPage(); break;
                case 'print': printPlan(); break;
                case 'projector': enterProjector(); break;
                case 'projector-exit': exitProjector(); break;
            }
        }

        function buildBadges(student, flags, showHomeroom) {
            var container = make('div', 'sg-badge-stack');
            if (showHomeroom && student.homeroom) {
                container.appendChild(make('span', 'sg-badge sg-badge-hr', student.homeroom));
            }
            var ruleRow = make('div', 'sg-badges');
            if (flags.sep) ruleRow.appendChild(make('span', 'sg-badge sg-badge-sep', '⚠️ Sep'));
            if (flags.pair) ruleRow.appendChild(make('span', 'sg-badge sg-badge-pair', '🔗 Pair'));
            if (ruleRow.children.length > 0) container.appendChild(ruleRow);
            return container;
        }

        function renderCard(card, student, isSlot) {
            var rs = rulesFor(student.id);
            var flags = {
                sep: rs.some(function (r) { return r.type === 'SEPARATE'; }),
                pair: rs.some(function (r) { return r.type === 'PAIR'; })
            };
            if (state.display.hideBadges) flags = { sep: false, pair: false };
            card.classList.remove('sg-has-sep', 'sg-has-pair');
            if (flags.sep) card.classList.add('sg-has-sep');
            else if (flags.pair) card.classList.add('sg-has-pair');

            card.textContent = '';
            var surnameDisplay = student.surname;
            if (state.display.surnameInitial && student.surname) {
                surnameDisplay = student.surname.charAt(0) + '.';
            }
            var showHomeroom = state.display.homeroom;

            if (isSlot) {
                var nameHolder = card;
                if (state.display.oneLine) {
                    nameHolder = make('span', 'sg-name-line');
                    card.appendChild(nameHolder);
                }
                nameHolder.appendChild(make('span', 'sg-first', student.firstName));
                nameHolder.appendChild(make('span', 'sg-last', surnameDisplay));
                if ((showHomeroom && student.homeroom) || flags.sep || flags.pair) {
                    card.appendChild(buildBadges(student, flags, showHomeroom));
                }
            } else {
                var nameSpan = make('span', 'sg-side-name', student.firstName + ' ' + surnameDisplay);
                card.appendChild(nameSpan);
            }
        }

        function createCard(student, isSlot) {
            var card = make('div', 'sg-card');
            card.dataset.sid = student.id;
            card.draggable = true;
            card.addEventListener('dragstart', function (e) {
                draggingId = student.id;
                e.dataTransfer.setData('text/plain', student.id);
                e.dataTransfer.effectAllowed = 'move';
            });
            card.addEventListener('dragend', function () { draggingId = null; });
            renderCard(card, student, isSlot);
            return card;
        }

        function cardFor(id) {
            return root.querySelector('.sg-card[data-sid="' + id + '"]');
        }

        function refreshCards() {
            Array.prototype.forEach.call(root.querySelectorAll('.sg-card'), function (card) {
                var s = studentById(card.dataset.sid);
                if (s) {
                    var slot = card.closest('.sg-slot');
                    renderCard(card, s, !!slot);
                }
            });
        }

        function updateCount() {
            var unassignedCount = ui.pool.querySelectorAll('.sg-card').length;
            ui.count.textContent = unassignedCount;
            var sidebar = root.querySelector('.sg-sidebar');
            if (sidebar) {
                if (unassignedCount === 0) sidebar.classList.add('sg-hidden');
                else sidebar.classList.remove('sg-hidden');
            }
        }

        function getSlots() {
            return Array.prototype.slice.call(ui.grid.querySelectorAll('.sg-slot'));
        }

        function initGrid() {
            ui.grid.innerHTML = '';
            var totalStudents = Math.max(state.students.length, 1);
            var numGroups = Math.ceil(totalStudents / state.groupSize);

            for (var g = 0; g < numGroups; g++) {
                var groupBox = make('div', 'sg-group-box');
                groupBox.dataset.groupIndex = g;
                groupBox.setAttribute('data-size', state.groupSize);

                var defaultName = 'Group ' + (g + 1);
                var groupHeader = make('div', 'sg-group-header', state.groupCustomNames[g] || defaultName);
                groupHeader.contentEditable = "true";
                groupHeader.addEventListener('blur', (function (idx, headerEl) {
                    return function () {
                        var val = headerEl.textContent.trim();
                        state.groupCustomNames[idx] = val;
                        save();
                    };
                })(g, groupHeader));

                groupBox.appendChild(groupHeader);

                var slotsContainer = make('div', 'sg-group-slots');
                for (var s = 0; s < state.groupSize; s++) {
                    var slot = make('div', 'sg-slot');
                    slot.dataset.groupIndex = g;
                    slot.dataset.slotIndex = s;
                    slot.addEventListener('dragover', function (e) { e.preventDefault(); e.currentTarget.classList.add('sg-drag-over'); });
                    slot.addEventListener('dragleave', function (e) { e.currentTarget.classList.remove('sg-drag-over'); });
                    slot.addEventListener('drop', onSlotDrop);
                    slotsContainer.appendChild(slot);
                }
                groupBox.appendChild(slotsContainer);
                ui.grid.appendChild(groupBox);
            }
        }

        function validate() {
            var slots = getSlots();
            var seated = {};
            slots.forEach(function (slot) {
                slot.classList.remove('sg-conflict');
                var card = slot.querySelector('.sg-card');
                if (card) seated[card.dataset.sid] = { slot: slot, groupIndex: +slot.dataset.groupIndex };
            });

            state.rules.forEach(function (rule) {
                var a = seated[rule.student1Id];
                if (!a) return;
                var b = seated[rule.student2Id];
                if (!b) return;

                if (rule.type === 'SEPARATE' && a.groupIndex === b.groupIndex) {
                    a.slot.classList.add('sg-conflict');
                    b.slot.classList.add('sg-conflict');
                } else if (rule.type === 'PAIR' && a.groupIndex !== b.groupIndex) {
                    a.slot.classList.add('sg-conflict');
                    b.slot.classList.add('sg-conflict');
                }
            });
        }

        function onSlotDrop(e) {
            e.preventDefault();
            var target = e.currentTarget;
            target.classList.remove('sg-drag-over');
            var id = draggingId || e.dataTransfer.getData('text/plain');
            var dragged = cardFor(id);
            if (!dragged) return;
            var student = studentById(id);
            var source = dragged.parentElement;
            var existing = target.querySelector('.sg-card');
            if (existing === dragged) return;

            if (existing) {
                var other = studentById(existing.dataset.sid);
                var sourceIsSlot = source.classList.contains('sg-slot');
                if (other) renderCard(existing, other, sourceIsSlot);
                source.appendChild(existing);
                if (sourceIsSlot) source.classList.add('sg-occupied');
            } else if (source.classList.contains('sg-slot')) {
                source.classList.remove('sg-occupied');
            }

            if (student) renderCard(dragged, student, true);
            target.classList.add('sg-occupied');
            target.appendChild(dragged);
            draggingId = null;
            validate();
            updateCount();
        }

        function onPoolDrop(e) {
            e.preventDefault();
            var id = draggingId || e.dataTransfer.getData('text/plain');
            var card = cardFor(id);
            if (!card) return;
            var parent = card.parentElement;
            if (parent.classList.contains('sg-slot')) parent.classList.remove('sg-occupied');
            var s = studentById(id);
            if (s) renderCard(card, s, false);
            ui.pool.appendChild(card);
            draggingId = null;
            validate();
            updateCount();
        }

        function clearGroups() {
            setStatus('');
            initGrid();
            ui.pool.innerHTML = '';
            state.students.forEach(function (s) { ui.pool.appendChild(createCard(s, false)); });
            validate();
            updateCount();
        }

        function describeRule(r) {
            var a = studentById(r.student1Id), b = studentById(r.student2Id);
            var an = a ? a.fullName : '?', bn = b ? b.fullName : '?';
            return r.type === 'PAIR' ? an + ' with ' + bn : an + ' apart from ' + bn;
        }

        function droppedMessage(dropped) {
            return 'Not every rule could be met at once, so these were left out (earlier rules take priority): ' +
                dropped.map(describeRule).join('; ') + '. Students breaking a rule are highlighted red.';
        }

        function autoArrange(mode) {
            state.sortMode = mode || 'DEFAULT';
            setStatus('');
            updateToolbar();

            if (!state.students.length) {
                initGrid();
                ui.pool.innerHTML = '';
                updateCount();
                return;
            }

            var list = state.students.slice();
            if (mode === 'AZ' || mode === 'ZA') {
                var dir = mode === 'AZ' ? 1 : -1;
                list.sort(function (a, b) {
                    var r = String(a.surname).localeCompare(String(b.surname));
                    if (r === 0) r = String(a.firstName).localeCompare(String(b.firstName));
                    return r * dir;
                });
            } else if (mode === 'HOMEROOM') {
                list.sort(function (a, b) {
                    var hrA = clean(a.homeroom), hrB = clean(b.homeroom);
                    if (hrA !== hrB) {
                        if (!hrA) return 1;
                        if (!hrB) return -1;
                        return hrA.localeCompare(hrB);
                    }
                    var r = String(a.surname).localeCompare(String(b.surname));
                    if (r === 0) r = String(a.firstName).localeCompare(String(b.firstName));
                    return r;
                });
            } else if (mode === 'RANDOM') {
                for (var i = list.length - 1; i > 0; i--) {
                    var j = Math.floor(Math.random() * (i + 1));
                    var t = list[i]; list[i] = list[j]; list[j] = t;
                }
            }

            initGrid();
            ui.pool.innerHTML = '';

            var slots = getSlots();
            var ignoreRules = state.display.ignoreRules;
            var rulesToUse = ignoreRules ? [] : state.rules;

            var plan = planGroups(list, rulesToUse, state.groupSize, { randomise: mode === 'RANDOM' });

            var byId = {};
            state.students.forEach(function (s) { byId[s.id] = s; });

            var seated = {};
            plan.groups.forEach(function (ids, g) {
                ids.forEach(function (id, k) {
                    var slot = slots[g * state.groupSize + k];
                    if (!slot || !byId[id]) return;
                    slot.classList.add('sg-occupied');
                    slot.appendChild(createCard(byId[id], true));
                    seated[id] = true;
                });
            });

            list.forEach(function (s) {
                if (!seated[s.id]) ui.pool.appendChild(createCard(s, false));
            });

            if (plan.dropped.length) setStatus(droppedMessage(plan.dropped));

            validate();
            updateCount();
        }

        function resetToPage() {
            if (!window.confirm('Reset groups to the roster and rules written on the page?')) return;
            try { localStorage.removeItem(storageKey); } catch (e) {}
            defaultsFromConfig();
            state.groupCustomNames = {};
            if (ui.title) ui.title.textContent = state.title;
            syncDisplayControls();
            autoArrange(cfg.sort || 'DEFAULT');
        }

        function exportJson() {
            var slots = getSlots();
            var placement = [];
            slots.forEach(function (d, idx) {
                var card = d.querySelector('.sg-card');
                if (card) placement.push({ slotIndex: idx, studentId: card.dataset.sid });
            });
            var poolCards = ui.pool.querySelectorAll('.sg-card');
            Array.prototype.forEach.call(poolCards, function (card) {
                placement.push({ slotIndex: null, studentId: card.dataset.sid });
            });

            var currentTitle = ui.title ? ui.title.textContent.trim() : state.title;
            var payload = {
                title: currentTitle,
                groupSize: state.groupSize,
                sortMode: state.sortMode,
                students: state.students,
                rules: state.rules,
                groupCustomNames: state.groupCustomNames,
                placement: placement
            };

            var dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
            var anchor = document.createElement('a');
            anchor.setAttribute('href', dataStr);
            anchor.setAttribute('download', (currentTitle || 'student_groups').toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.json');
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
                    if (data.title) { state.title = data.title; if (ui.title) ui.title.textContent = data.title; }
                    if (data.groupSize) state.groupSize = data.groupSize;
                    state.students = data.students;
                    state.rules = Array.isArray(data.rules) ? data.rules : [];
                    state.groupCustomNames = data.groupCustomNames || {};

                    save();
                    updateToolbar();
                    initGrid();
                    ui.pool.innerHTML = '';

                    var slots = getSlots();
                    var byId = {};
                    state.students.forEach(function (s) { byId[s.id] = s; });

                    if (Array.isArray(data.placement) && data.placement.length) {
                        data.placement.forEach(function (item) {
                            var s = byId[item.studentId];
                            if (!s) return;
                            if (item.slotIndex != null && slots[item.slotIndex]) {
                                var slot = slots[item.slotIndex];
                                slot.classList.add('sg-occupied');
                                slot.appendChild(createCard(s, true));
                            } else {
                                ui.pool.appendChild(createCard(s, false));
                            }
                        });
                    } else {
                        autoArrange(state.sortMode);
                        return;
                    }
                    validate();
                    updateCount();
                    setStatus('Successfully imported JSON groups.');
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
            if (!students.length) {
                setStatus('No students found in file.');
                return;
            }
            state.rules = [];
            state.students = students;
            save();
            autoArrange(state.sortMode);
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

        function printPlan() {
            var title = (ui.title ? ui.title.textContent.trim() : state.title) || 'Student Groups';
            var clone = ui.grid.cloneNode(true);
            var win = window.open('', '_blank');
            if (!win) { window.print(); return; }
            win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) +
                '</title><style>' + PRINT_CSS + '</style></head><body' +
                (state.display.oneLine ? ' class="sg-compact"' : '') + '><h1>' + esc(title) +
                '</h1>' + clone.outerHTML + '</body></html>');
            win.document.close();
            win.focus();
            setTimeout(function () { win.print(); }, 250);
        }

        function buildModal() {
            modal = make('div', 'sg-modal');
            modal.innerHTML =
                '<div class="sg-modal-card" role="dialog" aria-modal="true">' +
                '<div class="sg-modal-head"><span>Group Assignment Rules &amp; Constraints</span>' +
                '<button type="button" class="sg-modal-close" data-m="close">✕</button></div>' +
                '<div class="sg-modal-body">' +
                '<div class="sg-rule-form">' +
                '<div class="sg-c-s1"><select data-m="s1"></select></div>' +
                '<div class="sg-c-type"><select data-m="type"></select></div>' +
                '<div class="sg-c-s2"><select data-m="s2"></select></div>' +
                '<button type="button" class="sg-btn sg-c-add" data-m="add">Add Rule</button>' +
                '</div>' +
                '<div class="sg-feedback" data-m="feedback"></div>' +
                '<div class="sg-modal-sub">Active Rules</div>' +
                '<div class="sg-rules-list" data-m="list"></div>' +
                '</div></div>';
            document.body.appendChild(modal);

            ['s1', 'type', 's2', 'feedback', 'list'].forEach(function (k) {
                mui[k] = modal.querySelector('[data-m="' + k + '"]');
            });

            modal.addEventListener('click', function (e) {
                if (e.target === modal) { closeModal(); return; }
                var del = e.target.closest('[data-del]');
                if (del) { deleteRule(del.getAttribute('data-del')); return; }
                var btn = e.target.closest('[data-m]');
                if (!btn) return;
                if (btn.getAttribute('data-m') === 'close') closeModal();
                else if (btn.getAttribute('data-m') === 'add') addRule();
            });
            mui.s1.addEventListener('change', fillStudent2);
        }

        function openModal() {
            fillTypes();
            fillStudent1();
            renderRules();
            feedback('');
            modal.classList.add('sg-open');
        }

        function closeModal() { if (modal) modal.classList.remove('sg-open'); }

        function feedback(msg, kind) {
            mui.feedback.textContent = msg || '';
            mui.feedback.className = 'sg-feedback' + (kind ? ' sg-' + kind : '');
        }

        function fillTypes() {
            mui.type.innerHTML = '';
            [
                ['SEPARATE', 'Must Be in Different Groups'],
                ['PAIR', 'Must Be in Same Group']
            ].forEach(function (o) {
                var opt = make('option', null, o[1]);
                opt.value = o[0];
                mui.type.appendChild(opt);
            });
        }

        function studentOptions(select, placeholder, skipId) {
            select.innerHTML = '';
            var p = make('option', null, placeholder);
            p.value = '';
            select.appendChild(p);
            state.students.forEach(function (s) {
                if (s.id === skipId) return;
                var o = make('option', null, s.fullName);
                o.value = s.id;
                select.appendChild(o);
            });
        }

        function fillStudent1() {
            studentOptions(mui.s1, state.students.length ? 'Select Student 1...' : 'Import class list first...', null);
            fillStudent2();
        }

        function fillStudent2() {
            var s1 = mui.s1.value;
            studentOptions(mui.s2, s1 ? 'Select Student 2...' : 'Select Student 1 first...', s1);
        }

        function ruleProblem(rules) {
            var parent = {};
            function find(x) {
                if (parent[x] == null) parent[x] = x;
                while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
                return x;
            }
            rules.forEach(function (r) { if (r.type === 'PAIR') parent[find(r.student1Id)] = find(r.student2Id); });
            var size = {};
            Object.keys(parent).forEach(function (id) { var r = find(id); size[r] = (size[r] || 0) + 1; });
            for (var root in size) {
                if (size[root] > state.groupSize) {
                    return 'Those keep-together rules would put ' + size[root] + ' students in one group, but groups are only ' + state.groupSize + '.';
                }
            }
            for (var i = 0; i < rules.length; i++) {
                var r = rules[i];
                if (r.type === 'SEPARATE' && find(r.student1Id) === find(r.student2Id)) {
                    return 'That would need ' + (studentById(r.student1Id) || {}).fullName + ' and ' + (studentById(r.student2Id) || {}).fullName +
                        ' to be both together and apart, because other keep-together rules link them.';
                }
            }
            return '';
        }

        function addRule() {
            var s1 = mui.s1.value, s2 = mui.s2.value, type = mui.type.value;
            if (!s1 || !s2) return feedback('Please select both students.', 'error');
            if (s1 === s2) return feedback('Choose two different students.', 'error');

            var between = state.rules.filter(function (r) {
                return (r.student1Id === s1 && r.student2Id === s2) || (r.student1Id === s2 && r.student2Id === s1);
            });
            if (between.some(function (r) { return r.type === type; })) return feedback('That rule already exists.', 'error');
            if (between.length) return feedback('These students already have the opposite rule. Remove it first, then add the new rule.', 'error');

            var problem = ruleProblem(state.rules.concat([{ student1Id: s1, student2Id: s2, type: type }]));
            if (problem) return feedback(problem, 'error');

            state.rules.push({
                id: 'rule-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                student1Id: s1, student2Id: s2, type: type
            });
            save();
            renderRules();
            refreshCards();
            validate();
            feedback('Rule added.', 'success');
            mui.s2.value = '';
        }

        function deleteRule(id) {
            state.rules = state.rules.filter(function (r) { return r.id !== id; });
            save();
            renderRules();
            refreshCards();
            validate();
            feedback('Rule removed.', 'success');
        }

        function renderRules() {
            mui.list.innerHTML = '';
            var shown = 0;
            state.rules.forEach(function (r) {
                var s1 = studentById(r.student1Id), s2 = studentById(r.student2Id);
                if (!s1 || !s2) return;
                var item = make('div'), label = make('span');
                var sep = r.type === 'SEPARATE';
                item.className = 'sg-rule-item ' + (sep ? 'sg-sep' : 'sg-pair');
                label.innerHTML = '<strong>' + esc(s1.fullName) + '</strong> ' + (sep ? '⚠️ separate from' : '🔗 keep with') + ' <strong>' + esc(s2.fullName) + '</strong>';

                var del = make('button', 'sg-del-rule', '✕');
                del.type = 'button';
                del.setAttribute('data-del', r.id);
                item.appendChild(label);
                item.appendChild(del);
                mui.list.appendChild(item);
                shown++;
            });
            if (!shown) {
                mui.list.appendChild(make('div', 'sg-rules-empty', 'No rules defined yet. Add constraints to keep students together or separate them into different groups.'));
            }
        }

        defaultsFromConfig();
        load();
        build();
        buildModal();
        autoArrange(state.sortMode);
    }

    function init() {
        Array.prototype.forEach.call(document.querySelectorAll('.studentgroups[data-studentgroups]'), function (el) {
            if (el.getAttribute('data-sg-ready')) return;
            el.setAttribute('data-sg-ready', '1');
            try {
                new StudentGroups(el, JSON.parse(el.getAttribute('data-studentgroups')));
            } catch (err) {
                if (window.console) console.error('studentgroups failed:', err);
                el.textContent = 'Group planner failed to load: ' + (err && err.message ? err.message : err);
                el.style.padding = '12px';
                el.style.color = '#b91c1c';
            }
        });
    }

    if (window.console) console.log('studentgroups.js loaded');
    init();
    document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('load', init);
})();