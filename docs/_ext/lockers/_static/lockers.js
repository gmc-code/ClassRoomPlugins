/* lockers directive: client-side behaviour. Each .lockers[data-lockers] gets its own instance.
   Plain ES5, no build step, like seatingplan.js. Everything is prefixed lk- in the CSS. */
(function () {
    'use strict';

    var XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    var xlsxPromise = null;
    var MAX_RANGE = 1000;
    var MAX_LOCKERS = 2000;
    var UNDO_LIMIT = 60;
    var SUGGEST_LIMIT = 8;

    var NO_TRANSLATE_HTML = '<!doctype html><html lang="en" translate="no" class="notranslate"><head>' +
        '<meta charset="utf-8"><meta name="google" content="notranslate">';

    var PRINT_CSS =
        'body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#000}' +
        'h1{font-size:20px;margin:0 0 4px}' +
        '.lk-sub{font-size:12px;color:#444;margin:0 0 10px}' +
        '.lk-parea{font-size:16px;margin:10px 0 4px;border-bottom:1px solid #000}' +
        '.lk-pareabanks{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:flex-start}' +
        '.lk-pbank{break-inside:avoid;margin-bottom:8px}' +
        '.lk-pbank h3{font-size:12px;margin:0 0 3px}' +
        '.lk-pgrid{display:grid;gap:4px}' +
        '.lk-pcell{direction:ltr;border:1px solid #000;border-radius:3px;padding:2px 4px;min-height:44px;font-size:11px;break-inside:avoid}' +
        '.lk-pcell b{display:block;font-size:10px;color:#333}' +
        '.lk-pcell .n{font-weight:700}' +
        '.lk-pcell .cb{display:block;font-family:Consolas,monospace;font-size:10px;letter-spacing:.5px}' +
        '.lk-pcell .bd{float:right;font-size:9px;font-weight:700;border:1px solid #999;border-radius:2px;padding:0 2px;margin-left:3px}' +
        '.lk-pcell.out{background:repeating-linear-gradient(45deg,#fff,#fff 4px,#ddd 4px,#ddd 8px);color:#444}' +
        'table{border-collapse:collapse;width:100%;font-size:12px}' +
        'th,td{border:1px solid #999;padding:3px 6px;text-align:left}' +
        'th{background:#eee}' +
        '.lk-lpage{display:flex;gap:16px;align-items:flex-start}' +
        '.lk-lpage.lk-break{break-after:page;page-break-after:always}' +
        '.lk-lcol{flex:1 1 0;min-width:0}' +
        '.lk-lcol.lk-lone{flex:1 1 100%}' +
        '.lk-ltab{font-size:11px}' +
        '.lk-ltab .cbc{font-family:Consolas,monospace;letter-spacing:.5px}' +
        '.lk-ltab td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40mm;padding:2px 5px}' +
        'tr{break-inside:avoid}';

    /* ---------------- helpers ---------------- */

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

    /* Homeroom and year are kept apart: "Hughes 13" -> room "H13"; the year comes from a Year
       column ("Year 7" -> "7") or from "Year 7" inside the homeroom text ("Year 7 in Hughes 13").
       An old combined value like "7H13" is split into year 7 and room H13. */
    function yearDigits(v) {
        var m = clean(v).match(/\d{1,2}/);
        return m ? String(+m[0]) : '';
    }
    function parseHomeroom(hr, year) {
        var str = clean(hr), y = yearDigits(year);
        var m = str.match(/\b(?:year|yr|y)\s*(\d{1,2})\b/i);
        if (m) {
            if (!y) y = String(+m[1]);
            str = str.replace(m[0], ' ').replace(/^[\s,:\-]*(?:in\b)?[\s,:\-]*/i, '').trim();
        }
        var room = '';
        if (str) {
            var combined = str.match(/^(\d{1,2})\s*([A-Za-z]\w{0,3})$/);   /* "7H13" / "7 H13" */
            if (combined) { if (!y) y = String(+combined[1]); room = combined[2]; }
            else if (str.length <= 4 && !/\s/.test(str)) room = str;
            else {
                var digits = str.replace(/\D/g, '');
                room = str.charAt(0).toUpperCase() + (digits.length >= 2 ? digits.slice(-2) : digits);
            }
        }
        return { year: y, room: room };
    }

    /* Lock combinations: "7-33-3", "073303" or "07 33 03" -> "07 33 03". Anything else is kept as typed. */
    var COMBO_RE = /^\d{1,3}(?:[\s\-:.\/]+\d{1,3}){2,4}$/;
    function normCombo(v) {
        var s = clean(v);
        if (!s) return '';
        if (/^\d{6}$|^\d{8}$/.test(s)) return s.match(/\d\d/g).join(' ');
        var parts = s.split(/[\s\-:.,\/]+/).filter(Boolean);
        if (parts.length >= 2 && parts.length <= 5 && parts.every(function (x) { return /^\d{1,3}$/.test(x); })) {
            return parts.map(function (x) { return x.length < 2 ? '0' + x : x; }).join(' ');
        }
        return s;
    }

    /* Year-level colours: [locker background, border/stripe]. Years outside 7-12 reuse the extras. */
    var YEAR_COLOURS = {
        7: ['#dbeafe', '#3b82f6'],    /* blue */
        8: ['#dcfce7', '#22c55e'],    /* green */
        9: ['#fef3c7', '#f59e0b'],    /* amber */
        10: ['#ede9fe', '#8b5cf6'],   /* purple */
        11: ['#fce7f3', '#ec4899'],   /* pink */
        12: ['#ccfbf1', '#14b8a6']    /* teal */
    };
    var EXTRA_COLOURS = [['#fee2e2', '#ef4444'], ['#e0e7ff', '#6366f1'], ['#ffedd5', '#f97316'], ['#f1f5f9', '#64748b']];
    function yearColour(y) {
        var n = parseInt(y, 10);
        if (!n) return null;
        return YEAR_COLOURS[n] || EXTRA_COLOURS[n % EXTRA_COLOURS.length];
    }

    /* Columns kept with each student but not offered as a badge or shown in tooltips */
    var HIDDEN_COLS = /^(house|house group|gender|sex|e-?mail|email address|e-?mail address|phone|mobile|dob|date of birth|birth ?date|birthday|address|student ?id|student ?number|id|ed ?id)$/i;

    /* Roster columns that are not "extra" information about a student */
    var KNOWN_COLS = ['preferred', 'first name', 'firstname', 'given name', 'surname', 'last name', 'lastname',
        'family name', 'surname name', 'locker combo', 'combo', 'combination', 'lock combo', 'locker combination', 'lock combination', 'locker number', 'locker no', 'locker #', 'status', 'homeroom', 'home room',
        'form', 'bank', 'student', 'home group', 'homegroup', 'year', 'year level', 'yr', 'yr level', 'year group', 'grade'];
    function isKnownCol(k) {
        k = clean(k).toLowerCase();
        return !k || KNOWN_COLS.indexOf(k) >= 0 || /^__empty/.test(k);
    }

    /* lower case, single spaces, no accents: "  José  O'Neil " -> "jose o'neil" */
    function norm(s) {
        s = clean(s).toLowerCase();
        if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return s.replace(/\s+/g, ' ');
    }

    function noTranslate(el) {
        el.setAttribute('translate', 'no');
        el.classList.add('notranslate');
    }

    /* "A2" < "A10" < "B1" */
    function naturalCompare(a, b) {
        var ax = String(a).toLowerCase().match(/(\d+|\D+)/g) || [];
        var bx = String(b).toLowerCase().match(/(\d+|\D+)/g) || [];
        for (var i = 0; i < Math.min(ax.length, bx.length); i++) {
            var x = ax[i], y = bx[i];
            if (x === y) continue;
            var nx = /^\d/.test(x), ny = /^\d/.test(y);
            if (nx && ny) return (+x) - (+y) || x.length - y.length;
            return x < y ? -1 : 1;
        }
        return ax.length - bx.length;
    }

    /* ----- locker ranges (kept in step with expand_spec() in lockers.py) ----- */

    var RANGE_RE = /^([A-Za-z]*)(\d+)\s*[-\u2013]\s*([A-Za-z]*)(\d+)$/;
    var SINGLE_RE = /^[A-Za-z0-9][A-Za-z0-9.\/]*$/;

    function pad(n, width) {
        var s = String(n);
        while (s.length < width) s = '0' + s;
        return s;
    }

    /* "101-105, 110, A1-A3" -> {ids: [...]} or {error: "..."} */
    function expandSpec(spec) {
        var ids = [];
        var items = String(spec || '').split(',');
        for (var i = 0; i < items.length; i++) {
            var item = items[i].trim();
            if (!item) continue;
            var m = item.match(RANGE_RE);
            if (m) {
                if (m[3] && m[3].toLowerCase() !== m[1].toLowerCase()) {
                    return { error: '"' + item + '": both ends need the same letters' };
                }
                var a = parseInt(m[2], 10), b = parseInt(m[4], 10);
                if (Math.abs(b - a) + 1 > MAX_RANGE) {
                    return { error: '"' + item + '": a range can hold at most ' + MAX_RANGE + ' lockers' };
                }
                var width = (m[2].charAt(0) === '0' && m[2].length > 1) ? m[2].length : 0;
                var step = b >= a ? 1 : -1;
                for (var n = a; step > 0 ? n <= b : n >= b; n += step) ids.push(m[1] + pad(n, width));
            } else if (SINGLE_RE.test(item)) {
                ids.push(item);
            } else {
                return { error: '"' + item + '" is not a locker number or range' };
            }
        }
        return { ids: ids };
    }

    /* Text in the Set Up Lockers box: one bank per line, "Name: ranges" or just "ranges". */
    function parseBankText(text) {
        var banks = [], errors = [], seen = {}, dupes = [], total = 0, area = '';
        String(text || '').split(/\r?\n|;/).forEach(function (line, i) {
            line = line.trim();
            if (!line || line.charAt(0) === '#') return;
            var am = line.match(/^\[(.*)\]$/);
            if (am) { area = am[1].trim(); return; }
            var opts = '', bar = line.indexOf('|');
            if (bar >= 0) { opts = line.slice(bar + 1).trim().toLowerCase(); line = line.slice(0, bar).trim(); }
            var name = '', spec = line, colon = line.indexOf(':');
            if (colon >= 0) { name = line.slice(0, colon).trim(); spec = line.slice(colon + 1).trim(); }
            var o = parseBankOpts(opts);
            if (o.bad.length) errors.push((name || 'Line ' + (i + 1)) + ': unknown option "' + o.bad.join(' ') + '" (use e.g. 2 high, across, down, right, bottom)');
            var res = expandSpec(spec);
            if (res.error) { errors.push((name || 'Line ' + (i + 1)) + ': ' + res.error); return; }
            if (!res.ids.length) { errors.push((name || 'Line ' + (i + 1)) + ': no lockers'); return; }
            var ids = [];
            res.ids.forEach(function (id) {
                var k = id.toLowerCase();
                if (seen[k]) { dupes.push(id); return; }
                if (total >= MAX_LOCKERS) return;
                seen[k] = true;
                ids.push(id);
                total++;
            });
            banks.push({ name: name || 'Bank ' + (banks.length + 1), spec: spec, ids: ids, side: o.side, row: o.row,
                tiers: o.tiers, order: o.order, area: area });
        });
        if (dupes.length) errors.push('Listed more than once (only the first is used): ' + dupes.slice(0, 8).join(', ') + (dupes.length > 8 ? '…' : ''));
        if (total >= MAX_LOCKERS) errors.push('At most ' + MAX_LOCKERS + ' lockers; the rest are left out.');
        return { banks: banks, errors: errors, total: total };
    }

    /* "2 high across right" -> {tiers: 2, order: 'across', side: 'right', row: '', bad: []}.
       Height can be written "2 high", "2high", "tiers 2" or "2 tiers". Kept in step with lockers.py. */
    function parseBankOpts(text) {
        var o = { side: '', row: '', tiers: 0, order: '', bad: [] };
        var t = String(text || '').toLowerCase().replace(/\btiers?\s*(\d)/g, '$1high').replace(/(\d)\s*(high|tiers?)\b/g, '$1high');
        t.split(/[\s,]+/).filter(Boolean).forEach(function (w) {
            var m = w.match(/^(\d)high$/);
            if (w === 'left' || w === 'right') o.side = w;
            else if (w === 'top' || w === 'bottom') o.row = w;
            else if (w === 'down' || w === 'across') o.order = w;
            else if (m && +m[1] >= 1 && +m[1] <= 6) o.tiers = +m[1];
            else o.bad.push(w);
        });
        return o;
    }

    function cleanBank(b) {
        var t = parseInt(b.tiers, 10);
        return { name: clean(b.name), spec: clean(b.spec),
            side: b.side === 'left' || b.side === 'right' ? b.side : '',
            row: b.row === 'top' || b.row === 'bottom' ? b.row : '',
            tiers: t >= 1 && t <= 6 ? t : 0,
            order: b.order === 'down' || b.order === 'across' ? b.order : '',
            area: clean(b.area) };
    }

    /* Grid position of locker i of n. Numbers run down each column (or across each row),
       starting from the left or right side and the top or bottom row. Returns
       {cols, rows, pos: [{c, r}]} with 1-based grid lines; tiers 1 gives one wrapping row (pos null). */
    function bankLayout(n, tiers, order, side, row) {
        if (tiers <= 1) return { cols: 0, rows: 1, pos: null };
        var cols = Math.ceil(n / tiers), pos = [];
        for (var i = 0; i < n; i++) {
            var c, r;
            if (order === 'across') { r = Math.floor(i / cols); c = i % cols; }
            else { c = Math.floor(i / tiers); r = i % tiers; }
            if (side === 'right') c = cols - 1 - c;
            if (row === 'bottom') r = tiers - 1 - r;
            pos.push({ c: c + 1, r: r + 1 });
        }
        return { cols: cols, rows: tiers, pos: pos };
    }

    function banksToText(banks) {
        var lines = [], area = '';
        banks.forEach(function (b) {
            if ((b.area || '') !== area) { area = b.area || ''; lines.push('[' + area + ']'); }
            var opts = [b.tiers ? b.tiers + ' high' : '', b.order, b.side, b.row].filter(Boolean).join(' ');
            lines.push((b.name ? b.name + ': ' : '') + b.spec + (opts ? ' | ' + opts : ''));
        });
        return lines.join('\n');
    }

    /* ----- files ----- */

    function loadXlsx() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        if (!xlsxPromise) {
            xlsxPromise = new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = XLSX_URL;
                s.onload = function () { resolve(window.XLSX); };
                s.onerror = function () { xlsxPromise = null; reject(new Error('Could not load the Excel reader. Check the internet connection, or save the sheet as CSV.')); };
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

    function parseCSVRows(text, forceDelim) {
        var firstLine = text.split(/\r?\n/, 1)[0] || '';
        var delim = forceDelim || ',';
        if (!forceDelim) {
            [',', '\t', ';'].forEach(function (d) {
                if (firstLine.split(d).length > firstLine.split(delim).length) delim = d;
            });
        }
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
        return rows;
    }

    function parseCSV(text) {
        var rows = parseCSVRows(text);
        if (!rows.length) return [];
        var headers = rows[0].map(clean);
        return rows.slice(1).map(function (r) {
            var o = {};
            headers.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i]; });
            return o;
        });
    }

    function csvCell(v) {
        v = String(v == null ? '' : v);
        return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
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

    /* Save a file with a Save As dialog where the browser has one (Chrome, Edge): the person picks the
       folder and name. The dialog has to open straight from the click, so it opens first and the file is
       made afterwards (makeBlob returns a Promise of a Blob). Other browsers ask for a name and save to
       Downloads. Resolves with the file name, or null if the person cancelled. */
    function saveFile(suggested, description, mime, ext, makeBlob) {
        function fallback() {
            var name = window.prompt('Save as (it goes to your Downloads folder):', suggested);
            if (!name) return Promise.resolve(null);
            name = name.trim();
            if (!/\.[A-Za-z0-9]+$/.test(name)) name += ext;
            return makeBlob().then(function (blob) { downloadBlob(blob, name); return name; });
        }
        if (!window.showSaveFilePicker) return fallback();
        var accept = {};
        accept[mime] = [ext];
        var picking;
        try {
            picking = window.showSaveFilePicker({ suggestedName: suggested, types: [{ description: description, accept: accept }] });
        } catch (e) { picking = Promise.reject(e); }
        return picking.then(function (handle) {
            return makeBlob().then(function (blob) {
                return handle.createWritable().then(function (w) {
                    return w.write(blob).then(function () { return w.close(); });
                });
            }).then(function () { return handle.name; });
        }, function (err) {
            if (err && err.name === 'AbortError') return null;   /* the person pressed Cancel */
            return fallback();                                    /* e.g. not allowed inside a frame */
        });
    }

    function fileSlug(title, fallback) {
        return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
    }

    /* Print through a hidden frame on this page: no new window or tab, no pop-up blocker.
       opts.head adds to <head> (e.g. a stylesheet link); opts.fitWidth shrinks the page to fit
       that many CSS pixels across. */
    function openPrintWindow(title, bodyHtml, landscape, opts) {
        opts = opts || {};
        var old = document.getElementById('lk-print-frame');
        if (old) old.remove();
        var frame = document.createElement('iframe');
        frame.id = 'lk-print-frame';
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        document.body.appendChild(frame);
        var doc = frame.contentWindow.document;
        doc.open();
        doc.write(NO_TRANSLATE_HTML + '<title>' + esc(title) + '</title><style>@page{size:' +
            (landscape ? 'landscape' : 'portrait') + ';margin:10mm}' + PRINT_CSS +
            '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>' + (opts.head || '') + '</head><body>' +
            bodyHtml + '</body></html>');
        doc.close();
        var printed = false;
        function go() {
            if (printed) return;
            printed = true;
            if (opts.fitWidth) {
                var wrap = doc.getElementById('lk-fit');
                if (wrap) {
                    var w = wrap.scrollWidth;
                    if (w > opts.fitWidth) wrap.style.zoom = (opts.fitWidth / w).toFixed(3);
                }
            }
            frame.contentWindow.focus();
            frame.contentWindow.print();
            setTimeout(function () { frame.remove(); }, 60000);
        }
        /* wait for any stylesheet to load, but never more than 1.5 s */
        frame.onload = function () { setTimeout(go, 100); };
        setTimeout(go, 1500);
        if (!opts.head) setTimeout(go, 250);
    }

    var ICONS = {
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
        folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L8.6 3.3A2 2 0 0 0 6.9 2.5H4a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/>',
        table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
        reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
        undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
        print: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
        list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
        locker: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 2v20"/><path d="M8 11v2M16 11v2"/>',
        keyboard: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 16h8"/>',
        paste: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
        az: '<path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="M15 4h5l-5 6h5"/><path d="M15 20v-3.5a1.5 1.5 0 0 1 3 0V20"/><path d="M15 17h3"/>',
        rows: '<path d="M4 6h16M4 12h16M4 18h7"/>',
        random: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l6.1 8.6c.7 1.1 2 1.7 3.3 1.7H22"/><path d="m18 14 4 4-4 4"/>',
        trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'
    };
    function icon(name) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lk-btn-icon">' +
            ICONS[name] + '</svg>';
    }
    function btn(action, cls, iconName, label, extra) {
        return '<button type="button" class="lk-btn ' + (cls || '') + '" data-action="' + action + '"' + (extra || '') + '>' +
            (iconName ? icon(iconName) : '') + label + '</button>';
    }

    /* ---------------- one locker tool ---------------- */

    function Lockers(root, cfg) {
        var storageKey = 'lockers:' + cfg.id;
        var state = {};
        var ui = {};
        var modal = null, mui = {};
        var undoStack = [];
        var lockerIndex = {};   /* lower-case id -> {id, bank} */
        var order = [];         /* every locker id, bank by bank */
        var suggestions = [], suggestPos = 0;
        var dragId = null;

        /* ----- state ----- */

        function defaults() {
            state = {
                title: cfg.title || 'Locker allocation',
                banks: (cfg.banks || []).map(cleanBank),
                tiers: Math.min(6, Math.max(1, cfg.tiers || 1)),
                order: cfg.order === 'across' ? 'across' : 'down',
                side: cfg.start === 'right' ? 'right' : 'left',
                row: cfg.firstRow === 'bottom' ? 'bottom' : 'top',
                students: [],
                assign: {},     /* locker id -> student id */
                out: {},        /* locker id -> true when out of service */
                keepExisting: true,
                display: {
                    homeroom: !(cfg.display && cfg.display.homeroom === false),
                    field: cfg.display && cfg.display.homeroom === false ? 'none' : 'auto',
                    surnameInitial: !!(cfg.display && cfg.display.surnameInitial),
                    yearColours: !(cfg.display && cfg.display.yearColours === false),
                    combo: !!(cfg.display && cfg.display.combo)
                },
                sel: null
            };
            rebuildIndex();
            (cfg.unavailable || []).forEach(function (id) {
                var l = findLocker(id);
                if (l) state.out[l.id] = true;
            });
            var extra = [];
            (cfg.students || []).forEach(function (s, i) {
                var st = newStudent(s.firstName, s.surname, s.homeroom, i, s.extra, s.year, s.combo);
                state.students.push(st);
                if (clean(s.locker)) extra.push({ locker: clean(s.locker), sid: st.id });
            });
            placeAllocations(extra);
            if (comboCount()) state.display.combo = true;
        }

        function newStudent(first, surname, homeroom, n, extra, year, combo) {
            var hr = parseHomeroom(homeroom, year);
            return {
                combo: normCombo(combo),
                year: hr.year,
                extra: cleanExtra(extra),
                id: 's' + Date.now().toString(36) + '-' + n + '-' + Math.floor(Math.random() * 1e6).toString(36),
                firstName: clean(first) || 'Student',
                surname: clean(surname) || String(n + 1),
                homeroom: hr.room
            };
        }

        function cleanExtra(e) {
            var out = {};
            if (e && typeof e === 'object') Object.keys(e).forEach(function (k) {
                var v = clean(e[k]);
                if (clean(k) && v) out[clean(k)] = v;
            });
            return out;
        }

        /* every extra column name across the students, e.g. ["TG", "House"], first seen first */
        function extraFields(all) {
            var seen = {}, list = [];
            state.students.forEach(function (st) {
                Object.keys(st.extra || {}).forEach(function (k) {
                    if (!all && HIDDEN_COLS.test(k)) return;
                    if (!seen[k.toLowerCase()]) { seen[k.toLowerCase()] = true; list.push(k); }
                });
            });
            return list;
        }

        /* homeroom, or failing that a House column like "Hughes 13" shortened to "H13" */
        function roomOf(st) {
            if (st.homeroom) return st.homeroom;
            var h = extraValue(st, 'House') || extraValue(st, 'House Group');
            return h ? parseHomeroom(h).room : '';
        }
        function hasYears() { return state.students.some(function (st) { return st.year; }); }
        function hasRooms() { return state.students.some(function (st) { return roomOf(st); }); }
        /* "auto": year + homeroom when there are years, else homeroom */
        function badgeField() {
            var f = state.display.field || 'auto';
            if (f === 'auto') return hasYears() ? (hasRooms() ? 'yearroom' : 'year') : 'homeroom';
            return f;
        }

        function extraValue(st, field) {
            var e = st.extra || {};
            if (e[field] != null) return e[field];
            var lk = field.toLowerCase();
            for (var k in e) if (k.toLowerCase() === lk) return e[k];
            return '';
        }

        /* the value shown as the small badge: homeroom, an extra column, or nothing */
        function badgeOf(st) {
            var f = badgeField();
            if (f === 'none') return '';
            if (f === 'homeroom') return roomOf(st);
            if (f === 'year') return st.year ? 'Y' + st.year : '';
            if (f === 'yearroom') return yearRoom(st);
            return shortBadge(extraValue(st, f));
        }
        /* "7 H13": year, a space, then homeroom */
        function paintYear(el, st) {
            var c = state.display.yearColours && yearColour(st.year);
            if (!c) return;
            el.classList.add('lk-yr');
            el.style.setProperty('--lk-yr-bg', c[0]);
            el.style.setProperty('--lk-yr-bd', c[1]);
        }

        /* key of year colours with how many students are in each year */
        function yearLegend() {
            if (!state.display.yearColours) return null;
            var counts = {};
            state.students.forEach(function (st) { if (st.year) counts[st.year] = (counts[st.year] || 0) + 1; });
            var years = Object.keys(counts).sort(function (a, b) { return a - b; });
            if (!years.length) return null;
            var box = make('div', 'lk-legend');
            years.forEach(function (y) {
                var c = yearColour(y), chip = make('span', 'lk-legend-chip', 'Y' + y + ' (' + counts[y] + ')');
                chip.style.background = c[0];
                chip.style.borderColor = c[1];
                box.appendChild(chip);
            });
            return box;
        }

        function yearRoom(st) { return [st.year || '', roomOf(st)].filter(Boolean).join(' '); }

        /* "Hughes 13" -> "H13" so a House/TG name with a number fits like a homeroom.
           Short values ("7A", "Red") and names without a number ("Chisholm") stay as they are. */
        function shortBadge(v) {
            v = clean(v).replace(/\b(?:year|yr)\s*\d{1,2}\b/i, ' ').replace(/^[\s,:\-]*(?:in\b)?[\s,:\-]*/i, '').trim();
            if (v.length <= 4 || !/\s/.test(v) || !/\d/.test(v)) return v;
            var digits = v.replace(/\D/g, '');
            return v.charAt(0).toUpperCase() + (digits.length >= 2 ? digits.slice(-2) : digits);
        }
        function badgeLabel() {
            var f = badgeField();
            return { homeroom: 'Homeroom', year: 'Year', yearroom: 'Year + HR', none: '' }[f] != null
                ? { homeroom: 'Homeroom', year: 'Year', yearroom: 'Year + HR', none: '' }[f] : f;
        }

        /* [{locker, sid}] -> assign, adding unknown lockers to an "Other" bank. Returns messages. */
        function placeAllocations(list) {
            var added = [], clashes = [];
            list.forEach(function (a) {
                var l = findLocker(a.locker);
                if (!l) {
                    addToOther(a.locker);
                    added.push(a.locker);
                    l = findLocker(a.locker);
                    if (!l) return;
                }
                if (state.assign[l.id] && state.assign[l.id] !== a.sid) { clashes.push(l.id); return; }
                unassignStudent(a.sid);
                state.assign[l.id] = a.sid;
            });
            var msgs = [];
            if (added.length) msgs.push('Added to an "Other" bank: ' + added.slice(0, 8).join(', ') + (added.length > 8 ? '…' : '') + '.');
            if (clashes.length) msgs.push('Already taken, so left unallocated: ' + clashes.slice(0, 8).join(', ') + '.');
            return msgs;
        }

        function addToOther(id) {
            var other = null;
            state.banks.forEach(function (b) { if (b.name === 'Other') other = b; });
            if (!other) { other = { name: 'Other', spec: '' }; state.banks.push(other); }
            other.spec = other.spec ? other.spec + ', ' + id : id;
            rebuildIndex();
        }

        function rebuildIndex() {
            lockerIndex = {};
            order = [];
            var parsed = parseBankText(banksToText(state.banks));
            state.banks = parsed.banks.map(cleanBank);
            parsed.banks.forEach(function (b, bi) {
                b.ids.forEach(function (id) {
                    lockerIndex[id.toLowerCase()] = { id: id, bank: bi };
                    order.push(id);
                });
            });
            state._bankIds = parsed.banks.map(function (b) { return b.ids; });
            /* forget allocations and flags for lockers that no longer exist */
            Object.keys(state.assign).forEach(function (id) { if (!lockerIndex[id.toLowerCase()]) delete state.assign[id]; });
            Object.keys(state.out).forEach(function (id) { if (!lockerIndex[id.toLowerCase()]) delete state.out[id]; });
            if (state.sel && !lockerIndex[state.sel.toLowerCase()]) state.sel = null;
        }

        function findLocker(id) { return lockerIndex[clean(id).toLowerCase()] || null; }

        /* A combination belongs to the STUDENT (their padlock): it moves with them when they change lockers. */
        function studentCombo(st) { return (st && st.combo) || ''; }
        /* combination of whoever is in a locker ('' if it is empty) */
        function comboOf(id) { return state.assign[id] ? studentCombo(studentById(state.assign[id])) : ''; }
        function comboCount() { return state.students.filter(function (st) { return st.combo; }).length; }
        function setStudentCombo(st, v) {
            if (!st) return false;
            v = normCombo(v);
            if (v) st.combo = v; else delete st.combo;
            return true;
        }
        /* set the combination of the student in a locker; false if the locker is unknown or empty */
        function setCombo(id, v) {
            var l = findLocker(id);
            if (!l || !state.assign[l.id]) return false;
            return setStudentCombo(studentById(state.assign[l.id]), v);
        }
        /* [{sid or locker, combo}] -> combinations; counts how many were set and which lockers had nobody in them */
        function applyCombos(list) {
            var had = comboCount(), set = 0, missing = [];
            list.forEach(function (c) {
                if (!normCombo(c.combo)) return;
                var ok = c.sid ? setStudentCombo(studentById(c.sid), c.combo) : setCombo(c.locker, c.combo);
                if (ok) set++; else missing.push(c.locker);
            });
            if (set && !had) state.display.combo = true;   /* first combinations: show them */
            return { set: set, missing: missing };
        }
        function comboMsg(r) {
            if (!r.set && !r.missing.length) return '';
            return (r.set ? r.set + ' combination' + (r.set === 1 ? '' : 's') + ' saved. ' : '') +
                (r.missing.length ? 'No student in locker(s) ' + r.missing.slice(0, 8).join(', ') + (r.missing.length > 8 ? '…' : '') + ', so their combinations were not saved. ' : '');
        }

        function studentById(id) {
            for (var i = 0; i < state.students.length; i++) if (state.students[i].id === id) return state.students[i];
            return null;
        }

        function lockerOf(sid) {
            for (var id in state.assign) if (state.assign[id] === sid) return id;
            return null;
        }

        function unassignStudent(sid) {
            var l = lockerOf(sid);
            if (l) delete state.assign[l];
        }

        function fullName(s) { return s.firstName + ' ' + s.surname; }

        /* "Alex Smith · Homeroom H11 · TG 7A · House Red" for tooltips */
        function studentInfo(s) {
            var parts = [fullName(s)];
            if (s.year) parts.push('Year ' + s.year);
            if (roomOf(s)) parts.push('Homeroom ' + roomOf(s));
            Object.keys(s.extra || {}).forEach(function (k) { if (!HIDDEN_COLS.test(k)) parts.push(k + ' ' + s.extra[k]); });
            return parts.join(' · ');
        }
        function searchText(s) {
            return norm(fullName(s) + ' ' + s.surname + ' ' + s.firstName + ' ' + roomOf(s) + ' ' + yearRoom(s) + ' ' + (s.year || '') + roomOf(s) + ' ' +
                (s.year ? 'y' + s.year + ' year ' + s.year : '') + ' ' +
                Object.keys(s.extra || {}).map(function (k) { return s.extra[k]; }).join(' '));
        }

        function displaySurname(s) {
            return state.display.surnameInitial ? s.surname.charAt(0) + '.' : s.surname;
        }

        function bySurname(a, b) {
            return a.surname.localeCompare(b.surname, undefined, { sensitivity: 'base' }) ||
                a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
        }

        /* ----- storage + undo ----- */

        function snapshot() {
            return JSON.stringify({
                title: state.title, banks: state.banks, tiers: state.tiers, order: state.order,
                side: state.side, row: state.row,
                students: state.students, assign: state.assign, out: state.out,
                keepExisting: state.keepExisting, display: state.display
            });
        }

        function restore(json) {
            var d = JSON.parse(json);
            if (!d || !Array.isArray(d.students) || !Array.isArray(d.banks)) throw new Error('Not a locker file.');
            state.title = d.title || state.title;
            state.banks = d.banks.map(cleanBank);
            state.tiers = Math.min(6, Math.max(1, +d.tiers || 1));
            state.order = d.order === 'across' ? 'across' : 'down';
            state.side = d.side === 'right' ? 'right' : 'left';
            state.row = d.row === 'bottom' ? 'bottom' : 'top';
            state.students = d.students.map(function (s, i) {
                var hr = parseHomeroom(s.homeroom, s.year);
                var st = { id: clean(s.id) || 's-imp-' + i, firstName: clean(s.firstName) || 'Student', surname: clean(s.surname),
                    year: hr.year, homeroom: hr.room, extra: cleanExtra(s.extra) };
                if (normCombo(s.combo)) st.combo = normCombo(s.combo);
                return st;
            });
            state.assign = {};
            state.out = {};
            rebuildIndex();
            Object.keys(d.assign || {}).forEach(function (id) {
                var l = findLocker(id);
                if (l && studentById(d.assign[id])) state.assign[l.id] = d.assign[id];
            });
            Object.keys(d.out || {}).forEach(function (id) { var l = findLocker(id); if (l) state.out[l.id] = true; });
            /* older saves kept combinations per locker: give each one to the student in that locker */
            Object.keys(d.combo || {}).forEach(function (id) {
                var l = findLocker(id), st = l && state.assign[l.id] ? studentById(state.assign[l.id]) : null;
                if (st && !st.combo) setStudentCombo(st, d.combo[id]);
            });
            if (typeof d.keepExisting === 'boolean') state.keepExisting = d.keepExisting;
            if (d.display) {
                state.display.homeroom = d.display.homeroom !== false;
                state.display.field = typeof d.display.field === 'string' ? d.display.field : (state.display.homeroom ? 'auto' : 'none');
                state.display.surnameInitial = !!d.display.surnameInitial;
                state.display.yearColours = d.display.yearColours !== false;
                state.display.combo = !!d.display.combo;
                if (d.display.exportPrefs && typeof d.display.exportPrefs === 'object') state.display.exportPrefs = d.display.exportPrefs;
            }
        }

        function save() {
            try { localStorage.setItem(storageKey, snapshot()); } catch (e) { /* storage blocked */ }
        }

        function load() {
            try {
                var raw = localStorage.getItem(storageKey);
                if (!raw) return false;
                restore(raw);
                return true;
            } catch (e) { return false; }
        }

        /* call before every change, so Undo can step back */
        function pushUndo() {
            undoStack.push(snapshot());
            if (undoStack.length > UNDO_LIMIT) undoStack.shift();
            updateUndo();
        }

        function undo() {
            if (!undoStack.length) return;
            var sel = state.sel;
            restore(undoStack.pop());
            state.sel = sel && findLocker(sel) ? findLocker(sel).id : null;
            changed();
            setStatus('Undone.');
        }

        function updateUndo() {
            if (ui.undo) {
                ui.undo.disabled = !undoStack.length;
                ui.undo.title = undoStack.length ? 'Undo the last change (' + undoStack.length + ' saved)' : 'Nothing to undo';
            }
        }

        function changed() {
            render();
            save();
            updateUndo();
        }

        /* ----- status line ----- */

        var statusTimer = null;
        function setStatus(msg, sticky) {
            if (!ui.status) return;
            ui.status.textContent = msg || '';
            ui.status.classList.toggle('lk-show', !!msg);
            clearTimeout(statusTimer);
            if (msg && !sticky) statusTimer = setTimeout(function () { ui.status.classList.remove('lk-show'); }, 6000);
        }

        /* ----- building the page ----- */

        function build() {
            root.innerHTML =
                '<div class="lk-title" data-role="title" title="Click to edit the title"></div>' +
                '<div class="lk-toolbar">' +
                '<div class="lk-toolbar-row">' +
                btn('import', 'lk-btn-data', 'upload', 'Import', ' title="Import a class list (Excel or CSV), replacing the students already here"') +
                btn('import-add', 'lk-btn-data', 'upload', 'Add', ' title="Add students from another class list, or add details (year, TG …) to the students already here"') +
                '<input type="file" class="lk-file" accept=".xlsx,.xls,.csv" data-role="file">' +
                btn('import-json', 'lk-btn-file', 'folder', 'Open', ' title="Open a saved locker file (.json)"') +
                '<input type="file" class="lk-file" accept=".json" data-role="json-file">' +
                btn('export-json', 'lk-btn-file', 'download', 'Save', ' title="Save everything to a file (.json) you can open later"') +
                btn('export-csv', 'lk-btn-file', 'table', 'Export', ' title="Download the list as Excel or CSV: a simple Surname Name / First Name / Year Level / Locker number list, or the full locker list"') +
                '<span class="lk-sep"></span>' +
                btn('print-screen', 'lk-btn-teal', 'print', 'Print', ' title="Print the lockers as they look on screen, shrunk to fit the page"') +
                btn('print-grid', 'lk-btn-teal', 'print', 'Map', ' title="Print a plain black-and-white map of the lockers"') +
                btn('print-list', 'lk-btn-teal', 'list', 'List', ' title="Print the students in surname order with their lockers"') +
                '<span class="lk-sep"></span>' +
                btn('undo', 'lk-btn-grey', 'undo', 'Undo', ' data-role="undo" disabled') +
                btn('reset', 'lk-btn-grey', 'reset', 'Reset', ' title="Go back to how this page was first set up"') +
                '<div class="lk-search">' + icon('search') +
                '<input type="search" data-role="search" placeholder="Find…" title="Find a student, locker number, year (y7) or homeroom" aria-label="Find a student or locker"></div>' +
                '</div>' +
                '<div class="lk-toolbar-row">' +
                btn('setup', 'lk-btn-amber', 'locker', 'Lockers', ' title="Set up the locker numbers, banks and areas"') +
                btn('by-student', 'lk-btn-purple', 'keyboard', 'By Student', ' title="Type each student\'s locker number down a list"') +
                btn('paste', 'lk-btn-purple', 'paste', 'Paste', ' title="Paste names, locker numbers and combinations, e.g. from Excel"') +
                btn('combos', 'lk-btn-purple', 'keyboard', 'Combos', ' title="Type each student\'s padlock combination down a list"') +
                '<span class="lk-sep"></span>' +
                '<span class="lk-label">Allocate:</span>' +
                btn('auto', 'lk-btn-purple', 'az', 'A–Z', ' data-mode="AZ" title="Fill free lockers in surname order"') +
                btn('auto', 'lk-btn-purple', 'rows', 'Homeroom', ' data-mode="HOMEROOM" title="Fill free lockers group by group, using whatever the Badge shows"') +
                btn('auto', 'lk-btn-amber', 'random', 'Random', ' data-mode="RANDOM" title="Fill free lockers in random order"') +
                '<label class="lk-checkbox-label" title="Keep existing: ticked = only students without a locker are allocated, into free lockers; unticked = everyone is reallocated">' +
                '<input type="checkbox" class="lk-checkbox" data-role="keep"> Keep</label>' +
                btn('clear-all', 'lk-btn-red', 'trash', 'Clear', ' title="Take every student out of their locker"') +
                '<span class="lk-sep"></span>' +
                '<span class="lk-label" title="Remove a whole year group, e.g. at the end of the year">Remove:</span>' +
                btn('remove-year', 'lk-btn-red lk-btn-remove', '', 'Y9', ' data-year="9" data-role="remove-y9" title="Remove every Year 9 student (e.g. at the end of the year): they come off the list and their lockers become free"') +
                btn('remove-year', 'lk-btn-red lk-btn-remove', '', 'Y12', ' data-year="12" data-role="remove-y12" title="Remove every Year 12 student (e.g. at the end of the year): they come off the list and their lockers become free"') +
                '</div>' +
                '<div class="lk-toolbar-row lk-toolbar-row--options">' +
                '<span class="lk-label" title="How many lockers high each bank is">Tiers:</span><div class="lk-seg" data-role="tiers">' +
                [1, 2, 3, 4, 5, 6].map(function (n) { return '<button type="button" class="lk-btn lk-btn-seg" data-action="tiers" data-n="' + n + '">' + n + '</button>'; }).join('') +
                '</div>' +
                '<span class="lk-label" title="Which way the numbers run">Run:</span><div class="lk-seg" data-role="order">' +
                '<button type="button" class="lk-btn lk-btn-seg" data-action="order" data-order="down" title="Numbers run down each column, then the next column">↓</button>' +
                '<button type="button" class="lk-btn lk-btn-seg" data-action="order" data-order="across" title="Numbers run along the top row, then the next row">→</button>' +
                '</div>' +
                '<span class="lk-label" title="Where the first locker in each bank is">Start:</span><div class="lk-seg" data-role="side">' +
                '<button type="button" class="lk-btn lk-btn-seg" data-action="side" data-side="left" title="First locker on the left; numbers go right">Left</button>' +
                '<button type="button" class="lk-btn lk-btn-seg" data-action="side" data-side="right" title="First locker on the right; numbers go left">Right</button>' +
                '</div>' +
                '<div class="lk-seg" data-role="row">' +
                '<button type="button" class="lk-btn lk-btn-seg" data-action="row" data-row="top" title="First locker in the top row">Top</button>' +
                '<button type="button" class="lk-btn lk-btn-seg" data-action="row" data-row="bottom" title="First locker in the bottom row">Bottom</button>' +
                '</div>' +
                '<label class="lk-checkbox-label" title="Which detail shows on each locker: year (Y7), homeroom (H13), both (7 H13), or another column such as TG">Badge: ' +
                '<select class="lk-select" data-role="badge-field"></select></label>' +
                '<label class="lk-checkbox-label" title="Show surnames as an initial only, e.g. Alex S."><input type="checkbox" class="lk-checkbox" data-role="toggle-initial"> Initial</label>' +
                '<label class="lk-checkbox-label" title="Colour each locker by the student\'s year level"><input type="checkbox" class="lk-checkbox" data-role="toggle-colours"> Year colours</label>' +
                '<label class="lk-checkbox-label" title="Show each lock\'s combination on a new line under the name"><input type="checkbox" class="lk-checkbox" data-role="toggle-combo"> Combos</label>' +
                '</div>' +
                '</div>' +
                /* quick entry bar */
                '<div class="lk-entry">' +
                '<label class="lk-entry-locker-label">Locker <input type="text" data-role="entry-locker" class="lk-entry-locker" autocomplete="off" spellcheck="false"></label>' +
                '<span class="lk-entry-arrow">→</span>' +
                '<div class="lk-entry-name-wrap">' +
                '<input type="text" data-role="entry-name" class="lk-entry-name" autocomplete="off" spellcheck="false" ' +
                'placeholder="Type a name, press Enter" aria-label="Student name">' +
                '<ul class="lk-suggest" data-role="suggest" role="listbox"></ul>' +
                '</div>' +
                '<label class="lk-entry-combo-label" title="Lock combination for this locker. Enter saves it and moves to the next locker.">Combo ' +
                '<input type="text" data-role="entry-combo" class="lk-entry-combo" autocomplete="off" spellcheck="false" placeholder="00 00 00"></label>' +
                '<span class="lk-entry-current" data-role="entry-current"></span>' +
                '<button type="button" class="lk-btn lk-btn-grey lk-btn-small" data-action="entry-clear" title="Take the name out of this locker">Empty</button>' +
                '<button type="button" class="lk-btn lk-btn-grey lk-btn-small" data-action="entry-out" data-role="entry-out" title="Mark this locker out of service (or back in service)">Out</button>' +
                '<span class="lk-entry-help">Enter: allocate &amp; next · Enter on blank: skip · <b>-</b> Enter: empty · <b>x</b> Enter: out of service · ↑↓ pick</span>' +
                '</div>' +
                '<div class="lk-status" data-role="status" role="status" aria-live="polite"></div>' +
                '<div class="lk-body">' +
                '<div class="lk-sidebar">' +
                '<div class="lk-stats" data-role="stats"></div>' +
                '<div class="lk-side-title">No locker (<span data-role="count">0</span>)</div>' +
                '<div class="lk-side-hint">Type a locker number in the Locker box, then click a name or drag it onto the box (or onto any locker).</div>' +
                '<div class="lk-pool" data-role="pool"></div>' +
                '</div>' +
                '<div class="lk-canvas" data-role="canvas"></div>' +
                '</div>';

            ['title', 'file', 'json-file', 'undo', 'keep', 'tiers', 'order', 'side', 'row', 'badge-field', 'toggle-initial', 'toggle-colours', 'toggle-combo', 'search',
                'entry-locker', 'entry-name', 'entry-combo', 'suggest', 'entry-current', 'entry-out', 'status', 'stats', 'count', 'pool', 'canvas'
            ].forEach(function (r) { ui[r] = root.querySelector('[data-role="' + r + '"]'); });

            ui.title.contentEditable = 'true';
            ui.title.addEventListener('blur', function () {
                var t = ui.title.textContent.trim() || 'Locker allocation';
                if (t !== state.title) { pushUndo(); state.title = t; save(); }
                ui.title.textContent = state.title;
            });
            ui.title.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ui.title.blur(); } });

            root.addEventListener('click', onRootClick);
            ui.file.addEventListener('change', onRosterFile);
            ui['json-file'].addEventListener('change', onJsonFile);
            ui.keep.addEventListener('change', function () { state.keepExisting = ui.keep.checked; save(); });
            ui['badge-field'].addEventListener('change', function () {
                state.display.field = ui['badge-field'].value;
                state.display.homeroom = state.display.field !== 'none';
                changed();
            });
            ui['toggle-initial'].addEventListener('change', function () { state.display.surnameInitial = ui['toggle-initial'].checked; changed(); });
            ui['toggle-colours'].addEventListener('change', function () { state.display.yearColours = ui['toggle-colours'].checked; changed(); });
            ui['toggle-combo'].addEventListener('change', function () { state.display.combo = ui['toggle-combo'].checked; changed(); });
            ui.search.addEventListener('input', applySearch);
            ui.search.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var first = ui.canvas.querySelector('.lk-hit');
                    if (first) selectLocker(first.getAttribute('data-id'), true);
                }
            });

            /* entry bar */
            ui['entry-locker'].addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === 'Tab') {
                    var v = ui['entry-locker'].value.trim();
                    if (!v && e.key === 'Tab') return;
                    e.preventDefault();
                    var l = findLocker(v);
                    if (!l) { ui['entry-locker'].classList.add('lk-invalid'); setStatus('There is no locker "' + v + '". Use Lockers to add it.'); return; }
                    selectLocker(l.id, true);
                }
            });
            ui['entry-locker'].addEventListener('input', function () {
                var v = ui['entry-locker'].value.trim();
                var l = v && findLocker(v);
                ui['entry-locker'].classList.toggle('lk-invalid', !!v && !l);
                ui['entry-locker'].classList.toggle('lk-valid', !!l);
                if (l) selectLocker(l.id, false);
            });
            ui['entry-combo'].addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    saveEntryCombo();
                    var next = e.key === 'ArrowUp' ? prevLocker(state.sel, true) : nextLocker(state.sel, true);
                    if (next) {
                        ui['entry-locker'].value = next;
                        selectLocker(next, false);
                        ui['entry-combo'].value = comboOf(next);
                        ui['entry-combo'].focus();
                        ui['entry-combo'].select();
                    } else setStatus('That was the last locker.');
                } else if (e.key === 'Escape') {
                    ui['entry-combo'].value = comboOf(state.sel);
                }
            });
            ui['entry-combo'].addEventListener('change', saveEntryCombo);
            ui['entry-combo'].addEventListener('focus', function () { ui['entry-combo'].select(); });
            ui['entry-name'].addEventListener('input', updateSuggestions);
            ui['entry-name'].addEventListener('focus', updateSuggestions);
            ui['entry-name'].addEventListener('blur', function () { setTimeout(hideSuggestions, 150); });
            ui['entry-name'].addEventListener('keydown', onNameKey);
            ui.suggest.addEventListener('mousedown', function (e) {
                var li = e.target.closest('li[data-sid]');
                if (!li) return;
                e.preventDefault();
                commitEntry(li.getAttribute('data-sid'));
            });

            /* drag and drop */
            ui.canvas.addEventListener('dragstart', onDragStart);
            ui.pool.addEventListener('dragstart', onDragStart);
            root.addEventListener('dragend', function () { dragId = null; clearDragOver(); root.querySelector('.lk-entry').classList.remove('lk-drop-ready'); });
            ui.canvas.addEventListener('dragover', function (e) {
                var cell = e.target.closest('.lk-cell');
                if (!cell || !dragId || state.out[cell.getAttribute('data-id')]) return;
                e.preventDefault();
                clearDragOver();
                cell.classList.add('lk-drag-over');
            });
            ui.canvas.addEventListener('drop', function (e) {
                var cell = e.target.closest('.lk-cell');
                if (!cell || !dragId) return;
                e.preventDefault();
                dropOnLocker(dragId, cell.getAttribute('data-id'));
            });
            var entryBar = root.querySelector('.lk-entry');
            entryBar.addEventListener('dragover', function (e) {
                if (!dragId) return;
                e.preventDefault();
                entryBar.classList.add('lk-drop-ready');
            });
            entryBar.addEventListener('dragleave', function (e) {
                if (!entryBar.contains(e.relatedTarget)) entryBar.classList.remove('lk-drop-ready');
            });
            entryBar.addEventListener('drop', function (e) {
                if (!dragId) return;
                e.preventDefault();
                entryBar.classList.remove('lk-drop-ready');
                var sid = dragId;
                dragId = null;
                if (!targetLocker()) { setStatus('Type a locker number in the Locker box first.'); ui['entry-locker'].focus(); return; }
                commitEntry(sid);
            });
            ui.pool.addEventListener('dragover', function (e) { if (dragId) e.preventDefault(); });
            ui.pool.addEventListener('drop', function (e) {
                if (!dragId) return;
                e.preventDefault();
                if (lockerOf(dragId)) { pushUndo(); unassignStudent(dragId); changed(); }
            });
            ui.canvas.addEventListener('change', onBankOpt);
            ui.canvas.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && e.target.getAttribute('data-bank-opt')) { e.preventDefault(); e.target.blur(); }
            });
            ui.canvas.addEventListener('contextmenu', function (e) {
                var cell = e.target.closest('.lk-cell');
                if (!cell) return;
                e.preventDefault();
                toggleOut(cell.getAttribute('data-id'));
            });
        }

        /* ----- rendering ----- */

        function render() {
            ui.title.textContent = state.title;
            ui.keep.checked = state.keepExisting;
            var fields = extraFields();
            var builtIn = ['auto', 'year', 'homeroom', 'yearroom', 'none'];
            if (builtIn.indexOf(state.display.field) < 0 &&
                !fields.some(function (f) { return f.toLowerCase() === String(state.display.field).toLowerCase(); })) state.display.field = 'auto';
            var cur = badgeField();
            ui['badge-field'].innerHTML = [['year', 'Year (Y7)'], ['homeroom', 'Homeroom (H13)'], ['yearroom', 'Year + HR (7 H13)']]
                .concat(fields.map(function (f) { return [f, f]; })).concat([['none', 'None']])
                .map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('');
            ui['badge-field'].value = cur;
            var grpBtn = root.querySelector('[data-action="auto"][data-mode="HOMEROOM"]');
            if (grpBtn) grpBtn.lastChild.textContent = cur === 'none' ? 'Homeroom' : badgeLabel();
            ui['toggle-initial'].checked = state.display.surnameInitial;
            ui['toggle-colours'].checked = state.display.yearColours;
            ui['toggle-colours'].parentNode.style.display = hasYears() ? '' : 'none';
            ui['toggle-combo'].checked = !!state.display.combo;
            Array.prototype.forEach.call(root.querySelectorAll('[data-action="remove-year"]'), function (b) {
                var y = b.getAttribute('data-year');
                var n = state.students.filter(function (st) { return String(st.year) === y; }).length;
                b.disabled = !n;
                b.title = n ? 'Remove the ' + n + ' Year ' + y + ' student' + (n === 1 ? '' : 's') + ' (e.g. at the end of the year): they come off the list and their lockers become free'
                    : 'No Year ' + y + ' students';
            });
            Array.prototype.forEach.call(ui.tiers.children, function (b) { b.classList.toggle('lk-active', +b.getAttribute('data-n') === state.tiers); });
            Array.prototype.forEach.call(ui.order.children, function (b) { b.classList.toggle('lk-active', b.getAttribute('data-order') === state.order); });
            ui.order.classList.toggle('lk-disabled', false);
            Array.prototype.forEach.call(ui.side.children, function (b) { b.classList.toggle('lk-active', b.getAttribute('data-side') === state.side); });
            Array.prototype.forEach.call(ui.row.children, function (b) { b.classList.toggle('lk-active', b.getAttribute('data-row') === state.row); });
            ui.row.classList.toggle('lk-disabled', false);

            /* lockers */
            var canvas = ui.canvas;
            var scroll = canvas.scrollTop;
            canvas.innerHTML = '';
            if (!order.length) {
                var empty = make('div', 'lk-empty');
                empty.innerHTML = 'No lockers yet. Press <b>Lockers</b> and type the locker numbers, e.g. <code>101-160</code> ' +
                    'or <code>Corridor A: A1-A40</code>.';
                canvas.appendChild(empty);
            }
            var areaBox = null, areaName = null;
            state._bankIds.forEach(function (ids, bi) {
                var bank = state.banks[bi];
                if (areaBox === null || (bank.area || '') !== areaName) {
                    areaName = bank.area || '';
                    var areaEl = make('div', 'lk-area');
                    if (areaName) areaEl.appendChild(make('div', 'lk-area-name', areaName));
                    areaBox = make('div', 'lk-area-banks');
                    areaEl.appendChild(areaBox);
                    canvas.appendChild(areaEl);
                }
                var used = 0;
                ids.forEach(function (id) { if (state.assign[id]) used++; });
                var tiers = bankTiers(bank), side = bankSide(bank), row = bankRow(bank), ord = bankOrder(bank);
                var box = make('div', 'lk-bank' + (tiers === 1 ? ' lk-bank-wide' : ''));
                var head = make('div', 'lk-bank-head');
                var title = make('div', 'lk-bank-title');
                title.appendChild(make('span', 'lk-bank-name', bank.name));
                title.appendChild(make('span', 'lk-bank-info', ids.length + ' · ' + used + ' used'));
                head.appendChild(title);
                var tools = make('span', 'lk-bank-tools');
                tools.innerHTML =
                    '<button type="button" class="lk-btn lk-btn-bank" data-action="bank-settings" data-bank="' + bi + '" title="Height, direction, name">⚙</button>' +
                    (used ? '<button type="button" class="lk-btn lk-btn-bank" data-action="bank-empty" data-bank="' + bi + '" title="Take every name out of this bank (the lockers stay)">Empty</button>' : '') +
                    '<button type="button" class="lk-btn lk-btn-bank lk-btn-bank-del" data-action="bank-remove" data-bank="' + bi + '" title="Remove this bank of lockers">✕</button>';
                head.appendChild(tools);
                box.appendChild(head);
                if (openBank === bi) box.appendChild(bankSettings(bank, bi));
                var grid = make('div', 'lk-grid');
                var lay = bankLayout(ids.length, tiers, ord, side, row);
                gridStyle(grid, lay, side);
                ids.forEach(function (id, i) {
                    var cell = cellFor(id);
                    if (lay.pos) { cell.style.gridColumn = lay.pos[i].c; cell.style.gridRow = lay.pos[i].r; }
                    grid.appendChild(cell);
                });
                var wrap = make('div', 'lk-grid-wrap');
                wrap.appendChild(grid);
                box.appendChild(wrap);
                areaBox.appendChild(box);
            });
            canvas.scrollTop = scroll;

            /* pool */
            var pool = ui.pool;
            pool.innerHTML = '';
            var waiting = state.students.filter(function (s) { return !lockerOf(s.id); }).sort(bySurname);
            waiting.forEach(function (s) {
                var item = make('div', 'lk-pool-item');
                item.draggable = true;
                item.setAttribute('data-sid', s.id);
                paintYear(item, s);
                item.appendChild(make('span', 'lk-pool-name', s.surname + ', ' + s.firstName));
                if (badgeOf(s)) item.appendChild(make('span', 'lk-hr', badgeOf(s)));
                item.title = studentInfo(s) + '\nClick to put in the locker typed above, or drag onto a locker';
                pool.appendChild(item);
            });
            if (!state.students.length) {
                pool.appendChild(make('div', 'lk-pool-empty', 'No students yet. Press Import, or Paste.'));
            }
            ui.count.textContent = waiting.length;

            /* stats */
            var outN = Object.keys(state.out).length;
            var allocated = Object.keys(state.assign).length;
            var free = order.length - allocated - outN;
            ui.stats.innerHTML =
                '<div><b>' + order.length + '</b> lockers</div>' +
                '<div><b>' + allocated + '</b> allocated</div>' +
                '<div><b>' + Math.max(0, free) + '</b> free</div>' +
                (outN ? '<div><b>' + outN + '</b> out of service</div>' : '') +
                '<div><b>' + state.students.length + '</b> students</div>' +
                (waiting.length > free && state.students.length ? '<div class="lk-warn">Not enough free lockers for everyone</div>' : '');

            var legend = yearLegend();
            if (legend && order.length) canvas.insertBefore(legend, canvas.firstChild);

            /* everyone has a locker: hide the student list and show the totals above the lockers instead */
            var allPlaced = state.students.length > 0 && waiting.length === 0;
            root.classList.toggle('lk-all-placed', allPlaced);
            root.classList.toggle('lk-show-combo', !!state.display.combo);
            if (allPlaced) {
                var bar = make('div', 'lk-done-bar');
                bar.textContent = '✓ All ' + state.students.length + ' students have lockers · ' + order.length + ' lockers · ' +
                    Math.max(0, free) + ' free' + (outN ? ' · ' + outN + ' out of service' : '');
                canvas.insertBefore(bar, canvas.firstChild);
            }

            updateEntryBar();
            applySearch();
        }

        function bankSide(b) { return b.side || state.side; }
        function bankRow(b) { return b.row || state.row; }
        function bankTiers(b) { return b.tiers || state.tiers; }
        function bankOrder(b) { return b.order || state.order; }

        /* the ⚙ panel: each setting can follow the toolbar or be set for this bank only */
        var openBank = -1;
        function bankSettings(bank, bi) {
            function sel(key, label, choices) {
                var cur = bank[key] || '';
                return '<label class="lk-bs-opt">' + label + ' <select data-bank-opt="' + key + '" data-bank="' + bi + '">' +
                    choices.map(function (c) {
                        return '<option value="' + c[0] + '"' + (String(cur) === String(c[0]) ? ' selected' : '') + '>' + c[1] + '</option>';
                    }).join('') + '</select></label>';
            }
            var p = make('div', 'lk-bank-settings');
            p.innerHTML =
                '<label class="lk-bs-opt">Name <input type="text" data-bank-opt="name" data-bank="' + bi + '" value="' + esc(bank.name) + '"></label>' +
                sel('tiers', 'High', [['', 'Toolbar (' + state.tiers + ')'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']]) +
                sel('order', 'Numbers run', [['', 'Toolbar (' + (state.order === 'down' ? 'down' : 'across') + ')'], ['down', 'Down ↓'], ['across', 'Across →']]) +
                sel('side', 'First locker', [['', 'Toolbar (' + state.side + ')'], ['left', 'Left'], ['right', 'Right']]) +
                sel('row', 'First row', [['', 'Toolbar (' + state.row + ')'], ['top', 'Top'], ['bottom', 'Bottom']]) +
                '<label class="lk-bs-opt">Area <input type="text" data-bank-opt="area" data-bank="' + bi + '" value="' + esc(bank.area || '') + '" placeholder="none"></label>';
            return p;
        }

        function onBankOpt(e) {
            var el = e.target;
            var key = el.getAttribute('data-bank-opt');
            if (!key) return;
            var bank = state.banks[+el.getAttribute('data-bank')];
            if (!bank) return;
            var v = el.value.trim();
            if (key === 'name' && !v) { el.value = bank.name; return; }
            pushUndo();
            bank[key] = key === 'tiers' ? (parseInt(v, 10) || 0) : v;
            if (key === 'area') {
                /* keep banks of one area together: move this bank after the last bank in that area */
                var bi = state.banks.indexOf(bank);
                state.banks.splice(bi, 1);
                var at = -1;
                state.banks.forEach(function (b, k) { if ((b.area || '') === v) at = k; });
                state.banks.splice(at < 0 ? state.banks.length : at + 1, 0, bank);
                openBank = state.banks.indexOf(bank);
                rebuildIndex();
            }
            changed();
        }

        function gridStyle(grid, lay, side) {
            if (!lay.pos) {
                grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(var(--lk-cell-w), 1fr))';
                grid.classList.add('lk-grid-wrapfree');
                grid.classList.toggle('lk-rtl', side === 'right');
                return;
            }
            grid.style.gridTemplateColumns = 'repeat(' + lay.cols + ', var(--lk-cell-w))';
            grid.style.gridTemplateRows = 'repeat(' + lay.rows + ', auto)';
        }

        function cellFor(id) {
            var cell = make('div', 'lk-cell');
            cell.setAttribute('data-id', id);
            var sid = state.assign[id];
            var s = sid ? studentById(sid) : null;
            cell.appendChild(make('div', 'lk-num', id));
            if (state.out[id]) {
                cell.classList.add('lk-out');
                cell.appendChild(make('div', 'lk-out-label', 'Out of service'));
                cell.title = 'Locker ' + id + ' is out of service. Right-click to bring it back.';
            } else if (s) {
                cell.classList.add('lk-filled');
                paintYear(cell, s);
                cell.draggable = true;
                cell.setAttribute('data-sid', s.id);
                cell.appendChild(make('div', 'lk-first', s.firstName));
                cell.appendChild(make('div', 'lk-last', displaySurname(s)));
                if (badgeOf(s)) cell.appendChild(make('span', 'lk-hr lk-cell-badge', badgeOf(s)));   /* top-right corner */
                cell.title = 'Locker ' + id + ': ' + studentInfo(s) + '\nDrag to move or swap; right-click: out of service.';
            } else {
                cell.classList.add('lk-free');
                cell.title = 'Locker ' + id + ' is free. Click, then type a name. Right-click: out of service.';
            }
            var cb = comboOf(id);
            if (cb) cell.title += '\nCombination: ' + cb;
            /* own line under the name; a student without a combination keeps an empty line, so every
               locker stays the same height while combinations are shown */
            if (state.display.combo && s && !state.out[id]) cell.appendChild(make('div', 'lk-combo' + (cb ? '' : ' lk-combo-blank'), cb || '\u00a0'));
            if (state.sel === id) cell.classList.add('lk-selected');
            return cell;
        }

        function applySearch() {
            var q = norm(ui.search.value);
            var hits = 0;
            Array.prototype.forEach.call(ui.canvas.querySelectorAll('.lk-cell'), function (cell) {
                var hit = false;
                if (q) {
                    var id = cell.getAttribute('data-id');
                    var s = state.assign[id] ? studentById(state.assign[id]) : null;
                    hit = id.toLowerCase() === q || (s && searchText(s).indexOf(q) >= 0);
                }
                cell.classList.toggle('lk-hit', !!hit);
                if (hit) hits++;
            });
            Array.prototype.forEach.call(ui.pool.querySelectorAll('.lk-pool-item'), function (item) {
                var s = studentById(item.getAttribute('data-sid'));
                var hit = q && s && searchText(s).indexOf(q) >= 0;
                item.classList.toggle('lk-hit', !!hit);
            });
            root.classList.toggle('lk-searching', !!q);
            if (q && hits) {
                var first = ui.canvas.querySelector('.lk-hit');
                if (first && first.scrollIntoView && document.activeElement === ui.search) first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        }

        /* ----- selection + entry bar ----- */

        function selectLocker(id, focusName) {
            state.sel = id;
            Array.prototype.forEach.call(ui.canvas.querySelectorAll('.lk-selected'), function (c) { c.classList.remove('lk-selected'); });
            var cell = ui.canvas.querySelector('.lk-cell[data-id="' + cssEscape(id) + '"]');
            if (cell) {
                cell.classList.add('lk-selected');
                if (cell.scrollIntoView) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
            updateEntryBar();
            if (focusName) {
                ui['entry-name'].value = '';
                ui['entry-name'].focus();
            }
        }

        function cssEscape(s) {
            return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
        }

        function updateEntryBar() {
            var id = state.sel;
            if (document.activeElement !== ui['entry-locker']) ui['entry-locker'].value = id || '';
            ui['entry-locker'].classList.remove('lk-invalid');
            var cur = ui['entry-current'];
            if (!id) {
                cur.textContent = order.length ? 'Pick a locker' : '';
            } else if (state.out[id]) {
                cur.textContent = 'Out of service';
            } else if (state.assign[id]) {
                cur.textContent = 'Now: ' + fullName(studentById(state.assign[id]));
            } else {
                cur.textContent = 'Free';
            }
            ui['entry-out'].textContent = id && state.out[id] ? 'Back in' : 'Out';
            if (document.activeElement !== ui['entry-combo']) ui['entry-combo'].value = id ? comboOf(id) : '';
            ui['entry-combo'].disabled = !id || !state.assign[id];
            ui['entry-combo'].placeholder = id && !state.assign[id] ? 'no student' : '00 00 00';
            ui['entry-out'].disabled = !id;
        }

        function saveEntryCombo() {
            var id = targetLocker();
            if (!id) { setStatus('Pick a locker first, then type its combination.'); return; }
            if (!state.assign[id]) {
                if (ui['entry-combo'].value.trim()) setStatus('Locker ' + id + ' is empty. A combination belongs to a student, so put a student in the locker first.');
                ui['entry-combo'].value = '';
                return;
            }
            var v = normCombo(ui['entry-combo'].value);
            if (v === comboOf(id)) { ui['entry-combo'].value = v; return; }
            pushUndo();
            setCombo(id, v);
            if (v && comboCount() === 1) state.display.combo = true;
            changed();
            ui['entry-combo'].value = v;
            var who = fullName(studentById(state.assign[id]));
            setStatus(v ? who + ' (locker ' + id + ') combination: ' + v + '.' : who + '\'s combination cleared.');
        }

        function prevLocker(id, occupied) {
            var i = order.indexOf(id);
            for (var k = i - 1; k >= 0; k--) if (!state.out[order[k]] && (!occupied || state.assign[order[k]])) return order[k];
            return null;
        }

        /* next locker after id that is in service */
        function nextLocker(id, occupied) {
            var i = order.indexOf(id);
            for (var k = i + 1; k < order.length; k++) if (!state.out[order[k]] && (!occupied || state.assign[order[k]])) return order[k];
            return null;
        }

        function updateSuggestions() {
            var q = norm(ui['entry-name'].value);
            if (!q || q === '-' || q === 'x') { hideSuggestions(); return; }
            var scored = [];
            state.students.forEach(function (s) {
                var f = norm(s.firstName), l = norm(s.surname), full = f + ' ' + l, rev = l + ' ' + f;
                var score = -1;
                if (full.indexOf(q) === 0 || rev.indexOf(q) === 0) score = 0;
                else if (f.indexOf(q) === 0 || l.indexOf(q) === 0) score = 1;
                else if (full.indexOf(q) >= 0 || rev.indexOf(q) >= 0) score = 2;
                else if (initialsMatch(q, f, l)) score = 3;
                if (score < 0) return;
                var has = lockerOf(s.id);
                scored.push({ s: s, score: score + (has ? 10 : 0), locker: has });
            });
            scored.sort(function (a, b) { return a.score - b.score || bySurname(a.s, b.s); });
            suggestions = scored.slice(0, SUGGEST_LIMIT);
            suggestPos = 0;
            drawSuggestions();
        }

        /* "as" matches Alex Smith; "a sm" matches too */
        function initialsMatch(q, f, l) {
            var parts = q.split(' ');
            if (parts.length === 2) return (f.indexOf(parts[0]) === 0 && l.indexOf(parts[1]) === 0) || (l.indexOf(parts[0]) === 0 && f.indexOf(parts[1]) === 0);
            return q.length === 2 && f.charAt(0) === q.charAt(0) && l.charAt(0) === q.charAt(1);
        }

        function drawSuggestions() {
            var ul = ui.suggest;
            ul.innerHTML = '';
            if (!suggestions.length) {
                var li = make('li', 'lk-suggest-none', 'No student matches');
                ul.appendChild(li);
                ul.classList.add('lk-open');
                return;
            }
            suggestions.forEach(function (m, i) {
                var li = make('li', i === suggestPos ? 'lk-active' : '');
                li.setAttribute('data-sid', m.s.id);
                li.setAttribute('role', 'option');
                li.appendChild(make('span', 'lk-sg-name', fullName(m.s)));
                if (badgeOf(m.s)) li.appendChild(make('span', 'lk-hr', badgeOf(m.s)));
                if (m.locker) li.appendChild(make('span', 'lk-sg-has', 'has ' + m.locker));
                ul.appendChild(li);
            });
            ul.classList.add('lk-open');
        }

        function hideSuggestions() {
            ui.suggest.classList.remove('lk-open');
            suggestions = [];
        }

        function onNameKey(e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (!suggestions.length) return;
                e.preventDefault();
                suggestPos = (suggestPos + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
                drawSuggestions();
            } else if (e.key === 'Escape') {
                hideSuggestions();
                ui['entry-name'].value = '';
            } else if (e.key === 'Enter') {
                e.preventDefault();
                var v = ui['entry-name'].value.trim().toLowerCase();
                if (!state.sel) { setStatus('Choose a locker first: click one or type its number.'); ui['entry-locker'].focus(); return; }
                if (v === '') { advance(); return; }
                if (v === '-') { emptyLocker(state.sel); advance(); return; }
                if (v === 'x') { toggleOut(state.sel); advance(); return; }
                if (suggestions.length) commitEntry(suggestions[suggestPos].s.id);
                else setStatus('No student matches "' + ui['entry-name'].value.trim() + '".');
            } else if (e.key === 'Backspace' && e.shiftKey === false && e.ctrlKey && !ui['entry-name'].value) {
                e.preventDefault();
                emptyLocker(state.sel);
            }
        }

        /* the locker in the Locker box if it's valid, otherwise the selected one */
        function targetLocker() {
            var v = ui['entry-locker'].value.trim();
            var l = v && findLocker(v);
            if (l && l.id !== state.sel) selectLocker(l.id, false);
            return state.sel;
        }

        function commitEntry(sid) {
            var id = targetLocker();
            if (!id) return;
            if (state.out[id]) { setStatus('Locker ' + id + ' is out of service. Press "Back in" first.'); return; }
            var s = studentById(sid);
            var prevLocker = lockerOf(sid);
            var prevOwner = state.assign[id] ? studentById(state.assign[id]) : null;
            pushUndo();
            unassignStudent(sid);
            state.assign[id] = sid;
            var msg = fullName(s) + ' → locker ' + id + '.';
            if (prevLocker && prevLocker !== id) msg += ' (Moved from ' + prevLocker + '.)';
            if (prevOwner && prevOwner.id !== sid) msg += ' ' + fullName(prevOwner) + ' now has no locker.';
            setStatus(msg);
            hideSuggestions();
            render();
            save();
            advance();
        }

        function advance() {
            var next = nextLocker(state.sel);
            ui['entry-locker'].classList.remove('lk-valid', 'lk-invalid');
            if (next) { ui['entry-locker'].value = next; selectLocker(next, true); }
            else { ui['entry-name'].value = ''; setStatus('That was the last locker.'); }
        }

        function emptyLocker(id) {
            if (!id || !state.assign[id]) return;
            pushUndo();
            delete state.assign[id];
            changed();
        }

        function toggleOut(id) {
            if (!id) return;
            pushUndo();
            if (state.out[id]) {
                delete state.out[id];
                setStatus('Locker ' + id + ' is back in service.');
            } else {
                var s = state.assign[id] ? studentById(state.assign[id]) : null;
                delete state.assign[id];
                state.out[id] = true;
                setStatus('Locker ' + id + ' is out of service.' + (s ? ' ' + fullName(s) + ' now has no locker.' : ''));
            }
            changed();
        }

        /* ----- drag and drop ----- */

        function onDragStart(e) {
            var el = e.target.closest('[data-sid]');
            if (!el) return;
            dragId = el.getAttribute('data-sid');
            try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* old browsers */ }
        }

        function clearDragOver() {
            Array.prototype.forEach.call(root.querySelectorAll('.lk-drag-over'), function (c) { c.classList.remove('lk-drag-over'); });
        }

        function dropOnLocker(sid, target) {
            clearDragOver();
            if (state.out[target]) return;
            var from = lockerOf(sid);
            if (from === target) return;
            pushUndo();
            var other = state.assign[target];
            if (from) delete state.assign[from];
            state.assign[target] = sid;
            if (other && from) state.assign[from] = other;   /* swap */
            dragId = null;
            changed();
        }

        /* ----- toolbar ----- */

        function onRootClick(e) {
            var cell = e.target.closest('.lk-cell');
            if (cell && ui.canvas.contains(cell)) { selectLocker(cell.getAttribute('data-id'), true); return; }
            var item = e.target.closest('.lk-pool-item');
            if (item) {
                var tgt = targetLocker();
                if (tgt && !state.out[tgt]) commitEntry(item.getAttribute('data-sid'));
                else if (tgt) setStatus('Locker ' + tgt + ' is out of service.');
                else { setStatus('Type a locker number in the Locker box (or click a locker), then click or drag a name.'); ui['entry-locker'].focus(); }
                return;
            }
            var b = e.target.closest('[data-action]');
            if (!b || !root.contains(b)) return;
            var a = b.getAttribute('data-action');
            if (a === 'import' || a === 'import-add') { rosterMode = a === 'import-add' ? 'add' : 'replace'; ui.file.click(); }
            else if (a === 'import-json') ui['json-file'].click();
            else if (a === 'export-json') exportJson();
            else if (a === 'export-csv') openExport();
            else if (a === 'print-screen') printScreen();
            else if (a === 'print-grid') printGrid();
            else if (a === 'print-list') printList();
            else if (a === 'undo') undo();
            else if (a === 'reset') resetAll();
            else if (a === 'setup') openSetup();
            else if (a === 'by-student') openByStudent();
            else if (a === 'paste') openPaste();
            else if (a === 'combos') openCombos();
            else if (a === 'auto') autoAllocate(b.getAttribute('data-mode'));
            else if (a === 'clear-all') clearAll();
            else if (a === 'remove-year') removeYear(b.getAttribute('data-year'));
            else if (a === 'tiers') { pushUndo(); state.tiers = +b.getAttribute('data-n'); state.banks.forEach(function (k) { k.tiers = 0; }); changed(); }
            else if (a === 'order') { pushUndo(); state.order = b.getAttribute('data-order'); state.banks.forEach(function (k) { k.order = ''; }); changed(); }
            else if (a === 'side') { pushUndo(); state.side = b.getAttribute('data-side'); state.banks.forEach(function (k) { k.side = ''; }); changed(); }
            else if (a === 'row') { { pushUndo(); state.row = b.getAttribute('data-row'); state.banks.forEach(function (k) { k.row = ''; }); changed(); } }
            else if (a === 'bank-settings') { var k = +b.getAttribute('data-bank'); openBank = openBank === k ? -1 : k; render(); }
            else if (a === 'bank-remove' || a === 'bank-empty') bankAction(a, +b.getAttribute('data-bank'));
            else if (a === 'entry-clear') { emptyLocker(state.sel); ui['entry-name'].focus(); }
            else if (a === 'entry-out') { toggleOut(state.sel); ui['entry-name'].focus(); }
        }

        function bankAction(a, bi) {
            var bank = state.banks[bi];
            if (!bank) return;
            if (a === 'bank-side') {
                pushUndo();
                bank.side = bankSide(bank) === 'right' ? 'left' : 'right';
                if (bank.side === state.side) bank.side = '';
            } else if (a === 'bank-row') {
                pushUndo();
                bank.row = bankRow(bank) === 'bottom' ? 'top' : 'bottom';
                if (bank.row === state.row) bank.row = '';
            } else if (a === 'bank-empty') {
                var inBank = (state._bankIds[bi] || []).filter(function (id) { return state.assign[id]; });
                if (!inBank.length) return;
                if (!window.confirm('Take the ' + inBank.length + ' name' + (inBank.length === 1 ? '' : 's') + ' out of ' + bank.name +
                    '? The lockers stay; the students go back to the No locker list. (Undo can put them back.)')) return;
                pushUndo();
                inBank.forEach(function (id) { delete state.assign[id]; });
                setStatus(inBank.length + ' name' + (inBank.length === 1 ? '' : 's') + ' taken out of ' + bank.name + '.');
            } else {
                var ids = state._bankIds[bi] || [];
                var used = ids.filter(function (id) { return state.assign[id]; }).length;
                if (!window.confirm('Remove ' + bank.name + ' (' + ids.length + ' lockers)?' +
                    (used ? ' The ' + used + ' student' + (used === 1 ? '' : 's') + ' in it will have no locker.' : '') + ' Undo can bring it back.')) return;
                pushUndo();
                state.banks.splice(bi, 1);
                openBank = -1;
                rebuildIndex();
                setStatus(bank.name + ' removed.');
            }
            changed();
        }

        function shuffle(arr) {
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
            }
            return arr;
        }

        function autoAllocate(mode) {
            if (!order.length) { setStatus('Set up the lockers first.'); return; }
            if (!state.students.length) { setStatus('Import a class list first.'); return; }
            var keep = state.keepExisting;
            var students = state.students.filter(function (s) { return !keep || !lockerOf(s.id); });
            if (!students.length) { setStatus('Everyone already has a locker. Untick "Keep" to reallocate everyone.'); return; }
            if (!keep && Object.keys(state.assign).length &&
                !window.confirm('Reallocate every student? Their current lockers will change.')) return;
            pushUndo();
            if (!keep) state.assign = {};
            if (mode === 'RANDOM') shuffle(students);
            else if (mode === 'HOMEROOM') students.sort(function (a, b) {
                /* by whatever the badge shows (homeroom, TG, house ...), blanks last */
                var x = badgeField() === 'none' ? yearRoom(a) : badgeOf(a), y = badgeField() === 'none' ? yearRoom(b) : badgeOf(b);
                x = x || ''; y = y || '';
                if (!x !== !y) return x ? -1 : 1;
                return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }) || bySurname(a, b);
            });
            else students.sort(bySurname);
            var free = order.filter(function (id) { return !state.out[id] && !state.assign[id]; });
            var n = Math.min(free.length, students.length);
            for (var i = 0; i < n; i++) state.assign[free[i]] = students[i].id;
            changed();
            setStatus(n + ' student' + (n === 1 ? '' : 's') + ' given lockers' +
                (students.length > n ? '; ' + (students.length - n) + ' still need one (not enough free lockers).' : '.'));
        }

        function clearAll() {
            if (!Object.keys(state.assign).length) return;
            if (!window.confirm('Take every student out of their locker? (Undo can bring them back.)')) return;
            pushUndo();
            state.assign = {};
            changed();
        }

        /* Take every student of one year level off the list, e.g. Year 9s or Year 12s at the end of
           the year. Their lockers become free (and their combinations go with them). */
        function removeYear(year) {
            var leaving = state.students.filter(function (st) { return String(st.year) === String(year); });
            if (!leaving.length) {
                setStatus('There are no Year ' + year + ' students. (Students need a year level, e.g. from a Year or Year Level column.)');
                return;
            }
            var withLocker = leaving.filter(function (st) { return lockerOf(st.id); }).length;
            if (!window.confirm('Remove all ' + leaving.length + ' Year ' + year + ' student' + (leaving.length === 1 ? '' : 's') + '?' +
                (withLocker ? ' Their ' + withLocker + ' locker' + (withLocker === 1 ? '' : 's') + ' will become free.' : '') +
                '\n\nTip: Export or Save first if you want a record. Undo can bring them back.')) return;
            pushUndo();
            var gone = {};
            leaving.forEach(function (st) { gone[st.id] = true; });
            state.students = state.students.filter(function (st) { return !gone[st.id]; });
            Object.keys(state.assign).forEach(function (id) { if (gone[state.assign[id]]) delete state.assign[id]; });
            changed();
            setStatus(leaving.length + ' Year ' + year + ' student' + (leaving.length === 1 ? '' : 's') + ' removed' +
                (withLocker ? '; ' + withLocker + ' locker' + (withLocker === 1 ? ' is' : 's are') + ' now free' : '') + '. Undo brings them back.', true);
        }

        function resetAll() {
            if (!window.confirm('Reset to how this page was first set up? Your lockers, students and allocations in this browser will be removed. (Save first to keep a copy.)')) return;
            pushUndo();
            try { localStorage.removeItem(storageKey); } catch (e) { /* ignore */ }
            var keepUndo = undoStack;
            defaults();
            undoStack = keepUndo;
            changed();
            setStatus('Reset. Undo brings your work back.');
        }

        /* ----- import / export ----- */

        var rosterMode = 'replace';

        function onRosterFile(e) {
            var input = e.target, file = input.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onerror = function () { setStatus('Could not read that file.'); input.value = ''; };
            reader.onload = function (evt) {
                if (/\.csv$/i.test(file.name)) {
                    applyRoster(parseCSV(decodeBuffer(evt.target.result)), file.name);
                    input.value = '';
                } else {
                    loadXlsx().then(function (XLSX) {
                        var wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
                        applyRoster(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }), file.name);
                    }).catch(function (err) {
                        setStatus(err.message || 'Could not read that Excel file.', true);
                    }).then(function () { input.value = ''; });
                }
            };
            reader.readAsArrayBuffer(file);
        }

        /* Rows with Preferred/First Name, Surname, Homeroom and optionally Locker (and Status). */
        function applyRoster(rows, fileName) {
            var people = [], allocs = [], outs = [], combos = [];
            rows.forEach(function (row) {
                var r = {};
                Object.keys(row).forEach(function (k) { r[clean(k).toLowerCase()] = clean(row[k]); });
                var locker = r['locker'] || r['locker number'] || r['locker no'] || r['locker #'] || '';
                if (/^\d+\.0$/.test(locker)) locker = locker.slice(0, -2);
                var first = r['preferred'] || r['first name'] || r['firstname'] || r['given name'] || '';
                var surname = r['surname'] || r['surname name'] || r['last name'] || r['lastname'] || r['family name'] || '';
                if (locker && /out/i.test(r['status'] || '')) outs.push(locker);
                var combo = r['locker combo'] || r['combo'] || r['combination'] || r['lock combo'] || r['locker combination'] || r['lock combination'] || '';
                if (!first && !surname) { if (locker && combo) combos.push({ locker: locker, combo: combo }); return; }
                var extra = {};
                Object.keys(row).forEach(function (k) { if (!isKnownCol(k) && clean(row[k])) extra[clean(k)] = clean(row[k]); });
                var year = r['year'] || r['year level'] || r['yr'] || r['yr level'] || r['year group'] || r['grade'] || '';
                people.push({ first: first, surname: surname, homeroom: r['homeroom'] || r['home room'] || r['home group'] || r['homegroup'] || r['form'] || '',
                    year: year, locker: locker, extra: extra, combo: combo });
            });
            if (!people.length && combos.length) {
                /* a file of just lockers and combinations */
                pushUndo();
                var only = applyCombos(combos);
                changed();
                setStatus(comboMsg(only) || 'No combinations found.', true);
                return;
            }
            if (!people.length) {
                setStatus('No students found. The first row needs headings such as Preferred or First Name, and Surname.', true);
                return;
            }
            if (rosterMode === 'add' && state.students.length) { addRoster(people, outs, combos); return; }
            if (state.students.length && !window.confirm('Replace the ' + state.students.length +
                ' students already here with the ' + people.length + ' in this file? Their allocations will be replaced too.\n\n' +
                '(To keep them and add these students, press Cancel and use Add.)')) return;
            pushUndo();
            state.students = [];
            state.assign = {};
            people.forEach(function (p, i) {
                var s = newStudent(p.first, p.surname, p.homeroom, i, p.extra, p.year, p.combo);
                state.students.push(s);
                if (p.locker) allocs.push({ locker: p.locker, sid: s.id });
            });
            var msgs = placeAllocations(allocs);
            outs.forEach(function (id) { var l = findLocker(id); if (l && !state.assign[l.id]) state.out[l.id] = true; });
            var withCombo = state.students.filter(function (st) { return st.combo; }).length;
            if (withCombo) { state.display.combo = true; msgs.push(withCombo + ' with combinations.'); }
            msgs.push(comboMsg(applyCombos(combos)));
            var base = String(fileName || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
            if (base && (!state.title || state.title === 'Locker allocation' || state.title === cfg.title)) state.title = base;
            changed();
            setStatus(people.length + ' students imported' + (allocs.length ? ', ' + Object.keys(state.assign).length + ' with lockers' : '') + '. ' + msgs.join(' '), true);
        }

        /* Add to Roster: new students join the list. Anyone already on it (same first name and
           surname, or surname + first name the other way round) is not added twice; instead their
           details are filled in from the file: homeroom, and every other column such as TG or
           House (a value in the file replaces the old one). They also get the file's locker if they
           have none. Current allocations are kept. */
        function addRoster(people, outs, combos) {
            pushUndo();
            var byName = {};
            state.students.forEach(function (s) { byName[norm(fullName(s))] = s; });
            state.students.forEach(function (s) { var k = norm(s.surname + ' ' + s.firstName); if (!byName[k]) byName[k] = s; });
            var added = 0, already = 0, updated = 0, newCols = {}, allocs = [];
            var before = extraFields().map(function (f) { return f.toLowerCase(); });
            people.forEach(function (p, i) {
                var key = norm((p.first || 'Student') + ' ' + p.surname);
                var s = byName[key];
                if (s) {
                    already++;
                    var changedAny = false;
                    var hr = parseHomeroom(p.homeroom, p.year);
                    if (hr.room && hr.room !== s.homeroom) { s.homeroom = hr.room; changedAny = true; }
                    if (hr.year && hr.year !== s.year) { s.year = hr.year; changedAny = true; }
                    s.extra = s.extra || {};
                    Object.keys(p.extra).forEach(function (k) {
                        var existing = Object.keys(s.extra).filter(function (x) { return x.toLowerCase() === k.toLowerCase(); })[0];
                        if (existing && existing !== k) { delete s.extra[existing]; }
                        if (s.extra[k] !== p.extra[k]) { s.extra[k] = p.extra[k]; changedAny = true; }
                    });
                    if (normCombo(p.combo) && normCombo(p.combo) !== s.combo) { s.combo = normCombo(p.combo); changedAny = true; }
                    if (changedAny) updated++;
                } else {
                    s = newStudent(p.first, p.surname, p.homeroom, state.students.length + i, p.extra, p.year, p.combo);
                    state.students.push(s);
                    byName[key] = s;
                    added++;
                }
                if (p.locker && !lockerOf(s.id)) allocs.push({ locker: p.locker, sid: s.id });
            });
            var beforeN = Object.keys(state.assign).length;
            var msgs = placeAllocations(allocs);
            outs.forEach(function (id) { var l = findLocker(id); if (l && !state.assign[l.id]) state.out[l.id] = true; });
            msgs.push(comboMsg(applyCombos(combos || [])));
            var placed = Object.keys(state.assign).length - beforeN;
            extraFields().forEach(function (f) { if (before.indexOf(f.toLowerCase()) < 0) newCols[f] = true; });
            var cols = Object.keys(newCols);
            /* show a new column (e.g. TG) straight away if the badge was on its automatic setting */
            if (cols.length === 1 && (state.display.field || 'auto') === 'auto') state.display.field = cols[0];
            changed();
            setStatus(added + ' student' + (added === 1 ? '' : 's') + ' added' +
                (already ? ', ' + already + ' already on the list' + (updated ? ' (' + updated + ' updated)' : '') : '') +
                (cols.length ? '. New details: ' + cols.join(', ') + (cols.length > 1 ? ' (choose one under Badge)' : '') : '') +
                (placed ? ', ' + placed + ' given lockers from the file' : '') + '. ' + msgs.join(' '), true);
        }

        function onJsonFile(e) {
            var input = e.target, file = input.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (evt) {
                var before = snapshot();
                try {
                    restore(evt.target.result);
                    undoStack.push(before);
                    changed();
                    setStatus('Loaded ' + file.name + '.');
                } catch (err) {
                    restore(before);
                    setStatus('That is not a locker allocation file (' + (err.message || err) + ').', true);
                }
                input.value = '';
            };
            reader.readAsText(file);
        }

        function exportJson() {
            var text = JSON.stringify(JSON.parse(snapshot()), null, 2);
            saveFile(fileSlug(state.title, 'lockers') + '.json', 'Locker file', 'application/json', '.json', function () {
                return Promise.resolve(new Blob([text], { type: 'application/json' }));
            }).then(function (name) {
                if (name) setStatus('Saved ' + name + '. Open it later to carry on.');
            }).catch(function (err) {
                setStatus('Could not save: ' + (err && err.message ? err.message : err), true);
            });
        }

        /* Full locker list: one row per locker, then students with no locker. */
        function fullRows() {
            var fields = extraFields(true);
            var rows = [['Locker', 'Bank', 'Locker Combo', 'First Name', 'Surname', 'Year', 'Homeroom'].concat(fields).concat(['Status'])];
            function more(s) { return fields.map(function (f) { return s ? extraValue(s, f) : ''; }); }
            state._bankIds.forEach(function (ids, bi) {
                ids.forEach(function (id) {
                    var s = state.assign[id] ? studentById(state.assign[id]) : null;
                    rows.push([id, state.banks[bi].name, comboOf(id), s ? s.firstName : '', s ? s.surname : '', s ? s.year : '', s ? s.homeroom : '']
                        .concat(more(s)).concat([state.out[id] ? 'Out of service' : (s ? '' : 'Free')]));
                });
            });
            state.students.filter(function (s) { return !lockerOf(s.id); }).sort(bySurname).forEach(function (s) {
                rows.push(['', '', studentCombo(s), s.firstName, s.surname, s.year, s.homeroom].concat(more(s)).concat(['No locker']));
            });
            return rows;
        }

        /* Simple list for school systems: Surname Name | First Name | Year Level | Locker number */
        function simpleRows(o) {
            var list = state.students.filter(function (s) { return o.noLocker || lockerOf(s.id); });
            if (o.sort === 'locker') {
                var pos = {};
                order.forEach(function (id, i) { pos[id] = i; });
                list.sort(function (a, b) {
                    var la = lockerOf(a.id), lb = lockerOf(b.id);
                    if (!la !== !lb) return la ? -1 : 1;
                    return (la ? pos[la] - pos[lb] : 0) || bySurname(a, b);
                });
            } else list.sort(bySurname);
            var rows = [['Surname Name', 'First Name', 'Year Level', 'Locker number'].concat(o.combo ? ['Locker Combo'] : [])];
            list.forEach(function (s) {
                var y = s.year ? (o.yearWord ? 'Year ' + s.year : s.year) : '';
                var l = lockerOf(s.id) || '';
                rows.push([s.surname, s.firstName, y, l].concat(o.combo ? [studentCombo(s)] : []));
            });
            return rows;
        }

        function downloadRows(rows, name, format) {
            if (format === 'xlsx') {
                return saveFile(name + '.xlsx', 'Excel workbook',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', function () {
                    return loadXlsx().then(function (XLSX) {
                    /* locker and year numbers go in as numbers so Excel doesn't flag them as text */
                    var data = rows.map(function (r, i) {
                        return i === 0 ? r : r.map(function (v) { return /^\d{1,9}$/.test(String(v)) ? +v : v; });
                    });
                    var ws = XLSX.utils.aoa_to_sheet(data);
                    ws['!cols'] = rows[0].map(function (h, c) {
                        var w = String(h).length;
                        rows.forEach(function (r) { w = Math.max(w, String(r[c] == null ? '' : r[c]).length); });
                        return { wch: Math.min(40, w + 2) };
                    });
                    var wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Lockers');
                    var bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                    return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    });
                });
            }
            var text = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
            /* BOM so Excel opens accented names correctly */
            return saveFile(name + '.csv', 'CSV file', 'text/csv', '.csv', function () {
                return Promise.resolve(new Blob(['\ufeff' + text], { type: 'text/csv' }));
            });
        }

        /* Export dialog: which columns, and CSV or Excel. Choices are remembered. */
        function openExport() {
            var o = state.display.exportPrefs || {};
            o = { layout: o.layout || 'simple', format: o.format || 'xlsx', yearWord: !!o.yearWord,
                noLocker: o.noLocker !== false, sort: o.sort || 'surname',
                combo: o.combo != null ? !!o.combo : comboCount() > 0 };
            function radio(name, value, label, cur) {
                return '<label class="lk-check-row"><input type="radio" name="lk-x-' + name + '" value="' + value + '"' + (cur === value ? ' checked' : '') + '> <span>' + label + '</span></label>';
            }
            openModal('Export',
                '<div class="lk-x-group"><b>Columns</b>' +
                radio('layout', 'simple', 'Simple list: <code>Surname Name</code>, <code>First Name</code>, <code>Year Level</code>, <code>Locker number</code> (and <code>Locker Combo</code>)', o.layout) +
                radio('layout', 'full', 'Full locker list: every locker with bank, combination, name, year, homeroom, other details and status', o.layout) +
                '</div>' +
                '<div class="lk-x-group lk-x-simple"><b>Simple list options</b>' +
                '<label class="lk-check-row">Year Level as <select data-m="yearWord"><option value="0">7</option><option value="1">Year 7</option></select></label>' +
                '<label class="lk-check-row">Order by <select data-m="sort"><option value="surname">Surname</option><option value="locker">Locker number</option></select></label>' +
                '<label class="lk-check-row"><input type="checkbox" data-m="noLocker"> Include students without a locker (Locker number left blank)</label>' +
                '<label class="lk-check-row"><input type="checkbox" data-m="xcombo"> <span>Add a <code>Locker Combo</code> column</span></label>' +
                '</div>' +
                '<div class="lk-x-group"><b>File type</b>' +
                radio('format', 'xlsx', 'Excel (.xlsx)', o.format) +
                radio('format', 'csv', 'CSV (.csv), opens in Excel and most school systems', o.format) +
                '</div>',
                'Download', function () {
                    var get = function (n) { var el = mui.body.querySelector('input[name="lk-x-' + n + '"]:checked'); return el ? el.value : ''; };
                    var c = {
                        layout: get('layout'), format: get('format'),
                        yearWord: mui.body.querySelector('[data-m="yearWord"]').value === '1',
                        sort: mui.body.querySelector('[data-m="sort"]').value,
                        noLocker: mui.body.querySelector('[data-m="noLocker"]').checked,
                        combo: mui.body.querySelector('[data-m="xcombo"]').checked
                    };
                    state.display.exportPrefs = c;
                    save();
                    var rows = c.layout === 'full' ? fullRows() : simpleRows(c);
                    var name = fileSlug(state.title, 'lockers') + (c.layout === 'full' ? '' : '_list');
                    mui.ok.disabled = true;
                    downloadRows(rows, name, c.format).then(function (saved) {
                        mui.ok.disabled = false;
                        if (!saved) return;   /* cancelled: leave the dialog open */
                        closeModal();
                        setStatus('Exported ' + (rows.length - 1) + ' row' + (rows.length === 2 ? '' : 's') + ' to ' + saved + '.');
                    }).catch(function (err) {
                        mui.ok.disabled = false;
                        mui.msg.textContent = (err && err.message ? err.message : 'Excel export failed') + ' Try CSV instead.';
                    });
                });
            mui.body.querySelector('[data-m="yearWord"]').value = o.yearWord ? '1' : '0';
            mui.body.querySelector('[data-m="sort"]').value = o.sort;
            mui.body.querySelector('[data-m="noLocker"]').checked = o.noLocker;
            mui.body.querySelector('[data-m="xcombo"]').checked = o.combo;
            function sync() {
                var simple = mui.body.querySelector('input[name="lk-x-layout"]:checked').value === 'simple';
                mui.body.querySelector('.lk-x-simple').style.display = simple ? '' : 'none';
            }
            Array.prototype.forEach.call(mui.body.querySelectorAll('input[name="lk-x-layout"]'), function (r) { r.addEventListener('change', sync); });
            sync();
        }

        /* ----- printing ----- */

        function printGrid() {
            if (!order.length) { setStatus('There are no lockers to print.'); return; }
            var body = '<h1>' + esc(state.title) + '</h1><p class="lk-sub">' + Object.keys(state.assign).length + ' of ' + order.length + ' lockers allocated</p>';
            state._bankIds.forEach(function (ids, bi) {
                var bank = state.banks[bi], side = bankSide(bank);
                if (bi === 0 || (bank.area || '') !== (state.banks[bi - 1].area || '')) {
                    if (bi) body += '</div>';
                    body += (bank.area ? '<h2 class="lk-parea">' + esc(bank.area) + '</h2>' : '') + '<div class="lk-pareabanks">';
                }
                var lay = bankLayout(ids.length, bankTiers(bank), bankOrder(bank), side, bankRow(bank));
                var style = lay.pos ? 'grid-template-columns:repeat(' + lay.cols + ',27mm);grid-template-rows:repeat(' + lay.rows + ',auto)'
                    : 'grid-template-columns:repeat(' + Math.min(9, ids.length) + ',27mm)' + (side === 'right' ? ';direction:rtl' : '');
                body += '<div class="lk-pbank"><h3>' + esc(bank.name) + '</h3><div class="lk-pgrid" style="' + style + '">';
                ids.forEach(function (id, i) {
                    var s = state.assign[id] ? studentById(state.assign[id]) : null;
                    var at = lay.pos ? ' style="grid-column:' + lay.pos[i].c + ';grid-row:' + lay.pos[i].r + '"' : '';
                    body += '<div class="lk-pcell' + (state.out[id] ? ' out' : '') + '"' + at + '>' +
                        (s && !state.out[id] && badgeOf(s) ? '<small class="bd">' + esc(badgeOf(s)) + '</small>' : '') +
                        '<b>' + esc(id) + '</b>' +
                        (state.out[id] ? 'Out of service' : s ? '<span class="n">' + esc(s.firstName) + '</span> ' + esc(displaySurname(s)) : '') +
                        (state.display.combo && s && !state.out[id] ? '<span class="cb">' + (comboOf(id) ? esc(comboOf(id)) : '&nbsp;') + '</span>' : '') + '</div>';
                });
                body += '</div></div>';
            });
            if (order.length) body += '</div>';
            openPrintWindow(state.title, body, true);
        }

        /* Print Screen: the locker area as it looks now (colours, banks side by side, badges),
           without the toolbar, sidebar or bank buttons, scaled down to fit a landscape page. */
        function printScreen() {
            if (!order.length) { setStatus('There are no lockers to print.'); return; }
            var css = '';
            Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) {
                if (/lockers\.css/.test(l.href)) css = l.href;
            });
            var clone = ui.canvas.cloneNode(true);
            Array.prototype.forEach.call(clone.querySelectorAll('.lk-bank-tools, .lk-bank-settings, .lk-done-bar'), function (n) { n.remove(); });
            Array.prototype.forEach.call(clone.querySelectorAll('.lk-selected, .lk-hit, .lk-drag-over'), function (n) {
                n.classList.remove('lk-selected', 'lk-hit', 'lk-drag-over');
            });
            var outN = Object.keys(state.out).length;
            var body = '<div id="lk-fit"><div class="lockers lk-print-screen" translate="no">' +
                '<div class="lk-title">' + esc(state.title) + '</div>' +
                '<div class="lk-print-sub">' + Object.keys(state.assign).length + ' of ' + order.length + ' lockers allocated' +
                (outN ? ' · ' + outN + ' out of service' : '') + '</div>' +
                '<div class="lk-canvas">' + clone.innerHTML + '</div></div></div>';
            var head = (css ? '<link rel="stylesheet" href="' + esc(css) + '">' : '') +
                '<style>body{margin:0;background:#fff}' +
                '.lockers.lk-print-screen{border:none;margin:0;background:#fff;overflow:visible}' +
                '.lk-print-screen .lk-title{background:#fff;color:#000;font-size:18px;padding:0 0 2px}' +
                '.lk-print-sub{font:12px Arial,sans-serif;color:#444;margin:0 0 8px}' +
                '.lk-print-screen .lk-canvas{overflow:visible;padding:0;max-height:none}' +
                '.lk-print-screen .lk-grid-wrap{overflow:visible}' +
                '.lk-print-screen .lk-bank,.lk-print-screen .lk-area{break-inside:avoid}' +
                '.lk-print-screen .lk-cell{cursor:default}</style>';
            /* landscape A4 with 10 mm margins is about 1040 CSS px wide */
            openPrintWindow(state.title, body, true, { head: head, fitWidth: 1040 });
        }

        function printList() {
            if (!state.students.length) { setStatus('There are no students to print.'); return; }
            var list = state.students.slice().sort(bySurname);
            /* homeroom plus up to three extra columns (TG, House ...) that anyone has */
            var cols = [];
            if (list.some(function (s) { return s.year || roomOf(s); })) cols.push({ label: 'HR', get: function (s) { return yearRoom(s); } });
            extraFields().slice(0, 3).forEach(function (f) { cols.push({ label: f, get: function (s) { return extraValue(s, f); } }); });
            var withCombo = state.display.combo && comboCount() > 0;
            function row(s) {
                var l = lockerOf(s.id);
                return '<tr><td>' + esc(s.surname) + '</td><td>' + esc(s.firstName) + '</td>' +
                    cols.map(function (c) { return '<td>' + esc(c.get(s) || '') + '</td>'; }).join('') +
                    '<td><b>' + esc(l || '—') + '</b></td>' + (withCombo ? '<td class="cbc">' + esc(studentCombo(s)) + '</td>' : '') + '</tr>';
            }
            var head = '<thead><tr><th>Surname</th><th>First name</th>' +
                cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '<th>Locker</th>' + (withCombo ? '<th>Combo</th>' : '') + '</tr></thead>';
            function table(part) { return '<table class="lk-ltab">' + head + '<tbody>' + part.map(row).join('') + '</tbody></table>'; }

            /* Pages are built by hand so names run DOWN the first column, then down the second,
               then on to the next page. Two columns when there are only a few detail columns. */
            var twoCols = cols.length + (withCombo ? 1 : 0) <= 2;
            var FIRST = 40, LATER = 44;            /* rows per column: first page has the heading */
            var body = '<h1>' + esc(state.title) + '</h1><p class="lk-sub">Students in surname order</p>';
            var i = 0, page = 0;
            while (i < list.length) {
                var per = page === 0 ? FIRST : LATER;
                var take = twoCols ? per * 2 : per;
                var chunk = list.slice(i, i + take);
                if (twoCols && chunk.length <= per * 2) {
                    /* last page: split evenly so both columns are about the same length */
                    var half = chunk.length < take ? Math.ceil(chunk.length / 2) : per;
                    var left = chunk.slice(0, half), right = chunk.slice(half);
                    body += '<div class="lk-lpage' + (i + take < list.length ? ' lk-break' : '') + '"><div class="lk-lcol">' + table(left) + '</div>' +
                        (right.length ? '<div class="lk-lcol">' + table(right) + '</div>' : '') + '</div>';
                } else {
                    body += '<div class="lk-lpage' + (i + take < list.length ? ' lk-break' : '') + '"><div class="lk-lcol lk-lone">' + table(chunk) + '</div></div>';
                }
                i += take;
                page++;
            }
            openPrintWindow(state.title, body, false);
        }

        /* ----- dialogs ----- */

        function buildModal() {
            modal = make('div', 'lk-modal');
            noTranslate(modal);
            modal.innerHTML =
                '<div class="lk-modal-card" role="dialog" aria-modal="true">' +
                '<div class="lk-modal-head"><span data-m="title"></span><button type="button" class="lk-modal-close" data-m="close" aria-label="Close">✕</button></div>' +
                '<div class="lk-modal-body" data-m="body"></div>' +
                '<div class="lk-modal-foot"><span class="lk-modal-msg" data-m="msg"></span>' +
                '<button type="button" class="lk-btn lk-btn-grey" data-m="cancel">Cancel</button>' +
                '<button type="button" class="lk-btn" data-m="ok">Apply</button></div>' +
                '</div>';
            document.body.appendChild(modal);
            ['title', 'close', 'body', 'msg', 'cancel', 'ok'].forEach(function (k) { mui[k] = modal.querySelector('[data-m="' + k + '"]'); });
            mui.close.addEventListener('click', closeModal);
            mui.cancel.addEventListener('click', closeModal);
            modal.addEventListener('mousedown', function (e) { if (e.target === modal) closeModal(); });
            modal.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closeModal(); } });
        }

        function openModal(title, bodyHtml, okLabel, onOk, wide) {
            mui.title.textContent = title;
            mui.body.innerHTML = bodyHtml;
            mui.msg.textContent = '';
            mui.ok.textContent = okLabel || 'Apply';
            mui.ok.disabled = false;
            mui.ok.onclick = onOk;
            modal.firstChild.classList.toggle('lk-modal-wide', !!wide);
            modal.classList.add('lk-open');
        }

        function closeModal() { modal.classList.remove('lk-open'); mui.ok.onclick = null; }

        /* Set Up Lockers */
        function openSetup() {
            openModal('Set up lockers',
                '<p class="lk-help">One bank of lockers per line. Give it a name and a colon if you like, then the numbers: ' +
                'ranges such as <code>101-140</code>, <code>A1-A30</code> or <code>001-060</code>, and single lockers, separated by commas. ' +
                'After a <code>|</code> you can give a bank its own shape: <code>2 high</code>, <code>across</code> or <code>down</code>, ' +
                '<code>right</code> (first locker at the right-hand end), <code>bottom</code>. ' +
                'A line in square brackets such as <code>[Corridor A]</code> starts an area; the small banks under it sit side by side. ' +
                'Delete a line to remove that bank.</p>' +
                '<textarea class="lk-textarea" data-m="banks" rows="11" spellcheck="false" placeholder="[Corridor A]\nA1: 101-104 | 2 high\nA2: 211-213, 301-303 | 2 high across\nA3: 543-550 | 2 high right\n[Gym]\nGym: G1-G24"></textarea>' +
                '<div class="lk-preview" data-m="preview"></div>' +
                '<p class="lk-help">Students in lockers that you remove will go back to the <b>No locker</b> list.</p>',
                'Apply', applySetup);
            var ta = mui.body.querySelector('[data-m="banks"]');
            ta.value = banksToText(state.banks);
            var preview = mui.body.querySelector('[data-m="preview"]');
            function show() {
                var p = parseBankText(ta.value);
                preview.innerHTML = '<b>' + p.total + '</b> lockers in <b>' + p.banks.length + '</b> bank' + (p.banks.length === 1 ? '' : 's') +
                    (p.banks.length ? ': ' + p.banks.map(function (b) {
                        return esc(b.name) + ' (' + b.ids.length + (b.ids.length ? ', ' + esc(b.ids[0]) + (b.ids.length > 1 ? '…' + esc(b.ids[b.ids.length - 1]) : '') : '') + ')';
                    }).join(', ') : '') +
                    (p.errors.length ? '<div class="lk-errors">' + p.errors.map(esc).join('<br>') + '</div>' : '');
            }
            ta.addEventListener('input', show);
            show();
            setTimeout(function () { ta.focus(); }, 30);
        }

        function applySetup() {
            var ta = mui.body.querySelector('[data-m="banks"]');
            var p = parseBankText(ta.value);
            var keepIds = {};
            p.banks.forEach(function (b) { b.ids.forEach(function (id) { keepIds[id.toLowerCase()] = true; }); });
            var lost = Object.keys(state.assign).filter(function (id) { return !keepIds[id.toLowerCase()]; });
            if (lost.length && !window.confirm(lost.length + ' student' + (lost.length === 1 ? ' is' : 's are') +
                ' in lockers you are removing and will have no locker. Carry on?')) return;
            pushUndo();
            /* keep allocations whose locker still exists, even if its capitals changed */
            var oldAssign = state.assign, oldOut = state.out;
            state.banks = p.banks.map(cleanBank);
            state.assign = {};
            state.out = {};
            rebuildIndex();
            Object.keys(oldAssign).forEach(function (id) { var l = findLocker(id); if (l) state.assign[l.id] = oldAssign[id]; });
            Object.keys(oldOut).forEach(function (id) { var l = findLocker(id); if (l) state.out[l.id] = true; });
            closeModal();
            changed();
            setStatus(order.length + ' lockers set up.' + (lost.length ? ' ' + lost.length + ' student(s) now need a locker.' : ''));
        }

        /* Enter by Student: a table of students with a locker box each; Enter moves down. */
        function openByStudent() {
            if (!state.students.length) { setStatus('Import a class list first.'); return; }
            var list = state.students.slice().sort(bySurname);
            openModal('Enter lockers by student',
                '<p class="lk-help">Type each student\'s locker number. <b>Enter</b> or <b>↓</b> moves to the next student, <b>↑</b> goes back. ' +
                'Leave a box blank for no locker. Problems show in red.</p>' +
                '<div class="lk-bs-filter"><input type="search" data-m="filter" placeholder="Filter by name, year (Y7), homeroom (H13), 7 H13 …"></div>' +
                '<div class="lk-bs-wrap"><table class="lk-bs"><thead><tr><th>Surname</th><th>First name</th><th>' + esc(badgeLabel() || 'HR') + '</th><th>Locker</th><th></th></tr></thead><tbody>' +
                list.map(function (s) {
                    return '<tr data-sid="' + esc(s.id) + '"><td>' + esc(s.surname) + '</td><td>' + esc(s.firstName) + '</td><td title="' + esc(studentInfo(s)) + '">' + esc(badgeOf(s) || yearRoom(s)) + '</td>' +
                        '<td><input type="text" class="lk-bs-input" autocomplete="off" spellcheck="false" value="' + esc(lockerOf(s.id) || '') + '"></td>' +
                        '<td class="lk-bs-note"></td></tr>';
                }).join('') +
                '</tbody></table></div>',
                'Save', saveByStudent, true);
            var inputs = Array.prototype.slice.call(mui.body.querySelectorAll('.lk-bs-input'));
            inputs.forEach(function (inp, i) {
                inp.addEventListener('input', validateByStudent);
                inp.addEventListener('focus', function () { inp.select(); });
                inp.addEventListener('keydown', function (e) {
                    var step = (e.key === 'Enter' || e.key === 'ArrowDown') ? 1 : e.key === 'ArrowUp' ? -1 : 0;
                    if (!step) return;
                    e.preventDefault();
                    for (var k = i + step; k >= 0 && k < inputs.length; k += step) {
                        if (inputs[k].closest('tr').style.display !== 'none') { inputs[k].focus(); return; }
                    }
                    if (step > 0) mui.ok.focus();
                });
            });
            var filter = mui.body.querySelector('[data-m="filter"]');
            filter.addEventListener('input', function () {
                var q = norm(filter.value);
                Array.prototype.forEach.call(mui.body.querySelectorAll('.lk-bs tbody tr'), function (tr) {
                    tr.style.display = !q || norm(tr.textContent + ' ' + tr.cells[2].title).indexOf(q) >= 0 || norm(tr.cells[1].textContent + ' ' + tr.cells[0].textContent).indexOf(q) >= 0 ? '' : 'none';
                });
            });
            validateByStudent();
            setTimeout(function () {
                var firstBlank = inputs.filter(function (i) { return !i.value; })[0] || inputs[0];
                if (firstBlank) firstBlank.focus();
            }, 30);
        }

        function validateByStudent() {
            var rows = Array.prototype.slice.call(mui.body.querySelectorAll('.lk-bs tbody tr'));
            var counts = {};
            rows.forEach(function (tr) {
                var v = tr.querySelector('input').value.trim();
                var l = v && findLocker(v);
                if (l) counts[l.id] = (counts[l.id] || 0) + 1;
            });
            var bad = 0, filled = 0;
            rows.forEach(function (tr) {
                var inp = tr.querySelector('input'), note = tr.querySelector('.lk-bs-note');
                var v = inp.value.trim(), l = v && findLocker(v), msg = '';
                if (v && !l) msg = 'No such locker';
                else if (l && state.out[l.id]) msg = 'Out of service';
                else if (l && counts[l.id] > 1) msg = 'Used twice';
                if (l && !msg) filled++;
                if (msg) bad++;
                tr.classList.toggle('lk-bad', !!msg);
                note.textContent = msg;
            });
            mui.msg.textContent = filled + ' with lockers' + (bad ? ' · ' + bad + ' to fix (left without a locker if you save)' : '');
        }

        function saveByStudent() {
            var rows = Array.prototype.slice.call(mui.body.querySelectorAll('.lk-bs tbody tr'));
            pushUndo();
            var assign = {}, skipped = 0;
            /* lockers not in the table keep nobody; table is the whole truth for these students */
            rows.forEach(function (tr) {
                if (tr.classList.contains('lk-bad')) { skipped++; return; }
                var v = tr.querySelector('input').value.trim();
                var l = v && findLocker(v);
                if (l) assign[l.id] = tr.getAttribute('data-sid');
            });
            state.assign = assign;
            closeModal();
            changed();
            setStatus('Saved. ' + Object.keys(assign).length + ' students have lockers' + (skipped ? '; ' + skipped + ' left without one because of problems.' : '.'));
        }

        /* Paste Allocations: lines like "Alex Smith, 105", "105 Alex Smith", or two columns copied from Excel. */
        function openPaste() {
            openModal('Paste allocations and combinations',
                '<p class="lk-help">Paste or type one student per line with their locker number, in any order: ' +
                '<code>Alex Smith 105</code>, <code>105, Smith, Alex</code>, or columns copied from Excel. ' +
                'A combination such as <code>07 33 03</code> on the line is saved with that student. ' +
                'A line with just a locker and a combination (<code>506 07 33 03</code>) gives the combination to the student in that locker.</p>' +
                '<p class="lk-help">If the first line is a heading row, such as <code style="white-space:normal">Surname Name · First Name · Year Level · Locker number · Locker Combo</code>, ' +
                'the columns are read by their headings.</p>' +
                '<textarea class="lk-textarea" data-m="paste" rows="10" spellcheck="false" placeholder="Surname Name\tFirst Name\tYear Level\tLocker number\tLocker Combo\nBarden\tOliver\t7\t506\t07 33 03\n\nor:  Alex Smith 105 07 33 03\nor:  506 07 33 03"></textarea>' +
                '<label class="lk-check-row"><input type="checkbox" data-m="addnew"> Add names that are not on the class list as new students</label>' +
                '<label class="lk-check-row"><input type="checkbox" data-m="addlockers"> Add locker numbers that are not set up yet (to an "Other" bank)</label>' +
                '<div class="lk-preview" data-m="preview"></div>',
                'Apply', applyPaste, true);
            var ta = mui.body.querySelector('[data-m="paste"]');
            var boxes = mui.body.querySelectorAll('input[type="checkbox"]');
            function show() { renderPastePreview(parsePaste(ta.value)); }
            ta.addEventListener('input', show);
            Array.prototype.forEach.call(boxes, function (b) { b.addEventListener('change', show); });
            show();
            setTimeout(function () { ta.focus(); }, 30);
        }

        function studentNameIndex() {
            var idx = {};
            state.students.forEach(function (s) {
                [norm(fullName(s)), norm(s.surname + ' ' + s.firstName)].forEach(function (k) {
                    if (!idx[k]) idx[k] = [];
                    if (idx[k].indexOf(s) < 0) idx[k].push(s);
                });
            });
            return idx;
        }

        /* Heading names that Paste understands when the first line is a heading row */
        var PASTE_HEADS = {
            surname: ['surname', 'surname name', 'last name', 'lastname', 'family name'],
            first: ['first name', 'preferred', 'firstname', 'given name', 'preferred name'],
            name: ['name', 'student', 'student name', 'full name'],
            year: ['year', 'year level', 'yr', 'yr level', 'year group', 'grade'],
            locker: ['locker', 'locker number', 'locker no', 'locker #', 'locker num'],
            combo: ['locker combo', 'combo', 'combination', 'lock combo', 'locker combination', 'lock combination']
        };

        /* Turns pasted text into items {raw, locker, combo, nameParts:[...], year}. */
        function pasteItems(text) {
            var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
            if (!lines.length) return [];
            var first = lines[0], delim = first.indexOf('\t') >= 0 ? '\t' : (first.indexOf(',') >= 0 ? ',' : (first.indexOf(';') >= 0 ? ';' : null));
            var heads = delim ? first.split(delim).map(function (h) { return clean(h).toLowerCase(); }) : [];
            var col = {};
            Object.keys(PASTE_HEADS).forEach(function (k) {
                heads.forEach(function (h, i) { if (col[k] == null && PASTE_HEADS[k].indexOf(h) >= 0) col[k] = i; });
            });
            if (col.locker != null || col.surname != null || col.first != null) {
                /* heading row: read columns by name */
                return lines.slice(1).map(function (line) {
                    var f = line.split(delim).map(clean);
                    var get = function (k) { return col[k] != null ? (f[col[k]] || '') : ''; };
                    var parts = col.name != null && !get('first') && !get('surname') ? [get('name')] : [get('first'), get('surname')];
                    return { raw: line.trim(), locker: get('locker'), combo: get('combo'), nameParts: parts.filter(Boolean),
                        year: yearDigits(get('year')), swapped: false, headed: true };
                });
            }
            return lines.map(function (line) {
                var raw = line.trim();
                var fields = raw.split(/\t|,|;/).map(clean).filter(Boolean);
                var combo = '';
                /* a field that looks like a combination ("07 33 03", "7-33-3") */
                for (var i = 0; i < fields.length; i++) {
                    if (COMBO_RE.test(fields[i]) && fields.length > 1) { combo = fields[i]; fields.splice(i, 1); break; }
                }
                if (fields.length === 1) {
                    var words = fields[0].split(/\s+/);
                    /* "Alex Smith 105 07 33 03" or "506 07 33 03": the last three 1–2 digit numbers are the combination */
                    if (!combo && words.length >= 4 && words.slice(-3).every(function (w) { return /^\d{1,2}$/.test(w); })) {
                        combo = words.slice(-3).join(' ');
                        words = words.slice(0, -3);
                    }
                    fields = words;
                }
                /* the locker: a field that is a known locker, else the last number-like field */
                var li = -1;
                fields.forEach(function (f, i) { if (li < 0 && findLocker(f) && /\d/.test(f)) li = i; });
                if (li < 0) for (var j = fields.length - 1; j >= 0; j--) if (/\d/.test(fields[j]) && SINGLE_RE.test(fields[j])) { li = j; break; }
                var locker = li >= 0 ? fields[li] : '';
                var rest = fields.filter(function (f, i) { return i !== li; });
                /* a lone number left over (e.g. the year level 7) is not part of the name */
                var year = '';
                rest = rest.filter(function (f) {
                    if (/^\d{1,2}$/.test(f)) { if (!year) year = String(+f); return false; }
                    if (/^(?:year|yr|y)\s*\d{1,2}$/i.test(f)) { if (!year) year = yearDigits(f); return false; }
                    return true;
                });
                return { raw: raw, locker: locker, combo: combo, nameParts: rest, year: year, swapped: rest.length === 2 };
            });
        }

        function parsePaste(text) {
            var addNew = mui.body.querySelector('[data-m="addnew"]').checked;
            var addLockers = mui.body.querySelector('[data-m="addlockers"]').checked;
            var idx = studentNameIndex();
            var out = { ok: [], problems: [], addNew: addNew, addLockers: addLockers };
            var usedLockers = {}, usedStudents = {};
            pasteItems(text).forEach(function (it) {
                var raw = it.raw;
                var name = it.nameParts.join(' ');
                if (!it.locker) {
                    out.problems.push({ line: raw, why: name ? 'no locker number' : 'no name or locker' });
                    return;
                }
                var l = findLocker(it.locker);
                if (!l && !addLockers) { out.problems.push({ line: raw, why: 'locker ' + it.locker + ' is not set up' }); return; }
                var lockerId = l ? l.id : it.locker;
                var lk = lockerId.toLowerCase();
                if (usedLockers[lk]) { out.problems.push({ line: raw, why: 'locker ' + lockerId + ' is pasted twice' }); return; }
                if (!name) {
                    if (!normCombo(it.combo)) { out.problems.push({ line: raw, why: 'no name' }); return; }
                    if (!l || !state.assign[l.id]) { out.problems.push({ line: raw, why: 'nobody is in locker ' + lockerId + ' to give this combination to' }); return; }
                    usedLockers[lk] = true;
                    out.ok.push({ locker: lockerId, student: studentById(state.assign[l.id]), comboOnly: true, combo: it.combo, newLocker: false });
                    return;
                }
                if (l && state.out[l.id]) { out.problems.push({ line: raw, why: 'locker ' + l.id + ' is out of service' }); return; }
                var key = norm(name), hits = idx[key];
                /* "Smith Alex" pasted as two fields also matches via the surname-first key */
                if (!hits && it.nameParts.length === 2) hits = idx[norm(it.nameParts[1] + ' ' + it.nameParts[0])];
                if (hits && hits.length > 1) { out.problems.push({ line: raw, why: hits.length + ' students are called ' + name }); return; }
                var st = hits ? hits[0] : null;
                if (!st && !addNew) { out.problems.push({ line: raw, why: '"' + name + '" is not on the class list' }); return; }
                var sk = st ? st.id : 'new:' + key;
                if (usedStudents[sk]) { out.problems.push({ line: raw, why: name + ' is pasted twice' }); return; }
                usedLockers[lk] = true;
                usedStudents[sk] = true;
                out.ok.push({ locker: lockerId, student: st, name: name, nameParts: it.nameParts, headed: it.headed,
                    combo: it.combo, year: it.year, newLocker: !l });
            });
            return out;
        }

        function renderPastePreview(p) {
            var prev = mui.body.querySelector('[data-m="preview"]');
            var newS = p.ok.filter(function (o) { return !o.student; }).length;
            var newL = p.ok.filter(function (o) { return o.newLocker; }).length;
            var combos = p.ok.filter(function (o) { return normCombo(o.combo); }).length;
            var only = p.ok.filter(function (o) { return o.comboOnly; }).length;
            prev.innerHTML = '<b>' + p.ok.length + '</b> ready' +
                (combos ? ' (' + combos + ' with a combination' + (only ? ', ' + only + ' combination only' : '') + ')' : '') +
                (newS ? ' (' + newS + ' new student' + (newS === 1 ? '' : 's') + ')' : '') +
                (newL ? ' (' + newL + ' new locker' + (newL === 1 ? '' : 's') + ')' : '') +
                (p.problems.length ? ' · <b>' + p.problems.length + '</b> skipped:<div class="lk-errors">' +
                    p.problems.slice(0, 30).map(function (x) { return esc(x.line) + ' — ' + esc(x.why); }).join('<br>') +
                    (p.problems.length > 30 ? '<br>…' : '') + '</div>' : '');
            mui.ok.disabled = !p.ok.length;
            mui.msg.textContent = 'Other allocations stay as they are.';
        }

        function applyPaste() {
            var p = parsePaste(mui.body.querySelector('[data-m="paste"]').value);
            if (!p.ok.length) return;
            pushUndo();
            var allocs = [], bumped = 0, combos = [];
            p.ok.forEach(function (o, i) {
                if (o.comboOnly) {
                    combos.push({ sid: o.student.id, combo: o.combo });
                    return;
                }
                var st = o.student;
                if (!st) {
                    /* headed rows give [first, surname]; free text is "First Surname ..." */
                    var parts = o.headed ? o.nameParts : o.name.split(/\s+/);
                    st = newStudent(parts[0], parts.slice(1).join(' '), '', state.students.length + i, null, o.year);
                    state.students.push(st);
                } else if (o.year && !st.year) {
                    st.year = o.year;
                }
                allocs.push({ locker: o.locker, sid: st.id });
                if (normCombo(o.combo)) combos.push({ sid: st.id, combo: o.combo });
            });
            /* pasted lockers win: clear them first so placeAllocations doesn't call them clashes */
            allocs.forEach(function (a) {
                var l = findLocker(a.locker);
                if (l && state.assign[l.id] && state.assign[l.id] !== a.sid) { delete state.assign[l.id]; bumped++; }
            });
            var msgs = placeAllocations(allocs);
            var cr = applyCombos(combos);
            closeModal();
            changed();
            setStatus(allocs.length + ' allocation' + (allocs.length === 1 ? '' : 's') + ' applied' +
                (bumped ? '; ' + bumped + ' student(s) lost their locker to a pasted one' : '') +
                (p.problems.length ? '; ' + p.problems.length + ' line(s) skipped' : '') + '. ' + comboMsg(cr) + msgs.join(' '), true);
        }

        /* Combos: every student with a box for their combination, in locker order (students with
           no locker at the end); Enter moves down. */
        function openCombos() {
            if (!state.students.length) { setStatus('Import a class list first.'); return; }
            var rows = [];
            order.forEach(function (id) { if (state.assign[id]) rows.push({ id: id, st: studentById(state.assign[id]) }); });
            state.students.filter(function (st) { return !lockerOf(st.id); }).sort(bySurname).forEach(function (st) { rows.push({ id: '', st: st }); });
            openModal('Lock combinations',
                '<p class="lk-help">Type each student\'s padlock combination, e.g. <code>07 33 03</code> (<code>7-33-3</code> or <code>073303</code> work too). ' +
                'A combination stays with the student if they move lockers. ' +
                '<b>Enter</b> or <b>↓</b> moves to the next student, <b>↑</b> goes back. Clear a box to remove a combination. ' +
                'To paste a whole list, use <b>Paste</b> instead.</p>' +
                '<div class="lk-bs-filter"><input type="search" data-m="filter" placeholder="Filter by locker, name or bank"></div>' +
                '<div class="lk-bs-wrap"><table class="lk-bs"><thead><tr><th>Locker</th><th>Bank</th><th>Student</th><th>Combination</th></tr></thead><tbody>' +
                rows.map(function (r) {
                    var l = r.id ? findLocker(r.id) : null;
                    return '<tr data-sid="' + esc(r.st.id) + '"><td><b>' + esc(r.id || '—') + '</b></td><td>' + esc(l ? state.banks[l.bank].name : 'No locker') + '</td><td>' +
                        esc(fullName(r.st)) + '</td>' +
                        '<td><input type="text" class="lk-bs-input lk-combo-input" autocomplete="off" spellcheck="false" value="' + esc(studentCombo(r.st)) + '"></td></tr>';
                }).join('') + '</tbody></table></div>',
                'Save', function () {
                    pushUndo();
                    var had = comboCount();
                    Array.prototype.forEach.call(mui.body.querySelectorAll('.lk-bs tbody tr'), function (tr) {
                        setStudentCombo(studentById(tr.getAttribute('data-sid')), tr.querySelector('input').value);
                    });
                    var n = comboCount();
                    if (n && !had) state.display.combo = true;
                    closeModal();
                    changed();
                    setStatus(n + ' student' + (n === 1 ? ' has a combination.' : 's have combinations.'));
                }, true);
            var inputs = Array.prototype.slice.call(mui.body.querySelectorAll('.lk-combo-input'));
            function count() {
                var filled = inputs.filter(function (i) { return i.value.trim(); }).length;
                mui.msg.textContent = filled + ' of ' + inputs.length + ' students have a combination';
            }
            inputs.forEach(function (inp, i) {
                inp.addEventListener('focus', function () { inp.select(); });
                inp.addEventListener('input', count);
                inp.addEventListener('blur', function () { inp.value = normCombo(inp.value); });
                inp.addEventListener('keydown', function (e) {
                    var step = (e.key === 'Enter' || e.key === 'ArrowDown') ? 1 : e.key === 'ArrowUp' ? -1 : 0;
                    if (!step) return;
                    e.preventDefault();
                    inp.value = normCombo(inp.value);
                    for (var k = i + step; k >= 0 && k < inputs.length; k += step) {
                        if (inputs[k].closest('tr').style.display !== 'none') { inputs[k].focus(); return; }
                    }
                    if (step > 0) mui.ok.focus();
                });
            });
            var filter = mui.body.querySelector('[data-m="filter"]');
            filter.addEventListener('input', function () {
                var q = norm(filter.value);
                Array.prototype.forEach.call(mui.body.querySelectorAll('.lk-bs tbody tr'), function (tr) {
                    tr.style.display = !q || norm(tr.textContent).indexOf(q) >= 0 ? '' : 'none';
                });
            });
            count();
            setTimeout(function () {
                var firstBlank = inputs.filter(function (x) { return !x.value; })[0] || inputs[0];
                if (firstBlank) firstBlank.focus();
            }, 30);
        }

        /* ----- start ----- */

        defaults();
        load();
        rebuildIndex();
        build();
        buildModal();
        noTranslate(root);
        render();
        updateUndo();
    }

    function init() {
        Array.prototype.forEach.call(document.querySelectorAll('.lockers[data-lockers]'), function (root) {
            if (root.lkReady) return;
            root.lkReady = true;
            var cfg;
            try { cfg = JSON.parse(root.getAttribute('data-lockers')); } catch (e) { return; }
            try { new Lockers(root, cfg); } catch (err) {
                root.textContent = 'The locker tool could not start: ' + (err.message || err);
                if (window.console) console.error(err);
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
