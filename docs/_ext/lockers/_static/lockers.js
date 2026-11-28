/* ===== ClassroomPaste v1: paste a class list copied from a spreadsheet =====
   Shared by the classroom directives (namepicker, studentgroups, seatingplan, lockers). The same block is
   copied into each directive's .js so every directive still works on its own; whichever loads first
   defines window.ClassroomPaste and the others reuse it. Keep the copies identical.

   Understands:
   - columns copied from Excel / Google Sheets / Word tables (tab separated), CSV or semicolon text,
     or one student per line;
   - with or without a heading row (Preferred, First Name, Surname, Name, Homeroom, TG, Year, ...);
   - names in separate columns, or one column as "Alex Smith", "SMITH Alex", "Smith, Alex",
     "Smith Alex" (sorted by surname), "Alexander (Alex) Smith";
   - homeroom / year level / locker / combination columns recognised from what is in them.
   Every column's guess can be changed in the dialog before the list is used.

   ClassroomPaste.open({
       title: 'Paste a class list',
       lockers: false,          // offer Locker number and Locker combination columns
       extra: false,            // offer "Keep as extra info" for columns with no heading
       keepNameless: false,     // pass on rows without a name (lockers: locker + combination only)
       actions: [{ value: 'replace', label: 'Use this list', primary: true }],
       onApply: function (rows, action, info) { ... return false to keep the dialog open }
   });
   rows are objects keyed like a spreadsheet heading row: 'First Name', 'Surname', 'Homeroom',
   'Year Level', 'Locker number', 'Locker Combo', plus any other headed column under its own heading. */
