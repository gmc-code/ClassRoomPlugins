/* seatingplan directive: client-side behaviour. Each .seatingplan[data-seatingplan] gets its own instance. */
(function () {
    'use strict';

    var PRESETS = [
        { label: '5x6', rows: [6, 6, 6, 6, 6] },
        { label: '4x7', rows: [7, 7, 7, 7] },
        { label: '4x8', rows: [8, 8, 8, 8] },
        { label: '6,8,8,6', rows: [6, 8, 8, 6] },
        { label: '3x9', rows: [9, 9, 9] },
        { label: '3x10', rows: [10, 10, 10] },
        { label: '8,10,10', rows: [8, 10, 10] },
        { label: '6,11,11', rows: [6, 11, 11] },
        { label: '4,12,12', rows: [4, 12, 12] },
        { label: '14,14', rows: [14, 14] }
    ];
    var LIMIT_SEATS = 6; /* Limit Desk Width: short rows use the desk width of a 6-desk row */
    var XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    var xlsxPromise = null;

    var PRINT_CSS =
        '@page{size:landscape;margin:10mm}' +
        'body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#000}' +
        'h1{font-size:22px;margin:0 0 8px}' +
        '.wb{border:2px solid #000;text-align:center;padding:6px;font-weight:700;letter-spacing:1px;font-size:14px;margin-bottom:12px}' +
        '.sp-grid{display:flex;flex-direction:column;gap:12px}' +
        '.sp-row{display:grid;gap:10px}' +
        '.sp-desk{border:1px solid #000;border-radius:5px;min-height:80px;box-sizing:border-box;padding:2px 0;position:relative;display:flex;align-items:center;justify-content:center;min-width:0;break-inside:avoid}' +
        '.sp-desk-num{position:absolute;top:2px;left:6px;font-size:10px;color:#000}' +
        '.sp-card{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;width:96%}' +
        '.sp-first{font-weight:700}.sp-last{}' +
        '.sp-badges{display:flex;flex-wrap:wrap;gap:3px;align-items:center;justify-content:center;margin-top:2px}' +
        '.sp-badge{font-size:11px;font-weight:700;border:1px solid #000;border-radius:3px;padding:1px 4px}' +
        '.sp-badge-hr{border:none !important;background:transparent;padding:0 2px}' +
        '.sp-badge-stack{display:flex;flex-direction:column;align-items:center;gap:2px}' +
        '/* One-line names: shorter desks with first name and surname side by side */' +
        '.sp-compact .sp-desk{min-height:46px}' +
        '.sp-compact .sp-name-line{display:flex;align-items:baseline;justify-content:center;gap:4px;max-width:100%;overflow:hidden;white-space:nowrap}' +
        '.sp-compact .sp-badge-stack{flex-direction:row;margin-top:1px}' +
        /* Teacher's view: whiteboard at the bottom, rows and sides reversed */
        'h1 small{font-size:14px;font-weight:400;color:#444}' +
        '.sp-teacher-view .sp-room{display:flex;flex-direction:column-reverse}' +
        '.sp-teacher-view .wb{margin:12px 0 0}' +
        '.sp-teacher-view .sp-grid{flex-direction:column-reverse}' +
        '.sp-teacher-view .sp-row{direction:rtl}' +
        '.sp-teacher-view .sp-desk>*{direction:ltr}';

    /* ---------------- helpers ---------------- */

    function make(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    /* "7,8,9,6" -> [7,8,9,6]; "5x6" -> five rows of 6. Returns null if invalid. */
    function parseLayout(text) {
        var t = String(text || '').trim().toLowerCase().replace(/\u00d7/g, 'x');
        var rows, m = t.match(/^(\d+)\s*x\s*(\d+)$/);
        if (m) {
            rows = [];
            for (var i = 0; i < +m[1]; i++) rows.push(+m[2]);
        } else {
            if (!/^[\d,\s]+$/.test(t)) return null;
            rows = t.split(/[,\s]+/).filter(Boolean).map(Number);
        }
        if (!rows.length || rows.length > 12) return null;
        for (var j = 0; j < rows.length; j++) {
            if (!(rows[j] >= 1 && rows[j] <= 20)) return null;
        }
        return rows;
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
        if (str.length <= 4 && !/\s/.test(str)) return str;
        var digits = str.replace(/\D/g, '');
        return str.charAt(0) + (digits.length >= 2 ? digits.slice(-2) : digits);
    }

    function isSingleStudentRule(type) {
        return type === 'FRONT_ROW' || type === 'BACK_ROW' || type === 'EMPTY_SEAT' || type === 'SIT_LEFT' || type === 'SIT_RIGHT';
    }

    function adjacent(a, b) {
        var r = Math.abs(a.row - b.row), c = Math.abs(a.col - b.col);
        return r <= 1 && c <= 1 && !(r === 0 && c === 0);
    }

    function isSideBySidePair(a, b) {
        if (a.row !== b.row) return false;
        var colDiff = Math.abs(a.col - b.col);
        if (colDiff !== 1) return false;
        return Math.floor(a.col / 2) === Math.floor(b.col / 2);
    }

    /* ---------------- seating solver (pure: no DOM) ---------------- */
    function solveSeating(desks, layout, rules, randomise, maxNodes) {
        var lastRow = layout.length - 1;
        var vars = [], varIndex = {};

        function addVar(id, owner) {
            if (varIndex[id] != null) return;
            varIndex[id] = vars.length;
            vars.push({ id: id, owner: owner || null, pos: [], rel: {}, deg: 0, prio: 7, sep: false });
        }
        function link(a, b, kind) {
            a.rel[b.id] = a.rel[b.id] || {};
            a.rel[b.id][kind] = true;
        }
        function bump(v, p) { if (p < v.prio) v.prio = p; }

        rules.forEach(function (r) {
            addVar(r.student1Id);
            if (r.student2Id) addVar(r.student2Id);
        });
        rules.forEach(function (r) {
            if (r.type === 'EMPTY_SEAT') addVar('__empty__' + r.student1Id, r.student1Id);
        });

        rules.forEach(function (r) {
            var a = vars[varIndex[r.student1Id]];
            if (r.type === 'SIT_LEFT' || r.type === 'SIT_RIGHT') { a.pos.push(r.type); bump(a, 1); return; }
            if (r.type === 'FRONT_ROW') { a.pos.push(r.type); bump(a, 2); return; }
            if (r.type === 'BACK_ROW') { a.pos.push(r.type); bump(a, 3); return; }
            if (r.type === 'EMPTY_SEAT') {
                var ph = vars[varIndex['__empty__' + r.student1Id]];
                link(a, ph, 'empty'); link(ph, a, 'empty');
                bump(a, 6); bump(ph, 6);
                return;
            }
            if (!r.student2Id) return;
            var b = vars[varIndex[r.student2Id]];
            var kind = r.type === 'SEPARATE' ? 'sep' : 'pair';
            link(a, b, kind); link(b, a, kind);
            bump(a, kind === 'sep' ? 4 : 5); bump(b, kind === 'sep' ? 4 : 5);
            if (kind === 'sep') { a.sep = true; b.sep = true; }
        });
        vars.forEach(function (v) { v.deg = Object.keys(v.rel).length; });

        vars.forEach(function (v) {
            var seen = {}, stack = [v.id], n = 0;
            seen[v.id] = true;
            while (stack.length) {
                var cur = vars[varIndex[stack.pop()]];
                n++;
                Object.keys(cur.rel).forEach(function (oid) {
                    if (cur.rel[oid].pair && !seen[oid]) { seen[oid] = true; stack.push(oid); }
                });
            }
            v.pairSize = n;
        });

        if (vars.length > desks.length) return null;

        function unaryOk(v, d) {
            for (var i = 0; i < v.pos.length; i++) {
                var t = v.pos[i];
                if (t === 'FRONT_ROW' && d.row !== 0) return false;
                if (t === 'BACK_ROW' && d.row !== lastRow) return false;
                if (t === 'SIT_LEFT' && d.col !== 0) return false;
                if (t === 'SIT_RIGHT' && d.col !== layout[d.row] - 1) return false;
            }
            return true;
        }

        function compatible(va, da, vb, db) {
            var rel = va.rel[vb.id];
            if (!rel) return true;
            if (rel.empty) return da.row === db.row && Math.abs(da.col - db.col) === 1;
            if (rel.sep && rel.pair) return false;
            if (rel.sep && adjacent(da, db)) return false;
            if (rel.pair) {
                if (va.pairSize > 2 ? !isNextTo(da, db) : !isSideBySidePair(da, db)) return false;
            }
            return true;
        }

        function shuffle(arr) {
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
            }
            return arr;
        }

        var domains = vars.map(function (v) { return desks.filter(function (d) { return unaryOk(v, d); }); });
        for (var q = 0; q < domains.length; q++) if (!domains[q].length) return null;

        var asg = vars.map(function () { return -1; });
        var used = {}, nodes = 0, limit = maxNodes || 60000;

        function freeNeighbours(d) {
            var n = 0;
            for (var i = 0; i < desks.length; i++) {
                if (desks[i].index !== d.index && !used[desks[i].index] && adjacent(d, desks[i])) n++;
            }
            return n;
        }

        function search(doms, remaining) {
            if (++nodes > limit) return false;
            if (!remaining) return true;

            var pick = -1;
            for (var i = 0; i < vars.length; i++) {
                if (asg[i] !== -1) continue;
                if (pick === -1) { pick = i; continue; }
                var a = doms[i].length, b = doms[pick].length;
                if (a < b ||
                    (a === b && vars[i].prio < vars[pick].prio) ||
                    (a === b && vars[i].prio === vars[pick].prio && vars[i].deg > vars[pick].deg)) pick = i;
            }

            var v = vars[pick];
            var vals = doms[pick].slice();
            if (randomise) shuffle(vals);
            else if (v.sep) vals.sort(function (x, y) { return (freeNeighbours(y) - freeNeighbours(x)) || (x.index - y.index); });

            for (var k = 0; k < vals.length; k++) {
                var d = vals[k];
                var next = doms.slice(), ok = true;
                for (var j = 0; j < vars.length && ok; j++) {
                    if (j === pick || asg[j] !== -1) continue;
                    var vj = vars[j];
                    next[j] = doms[j].filter(function (x) {
                        return x.index !== d.index && compatible(v, d, vj, x);
                    });
                    if (!next[j].length) ok = false;
                }
                if (!ok) continue;
                asg[pick] = d.index; used[d.index] = true;
                if (search(next, remaining - 1)) return true;
                asg[pick] = -1; delete used[d.index];
                if (nodes > limit) return false;
            }
            return false;
        }

        if (!search(domains, vars.length)) return null;

        var assignment = {}, reservedDesks = {};
        vars.forEach(function (v, i) {
            if (v.owner) reservedDesks[asg[i]] = true;
            else assignment[v.id] = asg[i];
        });
        return { assignment: assignment, reservedDesks: reservedDesks };
    }

    function isNextTo(a, b) {
        return a.row === b.row && Math.abs(a.col - b.col) === 1;
    }

    function loadXlsx() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        if (!xlsxPromise) {
            xlsxPromise = new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = XLSX_URL;
                s.onload = function () { resolve(window.XLSX); };
                s.onerror = function () { xlsxPromise = null; reject(new Error('Could not load the Excel reader.')); };
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

    /* ---------------- one seating plan ---------------- */

    function SeatingPlan(root, cfg) {
        var storageKey = 'seatingplan:' + cfg.id;
        var state = {
            title: cfg.title || 'Seating Plan',
            students: [],
            rules: [],
            layout: cfg.layout.slice(),
            fillFromLast: cfg.fill === 'last',
            sortMode: cfg.sort || 'DEFAULT',
            display: {}
        };
        var DISPLAY_TOGGLES = {
            surnameInitial: 'toggle-surname-initial',
            homeroom: 'toggle-homeroom',
            ignoreRules: 'toggle-ignore-rules',
            oneLine: 'toggle-oneline',
            hideBadges: 'toggle-hide-badges',
            limitWidth: 'toggle-limit-width',
            teacherView: 'toggle-teacher-view'
        };
        var draggingId = null;
        var ui = {};
        var modal = null;
        var mui = {};

        /* ----- data ----- */

        function displayFromConfig() {
            var d = cfg.display || {};
            return {
                surnameInitial: d.surnameInitial === true,
                homeroom: d.homeroom !== false,
                ignoreRules: d.ignoreRules === true,
                oneLine: d.oneLine === true,
                hideBadges: d.hideBadges === true,
                limitWidth: d.limitWidth === true,
                teacherView: d.teacherView === true
            };
        }

        function defaultsFromConfig() {
            state.display = displayFromConfig();
            state.title = cfg.title || 'Seating Plan';
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
                    title: currentTitle, students: state.students, rules: state.rules, display: state.display,
                    layout: state.layout
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
                    if (Array.isArray(d.layout) && parseLayout(d.layout.join(','))) state.layout = d.layout;
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

        function ruleTypeBetween(a, b) {
            var m = state.rules.filter(function (r) {
                return (r.student1Id === a && r.student2Id === b) || (r.student1Id === b && r.student2Id === a);
            });
            var hasSep = m.some(function (r) { return r.type === 'SEPARATE'; });
            var hasPair = m.some(function (r) { return r.type === 'PAIR'; });
            if (hasSep && hasPair) return 'CONFLICT';
            return m.length ? m[0].type : null;
        }

        /* ----- skeleton ----- */

        function layoutButtonHtml(p) {
            return '<button type="button" class="sp-btn sp-btn-layout" data-action="layout" data-layout="' +
                p.rows.join(',') + '">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>' +
                esc(p.label) + '</button>';
        }

        /* Presets, plus the page's own layout and the current (custom or imported) layout
           when they are not presets. */
        function layoutButtons() {
            var btns = PRESETS.slice();
            [state.layout, cfg.layout].forEach(function (rows) {
                var key = rows.join(',');
                if (!btns.some(function (p) { return p.rows.join(',') === key; })) {
                    btns.unshift({ label: key, rows: rows.slice() });
                }
            });
            return btns;
        }

        function renderLayoutButtons() {
            ui.layouts.innerHTML = layoutButtons().map(layoutButtonHtml).join('');
        }

        function applyCustomLayout() {
            var input = ui['custom-layout'];
            var rows = parseLayout(input.value);
            if (!rows) {
                input.classList.add('sp-invalid');
                setStatus('Custom layout not recognised. Type desks per row, front row first, e.g. 7,8,9,6 ' +
                    '(or 5x6 for 5 rows of 6). Up to 12 rows of 1–20 desks.');
                input.focus();
                return;
            }
            input.classList.remove('sp-invalid');
            input.value = '';
            state.layout = rows;
            autoArrange(state.sortMode);
            save();
        }

        function build() {
            root.innerHTML =
                '<div class="sp-title" data-role="title" title="Click to edit class title"></div>' +
                '<button type="button" class="sp-projector-exit" data-action="projector-exit">✕ Exit projector view</button>' +
                '<div class="sp-toolbar">' +

                /* Row 1: Import and export controls */
                '<div class="sp-toolbar-row">' +
                '<button type="button" class="sp-btn" data-action="import">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>' +
                'Import Roster</button>' +
                '<input type="file" class="sp-file" accept=".xlsx,.xls,.csv" data-role="file">' +

                '<button type="button" class="sp-btn sp-btn-teal" data-action="import-json">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L8.6 3.3A2 2 0 0 0 6.9 2.5H4a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/></svg>' +
                'Import JSON</button>' +
                '<input type="file" class="sp-file" accept=".json" data-role="json-file">' +

                '<button type="button" class="sp-btn sp-btn-teal" data-action="export-json">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>' +
                'Export JSON</button>' +

                '<button type="button" class="sp-btn sp-btn-grey" data-action="reset">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>' +
                'Reset</button>' +

                '<button type="button" class="sp-btn sp-btn-teal" data-action="print">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>' +
                'Print</button>' +

                '<button type="button" class="sp-btn sp-btn-teal" data-action="projector">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>' +
                'Projector View</button>' +
                '</div>' +

                /* Row 2: Student ordering and seating plan management */
                '<div class="sp-toolbar-row">' +
                '<button type="button" class="sp-btn sp-btn-red" data-action="clear">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>' +
                'Clear</button>' +

                '<button type="button" class="sp-btn sp-btn-purple" data-action="sort" data-mode="AZ">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="M15 4h5l-5 6h5"/><path d="M15 20v-3.5a1.5 1.5 0 0 1 3 0V20"/><path d="M15 17h3"/></svg>' +
                'A → Z</button>' +

                '<button type="button" class="sp-btn sp-btn-purple" data-action="sort" data-mode="ZA">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M15 4h5l-5 6h5"/><path d="M15 20v-3.5a1.5 1.5 0 0 1 3 0V20"/><path d="M15 17h3"/></svg>' +
                'Z → A</button>' +

                '<button type="button" class="sp-btn sp-btn-purple" data-action="sort" data-mode="HOMEROOM">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M4 6h16M4 12h16M4 18h7"/></svg>' +
                'Homeroom A → Z</button>' +

                '<button type="button" class="sp-btn sp-btn-amber" data-action="sort" data-mode="RANDOM">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l6.1 8.6c.7 1.1 2 1.7 3.3 1.7H22"/><path d="m18 14 4 4-4 4"/></svg>' +
                'Random</button>' +

                '<button type="button" class="sp-btn sp-btn-purple" data-action="reverse">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>' +
                'Reverse</button>' +

                '<button type="button" class="sp-btn sp-btn-purple" data-action="fill" data-role="fill"></button>' +

                '<button type="button" class="sp-btn sp-btn-teal" data-action="rules">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><line x1="4" x2="20" y1="21" y2="21"/><line x1="4" x2="8" y1="14" y2="14"/><line x1="12" x2="20" y1="14" y2="14"/><line x1="16" x2="20" y1="7" y2="7"/><line x1="4" x2="12" y1="7" y2="7"/><circle cx="10" cy="14" r="2"/><circle cx="14" cy="7" r="2"/></svg>' +
                'Rules</button>' +
                '</div>' +

                /* Row 3: Layout presets and fill orientation */
                '<div class="sp-toolbar-row">' +

                '<div class="sp-layouts" data-role="layouts">' +
                layoutButtons().map(layoutButtonHtml).join('') +
                '</div>' +
                '<div class="sp-custom-layout">' +
                '<input type="text" class="sp-custom-input" data-role="custom-layout" ' +
                'placeholder="Custom e.g. 7,8,9,6" aria-label="Custom layout: desks per row, front row first" ' +
                'title="Desks per row, front row first, separated by commas (e.g. 7,8,9,6). 5x6 also works.">' +
                '<button type="button" class="sp-btn sp-btn-purple" data-action="custom-layout">Apply</button>' +
                '</div>' +
                '</div>' +

                /* Row 4: Display Preferences (Checkboxes) */
                '<div class="sp-toolbar-row sp-toolbar-row--options">' +
                '<label class="sp-checkbox-label">' +
                '<input type="checkbox" data-role="toggle-surname-initial" class="sp-checkbox">' +
                'Surname Initial Only' +
                '</label>' +
                '<label class="sp-checkbox-label">' +
                '<input type="checkbox" data-role="toggle-oneline" class="sp-checkbox">' +
                'One-line Names' +
                '</label>' +
                '<label class="sp-checkbox-label">' +
                '<input type="checkbox" data-role="toggle-homeroom" class="sp-checkbox" checked>' +
                'Show Homeroom' +
                '</label>' +
                '<label class="sp-checkbox-label">' +
                '<input type="checkbox" data-role="toggle-ignore-rules" class="sp-checkbox">' +
                'Ignore Rules' +
                '</label>' +
                '<label class="sp-checkbox-label">' +
                '<input type="checkbox" data-role="toggle-hide-badges" class="sp-checkbox">' +
                'Hide Rule Badges' +
                '</label>' +
                '<label class="sp-checkbox-label" title="Rows with fewer than 6 desks use the same desk width as a 6-desk row">' +
                '<input type="checkbox" data-role="toggle-limit-width" class="sp-checkbox">' +
                'Limit Desk Width' +
                '</label>' +
                '<label class="sp-checkbox-label" title="Show the room from the front: whiteboard at the bottom, left and right swapped">' +
                '<input type="checkbox" data-role="toggle-teacher-view" class="sp-checkbox">' +
                'Teacher\'s View' +
                '</label>' +
                '</div>' +

                '</div>' +
                '<div class="sp-status" data-role="status" role="status" aria-live="polite"></div>' +
                '<div class="sp-body">' +
                '<div class="sp-sidebar"><div class="sp-side-title">Unassigned (<span data-role="count">0</span>)</div>' +
                '<div class="sp-pool" data-role="pool"></div></div>' +
                '<div class="sp-canvas"><div class="sp-whiteboard">FRONT OF CLASSROOM / WHITEBOARD</div>' +
                '<div class="sp-grid" data-role="grid"></div></div>' +
                '</div>';

            ['title', 'layouts', 'custom-layout', 'fill', 'file', 'json-file', 'toggle-surname-initial', 'toggle-homeroom', 'toggle-ignore-rules', 'toggle-oneline', 'toggle-hide-badges', 'toggle-limit-width', 'toggle-teacher-view', 'status', 'count', 'pool', 'grid'].forEach(function (r) {
                ui[r] = root.querySelector('[data-role="' + r + '"]');
            });

            ui.title.textContent = state.title;
            ui.title.contentEditable = "true";

            ui.title.addEventListener('click', function () {
                ui.title.focus();
            });

            ui.title.addEventListener('blur', function () {
                state.title = ui.title.textContent.trim();
                save();
            });

            ui.title.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    ui.title.blur();
                }
            });

            root.addEventListener('click', onRootClick);
            ui.status.addEventListener('click', onStatusClick);
            ui.file.addEventListener('change', onFileChosen);
            ui['json-file'].addEventListener('change', onJsonFileChosen);
            Object.keys(DISPLAY_TOGGLES).forEach(function (key) {
                var box = ui[DISPLAY_TOGGLES[key]];
                box.addEventListener('change', function () {
                    state.display[key] = box.checked;
                    applyDisplayClasses();
                    if (key === 'hideBadges' && box.checked) hideRuleStatus();
                    if (key === 'limitWidth') applyRowWidths();
                    save();
                    if (key !== 'ignoreRules') refreshCards();
                });
            });
            syncDisplayControls();
            document.addEventListener('fullscreenchange', function () {
                if (!document.fullscreenElement && root.classList.contains('sp-projector')) exitProjector();
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && root.classList.contains('sp-projector')) exitProjector();
            });
            ui.pool.addEventListener('dragover', function (e) { e.preventDefault(); });
            ui.pool.addEventListener('drop', onPoolDrop);
            ui['custom-layout'].addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); applyCustomLayout(); }
            });
            ui['custom-layout'].addEventListener('input', function () {
                ui['custom-layout'].classList.remove('sp-invalid');
            });
        }

        function applyDisplayClasses() {
            root.classList.toggle('sp-compact', state.display.oneLine);
            root.classList.toggle('sp-hide-badges', state.display.hideBadges);
            root.classList.toggle('sp-teacher-view', state.display.teacherView);
        }

        function syncDisplayControls() {
            Object.keys(DISPLAY_TOGGLES).forEach(function (key) {
                var box = ui[DISPLAY_TOGGLES[key]];
                if (box) box.checked = state.display[key];
            });
            applyDisplayClasses();
        }

        /* Projector view: whiteboard and desks only, large text, filling the screen */
        function enterProjector() {
            root.classList.add('sp-projector');
            document.documentElement.classList.add('sp-projector-open');
            refreshCards();
            if (root.requestFullscreen) {
                root.requestFullscreen().catch(function () { /* stays as a full-window overlay */ });
            }
        }

        function exitProjector() {
            if (!root.classList.contains('sp-projector')) return;
            root.classList.remove('sp-projector');
            document.documentElement.classList.remove('sp-projector-open');
            refreshCards();
            if (document.fullscreenElement === root && document.exitFullscreen) {
                document.exitFullscreen().catch(function () {});
            }
        }

        /* Remove the "rules left out" message (it names students and their rules) but keep
           any warning about students without a desk. */
        function hideRuleStatus() {
            if (!ui.status.classList.contains('sp-show')) return;
            if (ui.status.textContent.indexOf('Not every rule') === -1) return;
            var unseated = ui.pool.querySelectorAll('.sp-card').length;
            setStatus(unseated ? unseatedMessage(unseated) : '');
        }

        function setStatus(msg) {
            if (!msg) {
                ui.status.textContent = '';
                ui.status.classList.remove('sp-show');
                return;
            }
            ui.status.innerHTML =
                '<span class="sp-status-text">' + esc(msg) + '</span>' +
                '<button type="button" class="sp-status-close" data-action="close-status" aria-label="Dismiss status">✕</button>';
            ui.status.classList.add('sp-show');
        }

        function onStatusClick(e) {
            var closeBtn = e.target.closest('[data-action="close-status"]');
            if (closeBtn) {
                setStatus('');
            }
        }

        function updateToolbar() {
            ui.fill.textContent = state.fillFromLast ? 'Fill: Last → First' : 'Fill: First → Last';
            renderLayoutButtons();
            var key = state.layout.join(',');
            Array.prototype.forEach.call(ui.layouts.querySelectorAll('[data-layout]'), function (b) {
                b.classList.toggle('sp-active', b.getAttribute('data-layout') === key);
            });
        }

        function onRootClick(e) {
            var t = e.target.closest('[data-action]');
            if (!t || !root.contains(t)) return;
            switch (t.getAttribute('data-action')) {
                case 'layout':
                    state.layout = t.getAttribute('data-layout').split(',').map(Number);
                    autoArrange(state.sortMode);
                    save();
                    break;
                case 'custom-layout': applyCustomLayout(); break;
                case 'fill':
                    state.fillFromLast = !state.fillFromLast;
                    autoArrange(state.sortMode);
                    break;
                case 'rules': openModal(); break;
                case 'import': ui.file.click(); break;
                case 'export-json': exportJson(); break;
                case 'import-json': ui['json-file'].click(); break;
                case 'sort': autoArrange(t.getAttribute('data-mode')); break;
                case 'reverse': reverseSeating(); break;
                case 'clear': clearSeats(); break;
                case 'reset': resetToPage(); break;
                case 'print': printPlan(); break;
                case 'projector': enterProjector(); break;
                case 'projector-exit': exitProjector(); break;
            }
        }

        /* ----- cards ----- */

        function buildBadges(student, flags, showHomeroom) {
            var container = make('div', 'sp-badge-stack');

            // Homeroom first, then rule badges, all on one row that wraps only if it must.
            var row = make('div', 'sp-badges');
            if (showHomeroom && student.homeroom) {
                row.appendChild(make('span', 'sp-badge sp-badge-hr', student.homeroom));
            }
            if (flags.sep) row.appendChild(make('span', 'sp-badge sp-badge-sep sp-badge-rule', '⚠️ Sep'));
            if (flags.pair) row.appendChild(make('span', 'sp-badge sp-badge-pair sp-badge-rule', '🔗 Pair'));
            if (flags.front) row.appendChild(make('span', 'sp-badge sp-badge-pos sp-badge-rule', '⬆ Front'));
            if (flags.back) row.appendChild(make('span', 'sp-badge sp-badge-pos sp-badge-rule', '⬇ Back'));
            if (flags.empty) row.appendChild(make('span', 'sp-badge sp-badge-pos sp-badge-rule', '🪑 Empty'));
            if (flags.left) row.appendChild(make('span', 'sp-badge sp-badge-pos sp-badge-rule', '⬅ Left'));
            if (flags.right) row.appendChild(make('span', 'sp-badge sp-badge-pos sp-badge-rule', '➡ Right'));

            if (row.children.length > 0) container.appendChild(row);
            return container;
        }

        function renderCard(card, student, isDesk, colCount) {
            var rs = rulesFor(student.id);
            var flags = {
                sep: rs.some(function (r) { return r.type === 'SEPARATE'; }),
                pair: rs.some(function (r) { return r.type === 'PAIR'; }),
                front: rs.some(function (r) { return r.type === 'FRONT_ROW'; }),
                back: rs.some(function (r) { return r.type === 'BACK_ROW'; }),
                empty: rs.some(function (r) { return r.type === 'EMPTY_SEAT'; }),
                left: rs.some(function (r) { return r.type === 'SIT_LEFT'; }),
                right: rs.some(function (r) { return r.type === 'SIT_RIGHT'; })
            };
            if (state.display.hideBadges) {
                flags = { sep: false, pair: false, front: false, back: false, empty: false, left: false, right: false };
            }
            card.classList.remove('sp-has-sep', 'sp-has-pair', 'sp-has-pos');
            if (flags.sep) card.classList.add('sp-has-sep');
            else if (flags.pair) card.classList.add('sp-has-pair');
            else if (flags.front || flags.back || flags.empty || flags.left || flags.right) card.classList.add('sp-has-pos');

            card.textContent = '';

            var surnameDisplay = student.surname;
            if (state.display.surnameInitial && student.surname) {
                surnameDisplay = student.surname.charAt(0) + '.';
            }
            var showHomeroom = state.display.homeroom;

            if (isDesk) {
                var cols = colCount || 6;
                if (state.display.limitWidth && cols < LIMIT_SEATS) cols = LIMIT_SEATS;
                var dynamicFontSize = Math.max(11, Math.min(20, Math.floor(110 / cols)));
                if (root.classList.contains('sp-projector')) dynamicFontSize = Math.round(dynamicFontSize * 1.6);

                var firstSpan = make('span', 'sp-first', student.firstName);
                firstSpan.style.fontSize = dynamicFontSize + 'px';

                var lastSpan = make('span', 'sp-last', surnameDisplay);
                lastSpan.style.fontSize = Math.max(10, dynamicFontSize - 2) + 'px';

                var nameHolder = card;
                if (state.display.oneLine) {
                    nameHolder = make('span', 'sp-name-line');
                    card.appendChild(nameHolder);
                }
                nameHolder.appendChild(firstSpan);
                nameHolder.appendChild(lastSpan);

                if ((showHomeroom && student.homeroom) || flags.sep || flags.pair || flags.front || flags.back || flags.empty || flags.left || flags.right) {
                    card.appendChild(buildBadges(student, flags, showHomeroom));
                }
            } else {
                card.appendChild(make('span', 'sp-side-name', student.firstName + ' ' + surnameDisplay));
            }
        }

        function createCard(student, isDesk, colCount) {
            var card = make('div', 'sp-card');
            card.dataset.sid = student.id;
            card.dataset.cols = colCount || 6;
            card.draggable = true;
            card.addEventListener('dragstart', function (e) {
                draggingId = student.id;
                e.dataTransfer.setData('text/plain', student.id);
                e.dataTransfer.effectAllowed = 'move';
            });
            card.addEventListener('dragend', function () { draggingId = null; });
            renderCard(card, student, isDesk, colCount);
            return card;
        }

        function cardFor(id) {
            return root.querySelector('.sp-card[data-sid="' + id + '"]');
        }

        function refreshCards() {
            Array.prototype.forEach.call(root.querySelectorAll('.sp-card'), function (card) {
                var s = studentById(card.dataset.sid);
                if (s) {
                    var desk = card.closest('.sp-desk');
                    var cols = desk ? parseInt(desk.dataset.cols, 10) : 6;
                    renderCard(card, s, !!desk, cols);
                }
            });
        }

        function updateCount() {
            var unassignedCount = ui.pool.querySelectorAll('.sp-card').length;
            ui.count.textContent = unassignedCount;

            var sidebar = root.querySelector('.sp-sidebar');
            if (sidebar) {
                if (unassignedCount === 0) {
                    sidebar.classList.add('sp-hidden');
                } else {
                    sidebar.classList.remove('sp-hidden');
                }
            }
        }

        /* ----- grid ----- */

        function getDesks() {
            return Array.prototype.slice.call(ui.grid.querySelectorAll('.sp-desk'));
        }

        function initGrid() {
            ui.grid.innerHTML = '';
            ui.grid.style.minWidth = (Math.max.apply(null, state.layout) * 72) + 'px';
            var n = 1;
            state.layout.forEach(function (cols, r) {
                var row = make('div', 'sp-row');
                row.dataset.cols = cols;
                for (var c = 0; c < cols; c++) {
                    var desk = make('div', 'sp-desk');
                    desk.dataset.row = r;
                    desk.dataset.col = c;
                    desk.dataset.cols = cols;
                    desk.appendChild(make('span', 'sp-desk-num', String(n)));
                    desk.addEventListener('dragover', onDeskDragOver);
                    desk.addEventListener('dragleave', onDeskDragLeave);
                    desk.addEventListener('drop', onDeskDrop);
                    row.appendChild(desk);
                    n++;
                }
                ui.grid.appendChild(row);
            });
            applyRowWidths();
        }

        /* Normally each row shares the full width. With Limit Desk Width, a row with
           fewer than 6 desks keeps 6-desk-row widths and is centred. The reference
           count can be changed in CSS with --sp-limit-seats. */
        function applyRowWidths() {
            Array.prototype.forEach.call(ui.grid.querySelectorAll('.sp-row'), function (row) {
                var cols = parseInt(row.dataset.cols, 10) || 6;
                if (state.display.limitWidth && cols < LIMIT_SEATS) {
                    var n = 'var(--sp-limit-seats, ' + LIMIT_SEATS + ')';
                    row.style.gridTemplateColumns = 'repeat(' + cols + ', calc((100% - (' + n +
                        ' - 1) * var(--sp-row-gap, 8px)) / ' + n + '))';
                    row.style.justifyContent = 'center';
                    row.classList.add('sp-row-limited');
                } else {
                    row.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
                    row.style.justifyContent = '';
                    row.classList.remove('sp-row-limited');
                }
            });
        }

        function pairGroupSize(id) {
            var seen = {}, stack = [id], n = 0;
            seen[id] = true;
            while (stack.length) {
                var cur = stack.pop();
                n++;
                state.rules.forEach(function (r) {
                    if (r.type !== 'PAIR') return;
                    var other = r.student1Id === cur ? r.student2Id : (r.student2Id === cur ? r.student1Id : null);
                    if (other && !seen[other]) { seen[other] = true; stack.push(other); }
                });
            }
            return n;
        }

        function validate() {
            var desks = getDesks();
            var lastRow = state.layout.length - 1;
            var seated = {};
            desks.forEach(function (d) {
                d.classList.remove('sp-conflict');
                var card = d.querySelector('.sp-card');
                if (card) seated[card.dataset.sid] = { desk: d, row: +d.dataset.row, col: +d.dataset.col, cols: +d.dataset.cols };
            });

            state.rules.forEach(function (rule) {
                var a = seated[rule.student1Id];
                if (!a) return;

                if (rule.type === 'FRONT_ROW' && a.row !== 0) {
                    a.desk.classList.add('sp-conflict');
                    return;
                }
                if (rule.type === 'BACK_ROW' && a.row !== lastRow) {
                    a.desk.classList.add('sp-conflict');
                    return;
                }
                if (rule.type === 'SIT_LEFT' && a.col !== 0) {
                    a.desk.classList.add('sp-conflict');
                    return;
                }
                if (rule.type === 'SIT_RIGHT' && a.col !== state.layout[a.row] - 1) {
                    a.desk.classList.add('sp-conflict');
                    return;
                }
                if (rule.type === 'EMPTY_SEAT') {
                    var hasEmptyAdjacent = desks.some(function (d) {
                        var dRow = +d.dataset.row;
                        var dCol = +d.dataset.col;
                        var isAdjacentSameRow = (dRow === a.row && Math.abs(dCol - a.col) === 1);
                        var isUnoccupied = !d.querySelector('.sp-card');
                        return isAdjacentSameRow && isUnoccupied;
                    });
                    if (!hasEmptyAdjacent) {
                        a.desk.classList.add('sp-conflict');
                    }
                    return;
                }

                var b = seated[rule.student2Id];
                if (!b) return;

                if (rule.type === 'SEPARATE' && adjacent(a, b)) {
                    a.desk.classList.add('sp-conflict');
                    b.desk.classList.add('sp-conflict');
                } else if (rule.type === 'PAIR' && !(pairGroupSize(rule.student1Id) > 2 ? isNextTo(a, b) : isSideBySidePair(a, b))) {
                    a.desk.classList.add('sp-conflict');
                    b.desk.classList.add('sp-conflict');
                }
            });
        }

        /* ----- drag and drop ----- */

        function onDeskDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('sp-drag-over'); }
        function onDeskDragLeave(e) { e.currentTarget.classList.remove('sp-drag-over'); }

        function onDeskDrop(e) {
            e.preventDefault();
            var target = e.currentTarget;
            target.classList.remove('sp-drag-over');
            var id = draggingId || e.dataTransfer.getData('text/plain');
            var dragged = cardFor(id);
            if (!dragged) return;
            var student = studentById(id);
            var source = dragged.parentElement;
            var existing = target.querySelector('.sp-card');
            if (existing === dragged) return;

            var targetCols = parseInt(target.dataset.cols, 10) || 6;

            if (existing) {
                var other = studentById(existing.dataset.sid);
                var sourceIsDesk = source.classList.contains('sp-desk');
                var sourceCols = sourceIsDesk ? (parseInt(source.dataset.cols, 10) || 6) : 6;
                if (other) renderCard(existing, other, sourceIsDesk, sourceCols);
                source.appendChild(existing);
                if (sourceIsDesk) source.classList.add('sp-occupied');
            } else if (source.classList.contains('sp-desk')) {
                source.classList.remove('sp-occupied');
            }

            if (student) renderCard(dragged, student, true, targetCols);
            target.classList.add('sp-occupied');
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
            if (parent.classList.contains('sp-desk')) parent.classList.remove('sp-occupied');
            var s = studentById(id);
            if (s) renderCard(card, s, false);
            ui.pool.appendChild(card);
            draggingId = null;
            validate();
            updateCount();
        }

        /* ----- seating actions ----- */

        function clearSeats() {
            setStatus('');
            initGrid();
            ui.pool.innerHTML = '';
            state.students.forEach(function (s) { ui.pool.appendChild(createCard(s, false)); });
            validate();
            updateCount();
        }

        function reverseSeating() {
            setStatus('');
            var desks = getDesks();

            var currentlySeated = [];
            desks.forEach(function (d) {
                var card = d.querySelector('.sp-card');
                if (card) {
                    var s = studentById(card.dataset.sid);
                    if (s) currentlySeated.push(s);
                }
            });

            if (!currentlySeated.length) return;

            var reversedSequence = currentlySeated.slice().reverse();

            initGrid();
            ui.pool.innerHTML = '';

            desks = getDesks();
            var capacity = desks.length;
            var byId = {};
            state.students.forEach(function (s) { byId[s.id] = s; });

            var solverResult = solveBest(desks, false);
            var placement = solverResult.assignment;
            var reservedDesks = solverResult.reservedDesks;
            var dropped = solverResult.dropped;

            var seatedByDesk = {}, seated = {};
            Object.keys(placement).forEach(function (id) {
                seatedByDesk[placement[id]] = byId[id];
                seated[id] = true;
            });

            var nextDeskIdx = 0;
            reversedSequence.forEach(function (s) {
                if (seated[s.id]) return;
                while (nextDeskIdx < capacity && (seatedByDesk[nextDeskIdx] || reservedDesks[nextDeskIdx])) {
                    nextDeskIdx++;
                }
                if (nextDeskIdx < capacity) {
                    seatedByDesk[nextDeskIdx] = s;
                    seated[s.id] = true;
                    nextDeskIdx++;
                }
            });

            state.students.forEach(function (s) {
                if (seated[s.id]) return;
                while (nextDeskIdx < capacity && (seatedByDesk[nextDeskIdx] || reservedDesks[nextDeskIdx])) {
                    nextDeskIdx++;
                }
                if (nextDeskIdx < capacity) {
                    seatedByDesk[nextDeskIdx] = s;
                    seated[s.id] = true;
                    nextDeskIdx++;
                }
            });

            desks.forEach(function (desk, idx) {
                var s = seatedByDesk[idx];
                if (!s) return;
                desk.classList.add('sp-occupied');
                var cols = parseInt(desk.dataset.cols, 10) || 6;
                desk.appendChild(createCard(s, true, cols));
            });

            state.students.forEach(function (s) {
                if (!seated[s.id]) {
                    ui.pool.appendChild(createCard(s, false));
                }
            });

            validate();
            updateCount();

            var unseatedRev = state.students.filter(function (s) { return !seated[s.id]; }).length;
            var revMsgs = [];
            if (dropped.length && !state.display.hideBadges) revMsgs.push(droppedMessage(dropped));
            if (unseatedRev) revMsgs.push(unseatedMessage(unseatedRev));
            if (revMsgs.length) setStatus('Seating reversed. ' + revMsgs.join(' '));
        }

        function unseatedMessage(n) {
            return n + (n === 1 ? ' student is' : ' students are') + ' still unseated: there are not enough desks ' +
                '(seats kept empty by rules use up desks too). Choose a larger layout or remove an empty-seat rule.';
        }

        function describeRule(r) {
            var a = studentById(r.student1Id), b = r.student2Id ? studentById(r.student2Id) : null;
            var an = a ? a.fullName : '?', bn = b ? b.fullName : '?';
            switch (r.type) {
                case 'SEPARATE': return an + ' apart from ' + bn;
                case 'PAIR': return an + ' with ' + bn;
                case 'FRONT_ROW': return an + ' in the front row';
                case 'BACK_ROW': return an + ' in the back row';
                case 'SIT_LEFT': return an + ' on the left';
                case 'SIT_RIGHT': return an + ' on the right';
                case 'EMPTY_SEAT': return an + ' with an empty seat beside them';
            }
            return an;
        }

        function droppedMessage(dropped) {
            return 'Not every rule could be satisfied at once, so these were left out (earlier rules take priority): ' +
                dropped.map(describeRule).join('; ') + '. Desks breaking a rule are highlighted red.';
        }

        function validRules() {
            var ignoreRules = state.display.ignoreRules;
            if (ignoreRules) return [];
            return state.rules.filter(function (r) {
                return studentById(r.student1Id) && (!r.student2Id || studentById(r.student2Id));
            });
        }

        function solve(deskSlots, randomise, rules) {
            var desks = deskSlots.map(function (d, i) { return { index: i, row: +d.dataset.row, col: +d.dataset.col }; });
            return solveSeating(desks, state.layout, rules, randomise, 60000);
        }

        function solveBest(deskSlots, randomise) {
            var all = validRules();
            if (!all.length) return { assignment: {}, reservedDesks: {}, dropped: [] };

            var res = solve(deskSlots, randomise, all);
            if (!res && randomise) res = solve(deskSlots, false, all);
            if (res) { res.dropped = []; return res; }

            var kept = [], dropped = [], best = { assignment: {}, reservedDesks: {} };
            all.forEach(function (rule) {
                var trial = kept.concat([rule]);
                var s = solve(deskSlots, false, trial);
                if (s) { kept = trial; best = s; } else dropped.push(rule);
            });
            best.dropped = dropped;
            return best;
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

            var desks = getDesks();
            if (state.fillFromLast) desks.reverse();
            var capacity = desks.length;

            var byId = {};
            state.students.forEach(function (s) { byId[s.id] = s; });

            var solverResult = solveBest(desks, mode === 'RANDOM');
            var placement = solverResult.assignment;
            var reservedDesks = solverResult.reservedDesks;
            var dropped = solverResult.dropped;

            var seatedByDesk = {}, seated = {};
            Object.keys(placement).forEach(function (id) {
                seatedByDesk[placement[id]] = byId[id];
                seated[id] = true;
            });

            var next = 0;
            list.forEach(function (s) {
                if (seated[s.id]) return;
                while (next < capacity && (seatedByDesk[next] || reservedDesks[next])) next++;
                if (next < capacity) { seatedByDesk[next] = s; seated[s.id] = true; next++; }
            });

            desks.forEach(function (desk, idx) {
                var s = seatedByDesk[idx];
                if (!s) return;
                desk.classList.add('sp-occupied');
                var cols = parseInt(desk.dataset.cols, 10) || 6;
                desk.appendChild(createCard(s, true, cols));
            });
            list.forEach(function (s) {
                if (!seated[s.id]) ui.pool.appendChild(createCard(s, false));
            });

            validate();
            updateCount();

            var unseated = list.filter(function (s) { return !seated[s.id]; }).length;
            var msgs = [];
            if (dropped.length && !state.display.hideBadges) msgs.push(droppedMessage(dropped));
            if (unseated) msgs.push(unseatedMessage(unseated));
            if (msgs.length) setStatus(msgs.join(' '));
        }

        function resetToPage() {
            if (!window.confirm('Reset this plan to the roster and rules written on the page? Your imported roster and rules will be removed.')) return;
            try { localStorage.removeItem(storageKey); } catch (e) { /* ignore */ }
            defaultsFromConfig();
            state.layout = cfg.layout.slice();
            state.fillFromLast = cfg.fill === 'last';
            if (ui.title) ui.title.textContent = state.title;
            syncDisplayControls();
            autoArrange(cfg.sort || 'DEFAULT');
        }

        /* ----- JSON export & import ----- */

        function exportJson() {
            var desks = getDesks();
            var placement = [];

            desks.forEach(function (d, idx) {
                var card = d.querySelector('.sp-card');
                if (card) {
                    placement.push({ deskIndex: idx, studentId: card.dataset.sid });
                }
            });

            var poolCards = ui.pool.querySelectorAll('.sp-card');
            Array.prototype.forEach.call(poolCards, function (card) {
                placement.push({ deskIndex: null, studentId: card.dataset.sid });
            });

            var currentTitle = ui.title ? ui.title.textContent.trim() : state.title;

            var payload = {
                title: currentTitle || 'Seating Plan',
                layout: state.layout,
                fillFromLast: state.fillFromLast,
                sortMode: state.sortMode,
                students: state.students,
                rules: state.rules,
                placement: placement
            };

            var json = JSON.stringify(payload, null, 2);
            var suggested = (currentTitle || 'seating_plan').toLowerCase().replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '') || 'seating_plan';
            saveJsonFile(json, suggested + '.json');
        }

        /* Chrome/Edge (https or localhost): a Save As box to choose the folder and name.
           Other browsers: ask for a file name, then download it as usual. */
        function saveJsonFile(json, suggestedName) {
            if (window.showSaveFilePicker) {
                window.showSaveFilePicker({
                    suggestedName: suggestedName,
                    types: [{ description: 'Seating plan (JSON)', accept: { 'application/json': ['.json'] } }]
                }).then(function (handle) {
                    return handle.createWritable().then(function (w) {
                        return w.write(json).then(function () { return w.close(); });
                    }).then(function () { setStatus('Saved ' + handle.name + '.'); });
                }).catch(function (err) {
                    if (err && err.name === 'AbortError') return;   // Cancel pressed
                    downloadJson(json, suggestedName, true);        // picker blocked: fall back
                });
                return;
            }
            downloadJson(json, suggestedName, true);
        }

        function downloadJson(json, suggestedName, ask) {
            var name = suggestedName;
            if (ask) {
                name = window.prompt('File name for the exported seating plan:', suggestedName);
                if (name == null) return;                            // Cancel pressed
                name = name.trim().replace(/[\\/:*?"<>|]+/g, '_') || suggestedName;
                if (!/\.json$/i.test(name)) name += '.json';
            }
            var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            var anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = name;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        }

        function onJsonFileChosen(e) {
            var file = e.target.files[0];
            if (!file) return;
            var input = e.target;
            var reader = new FileReader();
            reader.onerror = function () { setStatus('Could not read that JSON file.'); input.value = ''; };
            reader.onload = function (evt) {
                try {
                    var data = JSON.parse(evt.target.result);
                    if (!data || !Array.isArray(data.students) || !Array.isArray(data.layout)) {
                        throw new Error('Invalid seating plan JSON format.');
                    }
                    var layout = parseLayout(data.layout.join(','));
                    if (!layout) throw new Error('the layout in that file is not valid.');
                    var seenIds = {};
                    var students = data.students.filter(function (s) {
                        if (!s || s.id == null || seenIds[s.id]) return false;
                        seenIds[s.id] = true;
                        return true;
                    }).map(function (s, idx) {
                        var first = clean(s.firstName) || 'Student';
                        var surname = clean(s.surname) || String(idx + 1);
                        return { id: String(s.id), firstName: first, surname: surname,
                                 fullName: first + ' ' + surname, homeroom: clean(s.homeroom) };
                    });

                    if (data.title) {
                        state.title = data.title;
                        if (ui.title) ui.title.textContent = data.title;
                    }

                    state.layout = layout;
                    state.students = students;
                    state.rules = Array.isArray(data.rules) ? data.rules : [];
                    if (data.fillFromLast != null) state.fillFromLast = !!data.fillFromLast;
                    if (data.sortMode != null) state.sortMode = data.sortMode;

                    save();
                    updateToolbar();
                    initGrid();
                    ui.pool.innerHTML = '';

                    var desks = getDesks();
                    var byId = {};
                    state.students.forEach(function (s) { byId[s.id] = s; });

                    if (Array.isArray(data.placement) && data.placement.length) {
                        var placed = {};
                        data.placement.forEach(function (item) {
                            var s = item && byId[item.studentId];
                            if (!s || placed[s.id]) return;
                            placed[s.id] = true;
                            var d = item.deskIndex != null ? desks[item.deskIndex] : null;
                            if (d && !d.querySelector('.sp-card')) {
                                d.classList.add('sp-occupied');
                                var cols = parseInt(d.dataset.cols, 10) || 6;
                                d.appendChild(createCard(s, true, cols));
                            } else {
                                ui.pool.appendChild(createCard(s, false));
                            }
                        });
                        /* students missing from the placement list go to Unassigned */
                        state.students.forEach(function (s) {
                            if (!placed[s.id]) ui.pool.appendChild(createCard(s, false));
                        });
                    } else {
                        autoArrange(state.sortMode);
                        return;
                    }

                    validate();
                    updateCount();
                    setStatus('Successfully reimported title, layout, roster, rules, and seating order.');
                } catch (err) {
                    setStatus('Failed to import JSON: ' + (err.message || err));
                } finally {
                    input.value = '';
                }
            };
            reader.readAsText(file);
        }

        /* ----- import roster ----- */

        /* "8_Science_Period_3.xlsx" -> "8 Science Period 3" (extension dropped, _ as spaces) */
        function titleFromFileName(name) {
            return String(name || '').replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
        }

        function applyRows(rows, fileName) {
            if (state.students.length && state.rules.length) {
                if (!window.confirm('Importing a new class list will clear the existing seating rules. Continue?')) return;
            }
            var students = rowsToStudents(rows);
            if (!students.length) {
                setStatus('No students found in that file. It needs a header row with Preferred (or First Name), Surname (or Last Name) and optionally Homeroom.');
                return;
            }
            state.rules = [];
            state.students = students;
            var newTitle = titleFromFileName(fileName);
            if (newTitle) {
                state.title = newTitle;
                if (ui.title) ui.title.textContent = newTitle;
            }
            save();
            autoArrange(state.sortMode);
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

        /* ----- print ----- */

        function printPlan() {
            var title = (ui.title ? ui.title.textContent.trim() : state.title) || 'Seating Plan';
            var clone = ui.grid.cloneNode(true);
            Array.prototype.forEach.call(clone.querySelectorAll('.sp-badge-rule'), function (n) { n.parentNode.removeChild(n); });
            Array.prototype.forEach.call(clone.querySelectorAll('[class]'), function (n) {
                n.classList.remove('sp-conflict', 'sp-has-sep', 'sp-has-pair', 'sp-has-pos', 'sp-occupied', 'sp-drag-over');
                n.removeAttribute('draggable');
            });
            clone.style.minWidth = '0';
            var win = window.open('', '_blank');
            if (!win) { window.print(); return; }
            win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) +
                '</title><style>' + PRINT_CSS + '</style></head><body class="' +
                (state.display.oneLine ? 'sp-compact ' : '') + (state.display.teacherView ? 'sp-teacher-view' : '') +
                '"><h1>' + esc(title) + (state.display.teacherView ? ' <small>(teacher\'s view)</small>' : '') +
                '</h1><div class="sp-room"><div class="wb">FRONT OF CLASSROOM / WHITEBOARD</div>' +
                clone.outerHTML + '</div></body></html>');
            win.document.close();
            win.focus();
            setTimeout(function () { win.print(); }, 250);
        }

        /* ----- rules dialog ----- */

        function buildModal() {
            modal = make('div', 'sp-modal');
            modal.innerHTML =
                '<div class="sp-modal-card" role="dialog" aria-modal="true" aria-label="Seating rules">' +
                '<div class="sp-modal-head"><span>Student Seating Rules &amp; Constraints</span>' +
                '<button type="button" class="sp-modal-close" data-m="close" aria-label="Close">✕</button></div>' +
                '<div class="sp-modal-body">' +
                '<div class="sp-rule-form">' +
                '<div class="sp-c-s1"><select data-m="s1" aria-label="Select first student"></select></div>' +
                '<div class="sp-c-type"><select data-m="type" aria-label="Choose seating rule"></select></div>' +
                '<div class="sp-c-s2" data-m="s2wrap"><select data-m="s2" aria-label="Select second student"></select></div>' +
                '<button type="button" class="sp-btn sp-c-add" data-m="add">Add Rule</button>' +
                '</div>' +
                '<div class="sp-feedback" data-m="feedback" role="status" aria-live="polite"></div>' +
                '<div class="sp-modal-sub">Active Rules</div>' +
                '<div class="sp-rules-list" data-m="list"></div>' +
                '</div></div>';
            document.body.appendChild(modal);

            ['s1', 'type', 's2', 's2wrap', 'feedback', 'list'].forEach(function (k) {
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
            mui.type.addEventListener('change', updateTypeUI);
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') closeModal();
            });
        }

        function openModal() {
            fillTypes();
            fillStudent1();
            renderRules();
            feedback('');
            modal.classList.add('sp-open');
        }

        function closeModal() { if (modal) modal.classList.remove('sp-open'); }

        function feedback(msg, kind) {
            mui.feedback.textContent = msg || '';
            mui.feedback.className = 'sp-feedback' + (kind ? ' sp-' + kind : '');
        }

        function updateTypeUI() {
            mui.s2wrap.style.display = isSingleStudentRule(mui.type.value) ? 'none' : 'block';
        }

        function fillTypes() {
            var current = mui.type.value;
            mui.type.innerHTML = '';
            [
                ['SEPARATE', 'Must Separate From'],
                ['PAIR', 'Keep Together With'],
                ['FRONT_ROW', 'Must Sit In Front Row'],
                ['BACK_ROW', 'Must Sit In Back Row'],
                ['SIT_LEFT', 'Must Sit on Left Side'],
                ['SIT_RIGHT', 'Must Sit on Right Side'],
                ['EMPTY_SEAT', 'Must Have Empty Seat Next to Them']
            ].forEach(function (o) {
                var opt = make('option', null, o[1]);
                opt.value = o[0];
                mui.type.appendChild(opt);
            });
            if (current) mui.type.value = current;
            updateTypeUI();
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
            studentOptions(mui.s1, state.students.length ? 'Select Student 1...' : 'Import a class list first...', null);
            fillStudent2();
        }

        function fillStudent2() {
            var s1 = mui.s1.value;
            studentOptions(mui.s2, s1 ? 'Select Student 2...' : 'Select Student 1 first...', s1);
        }

        function newRule(s1, s2, type) {
            return {
                id: 'rule-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                student1Id: s1, student2Id: s2, type: type
            };
        }

        function afterRuleChange(msg) {
            save();
            renderRules();
            refreshCards();
            validate();
            feedback(msg, 'success');
        }

        function addRule() {
            var s1 = mui.s1.value, s2 = mui.s2.value, type = mui.type.value;

            if (isSingleStudentRule(type)) {
                if (!state.students.length) return feedback('Import a class list before adding rules.', 'error');
                if (!s1) return feedback('Please select a student.', 'error');
                if (state.rules.some(function (r) { return r.student1Id === s1 && r.type === type; }))
                    return feedback('That rule already exists.', 'error');

                var hasFront = state.rules.some(function (r) { return r.student1Id === s1 && r.type === 'FRONT_ROW'; });
                var hasBack = state.rules.some(function (r) { return r.student1Id === s1 && r.type === 'BACK_ROW'; });
                var hasLeft = state.rules.some(function (r) { return r.student1Id === s1 && r.type === 'SIT_LEFT'; });
                var hasRight = state.rules.some(function (r) { return r.student1Id === s1 && r.type === 'SIT_RIGHT'; });

                if ((type === 'FRONT_ROW' && hasBack) || (type === 'BACK_ROW' && hasFront)) {
                    return feedback('A student cannot be assigned to both front and back rows simultaneously.', 'error');
                }
                if ((type === 'SIT_LEFT' && hasRight) || (type === 'SIT_RIGHT' && hasLeft)) {
                    return feedback('A student cannot be assigned to both left and right sides simultaneously.', 'error');
                }

                state.rules.push(newRule(s1, null, type));
                return afterRuleChange('Rule added.');
            }

            if (state.students.length < 2) return feedback('Import a class list with at least two students before adding rules.', 'error');
            if (!s1 || !s2) return feedback('Please select both students.', 'error');
            if (s1 === s2) return feedback('Choose two different students.', 'error');

            var between = state.rules.filter(function (r) {
                return (r.student1Id === s1 && r.student2Id === s2) || (r.student1Id === s2 && r.student2Id === s1);
            });
            if (between.some(function (r) { return r.type === type; })) return feedback('That rule already exists.', 'error');
            if (between.length) return feedback('These students already have the opposite rule. Remove it first, then add the new rule.', 'error');

            state.rules.push(newRule(s1, s2, type));
            afterRuleChange('Rule added.');
            mui.s2.value = '';
        }

        function deleteRule(id) {
            state.rules = state.rules.filter(function (r) { return r.id !== id; });
            afterRuleChange('Rule removed.');
        }

        function renderRules() {
            mui.list.innerHTML = '';
            var shown = 0;
            state.rules.forEach(function (r) {
                var s1 = studentById(r.student1Id);
                if (!s1) return;
                var item = make('div'), label = make('span');
                function strong(t) { var s = make('strong', null, t); label.appendChild(s); }
                function text(t) { label.appendChild(document.createTextNode(t)); }

                if (isSingleStudentRule(r.type)) {
                    item.className = 'sp-rule-item sp-pos';
                    strong(s1.fullName);
                    if (r.type === 'FRONT_ROW') text(' ⬆ must sit in the front row');
                    else if (r.type === 'BACK_ROW') text(' ⬇ must sit in the back row');
                    else if (r.type === 'SIT_LEFT') text(' ⬅ must sit on the left side');
                    else if (r.type === 'SIT_RIGHT') text(' ➡ must sit on the right side');
                    else if (r.type === 'EMPTY_SEAT') text(' 🪑 must have an empty seat next to them');
                } else {
                    var s2 = studentById(r.student2Id);
                    if (!s2) return;
                    var sep = r.type === 'SEPARATE';
                    item.className = 'sp-rule-item ' + (sep ? 'sp-sep' : 'sp-pair');
                    strong(s1.fullName);
                    text(sep ? ' ⚠️ separate from ' : ' 🔗 keep with ');
                    strong(s2.fullName);
                }
                var del = make('button', 'sp-del-rule', '✕');
                del.type = 'button';
                del.setAttribute('data-del', r.id);
                del.setAttribute('aria-label', 'Remove rule');
                item.appendChild(label);
                item.appendChild(del);
                mui.list.appendChild(item);
                shown++;
            });
            if (!shown) {
                mui.list.appendChild(make('div', 'sp-rules-empty',
                    'No rules defined yet. Add a rule above to flag students who should sit apart, together, left, right, front/back, or leave an adjacent empty seat.'));
            }
        }

        /* ----- start ----- */

        defaultsFromConfig();
        load();
        build();
        buildModal();
        autoArrange(state.sortMode);
    }

    function init() {
        Array.prototype.forEach.call(document.querySelectorAll('.seatingplan[data-seatingplan]'), function (el) {
            if (el.getAttribute('data-sp-ready')) return;
            el.setAttribute('data-sp-ready', '1');
            try {
                new SeatingPlan(el, JSON.parse(el.getAttribute('data-seatingplan')));
            } catch (err) {
                if (window.console) console.error('seatingplan failed:', err);
                el.textContent = 'Seating plan failed to load: ' + (err && err.message ? err.message : err);
                el.style.padding = '12px';
                el.style.color = '#b91c1c';
            }
        });
    }

    init();
    document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('load', init);
})();