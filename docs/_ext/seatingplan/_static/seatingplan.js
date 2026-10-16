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
        { label: '14,14', rows: [14, 14] },
        /* [n] = n empty spaces, so desks line up into shapes */
        { label: 'HS 5x11', rows: ['4[3]4', '1[9]1', '4[3]4', '1[9]1', '5[1]5'] },
        { label: 'HS 5x10', rows: ['1[1]5[1]1', '1[8]1', '1[1]6[1]1', '1[8]1', 10] }
    ];
    /* Table mode. A layout is rows of tables, front row first; each table is '4', '6w'
       (6 seats, 3 wide x 2 deep) or '6d' (2 wide x 3 deep). Written as e.g. "6,4,6 / 4,6,4". */
    var TABLE_PRESETS = [
        { label: '7 tables of 4', text: '4,4,4 / 4,4,4,4' },
        { label: '8 tables of 4', text: '4,4,4,4 / 4,4,4,4' },
        { label: '6,4,6 / 4,6,4', text: '6,4,6 / 4,6,4' },
        { label: '5 tables of 6', text: '6,6,6 / 6,6' },
        { label: '5 tables of 6 deep', text: '6,6 / 6d,6d,6d' }
    ];
    var TABLE_SHAPES = { '4': { cols: 2, rows: 2 }, '6w': { cols: 3, rows: 2 }, '6d': { cols: 2, rows: 3 } };
    var DEFAULT_TABLES = '4,4,4,4 / 4,4,4,4';

    /* "6,4,6 / 4,6,4" or "2x3" (2 rows of 3 tables of 4) or "2x3 6d"; a list without "/"
       wraps every perRow tables. Returns rows of table codes, or null if not valid. */
    function parseTables(text, perRow) {
        var t = String(text || '').trim().toLowerCase().replace(/\u00d7/g, 'x').replace(/^tables?\s*:?\s*/, '');
        var rows = [];
        var m = t.match(/^(\d+)\s*x\s*(\d+)(?:\s+(4|6|6w|6d))?$/);
        if (m) {
            var code = m[3] === '6' ? '6w' : (m[3] || '4');
            for (var r = 0; r < +m[1]; r++) {
                var row = [];
                for (var c = 0; c < +m[2]; c++) row.push(code);
                rows.push(row);
            }
        } else {
            var parts = t.split('/');
            var bad = false;
            parts.forEach(function (part) {
                var row = part.split(/[,\s]+/).filter(Boolean).map(function (x) {
                    if (x === '6') return '6w';
                    if (!TABLE_SHAPES[x]) bad = true;
                    return x;
                });
                if (row.length) rows.push(row);
            });
            if (bad) return null;
            if (parts.length === 1 && rows.length === 1 && perRow > 0) {
                var all = rows[0];
                rows = [];
                for (var i = 0; i < all.length; i += perRow) rows.push(all.slice(i, i + perRow));
            }
        }
        if (!rows.length || rows.length > 8) return null;
        for (var k = 0; k < rows.length; k++) if (!rows[k].length || rows[k].length > 8) return null;
        return rows;
    }

    function tablesKey(rows) { return rows.map(function (r) { return r.join(','); }).join(' / '); }
    function tablesLabel(rows) { return tablesKey(rows).replace(/6w/g, '6'); }

    var OPPOSITE_PLACES = { FRONT_ROW: 'BACK_ROW', BACK_ROW: 'FRONT_ROW', SIT_LEFT: 'SIT_RIGHT', SIT_RIGHT: 'SIT_LEFT' };
    /* One colour per group (keep together and keep apart are numbered separately, as in the
       Rules panel). Avoids sky blue (plain desks), orange (keep apart) and red (rule broken). */
    var GROUP_COLOURS = [
        { fg: '#059669', bg: '#d1fae5' },   /* green */
        { fg: '#7c3aed', bg: '#ede9fe' },   /* purple */
        { fg: '#db2777', bg: '#fce7f3' },   /* pink */
        { fg: '#0e7490', bg: '#cffafe' },   /* teal */
        { fg: '#a16207', bg: '#fef9c3' },   /* gold */
        { fg: '#4338ca', bg: '#e0e7ff' },   /* indigo */
        { fg: '#4d7c0f', bg: '#ecfccb' },   /* lime */
        { fg: '#a21caf', bg: '#fae8ff' },   /* magenta */
        { fg: '#475569', bg: '#e2e8f0' },   /* slate */
        { fg: '#9f1239', bg: '#ffe4e6' }    /* rose */
    ];
    /* keep-apart groups start part-way along the list, so 🔗 1 and ⚠️ 1 differ */
    function groupColour(i, apart) { return GROUP_COLOURS[(i + (apart ? 5 : 0)) % GROUP_COLOURS.length]; }
    var LIMIT_SEATS = 6; /* Limit Desk Width: short rows use the desk width of a 6-desk row */
    var XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    var xlsxPromise = null;
    var HTML2CANVAS_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    var html2canvasPromise = null;
    var PNG_WIDTH = 1400;   /* px; landscape like the printout, saved at 2x for sharp text */

    var PRINT_CSS =
        '@page{size:landscape;margin:10mm}' +
        'body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#000}' +
        '.sp-page{break-after:page}.sp-page:last-child{break-after:auto}' +
        'h1{font-size:22px;margin:0 0 8px}' +
        '.wb{border:2px solid #000;text-align:center;padding:6px;font-weight:700;letter-spacing:1px;font-size:14px;margin-bottom:12px}' +
        '.sp-grid{display:flex;flex-direction:column;gap:12px}' +
        '.sp-row{display:grid;gap:10px}' +
        '.sp-gap{min-width:0}' +
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
        '.sp-teacher-view .sp-desk>*{direction:ltr}' +
        /* Tables */
        '.sp-grid-tables{gap:18px}' +
        '.sp-trow{display:flex;justify-content:center;gap:22px}' +
        '.sp-table{border:2px solid #000;border-radius:10px;padding:4px 6px 6px;min-width:0;direction:ltr}' +
        '.sp-table-label{font-size:11px;font-weight:700;text-align:center;margin-bottom:3px}' +
        '.sp-table-seats{display:grid;gap:6px}' +
        '.sp-teacher-view .sp-grid-tables{flex-direction:column-reverse}' +
        '.sp-teacher-view .sp-trow{direction:rtl}' +
        '.sp-teacher-view .sp-table-seats{transform:rotate(180deg)}' +
        '.sp-teacher-view .sp-table-seats>.sp-desk{transform:rotate(180deg)}';

    /* Student names must never be machine-translated (browser "Translate this page" turns
       surnames such as Le or Ang into "the"). translate="no" + class notranslate is honoured by
       Google Translate in Chrome, Edge's translator and Safari. */
    var NO_TRANSLATE_HTML = '<!doctype html><html lang="en" translate="no" class="notranslate"><head>' +
        '<meta charset="utf-8"><meta name="google" content="notranslate">';
    function noTranslate(el) {
        el.setAttribute('translate', 'no');
        el.classList.add('notranslate');
    }

    /* ---------------- helpers ---------------- */

    function make(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    /* A row is a number of desks (6) or desks and gaps: "[2]3[2]" = 2 empty spaces, 3 desks,
       2 empty spaces; "3[1]3" = an aisle in the middle. Gaps are floor space, not seats.
       Returns [{gap: bool, n}] or null. */
    var MAX_ROW_WIDTH = 24;
    function rowSegments(spec) {
        var s = String(spec).replace(/\s+/g, '');
        if (!/^(\[\d+\]|\d+)+$/.test(s)) return null;
        var segs = [], re = /\[(\d+)\]|(\d+)/g, m;
        while ((m = re.exec(s))) {
            var gap = m[1] != null, n = +(gap ? m[1] : m[2]);
            if (!n) continue;
            var last = segs[segs.length - 1];
            if (last && last.gap === gap) last.n += n; else segs.push({ gap: gap, n: n });
        }
        return segs;
    }
    function rowDesks(spec) {
        return (rowSegments(spec) || []).reduce(function (t, g) { return t + (g.gap ? 0 : g.n); }, 0);
    }
    function rowWidth(spec) {
        return (rowSegments(spec) || []).reduce(function (t, g) { return t + g.n; }, 0);
    }
    /* Canonical form: plain rows as numbers, rows with gaps as strings like "[2]3[2]". */
    function normaliseRow(spec) {
        var segs = rowSegments(spec);
        if (!segs) return null;
        if (segs.length === 1 && !segs[0].gap) return segs[0].n;
        return segs.map(function (g) { return g.gap ? '[' + g.n + ']' : String(g.n); }).join('');
    }

    /* "7,8,9,6" -> [7,8,9,6]; "5x6" -> five rows of 6; "[2]3[2],7" -> ['[2]3[2]', 7].
       Returns null if invalid. */
    function parseLayout(text) {
        var t = String(text || '').trim().toLowerCase().replace(/\u00d7/g, 'x');
        var rows, m = t.match(/^(\d+)\s*x\s*(\d+)$/);
        if (m) {
            rows = [];
            for (var i = 0; i < +m[1]; i++) rows.push(+m[2]);
        } else {
            if (!/^[\d,\s\[\]]+$/.test(t)) return null;
            /* rows are separated by commas; old layouts may use spaces ("7 8 9") */
            var parts = t.indexOf(',') !== -1 || /[\[\]]/.test(t) ? t.split(',') : t.split(/\s+/);
            rows = parts.map(function (p) { return p.trim(); }).filter(Boolean).map(normaliseRow);
        }
        if (!rows.length || rows.length > 12) return null;
        for (var j = 0; j < rows.length; j++) {
            if (rows[j] == null) return null;
            var d = rowDesks(rows[j]);
            if (!(d >= 1 && d <= 20) || rowWidth(rows[j]) > MAX_ROW_WIDTH) return null;
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

    /* blk: 2-desk block within the desk's run of desks (desks 1-2, 3-4 ... counted from the
       start of the run, so a gap restarts the count); seg: which run of desks in the row. */
    function isSideBySidePair(a, b) {
        if (a.row !== b.row || a.seg !== b.seg) return false;
        if (Math.abs(a.col - b.col) !== 1) return false;
        return a.blk === b.blk;
    }

    /* ---------------- room geometry ----------------
       The solver and the red-highlight check ask the room these questions, so rows of
       desks and tables use the same rules code.
         place(type, d)       FRONT_ROW / BACK_ROW / SIT_LEFT / SIT_RIGHT satisfied at desk d?
         near(a, b)           would two kept-apart students be too close?
         emptyBeside(a, e)    does desk e count as the empty seat beside a?
         together(n, a, b, s) may two members of a keep-together group of n sit at a and b?
                              (s = strict: a pair must use a 2-desk block)                    */

    /* Rows of desks. Desks: {row, col, seg, blk}; col counts gaps too, so desks either side
       of a gap are not neighbours. Left/right mean the row's first/last desk. */
    function rowsGeo(layout) {
        var lastRow = layout.length - 1;
        var ends = layout.map(function (spec) {
            var col = 0, first = null, last = null;
            rowSegments(spec).forEach(function (g) {
                if (!g.gap) { if (first == null) first = col; last = col + g.n - 1; }
                col += g.n;
            });
            return { first: first, last: last };
        });
        return {
            place: function (t, d) {
                if (t === 'FRONT_ROW') return d.row === 0;
                if (t === 'BACK_ROW') return d.row === lastRow;
                if (t === 'SIT_LEFT') return d.col === ends[d.row].first;
                if (t === 'SIT_RIGHT') return d.col === ends[d.row].last;
                return true;
            },
            near: adjacent,
            emptyBeside: function (a, e) { return a.row === e.row && Math.abs(a.col - e.col) === 1; },
            together: function (n, a, b, strict) {
                if (a.row !== b.row || a.seg !== b.seg) return false;
                var dc = Math.abs(a.col - b.col);
                if (n <= 2) return strict ? isSideBySidePair(a, b) : dc === 1;
                /* 4 must fill two whole 2-desk blocks (desks 1-4, 3-6, ...) */
                if (n === 4) return Math.abs(a.blk - b.blk) <= 1;
                return dc <= n - 1;   /* 3 (or more): a run of neighbouring desks */
            }
        };
    }

    /* Tables. Desks: {table, trow (row of tables), tpos (table's place in its row), tlast}. */
    function tablesGeo(lastTrow) {
        return {
            place: function (t, d) {
                if (t === 'FRONT_ROW') return d.trow === 0;
                if (t === 'BACK_ROW') return d.trow === lastTrow;
                if (t === 'SIT_LEFT') return d.tpos === 0;
                if (t === 'SIT_RIGHT') return d.tpos === d.tlast;
                return true;
            },
            near: function (a, b) { return a.table === b.table; },
            emptyBeside: function (a, e) { return a.table === e.table; },
            together: function (n, a, b) { return a.table === b.table; }
        };
    }

    /* ---------------- seating solver (pure: no DOM) ---------------- */
    /* Keep-together rules (PAIR) link students into groups; every two members of a group must
       satisfy geo.together. strictPairs: a pair must share a 2-desk block (desks 1-2, 3-4, ...);
       without it any two side-by-side desks will do. The arranger tries strict first. */
    function solveSeating(desks, geo, rules, randomise, maxNodes, strictPairs) {
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

        /* keep-together groups: every student linked by pair rules */
        var groupCount = 0;
        vars.forEach(function (v) {
            if (v.group != null) return;
            var members = [], stack = [v];
            v.group = ++groupCount;
            while (stack.length) {
                var cur = stack.pop();
                members.push(cur);
                Object.keys(cur.rel).forEach(function (oid) {
                    var o = vars[varIndex[oid]];
                    if (cur.rel[oid].pair && o.group == null) { o.group = v.group; stack.push(o); }
                });
            }
            members.forEach(function (m) { m.pairSize = members.length; });
        });

        if (vars.length > desks.length) return null;

        function unaryOk(v, d) {
            for (var i = 0; i < v.pos.length; i++) if (!geo.place(v.pos[i], d)) return false;
            return true;
        }

        function compatible(va, da, vb, db) {
            if (!va.owner && !vb.owner && va.pairSize > 1 && va.group === vb.group &&
                !geo.together(va.pairSize, da, db, strictPairs)) return false;
            var rel = va.rel[vb.id];
            if (!rel) return true;
            if (rel.empty) return geo.emptyBeside(va.owner ? db : da, va.owner ? da : db);
            if (rel.sep && rel.pair) return false;
            if (rel.sep && geo.near(da, db)) return false;
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
                if (desks[i].index !== d.index && !used[desks[i].index] && geo.near(d, desks[i])) n++;
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

    /* html2canvas draws a page into an image; loaded the first time Save PNG is pressed. */
    function loadHtml2canvas() {
        if (window.html2canvas) return Promise.resolve(window.html2canvas);
        if (!html2canvasPromise) {
            html2canvasPromise = new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = HTML2CANVAS_URL;
                s.onload = function () { resolve(window.html2canvas); };
                s.onerror = function () { html2canvasPromise = null; reject(new Error('Could not load the image maker. Check the internet connection.')); };
                document.head.appendChild(s);
            });
        }
        return html2canvasPromise;
    }

    /* Draw printable sections (as built by printSection) into a PNG blob. They are laid out
       in a hidden frame with the print styles, so the image matches the printout. */
    function sectionsToPng(sections) {
        return loadHtml2canvas().then(function (h2c) {
            var frame = document.createElement('iframe');
            frame.setAttribute('aria-hidden', 'true');
            frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;width:' + PNG_WIDTH + 'px;height:800px';
            document.body.appendChild(frame);
            var doc = frame.contentDocument;
            doc.open();
            doc.write(NO_TRANSLATE_HTML + '<style>' + PRINT_CSS +
                'body{background:#fff;padding:24px;box-sizing:border-box;width:' + PNG_WIDTH + 'px}' +
                '.sp-page+.sp-page{margin-top:40px;padding-top:24px;border-top:2px dashed #999}' +
                '</style></head><body>' +
                sections.map(function (sec) { return '<section class="sp-page ' + sec.classes + '">' + sec.html + '</section>'; }).join('') +
                '</body></html>');
            doc.close();
            frame.style.height = doc.body.scrollHeight + 'px';
            return h2c(doc.body, { backgroundColor: '#ffffff', scale: 2, logging: false, windowWidth: PNG_WIDTH })
                .then(function (canvas) {
                    return new Promise(function (resolve, reject) {
                        canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not make the image.')); }, 'image/png');
                    });
                })
                .then(function (blob) { frame.remove(); return blob; },
                      function (err) { frame.remove(); throw err; });
        });
    }

    function downloadBlob(blob, name) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function fileSlug(title, fallback) {
        return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
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
            mode: cfg.mode === 'tables' ? 'tables' : 'rows',
            tables: configTables(),
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
            teacherView: 'toggle-teacher-view',
            rowControls: 'toggle-row-controls'
        };
        var draggingId = null;
        var ui = {};
        var modal = null;
        var mui = {};

        /* ----- data ----- */

        function configTables() {
            return (cfg.tables && parseTables(tablesKey(cfg.tables))) || parseTables(DEFAULT_TABLES);
        }

        function displayFromConfig() {
            var d = cfg.display || {};
            return {
                surnameInitial: d.surnameInitial === true,
                homeroom: d.homeroom !== false,
                ignoreRules: d.ignoreRules === true,
                oneLine: d.oneLine === true,
                hideBadges: d.hideBadges === true,
                limitWidth: d.limitWidth === true,
                teacherView: d.teacherView === true,
                rowControls: d.rowControls !== false
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
                var rule = {
                    id: 'rule-cfg-' + i,
                    student1Id: 'student-' + r.a,
                    student2Id: r.b == null ? null : 'student-' + r.b,
                    type: r.type
                };
                if (r.g) rule.group = 'cfg-' + r.g;
                return rule;
            });
        }

        /* Everything Export JSON writes is also kept in the browser after every change,
           including which desk each student sits at, so reopening the page shows the plan
           exactly as it was left. */
        var persistReady = false;   /* false while the page is starting up or resetting */
        var savedPlacement = null;  /* seats read from storage at start-up */

        function save() {
            try {
                var currentTitle = ui.title ? ui.title.textContent.trim() : state.title;
                localStorage.setItem(storageKey, JSON.stringify({
                    title: currentTitle, students: state.students, rules: state.rules, display: state.display,
                    layout: state.layout, mode: state.mode, tables: state.tables,
                    sortMode: state.sortMode, fillFromLast: state.fillFromLast,
                    placement: ui.grid ? currentPlacement() : (savedPlacement || [])
                }));
            } catch (e) { /* storage blocked */ }
        }

        /* Seats changed (drag, sort, layout, import ...): keep them, unless still starting up. */
        function persistSeats() { if (persistReady) save(); }

        function load() {
            try {
                var raw = localStorage.getItem(storageKey);
                if (!raw) return false;
                var d = JSON.parse(raw);
                if (d && Array.isArray(d.students)) {
                    if (d.title) state.title = d.title;
                    state.students = d.students;
                    state.rules = Array.isArray(d.rules) ? d.rules : [];
                    if (Array.isArray(d.layout) && parseLayout(d.layout.join(','))) state.layout = parseLayout(d.layout.join(','));
                    if (Array.isArray(d.tables) && parseTables(tablesKey(d.tables))) state.tables = parseTables(tablesKey(d.tables));
                    if (d.mode === 'tables' || d.mode === 'rows') state.mode = d.mode;
                    if (typeof d.sortMode === 'string') state.sortMode = d.sortMode;
                    if (typeof d.fillFromLast === 'boolean') state.fillFromLast = d.fillFromLast;
                    if (Array.isArray(d.placement) && d.placement.length) savedPlacement = d.placement;
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
                esc(p.key || p.rows.join(',')) + '">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>' +
                esc(p.label) + '</button>';
        }

        /* Presets, plus the page's own layout and the current (custom or imported) layout
           when they are not presets. */
        function layoutButtons() {
            if (state.mode === 'tables') {
                var tb = TABLE_PRESETS.map(function (p) {
                    return { label: p.label, key: tablesKey(parseTables(p.text)) };
                });
                [state.tables, configTables()].forEach(function (rows) {
                    var key = tablesKey(rows);
                    if (!tb.some(function (p) { return p.key === key; })) tb.unshift({ label: tablesLabel(rows), key: key });
                });
                return tb;
            }
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

        /* Put the current layout in the Custom box so it can be tweaked and re-applied. */
        function layoutText() {
            return state.mode === 'tables' ? tablesLabel(state.tables) : state.layout.join(', ');
        }
        function showLayoutInBox() {
            ui['custom-layout'].value = layoutText();
            ui['custom-layout'].classList.remove('sp-invalid');
        }

        function applyCustomLayout() {
            var input = ui['custom-layout'];
            var tables = state.mode === 'tables';
            var rows = tables ? parseTables(input.value, cfg.tablesPerRow || 3) : parseLayout(input.value);
            if (!rows) {
                input.classList.add('sp-invalid');
                setStatus(tables
                    ? 'Tables layout not recognised. Type the seats at each table (4, 6 or 6d), commas between ' +
                      'tables and / between rows, front row first, e.g. 6,4,6 / 4,6,4. 2x3 means 2 rows of 3 tables ' +
                      'of 4; 2x3 6 uses tables of 6. Up to 8 rows of 8 tables.'
                    : 'Custom layout not recognised. Type desks per row, front row first, e.g. 7,8,9,6 ' +
                      '(or 5x6 for 5 rows of 6). Put empty spaces in brackets: [2]3[2] is 2 spaces, 3 desks, ' +
                      '2 spaces; 3[1]3 has an aisle. Up to 12 rows of 1–20 desks (24 places wide).');
                input.focus();
                return;
            }
            input.classList.remove('sp-invalid');
            if (tables) state.tables = rows; else state.layout = rows;
            showLayoutInBox();
            autoArrange(state.sortMode);
            save();
        }

        function setMode(mode) {
            if (mode === state.mode) return;
            state.mode = mode;
            showLayoutInBox();
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

                '<button type="button" class="sp-btn sp-btn-grey" data-action="revert" data-role="revert" disabled ' +
                'title="Nothing imported yet">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>' +
                'Revert</button>' +

                '<button type="button" class="sp-btn sp-btn-teal" data-action="print">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>' +
                'Print</button>' +

                '<button type="button" class="sp-btn sp-btn-teal" data-action="png" data-role="png" ' +
                'title="Save the printable plan as a picture (PNG)">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>' +
                'Save PNG</button>' +

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
                '<div class="sp-mode" role="group" aria-label="Room type">' +
                '<button type="button" class="sp-btn sp-btn-mode" data-action="mode" data-mode="rows">Rows</button>' +
                '<button type="button" class="sp-btn sp-btn-mode" data-action="mode" data-mode="tables">Tables</button>' +
                '</div>' +
                '</div>' +

                /* Row 3: Rows/Tables switch, layout presets and custom layout */
                '<div class="sp-toolbar-row">' +

                '<div class="sp-layouts" data-role="layouts">' +
                layoutButtons().map(layoutButtonHtml).join('') +
                '</div>' +
                '<div class="sp-custom-layout">' +
                '<input type="text" class="sp-custom-input" data-role="custom-layout" ' +
                'placeholder="Custom e.g. 7,8,9,6 or [2]3[2],7" aria-label="Custom layout: desks per row, front row first" ' +
                'title="Desks per row, front row first, separated by commas (e.g. 7,8,9,6). 5x6 also works. [n] = n empty spaces, e.g. [2]3[2] or 3[1]3.">' +
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
                '<label class="sp-checkbox-label" title="Show the Flip (⇄) and Swap (⇅) buttons beside each row">' +
                '<input type="checkbox" data-role="toggle-row-controls" class="sp-checkbox" checked>' +
                'Row Controls' +
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

            ['title', 'revert', 'layouts', 'custom-layout', 'fill', 'file', 'json-file', 'toggle-surname-initial', 'toggle-homeroom', 'toggle-ignore-rules', 'toggle-oneline', 'toggle-hide-badges', 'toggle-limit-width', 'toggle-teacher-view', 'toggle-row-controls', 'png', 'status', 'count', 'pool', 'grid'].forEach(function (r) {
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
                    if (key === 'rowControls' && !box.checked) cancelSwap();
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
                if (e.key === 'Escape') cancelSwap();
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
            root.classList.toggle('sp-hide-row-ctrl', !state.display.rowControls);
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
            var tables = state.mode === 'tables';
            Array.prototype.forEach.call(root.querySelectorAll('[data-action="mode"]'), function (b) {
                b.classList.toggle('sp-active', b.getAttribute('data-mode') === state.mode);
            });
            ui['custom-layout'].placeholder = tables ? 'Custom e.g. 6,4,6 / 4,6,4' : 'Custom e.g. 7,8,9,6 or [2]3[2],7';
            ui['custom-layout'].title = tables
                ? 'Seats per table (4, 6 or 6d), commas between tables, / between rows, front first. 2x3 = 2 rows of 3 tables of 4.'
                : 'Desks per row, front row first, separated by commas (e.g. 7,8,9,6). 5x6 also works. [n] = n empty spaces, e.g. [2]3[2] or 3[1]3.';
            var limitBox = ui['toggle-limit-width'];
            limitBox.disabled = tables;
            limitBox.parentNode.classList.toggle('sp-checkbox-off', tables);
            var rowCtrlBox = ui['toggle-row-controls'];
            rowCtrlBox.disabled = tables;
            rowCtrlBox.parentNode.classList.toggle('sp-checkbox-off', tables);
            renderLayoutButtons();
            var key = tables ? tablesKey(state.tables) : state.layout.join(',');
            Array.prototype.forEach.call(ui.layouts.querySelectorAll('[data-layout]'), function (b) {
                b.classList.toggle('sp-active', b.getAttribute('data-layout') === key);
            });
        }

        function onRootClick(e) {
            var t = e.target.closest('[data-action]');
            if (!t || !root.contains(t)) return;
            switch (t.getAttribute('data-action')) {
                case 'layout':
                    if (state.mode === 'tables') state.tables = parseTables(t.getAttribute('data-layout'));
                    else state.layout = parseLayout(t.getAttribute('data-layout')) || state.layout;
                    showLayoutInBox();
                    autoArrange(state.sortMode);
                    save();
                    break;
                case 'mode': setMode(t.getAttribute('data-mode')); break;
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
                case 'revert': revertToImport(); break;
                case 'print': printPlan(); break;
                case 'png': savePng(); break;
                case 'projector': enterProjector(); break;
                case 'projector-exit': exitProjector(); break;
                case 'row-flip': cancelSwap(); flipRow(+t.getAttribute('data-row')); break;
                case 'row-swap': onRowSwap(+t.getAttribute('data-row')); break;
                case 'row-shuffle': cancelSwap(); shuffleRow(+t.getAttribute('data-row')); break;
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
            /* keep together / keep apart: one badge per group, numbered and coloured as in Rules */
            (flags.pairGroups || []).forEach(function (g) {
                row.appendChild(groupBadge('sp-badge-pair', '🔗', g, 'Kept together: group '));
            });
            (flags.sepGroups || []).forEach(function (g) {
                row.appendChild(groupBadge('sp-badge-sep', '⚠️', g, 'Kept apart: group '));
            });
            if (flags.front) row.appendChild(make('span', 'sp-badge sp-badge-pos sp-badge-rule', '⬆ Front'));
            if (flags.back) row.appendChild(make('span', 'sp-badge sp-badge-pos sp-badge-rule', '⬇ Back'));
            if (flags.empty) row.appendChild(make('span', 'sp-badge sp-badge-pos sp-badge-rule', '🪑 Empty'));
            if (flags.left) row.appendChild(make('span', 'sp-badge sp-badge-pos sp-badge-rule', '⬅ Left'));
            if (flags.right) row.appendChild(make('span', 'sp-badge sp-badge-pos sp-badge-rule', '➡ Right'));

            if (row.children.length > 0) container.appendChild(row);
            return container;
        }

        function groupBadge(cls, icon, g, tip) {
            var c = groupColour(g, cls === 'sp-badge-sep');
            var b = make('span', 'sp-badge sp-badge-grp ' + cls + ' sp-badge-rule', icon + ' ' + (g + 1));
            b.title = tip + (g + 1);
            b.style.setProperty('--sp-grp-fg', c.fg);
            b.style.setProperty('--sp-grp-bg', c.bg);
            return b;
        }

        /* Which keep-together / keep-apart groups each student is in (group index as in Rules). */
        function groupMarks() {
            var marks = { pair: {}, sep: {} };
            ['PAIR', 'SEPARATE'].forEach(function (type) {
                var into = type === 'PAIR' ? marks.pair : marks.sep;
                groupsFor(type).forEach(function (g, i) {
                    g.ids.forEach(function (id) { (into[id] = into[id] || []).push(i); });
                });
            });
            return marks;
        }

        function renderCard(card, student, isDesk, colCount, marks) {
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
            } else {
                marks = marks || groupMarks();
                flags.pairGroups = marks.pair[student.id] || [];
                flags.sepGroups = marks.sep[student.id] || [];
            }
            card.classList.remove('sp-has-sep', 'sp-has-pair', 'sp-has-pos', 'sp-has-grp');
            card.style.removeProperty('--sp-grp-fg');
            card.style.removeProperty('--sp-grp-bg');
            /* a keep-together group colours the whole card, so the group stands out on the plan */
            if (flags.pairGroups && flags.pairGroups.length) {
                var gc = groupColour(flags.pairGroups[0]);
                card.classList.add('sp-has-grp');
                card.style.setProperty('--sp-grp-fg', gc.fg);
                card.style.setProperty('--sp-grp-bg', gc.bg);
            } else if (flags.sep) card.classList.add('sp-has-sep');
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
                if (state.display.limitWidth && state.mode !== 'tables' && cols < LIMIT_SEATS) cols = LIMIT_SEATS;
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
            var marks = groupMarks();
            Array.prototype.forEach.call(root.querySelectorAll('.sp-card'), function (card) {
                var s = studentById(card.dataset.sid);
                if (s) {
                    var desk = card.closest('.sp-desk');
                    var cols = desk ? parseInt(desk.dataset.cols, 10) : 6;
                    renderCard(card, s, !!desk, cols, marks);
                }
            });
        }

        function updateCount() {
            persistSeats();
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

        function newDesk(n) {
            var desk = make('div', 'sp-desk');
            desk.appendChild(make('span', 'sp-desk-num', String(n)));
            desk.addEventListener('dragover', onDeskDragOver);
            desk.addEventListener('dragleave', onDeskDragLeave);
            desk.addEventListener('drop', onDeskDrop);
            return desk;
        }

        /* Rows of tables, front row first; seats numbered table by table. */
        function initTables() {
            ui.grid.innerHTML = '';
            ui.grid.classList.add('sp-grid-tables');
            var widest = 0;   /* seats ~56px wide, plus each table's padding and the gaps */
            state.tables.forEach(function (row) {
                var w = row.reduce(function (sum, code) { return sum + TABLE_SHAPES[code].cols * 56 + 40; }, 0);
                widest = Math.max(widest, w);
            });
            ui.grid.style.minWidth = widest + 'px';
            var n = 1, tableNo = 0;
            state.tables.forEach(function (row, r) {
                var trow = make('div', 'sp-trow');
                var seatCols = row.reduce(function (sum, code) { return sum + TABLE_SHAPES[code].cols; }, 0);
                row.forEach(function (code, i) {
                    var shape = TABLE_SHAPES[code];
                    var table = make('div', 'sp-table sp-table-' + code);
                    table.style.flex = shape.cols + ' 1 0';
                    table.appendChild(make('div', 'sp-table-label', 'Table ' + (tableNo + 1)));
                    var seats = make('div', 'sp-table-seats');
                    seats.style.gridTemplateColumns = 'repeat(' + shape.cols + ', minmax(0, 1fr))';
                    for (var k = 0; k < shape.cols * shape.rows; k++) {
                        var desk = newDesk(n++);
                        desk.dataset.table = tableNo;
                        desk.dataset.trow = r;
                        desk.dataset.tpos = i;
                        desk.dataset.tlast = row.length - 1;
                        desk.dataset.row = r;
                        desk.dataset.col = k % shape.cols;
                        desk.dataset.cols = Math.max(seatCols, 6);   /* font size: like a row of this many desks */
                        seats.appendChild(desk);
                    }
                    table.appendChild(seats);
                    trow.appendChild(table);
                    tableNo++;
                });
                ui.grid.appendChild(trow);
            });
        }

        function initGrid() {
            if (state.mode === 'tables') { initTables(); return; }
            ui.grid.innerHTML = '';
            ui.grid.classList.remove('sp-grid-tables');
            ui.grid.style.minWidth = (Math.max.apply(null, state.layout.map(rowWidth)) * 72 + ROW_CTRL_WIDTH) + 'px';
            swapFrom = null;
            root.classList.remove('sp-swapping');
            var n = 1;
            state.layout.forEach(function (spec, r) {
                /* each row sits in a line with its Flip / Swap buttons on the left */
                var line = make('div', 'sp-rowline');
                line.dataset.row = r;
                line.appendChild(rowControls(r));
                var row = make('div', 'sp-row');
                var cols = rowWidth(spec);   /* desks + empty spaces */
                row.dataset.cols = cols;
                if (cols !== rowDesks(spec)) row.classList.add('sp-row-gaps');
                var c = 0, seg = 0;
                rowSegments(spec).forEach(function (g) {
                    if (g.gap) {
                        var gap = make('div', 'sp-gap');
                        gap.style.gridColumn = 'span ' + g.n;
                        gap.setAttribute('aria-hidden', 'true');
                        row.appendChild(gap);
                        c += g.n;
                        return;
                    }
                    for (var k = 0; k < g.n; k++, c++) {
                        var desk = newDesk(n++);
                        desk.dataset.row = r;
                        desk.dataset.col = c;
                        desk.dataset.seg = seg;
                        desk.dataset.blk = Math.floor(k / 2);
                        desk.dataset.cols = cols;
                        row.appendChild(desk);
                    }
                    seg++;
                });
                line.appendChild(row);
                ui.grid.appendChild(line);
            });
            applyRowWidths();
        }

        /* ----- row controls: flip a row end to end, swap two rows -----
           These move students only; the desks and layout stay as they are. */

        var ROW_CTRL_WIDTH = 92;   /* px beside each row for its buttons */
        var swapFrom = null;       /* row picked for a swap, waiting for the second row */

        function rowControls(r) {
            var ctrl = make('div', 'sp-row-ctrl');
            ctrl.innerHTML =
                '<span class="sp-row-label">Row ' + (r + 1) + '</span>' +
                '<span class="sp-row-btns">' +
                '<button type="button" class="sp-row-btn" data-action="row-flip" data-row="' + r + '" ' +
                'title="Flip row ' + (r + 1) + ' end to end" aria-label="Flip row ' + (r + 1) + ' end to end">⇄</button>' +
                '<button type="button" class="sp-row-btn sp-row-swap" data-action="row-swap" data-row="' + r + '" ' +
                'title="Swap row ' + (r + 1) + ' with another row" aria-label="Swap row ' + (r + 1) + ' with another row">⇅</button>' +
                '<button type="button" class="sp-row-btn" data-action="row-shuffle" data-row="' + r + '" ' +
                'title="Shuffle the students in row ' + (r + 1) + '" aria-label="Shuffle the students in row ' + (r + 1) + '">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l6.1 8.6c.7 1.1 2 1.7 3.3 1.7H22"/><path d="m18 14 4 4-4 4"/></svg>' +
                '</button>' +
                '</span>';
            return ctrl;
        }

        /* Desks in row r, left to right (students' view). */
        function desksInRow(r) {
            return Array.prototype.slice.call(ui.grid.querySelectorAll('.sp-desk[data-row="' + r + '"]'));
        }

        function cardsIn(desks) {
            return desks.map(function (d) { return d.querySelector('.sp-card'); });
        }

        /* Put cards (or null for an empty desk) onto desks, one each, in order. */
        function seatCards(desks, cards) {
            desks.forEach(function (d, i) {
                var c = cards[i] || null;
                d.classList.toggle('sp-occupied', !!c);
                if (!c) return;
                var s = studentById(c.dataset.sid);
                if (s) renderCard(c, s, true, parseInt(d.dataset.cols, 10) || 6);
                d.appendChild(c);
            });
        }

        function flipRow(r) {
            var desks = desksInRow(r);
            var cards = cardsIn(desks);
            if (!cards.some(Boolean)) return;
            cards.forEach(function (c) { if (c) c.remove(); });
            seatCards(desks, cards.reverse());
            setStatus('');
            validate();
            updateCount();
        }

        /* Shuffle the students in row r among the desks they already use (empty desks stay
           empty). Tries a number of random orders and keeps one that breaks the fewest rules,
           and never gives back the same order when another is possible. */
        function shuffleRow(r) {
            var desks = desksInRow(r).filter(function (d) { return d.querySelector('.sp-card'); });
            var cards = cardsIn(desks);
            if (cards.length < 2) return;
            function place(order) { order.forEach(function (c, i) { desks[i].appendChild(c); }); }
            function brokenRules() { validate(); return ui.grid.querySelectorAll('.sp-conflict').length; }
            var best = null, bestScore = Infinity;
            for (var t = 0; t < 80; t++) {
                var order = cards.slice();
                for (var i = order.length - 1; i > 0; i--) {
                    var j = Math.floor(Math.random() * (i + 1));
                    var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
                }
                if (order.every(function (c, k) { return c === cards[k]; })) continue;
                place(order);
                var score = brokenRules();
                if (score < bestScore) { best = order; bestScore = score; }
                if (score === 0) break;
            }
            place(best || cards);
            setStatus('');
            validate();
            updateCount();
        }

        /* Each student moves to the same desk position in the other row, so an empty desk
           stays where it was. If the rows have different numbers of desks, students who do
           not fit go to a free desk (in the row they were moving to first), then Unassigned. */
        function swapRows(a, b) {
            var da = desksInRow(a), db = desksInRow(b);
            var ca = cardsIn(da), cb = cardsIn(db);
            ca.concat(cb).forEach(function (c) { if (c) c.remove(); });
            var newA = da.map(function (_, i) { return cb[i] || null; });
            var newB = db.map(function (_, i) { return ca[i] || null; });
            var extraFromA = ca.slice(db.length).filter(Boolean);
            var extraFromB = cb.slice(da.length).filter(Boolean);
            function fillGaps(list, extras) {
                for (var i = 0; i < list.length && extras.length; i++) if (!list[i]) list[i] = extras.shift();
            }
            fillGaps(newB, extraFromA); fillGaps(newA, extraFromA);
            fillGaps(newA, extraFromB); fillGaps(newB, extraFromB);
            seatCards(da, newA);
            seatCards(db, newB);
            var left = extraFromA.concat(extraFromB);
            left.forEach(function (c) {
                var s = studentById(c.dataset.sid);
                if (s) renderCard(c, s, false);
                ui.pool.appendChild(c);
            });
            validate();
            updateCount();
            setStatus(left.length
                ? 'Swapped rows ' + (a + 1) + ' and ' + (b + 1) + '. ' + left.length +
                  (left.length === 1 ? ' student did' : ' students did') + ' not fit and moved to Unassigned.'
                : '');
        }

        function markSwap() {
            root.classList.toggle('sp-swapping', swapFrom != null);
            Array.prototype.forEach.call(ui.grid.querySelectorAll('.sp-rowline'), function (line) {
                line.classList.toggle('sp-swap-from', swapFrom != null && +line.dataset.row === swapFrom);
            });
        }

        function cancelSwap() {
            if (swapFrom == null) return;
            swapFrom = null;
            markSwap();
            setStatus('');
        }

        /* First ⇅ picks a row, second ⇅ (on another row) swaps; ⇅ on the same row or Esc cancels. */
        function onRowSwap(r) {
            if (swapFrom == null) {
                swapFrom = r;
                markSwap();
                setStatus('Swapping row ' + (r + 1) + ': press ⇅ on the row to swap it with ' +
                    '(or ⇅ on row ' + (r + 1) + ' again to cancel).');
                return;
            }
            if (swapFrom === r) { cancelSwap(); return; }
            var from = swapFrom;
            swapFrom = null;
            markSwap();
            swapRows(from, r);
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

        /* Where a desk is, for the rules: row/col for rows of desks, table data for tables. */
        function deskInfo(d, i) {
            var ds = d.dataset;
            return {
                index: i, row: +ds.row, col: +ds.col, seg: +ds.seg || 0, blk: +ds.blk || 0,
                table: ds.table != null ? +ds.table : null,
                trow: +ds.trow, tpos: +ds.tpos, tlast: +ds.tlast
            };
        }

        function roomGeo() {
            return state.mode === 'tables' ? tablesGeo(state.tables.length - 1) : rowsGeo(state.layout);
        }

        /* Red highlight on desks whose student breaks a rule. */
        function validate() {
            var desks = getDesks();
            var geo = roomGeo();
            var seated = {}, info = desks.map(deskInfo);
            desks.forEach(function (d, i) {
                d.classList.remove('sp-conflict');
                var card = d.querySelector('.sp-card');
                if (card) seated[card.dataset.sid] = { desk: d, at: info[i] };
            });
            function flag() { Array.prototype.forEach.call(arguments, function (x) { x.desk.classList.add('sp-conflict'); }); }

            state.rules.forEach(function (rule) {
                var a = seated[rule.student1Id];
                if (!a) return;
                if (OPPOSITE_PLACES[rule.type]) {
                    if (!geo.place(rule.type, a.at)) flag(a);
                    return;
                }
                if (rule.type === 'EMPTY_SEAT') {
                    var ok = desks.some(function (d, i) {
                        return d !== a.desk && !d.querySelector('.sp-card') && geo.emptyBeside(a.at, info[i]);
                    });
                    if (!ok) flag(a);
                    return;
                }
                var b = seated[rule.student2Id];
                if (b && rule.type === 'SEPARATE' && geo.near(a.at, b.at)) flag(a, b);
            });

            /* keep-together groups: checked as a whole once every member is seated */
            keepTogetherGroups().forEach(function (ids) {
                var members = ids.map(function (id) { return seated[id]; });
                if (members.some(function (m) { return !m; })) return;
                var ok = true;
                for (var x = 0; x < members.length && ok; x++) {
                    for (var y = x + 1; y < members.length && ok; y++) {
                        if (!geo.together(members.length, members[x].at, members[y].at, false)) ok = false;
                    }
                }
                if (!ok) flag.apply(null, members);
            });
        }

        /* Students linked by keep-together rules, as arrays of ids. */
        function keepTogetherGroups() {
            var adj = {};
            state.rules.forEach(function (r) {
                if (r.type !== 'PAIR' || !r.student2Id) return;
                if (!studentById(r.student1Id) || !studentById(r.student2Id)) return;
                (adj[r.student1Id] = adj[r.student1Id] || []).push(r.student2Id);
                (adj[r.student2Id] = adj[r.student2Id] || []).push(r.student1Id);
            });
            var seen = {}, groups = [];
            Object.keys(adj).forEach(function (start) {
                if (seen[start]) return;
                var ids = [], stack = [start];
                seen[start] = true;
                while (stack.length) {
                    var cur = stack.pop();
                    ids.push(cur);
                    adj[cur].forEach(function (o) { if (!seen[o]) { seen[o] = true; stack.push(o); } });
                }
                groups.push(ids);
            });
            return groups;
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

        function solve(deskSlots, randomise, rules, strictPairs) {
            var desks = deskSlots.map(deskInfo);
            return solveSeating(desks, roomGeo(), rules, randomise, 60000, strictPairs);
        }

        /* Pairs in a 2-desk block if possible, otherwise any two neighbouring desks. */
        function solvePreferBlocks(deskSlots, randomise, rules) {
            var hasPair = rules.some(function (r) { return r.type === 'PAIR'; });
            return (hasPair && solve(deskSlots, randomise, rules, true)) || solve(deskSlots, randomise, rules, false);
        }

        function solveBest(deskSlots, randomise) {
            var all = validRules();
            if (!all.length) return { assignment: {}, reservedDesks: {}, dropped: [] };

            var res = solvePreferBlocks(deskSlots, randomise, all);
            if (!res && randomise) res = solvePreferBlocks(deskSlots, false, all);
            if (res) { res.dropped = []; return res; }

            var kept = [], dropped = [], best = { assignment: {}, reservedDesks: {} };
            all.forEach(function (rule) {
                var trial = kept.concat([rule]);
                var s = solvePreferBlocks(deskSlots, false, trial);
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
            clearImportSnapshot();
            defaultsFromConfig();
            state.layout = cfg.layout.slice();
            state.mode = cfg.mode === 'tables' ? 'tables' : 'rows';
            state.tables = configTables();
            state.fillFromLast = cfg.fill === 'last';
            if (ui.title) ui.title.textContent = state.title;
            syncDisplayControls();
            persistReady = false;   /* the page's own plan: nothing to remember yet */
            autoArrange(cfg.sort || 'DEFAULT');
            persistReady = true;
        }

        /* ----- JSON export & import ----- */

        function exportJson() {
            var payload = planData();
            var json = JSON.stringify(payload, null, 2);
            var suggested = (payload.title || 'seating_plan').toLowerCase().replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '') || 'seating_plan';
            /* keep it in the browser too, as if it had just been imported: the page reopens
               like this, and Revert comes back to it */
            save();
            storeImportSnapshot('export', suggested + '.json', JSON.parse(json));
            saveJsonFile(json, suggested + '.json');
        }

        /* The whole plan as plain data: used by Export JSON. */
        /* Which desk each student is at (deskIndex null = Unassigned). */
        function currentPlacement() {
            var placement = [];
            getDesks().forEach(function (d, idx) {
                var card = d.querySelector('.sp-card');
                if (card) placement.push({ deskIndex: idx, studentId: card.dataset.sid });
            });
            Array.prototype.forEach.call(ui.pool.querySelectorAll('.sp-card'), function (card) {
                placement.push({ deskIndex: null, studentId: card.dataset.sid });
            });
            return placement;
        }

        function planData() {
            var placement = currentPlacement();

            var currentTitle = ui.title ? ui.title.textContent.trim() : state.title;

            var payload = {
                title: currentTitle || 'Seating Plan',
                mode: state.mode,
                layout: state.layout,
                tables: state.tables,
                fillFromLast: state.fillFromLast,
                sortMode: state.sortMode,
                students: state.students,
                rules: state.rules,
                display: state.display,
                placement: placement
            };
            return payload;
        }

        /* ----- Revert: back to the last imported JSON or roster ----- */

        var importKey = storageKey + ':imported';

        function readImportSnapshot() {
            try {
                var raw = localStorage.getItem(importKey);
                var snap = raw ? JSON.parse(raw) : null;
                return snap && snap.data ? snap : null;
            } catch (e) { return null; }
        }

        function storeImportSnapshot(kind, name, data) {
            try {
                localStorage.setItem(importKey, JSON.stringify({ kind: kind, name: name || '', data: data }));
            } catch (e) { /* storage blocked: Revert stays unavailable */ }
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
            ui.revert.title = snap
                ? 'Go back to ' + (snap.name || 'the imported file') + ' as it was ' + (snap.kind === 'export' ? 'exported' : 'imported')
                : 'Nothing imported yet';
        }

        function revertToImport() {
            var snap = readImportSnapshot();
            if (!snap) return;
            var how = snap.kind === 'export' ? 'exported' : 'imported';
            var what = snap.name || (snap.kind === 'roster' ? 'the imported class list' : 'the ' + how + ' JSON file');
            if (!window.confirm('Revert to ' + what + ' as it was ' + how + '? Changes made since then will be lost.')) return;
            try {
                applyPlanData(snap.data);
                save();
                setStatus('Reverted to ' + what + (snap.kind === 'roster'
                    ? ' in its original order.' : ' as ' + how + '.'));
            } catch (err) {
                setStatus('Could not revert: ' + (err.message || err));
            }
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

        /* Load a whole plan (from Import JSON or Revert). Throws before changing
           anything if the data is unusable. */
        function applyPlanData(data) {
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

            var tables = Array.isArray(data.tables) ? parseTables(tablesKey(data.tables)) : null;
            if (data.mode === 'tables' && !tables) throw new Error('the tables layout in that file is not valid.');

            state.layout = layout;
            if (tables) state.tables = tables;
            state.mode = data.mode === 'tables' ? 'tables' : 'rows';
            state.students = students;
            state.rules = Array.isArray(data.rules) ? data.rules : [];
            if (data.fillFromLast != null) state.fillFromLast = !!data.fillFromLast;
            if (data.sortMode != null) state.sortMode = data.sortMode;
            /* display options (Teacher's View, One-line Names ...); files from older
               versions have none, so the current options are kept */
            if (data.display && typeof data.display === 'object') {
                Object.keys(state.display).forEach(function (k) {
                    if (typeof data.display[k] === 'boolean') state.display[k] = data.display[k];
                });
            }
            syncDisplayControls();

            updateToolbar();

            if (!placeStudents(data.placement)) autoArrange(state.sortMode);
        }

        /* Put students on the desks listed in placement; false if there is no placement. */
        function placeStudents(placement) {
            initGrid();
            ui.pool.innerHTML = '';
            var desks = getDesks();
            var byId = {};
            state.students.forEach(function (s) { byId[s.id] = s; });

            if (Array.isArray(placement) && placement.length) {
                var placed = {};
                placement.forEach(function (item) {
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
                return false;
            }

            validate();
            updateCount();
            return true;
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
                    applyPlanData(data);
                    save();
                    storeImportSnapshot('json', file.name, data);
                    setStatus('Successfully reimported title, layout, roster, rules, display options and seating order.');
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
            /* Revert puts the class back in the file's own order */
            storeImportSnapshot('roster', fileName, {
                title: state.title, layout: state.layout.slice(), mode: state.mode, tables: state.tables,
                fillFromLast: state.fillFromLast,
                sortMode: 'DEFAULT', students: students, rules: [], placement: []
            });
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

        /* The printable copy of this plan: title, CSS classes and the desk grid. */
        function printSection() {
            var title = (ui.title ? ui.title.textContent.trim() : state.title) || 'Seating Plan';
            var clone = ui.grid.cloneNode(true);
            Array.prototype.forEach.call(clone.querySelectorAll('.sp-badge-rule'), function (n) { n.parentNode.removeChild(n); });
            /* no row buttons on paper: each row goes back to being a direct child of the grid */
            Array.prototype.forEach.call(clone.querySelectorAll('.sp-rowline'), function (line) {
                var row = line.querySelector('.sp-row');
                if (row) line.parentNode.replaceChild(row, line); else line.parentNode.removeChild(line);
            });
            Array.prototype.forEach.call(clone.querySelectorAll('[class]'), function (n) {
                n.classList.remove('sp-conflict', 'sp-has-sep', 'sp-has-pair', 'sp-has-pos', 'sp-has-grp', 'sp-occupied', 'sp-drag-over');
                n.removeAttribute('draggable');
            });
            clone.style.minWidth = '0';
            return {
                title: title,
                empty: !state.students.length,
                classes: (state.display.oneLine ? 'sp-compact ' : '') + (state.display.teacherView ? 'sp-teacher-view' : ''),
                html: '<h1>' + esc(title) + (state.display.teacherView ? ' <small>(teacher\'s view)</small>' : '') +
                    '</h1><div class="sp-room"><div class="wb">FRONT OF CLASSROOM / WHITEBOARD</div>' +
                    clone.outerHTML + '</div>'
            };
        }
        /* used by the seatingplan-print button to print every plan on the page */
        root.spPrintSection = printSection;

        function printPlan() {
            var sec = printSection();
            openPrintWindow(sec.title, [sec]);
        }

        /* Save PNG: the printable plan as a picture, e.g. to paste into an email or slide. */
        function savePng() {
            var sec = printSection();
            var btn = ui.png;
            btn.disabled = true;
            setStatus('Making the picture…');
            sectionsToPng([sec]).then(function (blob) {
                var name = fileSlug(sec.title, 'seating_plan') + '.png';
                downloadBlob(blob, name);
                setStatus('Saved ' + name + ' (check your Downloads folder).');
            }).catch(function (err) {
                setStatus('Could not save the picture: ' + (err && err.message ? err.message : err));
            }).then(function () { btn.disabled = false; });
        }

        /* ----- rules panel -----
           Pick a rule from the dropdown, then tick the students it applies to.
           One-student rules (front/back/left/right/empty) are plain ticks.
           Keep together / Keep apart are groups: a keep-together group of 2-3 is stored as a
           chain of PAIR rules, a keep-apart group of any size as SEPARATE rules between every
           two members. Rules made here carry a `group` id so they show (and edit) as one group;
           rules from the directive or older saves are grouped automatically. */

        var RULE_KINDS = [
            { type: 'FRONT_ROW', icon: '⬆', label: 'Front row', help: 'Ticked students must sit in the front row.' },
            { type: 'BACK_ROW', icon: '⬇', label: 'Back row', help: 'Ticked students must sit in the back row.' },
            { type: 'SIT_LEFT', icon: '⬅', label: 'Left side', help: 'Ticked students must sit at the left end of a row (students\' left, facing the whiteboard).' },
            { type: 'SIT_RIGHT', icon: '➡', label: 'Right side', help: 'Ticked students must sit at the right end of a row (students\' right, facing the whiteboard).' },
            { type: 'EMPTY_SEAT', icon: '🪑', label: 'Empty seat beside', help: 'Ticked students get an empty desk next to them.' },
            { type: 'PAIR', icon: '🔗', label: 'Keep together', group: true, max: 4,
              help: 'Students in a group sit side by side in a row: 2 as a pair, 3 on neighbouring desks, 4 on desks 1–4, 3–6, 5–8 …' },
            { type: 'SEPARATE', icon: '⚠️', label: 'Keep apart', group: true,
              help: 'No two students in a group sit next to each other, including diagonally.' }
        ];
        var OPPOSITE = { FRONT_ROW: 'BACK_ROW', BACK_ROW: 'FRONT_ROW', SIT_LEFT: 'SIT_RIGHT', SIT_RIGHT: 'SIT_LEFT' };
        var panel = { kind: 'FRONT_ROW', search: '', onlyTicked: false, editing: null, picked: {} };

        /* In table mode the rules mean tables rather than rows of desks. */
        var TABLE_HELP = {
            FRONT_ROW: 'Ticked students must sit at a table in the front row of tables.',
            BACK_ROW: 'Ticked students must sit at a table in the back row of tables.',
            SIT_LEFT: 'Ticked students must sit at the left-hand table of a row (students\' left, facing the whiteboard).',
            SIT_RIGHT: 'Ticked students must sit at the right-hand table of a row (students\' right, facing the whiteboard).',
            EMPTY_SEAT: 'Ticked students get an empty seat at their table.',
            PAIR: 'Students in a group sit at the same table.',
            SEPARATE: 'Students in a group sit at different tables.'
        };

        function helpFor(kind) {
            return state.mode === 'tables' ? TABLE_HELP[kind.type] : kind.help;
        }

        /* Largest keep-together group: 4 in rows, the biggest table in table mode. */
        function maxFor(kind) {
            if (kind.type !== 'PAIR') return kind.max;
            if (state.mode !== 'tables') return 4;
            var most = 0;
            state.tables.forEach(function (row) {
                row.forEach(function (code) { most = Math.max(most, TABLE_SHAPES[code].cols * TABLE_SHAPES[code].rows); });
            });
            return most;
        }

        function kindInfo(type) {
            for (var i = 0; i < RULE_KINDS.length; i++) if (RULE_KINDS[i].type === type) return RULE_KINDS[i];
            return null;
        }

        function nameOf(id) { var s = studentById(id); return s ? s.fullName : '?'; }

        function sortedStudents() {
            return state.students.slice().sort(function (a, b) {
                return String(a.surname).localeCompare(String(b.surname)) ||
                       String(a.firstName).localeCompare(String(b.firstName));
            });
        }

        function hasSingle(id, type) {
            return state.rules.some(function (r) { return r.type === type && r.student1Id === id; });
        }

        function linked(a, b, type) {
            return state.rules.some(function (r) {
                return r.type === type && ((r.student1Id === a && r.student2Id === b) || (r.student1Id === b && r.student2Id === a));
            });
        }

        /* Groups for a two-student rule type, as [{ key, ids, ruleIds }]. */
        function groupsFor(type) {
            var rules = state.rules.filter(function (r) {
                return r.type === type && r.student2Id && studentById(r.student1Id) && studentById(r.student2Id);
            });
            var groups = [];
            if (type === 'PAIR') {
                /* keep together: students linked by pair rules form one group */
                var seen = {};
                rules.forEach(function (r) {
                    if (seen[r.student1Id]) return;
                    var ids = [], stack = [r.student1Id], ruleIds = {};
                    seen[r.student1Id] = true;
                    while (stack.length) {
                        var cur = stack.pop();
                        ids.push(cur);
                        rules.forEach(function (x) {
                            var other = x.student1Id === cur ? x.student2Id : (x.student2Id === cur ? x.student1Id : null);
                            if (!other) return;
                            ruleIds[x.id] = true;
                            if (!seen[other]) { seen[other] = true; stack.push(other); }
                        });
                    }
                    groups.push({ key: 'c-' + ids.slice().sort().join('|'), ids: ids, ruleIds: Object.keys(ruleIds) });
                });
            } else {
                /* keep apart: rules sharing a group id are one group; others are pairs */
                var byKey = {};
                rules.forEach(function (r) {
                    var key = r.group || ('r-' + r.id);
                    if (!byKey[key]) { byKey[key] = { key: key, ids: [], ruleIds: [] }; groups.push(byKey[key]); }
                    var g = byKey[key];
                    g.ruleIds.push(r.id);
                    [r.student1Id, r.student2Id].forEach(function (id) { if (g.ids.indexOf(id) === -1) g.ids.push(id); });
                });
            }
            groups.forEach(function (g) {
                g.ids.sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b)); });
            });
            return groups;
        }

        /* Front-row and back-row students can never sit side by side. */
        function rowsClash(a, b) {
            return (hasSingle(a, 'FRONT_ROW') && hasSingle(b, 'BACK_ROW')) ||
                   (hasSingle(a, 'BACK_ROW') && hasSingle(b, 'FRONT_ROW'));
        }

        function togetherWith(id) {
            var g = groupsFor('PAIR').filter(function (x) { return x.ids.indexOf(id) !== -1; })[0];
            return g ? g.ids.filter(function (x) { return x !== id; }) : [];
        }

        function countFor(kind) {
            if (kind.group) return groupsFor(kind.type).length;
            return state.students.filter(function (s) { return hasSingle(s.id, kind.type); }).length;
        }

        function buildModal() {
            modal = make('div', 'sp-modal');
            noTranslate(modal);
            modal.innerHTML =
                '<div class="sp-modal-card sp-rp" role="dialog" aria-modal="true" aria-label="Seating rules">' +
                '<div class="sp-modal-head"><span>Seating Rules</span>' +
                '<button type="button" class="sp-modal-close" data-m="close" aria-label="Close">✕</button></div>' +
                '<div class="sp-rp-top">' +
                '<label class="sp-rp-label">Rule <select data-m="kind" aria-label="Rule"></select></label>' +
                '<div class="sp-rp-help" data-m="help"></div>' +
                '</div>' +
                '<div class="sp-modal-body" data-m="body"></div>' +
                '<div class="sp-rp-foot" data-m="foot"></div>' +
                '</div>';
            document.body.appendChild(modal);
            ['kind', 'help', 'body', 'foot'].forEach(function (k) { mui[k] = modal.querySelector('[data-m="' + k + '"]'); });

            modal.addEventListener('click', onPanelClick);
            modal.addEventListener('change', onPanelChange);
            modal.addEventListener('input', function (e) {
                if (e.target.getAttribute('data-m') !== 'search') return;
                panel.search = e.target.value;
                filterList();
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && modal.classList.contains('sp-open')) closeModal();
            });
        }

        function openModal() {
            panel.editing = null;
            panel.search = '';
            panel.onlyTicked = false;
            renderPanel();
            modal.classList.add('sp-open');
        }

        function closeModal() { if (modal) modal.classList.remove('sp-open'); }

        function fillKinds() {
            mui.kind.innerHTML = '';
            RULE_KINDS.forEach(function (k) {
                var n = countFor(k);
                var opt = make('option', null, k.icon + ' ' + k.label + ' (' + n + (k.group ? (n === 1 ? ' group' : ' groups') : '') + ')');
                opt.value = k.type;
                mui.kind.appendChild(opt);
            });
            mui.kind.value = panel.kind;
        }

        function renderPanel() {
            fillKinds();
            var kind = kindInfo(panel.kind);
            mui.help.textContent = helpFor(kind);
            mui.body.innerHTML = '';
            mui.foot.innerHTML = '';
            if (!state.students.length) {
                mui.body.appendChild(make('div', 'sp-rp-empty', 'Import a class list first, then add rules here.'));
                mui.foot.innerHTML = '<span></span><button type="button" class="sp-btn" data-m="close">Done</button>';
                return;
            }
            if (kind.group) renderGroups(kind); else renderSingle(kind);
        }

        /* --- one-student rules --- */

        function searchRow(showTickedFilter) {
            return '<div class="sp-rp-tools">' +
                '<input type="search" class="sp-rp-search" data-m="search" placeholder="Search students" aria-label="Search students" value="' + esc(panel.search) + '">' +
                (showTickedFilter
                    ? '<label class="sp-rp-filter"><input type="checkbox" data-m="only-ticked"' + (panel.onlyTicked ? ' checked' : '') + '> Ticked only</label>'
                    : '') +
                '</div>';
        }

        function studentRow(s, checked, note, disabled) {
            var row = make('label', 'sp-rp-row' + (disabled ? ' sp-rp-disabled' : '') + (checked ? ' sp-rp-on' : ''));
            row.dataset.name = (s.fullName + ' ' + (s.homeroom || '')).toLowerCase();
            var box = make('input');
            box.type = 'checkbox';
            box.value = s.id;
            box.checked = checked;
            box.disabled = disabled;
            row.appendChild(box);
            row.appendChild(make('span', 'sp-rp-name', s.firstName + ' ' + s.surname));
            if (s.homeroom) row.appendChild(make('span', 'sp-rp-hr', s.homeroom));
            if (note) row.appendChild(make('span', 'sp-rp-note', note));
            return row;
        }

        function renderSingle(kind) {
            mui.body.innerHTML = searchRow(true);
            var list = make('div', 'sp-rp-list');
            list.setAttribute('data-m', 'list');
            list.setAttribute('data-single', kind.type);
            var opp = OPPOSITE[kind.type];
            sortedStudents().forEach(function (s) {
                var on = hasSingle(s.id, kind.type);
                var note = '';
                if (!on && opp && hasSingle(s.id, opp)) {
                    note = kindInfo(opp).icon + ' in ' + kindInfo(opp).label;
                } else if (!on && (kind.type === 'FRONT_ROW' || kind.type === 'BACK_ROW')) {
                    var partner = togetherWith(s.id).filter(function (id) { return hasSingle(id, opp); })[0];
                    if (partner) note = '🔗 kept with ' + studentById(partner).firstName + ' (' + kindInfo(opp).label.toLowerCase() + ')';
                }
                list.appendChild(studentRow(s, on, note, !!note));
            });
            mui.body.appendChild(list);
            filterList();
            var n = countFor(kind);
            mui.foot.innerHTML =
                '<span class="sp-rp-count">' + n + (n === 1 ? ' student' : ' students') + ' in ' + esc(kind.label) + '</span>' +
                '<span><button type="button" class="sp-btn sp-btn-grey" data-m="clear-all"' + (n ? '' : ' disabled') + '>Clear all</button> ' +
                '<button type="button" class="sp-btn" data-m="close">Done</button></span>';
        }

        function toggleSingle(id, type, on) {
            state.rules = state.rules.filter(function (r) { return !(r.type === type && r.student1Id === id); });
            if (on) state.rules.push(newRule(id, null, type));
            afterRuleChange();
        }

        /* --- keep together / keep apart groups --- */

        function renderGroups(kind) {
            var groups = groupsFor(kind.type);
            if (panel.editing) { renderGroupEditor(kind, groups); return; }
            var wrap = make('div', 'sp-rp-groups');
            if (!groups.length) {
                wrap.appendChild(make('div', 'sp-rp-empty', 'No ' + kind.label.toLowerCase() + ' groups yet.'));
            }
            groups.forEach(function (g, i) {
                var item = make('div', 'sp-rp-group ' + (kind.type === 'PAIR' ? 'sp-pair' : 'sp-sep'));
                var gc = groupColour(i, kind.type !== 'PAIR');
                item.style.setProperty('--sp-grp-fg', gc.fg);
                item.style.setProperty('--sp-grp-bg', gc.bg);
                item.appendChild(make('span', 'sp-badge sp-badge-grp ' + (kind.type === 'PAIR' ? 'sp-badge-pair' : 'sp-badge-sep'),
                    (kind.type === 'PAIR' ? '🔗 ' : '⚠️ ') + (i + 1)));
                var label = make('div', 'sp-rp-group-names');
                label.appendChild(make('strong', null, 'Group ' + (i + 1) + '  '));
                label.appendChild(document.createTextNode(g.ids.map(nameOf).join(' · ')));
                item.appendChild(label);
                var btns = make('span', 'sp-rp-group-btns');
                var ed = make('button', 'sp-btn sp-btn-grey sp-rp-small', 'Edit');
                ed.type = 'button'; ed.setAttribute('data-m', 'edit-group'); ed.setAttribute('data-key', g.key);
                var del = make('button', 'sp-del-rule', '🗑');
                del.type = 'button'; del.setAttribute('data-m', 'delete-group'); del.setAttribute('data-key', g.key);
                del.setAttribute('aria-label', 'Delete group ' + (i + 1));
                btns.appendChild(ed); btns.appendChild(del);
                item.appendChild(btns);
                wrap.appendChild(item);
            });
            mui.body.appendChild(wrap);
            mui.foot.innerHTML =
                '<button type="button" class="sp-btn sp-btn-teal" data-m="new-group">+ New group</button>' +
                '<button type="button" class="sp-btn" data-m="close">Done</button>';
        }

        function renderGroupEditor(kind, groups) {
            var editing = panel.editing;
            var own = editing.key ? groups.filter(function (g) { return g.key === editing.key; })[0] : null;
            var ownIds = own ? own.ids : [];
            var pickedIds = Object.keys(panel.picked).filter(function (id) { return panel.picked[id]; });
            var max = maxFor(kind);
            var full = max && pickedIds.length >= max;

            mui.body.innerHTML =
                '<div class="sp-rp-edit-title">' + (own ? 'Edit group' : 'New group') + ' — tick ' +
                (max ? '2 to ' + max + ' students' : '2 or more students') + '</div>' + searchRow(false);
            var list = make('div', 'sp-rp-list');
            list.setAttribute('data-m', 'list');
            list.setAttribute('data-group', kind.type);
            sortedStudents().forEach(function (s) {
                var on = !!panel.picked[s.id];
                var note = '', blocked = false;
                if (!on) {
                    var other = kind.type === 'PAIR' ? 'SEPARATE' : 'PAIR';
                    var clashWith = pickedIds.filter(function (id) { return linked(s.id, id, other); })[0];
                    var rowClash = kind.type === 'PAIR' && pickedIds.filter(function (id) { return rowsClash(s.id, id); })[0];
                    if (clashWith) {
                        blocked = true;
                        note = (other === 'SEPARATE' ? '⚠️ kept apart from ' : '🔗 kept together with ') + studentById(clashWith).firstName;
                    } else if (rowClash) {
                        blocked = true;
                        note = (hasSingle(s.id, 'FRONT_ROW') ? '⬆ front row, ' : '⬇ back row, ') +
                               studentById(rowClash).firstName + (hasSingle(s.id, 'FRONT_ROW') ? ' back' : ' front');
                    } else if (kind.type === 'PAIR') {
                        var inGroup = groups.filter(function (g) {
                            return g.ids.indexOf(s.id) !== -1 && g.ids.join() !== ownIds.join();
                        })[0];
                        if (inGroup) { blocked = true; note = '🔗 already in group ' + (groups.indexOf(inGroup) + 1); }
                        else if (full) { blocked = true; }
                    }
                }
                list.appendChild(studentRow(s, on, note, blocked));
            });
            mui.body.appendChild(list);
            filterList();
            var n = pickedIds.length;
            mui.foot.innerHTML =
                '<span class="sp-rp-count">' + n + ' ticked' + (full ? ' (most allowed)' : '') + '</span>' +
                '<span><button type="button" class="sp-btn sp-btn-grey" data-m="cancel-group">Cancel</button> ' +
                '<button type="button" class="sp-btn" data-m="save-group"' + (n >= 2 ? '' : ' disabled') + '>Save group</button></span>';
        }

        function startGroupEdit(key) {
            panel.picked = {};
            panel.search = '';
            if (key) {
                var g = groupsFor(panel.kind).filter(function (x) { return x.key === key; })[0];
                if (!g) return;
                g.ids.forEach(function (id) { panel.picked[id] = true; });
                panel.editing = { key: key, ruleIds: g.ruleIds };
            } else {
                panel.editing = { key: null, ruleIds: [] };
            }
            renderPanel();
        }

        function saveGroup() {
            var type = panel.kind;
            var ids = sortedStudents().map(function (s) { return s.id; }).filter(function (id) { return panel.picked[id]; });
            if (ids.length < 2) return;
            var drop = {};
            panel.editing.ruleIds.forEach(function (id) { drop[id] = true; });
            state.rules = state.rules.filter(function (r) { return !drop[r.id]; });
            var groupId = 'g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
            function add(a, b) {
                if (linked(a, b, type)) return;      // already covered by another group
                var r = newRule(a, b, type);
                r.group = groupId;
                state.rules.push(r);
            }
            if (type === 'PAIR') {
                for (var i = 1; i < ids.length; i++) add(ids[i - 1], ids[i]);   // a line: A-B, B-C
            } else {
                for (var a = 0; a < ids.length; a++) for (var b = a + 1; b < ids.length; b++) add(ids[a], ids[b]);
            }
            panel.editing = null;
            afterRuleChange();
        }

        function deleteGroup(key) {
            var g = groupsFor(panel.kind).filter(function (x) { return x.key === key; })[0];
            if (!g) return;
            var drop = {};
            g.ruleIds.forEach(function (id) { drop[id] = true; });
            state.rules = state.rules.filter(function (r) { return !drop[r.id]; });
            afterRuleChange();
        }

        /* --- shared --- */

        function filterList() {
            var list = mui.body.querySelector('[data-m="list"]');
            if (!list) return;
            var q = panel.search.trim().toLowerCase();
            Array.prototype.forEach.call(list.children, function (row) {
                var box = row.querySelector('input');
                var hide = (q && row.dataset.name.indexOf(q) === -1) ||
                           (panel.onlyTicked && list.hasAttribute('data-single') && !box.checked);
                row.style.display = hide ? 'none' : '';
            });
        }

        function onPanelClick(e) {
            if (e.target === modal) { closeModal(); return; }
            var btn = e.target.closest('[data-m]');
            if (!btn || btn.tagName === 'SELECT' || btn.tagName === 'INPUT') return;
            switch (btn.getAttribute('data-m')) {
                case 'close': closeModal(); break;
                case 'clear-all':
                    state.rules = state.rules.filter(function (r) { return r.type !== panel.kind; });
                    afterRuleChange();
                    break;
                case 'new-group': startGroupEdit(null); break;
                case 'edit-group': startGroupEdit(btn.getAttribute('data-key')); break;
                case 'delete-group': deleteGroup(btn.getAttribute('data-key')); break;
                case 'cancel-group': panel.editing = null; renderPanel(); break;
                case 'save-group': saveGroup(); break;
            }
        }

        function onPanelChange(e) {
            var t = e.target;
            var role = t.getAttribute('data-m');
            if (role === 'kind') {
                panel.kind = t.value; panel.editing = null; panel.search = ''; panel.onlyTicked = false;
                renderPanel();
                return;
            }
            if (role === 'only-ticked') { panel.onlyTicked = t.checked; filterList(); return; }
            var list = t.closest('[data-m="list"]');
            if (!list || t.type !== 'checkbox') return;
            if (list.hasAttribute('data-single')) {
                toggleSingle(t.value, list.getAttribute('data-single'), t.checked);
            } else {
                panel.picked[t.value] = t.checked;
                var keepSearch = panel.search;
                renderPanel();
                panel.search = keepSearch;
            }
        }

        function newRule(s1, s2, type) {
            return {
                id: 'rule-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                student1Id: s1, student2Id: s2, type: type
            };
        }

        /* Rules changed in the panel: save, refresh badges and red highlights, redraw the panel. */
        function afterRuleChange() {
            save();
            refreshCards();
            validate();
            if (modal && modal.classList.contains('sp-open')) {
                var body = mui.body, top = body.scrollTop;
                renderPanel();
                body.scrollTop = top;
            }
        }

        /* ----- start ----- */

        defaultsFromConfig();
        load();
        build();
        updateRevertButton();
        buildModal();
        /* reopen exactly as left: saved seats if there are any, else arrange afresh */
        updateToolbar();
        if (!(savedPlacement && placeStudents(savedPlacement))) autoArrange(state.sortMode);
        savedPlacement = null;
        persistReady = true;
    }

    /* One print window; each plan on its own page. */
    function openPrintWindow(title, sections) {
        var body = sections.map(function (sec) {
            return '<section class="sp-page ' + sec.classes + '">' + sec.html + '</section>';
        }).join('');
        var win = window.open('', '_blank');
        if (!win) { window.print(); return; }
        win.document.write(NO_TRANSLATE_HTML + '<title>' + esc(title) +
            '</title><style>' + PRINT_CSS + '</style></head><body>' + body + '</body></html>');
        win.document.close();
        win.focus();
        setTimeout(function () { win.print(); }, 250);
    }

    /* ".. seatingplan-print::" button: prints every seating plan on the page. */
    function printAll(btn) {
        var opts = {};
        try { opts = JSON.parse(btn.getAttribute('data-sp-print') || '{}'); } catch (e) { /* defaults */ }
        var sections = [];
        Array.prototype.forEach.call(document.querySelectorAll('.seatingplan[data-seatingplan]'), function (el) {
            if (typeof el.spPrintSection !== 'function') return;
            var sec = el.spPrintSection();
            if (opts.skipEmpty && sec.empty) return;
            sections.push(sec);
        });
        var msg = btn.parentNode.querySelector('.sp-print-all-msg');
        if (!sections.length) {
            if (msg) msg.textContent = 'There are no seating plans to print on this page.';
            return;
        }
        if (msg) msg.textContent = '';
        openPrintWindow(opts.title || document.title || 'Seating Plans', sections);
    }

    function initPrintButtons() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-sp-print]'), function (btn) {
            if (btn.getAttribute('data-sp-ready')) return;
            btn.setAttribute('data-sp-ready', '1');
            btn.addEventListener('click', function () { printAll(btn); });
        });
    }

    function init() {
        Array.prototype.forEach.call(document.querySelectorAll('.seatingplan[data-seatingplan]'), function (el) {
            if (el.getAttribute('data-sp-ready')) return;
            el.setAttribute('data-sp-ready', '1');
            noTranslate(el);
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

    function initAll() { init(); initPrintButtons(); }
    initAll();
    document.addEventListener('DOMContentLoaded', initAll);
    window.addEventListener('load', initAll);
})();