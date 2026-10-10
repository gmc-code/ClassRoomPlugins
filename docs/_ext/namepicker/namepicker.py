"""Sphinx extension: ``seatingplan`` directive.

Embeds an interactive classroom seating plan designer in a page.

    .. seatingplan::
       :layout: 5x6
       :roster: students.csv

       separate: Alex Smith | Sam Jones
       front: Priya Patel

The page is rendered client-side by seatingplan.js / seatingplan.css, which are
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
ASSETS = ("seatingplan.css", "seatingplan.js")

RULE_RE = re.compile(r"^(separate|pair|front|back)\s*:\s*(.+)$", re.IGNORECASE)
RULE_TYPES = {
    "separate": "SEPARATE",
    "pair": "PAIR",
    "front": "FRONT_ROW",
    "back": "BACK_ROW",
}


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


def _parse_layout(text):
    text = text.strip().lower().replace("\u00d7", "x")
    match = re.fullmatch(r"(\d+)\s*x\s*(\d+)", text)
    if match:
        rows = [int(match.group(2))] * int(match.group(1))  # 5x6 = 5 rows of 6
    else:
        rows = [int(p) for p in re.split(r"[,\s]+", text) if p]
    if not rows or len(rows) > 12 or any(n < 1 or n > 20 for n in rows):
        raise ValueError
    return rows


def _choice(*values):
    return lambda arg: directives.choice(arg, values)


# ----------------------------------------------------------------------------
# Node + directive
# ----------------------------------------------------------------------------

class seatingplan(nodes.General, nodes.Element):
    pass


class SeatingPlanDirective(SphinxDirective):
    has_content = True
    required_arguments = 0
    optional_arguments = 0
    option_spec = {
        "layout": directives.unchanged,
        "roster": directives.path,
        "title": directives.unchanged,
        "fill": _choice("first", "last"),
        "sort": _choice("none", "az", "za", "random"),
        "storage-key": directives.unchanged,
        "class": directives.class_option,
    }

    def run(self):
        env = self.env

        count = env.temp_data.get("seatingplan_count", 0)
        env.temp_data["seatingplan_count"] = count + 1
        storage_id = self.options.get("storage-key") or "%s#%d" % (env.docname, count)

        try:
            layout = _parse_layout(self.options.get("layout", "5x6"))
        except ValueError:
            raise self.error(
                "seatingplan: invalid :layout: (use e.g. '5x6' for 5 rows of 6, "
                "or '11,11,6' for rows of 11, 11 and 6)."
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
                raise self.error("seatingplan: cannot read roster %r: %s" % (roster, exc))
            students.extend(_students_from_rows(rows))

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
            by_name.setdefault(("%s %s" % (s["firstName"], s["surname"])).lower(), idx)

        def find(name):
            idx = by_name.get(" ".join(name.split()).lower())
            if idx is None:
                raise self.error("seatingplan: no student called %r in this roster." % name)
            return idx

        rules = []
        for kind, body in rule_lines:
            if kind in ("front", "back"):
                rules.append({"type": RULE_TYPES[kind], "a": find(body), "b": None})
            else:
                names = [n.strip() for n in body.split("|")]
                if len(names) != 2 or not all(names):
                    raise self.error(
                        "seatingplan: '%s:' rules need two names separated by '|'." % kind
                    )
                rules.append({"type": RULE_TYPES[kind], "a": find(names[0]), "b": find(names[1])})

        node = seatingplan()
        node["config"] = {
            "id": storage_id,
            "title": self.options.get("title", ""),
            "layout": layout,
            "fill": self.options.get("fill", "first"),
            "sort": {"none": "DEFAULT", "az": "AZ", "za": "ZA", "random": "RANDOM"}[
                self.options.get("sort", "none")
            ],
            "students": students,
            "rules": rules,
        }
        node["classes"] = self.options.get("class", [])
        return [node]


# ----------------------------------------------------------------------------
# Visitors
# ----------------------------------------------------------------------------

def visit_seatingplan_html(self, node):
    payload = html.escape(json.dumps(node["config"], ensure_ascii=False), quote=True)
    classes = " ".join(["seatingplan"] + list(node.get("classes", [])))
    self.body.append('<div class="%s" data-seatingplan="%s">' % (classes, payload))
    self.body.append("<noscript>JavaScript is required to show the seating plan.</noscript>")


def depart_seatingplan_html(self, node):
    self.body.append("</div>")


def skip_seatingplan(self, node):
    raise nodes.SkipNode


def _find_asset(name):
    """Look next to this file, then in a _static folder next to it (like noisemonitor)."""
    for base in (HERE, HERE / "_static"):
        candidate = base / name
        if candidate.is_file():
            return candidate
    return None


def add_static_files(app):
    """Hand the css/js to Sphinx's normal static-file copying (same route as html_static_path)."""
    if app.builder.format != "html":
        return
    target = Path(app.doctreedir) / "seatingplan_static"
    target.mkdir(parents=True, exist_ok=True)
    for name in ASSETS:
        source = _find_asset(name)
        if source is None:
            logger.warning(
                "seatingplan: cannot find %s next to seatingplan.py or in its _static folder; "
                "the seating plan will not display.", name
            )
            continue
        copy_asset_file(str(source), str(target))
    app.config.html_static_path.append(str(target))


def setup(app):
    app.add_node(
        seatingplan,
        html=(visit_seatingplan_html, depart_seatingplan_html),
        latex=(skip_seatingplan, None),
        text=(skip_seatingplan, None),
        man=(skip_seatingplan, None),
        texinfo=(skip_seatingplan, None),
    )
    app.add_directive("seatingplan", SeatingPlanDirective)
    app.add_css_file("seatingplan.css")
    app.add_js_file("seatingplan.js", defer="defer")
    app.connect("builder-inited", add_static_files)
    return {"version": "1.0", "parallel_read_safe": True, "parallel_write_safe": True}