(function () {
    'use strict';

    var SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    var MIN_SIZE = 2, MAX_SIZE = 10;
    var SORT_MODES = ['DEFAULT', 'AZ', 'ZA', 'HOMEROOM', 'RANDOM'];
    var FILE_APP = 'studentgroups', FILE_VERSION = 2;
    var MAX_JSON_BYTES = 2 * 1024 * 1024;
    /* Colours for numbered keep-together / keep-apart groups (cards, badges and the Rules
       panel), the same set the seating plan uses. */
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
    /* "3,3,3,4,4,5,6" or "3x4, 5" (3 groups of 4, then a group of 5) -> [sizes], or null if not valid. */
    var MAX_GROUPS = 40;
    function parseSizes(text) {
        var parts = String(text == null ? '' : text).toLowerCase().replace(/\u00d7/g, 'x')
            .split(/[,;\s]+/).filter(Boolean);
        var out = [];
        for (var i = 0; i < parts.length; i++) {
            var m = /^(?:(\d+)x)?(\d+)$/.exec(parts[i]);
            if (!m) return null;
            var times = m[1] ? parseInt(m[1], 10) : 1, size = parseInt(m[2], 10);
            if (size < 1 || size > MAX_SIZE || times < 1) return null;
            for (var t = 0; t < times; t++) out.push(size);
            if (out.length > MAX_GROUPS) return null;
        }
        return out.length ? out : null;
    }

    /* keep-apart groups start part-way along the list, so 🔗 1 and ⚠️ 1 differ */
    function groupColour(i, apart) { return GROUP_COLOURS[(i + (apart ? 5 : 0)) % GROUP_COLOURS.length]; }

    /* Group name themes (Group Options panel and the :group-names: option) */
    var NAME_THEMES = {
        elements: { label: 'Elements', names: ['Hydrogen', 'Helium', 'Lithium', 'Beryllium', 'Boron', 'Carbon', 'Nitrogen',
            'Oxygen', 'Fluorine', 'Neon', 'Sodium', 'Magnesium', 'Aluminium', 'Silicon', 'Phosphorus', 'Sulfur',
            'Chlorine', 'Argon', 'Potassium', 'Calcium', 'Iron', 'Copper', 'Zinc', 'Silver', 'Gold'] },
        planets: { label: 'Planets & moons', names: ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus',
            'Neptune', 'Pluto', 'Ceres', 'Eris', 'Luna', 'Io', 'Europa', 'Ganymede', 'Callisto', 'Titan', 'Enceladus',
            'Triton', 'Phobos', 'Deimos', 'Charon', 'Oberon', 'Miranda', 'Rhea'] },
        scientists: { label: 'Scientists', names: ['Curie', 'Darwin', 'Newton', 'Einstein', 'Franklin', 'Faraday', 'Lovelace',
            'Mendeleev', 'Galileo', 'Pasteur', 'Bohr', 'Goodall', 'Kepler', 'Tesla', 'Meitner', 'Hypatia', 'Noether',
            'Hawking', 'Fleming', 'Hopper', 'Turing', 'Carson', 'Banks', 'Florey', 'Herschel'] },
        colours: { label: 'Colours', names: ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet', 'Pink', 'Teal',
            'Gold', 'Silver', 'Black', 'White', 'Brown', 'Grey', 'Maroon', 'Navy', 'Lime', 'Aqua', 'Coral'] }
    };
    function themeNames(theme, count) {
        var list = NAME_THEMES[theme] ? NAME_THEMES[theme].names : [];
        var out = {};
        for (var i = 0; i < count; i++) {
            out[i] = list[i % list.length] + (i >= list.length ? ' ' + (Math.floor(i / list.length) + 1) : '');
        }
        return out;
    }

    /* ----- seating plan files -> groups -----
       Tables mode: each table becomes a group (4 or 6 places). Rows mode: each row of desks
       becomes a group (long rows are split into groups of up to 10). Empty tables/rows are left
       out; keep together / keep apart rules carry over, seat-position rules do not. */
    var TABLE_SEATS = { '4': 4, '6': 6, '6w': 6, '6d': 6 };

    function rowDeskCount(spec) {
        if (typeof spec === 'number') return spec;
        var n = 0;
        String(spec).replace(/\[\d+\]|(\d+)/g, function (m, d) { if (d) n += parseInt(d, 10); return m; });
        return n;
    }

    function seatingToGroups(data) {
        var units = [];   /* [{ start, seats }] in desk-number order */
        var start = 0, unit;
        if (data.mode === 'tables' && Array.isArray(data.tables)) {
            unit = 'table';
            data.tables.forEach(function (row) {
                (Array.isArray(row) ? row : []).forEach(function (code) {
                    var seats = TABLE_SEATS[String(code)] || 4;
                    units.push({ start: start, seats: seats });
                    start += seats;
                });
            });
        } else {
            unit = 'row';
            data.layout.forEach(function (spec) {
                var desks = rowDeskCount(spec);
                var parts = Math.max(1, Math.ceil(desks / MAX_SIZE));
                for (var i = 0; i < parts; i++) {
                    var seats = Math.floor(desks / parts) + (i < desks % parts ? 1 : 0);
                    units.push({ start: start, seats: seats });
                    start += seats;
                }
            });
        }
        if (!units.length) throw new Error('the seating plan in that file has no tables or rows.');
        if (!Array.isArray(data.students) || !data.students.length) throw new Error('the seating plan in that file has no students.');

        var byDesk = {};
        (Array.isArray(data.placement) ? data.placement : []).forEach(function (p) {
            if (p && p.deskIndex != null && p.studentId != null) byDesk[p.deskIndex] = String(p.studentId);
        });
        var sizes = [], placement = [], seated = {}, empty = 0;
        units.forEach(function (u) {
            var ids = [];
            for (var d = u.start; d < u.start + u.seats; d++) if (byDesk[d] != null && !seated[byDesk[d]]) ids.push(byDesk[d]);
            if (!ids.length) { empty++; return; }
            var size = Math.min(MAX_SIZE, Math.max(u.seats, ids.length));
            var offset = sizes.reduce(function (t, x) { return t + x; }, 0);
            ids.slice(0, size).forEach(function (id, k) { placement.push({ slotIndex: offset + k, studentId: id }); seated[id] = true; });
            sizes.push(size);
        });
        if (!sizes.length) sizes = [4];
        (Array.isArray(data.students) ? data.students : []).forEach(function (st) {
            if (st && st.id != null && !seated[String(st.id)]) placement.push({ slotIndex: null, studentId: String(st.id) });
        });
        var rules = Array.isArray(data.rules) ? data.rules : [];
        var kept = rules.filter(function (r) { return r && (r.type === 'PAIR' || r.type === 'SEPARATE'); });
        var d = data.display || {};
        return {
            app: FILE_APP, version: FILE_VERSION,
            title: data.title, groupSize: 4, groupSizes: sizes,
            sortMode: data.sortMode,
            students: data.students, rules: kept, groupCustomNames: {},
            display: { surnameInitial: d.surnameInitial, homeroom: d.homeroom, ignoreRules: d.ignoreRules,
                       oneLine: d.oneLine, hideBadges: d.hideBadges },
            placement: placement,
            converted: { unit: unit, groups: sizes.length, emptyTables: empty, droppedRules: rules.length - kept.length }
        };
    }

    var DEFAULT_ROLES = ['Leader', 'Scribe', 'Timekeeper', 'Materials'];

    /* Suggested role sets (Group Options). */
    var ROLE_SETS = [
        { label: 'Classic', roles: ['Leader', 'Scribe', 'Timekeeper', 'Materials'] },
        { label: 'Science lab', roles: ['Investigator', 'Recorder', 'Equipment', 'Safety officer', 'Reporter'] },
        { label: 'Discussion', roles: ['Facilitator', 'Note-taker', 'Spokesperson', 'Questioner', 'Challenger'] },
        { label: 'Pair programming / Micro:bit', roles: ['Driver', 'Navigator', 'Tester', 'Researcher'] },
        { label: 'Maths problem solving', roles: ['Strategist', 'Calculator', 'Checker', 'Presenter'] },
        { label: 'Reading circle', roles: ['Reader', 'Summariser', 'Word finder', 'Connector', 'Illustrator'] },
        { label: 'Project team', roles: ['Project manager', 'Designer', 'Builder', 'Data analyst', 'Presenter'] },
        { label: 'Encourager set', roles: ['Leader', 'Encourager', 'Checker', 'Reporter'] }
    ];

    /* Icons shown to the left of a student's name. A role can bring its own icon by starting
       with it, e.g. "🚀 Pilot"; otherwise known names get one below, others a lettered dot. */
    var ROLE_ICONS = {
        'leader': '👑', 'captain': '👑', 'scribe': '✏️', 'recorder': '📋', 'note-taker': '📝', 'note taker': '📝',
        'timekeeper': '⏱️', 'time keeper': '⏱️', 'materials': '🧰', 'materials manager': '🧰', 'equipment': '🧪',
        'equipment manager': '🧪', 'investigator': '🔬', 'safety officer': '🦺', 'safety': '🦺', 'reporter': '📣',
        'spokesperson': '🗣️', 'presenter': '🎤', 'facilitator': '🧭', 'questioner': '❓', 'challenger': '🤔',
        'driver': '💻', 'navigator': '🧭', 'tester': '🐞', 'researcher': '🔎', 'strategist': '💡', 'calculator': '🧮',
        'checker': '✅', 'reader': '📖', 'summariser': '🧾', 'summarizer': '🧾', 'word finder': '🔤', 'connector': '🔗',
        'illustrator': '🎨', 'designer': '🎨', 'project manager': '📅', 'builder': '🔧', 'data analyst': '📊',
        'encourager': '🌟', 'artist': '🎨', 'coder': '⌨️', 'programmer': '💻', 'engineer': '⚙️', 'observer': '👀',
        'runner': '🏃', 'editor': '🖊️', 'photographer': '📷', 'harmoniser': '🤝', 'mediator': '🤝'
    };
    var EMOJI_START = /^((?:[\u2190-\u21FF\u2300-\u23FF\u25A0-\u27BF\u2B00-\u2BFF]|[\uD83C-\uDBFF][\uDC00-\uDFFF])(?:[\uFE0F\u200D]|[\u2190-\u21FF\u2300-\u23FF\u25A0-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF])*)\s*(.*)$/;

    /* "🚀 Pilot" -> { icon: '🚀', name: 'Pilot' }; "Scribe" -> { icon: '✏️', name: 'Scribe' };
       "Lookout" -> { icon: '', letter: 'L', name: 'Lookout' } */
    function roleInfo(role) {
        var m = EMOJI_START.exec(role);
        if (m && m[2]) return { icon: m[1], name: m[2] };
        var icon = ROLE_ICONS[role.toLowerCase()];
        return icon ? { icon: icon, name: role } : { icon: '', letter: role.charAt(0).toUpperCase(), name: role };
    }

    /* Icons offered in the role editor (any emoji can also be typed at the start of a role). */
    var ICON_CHOICES = ['👑', '✏️', '⏱️', '🧰', '🔬', '📋', '🧪', '🦺', '📣', '🗣️', '🎤', '🧭', '📝', '❓', '🤔', '💻',
        '⌨️', '🐞', '🔎', '💡', '🧮', '✅', '📖', '🧾', '🔤', '🔗', '🎨', '📅', '🔧', '📊', '🌟', '👀', '🏃', '🖊️',
        '📷', '🤝', '🚀', '🎯', '🧠', '🔥', '🌱', '🐝', '🦉', '🎲', '🏆', '📌', '🧲', '⚙️', '🌍', '🧑‍🔬', '🎧', '📦'];

    /* "📋 Recorder" -> { explicit: '📋', name: 'Recorder' } (explicit '' when the icon is automatic) */
    function splitRole(role) {
        var m = EMOJI_START.exec(role);
        return m && m[2] ? { explicit: m[1], name: m[2] } : { explicit: '', name: role };
    }
    function joinRole(icon, name) { name = clean(name).slice(0, 30); return name ? (icon ? icon + ' ' : '') + name : ''; }

    /* Your own role sets and group name lists, kept in this browser for every planner. */
    var CUSTOM_KEY = 'studentgroups:custom-sets';
    function readCustomSets() {
        try {
            var d = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}');
            return { roles: Array.isArray(d.roles) ? d.roles : [], names: Array.isArray(d.names) ? d.names : [] };
        } catch (e) { return { roles: [], names: [] }; }
    }
    function writeCustomSets(sets) {
        try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(sets)); return true; } catch (e) { return false; }
    }

    function roleIconNode(role) {
        var info = roleInfo(role);
        var n = make('span', 'sg-role-icon' + (info.icon ? '' : ' sg-role-letter'), info.icon || info.letter);
        n.title = 'Role: ' + info.name;
        n.setAttribute('aria-label', info.name + ':');
        return n;
    }
    var MAX_ROLES = 10;
    /* "Leader, Scribe, Timekeeper" -> ['Leader', 'Scribe', 'Timekeeper'] */
    function parseRoles(text) {
        return String(text == null ? '' : text).split(/[,;\n]+/).map(function (r) { return r.trim().slice(0, 30); })
            .filter(Boolean).slice(0, MAX_ROLES);
    }

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
        '.sg-slot{border:none;height:52px;display:flex;align-items:center;justify-content:center}' +
        '.sg-num{display:inline-block;min-width:1.25em;height:1.25em;line-height:1.25em;margin-right:4px;border:1.5px solid #000;border-radius:50%;text-align:center;font-size:.7em;font-weight:700;vertical-align:.15em}' +
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
        '.sg-compact .sg-badge-stack{margin-top:0 !important}' +
        '.sg-role-icon{display:inline-block;margin-right:4px;font-weight:400}' +
        '.sg-role-letter{width:1.2em;height:1.2em;line-height:1.2em;border:1.5px solid #000;border-radius:50%;text-align:center;font-size:.75em;font-weight:700;vertical-align:.15em}' +
        '.sg-align-left .sg-card{align-items:flex-start;text-align:left;padding-left:8px}' +
        '.sg-align-left .sg-badge-stack{justify-content:flex-start}' +
        '.sg-align-left.sg-compact .sg-card{justify-content:flex-start}' +
        '.sg-card.sg-with-icons{position:relative}' +
        '.sg-icons{position:absolute;left:4px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:4px}' +
        '.sg-icons .sg-role-icon{font-size:30px;line-height:1;margin:0}' +
        '.sg-icons .sg-role-letter{font-size:16px;width:30px;height:30px;line-height:28px}' +
        '.sg-icons .sg-num{font-size:14px;min-width:24px;height:24px;line-height:21px;margin:0;vertical-align:0}' +
        '.sg-icons-1{padding-left:46px !important}.sg-icons-2{padding-left:78px !important}' +
        '.sg-compact .sg-icons .sg-role-icon{font-size:22px}.sg-compact .sg-icons .sg-num{font-size:12px;min-width:19px;height:19px;line-height:16px}' +
        '.sg-compact .sg-icons-1{padding-left:32px !important}.sg-compact .sg-icons-2{padding-left:54px !important}' +
        '.sg-role-legend{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;margin:0 0 8px}' +
        '.sg-role-key .sg-role-icon{margin-right:5px}' +
        '.sg-lock,.sg-group-lock{display:none !important}' +
        '.sg-page{break-after:page}.sg-page:last-child{break-after:auto}' +
        '.sg-print-away{font-size:12px;margin:8px 0 0}';

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
    /* sizes: slots in each group, e.g. [4,4,4] or [3,3,4,5]. With opts.exact the sizes are used as
       given; otherwise (one size for every group) students are spread evenly across the groups. */
    function planGroups(students, rules, sizes, opts) {
        opts = opts || {};
        var randomise = !!opts.randomise;
        var n = students.length;
        var numGroups = sizes.length;
        var biggest = Math.max.apply(null, sizes);

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

        var balancedCaps = [], looseCaps = sizes.slice();
        for (var g = 0; g < numGroups; g++) {
            balancedCaps.push(Math.min(sizes[g], Math.floor(n / numGroups) + (g < n % numGroups ? 1 : 0)));
        }

        var fixed = opts.fixed || {};   /* student id -> group index (locked students) */
        var useFixed = true;

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
                b.fixed = null;
                if (useFixed) {
                    b.members.forEach(function (m) {
                        if (fixed[m] == null) return;
                        if (b.fixed != null && b.fixed !== fixed[m]) bad = true;   /* locked into two groups */
                        b.fixed = fixed[m];
                    });
                }
                if (b.members.length > biggest) bad = true;
                if (b.members.length > 1 || b.deg > 0 || b.fixed != null) constrained.push(b);
            });
            if (bad) return null;

            var tiers = opts.exact ? [looseCaps] : [balancedCaps, looseCaps];
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
                    if (b.fixed != null && g !== b.fixed) continue;
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
            if (!placed) { useFixed = false; placed = pack([]); }   /* locks cannot all be kept */
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
            /* the group that would be least full after one more student, so groups of mixed
               sizes fill in proportion to their size (same as "smallest first" for equal sizes) */
            var best = [], bestSize = Infinity;
            for (var q = 0; q < numGroups; q++) {
                var size = groups[q].length + extra[q];
                if (size >= caps[q]) continue;
                var share = (size + 1) / caps[q];
                if (share < bestSize - 1e-9) { bestSize = share; best = [q]; } else if (Math.abs(share - bestSize) < 1e-9) best.push(q);
            }
            if (!best.length) break;
            extra[randomise ? best[Math.floor(Math.random() * best.length)] : best[0]]++;
        }

        var cursor = 0;
        for (var gg = 0; gg < numGroups; gg++) {
            for (var x = 0; x < extra[gg] && cursor < singles.length; x++) groups[gg].push(singles[cursor++].id);
        }

        return { groups: groups, dropped: dropped, locksKept: useFixed };
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
            groupSizes: null,          /* custom sizes per group, e.g. [3,3,4,5]; null = all groupSize */
            groupCount: null,          /* groups of groupSize made at the last arrange (kept until the next) */
            sortMode: cfg.sort || 'DEFAULT',
            groupCustomNames: {},
            display: {},
            absent: {},                /* student id -> true when marked away today */
            locks: {},                 /* student id -> { g: group, s: slot } kept when regrouping */
            roles: DEFAULT_ROLES.slice(),
            roleOffset: 0              /* Rotate Roles moves every role along one student */
        };
        var DISPLAY_TOGGLES = {
            surnameInitial: 'toggle-surname-initial',
            homeroom: 'toggle-homeroom',
            ignoreRules: 'toggle-ignore-rules',
            oneLine: 'toggle-oneline',
            hideBadges: 'toggle-hide-badges',
            showRoles: 'toggle-show-roles',
            numberStudents: 'toggle-number-students',
            alignLeft: 'toggle-align-left',
            bigIcons: 'toggle-big-icons'
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
                hideBadges: d.hideBadges === true,
                showRoles: d.showRoles === true,
                numberStudents: d.numberStudents === true,
                alignLeft: d.alignLeft === true,
                bigIcons: d.bigIcons === true
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
            state.groupCount = null;
            state.groupSizes = parseSizes((cfg.groupSizes || []).join(','));
            state.absent = {};
            state.locks = {};
            state.roles = Array.isArray(cfg.roles) && cfg.roles.length ? parseRoles(cfg.roles.join(',')) : DEFAULT_ROLES.slice();
            state.roleOffset = 0;
            state.groupCustomNames = {};
            if (cfg.groupNames && cfg.groupNames.theme) {
                state.groupCustomNames = themeNames(cfg.groupNames.theme, MAX_GROUPS);
            } else if (cfg.groupNames && Array.isArray(cfg.groupNames.list)) {
                cfg.groupNames.list.forEach(function (n, i) { if (clean(n)) state.groupCustomNames[i] = clean(n); });
            }
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
           including which group each student is in, so reopening the page shows the groups
           exactly as they were left. */
        var persistReady = false;   /* false while the page is starting up or resetting */
        var savedPlacement = null;  /* slots read from storage at start-up */

        function save() {
            try {
                localStorage.setItem(storageKey, JSON.stringify(planData(savedPlacement)));
            } catch (e) { /* storage blocked */ }
        }

        /* Groups changed (drag, sort, size, import ...): keep them, unless still starting up. */
        function persistSeats() { if (persistReady) save(); }

        function load() {
            try {
                var raw = localStorage.getItem(storageKey);
                if (!raw) return false;
                var plan = cleanPlan(JSON.parse(raw));
                applyPlanState(plan);
                if (plan.placement.length) savedPlacement = plan.placement;
                return true;
            } catch (e) { /* ignore: start from the page */ }
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

                '<button type="button" class="sg-btn sg-btn-grey" data-action="revert" data-role="revert" disabled ' +
                'title="Nothing imported yet">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>' +
                'Revert</button>' +

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

                '<button type="button" class="sg-btn sg-btn-teal" data-action="attendance" title="Mark students who are away today">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/></svg>' +
                'Attendance<span class="sg-btn-count" data-role="away-badge"></span></button>' +

                '<button type="button" class="sg-btn sg-btn-teal" data-action="options" title="Roles and group names">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>' +
                'Group Options</button>' +

                '<button type="button" class="sg-btn sg-btn-amber sg-roles-only" data-action="rotate-roles" title="Move every role along to the next student in each group">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sg-btn-icon"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>' +
                'Rotate Roles</button>' +
                '</div>' +

                /* Row 3: Group size selectors */
                '<div class="sg-toolbar-row">' +
                '<span style="color:#94a3b8; font-size:12px; font-weight:600;">Group Size:</span>' +
                '<div class="sg-sizes" data-role="sizes">' +
                SIZES.map(function (sz) {
                    return '<button type="button" class="sg-btn sg-btn-size" data-action="size" data-size="' + sz + '">' + sz + '</button>';
                }).join('') +
                '</div>' +
                '<div class="sg-custom-sizes">' +
                '<input type="text" class="sg-custom-input" data-role="custom-sizes" ' +
                'placeholder="Custom e.g. 3,3,3,4,4,5,6" aria-label="Custom group sizes: students in each group" ' +
                'title="Students in each group, separated by commas, e.g. 3,3,3,4,4,5,6. 3x4 means 3 groups of 4, so 3x4, 5, 6 also works.">' +
                '<button type="button" class="sg-btn sg-btn-purple" data-action="custom-sizes">Apply</button>' +
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
                '<label class="sg-checkbox-label" title="Give each student in a group a role (set the roles in Group Options)">' +
                '<input type="checkbox" data-role="toggle-show-roles" class="sg-checkbox">' +
                'Show Roles' +
                '</label>' +
                '<label class="sg-checkbox-label" title="Number the students 1, 2, 3 … in each group">' +
                '<input type="checkbox" data-role="toggle-number-students" class="sg-checkbox">' +
                'Number Students' +
                '</label>' +
                '<label class="sg-checkbox-label" title="Line the names up on the left of each card (unticked: centred)">' +
                '<input type="checkbox" data-role="toggle-align-left" class="sg-checkbox">' +
                'Left-align Names' +
                '</label>' +
                '<label class="sg-checkbox-label" title="Double the size of the role icons and numbers">' +
                '<input type="checkbox" data-role="toggle-big-icons" class="sg-checkbox">' +
                'Large Icons' +
                '</label>' +
                '</div>' +

                '</div>' +
                '<div class="sg-status" data-role="status" role="status" aria-live="polite"></div>' +
                '<div class="sg-body">' +
                '<div class="sg-sidebar"><div class="sg-side-title">Unassigned (<span data-role="count">0</span>)</div>' +
                '<div class="sg-pool" data-role="pool"></div>' +
                '<div class="sg-away-wrap" data-role="away-wrap"><div class="sg-side-title">Away today (<span data-role="away-count">0</span>)</div>' +
                '<div class="sg-pool sg-away" data-role="away" title="Away today: not put in groups. Drag a student into a group to mark them here."></div></div>' +
                '</div>' +
                '<div class="sg-canvas"><div class="sg-role-legend" data-role="role-legend"></div><div class="sg-grid" data-role="grid"></div></div>' +
                '</div>';

            ['title', 'revert', 'sizes', 'custom-sizes', 'file', 'json-file', 'toggle-surname-initial', 'toggle-homeroom', 'toggle-ignore-rules', 'toggle-oneline', 'toggle-hide-badges', 'toggle-show-roles', 'toggle-number-students', 'toggle-align-left', 'toggle-big-icons', 'status', 'count', 'pool', 'grid', 'away', 'away-wrap', 'away-count', 'away-badge', 'role-legend'].forEach(function (r) {
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
            ui.status.addEventListener('click', function (e) {
                if (e.target.closest('[data-action="close-status"]')) setStatus('');
            });
            ui.file.addEventListener('change', onFileChosen);
            ui['json-file'].addEventListener('change', onJsonFileChosen);
            Object.keys(DISPLAY_TOGGLES).forEach(function (key) {
                var box = ui[DISPLAY_TOGGLES[key]];
                box.checked = state.display[key];
                box.addEventListener('change', function () {
                    state.display[key] = box.checked;
                    applyDisplayClasses();
                    if (key === 'hideBadges') { if (box.checked) hideRuleStatus(); validate(); }
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
            ui.away.addEventListener('dragover', function (e) { e.preventDefault(); });
            ui.away.addEventListener('drop', function (e) { onListDrop(e, true); });
            ui['custom-sizes'].addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); applyCustomSizes(); }
            });
            ui['custom-sizes'].addEventListener('input', function () {
                ui['custom-sizes'].classList.remove('sg-invalid');
            });
        }

        /* ----- group sizes ----- */

        /* Slots in each group: the custom list, or enough groups of groupSize for the class. */
        function currentSizes() {
            if (state.groupSizes && state.groupSizes.length) return state.groupSizes.slice();
            var n = state.groupCount || Math.max(1, Math.ceil(Math.max(presentStudents().length, 1) / state.groupSize));
            var out = [];
            for (var i = 0; i < n; i++) out.push(state.groupSize);
            return out;
        }

        function totalSlots() { return currentSizes().reduce(function (t, x) { return t + x; }, 0); }

        /* Put the current sizes in the box so they can be tweaked and re-applied. */
        function showSizesInBox() {
            if (!ui['custom-sizes']) return;
            ui['custom-sizes'].value = currentSizes().join(', ');
            ui['custom-sizes'].classList.remove('sg-invalid');
        }

        function applyCustomSizes() {
            var input = ui['custom-sizes'];
            var sizes = parseSizes(input.value);
            if (!sizes) {
                input.classList.add('sg-invalid');
                setStatus('Group sizes not recognised. Type the number of students in each group, separated by commas, ' +
                    'e.g. 3,3,3,4,4,5,6. 3x4 means 3 groups of 4, so 3x4, 5, 6 also works. Groups hold 1–' + MAX_SIZE +
                    ' students; up to ' + MAX_GROUPS + ' groups.');
                input.focus();
                return;
            }
            input.classList.remove('sg-invalid');
            var allSame = sizes.every(function (x) { return x === sizes[0]; });
            /* the same size for every group, and just enough groups: that is a plain size button */
            if (allSame && sizes[0] >= MIN_SIZE && sizes.length === Math.max(1, Math.ceil(presentStudents().length / sizes[0]))) {
                state.groupCount = null;
                state.groupSize = sizes[0];
                state.groupSizes = null;
            } else {
                state.groupSizes = sizes;
            }
            autoArrange(state.sortMode);
            save();
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
            root.classList.toggle('sg-show-roles', !!state.display.showRoles);
            root.classList.toggle('sg-align-left', !!state.display.alignLeft);
            root.classList.toggle('sg-big-icons', !!state.display.bigIcons);
        }

        /* Remove the "rules left out" message (it names students and their rules). */
        function hideRuleStatus() {
            if (ui.status.classList.contains('sg-show') && ui.status.textContent.indexOf('Not every rule') !== -1) setStatus('');
        }

        function setStatus(msg) {
            if (!msg) { ui.status.textContent = ''; ui.status.classList.remove('sg-show'); return; }
            ui.status.innerHTML = '<span class="sg-status-text">' + esc(msg) + '</span>' +
                '<button type="button" class="sg-status-close" data-action="close-status" aria-label="Dismiss status">✕</button>';
            ui.status.classList.add('sg-show');
        }

        function updateToolbar() {
            Array.prototype.forEach.call(ui.sizes.querySelectorAll('[data-size]'), function (b) {
                b.classList.toggle('sg-active', !state.groupSizes && parseInt(b.getAttribute('data-size'), 10) === state.groupSize);
            });
            showSizesInBox();
        }

        function onRootClick(e) {
            var t = e.target.closest('[data-action]');
            if (!t || !root.contains(t)) return;
            switch (t.getAttribute('data-action')) {
                case 'size':
                    state.groupSize = parseInt(t.getAttribute('data-size'), 10);
                    state.groupSizes = null;
                    autoArrange(state.sortMode);
                    break;
                case 'custom-sizes': applyCustomSizes(); break;
                case 'lock': toggleLock(t.getAttribute('data-sid')); break;
                case 'group-lock': toggleGroupLock(+t.getAttribute('data-group')); break;
                case 'attendance': openAttendance(); break;
                case 'options': openOptions(); break;
                case 'rotate-roles': rotateRoles(); break;
                case 'rules': openModal(); break;
                case 'import': ui.file.click(); break;
                case 'export-json': exportJson(); break;
                case 'import-json': ui['json-file'].click(); break;
                case 'sort': autoArrange(t.getAttribute('data-mode')); break;
                case 'clear': clearGroups(); break;
                case 'reset': resetToPage(); break;
                case 'revert': revertToImport(); break;
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
            /* keep together / keep apart: one badge per group, numbered and coloured as in Rules */
            var ruleRow = make('div', 'sg-badges');
            (flags.pairGroups || []).forEach(function (g) {
                ruleRow.appendChild(groupBadge('sg-badge-pair', '🔗', g, 'Kept together: group '));
            });
            (flags.sepGroups || []).forEach(function (g) {
                ruleRow.appendChild(groupBadge('sg-badge-sep', '⚠️', g, 'Kept apart: group '));
            });
            if (ruleRow.children.length > 0) container.appendChild(ruleRow);
            return container;
        }

        function groupBadge(cls, icon, g, tip) {
            var c = groupColour(g, cls === 'sg-badge-sep');
            var b = make('span', 'sg-badge sg-badge-grp ' + cls, icon + ' ' + (g + 1));
            b.title = tip + (g + 1);
            b.style.setProperty('--sg-grp-fg', c.fg);
            b.style.setProperty('--sg-grp-bg', c.bg);
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

        function renderCard(card, student, isSlot, marks) {
            var flags = { pairGroups: [], sepGroups: [] };
            if (!state.display.hideBadges) {
                marks = marks || groupMarks();
                flags.pairGroups = marks.pair[student.id] || [];
                flags.sepGroups = marks.sep[student.id] || [];
            }
            card.classList.remove('sg-has-sep', 'sg-has-pair', 'sg-has-grp');
            card.style.removeProperty('--sg-grp-fg');
            card.style.removeProperty('--sg-grp-bg');
            /* a keep-together group colours the whole card, so the group stands out */
            if (flags.pairGroups.length) {
                var gc = groupColour(flags.pairGroups[0]);
                card.classList.add('sg-has-grp');
                card.style.setProperty('--sg-grp-fg', gc.fg);
                card.style.setProperty('--sg-grp-bg', gc.bg);
            } else if (flags.sepGroups.length) card.classList.add('sg-has-sep');

            card.textContent = '';
            var surnameDisplay = student.surname;
            if (state.display.surnameInitial && student.surname) {
                surnameDisplay = student.surname.charAt(0) + '.';
            }
            var showHomeroom = state.display.homeroom;

            card.classList.toggle('sg-locked', !!(isSlot && state.locks[student.id]));
            card.classList.toggle('sg-away-card', !!state.absent[student.id]);
            if (isSlot) {
                var lock = make('button', 'sg-lock', state.locks[student.id] ? '🔒' : '🔓');
                lock.type = 'button';
                lock.setAttribute('data-action', 'lock');
                lock.setAttribute('data-sid', student.id);
                lock.title = state.locks[student.id] ? 'Locked in this place: click to unlock' : 'Lock in this place when regrouping';
                lock.setAttribute('aria-label', lock.title);
                lock.draggable = false;
                card.appendChild(lock);
                var nameHolder = card;
                if (state.display.oneLine) {
                    nameHolder = make('span', 'sg-name-line');
                    card.appendChild(nameHolder);
                }
                nameHolder.appendChild(make('span', 'sg-first', student.firstName));
                nameHolder.appendChild(make('span', 'sg-last', surnameDisplay));
                if ((showHomeroom && student.homeroom) || flags.pairGroups.length || flags.sepGroups.length) {
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
            var marks = groupMarks();
            Array.prototype.forEach.call(root.querySelectorAll('.sg-card'), function (card) {
                var s = studentById(card.dataset.sid);
                if (s) {
                    var slot = card.closest('.sg-slot');
                    renderCard(card, s, !!slot, marks);
                }
            });
            applyRoles();
        }

        function awayCount() { return state.students.filter(function (s) { return state.absent[s.id]; }).length; }

        function updateCount() {
            persistSeats();
            var unassignedCount = ui.pool.querySelectorAll('.sg-card').length;
            var away = ui.away.querySelectorAll('.sg-card').length;
            ui.count.textContent = unassignedCount;
            ui['away-count'].textContent = away;
            ui['away-wrap'].style.display = away ? '' : 'none';
            ui.pool.parentNode.querySelector('.sg-side-title').style.display = unassignedCount || !away ? '' : 'none';
            ui.pool.style.display = unassignedCount || !away ? '' : 'none';
            ui['away-badge'].textContent = away ? ' (' + away + ' away)' : '';
            var sidebar = root.querySelector('.sg-sidebar');
            if (sidebar) sidebar.classList.toggle('sg-hidden', unassignedCount === 0 && away === 0);
        }

        function getSlots() {
            return Array.prototype.slice.call(ui.grid.querySelectorAll('.sg-slot'));
        }

        function groupName(g) { return state.groupCustomNames[g] || 'Group ' + (g + 1); }

        function initGrid() {
            ui.grid.innerHTML = '';
            var sizes = currentSizes();
            var numGroups = sizes.length;

            for (var g = 0; g < numGroups; g++) {
                var groupBox = make('div', 'sg-group-box');
                groupBox.dataset.groupIndex = g;
                groupBox.setAttribute('data-size', sizes[g]);

                var head = make('div', 'sg-group-head');
                var groupHeader = make('div', 'sg-group-header', groupName(g));
                groupHeader.contentEditable = "true";
                groupHeader.title = 'Click to rename this group';
                groupHeader.addEventListener('blur', (function (idx, headerEl) {
                    return function () {
                        var val = headerEl.textContent.trim();
                        if (val && val !== 'Group ' + (idx + 1)) state.groupCustomNames[idx] = val;
                        else { delete state.groupCustomNames[idx]; headerEl.textContent = 'Group ' + (idx + 1); }
                        save();
                    };
                })(g, groupHeader));
                groupHeader.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                });
                head.appendChild(groupHeader);
                var glock = make('button', 'sg-group-lock', '🔓');
                glock.type = 'button';
                glock.setAttribute('data-action', 'group-lock');
                glock.setAttribute('data-group', g);
                head.appendChild(glock);
                groupBox.appendChild(head);

                var slotsContainer = make('div', 'sg-group-slots');
                for (var s = 0; s < sizes[g]; s++) {
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

        /* ----- locks ----- */

        /* Locks follow their students: a locked student dragged to another place stays locked
           there; one moved out of the groups (Unassigned or Away) is unlocked. */
        function syncLocks() {
            Object.keys(state.locks).forEach(function (id) {
                var card = cardFor(id);
                var slot = card && card.closest('.sg-slot');
                if (slot && !state.absent[id]) state.locks[id] = { g: +slot.dataset.groupIndex, s: +slot.dataset.slotIndex };
                else delete state.locks[id];
            });
            Array.prototype.forEach.call(ui.grid.querySelectorAll('.sg-group-box'), function (box) {
                var cards = box.querySelectorAll('.sg-slot .sg-card');
                var locked = box.querySelectorAll('.sg-slot .sg-card.sg-locked').length;
                var btn = box.querySelector('.sg-group-lock');
                if (!btn) return;
                var all = cards.length && locked === cards.length;
                btn.textContent = all ? '🔒' : '🔓';
                btn.classList.toggle('sg-on', !!all);
                btn.classList.toggle('sg-part', !all && locked > 0);
                btn.title = all ? 'Group locked: click to unlock everyone in it' : 'Lock everyone in this group in place';
                btn.setAttribute('aria-label', btn.title);
            });
        }

        function toggleLock(id) {
            var card = cardFor(id);
            var slot = card && card.closest('.sg-slot');
            if (!slot) return;
            if (state.locks[id]) delete state.locks[id];
            else state.locks[id] = { g: +slot.dataset.groupIndex, s: +slot.dataset.slotIndex };
            var st = studentById(id);
            if (st) renderCard(card, st, true);
            applyRoles();
            syncLocks();
            save();
        }

        function toggleGroupLock(g) {
            var box = ui.grid.querySelector('.sg-group-box[data-group-index="' + g + '"]');
            if (!box) return;
            var cards = Array.prototype.slice.call(box.querySelectorAll('.sg-slot .sg-card'));
            var all = cards.length && cards.every(function (c) { return state.locks[c.dataset.sid]; });
            cards.forEach(function (c) {
                var slot = c.closest('.sg-slot');
                if (all) delete state.locks[c.dataset.sid];
                else state.locks[c.dataset.sid] = { g: g, s: +slot.dataset.slotIndex };
            });
            refreshCards();
            syncLocks();
            save();
        }

        /* ----- roles ----- */

        /* Each group's students (in slot order) share out the roles; Rotate Roles moves every
           role along to the next student. Students beyond the number of roles get none. */
        /* Key above the groups: icon = role. */
        function roleLegendHtml() {
            return state.roles.map(function (r) {
                var info = roleInfo(r);
                return '<span class="sg-role-key"><span class="sg-role-icon' + (info.icon ? '' : ' sg-role-letter') + '">' +
                    esc(info.icon || info.letter) + '</span>' + esc(info.name) + '</span>';
            }).join('');
        }

        /* Roles (icon left of the first name) and numbers (1, 2, 3 … in each group, before the
           icon), both counted through each group's students in slot order. */
        function applyRoles() {
            Array.prototype.forEach.call(ui.grid.querySelectorAll('.sg-role-icon, .sg-num, .sg-icons'), function (n) { n.parentNode.removeChild(n); });
            Array.prototype.forEach.call(ui.grid.querySelectorAll('.sg-with-icons'), function (n) {
                n.classList.remove('sg-with-icons', 'sg-icons-1', 'sg-icons-2');
            });
            var big = state.display.bigIcons;
            var on = state.display.showRoles && state.roles.length;
            var nums = state.display.numberStudents;
            ui['role-legend'].innerHTML = on ? '<span class="sg-role-key-title">Roles:</span>' + roleLegendHtml() : '';
            ui['role-legend'].style.display = on ? '' : 'none';
            if (!on && !nums) return;
            Array.prototype.forEach.call(ui.grid.querySelectorAll('.sg-group-box'), function (box) {
                var cards = box.querySelectorAll('.sg-slot .sg-card');
                var m = cards.length;
                Array.prototype.forEach.call(cards, function (card, k) {
                    var first = card.querySelector('.sg-first');
                    if (!first) return;
                    var icons = [];
                    if (nums) {
                        var num = make('span', 'sg-num', String(k + 1));
                        num.setAttribute('aria-label', 'Number ' + (k + 1));
                        icons.push(num);
                    }
                    if (on) {
                        var role = state.roles[(((k - state.roleOffset) % m) + m) % m];
                        if (role) {
                            icons.push(roleIconNode(role));
                            card.title = roleInfo(role).name;
                        }
                    }
                    if (!icons.length) return;
                    if (big) {
                        /* large: the icons get their own column at the left of the card */
                        var col = make('span', 'sg-icons');
                        icons.forEach(function (n) { col.appendChild(n); });
                        card.insertBefore(col, card.firstChild);
                        card.classList.add('sg-with-icons', 'sg-icons-' + icons.length);
                    } else {
                        for (var i = icons.length - 1; i >= 0; i--) first.insertBefore(icons[i], first.firstChild);
                    }
                });
            });
        }

        function rotateRoles() {
            state.roleOffset = (state.roleOffset + 1) % 1000;
            applyRoles();
            save();
        }

        function validate() {
            syncLocks();
            applyRoles();
            var slots = getSlots();
            var seated = {};
            slots.forEach(function (slot) {
                slot.classList.remove('sg-conflict');
                var card = slot.querySelector('.sg-card');
                if (card) seated[card.dataset.sid] = { slot: slot, groupIndex: +slot.dataset.groupIndex };
            });
            /* Hide Rule Badges also hides the red rule-breaking highlight */
            if (state.display.hideBadges) return;

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
            delete state.absent[id];   /* dragged into a group: here today */

            if (existing) {
                var other = studentById(existing.dataset.sid);
                var sourceIsSlot = source.classList.contains('sg-slot');
                var otherHome = sourceIsSlot ? source : ui.pool;
                if (source === ui.away) delete state.locks[existing.dataset.sid];
                if (other) renderCard(existing, other, sourceIsSlot);
                otherHome.appendChild(existing);
                if (sourceIsSlot) source.classList.add('sg-occupied');
            } else if (source.classList.contains('sg-slot')) {
                source.classList.remove('sg-occupied');
            }

            if (student) renderCard(dragged, student, true);
            target.classList.add('sg-occupied');
            target.appendChild(dragged);
            draggingId = null;
            refreshCards();
            validate();
            updateCount();
        }

        function onListDrop(e, away) {
            e.preventDefault();
            var id = draggingId || e.dataTransfer.getData('text/plain');
            var card = cardFor(id);
            if (!card) return;
            var parent = card.parentElement;
            if (parent.classList.contains('sg-slot')) parent.classList.remove('sg-occupied');
            if (away) state.absent[id] = true; else delete state.absent[id];
            delete state.locks[id];
            var s = studentById(id);
            if (s) renderCard(card, s, false);
            (away ? ui.away : ui.pool).appendChild(card);
            draggingId = null;
            refreshCards();
            validate();
            updateCount();
        }

        function onPoolDrop(e) { onListDrop(e, false); }

        function clearGroups() {
            setStatus('');
            state.locks = {};
            initGrid();
            ui.pool.innerHTML = '';
            ui.away.innerHTML = '';
            state.students.forEach(function (s) {
                (state.absent[s.id] ? ui.away : ui.pool).appendChild(createCard(s, false));
            });
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

        function presentStudents() {
            return state.students.filter(function (s) { return !state.absent[s.id]; });
        }

        function autoArrange(mode) {
            state.sortMode = mode || 'DEFAULT';
            state.groupCount = null;   /* work out the number of groups afresh */
            setStatus('');
            updateToolbar();

            var list = presentStudents();
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

            state.groupCount = state.groupSizes ? null : currentSizes().length;
            initGrid();
            ui.pool.innerHTML = '';
            ui.away.innerHTML = '';
            state.students.forEach(function (s) { if (state.absent[s.id]) ui.away.appendChild(createCard(s, false)); });

            if (!list.length) {
                state.locks = {};
                validate();
                updateCount();
                return;
            }

            var slots = getSlots();
            var rulesToUse = state.display.ignoreRules ? [] : state.rules;
            var sizes = currentSizes();

            /* locked students keep their group (and slot, below) if it still exists */
            var fixed = {}, present = {};
            list.forEach(function (st) { present[st.id] = true; });
            Object.keys(state.locks).forEach(function (id) {
                var lk = state.locks[id];
                if (present[id] && lk && lk.g < sizes.length && lk.s < sizes[lk.g]) fixed[id] = lk.g;
                else delete state.locks[id];
            });

            var plan = planGroups(list, rulesToUse, sizes,
                { randomise: mode === 'RANDOM', exact: !!state.groupSizes, fixed: fixed });
            if (!plan.locksKept) state.locks = {};
            var groupSlots = sizes.map(function () { return []; });
            slots.forEach(function (slot) { groupSlots[+slot.dataset.groupIndex].push(slot); });

            var byId = {};
            state.students.forEach(function (st) { byId[st.id] = st; });

            var seated = {};
            function seat(slot, id) {
                slot.classList.add('sg-occupied');
                slot.appendChild(createCard(byId[id], true));
                seated[id] = true;
            }
            plan.groups.forEach(function (ids, g) {
                var gs = groupSlots[g] || [];
                /* locked students first, in their own slots */
                ids.forEach(function (id) {
                    var lk = state.locks[id];
                    if (lk && lk.g === g && gs[lk.s] && !gs[lk.s].querySelector('.sg-card')) seat(gs[lk.s], id);
                });
                ids.forEach(function (id) {
                    if (seated[id] || !byId[id]) return;
                    for (var k = 0; k < gs.length; k++) {
                        if (!gs[k].querySelector('.sg-card')) { seat(gs[k], id); return; }
                    }
                });
            });

            list.forEach(function (st) {
                if (!seated[st.id]) ui.pool.appendChild(createCard(st, false));
            });

            var msgs = [];
            var unplaced = list.length - Object.keys(seated).length;
            if (unplaced > 0) {
                msgs.push('The groups have ' + totalSlots() + ' places for ' + list.length + ' students, so ' + unplaced +
                    (unplaced === 1 ? ' is' : ' are') + ' left in Unassigned. Add places in the group sizes box.');
            }
            if (!plan.locksKept) msgs.push('The locked students could not all stay where they were with the current group sizes, so they were unlocked.');
            if (plan.dropped.length && !state.display.hideBadges) msgs.push(droppedMessage(plan.dropped));
            if (msgs.length) setStatus(msgs.join(' '));

            refreshCards();
            validate();
            updateCount();
        }

        function resetToPage() {
            if (!window.confirm('Reset to the roster and rules written on the page? Your imported roster, rules and group names will be removed.')) return;
            try { localStorage.removeItem(storageKey); } catch (e) { /* ignore */ }
            clearImportSnapshot();
            defaultsFromConfig();
            state.sortMode = cfg.sort || 'DEFAULT';
            if (ui.title) ui.title.textContent = state.title;
            syncDisplayControls();
            persistReady = false;   /* the page's own groups: nothing to remember yet */
            autoArrange(state.sortMode);
            persistReady = true;
            setStatus('Reset to the roster and rules written on the page.');
        }

        /* ----- JSON export & import ----- */

        /* Which slot each student is in (slotIndex null = Unassigned). */
        function currentPlacement() {
            var placement = [];
            getSlots().forEach(function (d, idx) {
                var card = d.querySelector('.sg-card');
                if (card) placement.push({ slotIndex: idx, studentId: card.dataset.sid });
            });
            Array.prototype.forEach.call(ui.pool.querySelectorAll('.sg-card'), function (card) {
                placement.push({ slotIndex: null, studentId: card.dataset.sid });
            });
            Array.prototype.forEach.call(ui.away.querySelectorAll('.sg-card'), function (card) {
                placement.push({ slotIndex: null, studentId: card.dataset.sid });
            });
            return placement;
        }

        /* The whole plan as plain data: what Export JSON writes and the browser keeps. */
        function planData(fallbackPlacement) {
            var currentTitle = ui.title ? ui.title.textContent.trim() : state.title;
            return {
                app: FILE_APP,
                version: FILE_VERSION,
                title: currentTitle || 'Student Groups',
                groupSize: state.groupSize,
                groupSizes: state.groupSizes,
                groupCount: state.groupSizes ? null : (ui.grid ? ui.grid.querySelectorAll('.sg-group-box').length : state.groupCount),
                sortMode: state.sortMode,
                students: state.students,
                rules: state.rules,
                groupCustomNames: state.groupCustomNames,
                display: state.display,
                absent: Object.keys(state.absent).filter(function (id) { return state.absent[id]; }),
                locks: state.locks,
                roles: state.roles,
                roleOffset: state.roleOffset,
                placement: ui.grid ? currentPlacement() : (fallbackPlacement || [])
            };
        }

        /* Check a plan read from a file (or the browser) and tidy it. Throws, before anything
           on the page changes, if the data cannot be used. Files from older versions (no app,
           version, display or placement) still load. */
        function cleanPlan(data) {
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new Error('that file does not contain a student groups plan.');
            }
            if (data.app && data.app !== FILE_APP && !(data.app === 'seatingplan' && Array.isArray(data.layout))) {
                throw new Error('that file was saved by ' + (data.app === 'seatingplan' ? 'the seating plan' : '"' + String(data.app) + '"') +
                    ', not student groups.');
            }
            var converted = null;
            if ((!data.app || data.app === 'seatingplan') && Array.isArray(data.layout)) {
                data = seatingToGroups(data);
                converted = data.converted;
            }
            if (!Array.isArray(data.students)) throw new Error('that file has no list of students.');
            if (typeof data.version === 'number' && data.version > FILE_VERSION) {
                throw new Error('that file was made by a newer version of the group planner.');
            }

            var seen = {}, students = [];
            data.students.forEach(function (s, idx) {
                if (!s || typeof s !== 'object' || s.id == null || seen[s.id]) return;
                seen[s.id] = true;
                var first = clean(s.firstName) || 'Student';
                var surname = clean(s.surname) || String(idx + 1);
                students.push({ id: String(s.id), firstName: first, surname: surname,
                                fullName: first + ' ' + surname, homeroom: clean(s.homeroom) });
            });
            if (data.students.length && !students.length) throw new Error('none of the students in that file could be read.');

            var known = {};
            students.forEach(function (s) { known[s.id] = true; });
            var rules = (Array.isArray(data.rules) ? data.rules : []).filter(function (r) {
                return r && (r.type === 'PAIR' || r.type === 'SEPARATE') &&
                    known[r.student1Id] && known[r.student2Id] && r.student1Id !== r.student2Id;
            }).map(function (r, i) {
                var rule = { id: r.id != null ? String(r.id) : 'rule-imp-' + i, student1Id: String(r.student1Id),
                             student2Id: String(r.student2Id), type: r.type };
                if (r.group) rule.group = String(r.group);
                return rule;
            });

            var size = parseInt(data.groupSize, 10);
            if (!(size >= MIN_SIZE && size <= MAX_SIZE)) size = null;

            var names = {};
            if (data.groupCustomNames && typeof data.groupCustomNames === 'object') {
                Object.keys(data.groupCustomNames).forEach(function (k) {
                    var v = data.groupCustomNames[k];
                    if (/^\d+$/.test(k) && typeof v === 'string' && v.trim()) names[k] = v.trim().slice(0, 80);
                });
            }

            var display = {};
            if (data.display && typeof data.display === 'object') {
                Object.keys(DISPLAY_TOGGLES).forEach(function (k) {
                    if (typeof data.display[k] === 'boolean') display[k] = data.display[k];
                });
            }

            var absent = {};
            (Array.isArray(data.absent) ? data.absent : []).forEach(function (id) { if (known[id]) absent[id] = true; });
            var locks = {};
            if (data.locks && typeof data.locks === 'object') {
                Object.keys(data.locks).forEach(function (id) {
                    var lk = data.locks[id];
                    if (known[id] && !absent[id] && lk && lk.g >= 0 && lk.s >= 0 && lk.g === Math.floor(lk.g) && lk.s === Math.floor(lk.s)) {
                        locks[id] = { g: lk.g, s: lk.s };
                    }
                });
            }
            var roles = Array.isArray(data.roles) ? parseRoles(data.roles.join(',')) : null;
            var roleOffset = typeof data.roleOffset === 'number' && data.roleOffset >= 0 ? Math.floor(data.roleOffset) % 1000 : 0;

            var placement = (Array.isArray(data.placement) ? data.placement : []).filter(function (p) {
                return p && known[p.studentId] && (p.slotIndex == null || (typeof p.slotIndex === 'number' && p.slotIndex >= 0));
            });

            return {
                title: typeof data.title === 'string' ? data.title.trim().slice(0, 200) : '',
                groupSize: size,
                groupSizes: Array.isArray(data.groupSizes) ? parseSizes(data.groupSizes.join(',')) : null,
                groupCount: data.groupCount >= 1 && data.groupCount <= MAX_GROUPS ? Math.floor(data.groupCount) : null,
                sortMode: SORT_MODES.indexOf(data.sortMode) !== -1 ? data.sortMode : null,
                students: students, rules: rules, groupCustomNames: names,
                display: display, placement: placement,
                absent: absent, locks: locks, roles: roles, roleOffset: roleOffset, converted: converted,
                ruleCount: Array.isArray(data.rules) ? data.rules.length : 0
            };
        }

        /* Copy a cleaned plan into state (no drawing). */
        function applyPlanState(plan) {
            if (plan.title) state.title = plan.title;
            if (plan.groupSize) state.groupSize = plan.groupSize;
            state.groupSizes = plan.groupSizes;
            state.groupCount = plan.placement.length ? plan.groupCount : null;
            if (plan.sortMode) state.sortMode = plan.sortMode;
            state.students = plan.students;
            state.rules = plan.rules;
            state.groupCustomNames = plan.groupCustomNames;
            state.absent = plan.absent;
            state.locks = plan.locks;
            if (plan.roles) state.roles = plan.roles;
            state.roleOffset = plan.roleOffset;
            Object.keys(plan.display).forEach(function (k) { state.display[k] = plan.display[k]; });
        }

        /* Load a whole plan (Import JSON or Revert) and draw it. Returns the cleaned plan. */
        function applyPlanData(data) {
            var plan = cleanPlan(data);
            applyPlanState(plan);
            if (ui.title) ui.title.textContent = state.title;
            syncDisplayControls();
            updateToolbar();
            if (!placeStudents(plan.placement)) autoArrange(state.sortMode);
            return plan;
        }

        /* Put students in the slots listed in placement; false if there is no placement. */
        function placeStudents(placement) {
            if (!Array.isArray(placement) || !placement.length) return false;
            initGrid();
            ui.pool.innerHTML = '';
            var slots = getSlots();
            var byId = {};
            state.students.forEach(function (s) { byId[s.id] = s; });
            ui.away.innerHTML = '';
            var placed = {};
            placement.forEach(function (item) {
                var s = item && byId[item.studentId];
                if (!s || placed[s.id]) return;
                placed[s.id] = true;
                var slot = item.slotIndex != null ? slots[item.slotIndex] : null;
                if (state.absent[s.id]) {
                    ui.away.appendChild(createCard(s, false));
                } else if (slot && !slot.querySelector('.sg-card')) {
                    slot.classList.add('sg-occupied');
                    slot.appendChild(createCard(s, true));
                } else {
                    ui.pool.appendChild(createCard(s, false));
                }
            });
            /* students missing from the placement list go to Unassigned (or Away) */
            state.students.forEach(function (s) {
                if (!placed[s.id]) (state.absent[s.id] ? ui.away : ui.pool).appendChild(createCard(s, false));
            });
            refreshCards();
            validate();
            updateCount();
            return true;
        }

        function exportJson() {
            var payload = planData();
            var json = JSON.stringify(payload, null, 2);
            var suggested = (payload.title || 'student_groups').toLowerCase().replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '') || 'student_groups';
            /* keep it in the browser too, as if it had just been imported: the page reopens
               like this, and Revert comes back to it */
            save();
            storeImportSnapshot('export', suggested + '.json', JSON.parse(json));
            saveJsonFile(json, suggested + '.json');
        }

        /* Chrome/Edge (https or localhost): a Save As box to choose the folder and name.
           Other browsers: ask for a file name, then download it as usual. */
        function saveJsonFile(json, suggestedName) {
            if (window.showSaveFilePicker) {
                window.showSaveFilePicker({
                    suggestedName: suggestedName,
                    types: [{ description: 'Student groups (JSON)', accept: { 'application/json': ['.json'] } }]
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
                name = window.prompt('File name for the exported groups:', suggestedName);
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
            setStatus('Downloaded ' + name + '.');
        }

        /* ----- Revert: back to the last imported (or exported) JSON or roster ----- */

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
                setStatus('Reverted to ' + what + (snap.kind === 'roster' ? ' in its original order.' : ' as ' + how + '.'));
            } catch (err) {
                setStatus('Could not revert: ' + (err.message || err));
            }
        }

        function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

        function onJsonFileChosen(e) {
            var file = e.target.files[0];
            if (!file) return;
            var input = e.target;
            if (file.size > MAX_JSON_BYTES) {
                setStatus('Failed to import JSON: ' + file.name + ' is too large to be a student groups file.');
                input.value = '';
                return;
            }
            var reader = new FileReader();
            reader.onerror = function () { setStatus('Could not read that JSON file.'); input.value = ''; };
            reader.onload = function (evt) {
                try {
                    var data;
                    try { data = JSON.parse(evt.target.result); }
                    catch (parseErr) { throw new Error(file.name + ' is not valid JSON.'); }
                    var plan = applyPlanData(data);
                    save();
                    storeImportSnapshot('json', file.name, data);
                    var skipped = plan.ruleCount - plan.rules.length;
                    if (plan.converted) {
                        var cv = plan.converted;
                        setStatus('Converted the seating plan ' + file.name + ': ' + plural(cv.groups, cv.unit) + ' became ' +
                            plural(cv.groups, 'group') + ' (sizes ' + state.groupSizes.join(', ') + '), with ' +
                            plural(plan.students.length, 'student') + ' and ' + plural(plan.rules.length, 'keep together/apart rule') + '.' +
                            (cv.droppedRules ? ' ' + plural(cv.droppedRules, 'seating-only rule') + ' (front/back row, left/right, empty seat) ' +
                                (cv.droppedRules === 1 ? 'was' : 'were') + ' left out.' : '') +
                            (cv.emptyTables ? ' ' + plural(cv.emptyTables, 'empty ' + cv.unit) + ' left out.' : ''));
                        return;
                    }
                    setStatus('Imported ' + file.name + ': ' + plural(plan.students.length, 'student') + ', ' +
                        plural(plan.rules.length, 'rule') + ', groups of ' + (state.groupSizes ? state.groupSizes.join(', ') : state.groupSize) +
                        (plan.placement.length ? ' and the saved groups.' : ' (no saved groups, so they were arranged afresh).') +
                        (skipped > 0 ? ' ' + plural(skipped, 'rule') + ' naming unknown students were skipped.' : ''));
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
                if (!window.confirm('Importing a new class list will clear the existing grouping rules. Continue?')) return;
            }
            var students = rowsToStudents(rows);
            if (!students.length) {
                setStatus('No students found in that file. It needs a header row with Preferred (or First Name), Surname (or Last Name) and optionally Homeroom.');
                return;
            }
            state.rules = [];
            state.students = students;
            state.absent = {};
            state.locks = {};
            var newTitle = titleFromFileName(fileName);
            if (newTitle) {
                state.title = newTitle;
                if (ui.title) ui.title.textContent = newTitle;
            }
            save();
            autoArrange(state.sortMode);
            /* Revert puts the class back in the file's own order */
            storeImportSnapshot('roster', fileName, {
                app: FILE_APP, version: FILE_VERSION, title: state.title, groupSize: state.groupSize, groupSizes: state.groupSizes,
                sortMode: 'DEFAULT', students: students, rules: [], groupCustomNames: {}, placement: []
            });
            if (!ui.status.classList.contains('sg-show')) {
                setStatus('Imported ' + plural(students.length, 'student') + ' from ' + fileName + '.');
            }
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

        /* The printable copy of this planner: title and the groups (with roles, without the
           buttons, rule badges or red highlights). Away students are listed underneath. */
        function printSection() {
            var title = (ui.title ? ui.title.textContent.trim() : state.title) || 'Student Groups';
            var clone = ui.grid.cloneNode(true);
            Array.prototype.forEach.call(clone.querySelectorAll('.sg-lock, .sg-group-lock, .sg-badges'), function (n) {
                n.parentNode.removeChild(n);
            });
            Array.prototype.forEach.call(clone.querySelectorAll('[class]'), function (n) {
                n.classList.remove('sg-conflict', 'sg-drag-over', 'sg-locked');
                n.removeAttribute('contenteditable');
                n.removeAttribute('draggable');
            });
            var away = state.students.filter(function (st) { return state.absent[st.id]; })
                .map(function (st) { return esc(st.fullName); });
            return {
                title: title,
                empty: !state.students.length,
                classes: [state.display.oneLine ? 'sg-compact' : '', state.display.alignLeft ? 'sg-align-left' : '',
                          state.display.bigIcons ? 'sg-big-icons' : ''].join(' '),
                html: '<h1>' + esc(title) + '</h1>' +
                    (state.display.showRoles && state.roles.length ? '<div class="sg-role-legend">' + roleLegendHtml() + '</div>' : '') +
                    clone.outerHTML +
                    (away.length ? '<p class="sg-print-away">Away: ' + away.join(', ') + '</p>' : '')
            };
        }
        /* used by the studentgroups-print button to print every planner on the page */
        root.sgPrintSection = printSection;

        function printPlan() {
            var sec = printSection();
            openPrintWindow(sec.title, [sec]);
        }

        /* ----- rules panel -----
           Pick a rule from the dropdown, then build groups by ticking students.
           Keep together: a group of 2 up to the group size is stored as a chain of PAIR rules.
           Keep apart: a group of any size is stored as SEPARATE rules between every two members.
           Rules made here carry a `group` id so they show (and edit) as one group; rules from
           the directive or older saves are grouped automatically. */

        var RULE_KINDS = [
            { type: 'PAIR', icon: '🔗', label: 'Keep together',
              help: 'Students in a keep-together group are always put in the same group.' },
            { type: 'SEPARATE', icon: '⚠️', label: 'Keep apart',
              help: 'No two students in a keep-apart group are put in the same group.' }
        ];
        var panel = { kind: 'PAIR', search: '', editing: null, picked: {} };

        function kindInfo(type) {
            for (var i = 0; i < RULE_KINDS.length; i++) if (RULE_KINDS[i].type === type) return RULE_KINDS[i];
            return RULE_KINDS[0];
        }

        /* Largest keep-together group: everyone must fit in one group. */
        function maxFor(kind) { return kind.type === 'PAIR' ? Math.max.apply(null, currentSizes()) : null; }

        function nameOf(id) { var s = studentById(id); return s ? s.fullName : '?'; }

        function sortedStudents() {
            return state.students.slice().sort(function (a, b) {
                return String(a.surname).localeCompare(String(b.surname)) ||
                       String(a.firstName).localeCompare(String(b.firstName));
            });
        }

        function linked(a, b, type) {
            return state.rules.some(function (r) {
                return r.type === type && ((r.student1Id === a && r.student2Id === b) || (r.student1Id === b && r.student2Id === a));
            });
        }

        /* Groups for a rule type, as [{ key, ids, ruleIds }]. */
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

        function buildModal() {
            modal = make('div', 'sg-modal');
            modal.innerHTML =
                '<div class="sg-modal-card sg-rp" role="dialog" aria-modal="true" aria-label="Grouping rules">' +
                '<div class="sg-modal-head"><span>Grouping Rules</span>' +
                '<button type="button" class="sg-modal-close" data-m="close" aria-label="Close">✕</button></div>' +
                '<div class="sg-rp-top">' +
                '<label class="sg-rp-label">Rule <select data-m="kind" aria-label="Rule"></select></label>' +
                '<div class="sg-rp-help" data-m="help"></div>' +
                '</div>' +
                '<div class="sg-modal-body" data-m="body"></div>' +
                '<div class="sg-rp-foot" data-m="foot"></div>' +
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
                if (e.key === 'Escape' && modal.classList.contains('sg-open')) closeModal();
            });
        }

        function openModal() {
            panel.editing = null;
            panel.search = '';
            renderPanel();
            modal.classList.add('sg-open');
        }

        function closeModal() { if (modal) modal.classList.remove('sg-open'); }

        function fillKinds() {
            mui.kind.innerHTML = '';
            RULE_KINDS.forEach(function (k) {
                var n = groupsFor(k.type).length;
                var opt = make('option', null, k.icon + ' ' + k.label + ' (' + n + (n === 1 ? ' group' : ' groups') + ')');
                opt.value = k.type;
                mui.kind.appendChild(opt);
            });
            mui.kind.value = panel.kind;
        }

        function renderPanel() {
            fillKinds();
            var kind = kindInfo(panel.kind);
            mui.help.textContent = kind.help + (state.display.ignoreRules ? ' (Ignore Rules is ticked, so rules are not used when arranging.)' : '');
            mui.body.innerHTML = '';
            mui.foot.innerHTML = '';
            if (!state.students.length) {
                mui.body.appendChild(make('div', 'sg-rp-empty', 'Import a class list first, then add rules here.'));
                mui.foot.innerHTML = '<span></span><button type="button" class="sg-btn" data-m="close">Done</button>';
                return;
            }
            renderGroups(kind);
        }

        function searchRow() {
            return '<div class="sg-rp-tools">' +
                '<input type="search" class="sg-rp-search" data-m="search" placeholder="Search students" aria-label="Search students" value="' + esc(panel.search) + '">' +
                '</div>';
        }

        function studentRow(s, checked, note, disabled) {
            var row = make('label', 'sg-rp-row' + (disabled ? ' sg-rp-disabled' : '') + (checked ? ' sg-rp-on' : ''));
            row.dataset.name = (s.fullName + ' ' + (s.homeroom || '')).toLowerCase();
            var box = make('input');
            box.type = 'checkbox';
            box.value = s.id;
            box.checked = checked;
            box.disabled = disabled;
            row.appendChild(box);
            row.appendChild(make('span', 'sg-rp-name', s.firstName + ' ' + s.surname));
            if (s.homeroom) row.appendChild(make('span', 'sg-rp-hr', s.homeroom));
            if (note) row.appendChild(make('span', 'sg-rp-note', note));
            return row;
        }

        function renderGroups(kind) {
            var groups = groupsFor(kind.type);
            if (panel.editing) { renderGroupEditor(kind, groups); return; }
            var wrap = make('div', 'sg-rp-groups');
            if (!groups.length) {
                wrap.appendChild(make('div', 'sg-rp-empty', 'No ' + kind.label.toLowerCase() + ' groups yet.'));
            }
            var max = maxFor(kind);
            groups.forEach(function (g, i) {
                var item = make('div', 'sg-rp-group ' + (kind.type === 'PAIR' ? 'sg-pair' : 'sg-sep'));
                var gc = groupColour(i, kind.type !== 'PAIR');
                item.style.setProperty('--sg-grp-fg', gc.fg);
                item.style.setProperty('--sg-grp-bg', gc.bg);
                item.appendChild(make('span', 'sg-badge sg-badge-grp ' + (kind.type === 'PAIR' ? 'sg-badge-pair' : 'sg-badge-sep'),
                    (kind.type === 'PAIR' ? '🔗 ' : '⚠️ ') + (i + 1)));
                var label = make('div', 'sg-rp-group-names');
                label.appendChild(make('strong', null, 'Group ' + (i + 1) + '  '));
                label.appendChild(document.createTextNode(g.ids.map(nameOf).join(' · ')));
                if (max && g.ids.length > max) {
                    label.appendChild(make('span', 'sg-rp-warn', ' Too big for groups of ' + max + '; it will be split.'));
                }
                item.appendChild(label);
                var btns = make('span', 'sg-rp-group-btns');
                var ed = make('button', 'sg-btn sg-btn-grey sg-rp-small', 'Edit');
                ed.type = 'button'; ed.setAttribute('data-m', 'edit-group'); ed.setAttribute('data-key', g.key);
                var del = make('button', 'sg-del-rule', '🗑');
                del.type = 'button'; del.setAttribute('data-m', 'delete-group'); del.setAttribute('data-key', g.key);
                del.setAttribute('aria-label', 'Delete group ' + (i + 1));
                del.title = 'Delete group ' + (i + 1);
                btns.appendChild(ed); btns.appendChild(del);
                item.appendChild(btns);
                wrap.appendChild(item);
            });
            mui.body.appendChild(wrap);
            mui.foot.innerHTML =
                '<span><button type="button" class="sg-btn sg-btn-teal" data-m="new-group">+ New group</button>' +
                (groups.length ? ' <button type="button" class="sg-btn sg-btn-grey" data-m="clear-all">Clear all</button>' : '') +
                '</span><button type="button" class="sg-btn" data-m="close">Done</button>';
        }

        function renderGroupEditor(kind, groups) {
            var editing = panel.editing;
            var own = editing.key ? groups.filter(function (g) { return g.key === editing.key; })[0] : null;
            var ownIds = own ? own.ids : [];
            var pickedIds = Object.keys(panel.picked).filter(function (id) { return panel.picked[id]; });
            var max = maxFor(kind);
            var full = max && pickedIds.length >= max;

            mui.body.innerHTML =
                '<div class="sg-rp-edit-title">' + (own ? 'Edit group' : 'New group') + ' — tick ' +
                (max ? '2 to ' + max + ' students' : '2 or more students') + '</div>' + searchRow();
            var list = make('div', 'sg-rp-list');
            list.setAttribute('data-m', 'list');
            sortedStudents().forEach(function (s) {
                var on = !!panel.picked[s.id];
                var note = '', blocked = false;
                if (!on) {
                    var other = kind.type === 'PAIR' ? 'SEPARATE' : 'PAIR';
                    var clashWith = pickedIds.filter(function (id) { return linked(s.id, id, other); })[0];
                    if (clashWith) {
                        blocked = true;
                        note = (other === 'SEPARATE' ? '⚠️ kept apart from ' : '🔗 kept together with ') + studentById(clashWith).firstName;
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
                '<span class="sg-rp-count">' + n + ' ticked' + (full ? ' (most allowed)' : '') + '</span>' +
                '<span><button type="button" class="sg-btn sg-btn-grey" data-m="cancel-group">Cancel</button> ' +
                '<button type="button" class="sg-btn" data-m="save-group"' + (n >= 2 ? '' : ' disabled') + '>Save group</button></span>';
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
                for (var i = 1; i < ids.length; i++) add(ids[i - 1], ids[i]);   // a chain: A-B, B-C
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
            if (!btn || btn.tagName === 'SELECT' || btn.tagName === 'INPUT') return;
            switch (btn.getAttribute('data-m')) {
                case 'close': closeModal(); break;
                case 'clear-all':
                    if (!window.confirm('Remove every ' + kindInfo(panel.kind).label.toLowerCase() + ' group?')) return;
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
            if (t.getAttribute('data-m') === 'kind') {
                panel.kind = t.value; panel.editing = null; panel.search = '';
                renderPanel();
                return;
            }
            var list = t.closest('[data-m="list"]');
            if (!list || t.type !== 'checkbox') return;
            panel.picked[t.value] = t.checked;
            var body = mui.body, top = body.scrollTop;
            renderPanel();
            body.scrollTop = top;
            var search = mui.body.querySelector('[data-m="search"]');
            if (search && panel.search) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
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
            if (modal && modal.classList.contains('sg-open')) {
                var body = mui.body, top = body.scrollTop;
                renderPanel();
                body.scrollTop = top;
            }
        }

        /* ----- small panels (Attendance, Group Options), same style as Rules ----- */

        function makePanel(title, label, extraClass) {
            var m = make('div', 'sg-modal');
            m.innerHTML =
                '<div class="sg-modal-card sg-rp ' + (extraClass || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(label) + '">' +
                '<div class="sg-modal-head"><span>' + esc(title) + '</span>' +
                '<button type="button" class="sg-modal-close" data-p="close" aria-label="Close">✕</button></div>' +
                '<div class="sg-rp-top" data-p="top"></div>' +
                '<div class="sg-modal-body" data-p="body"></div>' +
                '<div class="sg-rp-foot" data-p="foot"></div>' +
                '</div>';
            document.body.appendChild(m);
            var parts = { modal: m };
            ['top', 'body', 'foot'].forEach(function (k) { parts[k] = m.querySelector('[data-p="' + k + '"]'); });
            parts.open = function () { m.classList.add('sg-open'); };
            parts.close = function () { m.classList.remove('sg-open'); };
            m.addEventListener('click', function (e) {
                if (e.target === m || e.target.closest('[data-p="close"]')) parts.close();
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && m.classList.contains('sg-open')) parts.close();
            });
            return parts;
        }

        /* --- Attendance: tick students who are away today --- */

        var att = null, attSearch = '';

        function openAttendance() {
            if (!att) {
                att = makePanel('Attendance', 'Attendance');
                att.top.innerHTML = '<div class="sg-rp-help">Tick students who are away today. They come out of the groups ' +
                    'and are left out when you regroup. Untick (or drag them into a group) when they are back.</div>';
                att.modal.addEventListener('input', function (e) {
                    if (e.target.getAttribute('data-m') !== 'search') return;
                    attSearch = e.target.value;
                    filterAttendance();
                });
                att.modal.addEventListener('change', function (e) {
                    var t = e.target;
                    if (t.type !== 'checkbox' || !t.closest('[data-m="att-list"]')) return;
                    setAway(t.value, t.checked);
                    renderAttendance();
                });
                att.modal.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-a]');
                    if (!b) return;
                    if (b.getAttribute('data-a') === 'all-here') {
                        state.students.forEach(function (st) { if (state.absent[st.id]) setAway(st.id, false); });
                        renderAttendance();
                    } else if (b.getAttribute('data-a') === 'regroup') {
                        att.close();
                        autoArrange(state.sortMode);
                        save();
                    }
                });
            }
            attSearch = '';
            renderAttendance();
            att.open();
        }

        function renderAttendance() {
            var body = att.body, top = body.scrollTop;
            body.innerHTML = '';
            if (!state.students.length) {
                body.appendChild(make('div', 'sg-rp-empty', 'Import a class list first.'));
            } else {
                body.innerHTML = '<div class="sg-rp-tools"><input type="search" class="sg-rp-search" data-m="search" ' +
                    'placeholder="Search students" aria-label="Search students" value="' + esc(attSearch) + '"></div>';
                var list = make('div', 'sg-rp-list');
                list.setAttribute('data-m', 'att-list');
                sortedStudents().forEach(function (st) {
                    list.appendChild(studentRow(st, !!state.absent[st.id], state.absent[st.id] ? 'away' : '', false));
                });
                body.appendChild(list);
                filterAttendance();
            }
            var n = awayCount();
            att.foot.innerHTML =
                '<span class="sg-rp-count">' + (n ? plural(n, 'student') + ' away, ' + (state.students.length - n) + ' here' : 'Everyone is here') + '</span>' +
                '<span><button type="button" class="sg-btn sg-btn-grey" data-a="all-here"' + (n ? '' : ' disabled') + '>Everyone here</button> ' +
                '<button type="button" class="sg-btn sg-btn-amber" data-a="regroup" title="Rearrange the groups with only the students who are here">Regroup</button> ' +
                '<button type="button" class="sg-btn" data-p="close">Done</button></span>';
            body.scrollTop = top;
            var search = body.querySelector('[data-m="search"]');
            if (search && attSearch) { search.focus(); search.setSelectionRange(attSearch.length, attSearch.length); }
        }

        function filterAttendance() {
            var list = att.body.querySelector('[data-m="att-list"]');
            if (!list) return;
            var q = attSearch.trim().toLowerCase();
            Array.prototype.forEach.call(list.children, function (row) {
                row.style.display = q && row.dataset.name.indexOf(q) === -1 ? 'none' : '';
            });
        }

        /* Away: out of the groups into the Away list (leaving a gap). Back: into Unassigned. */
        function setAway(id, away) {
            var st = studentById(id);
            if (!st) return;
            var card = cardFor(id);
            if (away) state.absent[id] = true; else delete state.absent[id];
            delete state.locks[id];
            if (card) {
                var slot = card.closest('.sg-slot');
                if (slot) slot.classList.remove('sg-occupied');
                renderCard(card, st, false);
                (away ? ui.away : ui.pool).appendChild(card);
            }
            refreshCards();
            validate();
            updateCount();
            save();
        }

        /* --- Group Options: roles and group names ---
           Roles: one row each (icon, name, move, remove), changes show straight away.
           Group names: a box per group, a theme, or a saved list. Your own role sets and name
           lists can be saved and are offered again in every planner on this browser. */

        var opt = null;

        function openOptions() {
            if (!opt) {
                opt = makePanel('Group Options', 'Group options', 'sg-op');
                opt.modal.addEventListener('click', onOptionsClick);
                opt.modal.addEventListener('input', onOptionsInput);
                opt.modal.addEventListener('change', onOptionsChange);
                opt.modal.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' && e.target.matches('input[type="text"]')) { e.preventDefault(); e.target.blur(); }
                });
            }
            opt.top.innerHTML = '<div class="sg-rp-help">Roles are shared out to the students in each group, in order ' +
                '(the first student gets the first role). Changes show on the groups straight away.</div>';
            opt.body.innerHTML =
                '<section class="sg-op-section"><h5>Roles</h5>' +
                '<label class="sg-op-check"><input type="checkbox" data-o-field="show-roles"' + (state.display.showRoles ? ' checked' : '') + '> Show roles on the groups</label>' +
                '<div class="sg-op-roles" data-o-field="role-rows"></div>' +
                '<div class="sg-op-row"><button type="button" class="sg-btn sg-btn-teal" data-o="role-add">+ Add role</button>' +
                '<button type="button" class="sg-btn sg-btn-amber" data-o="rotate" title="Move every role along to the next student in each group">Rotate roles</button></div>' +
                '<div class="sg-op-row"><select class="sg-op-select" data-o-field="role-set" aria-label="Role sets"></select>' +
                '<button type="button" class="sg-btn sg-btn-purple" data-o="role-set">Use</button>' +
                '<button type="button" class="sg-btn sg-btn-grey" data-o="role-save" title="Keep these roles as one of your sets">Save as my set</button>' +
                '<button type="button" class="sg-btn sg-btn-red" data-o="role-del" hidden>Delete</button></div>' +
                '</section>' +
                '<section class="sg-op-section"><h5>Group names</h5>' +
                '<div class="sg-op-names" data-o-field="name-rows"></div>' +
                '<div class="sg-op-row"><select class="sg-op-select" data-o-field="theme" aria-label="Group name themes"></select>' +
                '<button type="button" class="sg-btn sg-btn-purple" data-o="names-apply">Use</button>' +
                '<button type="button" class="sg-btn sg-btn-grey" data-o="names-save" title="Keep these group names as one of your lists">Save as my list</button>' +
                '<button type="button" class="sg-btn sg-btn-red" data-o="names-del" hidden>Delete</button></div>' +
                '</section>' +
                '<p class="sg-op-feedback" data-o-field="feedback" role="status"></p>';
            opt.foot.innerHTML = '<span class="sg-rp-count">Your saved sets and lists are kept in this browser.</span>' +
                '<button type="button" class="sg-btn" data-p="close">Done</button>';
            renderRoleRows();
            renderNameRows();
            fillSetSelects();
            opt.open();
        }

        function optField(name) { return opt.body.querySelector('[data-o-field="' + name + '"]'); }

        function optFeedback(msg, bad) {
            var f = opt && optField('feedback');
            if (!f) return;
            f.textContent = msg || '';
            f.className = 'sg-op-feedback' + (bad ? ' sg-error' : ' sg-ok');
        }

        /* --- roles --- */

        function iconSelect(i, explicit, name) {
            var auto = roleInfo(name || '?');
            var html = '<select class="sg-op-icon" data-o-field="role-icon" data-i="' + i + '" aria-label="Icon for role ' + (i + 1) + '" ' +
                'title="Icon shown to the left of the student\'s name">' +
                '<option value=""' + (explicit ? '' : ' selected') + '>' + esc(auto.icon || auto.letter || '•') + ' auto</option>';
            var list = ICON_CHOICES.slice();
            if (explicit && list.indexOf(explicit) === -1) list.unshift(explicit);
            list.forEach(function (ic) {
                html += '<option value="' + esc(ic) + '"' + (ic === explicit ? ' selected' : '') + '>' + esc(ic) + '</option>';
            });
            return html + '</select>';
        }

        function renderRoleRows() {
            var box = optField('role-rows');
            box.innerHTML = state.roles.map(function (r, i) {
                var parts = splitRole(r);
                return '<div class="sg-op-role" data-i="' + i + '">' +
                    '<span class="sg-op-pos">' + (i + 1) + '</span>' +
                    iconSelect(i, parts.explicit, parts.name) +
                    '<input type="text" class="sg-rp-search sg-op-role-name" data-o-field="role-name" data-i="' + i + '" maxlength="30" ' +
                    'aria-label="Role ' + (i + 1) + ' name" value="' + esc(parts.name) + '">' +
                    '<button type="button" class="sg-op-mini" data-o="role-up" data-i="' + i + '" title="Move up"' + (i ? '' : ' disabled') + '>↑</button>' +
                    '<button type="button" class="sg-op-mini" data-o="role-down" data-i="' + i + '" title="Move down"' + (i < state.roles.length - 1 ? '' : ' disabled') + '>↓</button>' +
                    '<button type="button" class="sg-op-mini sg-op-del" data-o="role-remove" data-i="' + i + '" title="Remove this role"' + (state.roles.length > 1 ? '' : ' disabled') + '>✕</button>' +
                    '</div>';
            }).join('');
            var add = opt.body.querySelector('[data-o="role-add"]');
            if (add) add.disabled = state.roles.length >= MAX_ROLES;
        }

        /* Roles changed in the editor: show them, keep them. */
        function rolesChanged(rerender) {
            state.roles = state.roles.filter(Boolean);
            if (!state.roles.length) state.roles = DEFAULT_ROLES.slice();
            if (!state.display.showRoles) {
                state.display.showRoles = true;
                syncDisplayControls();
                optField('show-roles').checked = true;
            }
            applyRoles();
            save();
            if (rerender) renderRoleRows();
        }

        /* Read row i (icon + name) back into the role list. */
        function readRoleRow(i) {
            var row = optField('role-rows').querySelector('.sg-op-role[data-i="' + i + '"]');
            if (!row) return;
            var name = row.querySelector('[data-o-field="role-name"]').value;
            var sel = row.querySelector('[data-o-field="role-icon"]');
            var icon = sel.value;
            /* renaming a role keeps its icon when the new name has no icon of its own */
            if (!icon && clean(name)) {
                var before = roleInfo(state.roles[i] || '');
                var after = roleInfo(clean(name));
                if (before.icon && !after.icon) {
                    icon = before.icon;
                    if (!Array.prototype.some.call(sel.options, function (o) { return o.value === icon; })) {
                        var o = make('option', null, icon); o.value = icon; sel.insertBefore(o, sel.options[1]);
                    }
                    sel.value = icon;
                }
            }
            var role = joinRole(icon, name);
            if (role) state.roles[i] = role;
        }

        /* --- group names --- */

        function groupCount() { return ui.grid.querySelectorAll('.sg-group-box').length; }

        function renderNameRows() {
            var n = groupCount(), html = '';
            for (var g = 0; g < n; g++) {
                html += '<label class="sg-op-name"><span class="sg-op-pos">' + (g + 1) + '</span>' +
                    '<input type="text" class="sg-rp-search" data-o-field="group-name" data-g="' + g + '" maxlength="80" ' +
                    'placeholder="Group ' + (g + 1) + '" aria-label="Name of group ' + (g + 1) + '" value="' + esc(state.groupCustomNames[g] || '') + '"></label>';
            }
            optField('name-rows').innerHTML = html || '<div class="sg-rp-empty">No groups yet.</div>';
        }

        function setGroupName(g, val) {
            val = clean(val);
            if (val && val !== 'Group ' + (g + 1)) state.groupCustomNames[g] = val;
            else delete state.groupCustomNames[g];
            var box = ui.grid.querySelector('.sg-group-box[data-group-index="' + g + '"] .sg-group-header');
            if (box) box.textContent = groupName(g);
        }

        /* --- set lists (built-in + yours) --- */

        function fillSetSelects() {
            var mine = readCustomSets();
            var rs = optField('role-set');
            rs.innerHTML = '<option value="">Role sets…</option><optgroup label="Suggested">' +
                ROLE_SETS.map(function (set, i) {
                    return '<option value="b' + i + '">' + esc(set.label) + ': ' + esc(set.roles.map(roleLabel).join(', ')) + '</option>';
                }).join('') + '</optgroup>' +
                (mine.roles.length ? '<optgroup label="Your sets">' + mine.roles.map(function (set, i) {
                    return '<option value="m' + i + '">★ ' + esc(set.label) + ': ' + esc(set.roles.map(roleLabel).join(', ')) + '</option>';
                }).join('') + '</optgroup>' : '');
            var th = optField('theme');
            th.innerHTML = '<option value="">Name themes…</option><option value="numbers">Group 1, Group 2 … (no names)</option>' +
                '<optgroup label="Themes">' + Object.keys(NAME_THEMES).map(function (k) {
                    return '<option value="t' + k + '">' + esc(NAME_THEMES[k].label) + ' (' + esc(NAME_THEMES[k].names.slice(0, 3).join(', ')) + ' …)</option>';
                }).join('') + '</optgroup>' +
                (mine.names.length ? '<optgroup label="Your lists">' + mine.names.map(function (set, i) {
                    return '<option value="m' + i + '">★ ' + esc(set.label) + ' (' + esc(set.names.slice(0, 3).join(', ')) + (set.names.length > 3 ? ' …' : '') + ')</option>';
                }).join('') + '</optgroup>' : '');
            updateDeleteButtons();
        }

        function roleLabel(r) { var info = roleInfo(r); return (info.icon ? info.icon + ' ' : '') + info.name; }

        function updateDeleteButtons() {
            opt.body.querySelector('[data-o="role-del"]').hidden = optField('role-set').value.charAt(0) !== 'm';
            opt.body.querySelector('[data-o="names-del"]').hidden = optField('theme').value.charAt(0) !== 'm';
        }

        function askSetName(what, suggestion) {
            var name = window.prompt('Name for this ' + what + ':', suggestion);
            return name == null ? null : (clean(name).slice(0, 40) || suggestion);
        }

        function onOptionsClick(e) {
            var b = e.target.closest('[data-o]');
            if (!b || b.disabled) return;
            var i = +b.getAttribute('data-i');
            var mine;
            switch (b.getAttribute('data-o')) {
                case 'role-add':
                    if (state.roles.length >= MAX_ROLES) return;
                    state.roles.push('Role ' + (state.roles.length + 1));
                    rolesChanged(true);
                    var inputs = optField('role-rows').querySelectorAll('[data-o-field="role-name"]');
                    if (inputs.length) { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); }
                    break;
                case 'role-up':
                case 'role-down':
                    var j = b.getAttribute('data-o') === 'role-up' ? i - 1 : i + 1;
                    if (j < 0 || j >= state.roles.length) return;
                    var t = state.roles[i]; state.roles[i] = state.roles[j]; state.roles[j] = t;
                    rolesChanged(true);
                    break;
                case 'role-remove':
                    if (state.roles.length <= 1) return;
                    state.roles.splice(i, 1);
                    rolesChanged(true);
                    break;
                case 'rotate': rotateRoles(); optFeedback('Roles rotated.'); break;
                case 'role-set':
                    var pick = optField('role-set').value;
                    if (!pick) { optFeedback('Choose a role set from the list first.', true); return; }
                    var set = pick.charAt(0) === 'b' ? ROLE_SETS[+pick.slice(1)] : readCustomSets().roles[+pick.slice(1)];
                    if (!set) return;
                    state.roles = parseRoles(set.roles.join(','));
                    state.roleOffset = 0;
                    rolesChanged(true);
                    optFeedback('Using ' + set.label + ': ' + state.roles.map(roleLabel).join(', ') + '.');
                    break;
                case 'role-save':
                    var label = askSetName('role set', 'My roles');
                    if (label == null) return;
                    mine = readCustomSets();
                    mine.roles = mine.roles.filter(function (x) { return x.label !== label; });
                    mine.roles.push({ label: label, roles: state.roles.slice() });
                    if (!writeCustomSets(mine)) { optFeedback('This browser would not save it (storage is blocked).', true); return; }
                    fillSetSelects();
                    optFeedback('Saved "' + label + '". It is now in the role sets list on every planner in this browser.');
                    break;
                case 'role-del':
                    mine = readCustomSets();
                    var ri = +optField('role-set').value.slice(1);
                    if (!mine.roles[ri] || !window.confirm('Delete your role set "' + mine.roles[ri].label + '"?')) return;
                    var gone = mine.roles.splice(ri, 1)[0];
                    writeCustomSets(mine);
                    fillSetSelects();
                    optFeedback('Deleted "' + gone.label + '".');
                    break;
                case 'names-apply':
                    var th = optField('theme').value;
                    if (!th) { optFeedback('Choose a theme or list first.', true); return; }
                    if (th === 'numbers') state.groupCustomNames = {};
                    else if (th.charAt(0) === 't') state.groupCustomNames = themeNames(th.slice(1), MAX_GROUPS);
                    else {
                        var ns = readCustomSets().names[+th.slice(1)];
                        if (!ns) return;
                        state.groupCustomNames = {};
                        ns.names.forEach(function (n, k) { if (clean(n)) state.groupCustomNames[k] = clean(n); });
                    }
                    for (var g = 0; g < groupCount(); g++) setGroupName(g, state.groupCustomNames[g] || '');
                    save();
                    renderNameRows();
                    optFeedback(th === 'numbers' ? 'Groups are numbered again.' : 'Group names updated.');
                    break;
                case 'names-save':
                    var names = [];
                    for (var k = 0; k < groupCount(); k++) names.push(groupName(k));
                    if (!Object.keys(state.groupCustomNames).length) { optFeedback('Type some group names first, then save them.', true); return; }
                    var nlabel = askSetName('list of group names', 'My group names');
                    if (nlabel == null) return;
                    mine = readCustomSets();
                    mine.names = mine.names.filter(function (x) { return x.label !== nlabel; });
                    mine.names.push({ label: nlabel, names: names });
                    if (!writeCustomSets(mine)) { optFeedback('This browser would not save it (storage is blocked).', true); return; }
                    fillSetSelects();
                    optFeedback('Saved "' + nlabel + '". It is now in the group names list on every planner in this browser.');
                    break;
                case 'names-del':
                    mine = readCustomSets();
                    var ni = +optField('theme').value.slice(1);
                    if (!mine.names[ni] || !window.confirm('Delete your list "' + mine.names[ni].label + '"?')) return;
                    var ngone = mine.names.splice(ni, 1)[0];
                    writeCustomSets(mine);
                    fillSetSelects();
                    optFeedback('Deleted "' + ngone.label + '".');
                    break;
            }
        }

        function onOptionsInput(e) {
            var f = e.target.getAttribute('data-o-field');
            if (f === 'role-name') {
                readRoleRow(+e.target.getAttribute('data-i'));
                rolesChanged(false);
                /* the "auto" icon follows the name as it is typed */
                var sel = e.target.parentNode.querySelector('[data-o-field="role-icon"]');
                if (sel && sel.options[0]) {
                    var auto = roleInfo(clean(e.target.value) || '?');
                    sel.options[0].textContent = (auto.icon || auto.letter || '•') + ' auto';
                }
            } else if (f === 'group-name') {
                setGroupName(+e.target.getAttribute('data-g'), e.target.value);
                save();
            }
        }

        function onOptionsChange(e) {
            var f = e.target.getAttribute('data-o-field');
            if (f === 'show-roles') {
                state.display.showRoles = e.target.checked;
                syncDisplayControls();
                refreshCards();
                save();
            } else if (f === 'role-icon') {
                readRoleRow(+e.target.getAttribute('data-i'));
                rolesChanged(false);
            } else if (f === 'role-name') {
                /* an emptied name puts the old one back (without redrawing, so a button click
                   that caused this blur still lands) */
                if (!clean(e.target.value)) e.target.value = splitRole(state.roles[+e.target.getAttribute('data-i')] || '').name;
            } else if (f === 'role-set' || f === 'theme') {
                updateDeleteButtons();
            }
        }

        /* ----- start ----- */

        defaultsFromConfig();
        load();
        build();
        updateRevertButton();
        buildModal();
        /* reopen exactly as left: saved groups if there are any, else arrange afresh */
        updateToolbar();
        if (!(savedPlacement && placeStudents(savedPlacement))) autoArrange(state.sortMode);
        savedPlacement = null;
        persistReady = true;
    }

    /* One print window; each planner on its own page. */
    function openPrintWindow(title, sections) {
        var body = sections.map(function (sec) {
            return '<section class="sg-page ' + sec.classes + '">' + sec.html + '</section>';
        }).join('');
        var win = window.open('', '_blank');
        if (!win) { window.print(); return; }
        win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) +
            '</title><style>' + PRINT_CSS + '</style></head><body>' + body + '</body></html>');
        win.document.close();
        win.focus();
        setTimeout(function () { win.print(); }, 250);
    }

    /* ".. studentgroups-print::" button: prints every group planner on the page. */
    function printAll(btn) {
        var opts = {};
        try { opts = JSON.parse(btn.getAttribute('data-sg-print') || '{}'); } catch (e) { /* defaults */ }
        var sections = [];
        Array.prototype.forEach.call(document.querySelectorAll('.studentgroups[data-studentgroups]'), function (el) {
            if (typeof el.sgPrintSection !== 'function') return;
            var sec = el.sgPrintSection();
            if (opts.skipEmpty && sec.empty) return;
            sections.push(sec);
        });
        var msg = btn.parentNode.querySelector('.sg-print-all-msg');
        if (!sections.length) {
            if (msg) msg.textContent = 'There are no group planners to print on this page.';
            return;
        }
        if (msg) msg.textContent = '';
        openPrintWindow(opts.title || document.title || 'Student Groups', sections);
    }

    function initPrintButtons() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-sg-print]'), function (btn) {
            if (btn.getAttribute('data-sg-ready')) return;
            btn.setAttribute('data-sg-ready', '1');
            btn.addEventListener('click', function () { printAll(btn); });
        });
    }

    function init() {
        initPrintButtons();
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