(function () {
    'use strict';
    if (window.ClassroomPaste && window.ClassroomPaste.version >= 1) return;

    var ROLES = {
        first: 'First name',
        firstalt: 'First name (if no preferred)',
        surname: 'Surname',
        full: 'Full name (First Surname)',
        fullrev: 'Full name (Surname First)',
        homeroom: 'Homeroom / TG',
        year: 'Year level',
        locker: 'Locker number',
        combo: 'Locker combination',
        keep: 'Keep as extra info',
        ignore: 'Ignore'
    };
    var KEYS = { first: 'First Name', surname: 'Surname', homeroom: 'Homeroom', year: 'Year Level',
        locker: 'Locker number', combo: 'Locker Combo' };

    /* heading text -> role. 'preferred' beats a legal first name when both are there. */
    var HEADS = {
        preferred: ['preferred', 'preferred name', 'preferred first name', 'known as', 'nickname'],
        first: ['first name', 'firstname', 'first', 'given name', 'given names', 'forename', 'forenames', 'legal first name'],
        surname: ['surname', 'surname name', 'last name', 'lastname', 'last', 'family name', 'family names', 'legal surname'],
        full: ['name', 'names', 'student', 'students', 'student name', 'student names', 'full name', 'pupil', 'learner'],
        fullrev: ['surname, first name', 'surname first name', 'surname, preferred', 'surname preferred', 'name (surname first)'],
        homeroom: ['homeroom', 'home room', 'home group', 'homegroup', 'form', 'form group', 'tg', 'tutor group',
            'tutorgroup', 'pc', 'pc group', 'pastoral care', 'pastoral group', 'roll class', 'roll group', 'mentor group', 'care group'],
        year: ['year', 'year level', 'yr', 'yr level', 'year group', 'grade', 'yl', 'level'],
        locker: ['locker', 'locker number', 'locker no', 'locker no.', 'locker #', 'locker num'],
        combo: ['locker combo', 'combo', 'combination', 'lock combo', 'locker combination', 'lock combination']
    };
    var PARTICLES = ['van', 'von', 'der', 'den', 'de', 'del', 'della', 'da', 'di', 'du', 'dos', 'das', 'le', 'la', 'st', 'st.', 'ter', 'ten', 'bin', 'binti', 'al', 'el', 'ben', 'mac'];

    var COMBO_RE = /^\d{1,2}\s*[\s\-:.\/]\s*\d{1,2}\s*[\s\-:.\/]\s*\d{1,2}$/;
    var YEAR_RE = /^(?:y(?:ea)?r?\.?\s*|grade\s*)?(\d{1,2})$/i;
    var HOMEROOM_RE = /^(?:\d{1,2}\s?[.\-\/]?\s?[A-Za-z][A-Za-z0-9]{0,4}|[A-Za-z]{1,4}\s?[.\-]?\s?\d{1,2}[A-Za-z]?)$/;
    var LOCKER_RE = /^[A-Za-z]{0,3}[\s\-]?\d{1,4}[A-Za-z]?$/;

    function clean(v) {
        return v == null ? '' : String(v).replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function headKey(h) { return clean(h).toLowerCase().replace(/[:*]+$/, '').trim(); }
    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function isCaps(w) { return /[A-Z]/.test(w) && w.length > 1 && w === w.toUpperCase() && !/\d/.test(w); }
    /* SMITH -> Smith, O'NEIL -> O'Neil, SMITH-JONES -> Smith-Jones, MCDONALD -> McDonald */
    function tidyCase(w) {
        if (!isCaps(w)) return w;
        return w.toLowerCase().replace(/(^|[\s\-'’])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); })
            .replace(/\bMc([a-z])/g, function (m, a) { return 'Mc' + a.toUpperCase(); });
    }
    function tidyName(s) { return clean(s).split(' ').map(tidyCase).join(' '); }
    /* "Alexander (Alex)" -> "Alex" */
    function preferredOf(first) {
        var m = /\(([^)]+)\)/.exec(first);
        return m ? clean(m[1]) : clean(first.replace(/\(\s*\)/g, ''));
    }
    function headRole(h) {
        var k = headKey(h);
        if (!k) return null;
        for (var r in HEADS) if (HEADS[r].indexOf(k) >= 0) return r;
        return null;
    }
    function frac(vals, test) {
        if (!vals.length) return 0;
        var n = 0;
        vals.forEach(function (v) { if (test(v)) n++; });
        return n / vals.length;
    }
    /* how many neighbouring pairs are in A-Z order */
    function sortedness(vals) {
        if (vals.length < 4) return 0;
        var ok = 0;
        for (var i = 1; i < vals.length; i++) if (vals[i - 1].toLowerCase().localeCompare(vals[i].toLowerCase()) <= 0) ok++;
        return ok / (vals.length - 1);
    }
    function yearOf(v) {
        var m = YEAR_RE.exec(clean(v));
        if (!m) return '';
        var n = +m[1];
        return n >= 1 && n <= 13 ? String(n) : '';
    }

    /* ---------- splitting the text ---------- */

    function lines(text) { return String(text || '').split(/\r\n|\r|\n/).filter(function (l) { return l.trim(); }); }

    function detectDelim(text) {
        var ls = lines(text).slice(0, 60);
        if (!ls.length) return 'line';
        var n = ls.length;
        var count = function (ch) { return ls.filter(function (l) { return l.indexOf(ch) >= 0; }).length; };
        if (count('\t') >= Math.max(1, n * 0.5)) return 'tab';
        if (count(';') >= n * 0.8) return 'semi';
        if (count(',') >= n * 0.8) {
            /* "Smith, Alex" on every line is a list of names, not two CSV columns, unless a heading says so */
            var heads = ls[0].split(',').map(headRole).filter(Boolean);
            var nameStyle = ls.every(function (l) { return (l.match(/,/g) || []).length === 1 && /,\s/.test(l) && !/\d/.test(l); });
            if (nameStyle && heads.length < 2) return 'line';
            return 'comma';
        }
        return 'line';
    }

    function splitRows(text, delim) {
        if (delim === 'line') return lines(text).map(function (l) { return [l]; });
        var d = delim === 'tab' ? '\t' : delim === 'semi' ? ';' : ',';
        var rows = [], row = [], field = '', q = false, s = String(text || '');
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i);
            if (q) {
                if (c === '"') { if (s.charAt(i + 1) === '"') { field += '"'; i++; } else q = false; }
                else field += c;
            } else if (c === '"' && field.trim() === '') { q = true; field = ''; }
            else if (c === d) { row.push(field); field = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && s.charAt(i + 1) === '\n') i++;
                row.push(field); rows.push(row); row = []; field = '';
            } else field += c;
        }
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        rows = rows.map(function (r) { return r.map(clean); })
            .filter(function (r) { return r.some(function (c) { return c !== ''; }); });
        /* drop columns that are empty all the way down (e.g. a blank column between) */
        var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
        var keep = [];
        for (var c2 = 0; c2 < width; c2++) if (rows.some(function (r) { return r[c2]; })) keep.push(c2);
        return rows.map(function (r) { return keep.map(function (k) { return r[k] || ''; }); });
    }

    function looksLikeHeading(row) {
        var roles = row.map(headRole);
        var named = roles.filter(function (r) { return r === 'first' || r === 'preferred' || r === 'surname' || r === 'full' || r === 'fullrev'; });
        var any = roles.filter(Boolean);
        return named.length >= 1 || any.length >= 2;
    }

    /* ---------- guessing what each column is ---------- */

    function guessRole(vals, opt) {
        vals = vals.filter(Boolean);
        if (!vals.length) return 'ignore';
        if (frac(vals, function (v) { return /@/.test(v); }) > 0.5) return 'ignore';
        if (opt.lockers && frac(vals, function (v) { return COMBO_RE.test(v); }) > 0.6) return 'combo';
        if (frac(vals, function (v) { var y = yearOf(v); return y && +y >= 3; }) > 0.85) return 'year';
        if (frac(vals, function (v) { return /^\d{5,}$/.test(v); }) > 0.6) return 'ignore';
        if (opt.lockers && frac(vals, function (v) { return LOCKER_RE.test(v) && /\d/.test(v); }) > 0.7) return 'locker';
        if (frac(vals, function (v) { return HOMEROOM_RE.test(v); }) > 0.7) return 'homeroom';
        if (frac(vals, function (v) { return /^(m|f|x|male|female|other)$/i.test(v); }) > 0.8) return 'ignore';
        if (frac(vals, function (v) { return /\d/.test(v); }) > 0.5) return 'ignore';
        if (frac(vals, function (v) { return /[\s,]/.test(v); }) > 0.5) return fullOrder(vals);
        return 'word';
    }

    /* One column of whole names: which way round? */
    function fullOrder(vals) {
        if (frac(vals, function (v) { return /,/.test(v); }) > 0.5) return 'fullrev';
        var firstWords = vals.map(function (v) { return v.split(/[\s,]+/)[0]; });
        var lastWords = vals.map(function (v) { var w = v.split(/\s+/); return w[w.length - 1]; });
        if (frac(firstWords, isCaps) > 0.6 && frac(lastWords, isCaps) < 0.3) return 'fullrev';
        var sf = sortedness(firstWords), sl = sortedness(lastWords);
        /* class lists are usually sorted by surname */
        if (sf >= 0.85 && sf > sl + 0.15) return 'fullrev';
        return 'full';
    }

    function guessRoles(rows, headed, opt) {
        var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
        var body = headed ? rows.slice(1) : rows;
        var col = function (i) { return body.map(function (r) { return r[i] || ''; }); };
        var roles = [], i;
        if (headed) {
            var heads = rows[0];
            for (i = 0; i < width; i++) roles.push(headRole(heads[i]) || (heads[i] ? 'keep' : guessRole(col(i), opt)));
            var pi = roles.indexOf('preferred');
            if (pi >= 0) {
                roles = roles.map(function (r) { return r === 'first' ? 'firstalt' : r; });
                roles[pi] = 'first';
            }
        } else if (width === 1 && opt.lineMode) {
            /* one per line: names, perhaps with a homeroom or year on the end ("Alex Smith 7B") */
            var names = col(0).map(function (v) {
                return clean(v.replace(/\b(?:year|yr|grade)\s*\d{1,2}\b/ig, ' ').split(' ').filter(function (b) { return !/\d/.test(b); }).join(' '));
            }).filter(Boolean);
            roles.push(frac(names, function (v) { return /[\s,]/.test(v); }) > 0.5 ? fullOrder(names) : 'first');
        } else {
            for (i = 0; i < width; i++) roles.push(guessRole(col(i), opt));
        }
        /* single-word name columns */
        var words = [];
        roles.forEach(function (r, k) { if (r === 'word') words.push(k); });
        var hasFirst = roles.indexOf('first') >= 0, hasSur = roles.indexOf('surname') >= 0;
        var hasFull = roles.indexOf('full') >= 0 || roles.indexOf('fullrev') >= 0;
        if (words.length && hasFull && !hasFirst && !hasSur) {
            words.forEach(function (k) { roles[k] = 'ignore'; });
        } else if (words.length) {
            var need = [];
            if (!hasSur) need.push('surname');
            if (!hasFirst) need.push('first');
            if (need.length === 2 && words.length >= 2) {
                /* pick the surname column: written in capitals, or the list is sorted by it */
                var best = words[1], a = col(words[0]), b = col(words[1]);
                var ca = frac(a.filter(Boolean), isCaps), cb = frac(b.filter(Boolean), isCaps);
                var sa = sortedness(a.filter(Boolean)), sb = sortedness(b.filter(Boolean));
                if (ca > 0.6 && cb < 0.6) best = words[0];
                else if (cb > 0.6 && ca < 0.6) best = words[1];
                else if (sa >= 0.85 && sa > sb + 0.15) best = words[0];
                roles[best] = 'surname';
                var other = best === words[0] ? words[1] : words[0];
                roles[other] = 'first';
                words.forEach(function (k) { if (roles[k] === 'word') roles[k] = 'ignore'; });
            } else {
                words.forEach(function (k) { roles[k] = need.length ? need.pop() : 'ignore'; });
                /* a lone single-word column is most likely first names */
                if (words.length === 1 && !hasFirst && roles[words[0]] === 'surname' && !hasSur) roles[words[0]] = 'first';
            }
        }
        if (!opt.lockers) roles = roles.map(function (r) { return r === 'locker' || r === 'combo' ? 'ignore' : r; });
        return roles;
    }

    /* ---------- names ---------- */

    function splitFull(v, surnameFirst) {
        v = clean(v);
        var out = { first: '', surname: '', homeroom: '', year: '' };
        if (!v) return out;
        /* "Smith, Alex" is always surname first */
        var comma = v.indexOf(',');
        if (comma > 0) {
            out.surname = tidyName(v.slice(0, comma));
            out.first = preferredOf(tidyName(v.slice(comma + 1)));
            return out;
        }
        var w = v.split(' ');
        if (w.length === 1) { out.first = tidyCase(w[0]); return out; }
        /* SMITH Alex / Alex SMITH: the words in capitals are the surname */
        var caps = w.map(isCaps);
        var nCaps = caps.filter(Boolean).length;
        if (nCaps && nCaps < w.length) {
            out.surname = w.filter(function (x, i) { return caps[i]; }).map(tidyCase).join(' ');
            out.first = preferredOf(w.filter(function (x, i) { return !caps[i]; }).join(' '));
            return out;
        }
        w = w.map(tidyCase);
        var cut;
        if (surnameFirst) {
            cut = 1;
            while (cut < w.length - 1 && PARTICLES.indexOf(w[cut - 1].toLowerCase()) >= 0) cut++;
            out.surname = w.slice(0, cut).join(' ');
            out.first = preferredOf(w.slice(cut).join(' '));
        } else {
            cut = w.length - 1;
            while (cut > 1 && PARTICLES.indexOf(w[cut - 1].toLowerCase()) >= 0) cut--;
            /* "Alexander (Alex) Smith": keep the bracket with the first name */
            out.first = preferredOf(w.slice(0, cut).join(' '));
            out.surname = w.slice(cut).join(' ');
        }
        return out;
    }

    /* One-per-line text: "Alex Smith 7B" -> name + homeroom, "Alex Smith Year 8" -> name + year */
    function splitLine(v, surnameFirst) {
        v = clean(v).replace(/[()\[\]]/g, function (c) { return c === '(' || c === ')' ? c : ' '; });
        var bits = v.split(' '), keep = [], homeroom = '', year = '';
        for (var i = 0; i < bits.length; i++) {
            var b = bits[i];
            if (/^(year|yr|grade)$/i.test(b) && /^\d{1,2}$/.test(bits[i + 1] || '')) { year = String(+bits[i + 1]); i++; continue; }
            if (/\d/.test(b) && !/^\(.*\)$/.test(b)) {
                var y = yearOf(b);
                if (y && !year) year = y;
                else if (!homeroom) homeroom = b.replace(/^[(\-]+|[)\-]+$/g, '');
                continue;
            }
            keep.push(b);
        }
        var out = splitFull(keep.join(' ').replace(/\s+,/g, ','), surnameFirst);
        out.homeroom = homeroom;
        out.year = year;
        return out;
    }

    /* ---------- turning the table into rows ---------- */

    function build(text, opt, over) {
        var delim = over.delim && over.delim !== 'auto' ? over.delim : detectDelim(text);
        var rows = splitRows(text, delim);
        var res = { delim: delim, rows: [], students: 0, table: rows, headed: false, roles: [], width: 0 };
        if (!rows.length) return res;
        var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
        res.width = width;
        res.headed = over.headed != null ? over.headed : looksLikeHeading(rows[0]);
        var roles = guessRoles(rows, res.headed, { lockers: opt.lockers, lineMode: delim === 'line' });
        if (over.roles && over.roles.length === width) roles = over.roles.slice();
        res.roles = roles;
        var heads = res.headed ? rows[0] : [];
        var body = res.headed ? rows.slice(1) : rows;
        body.forEach(function (r) {
            var o = {}, first = '', alt = '', sur = '', parts;
            roles.forEach(function (role, i) {
                var v = r[i] || '';
                if (!v) return;
                if (role === 'first' && width === 1 && delim === 'line') {
                    parts = splitLine(v, false);
                    if (!first) first = parts.first;
                    if (parts.homeroom && !o.Homeroom) o.Homeroom = parts.homeroom;
                    if (parts.year && !o['Year Level']) o['Year Level'] = parts.year;
                } else if (role === 'first') { if (!first) first = preferredOf(tidyName(v)); }
                else if (role === 'firstalt') { if (!alt) alt = preferredOf(tidyName(v)); }
                else if (role === 'surname') { if (!sur) sur = tidyName(v); }
                else if (role === 'full' || role === 'fullrev') {
                    parts = width === 1 && delim === 'line' ? splitLine(v, role === 'fullrev') : splitFull(v, role === 'fullrev');
                    if (!first) first = parts.first;
                    if (!sur) sur = parts.surname;
                    if (parts.homeroom && !o.Homeroom) o.Homeroom = parts.homeroom;
                    if (parts.year && !o['Year Level']) o['Year Level'] = parts.year;
                } else if (role === 'year') o['Year Level'] = yearOf(v) || v;
                else if (role === 'locker') o['Locker number'] = v.replace(/\.0$/, '');
                else if (KEYS[role]) o[KEYS[role]] = v;
                else if (role === 'keep') o[clean(heads[i]) || ('Column ' + (i + 1))] = v;
            });
            first = first || alt;
            if (first) o['First Name'] = first;
            if (sur) o.Surname = sur;
            var named = !!(first || sur);
            if (!named && !(opt.keepNameless && Object.keys(o).length)) return;
            if (named) res.students++;
            res.rows.push(o);
        });
        return res;
    }

    /* ---------- the dialog ---------- */

    var CSS =
        '.cpaste-overlay{position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}' +
        '.cpaste-box{background:#fff;color:#0f172a;border-radius:10px;width:min(820px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.35);overflow:hidden;font-size:14px;line-height:1.4}' +
        '.cpaste-head{background:#0f172a;color:#fff;padding:10px 14px;display:flex;align-items:center;gap:8px}' +
        '.cpaste-head h3{margin:0;font-size:16px;font-weight:600;flex:1;color:#fff;border:0;padding:0}' +
        '.cpaste-x{background:none;border:0;color:#cbd5e1;font-size:22px;line-height:1;cursor:pointer;padding:0 4px}.cpaste-x:hover{color:#fff}' +
        '.cpaste-body{padding:12px 14px;overflow:auto;display:flex;flex-direction:column;gap:10px}' +
        '.cpaste-help{margin:0;color:#475569;font-size:13px}.cpaste-help code{background:#f1f5f9;padding:0 4px;border-radius:3px;font-size:12px;white-space:nowrap}' +
        '.cpaste-ta{width:100%;box-sizing:border-box;min-height:120px;resize:vertical;font:13px/1.4 ui-monospace,Consolas,monospace;border:1px solid #cbd5e1;border-radius:6px;padding:8px;tab-size:16;color:#0f172a;background:#fff}' +
        '.cpaste-ta:focus{outline:2px solid #3b82f6;outline-offset:-1px;border-color:#3b82f6}' +
        '.cpaste-opts{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;font-size:13px;color:#334155}' +
        '.cpaste-opts label{display:inline-flex;align-items:center;gap:5px;cursor:pointer;margin:0}' +
        '.cpaste-opts select,.cpaste-table select{font:inherit;font-size:12px;padding:2px 4px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;color:#0f172a;max-width:100%}' +
        '.cpaste-found{font-weight:600;color:#0f172a}.cpaste-found.cpaste-none{color:#b45309;font-weight:500}' +
        '.cpaste-wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:6px;max-height:220px}' +
        '.cpaste-table{border-collapse:collapse;font-size:12px;width:100%;margin:0}' +
        '.cpaste-table th,.cpaste-table td{border:0;border-bottom:1px solid #e2e8f0;border-right:1px solid #f1f5f9;padding:3px 6px;text-align:left;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;background:none}' +
        '.cpaste-table thead th{position:sticky;top:0;background:#f8fafc;z-index:1}' +
        '.cpaste-table tr.cpaste-headrow td{font-weight:600;color:#64748b;background:#f8fafc;font-style:italic}' +
        '.cpaste-table td.cpaste-off{color:#cbd5e1}' +
        '.cpaste-chips{display:flex;flex-wrap:wrap;gap:4px}' +
        '.cpaste-chip{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:999px;padding:1px 8px;font-size:12px}' +
        '.cpaste-chip small{color:#64748b;margin-left:4px}.cpaste-more{font-size:12px;color:#64748b;align-self:center}' +
        '.cpaste-foot{display:flex;gap:8px;justify-content:flex-end;align-items:center;padding:10px 14px;border-top:1px solid #e2e8f0;background:#f8fafc;flex-wrap:wrap}' +
        '.cpaste-msg{flex:1;color:#b91c1c;font-size:13px;min-width:120px}' +
        '.cpaste-btn{font:inherit;font-size:13px;border-radius:5px;padding:6px 14px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#0f172a}' +
        '.cpaste-btn:hover{background:#f1f5f9}' +
        '.cpaste-btn.cpaste-primary{background:#3b82f6;border-color:#3b82f6;color:#fff;font-weight:600}.cpaste-btn.cpaste-primary:hover{background:#2563eb}' +
        '.cpaste-btn:disabled{opacity:.45;cursor:default}';

    function injectCss() {
        if (document.getElementById('cpaste-css')) return;
        var st = document.createElement('style');
        st.id = 'cpaste-css';
        st.textContent = CSS;
        document.head.appendChild(st);
    }

    function open(opt) {
        opt = opt || {};
        injectCss();
        var actions = opt.actions && opt.actions.length ? opt.actions : [{ value: 'replace', label: 'Use this list', primary: true }];
        var roleList = ['first', 'firstalt', 'surname', 'full', 'fullrev', 'homeroom', 'year']
            .concat(opt.lockers ? ['locker', 'combo'] : []).concat(['keep', 'ignore']);
        var over = { delim: 'auto', headed: null, roles: null };
        var res = null, lastText = null;

        var ov = document.createElement('div');
        ov.className = 'cpaste-overlay';
        ov.innerHTML =
            '<div class="cpaste-box" role="dialog" aria-modal="true" aria-label="' + esc(opt.title || 'Paste a class list') + '">' +
            '<div class="cpaste-head"><h3>' + esc(opt.title || 'Paste a class list') + '</h3>' +
            '<button type="button" class="cpaste-x" data-c="close" title="Close" aria-label="Close">×</button></div>' +
            '<div class="cpaste-body">' +
            '<p class="cpaste-help">Select the names in Excel, Google Sheets, Word or the school system, copy (Ctrl+C), then paste here (Ctrl+V). ' +
            'A heading row is optional. Names can be in separate first name and surname columns, or one column such as ' +
            '<code>Alex Smith</code>, <code>SMITH Alex</code> or <code>Smith, Alex</code>. Homeroom' +
            (opt.lockers ? ', year level, locker number and combination' : ' and year level') + ' columns are picked up too.</p>' +
            '<textarea class="cpaste-ta" data-c="text" spellcheck="false" placeholder="Paste here&#10;&#10;e.g.&#10;Preferred&#9;Surname&#9;Homeroom&#10;Alex&#9;Smith&#9;7B&#10;&#10;or just one name per line"></textarea>' +
            '<div class="cpaste-opts">' +
            '<span class="cpaste-found" data-c="found"></span>' +
            '<label><input type="checkbox" data-c="headed"> First row is headings</label>' +
            '<label>Columns: <select data-c="delim">' +
            '<option value="auto">Detect</option><option value="tab">Tabs (spreadsheet)</option><option value="comma">Commas</option>' +
            '<option value="semi">Semicolons</option><option value="line">One name per line</option></select></label>' +
            '<button type="button" class="cpaste-btn" data-c="swap" title="Swap the first name and surname columns">⇄ Swap first name / surname</button>' +
            '</div>' +
            '<div class="cpaste-wrap" data-c="wrap" hidden><table class="cpaste-table" data-c="table"></table></div>' +
            '<div class="cpaste-chips" data-c="chips"></div>' +
            '</div>' +
            '<div class="cpaste-foot"><span class="cpaste-msg" data-c="msg"></span>' +
            '<button type="button" class="cpaste-btn" data-c="close">Cancel</button>' +
            actions.map(function (a, i) {
                return '<button type="button" class="cpaste-btn' + (a.primary ? ' cpaste-primary' : '') + '" data-act="' +
                    i + '"' + (a.title ? ' title="' + esc(a.title) + '"' : '') + ' disabled>' + esc(a.label) + '</button>';
            }).join('') +
            '</div></div>';
        var q = function (c) { return ov.querySelector('[data-c="' + c + '"]'); };
        var ta = q('text');
        var host = document.fullscreenElement || document.webkitFullscreenElement || document.body;
        host.appendChild(ov);
        var prevFocus = document.activeElement;

        function close() {
            document.removeEventListener('keydown', onKey, true);
            if (ov.parentNode) ov.parentNode.removeChild(ov);
            if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* gone */ }
        }

        function render() {
            var text = ta.value;
            if (text !== lastText) { over.roles = null; over.headed = null; lastText = text; }
            res = build(text, opt, over);
            q('headed').checked = res.headed;
            q('delim').value = over.delim;
            var found = q('found');
            var colTxt = res.delim === 'line' ? 'one per line' : res.width + (res.width === 1 ? ' column' : ' columns');
            if (!text.trim()) { found.textContent = ''; found.className = 'cpaste-found'; }
            else if (res.students) {
                found.textContent = res.students + (res.students === 1 ? ' student' : ' students') + ' found (' + colTxt +
                    (res.headed ? ', heading row' : ', no headings') + ')';
                found.className = 'cpaste-found';
            } else {
                found.textContent = res.rows.length ? res.rows.length + ' rows with no names (' + colTxt + ')'
                    : 'No names found yet. Check which column holds the names.';
                found.className = 'cpaste-found cpaste-none';
            }
            q('swap').hidden = !(res.roles.indexOf('first') >= 0 && res.roles.indexOf('surname') >= 0) &&
                !(res.roles.indexOf('full') >= 0 || res.roles.indexOf('fullrev') >= 0);
            /* the table: a role picker over each column, then the first rows */
            var wrap = q('wrap'), tbl = q('table');
            wrap.hidden = !res.table.length;
            if (res.table.length) {
                var h = '<thead><tr>';
                res.roles.forEach(function (role, i) {
                    h += '<th><select data-col="' + i + '" aria-label="Column ' + (i + 1) + '">' + roleList.map(function (r) {
                        return '<option value="' + r + '"' + (r === role ? ' selected' : '') + '>' + esc(ROLES[r]) + '</option>';
                    }).join('') + '</select></th>';
                });
                h += '</tr></thead><tbody>';
                res.table.slice(0, 9).forEach(function (r, ri) {
                    var isHead = res.headed && ri === 0;
                    h += '<tr' + (isHead ? ' class="cpaste-headrow"' : '') + '>';
                    for (var c = 0; c < res.width; c++) {
                        var off = !isHead && res.roles[c] === 'ignore';
                        h += '<td' + (off ? ' class="cpaste-off"' : '') + ' title="' + esc(r[c] || '') + '">' + esc(r[c] || '') + '</td>';
                    }
                    h += '</tr>';
                });
                if (res.table.length > 9) h += '<tr><td colspan="' + res.width + '" class="cpaste-off">… ' + (res.table.length - 9) + ' more rows</td></tr>';
                tbl.innerHTML = h + '</tbody>';
            }
            /* how the students will come out */
            var shown = res.rows.filter(function (o) { return o['First Name'] || o.Surname; });
            q('chips').innerHTML = shown.slice(0, 14).map(function (o) {
                var extra = [o.Homeroom, o['Year Level'] ? 'Yr ' + o['Year Level'] : '', o['Locker number'] ? '#' + o['Locker number'] : '']
                    .filter(Boolean).join(' · ');
                return '<span class="cpaste-chip">' + esc(((o['First Name'] || '') + ' ' + (o.Surname || '')).trim()) +
                    (extra ? '<small>' + esc(extra) + '</small>' : '') + '</span>';
            }).join('') + (shown.length > 14 ? '<span class="cpaste-more">and ' + (shown.length - 14) + ' more</span>' : '');
            var okay = res.students > 0 || (opt.keepNameless && res.rows.length > 0);
            Array.prototype.forEach.call(ov.querySelectorAll('[data-act]'), function (b) { b.disabled = !okay; });
            q('msg').textContent = '';
        }

        function apply(idx) {
            if (!res || !(res.students || (opt.keepNameless && res.rows.length))) return;
            var a = actions[idx] || actions[0];
            var ok;
            try {
                ok = opt.onApply ? opt.onApply(res.rows.slice(), a.value, { students: res.students, headed: res.headed, delim: res.delim }) : true;
            } catch (err) { q('msg').textContent = err && err.message ? err.message : String(err); return; }
            if (typeof ok === 'string') { q('msg').textContent = ok; return; }
            if (ok !== false) close();
        }

        function onKey(e) {
            if (!ov.parentNode) return;
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                var p = 0;
                actions.forEach(function (a, i) { if (a.primary) p = i; });
                apply(p);
            }
        }
        document.addEventListener('keydown', onKey, true);

        ta.addEventListener('input', render);
        q('headed').addEventListener('change', function () {
            over.headed = q('headed').checked;
            over.roles = null;
            lastText = ta.value;
            render();
        });
        q('delim').addEventListener('change', function () {
            over.delim = q('delim').value;
            over.roles = null; over.headed = null;
            lastText = ta.value;
            render();
        });
        q('swap').addEventListener('click', function () {
            if (!res) return;
            over.roles = res.roles.map(function (r) {
                return r === 'first' ? 'surname' : r === 'surname' ? 'first' : r === 'full' ? 'fullrev' : r === 'fullrev' ? 'full' : r;
            });
            lastText = ta.value;
            render();
        });
        ov.addEventListener('change', function (e) {
            var s = e.target.closest && e.target.closest('select[data-col]');
            if (!s || !res) return;
            over.roles = res.roles.slice();
            over.roles[+s.getAttribute('data-col')] = s.value;
            lastText = ta.value;
            render();
        });
        ov.addEventListener('click', function (e) {
            if (e.target === ov) return;   /* clicking outside does nothing: a paste is easy to lose */
            if (e.target.closest('[data-c="close"]')) close();
            var b = e.target.closest('[data-act]');
            if (b && !b.disabled) apply(+b.getAttribute('data-act'));
        });

        if (opt.text) ta.value = opt.text;
        render();
        setTimeout(function () { ta.focus(); }, 30);
        return { close: close };
    }

    window.ClassroomPaste = { version: 1, open: open, parse: function (text, opt) { return build(text, opt || {}, { delim: 'auto' }); } };
})();
/* ===== end ClassroomPaste ===== */
/* ===== ClassroomControls v2: Simple / Full controls for the classroom tools =====
   Shared by seatingplan, lockers, studentgroups and namepicker. The same block is copied into
   each directive's .js so every directive still works on its own; whichever loads first defines
   window.ClassroomControls and the others reuse it. Keep the copies identical.

   Simple: one row of numbered steps with big buttons, for teachers new to the tool.
   Full:   every control (the tool's own toolbar rows).
   A Simple | Full switch sits top right. Each tool remembers its own choice in the browser
   (localStorage 'classroomControls:<tool>'); a first visit starts in Simple. The directive's
   :controls: option can instead fix the view to simple or full and hide the switch.
   Simple only hides controls: rules, locks, year levels … keep working, and a note says when
   one is in use. Every copy of a tool on one page (e.g. the twelve plans on a seating plans
   page) switches together. An element <div class="cc-allswitch" data-cc-tool="seatingplan"
   data-cc-label="…"></div> on the page becomes one switch for all of them.

   ClassroomControls.attach({
       root, tool: 'seatingplan', setting: cfg.controls,      // 'simple' | 'full' | 'choice'
       toolbar: element,                                       // the tool's toolbar; its rows become Full-only
       simple: html,                                           // the Simple bar (use step() for each step)
       hint: 'Drag a name onto a desk …',                      // one line shown under the Simple bar
       note: function () { return '2 rules still apply'; },   // hidden settings in use ('' = none)
       proxies: [{ sel: '[data-cc="room"]', buttons: function () { return nodeList; }, active: 'sp-active' }],
       onMode: function (mode) {}
   }) -> { mode(), sync() }
   Buttons in the Simple bar use the tool's own data-action values, so the tool's click handler
   runs them; their disabled state follows the matching Full button. */
