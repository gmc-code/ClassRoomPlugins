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
/* ===== ClassroomControls v1: Simple / Full controls for the classroom tools =====
   Shared by seatingplan, lockers, studentgroups and namepicker. The same block is copied into
   each directive's .js so every directive still works on its own; whichever loads first defines
   window.ClassroomControls and the others reuse it. Keep the copies identical.

   Simple: one row of numbered steps with big buttons, for teachers new to the tool.
   Full:   every control (the tool's own toolbar rows).
   A Simple | Full switch sits top right. Each tool remembers its own choice in the browser
   (localStorage 'classroomControls:<tool>'); a first visit starts in Simple. The directive's
   :controls: option can instead fix the view to simple or full and hide the switch.
   Simple only hides controls: rules, locks, year levels … keep working, and a note says when
   one is in use.

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
    if (window.ClassroomControls && window.ClassroomControls.version >= 1) return;

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
        '@media print{.cc-pill,.cc-note,.cc-tip,.cc-simplebar{display:none!important}}' +
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
                '<div class="cc-pill" role="group" aria-label="Controls" title="Simple: the main steps. Full: every control. Remembered on this computer.">' +
                '<button type="button" data-cc-mode="simple">Simple</button><button type="button" data-cc-mode="full">Full</button></div>');
            pill = root.firstElementChild;
            if (!stored && !get(key + ':tip')) {
                noteEl.insertAdjacentHTML('afterend', '<div class="cc-tip" data-cc-tip><span>This is the <b>Simple</b> view with the main steps. ' +
                    'For everything else, choose <b>Full</b> at the top right. Your choice is remembered next time.</span>' +
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

        function apply(m, remember) {
            mode = m === 'full' ? 'full' : 'simple';
            root.classList.toggle('cc-simple', mode === 'simple');
            if (remember && !fixed) { put(key, mode); closeTip(); }
            sync();
            if (o.onMode) o.onMode(mode);
        }

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
        return { mode: function () { return mode; }, sync: sync, bar: bar };
    }

    window.ClassroomControls = { version: 1, attach: attach, step: step };
})();
/* ===== end ClassroomControls ===== */

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
        '.sp-desk.sp-locked{background:repeating-linear-gradient(45deg,#fff,#fff 5px,#ddd 5px,#ddd 10px);border-style:dashed}' +
        '.sp-locked-label{font-size:11px;font-style:italic;color:#444}' +
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

    /* "Hughes 13" -> "H13"; with the year level in front: year "Year 7" (or "Year 7" inside the
       homeroom text, e.g. "Year 7 in Hughes 13") gives "7 H13". Same rules as the lockers tool. */
    function formatHomeroom(hr, year) {
        var str = clean(hr);
        var ym = clean(year).match(/\d{1,2}/), y = ym ? String(+ym[0]) : '';
        var m = str.match(/\b(?:year|yr|y)\s*(\d{1,2})\b/i);
        if (m) {
            if (!y) y = String(+m[1]);
            str = str.replace(m[0], ' ').replace(/^[\s,:\-]*(?:in\b)?[\s,:\-]*/i, '').trim();
        }
        var room = '';
        if (str) {
            var combined = str.match(/^(\d{1,2})\s*([A-Za-z]\w{0,3})$/);   /* already "7H13" / "7 H13" */
            if (combined) { if (!y) y = String(+combined[1]); room = combined[2]; }
            else if (str.length <= 4 && !/\s/.test(str)) room = str;
            else {
                var digits = str.replace(/\D/g, '');
                room = str.charAt(0).toUpperCase() + (digits.length >= 2 ? digits.slice(-2) : digits);
            }
        }
        return [y, room].filter(Boolean).join(' ');
    }

    /* Year-level colours, the same as the lockers tool: [card background, border] */
    var YEAR_COLOURS = {
        7: ['#dbeafe', '#3b82f6'], 8: ['#dcfce7', '#22c55e'], 9: ['#fef3c7', '#f59e0b'],
        10: ['#ede9fe', '#8b5cf6'], 11: ['#fce7f3', '#ec4899'], 12: ['#ccfbf1', '#14b8a6']
    };
    var EXTRA_YEAR_COLOURS = [['#fee2e2', '#ef4444'], ['#e0e7ff', '#6366f1'], ['#ffedd5', '#f97316'], ['#f1f5f9', '#64748b']];
    /* the year at the front of a formatted homeroom ("7 H13" -> 7) */
    function yearOf(student) {
        var m = clean(student && student.homeroom).match(/^(\d{1,2})(?:\s|$)/);
        return m ? +m[1] : 0;
    }
    function yearColour(y) { return y ? (YEAR_COLOURS[y] || EXTRA_YEAR_COLOURS[y % EXTRA_YEAR_COLOURS.length]) : null; }

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

        /* a locked desk takes no student, but can be the empty seat beside one */
        var domains = vars.map(function (v) {
            return desks.filter(function (d) { return (!d.locked || v.owner) && unaryOk(v, d); });
        });
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
                homeroom: formatHomeroom(r['homeroom'] || r['home room'] || r['home group'] || r['homegroup'] || r['form'] ||
                    r['tg'] || r['tutor group'] || r['tutorgroup'] || r['house'],
                    r['year'] || r['year level'] || r['yr'] || r['yr level'] || r['year group'] || r['grade'])
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
            locks: {},      /* locked desk numbers, kept per layout: { layoutKey: [3, 7] } */
            display: {}
        };
        var lockMode = false;   /* "Lock Seats" on: clicking a desk locks or unlocks it */
        var DISPLAY_TOGGLES = {
            surnameInitial: 'toggle-surname-initial',
            homeroom: 'toggle-homeroom',
            ignoreRules: 'toggle-ignore-rules',
            oneLine: 'toggle-oneline',
            hideBadges: 'toggle-hide-badges',
            limitWidth: 'toggle-limit-width',
            teacherView: 'toggle-teacher-view',
            rowControls: 'toggle-row-controls',
            yearColours: 'toggle-year-colours'
        };
        var draggingId = null;
        var ui = {};
        var modal = null;
        var mui = {};

        /* ----- data ----- */

        function configTables() {
            return (cfg.tables && parseTables(tablesKey(cfg.tables))) || parseTables(DEFAULT_TABLES);
        }

        /* ----- locked desks -----
           Locks belong to a layout, so each layout remembers its own locked desks and
           switching layouts back and forth keeps them. */
        function layoutKey(mode, layout, tables) {
            if (mode === 'tables') return 't:' + tablesKey(tables);
            var rows = parseLayout((layout || []).join(',')) || layout || [];
            return 'r:' + rows.join(',');
        }
        function currentLayoutKey() { return layoutKey(state.mode, state.layout, state.tables); }
        function lockedNums() { return state.locks[currentLayoutKey()] || []; }
        function deskNum(d) { return +d.querySelector('.sp-desk-num').textContent; }
        function isLocked(d) { return d.classList.contains('sp-locked'); }

        function cleanLocks(obj) {
            var out = {};
            if (!obj || typeof obj !== 'object') return out;
            Object.keys(obj).forEach(function (k) {
                if (!Array.isArray(obj[k])) return;
                var nums = obj[k].map(Number).filter(function (n) { return n >= 1 && n === Math.floor(n); });
                if (nums.length) out[k] = nums;
            });
            return out;
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
                rowControls: d.rowControls !== false,
                yearColours: d.yearColours !== false
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
                    homeroom: formatHomeroom(s.homeroom, s.year)
                };
            });
            state.locks = {};
            if (Array.isArray(cfg.locked) && cfg.locked.length) {
                state.locks[layoutKey(cfg.mode === 'tables' ? 'tables' : 'rows', cfg.layout, configTables())] = cfg.locked.slice();
            }
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

        function savePayload() {
            var currentTitle = ui.title ? ui.title.textContent.trim() : state.title;
            return {
                title: currentTitle, students: state.students, rules: state.rules, display: state.display,
                layout: state.layout, mode: state.mode, tables: state.tables,
                sortMode: state.sortMode, fillFromLast: state.fillFromLast, locks: state.locks,
                placement: ui.grid ? currentPlacement() : (savedPlacement || [])
            };
        }

        function save() {
            var snap = JSON.stringify(savePayload());
            noteForUndo(snap);
            try { localStorage.setItem(storageKey, snap); } catch (e) { /* storage blocked */ }
        }

        /* ----- Undo: every saved change (seats, layout, rules, imports, title …) can be taken back.
           Saves made while one click is being handled count as one step. ----- */
        var UNDO_MAX = 40;
        var undoStack = [], lastSnap = null, undoBusy = false, undoTick = false;

        function noteForUndo(snap) {
            if (!undoBusy && persistReady && lastSnap !== null && snap !== lastSnap && !undoTick) {
                undoStack.push(lastSnap);
                if (undoStack.length > UNDO_MAX) undoStack.shift();
                undoTick = true;
                setTimeout(function () { undoTick = false; }, 0);
            }
            lastSnap = snap;
            updateUndoButton();
        }

        function updateUndoButton() {
            if (!ui.undo) return;
            ui.undo.disabled = !undoStack.length;
            ui.undo.title = undoStack.length ? 'Undo the last change' : 'Nothing to undo yet';
        }

        function undo() {
            if (!undoStack.length) return;
            var d;
            try { d = JSON.parse(undoStack.pop()); } catch (e) { updateUndoButton(); return; }
            undoBusy = true;
            try {
                if (d.title) { state.title = d.title; if (ui.title) ui.title.textContent = d.title; }
                state.students = Array.isArray(d.students) ? d.students : [];
                state.rules = Array.isArray(d.rules) ? d.rules : [];
                if (Array.isArray(d.layout)) state.layout = d.layout;
                if (Array.isArray(d.tables)) state.tables = d.tables;
                state.mode = d.mode === 'tables' ? 'tables' : 'rows';
                if (typeof d.sortMode === 'string') state.sortMode = d.sortMode;
                state.fillFromLast = !!d.fillFromLast;
                state.locks = d.locks ? cleanLocks(d.locks) : {};
                if (d.display) Object.keys(state.display).forEach(function (k) {
                    if (typeof d.display[k] === 'boolean') state.display[k] = d.display[k];
                });
                syncDisplayControls();
                showLayoutInBox();
                updateToolbar();
                if (!placeStudents(d.placement)) autoArrange(state.sortMode);
                if (modal && modal.classList.contains('sp-open')) renderPanel();
                save();
            } finally { undoBusy = false; }
            lastSnap = JSON.stringify(savePayload());
            updateUndoButton();
            setStatus('Undone.' + (undoStack.length ? '' : ' Nothing more to undo.'));
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
                    if (d.locks) state.locks = cleanLocks(d.locks);
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
                '<button type="button" class="sp-btn sp-btn-data" data-action="import" title="Import a class list (replaces the current students)">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>' +
                'Import</button>' +
                '<button type="button" class="sp-btn sp-btn-data" data-action="import-add" ' +
                'title="Add students from a class list without removing anyone">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>' +
                'Add</button>' +
                '<button type="button" class="sp-btn sp-btn-data" data-action="paste-roster" ' +
                'title="Paste a class list copied from Excel, Google Sheets or a school system (replace the class or add to it)">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>' +
                'Paste</button>' +
                '<input type="file" class="sp-file" accept=".xlsx,.xls,.csv" data-role="file">' +

                '<button type="button" class="sp-btn sp-btn-file" data-action="import-json" title="Open a plan saved as a JSON file">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L8.6 3.3A2 2 0 0 0 6.9 2.5H4a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2z"/><path d="M12 10v6"/><path d="m9 13 3-3 3 3"/></svg>' +
                'Open</button>' +
                '<input type="file" class="sp-file" accept=".json" data-role="json-file">' +

                '<button type="button" class="sp-btn sp-btn-file" data-action="export-json" title="Save the whole plan as a JSON file">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>' +
                'Save</button>' +

                '<span class="sp-tsep"></span>' +

                '<button type="button" class="sp-btn sp-btn-teal" data-action="print">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>' +
                'Print</button>' +

                '<button type="button" class="sp-btn sp-btn-teal" data-action="png" data-role="png" ' +
                'title="Save the printable plan as a picture (PNG)">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>' +
                'PNG</button>' +

                '<button type="button" class="sp-btn sp-btn-teal" data-action="projector" title="Projector View: the plan full screen in large text">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>' +
                'Projector</button>' +

                '<span class="sp-tsep"></span>' +

                '<button type="button" class="sp-btn sp-btn-grey" data-action="undo" data-role="undo" disabled title="Nothing to undo yet">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>' +
                'Undo</button>' +
                '<button type="button" class="sp-btn sp-btn-grey" data-action="reset">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>' +
                'Reset</button>' +

                '<button type="button" class="sp-btn sp-btn-grey" data-action="revert" data-role="revert" disabled ' +
                'title="Nothing imported yet">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>' +
                'Revert</button>' +
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

                '<button type="button" class="sp-btn sp-btn-purple" data-action="sort" data-mode="HOMEROOM" title="Sort by TG (homeroom), then surname">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M4 6h16M4 12h16M4 18h7"/></svg>' +
                'TG</button>' +

                '<button type="button" class="sp-btn sp-btn-amber" data-action="sort" data-mode="RANDOM">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l6.1 8.6c.7 1.1 2 1.7 3.3 1.7H22"/><path d="m18 14 4 4-4 4"/></svg>' +
                'Random</button>' +

                '<button type="button" class="sp-btn sp-btn-purple" data-action="reverse">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>' +
                'Reverse</button>' +

                '<button type="button" class="sp-btn sp-btn-purple" data-action="fill" data-role="fill"></button>' +

                '<button type="button" class="sp-btn sp-btn-amber" data-action="rules">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><line x1="4" x2="20" y1="21" y2="21"/><line x1="4" x2="8" y1="14" y2="14"/><line x1="12" x2="20" y1="14" y2="14"/><line x1="16" x2="20" y1="7" y2="7"/><line x1="4" x2="12" y1="7" y2="7"/><circle cx="10" cy="14" r="2"/><circle cx="14" cy="7" r="2"/></svg>' +
                'Rules</button>' +
                '<button type="button" class="sp-btn sp-btn-brown" data-action="lock-seats" data-role="lock-seats" aria-pressed="false" ' +
                'title="Lock desks that are out of use (or right-click a desk)">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sp-btn-icon"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
                '<span>Lock</span></button>' +
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
                '<label class="sp-checkbox-label" title="Colour each desk by the student\'s year level (rule colours come first)">' +
                '<input type="checkbox" data-role="toggle-year-colours" class="sp-checkbox" checked>' +
                'Year Colours' +
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

            ['title', 'undo', 'revert', 'lock-seats', 'layouts', 'custom-layout', 'fill', 'file', 'json-file', 'toggle-surname-initial', 'toggle-homeroom', 'toggle-ignore-rules', 'toggle-oneline', 'toggle-hide-badges', 'toggle-limit-width', 'toggle-teacher-view', 'toggle-row-controls', 'toggle-year-colours', 'png', 'status', 'count', 'pool', 'grid'].forEach(function (r) {
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
                if (e.key === 'Escape' && lockMode) setLockMode(false);
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
            /* the Year Colours box only matters when students have a year level */
            if (ui['toggle-year-colours']) {
                ui['toggle-year-colours'].parentNode.style.display =
                    state.students.some(function (st) { return yearOf(st); }) ? '' : 'none';
            }
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
            ui.fill.textContent = state.fillFromLast ? 'Fill: Back' : 'Fill: Front';
            ui.fill.title = state.fillFromLast
                ? 'Filling from the last desk (back). Click to fill from desk 1 (front).'
                : 'Filling from desk 1 (front). Click to fill from the last desk (back).';
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
                case 'lock-seats': setLockMode(!lockMode); break;
                case 'import': rosterMode = 'replace'; ui.file.click(); break;
                case 'import-add': rosterMode = 'add'; ui.file.click(); break;
                case 'paste-roster': openPasteRoster(); break;
                case 'export-json': exportJson(); break;
                case 'import-json': ui['json-file'].click(); break;
                case 'sort': autoArrange(t.getAttribute('data-mode')); break;
                case 'reverse': reverseSeating(); break;
                case 'clear': clearSeats(); break;
                case 'reset': resetToPage(); break;
                case 'undo': undo(); break;
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
            /* no rule colour: colour the card by year level, like the lockers tool */
            card.classList.remove('sp-yr');
            var yc = state.display.yearColours !== false && yearColour(yearOf(student));
            if (yc && !/\bsp-has-(sep|pair|pos|grp)\b/.test(card.className)) {
                card.classList.add('sp-yr');
                card.style.setProperty('--sp-yr-bg', yc[0]);
                card.style.setProperty('--sp-yr-bd', yc[1]);
            }

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
            /* right-click (or click with Lock Seats on) locks or unlocks the desk */
            desk.addEventListener('contextmenu', function (e) { e.preventDefault(); toggleLock(desk); });
            desk.addEventListener('click', function (e) {
                if (!lockMode) return;
                e.preventDefault();
                e.stopPropagation();
                toggleLock(desk);
            }, true);
            return desk;
        }

        /* Shade the desks locked in the current layout. */
        function markLocks() {
            var nums = {};
            lockedNums().forEach(function (n) { nums[n] = true; });
            getDesks().forEach(function (d) {
                var on = !!nums[deskNum(d)];
                d.classList.toggle('sp-locked', on);
                d.title = on ? 'Locked: right-click to unlock' : '';
                var label = d.querySelector('.sp-locked-label');
                if (on && !label) d.appendChild(make('span', 'sp-locked-label', '🔒 Locked'));
                if (!on && label) label.remove();
            });
        }

        function toggleLock(desk) {
            var n = deskNum(desk), key = currentLayoutKey();
            var nums = lockedNums().slice();
            if (isLocked(desk)) {
                nums = nums.filter(function (x) { return x !== n; });
                setStatus('Desk ' + n + ' unlocked.');
            } else {
                nums.push(n);
                nums.sort(function (a, b) { return a - b; });
                var card = desk.querySelector('.sp-card'), moved = '';
                if (card) {
                    var s = studentById(card.dataset.sid);
                    if (s) { renderCard(card, s, false); moved = ' ' + s.fullName + ' moved to Unassigned.'; }
                    ui.pool.appendChild(card);
                    desk.classList.remove('sp-occupied');
                }
                setStatus('Desk ' + n + ' locked: no one will be seated there.' + moved);
            }
            if (nums.length) state.locks[key] = nums; else delete state.locks[key];
            markLocks();
            validate();
            updateCount();
            save();
        }

        function setLockMode(on) {
            lockMode = on;
            root.classList.toggle('sp-lock-mode', on);
            if (ui['lock-seats']) {
                ui['lock-seats'].classList.toggle('sp-active', on);
                ui['lock-seats'].setAttribute('aria-pressed', on ? 'true' : 'false');
                ui['lock-seats'].lastChild.textContent = on ? 'Done' : 'Lock';
            }
            setStatus(on ? 'Click desks to lock or unlock them. Locked desks are left empty when students are arranged. ' +
                           'Press Done (or Esc) when finished.' : '');
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
            markLocks();
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
            markLocks();
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
            return Array.prototype.slice.call(ui.grid.querySelectorAll('.sp-desk[data-row="' + r + '"]:not(.sp-locked)'));
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
                index: i, row: +ds.row, col: +ds.col, locked: isLocked(d), seg: +ds.seg || 0, blk: +ds.blk || 0,
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
            if (isLocked(target)) {
                draggingId = null;
                setStatus('Desk ' + deskNum(target) + ' is locked. Right-click it to unlock it first.');
                return;
            }
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
                '(locked desks and seats kept empty by rules use up desks too). Choose a larger layout, unlock a desk or remove an empty-seat rule.';
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
                while (next < capacity && (seatedByDesk[next] || reservedDesks[next] || isLocked(desks[next]))) next++;
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
            if (!window.confirm('Reset this plan to the roster and rules written on the page? Your imported roster and rules will be removed. (Undo brings them back.)')) return;
            var before = lastSnap;
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
            if (before) { undoStack.push(before); if (undoStack.length > UNDO_MAX) undoStack.shift(); }
            lastSnap = JSON.stringify(savePayload());
            updateUndoButton();
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
                locks: state.locks,
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
            if (data.locks) state.locks = cleanLocks(data.locks);   /* older files: keep the current locks */
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
                    if (d && !isLocked(d) && !d.querySelector('.sp-card')) {
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

        var rosterMode = 'replace';   /* Import Roster replaces the class; Add Students adds to it */

        function nameKey(s) { return (clean(s.firstName) + ' ' + clean(s.surname)).toLowerCase().replace(/\s+/g, ' '); }

        /* Add Students: new students go to Unassigned; everyone already seated stays put and
           rules are kept. A student already on the list (same first name and surname, capitals
           don't matter) is not added twice; their homeroom is updated from the file instead. */
        function addRows(rows) {
            var incoming = rowsToStudents(rows);
            if (!incoming.length) {
                setStatus('No students found in that file. It needs a header row with Preferred (or First Name), Surname (or Last Name) and optionally Homeroom or TG.');
                return;
            }
            var byName = {};
            state.students.forEach(function (s) { byName[nameKey(s)] = s; });
            var nextId = 0;
            state.students.forEach(function (s) {
                var m = /^student-(\d+)$/.exec(s.id);
                if (m) nextId = Math.max(nextId, +m[1] + 1);
            });
            var added = [], updated = 0;
            incoming.forEach(function (s) {
                var key = nameKey(s), old = byName[key];
                if (old) {
                    if (s.homeroom && s.homeroom !== old.homeroom) { old.homeroom = s.homeroom; updated++; }
                    return;
                }
                while (studentById('student-' + nextId)) nextId++;
                s.id = 'student-' + nextId++;
                state.students.push(s);
                byName[key] = s;
                added.push(s);
            });
            added.forEach(function (s) { ui.pool.appendChild(createCard(s, false)); });
            refreshCards();
            validate();
            updateCount();
            save();
            var msg = added.length
                ? 'Added ' + added.length + (added.length === 1 ? ' student' : ' students') + ' to Unassigned. ' +
                  'Drag them to desks, or sort to re-seat everyone.'
                : 'No new students: everyone in that file is already on the list.';
            if (updated) msg += ' Updated the homeroom of ' + updated + (updated === 1 ? ' student.' : ' students.');
            setStatus(msg);
        }

        /* Paste: a class list copied from a spreadsheet, with or without headings (see ClassroomPaste).
           Replace swaps in the new class; Add puts new students in Unassigned, like Add. */
        function openPasteRoster() {
            var actions = [{ value: 'replace', label: state.students.length ? 'Replace the class' : 'Use this class list', primary: true }];
            if (state.students.length) actions.unshift({ value: 'add', label: 'Add to the class', title: 'Keep everyone already here and add these students to Unassigned' });
            window.ClassroomPaste.open({
                title: 'Paste a class list',
                actions: actions,
                onApply: function (rows, action) {
                    var before = state.students;
                    rosterMode = action === 'add' ? 'add' : 'replace';
                    applyRows(rows, '', true);
                    rosterMode = 'replace';
                    return action === 'add' || state.students !== before;
                }
            });
        }

        function applyRows(rows, fileName, pasted) {
            if (rosterMode === 'add' && state.students.length) { addRows(rows); return; }
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
            var newTitle = pasted ? '' : titleFromFileName(fileName);
            if (newTitle) {
                state.title = newTitle;
                if (ui.title) ui.title.textContent = newTitle;
            }
            save();
            autoArrange(state.sortMode);
            /* Revert puts the class back in the file's own order */
            storeImportSnapshot('roster', pasted ? 'the pasted class list' : fileName, {
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

        /* Save PNG: the printable plan as a picture, e.g. to paste into an email or slide.
           Chrome/Edge: the Save As box opens straight away (it must open while the click is
           still fresh), then the picture is made and written to the chosen file.
           Other browsers: ask for a file name, then download as usual. */
        function savePng() {
            var sec = printSection();
            var suggested = fileSlug(sec.title, 'seating_plan') + '.png';

            if (window.showSaveFilePicker) {
                var picking;
                try {
                    picking = window.showSaveFilePicker({
                        suggestedName: suggested,
                        types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }]
                    });
                } catch (e) { picking = Promise.reject(e); }
                picking.then(function (handle) {
                    makePng(sec, function (blob) {
                        return handle.createWritable().then(function (w) {
                            return w.write(blob).then(function () { return w.close(); });
                        }).then(function () { return handle.name; });
                    });
                }, function (err) {
                    if (err && err.name === 'AbortError') return;   /* Cancel pressed */
                    /* Save As box not allowed here (e.g. page inside a frame): download instead */
                    makePng(sec, function (blob) {
                        downloadBlob(blob, suggested);
                        return suggested + ' to your Downloads folder';
                    });
                });
                return;
            }

            var name = window.prompt('File name for the picture:', suggested);
            if (name == null) return;                                /* Cancel pressed */
            name = name.trim().replace(/[\\/:*?"<>|]+/g, '_') || suggested;
            if (!/\.png$/i.test(name)) name += '.png';
            makePng(sec, function (blob) {
                downloadBlob(blob, name);
                return name + ' to your Downloads folder';
            });
        }

        /* Make the picture, hand it to write(blob) (which returns what to report), show progress. */
        function makePng(sec, write) {
            var btn = ui.png;
            btn.disabled = true;
            setStatus('Making the picture…');
            sectionsToPng([sec]).then(write).then(function (where) {
                setStatus('Saved ' + where + '.');
            }).catch(function (err) {
                setStatus('Could not save the picture: ' + (err && err.message ? err.message : err));
            }).then(function () { btn.disabled = false; });
        }

        /* ----- rules panel -----
           Every student is listed with a button for each rule. One-student rules
           (front/back/left/right/empty) switch on and off with a click; the 🔗 / ⚠️ buttons
           open a tick list to choose who is in a keep-together / keep-apart group.
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
        var panel = { kind: 'PAIR', search: '', editing: null, picked: {}, msg: '' };

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

        function buildModal() {
            modal = make('div', 'sp-modal');
            noTranslate(modal);
            modal.innerHTML =
                '<div class="sp-modal-card sp-rp" role="dialog" aria-modal="true" aria-label="Seating rules">' +
                '<div class="sp-modal-head"><span>Seating Rules</span>' +
                '<button type="button" class="sp-modal-close" data-m="close" aria-label="Close">✕</button></div>' +
                '<div class="sp-rp-top" data-m="top"></div>' +
                '<div class="sp-modal-body" data-m="body"></div>' +
                '<div class="sp-rp-foot" data-m="foot"></div>' +
                '</div>';
            document.body.appendChild(modal);
            ['top', 'body', 'foot'].forEach(function (k) { mui[k] = modal.querySelector('[data-m="' + k + '"]'); });

            modal.addEventListener('click', onPanelClick);
            modal.addEventListener('change', onPanelChange);
            modal.addEventListener('input', function (e) {
                if (e.target.getAttribute('data-m') !== 'search') return;
                panel.search = e.target.value;
                filterList();
            });
            document.addEventListener('keydown', function (e) {
                if (e.key !== 'Escape' || !modal.classList.contains('sp-open')) return;
                if (panel.editing) { panel.editing = null; renderPanel(); } else closeModal();
            });
        }

        function openModal() {
            panel.editing = null;
            panel.search = '';
            panel.msg = '';
            renderPanel();
            modal.classList.add('sp-open');
        }

        function closeModal() { if (modal) modal.classList.remove('sp-open'); }

        /* "Ticked students must sit in the front row." -> "Must sit in the front row." for a button's tooltip */
        function buttonTip(kind, on) {
            var help = helpFor(kind).replace(/^Ticked students (must )?/, function (m, must) { return must ? 'Must ' : ''; });
            help = help.charAt(0).toUpperCase() + help.slice(1);
            return kind.label + (on ? ' (on): click to turn off. ' : ': click to turn on. ') + help;
        }

        function renderPanel() {
            mui.body.innerHTML = '';
            mui.foot.innerHTML = '';
            if (!state.students.length) {
                mui.top.innerHTML = '';
                mui.body.appendChild(make('div', 'sp-rp-empty', 'Import a class list first, then add rules here.'));
                mui.foot.innerHTML = '<span></span><button type="button" class="sp-btn" data-m="close">Done</button>';
                return;
            }
            if (panel.editing) { renderGroupEditor(kindInfo(panel.kind), groupsFor(panel.kind)); return; }
            renderMain();
        }

        /* --- main view: every student with a button for each rule --- */

        function legendHtml() {
            return '<div class="sp-rp-topline"><div class="sp-rp-legend">' + RULE_KINDS.map(function (k) {
                return '<span title="' + esc(helpFor(k)) + '"><b>' + k.icon + '</b> ' + esc(k.label) + '</span>';
            }).join('') + '</div>' +
            '<input type="search" class="sp-rp-search" data-m="search" placeholder="Search students" aria-label="Search students" value="' + esc(panel.search) + '">' +
            '</div>' +
            '<div class="sp-rp-help">Click a button to switch that rule on or off for the student. ' +
            '🔗 and ⚠️ open a list to choose who is in the group. Hover over a button for details.</div>';
        }

        function ruleButton(s, kind) {
            var on = hasSingle(s.id, kind.type);
            var b = make('button', 'sp-rp-rb' + (on ? ' sp-on sp-rb-' + kind.type.toLowerCase() : ''), kind.icon);
            b.type = 'button';
            b.setAttribute('data-m', 'rule');
            b.setAttribute('data-sid', s.id);
            b.setAttribute('data-type', kind.type);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.setAttribute('aria-label', kind.label + ' for ' + s.fullName);
            b.title = buttonTip(kind, on);
            return b;
        }

        function groupButton(s, type, g, i) {
            var kind = kindInfo(type), sep = type === 'SEPARATE';
            var b = make('button', 'sp-rp-gb' + (g ? ' sp-on' : ''), kind.icon + (g ? ' ' + (i + 1) : ' +'));
            b.type = 'button';
            b.setAttribute('data-m', 'grp');
            b.setAttribute('data-type', type);
            b.setAttribute('data-sid', s.id);
            if (g) {
                var c = groupColour(i, sep);
                b.style.setProperty('--sp-grp-fg', c.fg);
                b.style.setProperty('--sp-grp-bg', c.bg);
                b.setAttribute('data-key', g.key);
                var others = g.ids.filter(function (id) { return id !== s.id; }).map(nameOf);
                b.title = kind.label + ' group ' + (i + 1) + ': with ' + others.join(', ') + '. Click to change the group.';
            } else {
                b.title = (sep ? 'Start a new keep-apart group with ' : 'Keep ') + s.firstName +
                          (sep ? '' : ' together with others') + '. ' + helpFor(kind);
            }
            return b;
        }

        function renderMain() {
            mui.top.innerHTML = legendHtml();
            mui.body.innerHTML = '';
            var pairGroups = groupsFor('PAIR'), sepGroups = groupsFor('SEPARATE');
            var list = make('div', 'sp-rp-list sp-rp-main');
            list.setAttribute('data-m', 'list');
            sortedStudents().forEach(function (s) {
                var row = make('div', 'sp-rp-row sp-rp-srow');
                row.dataset.name = (s.fullName + ' ' + (s.homeroom || '')).toLowerCase();
                var who = make('span', 'sp-rp-who');
                who.appendChild(make('span', 'sp-rp-name', s.firstName + ' ' + s.surname));
                if (s.homeroom) who.appendChild(make('span', 'sp-rp-hr', s.homeroom));
                row.appendChild(who);
                var btns = make('span', 'sp-rp-btns');
                RULE_KINDS.forEach(function (k) { if (!k.group) btns.appendChild(ruleButton(s, k)); });
                var pg = null, pi = -1;
                pairGroups.forEach(function (g, i) { if (g.ids.indexOf(s.id) !== -1) { pg = g; pi = i; } });
                btns.appendChild(groupButton(s, 'PAIR', pg, pi));
                sepGroups.forEach(function (g, i) { if (g.ids.indexOf(s.id) !== -1) btns.appendChild(groupButton(s, 'SEPARATE', g, i)); });
                btns.appendChild(groupButton(s, 'SEPARATE', null, -1));
                row.appendChild(btns);
                list.appendChild(row);
            });
            mui.body.appendChild(list);
            filterList();
            var singles = state.rules.filter(function (r) { return !r.student2Id && studentById(r.student1Id); }).length;
            var summary = singles + (singles === 1 ? ' rule' : ' rules') + ' · ' +
                pairGroups.length + ' keep-together · ' + sepGroups.length + ' keep-apart ' +
                (sepGroups.length === 1 ? 'group' : 'groups');
            mui.foot.innerHTML =
                '<span class="sp-rp-count">' + (panel.msg ? '<span class="sp-rp-msg">' + esc(panel.msg) + '</span>' : esc(summary)) + '</span>' +
                '<span><button type="button" class="sp-btn sp-btn-grey" data-m="clear-all"' + (state.rules.length ? '' : ' disabled') + '>Clear all rules</button> ' +
                '<button type="button" class="sp-btn" data-m="close">Done</button></span>';
            panel.msg = '';
        }

        /* Switch a one-student rule on or off. Front/Back and Left/Right switch each other off. */
        function toggleRule(id, type) {
            var s = studentById(id);
            if (!s) return;
            if (hasSingle(id, type)) {
                state.rules = state.rules.filter(function (r) { return !(r.type === type && r.student1Id === id); });
                afterRuleChange();
                return;
            }
            var opp = OPPOSITE[type];
            if (type === 'FRONT_ROW' || type === 'BACK_ROW') {
                var partner = togetherWith(id).filter(function (x) { return hasSingle(x, opp); })[0];
                if (partner) {
                    panel.msg = s.firstName + ' is kept together with ' + studentById(partner).firstName + ', who is in the ' +
                        kindInfo(opp).label.toLowerCase() + ', so ' + s.firstName + ' cannot be in the ' + kindInfo(type).label.toLowerCase() + '.';
                    renderPanel();
                    return;
                }
            }
            state.rules = state.rules.filter(function (r) { return !(opp && r.type === opp && r.student1Id === id); });
            state.rules.push(newRule(id, null, type));
            afterRuleChange();
        }

        /* --- keep together / keep apart: tick who is in a group --- */

        function renderGroupEditor(kind, groups) {
            var editing = panel.editing;
            var own = editing.key ? groups.filter(function (g) { return g.key === editing.key; })[0] : null;
            var ownIdx = own ? groups.indexOf(own) : -1;
            var ownIds = own ? own.ids : [];
            var pickedIds = Object.keys(panel.picked).filter(function (id) { return panel.picked[id]; });
            var max = maxFor(kind);
            var full = max && pickedIds.length >= max;

            mui.top.innerHTML = '<div class="sp-rp-edit-title">' + kind.icon + ' ' + esc(kind.label) + ' — ' +
                (own ? 'group ' + (ownIdx + 1) : 'new group') + '</div>' +
                '<div class="sp-rp-help">' + esc(helpFor(kind)) + ' Tick ' +
                (max ? '2 to ' + max + ' students' : '2 or more students') + '.</div>';
            mui.body.innerHTML = '<div class="sp-rp-tools">' +
                '<input type="search" class="sp-rp-search" data-m="search" placeholder="Search students" aria-label="Search students" value="' + esc(panel.search) + '">' +
                '</div>';
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
                '<span>' + (own ? '<button type="button" class="sp-btn sp-btn-red" data-m="delete-group">Delete group</button> ' : '') +
                '<button type="button" class="sp-btn sp-btn-grey" data-m="cancel-group">Cancel</button> ' +
                '<button type="button" class="sp-btn" data-m="save-group"' + (n >= 2 ? '' : ' disabled') + '>Save group</button></span>';
        }

        function startGroupEdit(type, key, seedId) {
            panel.kind = type;
            panel.picked = {};
            panel.search = '';
            if (key) {
                var g = groupsFor(type).filter(function (x) { return x.key === key; })[0];
                if (!g) return;
                g.ids.forEach(function (id) { panel.picked[id] = true; });
                panel.editing = { key: key, ruleIds: g.ruleIds };
            } else {
                if (seedId) panel.picked[seedId] = true;
                panel.editing = { key: null, ruleIds: [] };
            }
            renderPanel();
        }

        /* Replace the group's rules in place, so it keeps its number (and colour). */
        function saveGroup() {
            var type = panel.kind;
            var ids = sortedStudents().map(function (s) { return s.id; }).filter(function (id) { return panel.picked[id]; });
            if (ids.length < 2) return;
            var drop = {};
            panel.editing.ruleIds.forEach(function (id) { drop[id] = true; });
            var at = -1;
            state.rules.forEach(function (r, i) { if (at === -1 && drop[r.id]) at = i; });
            state.rules = state.rules.filter(function (r) { return !drop[r.id]; });
            if (at === -1 || at > state.rules.length) at = state.rules.length;
            var groupId = 'g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
            var added = [];
            function add(a, b) {
                if (linked(a, b, type)) return;      // already covered by another group
                var r = newRule(a, b, type);
                r.group = groupId;
                added.push(r);
            }
            if (type === 'PAIR') {
                for (var i = 1; i < ids.length; i++) add(ids[i - 1], ids[i]);   // a line: A-B, B-C
            } else {
                for (var a = 0; a < ids.length; a++) for (var b = a + 1; b < ids.length; b++) add(ids[a], ids[b]);
            }
            Array.prototype.splice.apply(state.rules, [at, 0].concat(added));
            panel.editing = null;
            afterRuleChange();
        }

        function deleteGroup() {
            var drop = {};
            panel.editing.ruleIds.forEach(function (id) { drop[id] = true; });
            state.rules = state.rules.filter(function (r) { return !drop[r.id]; });
            panel.editing = null;
            afterRuleChange();
        }

        /* --- shared --- */

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

        function filterList() {
            var list = mui.body.querySelector('[data-m="list"]');
            if (!list) return;
            var q = panel.search.trim().toLowerCase();
            Array.prototype.forEach.call(list.children, function (row) {
                row.style.display = q && row.dataset.name.indexOf(q) === -1 ? 'none' : '';
            });
        }

        function onPanelClick(e) {
            if (e.target === modal) { closeModal(); return; }
            var btn = e.target.closest('[data-m]');
            if (!btn || btn.tagName === 'INPUT') return;
            switch (btn.getAttribute('data-m')) {
                case 'close': closeModal(); break;
                case 'rule': toggleRule(btn.getAttribute('data-sid'), btn.getAttribute('data-type')); break;
                case 'grp': startGroupEdit(btn.getAttribute('data-type'), btn.getAttribute('data-key'), btn.getAttribute('data-sid')); break;
                case 'clear-all':
                    if (!window.confirm('Remove every seating rule for this class?')) return;
                    state.rules = [];
                    afterRuleChange();
                    break;
                case 'delete-group': deleteGroup(); break;
                case 'cancel-group': panel.editing = null; renderPanel(); break;
                case 'save-group': saveGroup(); break;
            }
        }

        function onPanelChange(e) {
            var t = e.target;
            var list = t.closest('[data-m="list"]');
            if (!list || t.type !== 'checkbox' || !list.hasAttribute('data-group')) return;
            panel.picked[t.value] = t.checked;
            renderPanel();
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

        /* ----- Simple / Full controls (see ClassroomControls) ----- */

        function attachControls() {
            var step = window.ClassroomControls.step;
            function b(action, cls, label, extra) {
                return '<button type="button" class="sp-btn ' + cls + ' cc-big" data-action="' + action + '"' + (extra || '') + '>' + label + '</button>';
            }
            var simple =
                step(1, 'Your class', '#2563eb',
                    b('paste-roster', 'sp-btn-data', 'Paste names', ' title="Paste the class list copied from Excel, Google Sheets or the school system"') +
                    b('import', 'sp-btn-data', 'Import file', ' title="Choose an Excel or CSV class list"')) +
                step(2, 'Room', '#0d9488',
                    '<div class="sp-mode" role="group" aria-label="Room type">' +
                    b('mode', 'sp-btn-mode', 'Rows', ' data-mode="rows"') + b('mode', 'sp-btn-mode', 'Tables', ' data-mode="tables"') + '</div>' +
                    '<select class="cc-select" data-cc="room" aria-label="Room layout" title="How the desks are laid out"></select>') +
                step(3, 'Seat everyone', '#7c3aed',
                    b('sort', 'sp-btn-purple', 'A → Z', ' data-mode="AZ"') + b('sort', 'sp-btn-amber', 'Random', ' data-mode="RANDOM"')) +
                step(4, 'Show it', '#059669',
                    b('print', 'sp-btn-teal', 'Print') + b('projector', 'sp-btn-teal', 'Projector')) +
                '<span class="cc-spacer"></span><div class="cc-end">' +
                b('import-json', 'sp-btn-file', 'Open', ' title="Open a plan saved as a file"') +
                b('export-json', 'sp-btn-file', 'Save', ' title="Save the whole plan as a file"') +
                b('undo', 'sp-btn-grey', 'Undo') + '</div>';
            window.ClassroomControls.attach({
                root: root, tool: 'seatingplan', setting: cfg.controls,
                toolbar: root.querySelector('.sp-toolbar'),
                simple: simple,
                hint: 'Drag a name onto a desk to move or swap students. Right-click a desk to lock it.',
                note: function () {
                    var n = state.display.ignoreRules ? 0 : state.rules.length;
                    return n ? n + (n === 1 ? ' rule still applies' : ' rules still apply') : '';
                },
                proxies: [{ sel: '[data-cc="room"]', active: 'sp-active', none: 'Custom layout',
                    buttons: function () { return ui.layouts.querySelectorAll('[data-action="layout"]'); } }]
            });
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
        lastSnap = JSON.stringify(savePayload());
        updateUndoButton();
        attachControls();
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