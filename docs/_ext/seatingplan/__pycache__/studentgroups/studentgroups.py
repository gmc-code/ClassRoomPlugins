"""Sphinx extension: ``studentgroups`` directive.

Embeds an interactive student group planner and randomizer in a page.

    .. studentgroups::
       :size: 4
       :roster: students.csv
       :title: Science Project Teams
       :one-line:
       :hide-badges:

       separate: Alex Smith | Sam Jones
       pair: Priya Patel | Maya Singh | Tom Lee

``:sizes: 3,3,3,4,4,5,6`` gives each group its own number of places instead of ``:size:``
(``3x4, 5`` means three groups of 4 and one of 5). On the page the sizes appear in an editable box
next to the size buttons; picking a size button fills the box so it can be tweaked and re-applied.

``separate:`` (alias ``apart:``) keeps the listed students in different groups; with three or more
names every pair among them is kept apart. ``pair:`` (alias ``together:``) keeps the listed students
in the same group; three or more names form one chain. Groups are balanced, and if the rules cannot
all be met the page keeps as many as it can and says which it left out. Rules written on one line
show as one numbered group in the Rules panel. A rule naming an unknown student is skipped with a
warning rather than stopping the build.

``:roles: Leader, Scribe, Timekeeper, Materials`` (or a suggested set by name: ``classic``,
``science lab``, ``discussion``, ``pair programming``, ``maths``, ``reading circle``,
``project team``, ``encourager``; start a role with an emoji to choose its icon, e.g.
``🔬 Investigator, 📋 Recorder``) shows a role on each student in a group (in slot
order; Rotate Roles moves them along); ``:show-roles:`` does the same with those default roles.
``:number-students:`` numbers the students 1, 2, 3 … in each group (also a checkbox on the page).
``:align-left:`` lines names up on the left of each card (centred otherwise), and ``:large-icons:``
doubles the size of the role icons and numbers (both are also checkboxes on the page).
``:group-names: elements`` names the groups after a theme (``elements``, ``planets``,
``scientists``, ``colours``), or give a comma list of names.

On the page, Attendance marks students away for today (they are left out of the groups), the
padlock on a card (or a group's name) locks students in place when regrouping, and Import JSON also
accepts a seating plan file, turning its tables (or rows) into groups.

``.. studentgroups-print::`` adds a button that prints every planner on the page, one per sheet
(options ``:label:``, ``:title:``, ``:skip-empty:``).

Export JSON saves the whole plan (title, roster, rules, group size, group names, display options
and who is in which group); Import JSON loads it back, and Revert returns to the last imported or
exported file. The browser also keeps the plan, so the page reopens exactly as it was left.

The page is rendered client-side by studentgroups.js / studentgroups.css, which are
copied into ``_static`` by Sphinx during an HTML build.
"""

import codecs
import csv
import html
import io
import json
import re
import shutil
from pathlib import Path

from docutils import nodes
from docutils.parsers.rst import directives
from sphinx.util import logging
from sphinx.util.docutils import SphinxDirective

logger = logging.getLogger(__name__)

HERE = Path(__file__).parent
ASSETS = ("studentgroups.css", "studentgroups.js")

RULE_RE = re.compile(r"^(separate|apart|pair|together)\s*:\s*(.+)$", re.IGNORECASE)
RULE_TYPES = {
    "separate": "SEPARATE",
    "apart": "SEPARATE",
    "pair": "PAIR",
    "together": "PAIR",
}
MIN_SIZE, MAX_SIZE, DEFAULT_SIZE = 2, 10, 4


# ----------------------------------------------------------------------------
# Roster reading
# ----------------------------------------------------------------------------

def _read_csv(path):
    raw = Path(path).read_bytes()
    if raw.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        text = raw.decode("utf-16")
    else:
        text = raw.decode("utf-8-sig")
    try:
        dialect = csv.Sniffer().sniff(text[:2048], delimiters=",\t;")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    return list(reader)


