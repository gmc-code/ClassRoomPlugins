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

``separate:`` (alias ``apart:``) keeps the listed students in different groups; with three or more
names every pair among them is kept apart. ``pair:`` (alias ``together:``) keeps the listed students
in the same group; three or more names form one chain. Groups are balanced, and if the rules cannot
all be met the page keeps as many as it can and says which it left out.

The page is rendered client-side by studentgroups.js / studentgroups.css, which are
copied into ``_static`` by Sphinx during an HTML build.
"""

import codecs
import csv
import html
import io
import json
import re
from pathlib import Path

from docutils import nodes
from docutils.parsers.rst import directives
from sphinx.util import logging
from sphinx.util.docutils import SphinxDirective
from sphinx.util.fileutil import copy_asset_file

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


def _normalise_row(row):
    return {
        str(k).strip().lower(): ("" if v is None else str(v).strip())
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

    def run(self):
        env = self.env

        count = env.temp_data.get("studentgroups_count", 0)
        env.temp_data["studentgroups_count"] = count + 1
        storage_id = self.options.get("storage-key") or "%s#%d" % (env.docname, count)

        group_size = _parse_group_size(
            self.options.get("size", str(DEFAULT_SIZE)),
            warn=lambda msg: logger.warning(msg, location=(self.env.docname, self.lineno)),
        )

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
            except (OSError, ValueError) as exc:
                raise self.error("studentgroups: cannot read roster %r: %s" % (roster, exc))
            students.extend(_students_from_rows(rows))
            if not students:
                logger.warning(
                    "studentgroups: roster %r has no students. It needs a header row with "
                    "Preferred (or First Name), Surname (or Last Name) and optionally Homeroom." % roster,
                    location=(self.env.docname, self.lineno),
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
            key = ("%s %s" % (s["firstName"], s["surname"])).lower()
            if key in by_name:
                logger.warning(
                    "studentgroups: more than one student is called %r; rules will use the first. "
                    "Give them different names (e.g. an initial) to tell them apart."
                    % ("%s %s" % (s["firstName"], s["surname"])),
                    location=(self.env.docname, self.lineno),
                )
            by_name.setdefault(key, idx)

        def find(name):
            idx = by_name.get(" ".join(name.split()).lower())
            if idx is None:
                raise self.error("studentgroups: no student called %r in this roster." % name)
            return idx

        rules = []
        for kind, body in rule_lines:
            names = [n.strip() for n in body.split("|")]
            if len(names) < 2 or not all(names):
                raise self.error(
                    "studentgroups: '%s:' rules need at least two names separated by '|'." % kind
                )
            indexes = [find(n) for n in names]
            if len(set(indexes)) != len(indexes):
                raise self.error("studentgroups: '%s:' lists the same student twice." % kind)
            rule_type = RULE_TYPES[kind]
            if rule_type == "PAIR":
                # a | b | c  ->  a-b and b-c (one chain, treated as a single block)
                links = list(zip(indexes, indexes[1:]))
            else:
                # every pair among the listed students must be kept apart
                links = [(x, y) for i, x in enumerate(indexes) for y in indexes[i + 1:]]
            for a, b in links:
                rules.append({"type": rule_type, "a": a, "b": b})

        for problem in _rule_problems(rules, group_size):
            logger.warning(
                "studentgroups: " + problem,
                location=(self.env.docname, self.lineno),
            )

        node = studentgroups()
        node["config"] = {
            "id": storage_id,
            "title": self.options.get("title", "Student Groups"),
            "groupSize": group_size,
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
            },
            "students": students,
            "rules": rules,
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


def skip_studentgroups(self, node):
    raise nodes.SkipNode


def _find_asset(name):
    for base in (HERE, HERE / "_static"):
        candidate = base / name
        if candidate.is_file():
            return candidate
    return None


def add_static_files(app):
    if app.builder.format != "html":
        return
    target = Path(app.doctreedir) / "studentgroups_static"
    target.mkdir(parents=True, exist_ok=True)
    for name in ASSETS:
        source = _find_asset(name)
        if source is None:
            logger.warning(
                "studentgroups: cannot find %s next to studentgroups.py or in its _static folder; "
                "the group planner will not display.", name
            )
            continue
        copy_asset_file(str(source), str(target))
    app.config.html_static_path.append(str(target))


def setup(app):
    app.add_node(
        studentgroups,
        html=(visit_studentgroups_html, depart_studentgroups_html),
        latex=(skip_studentgroups, None),
        text=(skip_studentgroups, None),
        man=(skip_studentgroups, None),
        texinfo=(skip_studentgroups, None),
    )
    app.add_directive("studentgroups", StudentGroupsDirective)
    app.add_css_file("studentgroups.css")
    app.add_js_file("studentgroups.js", defer="defer")
    app.connect("builder-inited", add_static_files)
    return {"version": "1.0", "parallel_read_safe": True, "parallel_write_safe": True}