(function () {
    'use strict';
    if (window.ClassroomControls && window.ClassroomControls.version >= 2) return;
    var registry = {};   /* tool -> [instance] for every copy on the page */

    var CSS =
        '.cc-root{position:relative}' +
        '.cc-pill{position:absolute;top:4px;right:8px;z-index:3;display:flex;background:#1e293b;border:1px solid #334155;border-radius:999px;padding:2px}' +
        '.cc-pill button{font:inherit;font-size:12px;font-weight:600;line-height:1;border:0;border-radius:999px;padding:5px 12px;background:transparent;color:#cbd5e1;cursor:pointer}' +
        '.cc-pill button:hover{color:#fff}' +
        '.cc-pill button[aria-pressed="true"]{background:#fff;color:#0f172a}' +
        '.cc-pill button:focus-visible{outline:2px solid #60a5fa;outline-offset:1px}' +
        '.cc-root.cc-has-pill>[data-role="title"]{padding-right:150px}' +
        '.cc-root.cc-simple .cc-full-only{display:none!important}' +
        '.cc-root:not(.cc-simple) .cc-simplebar,.cc-root:not(.cc-simple) .cc-note{display:none!important}' +
        '.cc-simplebar{display:flex;flex-wrap:wrap;align-items:stretch;gap:10px 0;width:100%;align-self:stretch}' +
        '.cc-step{display:flex;flex-direction:column;gap:5px;padding:0 12px;border-right:1px solid #334155}' +
        '.cc-step:last-of-type{border-right:0}' +
        '.cc-step-label{font-size:12px;font-weight:600;color:#94a3b8;white-space:nowrap;display:flex;align-items:center;gap:6px}' +
        '.cc-num{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;color:#fff;font-size:11px;font-weight:700}' +
        '.cc-step-body{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
        '.cc-spacer{flex:1 1 0}' +
        '.cc-end{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end;padding:0 8px}' +
        '.cc-simplebar .cc-big{min-height:40px;font-size:14px!important;padding-left:14px!important;padding-right:14px!important}' +
        '.cc-select{min-height:40px;font:inherit;font-size:14px;font-weight:600;color:#f8fafc;background:#0f172a;border:1px solid #475569;border-radius:6px;padding:0 8px;max-width:220px;cursor:pointer}' +
        '.cc-select:focus-visible{outline:2px solid #60a5fa;outline-offset:1px}' +
        '.cc-find{display:flex;align-items:center;gap:6px;min-height:40px;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:0 10px;color:#64748b}' +
        '.cc-find input{background:transparent;border:0;color:#f8fafc;width:110px;font:inherit;font-size:14px;outline:none}' +
        '.cc-note{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;background:#fffbeb;border-bottom:1px solid #fde68a;padding:7px 14px;font-size:13px;color:#78350f}' +
        '.cc-note-hint{flex:1 1 300px}' +
        '.cc-chip{background:#fef3c7;border:1px solid #f59e0b;border-radius:999px;padding:1px 10px;font-weight:600;white-space:nowrap}' +
        '.cc-link{font:inherit;font-weight:600;color:#1d4ed8;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline}' +
        '.cc-tip{display:flex;align-items:center;gap:10px;background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:7px 14px;font-size:13px;color:#1e3a8a}' +
        '.cc-tip span{flex:1}' +
        '.cc-tip button{font:inherit;background:none;border:0;color:#1e3a8a;cursor:pointer;font-size:16px;line-height:1;padding:0 4px}' +
        '.sp-projector .cc-pill,.sp-projector .cc-note,.sp-projector .cc-tip,.sg-projector .cc-pill,.sg-projector .cc-note,.sg-projector .cc-tip,' +
        '.np-projector .cc-pill,.np-projector .cc-note,.np-projector .cc-tip{display:none!important}' +
        '.cc-allswitch{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.3;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;background:#0f172a;color:#f8fafc;border-radius:8px;padding:10px 14px;margin:0 0 18px;font-size:14px}' +
        '.cc-allswitch .cc-pill{position:static}' +
        '.cc-allswitch .cc-pill button{font-size:14px;padding:8px 18px}' +
        '.cc-all-label{font-weight:600}' +
        '.cc-all-hint{color:#94a3b8;font-size:13px}' +
        '@media print{.cc-pill,.cc-note,.cc-tip,.cc-simplebar,.cc-allswitch{display:none!important}}' +
        '@media (max-width:700px){.cc-step{border-right:0;padding:0 6px}.cc-root.cc-has-pill>[data-role="title"]{padding-right:14px;padding-top:34px}}';

    function injectCss() {
        if (document.getElementById('cc-css')) return;
        var st = document.createElement('style');
        st.id = 'cc-css';
        st.textContent = CSS;
        document.head.appendChild(st);
    }
    function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }

    /* one numbered step of the Simple bar */
    function step(n, label, colour, body) {
        return '<div class="cc-step"><div class="cc-step-label"><span class="cc-num" style="background:' + colour + '">' + n + '</span>' +
            esc(label) + '</div><div class="cc-step-body">' + body + '</div></div>';
    }

    function attach(o) {
        injectCss();
        var root = o.root, tool = o.tool, key = 'classroomControls:' + tool;
        var setting = String(o.setting || 'choice').toLowerCase();
        var fixed = setting === 'simple' || setting === 'full';
        var stored = get(key);
        var mode = fixed ? setting : (stored === 'full' || stored === 'simple' ? stored : 'simple');
        root.classList.add('cc-root');

        /* the tool's own rows become Full-only; the Simple bar goes in first */
        Array.prototype.forEach.call(o.toolbar.children, function (row) { row.classList.add('cc-full-only'); });
        o.toolbar.insertAdjacentHTML('afterbegin', '<div class="cc-simplebar">' + o.simple + '</div>');
        var bar = o.toolbar.firstElementChild;
        o.toolbar.insertAdjacentHTML('afterend', '<div class="cc-note" data-cc-note hidden></div>');
        var noteEl = o.toolbar.nextElementSibling;

        var pill = null, tip = null;
        if (!fixed) {
            root.classList.add('cc-has-pill');
            root.insertAdjacentHTML('afterbegin',
                '<div class="cc-pill" role="group" aria-label="Controls" title="Simple: the main steps. Full: every control. Remembered in this browser on this computer.">' +
                '<button type="button" data-cc-mode="simple">Simple</button><button type="button" data-cc-mode="full">Full</button></div>');
            pill = root.firstElementChild;
            var pageSwitch = document.querySelector('.cc-allswitch[data-cc-tool="' + tool + '"]');
            if (!stored && !get(key + ':tip') && !pageSwitch) {
                noteEl.insertAdjacentHTML('afterend', '<div class="cc-tip" data-cc-tip><span>This is the <b>Simple</b> view with the main steps. ' +
                    'For everything else, choose <b>Full</b> at the top right. Your choice is remembered in this browser on this computer.</span>' +
                    '<button type="button" data-cc-tip-close aria-label="Close tip">×</button></div>');
                tip = noteEl.nextElementSibling;
            }
        }

        function closeTip() {
            if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
            tip = null;
            put(key + ':tip', '1');
        }

        function counterpart(b) {
            var a = b.getAttribute('data-action'), m = b.getAttribute('data-mode');
            var sel = '.cc-full-only [data-action="' + a + '"]' + (m ? '[data-mode="' + m + '"]' : '');
            return o.toolbar.querySelector(sel);
        }

        function syncProxies() {
            (o.proxies || []).forEach(function (p) {
                var sel = bar.querySelector(p.sel);
                if (!sel) return;
                var btns = Array.prototype.slice.call(p.buttons() || []);
                var labels = btns.map(function (b) { return b.textContent.trim(); });
                var active = -1;
                btns.forEach(function (b, i) { if (b.classList.contains(p.active)) active = i; });
                var sig = labels.join('\u0001') + '|' + (active < 0);
                if (sel.getAttribute('data-sig') !== sig) {
                    sel.innerHTML = (active < 0 ? '<option value="">' + esc(p.none || 'Custom') + '</option>' : '') +
                        labels.map(function (l, i) { return '<option value="' + i + '">' + esc((p.prefix || '') + l) + '</option>'; }).join('');
                    sel.setAttribute('data-sig', sig);
                }
                sel.value = active < 0 ? '' : String(active);
            });
        }

        function sync() {
            Array.prototype.forEach.call(bar.querySelectorAll('[data-action]'), function (b) {
                var c = counterpart(b);
                if (c) {
                    b.disabled = !!c.disabled;
                    if (c.title && !b.title) b.title = c.title;
                    ['sp-active', 'lk-active', 'sg-active', 'np-active'].forEach(function (cls) { b.classList.toggle(cls, c.classList.contains(cls)); });
                }
            });
            syncProxies();
            if (pill) Array.prototype.forEach.call(pill.querySelectorAll('[data-cc-mode]'), function (b) {
                b.setAttribute('aria-pressed', b.getAttribute('data-cc-mode') === mode ? 'true' : 'false');
            });
            var n = o.note ? o.note() : '';
            noteEl.innerHTML = '<span class="cc-note-hint">' + esc(o.hint || '') + '</span>' +
                (n ? '<span class="cc-chip">' + esc(n) + '</span>' + (fixed ? '' : '<button type="button" class="cc-link" data-cc-mode="full">Change in Full</button>') : '');
            noteEl.hidden = !(o.hint || n);
            if (o.afterSync) o.afterSync(bar);
        }

        function show(m) {
            mode = m === 'full' ? 'full' : 'simple';
            root.classList.toggle('cc-simple', mode === 'simple');
            sync();
            if (o.onMode) o.onMode(mode);
        }
        function apply(m, remember) {
            if (remember && !fixed) { setAll(tool, m); return; }
            show(m);
        }
        var inst = { fixed: fixed, show: show, closeTip: closeTip };
        (registry[tool] = registry[tool] || []).push(inst);

        var queued = false;
        function later() {
            if (queued) return;
            queued = true;
            setTimeout(function () { queued = false; sync(); }, 0);
        }
        root.addEventListener('click', function (e) {
            var m = e.target.closest && e.target.closest('[data-cc-mode]');
            if (m && root.contains(m)) { apply(m.getAttribute('data-cc-mode'), true); return; }
            if (e.target.closest && e.target.closest('[data-cc-tip-close]')) { closeTip(); return; }
            later();
        });
        root.addEventListener('change', function (e) {
            var s = e.target.closest && e.target.closest('select[data-cc]');
            if (s && bar.contains(s)) {
                (o.proxies || []).forEach(function (p) {
                    if (!s.matches(p.sel) || s.value === '') return;
                    var b = (p.buttons() || [])[+s.value];
                    if (b) b.click();
                });
            }
            later();
        });
        /* other changes (imports, drags, dialogs) */
        document.addEventListener('click', later, true);

        apply(mode, false);
        buildPageSwitches(tool, mode);
        return { mode: function () { return mode; }, sync: sync, bar: bar };
    }

    /* Simple or Full for every copy of a tool on the page, remembered for next time */
    function setAll(tool, m) {
        m = m === 'full' ? 'full' : 'simple';
        put('classroomControls:' + tool, m);
        put('classroomControls:' + tool + ':tip', '1');
        (registry[tool] || []).forEach(function (i) {
            i.closeTip();
            if (!i.fixed) i.show(m);
        });
        markPageSwitches(tool, m);
    }

    function markPageSwitches(tool, m) {
        Array.prototype.forEach.call(document.querySelectorAll('.cc-allswitch[data-cc-tool="' + tool + '"] [data-cc-all]'), function (b) {
            b.setAttribute('aria-pressed', b.getAttribute('data-cc-all') === m ? 'true' : 'false');
        });
    }

    /* <div class="cc-allswitch" data-cc-tool="seatingplan" data-cc-label="…"> -> one switch for all */
    function buildPageSwitches(tool, m) {
        injectCss();
        Array.prototype.forEach.call(document.querySelectorAll('.cc-allswitch[data-cc-tool="' + tool + '"]'), function (el) {
            if (el.getAttribute('data-cc-ready')) return;
            el.setAttribute('data-cc-ready', '1');
            var label = el.getAttribute('data-cc-label') || 'Controls for every plan on this page';
            el.innerHTML = '<span class="cc-all-label">' + esc(label) + '</span>' +
                '<span class="cc-pill" role="group" aria-label="' + esc(label) + '">' +
                '<button type="button" data-cc-all="simple">Simple</button><button type="button" data-cc-all="full">Full</button></span>' +
                '<span class="cc-all-hint">Simple: the main steps. Full: every control. Remembered in this browser on this computer.</span>';
            el.addEventListener('click', function (e) {
                var b = e.target.closest && e.target.closest('[data-cc-all]');
                if (b) setAll(tool, b.getAttribute('data-cc-all'));
            });
        });
        var stored = get('classroomControls:' + tool);
        markPageSwitches(tool, stored === 'full' || stored === 'simple' ? stored : m);
    }

    window.ClassroomControls = { version: 2, attach: attach, step: step, setAll: setAll };
})();
/* ===== end ClassroomControls ===== */

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
        '.lk-prow-break{flex-basis:100%;height:0}' +
        '.lk-pbank h3{font-size:12px;margin:0 0 3px}' +
        '.lk-pgrid{display:grid;gap:4px}' +
        '.lk-pcell{direction:ltr;border:1px solid #000;border-radius:3px;padding:2px 4px;min-height:44px;font-size:11px;break-inside:avoid}' +
        '.lk-pcell b{display:block;font-size:10px;color:#333}' +
        '.lk-pcell .n{font-weight:700}' +
        '.lk-pcell .ry{display:block;font-size:10px;color:#555}' +
        '.lk-pcell .cb{display:block;font-family:Consolas,monospace;font-size:10px;letter-spacing:.5px}' +
        '.lk-pcell .bd{float:right;font-size:9px;font-weight:700;border:1px solid #999;border-radius:2px;padding:0 2px;margin-left:3px}' +
        '.lk-pcell.tg{background:linear-gradient(var(--tg) 0 15px,transparent 15px);-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
        '.lk-pcell.out{background:repeating-linear-gradient(45deg,#fff,#fff 4px,#ddd 4px,#ddd 8px);color:#444}' +
        'table{border-collapse:collapse;width:100%;font-size:12px}' +
        'th,td{border:1px solid #999;padding:3px 6px;text-align:left}' +
        'th{background:#eee}' +
        '.lk-lpage{display:flex;gap:16px;align-items:flex-start}' +
        '.lk-lpage.lk-break{break-after:page;page-break-after:always}' +
        '.lk-lcol{flex:1 1 0;min-width:0}' +
        '.lk-lcol.lk-lone{flex:1 1 100%}' +
        '.lk-ltab{font-size:11px;width:auto}' +
        '.lk-ltab td.cbc{font-family:Consolas,monospace;letter-spacing:.5px}' +
        '.lk-ltab td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40mm;padding:2px 5px}' +
        '.lk-ltab th{font-size:10px;line-height:1.15;padding:2px 5px;vertical-align:bottom}' +
        '.lk-ltab .yl,.lk-ltab .ln{text-align:center}' +
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
    /* tutor group colours: 9 strong, clearly different colours for the strip along the top of a
       locker (number and badge), so they still show over the year-level background */
    var TG_COLOURS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#60a5fa', '#a78bfa', '#f472b6', '#a3a3a3'];
    var TG_NAMES = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'grey'];

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
        var banks = [], errors = [], seen = {}, dupes = [], total = 0, area = '', br = false;
        String(text || '').split(/\r?\n|;/).forEach(function (line, i) {
            line = line.trim();
            if (!line || line.charAt(0) === '#') return;
            if (/^-{3,}$/.test(line)) { br = true; return; }   /* "---": the next bank starts a new line on the left */
            var am = line.match(/^\[(.*)\]$/);
            if (am) { area = am[1].trim(); br = false; return; }
            var opts = '', bar = line.indexOf('|');
            if (bar >= 0) { opts = line.slice(bar + 1).trim().toLowerCase(); line = line.slice(0, bar).trim(); }
            var name = '', spec = line, colon = line.indexOf(':');
            if (colon >= 0) { name = line.slice(0, colon).trim(); spec = line.slice(colon + 1).trim(); }
            var o = parseBankOpts(opts);
            if (o.bad.length) errors.push((name || 'Line ' + (i + 1)) + ': unknown option "' + o.bad.join(' ') + '" (use e.g. 2 high, across, down, right, bottom, odd-top)');
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
                tiers: o.tiers, order: o.order, top: o.top, area: area, br: br });
            br = false;
        });
        if (dupes.length) errors.push('Listed more than once (only the first is used): ' + dupes.slice(0, 8).join(', ') + (dupes.length > 8 ? '…' : ''));
        if (total >= MAX_LOCKERS) errors.push('At most ' + MAX_LOCKERS + ' lockers; the rest are left out.');
        return { banks: banks, errors: errors, total: total };
    }

    /* "2 high across right" -> {tiers: 2, order: 'across', side: 'right', row: '', bad: []}.
       Height can be written "2 high", "2high", "tiers 2" or "2 tiers". Kept in step with lockers.py. */
    function parseBankOpts(text) {
        var o = { side: '', row: '', tiers: 0, order: '', top: '', bad: [] };
        var t = String(text || '').toLowerCase().replace(/\btiers?\s*(\d)/g, '$1high').replace(/(\d)\s*(high|tiers?)\b/g, '$1high');
        t.split(/[\s,]+/).filter(Boolean).forEach(function (w) {
            var m = w.match(/^(\d)high$/);
            if (w === 'left' || w === 'right') o.side = w;
            else if (w === 'top' || w === 'bottom') o.row = w;
            else if (w === 'down' || w === 'across') o.order = w;
            else if (/^(odd|even)-?top$/.test(w)) o.top = w.replace(/-?top$/, '');   /* "odd-top": odd numbers in the top row */
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
            top: b.top === 'odd' || b.top === 'even' ? b.top : '',
            area: clean(b.area), br: !!b.br };
    }

    /* Grid position of locker i of n. Numbers run down each column (or across each row),
       starting from the left or right side and the top or bottom row. Returns
       {cols, rows, pos: [{c, r}]} with 1-based grid lines; tiers 1 gives one wrapping row (pos null). */
    function bankLayout(n, tiers, order, side, row, ids, top) {
        if (tiers <= 1) return { cols: 0, rows: 1, pos: null };
        if (top && tiers === 2 && ids) { var par = parityLayout(ids, top, side); if (par) return par; }
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

    /* 2-high bank with "odd-top" / "even-top": lockers pair up by number, so odd (or even) numbers are
       always in the top row and each column holds a matching pair, whatever number the bank starts on.
       544-549 odd-top -> [ _ |545|547|549] over [544|546|548| _ ]. Columns follow the bank's own order
       (a range counting down runs the other way); side 'right' starts at the right-hand end.
       Returns null (normal layout) for lockers without a number or two lockers in one spot. */
    function parityLayout(ids, top, side) {
        var nums = ids.map(function (id) { var m = String(id).match(/(\d+)\D*$/); return m ? +m[1] : null; });
        if (nums.some(function (v) { return v === null; })) return null;
        var colOf = {}, cols = 0, used = {}, pos = [];
        for (var i = 0; i < ids.length; i++) {
            var v = nums[i];
            var key = top === 'odd' ? Math.ceil(v / 2) : Math.floor(v / 2);
            if (!(key in colOf)) colOf[key] = cols++;
            var r = (v % 2 === 1) === (top === 'odd') ? 1 : 2;
            var spot = colOf[key] + ':' + r;
            if (used[spot]) return null;
            used[spot] = true;
            pos.push({ c: colOf[key], r: r });
        }
        pos.forEach(function (p) { p.c = (side === 'right' ? cols - 1 - p.c : p.c) + 1; });
        return { cols: cols, rows: 2, pos: pos };
    }

    function banksToText(banks) {
        var lines = [], area = '';
        banks.forEach(function (b) {
            if ((b.area || '') !== area) { area = b.area || ''; lines.push('[' + area + ']'); }
            else if (b.br && lines.length) lines.push('---');
            var opts = [b.tiers ? b.tiers + ' high' : '', b.order, b.side, b.row, b.top ? b.top + '-top' : ''].filter(Boolean).join(' ');
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
        expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
        shrink: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>',
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
                reserve: {},    /* locker id -> year level ('7') the locker is kept for */
                keepExisting: true,
                display: {
                    homeroom: !(cfg.display && cfg.display.homeroom === false),
                    field: cfg.display && cfg.display.homeroom === false ? 'none' : 'auto',
                    surnameInitial: !!(cfg.display && cfg.display.surnameInitial),
                    yearColours: !(cfg.display && cfg.display.yearColours === false),
                    tgColours: !!(cfg.display && cfg.display.tgColours),
                    hideEmpty: !!(cfg.display && cfg.display.hideEmpty),
                    combo: !!(cfg.display && cfg.display.combo)
                },
                sel: null
            };
            rebuildIndex();
            (cfg.unavailable || []).forEach(function (id) {
                var l = findLocker(id);
                if (l) state.out[l.id] = true;
            });
            /* year 7: 101-140, Corridor B  (from the directive) */
            (cfg.years || []).forEach(function (r) {
                var y = yearDigits(r.year);
                if (y) resolveLockers(r.spec).ids.forEach(function (id) { state.reserve[id] = y; });
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
            var st = {
                combo: normCombo(combo),
                year: hr.year,
                extra: cleanExtra(extra),
                id: 's' + Date.now().toString(36) + '-' + n + '-' + Math.floor(Math.random() * 1e6).toString(36),
                firstName: clean(first) || 'Student',
                surname: clean(surname) || String(n + 1),
                homeroom: hr.room
            };
            if (clean(homeroom)) st.tg = clean(homeroom);   /* the tutor group exactly as imported, e.g. "7C" */
            return st;
        }

        /* Tutor group for exports: as imported; for older data, year + a letter-only room ("7" + "C" -> "7C") */
        function tutorGroup(st) {
            if (st.tg) return st.tg;
            var room = st.homeroom || '';
            return st.year && /^[A-Za-z]{1,2}$/.test(room) ? st.year + room : room;
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

        /* tutor groups in order (7A, 7B ... 7I, 8A ...), each with its colour */
        function tgColourMap() {
            var seen = {};
            state.students.forEach(function (st) { var g = tutorGroup(st); if (g) seen[g] = (seen[g] || 0) + 1; });
            var groups = Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); });
            var map = {};
            groups.forEach(function (g, i) { map[g] = { colour: TG_COLOURS[i % TG_COLOURS.length], count: seen[g], name: TG_NAMES[i % TG_NAMES.length] }; });
            return { groups: groups, map: map };
        }
        function tgColourOf(st) {
            if (!state.display.tgColours || !st) return null;
            var g = tutorGroup(st), m = state._tgMap;
            return g && m && m.map[g] ? m.map[g].colour : null;
        }
        function paintTg(el, st) {
            var c = tgColourOf(st);
            if (!c) return;
            el.classList.add('lk-tg');
            el.style.setProperty('--lk-tg', c);
        }
        /* "Hide empty banks": a bank with no allocated lockers is left off the screen and Print */
        function bankUsed(ids) { var n = 0; ids.forEach(function (id) { if (state.assign[id]) n++; }); return n; }
        function bankHidden(ids) { return !!state.display.hideEmpty && !bankUsed(ids); }

        function hasTutorGroups() { return state.students.some(function (st) { return !!tutorGroup(st); }); }
        function tgLegend() {
            var m = state._tgMap;
            if (!state.display.tgColours || !m || !m.groups.length) return null;
            var box = make('div', 'lk-legend lk-tg-legend');
            box.appendChild(make('span', 'lk-legend-label', 'Tutor groups:'));
            m.groups.forEach(function (g) {
                var chip = make('span', 'lk-legend-chip lk-tg-chip', g + ' (' + m.map[g].count + ')');
                chip.style.setProperty('--lk-tg', m.map[g].colour);
                chip.title = g + ': ' + m.map[g].name;
                box.appendChild(chip);
            });
            if (m.groups.length > TG_COLOURS.length) box.appendChild(make('span', 'lk-legend-note', 'More than ' + TG_COLOURS.length + ' tutor groups, so some colours are used twice.'));
            return box;
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
            if (state.reserve) Object.keys(state.reserve).forEach(function (id) { if (!lockerIndex[id.toLowerCase()]) delete state.reserve[id]; });
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
                students: state.students, assign: state.assign, out: state.out, reserve: state.reserve,
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
                if (clean(s.tg)) st.tg = clean(s.tg);
                return st;
            });
            state.assign = {};
            state.out = {};
            state.reserve = {};
            rebuildIndex();
            Object.keys(d.reserve || {}).forEach(function (id) {
                var l = findLocker(id), y = yearDigits(d.reserve[id]);
                if (l && y) state.reserve[l.id] = y;
            });
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
                state.display.tgColours = !!d.display.tgColours;
                state.display.hideEmpty = !!d.display.hideEmpty;
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
                btn('paste-roster', 'lk-btn-data', 'paste', 'Paste', ' title="Paste a class list copied from Excel, Google Sheets or a school system, with or without headings. Lockers, combinations and year levels come too."') +
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
                btn('wide', 'lk-btn-grey', 'expand', 'Full width', ' data-role="wide" aria-pressed="false" title="Use the whole browser window for the lockers"') +
                '</div>' +
                /* Row 2: setting up the lockers and typing allocations in */
                '<div class="lk-toolbar-row">' +
                '<span class="lk-label">Set up:</span>' +
                btn('setup', 'lk-btn-amber', 'locker', 'Lockers', ' title="Set up the locker numbers, banks and areas"') +
                btn('years', 'lk-btn-amber', 'rows', 'Year levels', ' title="Keep lockers for a year level, e.g. Year 7: 101-160. A–Z, Homeroom and Random then only put Year 7 students in them."') +
                '<span class="lk-sep"></span>' +
                '<span class="lk-label">Enter:</span>' +
                btn('by-student', 'lk-btn-purple', 'keyboard', 'By Student', ' title="Type each student\'s locker number down a list"') +
                btn('paste', 'lk-btn-purple', 'paste', 'Paste lockers', ' title="Paste locker numbers and combinations for students already on the list, e.g. from Excel"') +
                btn('combos', 'lk-btn-purple', 'keyboard', 'Combos', ' title="Type each student\'s padlock combination down a list"') +
                '<div class="lk-search">' + icon('search') +
                '<input type="search" data-role="search" placeholder="Find…" title="Find a student, locker number, year (y7) or homeroom" aria-label="Find a student or locker"></div>' +
                '</div>' +
                /* Row 3: automatic allocation and end-of-year removal */
                '<div class="lk-toolbar-row">' +
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
                btn('remove-unplaced', 'lk-btn-red lk-btn-remove', '', 'No locker', ' data-role="remove-unplaced" title="Remove every student in the No locker list (students who have a locker stay)"') +
                '</div>' +
                /* Row 4: how the banks are drawn and what each locker shows */
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
                '<label class="lk-checkbox-label" title="Tick to make Tiers, Run, Start and Top/Bottom apply to every bank, replacing any bank you have set in its ⚙ settings. Untick to change only the banks that follow the toolbar."><input type="checkbox" class="lk-checkbox" data-role="toggle-override"> Override banks</label>' +
                '<label class="lk-checkbox-label" title="Which detail shows on each locker: year (Y7), homeroom (H13), both (7 H13), or another column such as TG">Badge: ' +
                '<select class="lk-select" data-role="badge-field"></select></label>' +
                '<label class="lk-checkbox-label" title="Show surnames as an initial only, e.g. Alex S."><input type="checkbox" class="lk-checkbox" data-role="toggle-initial"> Initial</label>' +
                '<label class="lk-checkbox-label" title="Colour each locker by the student\'s year level"><input type="checkbox" class="lk-checkbox" data-role="toggle-colours"> Year colours</label>' +
                '<label class="lk-checkbox-label" title="Colour the top line of each locker (number and badge) by the student\'s tutor group: 9 colours"><input type="checkbox" class="lk-checkbox" data-role="toggle-tgcolours"> Tutor group colours</label>' +
                '<label class="lk-checkbox-label" title="Hide banks that have no lockers allocated, on screen and in Print"><input type="checkbox" class="lk-checkbox" data-role="toggle-hideempty"> Hide empty banks</label>' +
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
                '<div class="lk-side-title"><span>No locker (<span data-role="count">0</span>)</span>' +
                '<button type="button" class="lk-side-remove" data-action="remove-unplaced" data-role="remove-unplaced-side" title="Remove every student in the No locker list (students who have a locker stay)">Remove all</button></div>' +
                '<div class="lk-side-hint">Type a locker number in the Locker box, then click a name or drag it onto the box (or onto any locker).</div>' +
                '<div class="lk-pool" data-role="pool"></div>' +
                '</div>' +
                '<div class="lk-canvas" data-role="canvas"></div>' +
                '</div>';

            ['title', 'file', 'json-file', 'undo', 'keep', 'tiers', 'order', 'side', 'row', 'badge-field', 'toggle-override', 'toggle-initial', 'toggle-colours', 'toggle-tgcolours', 'toggle-hideempty', 'remove-unplaced', 'remove-unplaced-side', 'toggle-combo', 'search',
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
            ui['toggle-tgcolours'].addEventListener('change', function () { state.display.tgColours = ui['toggle-tgcolours'].checked; changed(); });
            ui['toggle-hideempty'].addEventListener('change', function () { state.display.hideEmpty = ui['toggle-hideempty'].checked; changed(); });
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
            state._tgMap = state.display.tgColours ? tgColourMap() : null;
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
            ui['toggle-tgcolours'].checked = !!state.display.tgColours;
            ui['toggle-tgcolours'].parentNode.style.display = hasTutorGroups() ? '' : 'none';
            ui['toggle-hideempty'].checked = !!state.display.hideEmpty;
            ui['toggle-combo'].checked = !!state.display.combo;
            var unplaced = state.students.filter(function (st) { return !lockerOf(st.id); }).length;
            [ui['remove-unplaced'], ui['remove-unplaced-side']].forEach(function (b) {
                b.disabled = !unplaced;
                b.title = unplaced ? 'Remove the ' + unplaced + ' student' + (unplaced === 1 ? '' : 's') + ' in the No locker list (students who have a locker stay)' : 'Every student has a locker';
            });
            ui['remove-unplaced-side'].style.display = unplaced ? '' : 'none';
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
            var areaBox = null, areaName = null, hiddenBanks = 0;
            state._bankIds.forEach(function (ids, bi) {
                var bank = state.banks[bi];
                if (bankHidden(ids)) { hiddenBanks++; return; }
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
                if (bank.br && areaBox.children.length) areaBox.appendChild(make('div', 'lk-row-break'));
                var box = make('div', 'lk-bank');
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
                var lay = bankLayout(ids.length, tiers, ord, side, row, ids, bank.top);
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
                paintTg(item, s);
                item.appendChild(make('span', 'lk-pool-name', s.surname + ', ' + s.firstName));
                if (badgeOf(s)) item.appendChild(make('span', 'lk-hr', badgeOf(s)));
                item.title = studentInfo(s) + '\nClick to put in the locker typed above, or drag onto a locker';
                pool.appendChild(item);
            });
            if (!state.students.length) {
                pool.appendChild(make('div', 'lk-pool-empty', 'No students yet. Press Import or Paste.'));
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
                (waiting.length > free && state.students.length ? '<div class="lk-warn">Not enough free lockers for everyone</div>' : '') +
                yearStats();

            if (hiddenBanks) {
                var hn = make('div', 'lk-hidden-note', hiddenBanks + (hiddenBanks === 1 ? ' bank has' : ' banks have') +
                    ' no lockers allocated and ' + (hiddenBanks === 1 ? 'is' : 'are') + ' hidden. Untick Hide empty banks to see ' + (hiddenBanks === 1 ? 'it.' : 'them.'));
                if (hiddenBanks === state._bankIds.length) hn.textContent = 'Every bank is empty, so they are all hidden. Untick Hide empty banks to see them.';
                canvas.insertBefore(hn, canvas.firstChild);
            }
            var tgl = tgLegend();
            if (tgl && order.length) canvas.insertBefore(tgl, canvas.firstChild);
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
                '<label class="lk-bs-opt lk-bs-spec" title="The locker numbers in this bank, in order: ranges such as 550-544 (counting down) or 101-110, and single lockers, separated by commas. Press Enter to apply.">Lockers ' +
                '<input type="text" data-bank-opt="spec" data-bank="' + bi + '" value="' + esc(bank.spec || '') + '" spellcheck="false" aria-label="Locker numbers in this bank"></label>' +
                sel('tiers', 'High', [['', 'Toolbar (' + state.tiers + ')'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']]) +
                sel('order', 'Numbers run', [['', 'Toolbar (' + (state.order === 'down' ? 'down' : 'across') + ')'], ['down', 'Down ↓'], ['across', 'Across →']]) +
                sel('side', 'First locker', [['', 'Toolbar (' + state.side + ')'], ['left', 'Left'], ['right', 'Right']]) +
                sel('row', 'First row', [['', 'Toolbar (' + state.row + ')'], ['top', 'Top'], ['bottom', 'Bottom']]) +
                (bankTiers(bank) === 2 || bank.top
                    ? sel('top', 'Top row', [['', 'Follow the numbers'], ['odd', 'Odd numbers'], ['even', 'Even numbers']]).replace('<label class="lk-bs-opt">',
                        '<label class="lk-bs-opt" title="Line up a 2-high bank by number: odd (or even) numbers always in the top row, each column a pair, wherever the numbers start.">')
                    : '') +
                '<label class="lk-bs-opt">Area <input type="text" data-bank-opt="area" data-bank="' + bi + '" value="' + esc(bank.area || '') + '" placeholder="none"></label>' +
                '<label class="lk-bs-opt" title="End the row of banks here: this bank starts a new line on the left (--- in Lockers)"><input type="checkbox" data-bank-opt="br" data-bank="' + bi + '"' + (bank.br ? ' checked' : '') + '> Start a new line</label>' +
                bankYearSelect(bi);
            return p;
        }

        /* ⚙ Year level: keeps every locker in the bank (or in one row of it) for one year, or for anyone */
        function bankYearSelect(bi) {
            var years = {};
            [7, 8, 9, 10, 11, 12].forEach(function (y) { years[y] = true; });
            state.students.forEach(function (st) { if (st.year) years[st.year] = true; });
            Object.keys(state.reserve).forEach(function (id) { years[state.reserve[id]] = true; });
            var base = [['', 'Anyone']].concat(Object.keys(years).sort(numSort).map(function (y) { return [y, 'Year ' + y]; }));
            function current(ids) {
                var seen = {};
                ids.forEach(function (id) { seen[state.reserve[id] || ''] = true; });
                var vals = Object.keys(seen);
                return vals.length === 1 ? vals[0] : 'mixed';
            }
            function select(ids, attrs, title) {
                var cur = current(ids), opts = cur === 'mixed' ? [['mixed', 'Mixed']].concat(base) : base;
                return '<select ' + attrs + ' title="' + esc(title) + '">' +
                    opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
                    '</select>';
            }
            var html = '<label class="lk-bs-opt">Year level ' +
                select(state._bankIds[bi] || [], 'data-bank-opt="year" data-bank="' + bi + '"', 'Keep every locker in this bank for one year level') + '</label>';
            var n = bankRowCount(bi);
            if (n > 1) {
                html += '<span class="lk-bs-rows"><span class="lk-bs-rows-label">Rows:</span>';
                for (var r = 1; r <= n; r++) {
                    var lbl = rowLabel(r, n);
                    html += '<label class="lk-bs-opt">' + lbl.charAt(0).toUpperCase() + lbl.slice(1) + ' ' +
                        select(bankRowIds(bi, r), 'data-bank-opt="yearrow" data-row="' + r + '" data-bank="' + bi + '"',
                            'Keep ' + theRow(r, n) + ' of this bank for one year level') + '</label>';
                }
                html += '</span>';
            }
            return html;
        }

        function onBankOpt(e) {
            var el = e.target;
            var key = el.getAttribute('data-bank-opt');
            if (!key) return;
            var bank = state.banks[+el.getAttribute('data-bank')];
            if (!bank) return;
            if (key === 'br') { pushUndo(); bank.br = el.checked; changed(); return; }
            var v = el.value.trim();
            if (key === 'name' && !v) { el.value = bank.name; return; }
            if (key === 'spec') { changeBankSpec(bank, el, v); return; }
            if (key === 'year' || key === 'yearrow') {
                if (v === 'mixed') return;
                var bix = state.banks.indexOf(bank), r = +el.getAttribute('data-row') || 0;
                var ids = key === 'yearrow' ? bankRowIds(bix, r) : (state._bankIds[bix] || []);
                var what = key === 'yearrow' ? theRow(r, bankRowCount(bix), true) + ' of ' + bank.name : bank.name;
                pushUndo();
                ids.forEach(function (id) { if (v) state.reserve[id] = v; else delete state.reserve[id]; });
                changed();
                setStatus(v ? what + ' is kept for Year ' + v + '.' : what + ' is for anyone.');
                return;
            }
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

        /* ⚙ Lockers: new numbers for one bank, e.g. "550-544" -> "549-544". Lockers that stay keep their
           students; students in lockers that go are put back on the No locker list (asked first). */
        function changeBankSpec(bank, el, v) {
            var bi = state.banks.indexOf(bank);
            v = v.replace(/\s*,\s*/g, ', ').replace(/\s*-\s*/g, '-');
            if (v === (bank.spec || '')) { el.value = bank.spec || ''; return; }
            function refuse(msg) { el.value = bank.spec || ''; setStatus(bank.name + ': ' + msg, true); }
            if (!v) return refuse('a bank needs at least one locker. To remove the bank, use its × button.');
            var r = expandSpec(v);
            if (r.error) return refuse(r.error + '. Nothing was changed.');
            var seen = {}, dupes = [], clash = [];
            r.ids.forEach(function (id) {
                var k = id.toLowerCase();
                if (seen[k]) dupes.push(id);
                seen[k] = true;
                var at = lockerIndex[k];
                if (at && at.bank !== bi) clash.push(id + ' (in ' + state.banks[at.bank].name + ')');
            });
            if (dupes.length) return refuse('locker ' + dupes.slice(0, 5).join(', ') + ' is listed twice. Nothing was changed.');
            if (clash.length) return refuse('locker ' + clash.slice(0, 4).join(', ') + (clash.length > 4 ? ' …' : '') + ' is already in another bank. Nothing was changed.');
            var old = state._bankIds[bi] || [];
            var gone = old.filter(function (id) { return !seen[id.toLowerCase()]; });
            var losing = gone.filter(function (id) { return state.assign[id]; }).map(function (id) {
                var st = studentById(state.assign[id]);
                return id + (st ? ' (' + fullName(st) + ')' : '');
            });
            if (losing.length && !window.confirm('Removing ' + (losing.length === 1 ? 'locker ' : 'lockers ') + losing.slice(0, 6).join(', ') +
                (losing.length > 6 ? ' and ' + (losing.length - 6) + ' more' : '') + ' from ' + bank.name + '. ' +
                (losing.length === 1 ? 'That student goes' : 'Those students go') + ' back on the No locker list. (Undo brings them back.) Continue?')) {
                el.value = bank.spec || '';
                return;
            }
            pushUndo();
            bank.spec = v;
            openBank = bi;
            rebuildIndex();
            changed();
            var added = r.ids.filter(function (id) { return !old.some(function (o) { return o.toLowerCase() === id.toLowerCase(); }); });
            var msg = bank.name + ' now has ' + r.ids.length + ' locker' + (r.ids.length === 1 ? '' : 's') + ' (' + v + ').';
            if (gone.length) msg += ' Removed: ' + gone.slice(0, 8).join(', ') + (gone.length > 8 ? ' …' : '') + '.';
            if (added.length) msg += ' Added: ' + added.slice(0, 8).join(', ') + (added.length > 8 ? ' …' : '') + '.';
            if (losing.length) msg += ' ' + losing.length + ' student' + (losing.length === 1 ? ' is' : 's are') + ' back on the No locker list.';
            setStatus(msg);
        }

        function gridStyle(grid, lay, side) {
            if (!lay.pos) {
                /* 1-high: one row as wide as its lockers, wrapping only when it runs out of room */
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
                paintTg(cell, s);
                cell.draggable = true;
                cell.setAttribute('data-sid', s.id);
                cell.appendChild(make('div', 'lk-first', s.firstName));
                cell.appendChild(make('div', 'lk-last', displaySurname(s)));
                if (badgeOf(s)) cell.appendChild(make('span', 'lk-hr lk-cell-badge', badgeOf(s)));   /* top-right corner */
                var rm = make('button', 'lk-cell-x', '\u00d7');   /* bottom-right: take the student out */
                rm.type = 'button';
                rm.setAttribute('data-remove', id);
                rm.title = 'Take ' + fullName(s) + ' out of locker ' + id;
                rm.setAttribute('aria-label', rm.title);
                rm.draggable = false;
                cell.appendChild(rm);
                cell.title = 'Locker ' + id + ': ' + studentInfo(s) + '\nDrag to move or swap; × or Delete: take out; right-click: out of service.';
            } else {
                cell.classList.add('lk-free');
                cell.title = 'Locker ' + id + ' is free. Click, then type a name. Right-click: out of service.';
            }
            var ry = state.reserve[id];
            if (ry && !state.out[id]) {
                var rc = yearColour(ry) || ['#f1f5f9', '#64748b'];
                cell.classList.add('lk-res');
                cell.style.setProperty('--lk-res-bg', rc[0]);
                cell.style.setProperty('--lk-res-bd', rc[1]);
                if (!s) {
                    cell.appendChild(make('div', 'lk-res-label', 'Year ' + ry));
                    cell.title = 'Locker ' + id + ' is free, kept for Year ' + ry + '. Click, then type a name. Right-click: out of service.';
                } else if (String(s.year) !== ry) {
                    cell.classList.add('lk-res-clash');
                    cell.title += '\nThis locker is kept for Year ' + ry + (s.year ? '; ' + s.firstName + ' is in Year ' + s.year : '') + '.';
                } else {
                    cell.title += '\nKept for Year ' + ry + '.';
                }
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
                cur.textContent = state.reserve[id] ? 'Free · Year ' + state.reserve[id] : 'Free';
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
            } else if ((e.key === 'Delete' || (e.key === 'Backspace' && e.ctrlKey && !e.shiftKey)) && !ui['entry-name'].value) {
                /* Delete (with the Name box empty) takes the student out of the selected locker */
                e.preventDefault();
                if (state.sel && state.assign[state.sel]) emptyLocker(state.sel);
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
            msg += yearClash(id, s);
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
            var st = studentById(state.assign[id]);
            pushUndo();
            delete state.assign[id];
            changed();
            if (st) setStatus(fullName(st) + ' is out of locker ' + id + ' and back in the No locker list. Undo puts them back.');
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
            var warn = yearClash(target, studentById(sid)) + (other && from ? yearClash(from, studentById(other)) : '');
            if (warn) setStatus(warn.trim());
        }

        /* ----- toolbar ----- */

        function onRootClick(e) {
            var rmb = e.target.closest('.lk-cell-x');
            if (rmb && ui.canvas.contains(rmb)) { e.stopPropagation(); emptyLocker(rmb.getAttribute('data-remove')); return; }
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
            else if (a === 'wide') setWide(!root.classList.contains('lk-wide'), true);
            else if (a === 'reset') resetAll();
            else if (a === 'setup') openSetup();
            else if (a === 'years') openYears();
            else if (a === 'by-student') openByStudent();
            else if (a === 'paste') openPaste();
            else if (a === 'paste-roster') openPasteRoster();
            else if (a === 'combos') openCombos();
            else if (a === 'auto') autoAllocate(b.getAttribute('data-mode'));
            else if (a === 'clear-all') clearAll();
            else if (a === 'remove-year') removeYear(b.getAttribute('data-year'));
            else if (a === 'remove-unplaced') removeUnplaced();
            else if (a === 'tiers') setLayoutDefault('tiers', +b.getAttribute('data-n'), 0);
            else if (a === 'order') setLayoutDefault('order', b.getAttribute('data-order'), '');
            else if (a === 'side') setLayoutDefault('side', b.getAttribute('data-side'), '');
            else if (a === 'row') setLayoutDefault('row', b.getAttribute('data-row'), '');
            else if (a === 'bank-settings') { var k = +b.getAttribute('data-bank'); openBank = openBank === k ? -1 : k; render(); }
            else if (a === 'bank-remove' || a === 'bank-empty') bankAction(a, +b.getAttribute('data-bank'));
            else if (a === 'entry-clear') { emptyLocker(state.sel); ui['entry-name'].focus(); }
            else if (a === 'entry-out') { toggleOut(state.sel); ui['entry-name'].focus(); }
        }

        /* Toolbar Tiers / Run / Start / Top-Bottom. Banks with their own
           setting (chosen in ⚙) keep it, unless "Override banks" is ticked. */
        function setLayoutDefault(key, v, blank) {
            var over = ui['toggle-override'] && ui['toggle-override'].checked;
            var kept = over ? 0 : state.banks.filter(function (k) { return k[key] && k[key] !== v; }).length;
            if (state[key] === v && !over) return;
            pushUndo();
            state[key] = v;
            if (over) state.banks.forEach(function (k) { k[key] = blank; });
            changed();
            if (kept) setStatus(kept + ' bank' + (kept === 1 ? ' keeps its' : 's keep their') + ' own setting. Tick Override banks to change ' + (kept === 1 ? 'it' : 'them') + ' too.');
        }

        function bankAction(a, bi) {
            var bank = state.banks[bi];
            if (!bank) return;
            if (a === 'bank-side') {
                pushUndo();
                bank.side = bankSide(bank) === 'right' ? 'left' : 'right';
            } else if (a === 'bank-row') {
                pushUndo();
                bank.row = bankRow(bank) === 'bottom' ? 'top' : 'bottom';
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
            /* Simple view: always keep the lockers students already have */
            var keep = state.keepExisting || root.classList.contains('cc-simple');
            var students = state.students.filter(function (s) { return !keep || !lockerOf(s.id); });
            if (!students.length) {
                setStatus(root.classList.contains('cc-simple')
                    ? 'Everyone already has a locker. To give everyone a new one, choose Full (top right) and untick Keep.'
                    : 'Everyone already has a locker. Untick "Keep" to reallocate everyone.');
                return;
            }
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
            /* Lockers kept for a year level only go to that year. Students of a year with kept lockers
               fill those first, then any locker not kept for a year; everyone else only gets those. */
            var open = [], kept = {};
            order.forEach(function (id) {
                if (state.out[id] || state.assign[id]) return;
                var y = state.reserve[id];
                if (y) (kept[y] = kept[y] || []).push(id); else open.push(id);
            });
            var n = 0, overflow = {}, waiting = {};
            students.forEach(function (st) {
                var y = String(st.year || ''), pool = y && kept[y];
                var id = pool && pool.length ? pool.shift() : open.shift();
                if (id) {
                    state.assign[id] = st.id;
                    n++;
                    if (y && yearHasLockers(y) && !state.reserve[id]) overflow[y] = (overflow[y] || 0) + 1;
                } else waiting[y || '?'] = (waiting[y || '?'] || 0) + 1;
            });
            changed();
            var left = students.length - n, notes = [];
            Object.keys(overflow).sort(numSort).forEach(function (y) {
                notes.push(overflow[y] + ' Year ' + y + ' student' + (overflow[y] === 1 ? '' : 's') + ' went in lockers not kept for a year (Year ' + y + '\'s lockers are full)');
            });
            if (left) {
                var spareKept = Object.keys(kept).filter(function (y) { return kept[y].length; });
                notes.push(left + ' still need one' + (spareKept.length
                    ? ' (the free lockers left are kept for ' + spareKept.sort(numSort).map(function (y) { return 'Year ' + y; }).join(', ') + ')'
                    : ' (not enough free lockers)'));
            }
            setStatus(n + ' student' + (n === 1 ? '' : 's') + ' given lockers' + (notes.length ? '. ' + notes.join('. ') + '.' : '.'), !!notes.length);
        }

        /* ----- year levels: lockers kept for one year ----- */

        function numSort(a, b) { return (+a || 99) - (+b || 99) || String(a).localeCompare(String(b)); }
        function yearHasLockers(y) {
            for (var id in state.reserve) if (state.reserve[id] === String(y)) return true;
            return false;
        }

        /* " (Locker 105 is kept for Year 7.)" when a student of another year is put in it */
        function yearClash(id, st) {
            var y = state.reserve[id];
            if (!y || !st || String(st.year) === y) return '';
            return ' Note: locker ' + id + ' is kept for Year ' + y + (st.year ? ', and ' + st.firstName + ' is in Year ' + st.year : '') + '.';
        }

        /* Row r (1 = top, as on screen) of bank bi. A 1-high bank is one row. */
        function bankRowIds(bi, r) {
            var ids = state._bankIds[bi] || [], bank = state.banks[bi];
            var tiers = bankTiers(bank);
            if (tiers <= 1) return r === 1 ? ids.slice() : [];
            var lay = bankLayout(ids.length, tiers, bankOrder(bank), bankSide(bank), bankRow(bank), ids, bank.top);
            return ids.filter(function (id, i) { return lay.pos[i].r === r; });
        }
        function bankRowCount(bi) { return Math.max(1, bankTiers(state.banks[bi])); }
        /* "top", "bottom", "top row", "row 2", "middle" -> row number in bank bi (0 if none) */
        function rowNumber(word, bi) {
            var w = String(word || '').toLowerCase().replace(/\s+row$/, '').trim(), n = bankRowCount(bi);
            if (w === 'top') return 1;
            if (w === 'bottom') return n;
            if (w === 'middle' && n % 2 === 1) return (n + 1) / 2;
            var m = /^row\s*(\d)$/.exec(w);
            return m && +m[1] >= 1 && +m[1] <= n ? +m[1] : 0;
        }
        var ROW_WORD_RE = /^(.*?)\s*\b(top(?:\s+row)?|bottom(?:\s+row)?|middle(?:\s+row)?|row\s*\d)$/i;

        /* "Corridor B, 101-140, A1, Gym top, bottom" -> locker ids. Bank and area names work as well
           as numbers; "top", "bottom", "middle" or "row 2" after a name means just that row of it,
           and on its own means that row of every bank. */
        function resolveLockers(spec) {
            var ids = [], unknown = [], seen = {};
            function add(id) { if (!seen[id]) { seen[id] = true; ids.push(id); } }
            String(spec || '').split(',').forEach(function (item) {
                item = item.trim();
                if (!item) return;
                var k = item.toLowerCase(), found = false;
                state.banks.forEach(function (b, bi) {
                    if (b.name.toLowerCase() === k || (b.area && b.area.toLowerCase() === k)) {
                        (state._bankIds[bi] || []).forEach(add);
                        found = true;
                    }
                });
                if (found) return;
                var rm = ROW_WORD_RE.exec(item);
                if (rm) {
                    var where = rm[1].trim().toLowerCase(), rowWord = rm[2], matched = false, any = false;
                    state.banks.forEach(function (b, bi) {
                        if (where && b.name.toLowerCase() !== where && !(b.area && b.area.toLowerCase() === where)) return;
                        matched = true;
                        if (!where && bankRowCount(bi) === 1) return;   /* "top" on its own: banks with rows only */
                        var r = rowNumber(rowWord, bi);
                        if (r) { bankRowIds(bi, r).forEach(add); any = true; }
                    });
                    if (matched) { if (!any) unknown.push(item + ' (no such row)'); return; }
                }
                var r = expandSpec(item);
                if (r.error) { unknown.push(item); return; }
                var missing = [];
                r.ids.forEach(function (id) { var l = findLocker(id); if (l) add(l.id); else missing.push(id); });
                if (missing.length) unknown.push(missing.length === r.ids.length ? item : missing.slice(0, 3).join(', ') + (missing.length > 3 ? '…' : ''));
            });
            return { ids: ids, unknown: unknown };
        }

        /* the kept lockers written as text, a line per year: whole banks by name, else ranges */
        function yearsToText() {
            var byYear = {};
            Object.keys(state.reserve).forEach(function (id) { (byYear[state.reserve[id]] = byYear[state.reserve[id]] || {})[id] = true; });
            return Object.keys(byYear).sort(numSort).map(function (y) {
                var mine = byYear[y], parts = [];
                state._bankIds.forEach(function (ids, bi) {
                    var inBank = ids.filter(function (id) { return mine[id]; });
                    if (!inBank.length) return;
                    var bname = state.banks[bi].name, plainName = !/[,:]/.test(bname);
                    if (inBank.length === ids.length && plainName) { parts.push(bname); return; }
                    /* whole rows: "Corridor A top" */
                    var nRows = bankRowCount(bi);
                    if (plainName && nRows > 1) {
                        var taken = {};
                        for (var r = 1; r <= nRows; r++) {
                            var rowIds = bankRowIds(bi, r);
                            if (rowIds.length && rowIds.every(function (id) { return mine[id]; })) {
                                parts.push(bname + ' ' + rowLabel(r, nRows));
                                rowIds.forEach(function (id) { taken[id] = true; });
                            }
                        }
                        inBank = inBank.filter(function (id) { return !taken[id]; });
                    }
                    var run = null;
                    function flush() { if (run) parts.push(run.a === run.b ? run.a : run.a + '-' + run.b); run = null; }
                    inBank.forEach(function (id) {
                        var m = /^([A-Za-z]*)(\d+)$/.exec(id);
                        if (run && m && run.p === m[1] && +m[2] === run.n + 1 && m[2].length === run.w) { run.b = id; run.n++; return; }
                        flush();
                        run = m ? { a: id, b: id, p: m[1], n: +m[2], w: m[2].length } : { a: id, b: id, p: null, n: NaN, w: 0 };
                    });
                    flush();
                });
                return 'Year ' + y + ': ' + parts.join(', ');
            }).join('\n');
        }

        function rowLabel(r, n) { return r === 1 ? 'top' : r === n ? 'bottom' : 'row ' + r; }
        /* "the top row" / "row 2" (cap: "The top row" / "Row 2") */
        function theRow(r, n, cap) {
            var l = rowLabel(r, n), t = /^row/.test(l) ? l : 'the ' + l + ' row';
            return cap ? t.charAt(0).toUpperCase() + t.slice(1) : t;
        }

        /* "Year 7: 101-160" lines -> {map: id -> year, lines: [{year, n, unknown}], errors, overlaps} */
        function parseYearsText(text) {
            var res = { map: {}, lines: [], errors: [], overlaps: 0 };
            String(text || '').split(/\r?\n|;/).forEach(function (line) {
                line = line.trim();
                if (!line || line.charAt(0) === '#') return;
                var m = /^(?:year|yr|y|grade)?\s*(\d{1,2})\s*[:=\-–]?\s+(.+)$/i.exec(line) || /^(?:year|yr|y|grade)?\s*(\d{1,2})\s*:\s*(.+)$/i.exec(line);
                if (!m) { res.errors.push('"' + line + '": start the line with the year, e.g. Year 7: 101-160'); return; }
                var y = String(+m[1]), r = resolveLockers(m[2]);
                r.ids.forEach(function (id) {
                    if (res.map[id] && res.map[id] !== y) res.overlaps++;
                    res.map[id] = y;
                });
                res.lines.push({ year: y, n: r.ids.length, unknown: r.unknown });
                if (r.unknown.length) res.errors.push('Year ' + y + ': not found: ' + r.unknown.join(', '));
            });
            return res;
        }

        function openYears() {
            if (!order.length) { setStatus('Set up the lockers first.'); return; }
            openModal('Year levels',
                '<p class="lk-help">Keep lockers for a year level: one line per year, then the lockers. Use bank or area names, ' +
                'ranges such as <code>101-160</code>, or single lockers, separated by commas. ' +
                'For one row of a bank, add <code>top</code>, <code>bottom</code> or <code>row 2</code> after its name ' +
                '(<code>Corridor A top</code>); on its own, <code>top</code> means the top row of every bank. ' +
                '<b>A–Z</b>, <b>Homeroom</b> and <b>Random</b> then put only that year\'s students in those lockers. ' +
                'Students in a year with no kept lockers (or whose kept lockers are full) go in lockers that are not kept for a year.</p>' +
                '<textarea class="lk-textarea" data-m="years" rows="8" spellcheck="false" placeholder="Year 7: Corridor A bottom, 101-160\nYear 8: 201-260\nYear 12: Corridor A top, Gym"></textarea>' +
                '<div class="lk-preview" data-m="preview"></div>' +
                '<p class="lk-help">Delete a line to stop keeping those lockers. You can also set a whole bank, or each of its rows, from its ⚙ button. ' +
                'Students already in lockers stay where they are; untick <b>Keep</b> and allocate again to move everyone.</p>',
                'Apply', applyYears, true);
            var ta = mui.body.querySelector('[data-m="years"]');
            ta.value = yearsToText();
            var preview = mui.body.querySelector('[data-m="preview"]');
            function show() {
                var p = parseYearsText(ta.value), counts = {}, need = {};
                Object.keys(p.map).forEach(function (id) { counts[p.map[id]] = (counts[p.map[id]] || 0) + 1; });
                state.students.forEach(function (st) { if (st.year) need[st.year] = (need[st.year] || 0) + 1; });
                var years = Object.keys(counts).sort(numSort);
                var total = Object.keys(p.map).length;
                preview.innerHTML = years.length
                    ? '<b>' + total + '</b> of ' + order.length + ' lockers kept: ' + years.map(function (y) {
                        var short = need[y] && need[y] > counts[y];
                        return '<span' + (short ? ' class="lk-warn-text"' : '') + '>Year ' + esc(y) + ' ' + counts[y] + ' locker' + (counts[y] === 1 ? '' : 's') +
                            (need[y] ? ' for ' + need[y] + ' student' + (need[y] === 1 ? '' : 's') : '') + '</span>';
                    }).join(' · ') + '. <b>' + (order.length - total) + '</b> for anyone.' +
                    (p.overlaps ? '<div class="lk-help">' + p.overlaps + ' locker(s) are on more than one line: the later line wins.</div>' : '')
                    : 'No lockers kept for a year level: every locker is for anyone.';
                if (p.errors.length) preview.innerHTML += '<div class="lk-errors">' + p.errors.map(esc).join('<br>') + '</div>';
                if (!hasYears() && years.length) preview.innerHTML += '<div class="lk-errors">No students have a year level yet. Import or Add a class list with a Year column.</div>';
            }
            ta.addEventListener('input', show);
            show();
            setTimeout(function () { ta.focus(); }, 30);
        }

        function applyYears() {
            var p = parseYearsText(mui.body.querySelector('[data-m="years"]').value);
            pushUndo();
            state.reserve = p.map;
            closeModal();
            changed();
            var n = Object.keys(p.map).length, clash = clashCount();
            setStatus((n ? n + ' locker' + (n === 1 ? ' is' : 's are') + ' kept for a year level.' : 'No lockers are kept for a year level now.') +
                (clash ? ' ' + clash + ' student' + (clash === 1 ? ' is' : 's are') + ' already in a locker kept for another year (outlined in red). ' +
                    'Untick Keep and allocate again to move them.' : ''), true);
        }

        function clashCount() {
            var n = 0;
            Object.keys(state.assign).forEach(function (id) {
                var y = state.reserve[id], st = studentById(state.assign[id]);
                if (y && st && String(st.year) !== y) n++;
            });
            return n;
        }

        /* side panel lines: Year 7: 60 lockers, 12 free, 58 students */
        function yearStats() {
            var kept = {}, freeK = {}, need = {};
            Object.keys(state.reserve).forEach(function (id) {
                if (state.out[id]) return;
                var y = state.reserve[id];
                kept[y] = (kept[y] || 0) + 1;
                if (!state.assign[id]) freeK[y] = (freeK[y] || 0) + 1;
            });
            var years = Object.keys(kept).sort(numSort);
            if (!years.length) return '';
            state.students.forEach(function (st) { if (st.year) need[st.year] = (need[st.year] || 0) + 1; });
            var clash = clashCount();
            return '<div class="lk-stats-years">' + years.map(function (y) {
                var c = yearColour(y) || ['#f1f5f9', '#64748b'];
                var short = (need[y] || 0) > kept[y];
                return '<div title="' + kept[y] + ' lockers kept for Year ' + y + ', ' + (freeK[y] || 0) + ' still free; ' + (need[y] || 0) + ' Year ' + y + ' students' +
                    (short ? '. Not enough: the rest go in lockers that are not kept for a year.' : '') + '">' +
                    '<span class="lk-yr-dot" style="background:' + c[0] + ';border-color:' + c[1] + '"></span>' +
                    '<b>Y' + esc(y) + '</b> ' + kept[y] + ' kept · ' + (freeK[y] || 0) + ' free' + (short ? ' <span class="lk-warn-text">(' + need[y] + ' students)</span>' : '') + '</div>';
            }).join('') + (clash ? '<div class="lk-warn">' + clash + ' in another year\'s locker</div>' : '') + '</div>';
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

        /* take every student without a locker off the list (e.g. students who have left) */
        function removeUnplaced() {
            var leaving = state.students.filter(function (st) { return !lockerOf(st.id); });
            if (!leaving.length) { setStatus('Every student has a locker, so there is no one to remove.'); return; }
            var names = leaving.slice(0, 8).map(fullName).join(', ') + (leaving.length > 8 ? ' and ' + (leaving.length - 8) + ' more' : '');
            if (!window.confirm('Remove the ' + leaving.length + ' student' + (leaving.length === 1 ? '' : 's') + ' with no locker?\n\n' + names +
                '\n\nStudents who have a locker stay. Undo can bring them back.')) return;
            pushUndo();
            var gone = {};
            leaving.forEach(function (st) { gone[st.id] = true; });
            state.students = state.students.filter(function (st) { return !gone[st.id]; });
            changed();
            setStatus(leaving.length + ' student' + (leaving.length === 1 ? '' : 's') + ' with no locker removed. Undo brings them back.', true);
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

        /* Paste (class list): a list copied from a spreadsheet, with or without headings (see ClassroomPaste).
           Goes through applyRoster like an imported file, so lockers, combinations, year levels and
           other headed columns (TG, House …) are kept. */
        function openPasteRoster() {
            var actions = [{ value: 'replace', label: state.students.length ? 'Replace the students' : 'Use this list', primary: true }];
            if (state.students.length) actions.unshift({ value: 'add', label: 'Add to the list',
                title: 'Keep everyone already here; add new students and fill in details for ones already on the list' });
            window.ClassroomPaste.open({
                title: 'Paste a class list',
                lockers: true,
                extra: true,
                keepNameless: true,
                actions: actions,
                onApply: function (rows, action, info) {
                    var before = state.students;
                    rosterMode = action === 'add' ? 'add' : 'replace';
                    applyRoster(rows, '');
                    rosterMode = 'replace';
                    /* stays open only if a Replace was cancelled; a list of just lockers and combinations always closes */
                    return action === 'add' || !info.students || state.students !== before;
                }
            });
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
                    if (clean(p.homeroom) && clean(p.homeroom) !== s.tg) { s.tg = clean(p.homeroom); changedAny = true; }
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

        /* School system list, one row per allocated locker:
           Locker ID | Location / room | Surname, firstname | Tutor group
           Location / room is the bank's area (or its name when it has no area), or always the bank's name. */
        function schoolRows(o) {
            var list = [];
            state._bankIds.forEach(function (ids, bi) {
                var bank = state.banks[bi];
                var where = o.location === 'bank' ? bank.name : (bank.area || bank.name);
                ids.forEach(function (id) {
                    if (state.out[id] || !state.assign[id]) return;
                    var st = studentById(state.assign[id]);
                    if (st) list.push({ id: id, where: where, st: st });
                });
            });
            if (o.sort === 'surname') list.sort(function (a, b) { return bySurname(a.st, b.st); });
            var rows = [['Locker ID', 'Location / room', 'Surname, firstname', 'Tutor group']];
            list.forEach(function (r) {
                var name = [r.st.surname, r.st.firstName].filter(Boolean).join(', ');
                rows.push([r.id, r.where, name, tutorGroup(r.st)]);
            });
            return rows;
        }

        /* rows -> tab-separated lines, so a paste into Excel puts each value in its own column
           (a tab or line break inside a value becomes a space) */
        function tabText(rows) {
            return rows.map(function (r) {
                return r.map(function (v) { return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' '); }).join('\t');
            }).join('\r\n');
        }

        /* Copy text to the clipboard; falls back to a hidden text box where the Clipboard API is blocked */
        function copyText(text) {
            function fallback() {
                return new Promise(function (resolve, reject) {
                    var ta = document.createElement('textarea');
                    ta.value = text;
                    ta.setAttribute('readonly', '');
                    ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
                    (modal || document.body).appendChild(ta);
                    ta.select();
                    var ok = false;
                    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
                    ta.remove();
                    if (ok) resolve(); else reject(new Error('This browser would not copy. Download the file instead.'));
                });
            }
            if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) {
                return navigator.clipboard.writeText(text).catch(fallback);
            }
            return fallback();
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
                combo: o.combo != null ? !!o.combo : comboCount() > 0,
                location: o.location === 'bank' ? 'bank' : 'area', schoolSort: o.schoolSort === 'surname' ? 'surname' : 'locker' };
            function radio(name, value, label, cur) {
                return '<label class="lk-check-row"><input type="radio" name="lk-x-' + name + '" value="' + value + '"' + (cur === value ? ' checked' : '') + '> <span>' + label + '</span></label>';
            }
            openModal('Export',
                '<div class="lk-x-group"><b>Columns</b>' +
                radio('layout', 'simple', 'Simple list: <code>Surname Name</code>, <code>First Name</code>, <code>Year Level</code>, <code>Locker number</code> (and <code>Locker Combo</code>)', o.layout) +
                radio('layout', 'full', 'Full locker list: every locker with bank, combination, name, year, homeroom, other details and status', o.layout) +
                radio('layout', 'school', 'School system list: <code>Locker ID</code>, <code>Location / room</code>, <code>Surname, firstname</code>, <code>Tutor group</code>, one row per allocated locker', o.layout) +
                '</div>' +
                '<div class="lk-x-group lk-x-school"><b>School system list options</b>' +
                '<label class="lk-check-row">Location / room <select data-m="location">' +
                '<option value="area">Area (bank name if the bank has no area)</option><option value="bank">Bank name</option></select></label>' +
                '<label class="lk-check-row">Order by <select data-m="schoolSort"><option value="locker">Locker number</option><option value="surname">Surname</option></select></label>' +
                '<div class="lk-x-preview" data-m="preview" aria-label="First lines of the list"></div>' +
                '<div class="lk-x-copyrow"><button type="button" class="lk-btn lk-btn-teal" data-m="copy" title="Copy the rows without the heading row, ready to paste into Excel">' +
                icon('paste') + 'Copy without headings</button><span class="lk-x-copied" data-m="copied" role="status"></span></div>' +
                '<p class="lk-help">Copy puts the rows on the clipboard with tabs between the columns: paste into Excel and each value goes in its own column. ' +
                'Download saves them with the heading row, as the file type below.</p>' +
                '</div>' +
                '<div class="lk-x-group lk-x-simple"><b>Simple list options</b>' +
                '<label class="lk-check-row">Year Level as <select data-m="yearWord"><option value="0">7</option><option value="1">Year 7</option></select></label>' +
                '<label class="lk-check-row">Order by <select data-m="sort"><option value="surname">Surname</option><option value="locker">Locker number</option></select></label>' +
                '<label class="lk-check-row"><input type="checkbox" data-m="noLocker"> Include students without a locker (Locker number left blank)</label>' +
                '<label class="lk-check-row"><input type="checkbox" data-m="xcombo"> <span>Add a <code>Locker Combo</code> column</span></label>' +
                '</div>' +
                '<div class="lk-x-group lk-x-filetype"><b>File type</b>' +
                radio('format', 'xlsx', 'Excel (.xlsx)', o.format) +
                radio('format', 'csv', 'CSV (.csv), opens in Excel and most school systems', o.format) +
                '</div>',
                'Download', function () {
                    var get = function (n) { var el = mui.body.querySelector('input[name="lk-x-' + n + '"]:checked'); return el ? el.value : ''; };
                    var c = choices();
                    state.display.exportPrefs = c;
                    save();
                    var school = c.layout === 'school';
                    var rows = c.layout === 'full' ? fullRows() : school ? schoolRows({ location: c.location, sort: c.schoolSort }) : simpleRows(c);
                    if (school && rows.length < 2) { mui.msg.textContent = 'No lockers are allocated yet.'; return; }
                    var name = fileSlug(state.title, 'lockers') + (c.layout === 'full' ? '' : school ? '_allocation' : '_list');
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
            function q(m) { return mui.body.querySelector('[data-m="' + m + '"]'); }
            function choices() {
                var get = function (n) { var el = mui.body.querySelector('input[name="lk-x-' + n + '"]:checked'); return el ? el.value : ''; };
                return {
                    layout: get('layout'), format: get('format'),
                    yearWord: q('yearWord').value === '1', sort: q('sort').value,
                    noLocker: q('noLocker').checked, combo: q('xcombo').checked,
                    location: q('location').value, schoolSort: q('schoolSort').value
                };
            }
            q('yearWord').value = o.yearWord ? '1' : '0';
            q('sort').value = o.sort;
            q('noLocker').checked = o.noLocker;
            q('xcombo').checked = o.combo;
            q('location').value = o.location;
            q('schoolSort').value = o.schoolSort;
            function sync() {
                var layout = mui.body.querySelector('input[name="lk-x-layout"]:checked').value;
                mui.body.querySelector('.lk-x-simple').style.display = layout === 'simple' ? '' : 'none';
                mui.body.querySelector('.lk-x-school').style.display = layout === 'school' ? '' : 'none';
                q('copied').textContent = '';
                if (layout === 'school') {
                    var rows = schoolRows({ location: q('location').value, sort: q('schoolSort').value });
                    q('preview').innerHTML = rows.length < 2 ? 'No lockers are allocated yet.'
                        : '<table><thead><tr>' + rows[0].map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
                          rows.slice(1, 4).map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') +
                          '</tbody></table>' + (rows.length > 4 ? '<div class="lk-x-more">… ' + (rows.length - 4) + ' more</div>' : '');
                    q('copy').disabled = rows.length < 2;
                }
            }
            Array.prototype.forEach.call(mui.body.querySelectorAll('input[name="lk-x-layout"]'), function (r) { r.addEventListener('change', sync); });
            q('location').addEventListener('change', sync);
            q('schoolSort').addEventListener('change', sync);
            q('copy').addEventListener('click', function () {
                var c = choices();
                var rows = schoolRows({ location: c.location, sort: c.schoolSort });
                if (rows.length < 2) return;
                state.display.exportPrefs = c;
                save();
                copyText(tabText(rows.slice(1))).then(function () {
                    var n = rows.length - 1;
                    q('copied').textContent = 'Copied ' + n + ' row' + (n === 1 ? '' : 's') + '. Paste into Excel with Ctrl+V.';
                    setStatus('Copied ' + n + ' locker allocation' + (n === 1 ? '' : 's') + ' to the clipboard (no headings).');
                }).catch(function (err) {
                    q('copied').textContent = err && err.message ? err.message : 'Copying did not work. Download the file instead.';
                });
            });
            sync();
        }

        /* ----- printing ----- */

        function printGrid() {
            if (!order.length) { setStatus('There are no lockers to print.'); return; }
            var body = '<h1>' + esc(state.title) + '</h1><p class="lk-sub">' + Object.keys(state.assign).length + ' of ' + order.length + ' lockers allocated</p>';
            var pArea = null;
            state._bankIds.forEach(function (ids, bi) {
                var bank = state.banks[bi], side = bankSide(bank);
                if (bankHidden(ids)) return;
                if (pArea === null || (bank.area || '') !== pArea) {
                    if (pArea !== null) body += '</div>';
                    pArea = bank.area || '';
                    body += (bank.area ? '<h2 class="lk-parea">' + esc(bank.area) + '</h2>' : '') + '<div class="lk-pareabanks">';
                }
                else if (bank.br) body += '<div class="lk-prow-break"></div>';
                var lay = bankLayout(ids.length, bankTiers(bank), bankOrder(bank), side, bankRow(bank), ids, bank.top);
                var style = lay.pos ? 'grid-template-columns:repeat(' + lay.cols + ',27mm);grid-template-rows:repeat(' + lay.rows + ',auto)'
                    : 'grid-template-columns:repeat(' + Math.min(9, ids.length) + ',27mm)' + (side === 'right' ? ';direction:rtl' : '');
                body += '<div class="lk-pbank"><h3>' + esc(bank.name) + '</h3><div class="lk-pgrid" style="' + style + '">';
                ids.forEach(function (id, i) {
                    var s = state.assign[id] ? studentById(state.assign[id]) : null;
                    var at = lay.pos ? ' style="grid-column:' + lay.pos[i].c + ';grid-row:' + lay.pos[i].r + '"' : '';
                    var tgc = s && !state.out[id] ? tgColourOf(s) : null;
                    if (tgc) at = (at ? at.slice(0, -1) + ';' : ' style="') + '--tg:' + tgc + '"';
                    body += '<div class="lk-pcell' + (state.out[id] ? ' out' : '') + (tgc ? ' tg' : '') + '"' + at + '>' +
                        (s && !state.out[id] && badgeOf(s) ? '<small class="bd">' + esc(badgeOf(s)) + '</small>' : '') +
                        '<b>' + esc(id) + '</b>' +
                        (state.out[id] ? 'Out of service' : s ? '<span class="n">' + esc(s.firstName) + '</span> ' + esc(displaySurname(s))
                            : state.reserve[id] ? '<i class="ry">Year ' + esc(state.reserve[id]) + '</i>' : '') +
                        (state.display.combo && s && !state.out[id] ? '<span class="cb">' + (comboOf(id) ? esc(comboOf(id)) : '&nbsp;') + '</span>' : '') + '</div>';
                });
                body += '</div></div>';
            });
            if (pArea !== null) body += '</div>';
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
            Array.prototype.forEach.call(clone.querySelectorAll('.lk-bank-tools, .lk-bank-settings, .lk-done-bar, .lk-cell-x'), function (n) { n.remove(); });
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
            /* same columns as Export (Surname Name, First Name, Year Level, Locker number, Locker Combo) */
            var cols = [];
            if (list.some(function (s) { return s.year; })) cols.push({ label: 'Year Level', cls: 'yl', get: function (s) { return s.year || ''; } });
            var withCombo = state.display.combo && comboCount() > 0;
            function row(s) {
                var l = lockerOf(s.id);
                return '<tr><td>' + esc(s.surname) + '</td><td>' + esc(s.firstName) + '</td>' +
                    cols.map(function (c) { return '<td class="' + c.cls + '">' + esc(c.get(s) || '') + '</td>'; }).join('') +
                    '<td class="ln"><b>' + esc(l || '—') + '</b></td>' + (withCombo ? '<td class="cbc">' + esc(studentCombo(s)) + '</td>' : '') + '</tr>';
            }
            var head = '<thead><tr><th>Surname Name</th><th>First Name</th>' +
                cols.map(function (c) { return '<th class="' + c.cls + '">' + esc(c.label) + '</th>'; }).join('') +
                '<th class="ln">Locker number</th>' + (withCombo ? '<th class="cbc">Locker Combo</th>' : '') + '</tr></thead>';
            function table(part) { return '<table class="lk-ltab">' + head + '<tbody>' + part.map(row).join('') + '</tbody></table>'; }

            /* One column down the page, then on to the next page. */
            var FIRST = 40, LATER = 44;            /* rows per page: first page has the heading */
            var body = '<h1>' + esc(state.title) + '</h1><p class="lk-sub">Students in surname order</p>';
            var i = 0, page = 0;
            while (i < list.length) {
                var take = page === 0 ? FIRST : LATER;
                var chunk = list.slice(i, i + take);
                body += '<div class="lk-lpage' + (i + take < list.length ? ' lk-break' : '') + '"><div class="lk-lcol lk-lone">' + table(chunk) + '</div></div>';
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
            var oldAssign = state.assign, oldOut = state.out, oldReserve = state.reserve;
            state.banks = p.banks.map(cleanBank);
            state.assign = {};
            state.out = {};
            state.reserve = {};
            rebuildIndex();
            Object.keys(oldAssign).forEach(function (id) { var l = findLocker(id); if (l) state.assign[l.id] = oldAssign[id]; });
            Object.keys(oldOut).forEach(function (id) { var l = findLocker(id); if (l) state.out[l.id] = true; });
            Object.keys(oldReserve).forEach(function (id) { var l = findLocker(id); if (l) state.reserve[l.id] = oldReserve[id]; });
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

        /* ----- Full width: the tool fills the browser window; remembered in this browser ----- */

        var WIDE_KEY = 'lockersFullWidth';
        function wideRemembered() { try { return localStorage.getItem(WIDE_KEY) === '1'; } catch (e) { return false; } }
        function setWide(on, remember) {
            root.classList.toggle('lk-wide', on);
            document.documentElement.classList.toggle('lk-wide-page', !!document.querySelector('.lockers.lk-wide'));
            Array.prototype.forEach.call(root.querySelectorAll('[data-action="wide"]'), function (b) {
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
                b.innerHTML = icon(on ? 'shrink' : 'expand') + (on ? 'Normal width' : 'Full width');
                b.title = on ? 'Back to the normal page width' : 'Use the whole browser window for the lockers';
            });
            if (remember) {
                try { localStorage.setItem(WIDE_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked */ }
                setStatus(on ? 'Full width: the lockers use the whole window. Press Normal width to go back.' : 'Back to the normal page width.');
            }
        }

        /* ----- Simple / Full controls (see ClassroomControls) ----- */

        function attachControls() {
            var step = window.ClassroomControls.step;
            function b(action, cls, iconName, label, extra) { return btn(action, cls + ' cc-big', iconName, label, extra); }
            var simple =
                step(1, 'Students', '#2563eb',
                    b('paste-roster', 'lk-btn-data', 'paste', 'Paste names', ' title="Paste the class list copied from Excel, Google Sheets or the school system"') +
                    b('import', 'lk-btn-data', 'upload', 'Import file', ' title="Choose an Excel or CSV class list"')) +
                step(2, 'Lockers', '#d97706',
                    b('setup', 'lk-btn-amber', 'locker', 'Set up lockers', ' title="Type the locker numbers, banks and areas"')) +
                step(3, 'Give out lockers', '#7c3aed',
                    b('auto', 'lk-btn-purple', 'az', 'A–Z', ' data-mode="AZ" title="Give free lockers out in surname order. Students who already have a locker keep it."') +
                    b('auto', 'lk-btn-amber', 'random', 'Random', ' data-mode="RANDOM" title="Give free lockers out in random order. Students who already have a locker keep it."')) +
                step(4, 'Print', '#059669',
                    b('print-grid', 'lk-btn-teal', 'print', 'Map') + b('print-list', 'lk-btn-teal', 'list', 'List')) +
                '<span class="cc-spacer"></span><div class="cc-end">' +
                '<label class="cc-find">' + icon('search') +
                '<input type="search" data-cc-find placeholder="Find…" aria-label="Find a student or locker"></label>' +
                b('import-json', 'lk-btn-file', 'folder', 'Open') + b('export-json', 'lk-btn-file', 'download', 'Save') +
                b('undo', 'lk-btn-grey', 'undo', 'Undo') +
                b('wide', 'lk-btn-grey', 'expand', 'Full width', ' aria-pressed="false"') + '</div>';
            var cc = window.ClassroomControls.attach({
                root: root, tool: 'lockers', setting: cfg.controls,
                toolbar: root.querySelector('.lk-toolbar'),
                simple: simple,
                hint: 'Click a locker and type a name, or drag a name onto a locker. Right-click a broken locker to mark it out of service.',
                note: function () {
                    var n = Object.keys(state.reserve || {}).length;
                    return n ? 'Year levels on: ' + n + ' locker' + (n === 1 ? '' : 's') + ' kept for a year' : '';
                }
            });
            /* the Simple Find box drives the Full one */
            var find = cc.bar.querySelector('[data-cc-find]');
            find.addEventListener('input', function () { ui.search.value = find.value; applySearch(); });
            find.addEventListener('keydown', function (e) {
                ui.search.value = find.value;
                ui.search.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: false }));
                if (e.key === 'Escape') find.value = ui.search.value;
            });
            ui.search.addEventListener('input', function () { if (find.value !== ui.search.value) find.value = ui.search.value; });
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
        attachControls();
        setWide(wideRemembered(), false);
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