def _read_xlsx(path):
    try:
        import openpyxl
    except ImportError:
        raise ValueError(
            "Reading .xlsx rosters at build time needs openpyxl "
            "(pip install openpyxl). Alternatively export the sheet as CSV."
        )
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = list(workbook.worksheets[0].iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    return [dict(zip(headers, row)) for row in rows[1:]]


def _cell_text(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)  # Excel stores 11 as 11.0
    return str(v).strip()


def _normalise_row(row):
    return {
        str(k).strip().lower(): _cell_text(v)
        for k, v in row.items()
        if k is not None
    }


def _students_from_rows(rows):
    students = []
    for row in rows:
        r = _normalise_row(row)
        if not any(r.values()):
            continue
        first = r.get("preferred") or r.get("first name") or r.get("firstname") or "Student"
        surname = (
            r.get("surname") or r.get("last name") or r.get("lastname")
            or str(len(students) + 1)
        )
        students.append(
            {"firstName": first, "surname": surname, "homeroom": r.get("homeroom", "")}
        )
    return students


def _parse_group_size(text, warn=None):
    """Return a valid group size, calling ``warn(message)`` if the value had to be replaced."""
    try:
        val = int(str(text).strip())
    except (ValueError, TypeError):
        val = None
    if val is None or val < MIN_SIZE or val > MAX_SIZE:
        if warn:
            warn(
                "studentgroups: :size: %r is not a whole number from %d to %d; using %d."
                % (text, MIN_SIZE, MAX_SIZE, DEFAULT_SIZE)
            )
        return DEFAULT_SIZE
    return val


MAX_GROUPS = 40
NAME_THEMES = ("elements", "planets", "scientists", "colours")
# :roles: can name one of the suggested sets instead of listing roles (same sets as the page)
ROLE_SETS = {
    "classic": ["Leader", "Scribe", "Timekeeper", "Materials"],
    "science lab": ["Investigator", "Recorder", "Equipment", "Safety officer", "Reporter"],
    "discussion": ["Facilitator", "Note-taker", "Spokesperson", "Questioner", "Challenger"],
    "pair programming": ["Driver", "Navigator", "Tester", "Researcher"],
    "maths": ["Strategist", "Calculator", "Checker", "Presenter"],
    "reading circle": ["Reader", "Summariser", "Word finder", "Connector", "Illustrator"],
    "project team": ["Project manager", "Designer", "Builder", "Data analyst", "Presenter"],
    "encourager": ["Leader", "Encourager", "Checker", "Reporter"],
}
ROLE_SET_ALIASES = {"science": "science lab", "lab": "science lab", "coding": "pair programming",
                    "microbit": "pair programming", "micro:bit": "pair programming", "programming": "pair programming",
                    "maths problem solving": "maths", "math": "maths", "reading": "reading circle",
                    "project": "project team", "default": "classic"}
NAME_THEME_ALIASES = {"element": "elements", "planet": "planets", "moons": "planets", "scientist": "scientists",
                      "colour": "colours", "color": "colours", "colors": "colours", "numbers": None}


def _parse_sizes(text):
    """'3,3,3,4,4,5,6' -> [3,3,3,4,4,5,6]; '3x4, 5' -> [4,4,4,5] (3 groups of 4, then 5).
    Raises ValueError if it is not a list of group sizes from 1 to MAX_SIZE."""
    parts = [p for p in re.split(r"[,;\s]+", str(text).strip().lower().replace("\u00d7", "x")) if p]
    sizes = []
    for part in parts:
        match = re.fullmatch(r"(?:(\d+)x)?(\d+)", part)
        if not match:
            raise ValueError
        times, size = int(match.group(1) or 1), int(match.group(2))
        if times < 1 or not 1 <= size <= MAX_SIZE:
            raise ValueError
        sizes.extend([size] * times)
        if len(sizes) > MAX_GROUPS:
            raise ValueError
    if not sizes:
        raise ValueError
    return sizes


def _rule_problems(rules, size):
    """Return build-time warnings for rule sets that can never be satisfied."""
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for r in rules:
        if r["type"] == "PAIR":
            parent[find(r["a"])] = find(r["b"])
    sizes = {}
    for key in list(parent):
        root = find(key)
        sizes[root] = sizes.get(root, 0) + 1
    problems = []
    for root, count in sizes.items():
        if count > size:
            problems.append(
                "%d students are linked by 'pair' rules but groups only hold %d, "
                "so some of those rules will be dropped." % (count, size)
            )
    for r in rules:
        if r["type"] == "SEPARATE" and find(r["a"]) == find(r["b"]):
            problems.append(
                "a 'separate' rule joins two students who are also linked by 'pair' rules; "
                "it cannot be met."
            )
    return problems


def _choice(*values):
    return lambda arg: directives.choice(arg, values)


# ----------------------------------------------------------------------------
# Node + directive
# ----------------------------------------------------------------------------

class studentgroups(nodes.General, nodes.Element):
    pass


class StudentGroupsDirective(SphinxDirective):
    has_content = True
    required_arguments = 0
    optional_arguments = 0
    option_spec = {
        "size": directives.unchanged,
        "sizes": directives.unchanged,
        "roles": directives.unchanged,
        "show-roles": directives.flag,
        "number-students": directives.flag,
        "align-left": directives.flag,
        "large-icons": directives.flag,
        "group-names": directives.unchanged,
        "roster": directives.path,
        "title": directives.unchanged,
        "sort": _choice("none", "az", "za", "homeroom", "random"),
        "one-line": directives.flag,
        "surname-initial": directives.flag,
        "hide-homeroom": directives.flag,
        "hide-badges": directives.flag,
        "ignore-rules": directives.flag,
        "storage-key": directives.unchanged,
        "class": directives.class_option,
    }

    def _warn(self, message):
        logger.warning("studentgroups: " + message, location=self.get_location())

    def run(self):
        env = self.env

        count = env.temp_data.get("studentgroups_count", 0)
        env.temp_data["studentgroups_count"] = count + 1
        storage_id = self.options.get("storage-key") or "%s#%d" % (env.docname, count)

        # :sizes: 3,3,3,4,4,5,6 gives each group its own size (a list in :size: works too)
        group_sizes = None
        sizes_text = self.options.get("sizes")
        if sizes_text is None and re.search(r"[,;x\u00d7]|\d\s+\d", self.options.get("size", "")):
            sizes_text = self.options.pop("size")
        if sizes_text is not None:
            try:
                group_sizes = _parse_sizes(sizes_text)
            except ValueError:
                self._warn(
                    "invalid :sizes: %r; using groups of one size. List the students in each group, "
                    "e.g. '3,3,3,4,4,5,6', or '3x4, 5' for 3 groups of 4 and a group of 5 "
                    "(1 to %d students per group, up to %d groups)." % (sizes_text, MAX_SIZE, MAX_GROUPS)
                )
        if "size" in self.options or group_sizes is None:
            group_size = _parse_group_size(
                self.options.get("size", str(DEFAULT_SIZE)),
                warn=lambda msg: logger.warning(msg, location=self.get_location()),
            )
        else:
            # the size buttons start from the most common size in the list
            group_size = max(set(group_sizes), key=lambda x: (group_sizes.count(x), x))
            group_size = min(max(group_size, MIN_SIZE), MAX_SIZE)

        students = []
        roster = self.options.get("roster")
        if roster:
            _, abspath = env.relfn2path(roster)
            env.note_dependency(abspath)
            try:
                if abspath.lower().endswith((".xlsx", ".xlsm")):
                    rows = _read_xlsx(abspath)
                else:
                    rows = _read_csv(abspath)
            except (OSError, ValueError, UnicodeDecodeError) as exc:
                self._warn("cannot read roster %r: %s" % (roster, exc))
            else:
                students.extend(_students_from_rows(rows))
                if not students:
                    self._warn(
                        "roster %r has no students. It needs a header row with Preferred (or "
                        "First Name), Surname (or Last Name) and optionally Homeroom." % roster
                    )

        rule_lines = []
        for line in self.content:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            match = RULE_RE.match(line)
            if match:
                rule_lines.append((match.group(1).lower(), match.group(2).strip()))
                continue
            name, _, homeroom = line.partition(",")
            parts = name.split(None, 1)
            if not parts:
                continue
            students.append(
                {
                    "firstName": parts[0],
                    "surname": parts[1] if len(parts) > 1 else str(len(students) + 1),
                    "homeroom": homeroom.strip(),
                }
            )

        by_name = {}
        for idx, s in enumerate(students):
            key = " ".join(("%s %s" % (s["firstName"], s["surname"])).split()).lower()
            if key in by_name:
                logger.warning(
                    "studentgroups: more than one student is called %r; rules will use the first. "
                    "Give them different names (e.g. an initial) to tell them apart."
                    % ("%s %s" % (s["firstName"], s["surname"])),
                    location=(self.env.docname, self.lineno),
                )
            by_name.setdefault(key, idx)

        def find(name, kind):
            idx = by_name.get(" ".join(name.split()).lower())
            if idx is None:
                self._warn("'%s:' rule skipped: no student called %r." % (kind, name))
            return idx

        rules = []
        for kind, body in rule_lines:
            names = [n.strip() for n in body.split("|")]
            if len(names) < 2 or not all(names):
                self._warn("'%s:' rule skipped: it needs 2 or more names separated by '|'." % kind)
                continue
            ids = [find(n, kind) for n in names]
            if None in ids:
                continue
            if len(set(ids)) != len(ids):
                self._warn("'%s:' rule skipped: the same student is named twice." % kind)
                continue
            rule_type = RULE_TYPES[kind]
            # rules written on one line show (and edit) as one group in the Rules panel
            group = "d%d-%d" % (count, len(rules)) if len(ids) > 2 else None
            if rule_type == "PAIR":
                # a | b | c  ->  a-b and b-c (one chain, treated as a single block)
                links = list(zip(ids, ids[1:]))
            else:
                # every pair among the listed students must be kept apart
                links = [(x, y) for i, x in enumerate(ids) for y in ids[i + 1:]]
            for a, b in links:
                rule = {"type": rule_type, "a": a, "b": b}
                if group:
                    rule["g"] = group
                rules.append(rule)

        for problem in _rule_problems(rules, max(group_sizes) if group_sizes else group_size):
            self._warn(problem)

        # roles: ":roles: Leader, Scribe, Timekeeper" (shown), or ":show-roles:" for the defaults
        roles = None
        roles_text = (self.options.get("roles") or "").strip()
        if roles_text:
            key = " ".join(roles_text.lower().split())
            key = ROLE_SET_ALIASES.get(key, key)
            if "," not in roles_text and ";" not in roles_text and key in ROLE_SETS:
                roles = list(ROLE_SETS[key])
            else:
                roles = [r.strip()[:30] for r in re.split(r"[,;]", roles_text) if r.strip()][:10]
        show_roles = bool(roles) or "show-roles" in self.options

        # group names: a theme (elements, planets, scientists, colours) or a comma list
        group_names = None
        names_text = (self.options.get("group-names") or "").strip()
        if names_text:
            theme = names_text.lower().replace("&", "and").split()[0].rstrip(",")
            theme = NAME_THEME_ALIASES.get(theme, theme)
            if "," not in names_text and theme is None:
                group_names = None          # "numbers": Group 1, Group 2 ...
            elif theme in NAME_THEMES and "," not in names_text:
                group_names = {"theme": theme}
            else:
                group_names = {"list": [n.strip()[:80] for n in names_text.split(",")]}

        _note_doc(env)
        node = studentgroups()
        node["config"] = {
            "id": storage_id,
            "title": self.options.get("title", "Student Groups"),
            "groupSize": group_size,
            "groupSizes": group_sizes,
            "roles": roles,
            "groupNames": group_names,
            "sort": {
                "none": "DEFAULT", "az": "AZ", "za": "ZA",
                "homeroom": "HOMEROOM", "random": "RANDOM",
            }[self.options.get("sort", "none")],
            "display": {
                "oneLine": "one-line" in self.options,
                "surnameInitial": "surname-initial" in self.options,
                "homeroom": "hide-homeroom" not in self.options,
                "hideBadges": "hide-badges" in self.options,
                "ignoreRules": "ignore-rules" in self.options,
                "showRoles": show_roles,
                "numberStudents": "number-students" in self.options,
                "alignLeft": "align-left" in self.options,
                "bigIcons": "large-icons" in self.options,
            },
            "students": students,
            "rules": rules,
        }
        node["classes"] = self.options.get("class", [])
        return [node]


class studentgroups_print(nodes.General, nodes.Element):
    pass


class StudentGroupsPrintDirective(SphinxDirective):
    """A button that prints every group planner on the page, one planner per sheet.

        .. studentgroups-print::
           :label: Print all classes
           :skip-empty:
    """

    has_content = False
    option_spec = {
        "label": directives.unchanged,
        "title": directives.unchanged,
        "skip-empty": directives.flag,
        "class": directives.class_option,
    }

    def run(self):
        _note_doc(self.env)
        node = studentgroups_print()
        node["label"] = self.options.get("label") or "Print all groups"
        node["config"] = {
            "title": self.options.get("title", ""),
            "skipEmpty": "skip-empty" in self.options,
        }
        node["classes"] = self.options.get("class", [])
        return [node]


# ----------------------------------------------------------------------------
# Visitors
# ----------------------------------------------------------------------------

def visit_studentgroups_html(self, node):
    payload = html.escape(json.dumps(node["config"], ensure_ascii=False), quote=True)
    classes = " ".join(["studentgroups"] + list(node.get("classes", [])))
    self.body.append('<div class="%s" data-studentgroups="%s">' % (classes, payload))
    self.body.append("<noscript>JavaScript is required to show the group planner.</noscript>")


def depart_studentgroups_html(self, node):
    self.body.append("</div>")


PRINTER_ICON = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
    'class="sg-btn-icon"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 '
    '2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>'
)


def visit_studentgroups_print_html(self, node):
    payload = html.escape(json.dumps(node["config"], ensure_ascii=False), quote=True)
    classes = " ".join(["studentgroups-print"] + list(node.get("classes", [])))
    self.body.append(
        '<div class="%s"><button type="button" class="sg-btn" data-sg-print="%s">%s%s</button>'
        '<span class="sg-print-all-msg" role="status"></span>'
        % (classes, payload, PRINTER_ICON, html.escape(node["label"]))
    )


def depart_studentgroups_print_html(self, node):
    self.body.append("</div>")


def skip_studentgroups(self, node):
    raise nodes.SkipNode


def _find_asset(name):
    for base in (HERE, HERE / "_static"):
        candidate = base / name
        if candidate.is_file():
            return candidate
    return None


def _copy_assets(app):
    if app.builder.format != "html":
        return
    target = Path(app.outdir) / "_static"
    target.mkdir(parents=True, exist_ok=True)
    for name in ASSETS:
        source = _find_asset(name)
        if source is None:
            logger.warning(
                "studentgroups: cannot find %s next to studentgroups.py or in its _static folder; "
                "the group planner will not display.", name
            )
            continue
        shutil.copyfile(str(source), str(target / name))


# ----------------------------------------------------------------------------
# Rebuild pages with group planners when the css/js change, so their ?v= tags update
# ----------------------------------------------------------------------------

def _note_doc(env):
    if not hasattr(env, "studentgroups_docs"):
        env.studentgroups_docs = set()
    env.studentgroups_docs.add(env.docname)


def _assets_hash():
    import hashlib
    h = hashlib.sha1()
    for name in ASSETS:
        source = _find_asset(name)
        if source is not None:
            h.update(source.read_bytes())
    return h.hexdigest()


def purge_doc(app, env, docname):
    getattr(env, "studentgroups_docs", set()).discard(docname)


def merge_docs(app, env, docnames, other):
    if not hasattr(env, "studentgroups_docs"):
        env.studentgroups_docs = set()
    env.studentgroups_docs |= getattr(other, "studentgroups_docs", set())


def outdated_if_assets_changed(app, env, added, changed, removed):
    new_hash = _assets_hash()
    if getattr(env, "studentgroups_assets_hash", None) == new_hash:
        return []
    env.studentgroups_assets_hash = new_hash
    return sorted(getattr(env, "studentgroups_docs", set()) - set(removed))


def copy_static_files_early(app):
    """Copy the css/js into the built site's _static folder before any page is written, so
    the ?v=<checksum> Sphinx adds to the tags matches the new files and browsers don't keep
    using a cached old copy. Done here rather than via html_static_path so conf.py is
    left untouched."""
    _copy_assets(app)


def copy_static_files(app, exception):
    """Copy again at the end in case anything replaced the files during the build."""
    if exception is None:
        _copy_assets(app)


def setup(app):
    app.add_node(
        studentgroups,
        html=(visit_studentgroups_html, depart_studentgroups_html),
        latex=(skip_studentgroups, None),
        text=(skip_studentgroups, None),
        man=(skip_studentgroups, None),
        texinfo=(skip_studentgroups, None),
    )
    app.add_node(
        studentgroups_print,
        html=(visit_studentgroups_print_html, depart_studentgroups_print_html),
        latex=(skip_studentgroups, None),
        text=(skip_studentgroups, None),
        man=(skip_studentgroups, None),
        texinfo=(skip_studentgroups, None),
    )
    app.add_directive("studentgroups", StudentGroupsDirective)
    app.add_directive("studentgroups-print", StudentGroupsPrintDirective)
    app.add_css_file("studentgroups.css")
    app.add_js_file("studentgroups.js", defer="defer")
    app.connect("builder-inited", copy_static_files_early)
    app.connect("env-purge-doc", purge_doc)
    app.connect("env-merge-info", merge_docs)
    app.connect("env-get-outdated", outdated_if_assets_changed)
    app.connect("build-finished", copy_static_files)
    return {"version": "1.0", "parallel_read_safe": True, "parallel_write_safe": True}