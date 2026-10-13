"""Sphinx extension: ``seatingplan`` directive.

Embeds an interactive classroom seating plan designer in a page.

    .. seatingplan::
        :layout: 5x6
        :title: Year 8 Science

    Rows can include empty spaces in brackets, so a horseshoe is e.g.
    ``:layout: 2[6]2, 2[6]2, 2[6]2, 10``.

        Alex Smith, H11
        Sam Jones, B11
        Priya Patel, N12

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
import shutil
from pathlib import Path

from docutils import nodes
from docutils.parsers.rst import directives
from sphinx.util import logging
from sphinx.util.docutils import SphinxDirective

logger = logging.getLogger(__name__)

HERE = Path(__file__).parent
ASSETS = ("seatingplan.css", "seatingplan.js")

RULE_RE = re.compile(r"^(separate|pair|front|back|left|right|empty)\s*:\s*(.+)$", re.IGNORECASE)
RULE_TYPES = {
    "separate": "SEPARATE",
    "pair": "PAIR",
    "front": "FRONT_ROW",
    "back": "BACK_ROW",
    "left": "SIT_LEFT",
    "right": "SIT_RIGHT",
    "empty": "EMPTY_SEAT",
}
SINGLE_STUDENT_RULES = ("front", "back", "left", "right", "empty")


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


MAX_ROW_WIDTH = 24
ROW_RE = re.compile(r"(?:\[\d+\]|\d+)+")


def _normalise_row(text):
    """'[2]3[2]' -> '[2]3[2]' (2 empty spaces, 3 desks, 2 empty spaces); '6' -> 6.
    Returns (row, desks, width)."""
    text = re.sub(r"\s+", "", text)
    if not ROW_RE.fullmatch(text):
        raise ValueError
    segs = []
    for gap, desks in re.findall(r"\[(\d+)\]|(\d+)", text):
        is_gap, n = bool(gap), int(gap or desks)
        if not n:
            continue
        if segs and segs[-1][0] == is_gap:
            segs[-1][1] += n
        else:
            segs.append([is_gap, n])
    desks = sum(n for g, n in segs if not g)
    width = sum(n for _, n in segs)
    if len(segs) == 1 and not segs[0][0]:
        return segs[0][1], desks, width
    return "".join("[%d]" % n if g else str(n) for g, n in segs), desks, width


def _parse_layout(text):
    """'5x6' -> five rows of 6; '7,8,9,6' -> rows of 7, 8, 9, 6; '[2]3[2],7' -> a row of 3 desks
    with 2 empty spaces each side, then a row of 7. Gaps let you build horseshoes, aisles etc."""
    text = text.strip().lower().replace("\u00d7", "x")
    match = re.fullmatch(r"(\d+)\s*x\s*(\d+)", text)
    if match:
        parts = [match.group(2)] * int(match.group(1))  # 5x6 = 5 rows of 6
    elif "," in text or "[" in text:
        parts = [p for p in text.split(",") if p.strip()]
    else:
        parts = text.split()
    rows = []
    for part in parts:
        row, desks, width = _normalise_row(part)
        if desks < 1 or desks > 20 or width > MAX_ROW_WIDTH:
            raise ValueError
        rows.append(row)
    if not rows or len(rows) > 12:
        raise ValueError
    return rows


TABLE_CODES = {"4": "4", "6": "6w", "6w": "6w", "6d": "6d"}


def _parse_tables(text, per_row=3):
    """'6,4,6 / 4,6,4' -> [['6w','4','6w'], ['4','6w','4']]; '2x3' -> 2 rows of 3 tables of 4;
    '2x3 6d' -> tables of 6 (2 wide, 3 deep). A list without '/' wraps every per_row tables."""
    text = text.strip().lower().replace("\u00d7", "x")
    text = re.sub(r"^tables?\s*:?\s*", "", text)
    match = re.fullmatch(r"(\d+)\s*x\s*(\d+)(?:\s+(4|6|6w|6d))?", text)
    if match:
        code = TABLE_CODES[match.group(3) or "4"]
        rows = [[code] * int(match.group(2)) for _ in range(int(match.group(1)))]
    else:
        parts = text.split("/")
        rows = []
        for part in parts:
            row = [p for p in re.split(r"[,\s]+", part) if p]
            if any(p not in TABLE_CODES for p in row):
                raise ValueError
            if row:
                rows.append([TABLE_CODES[p] for p in row])
        if len(parts) == 1 and len(rows) == 1 and per_row:
            flat = rows[0]
            rows = [flat[i:i + per_row] for i in range(0, len(flat), per_row)]
    if not rows or len(rows) > 8 or any(not r or len(r) > 8 for r in rows):
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
        "mode": _choice("rows", "tables"),
        "tables-per-row": directives.positive_int,
        "roster": directives.path,
        "title": directives.unchanged,
        "fill": _choice("first", "last"),
        "sort": _choice("none", "az", "za", "homeroom", "random"),
        "one-line": directives.flag,
        "surname-initial": directives.flag,
        "hide-homeroom": directives.flag,
        "hide-badges": directives.flag,
        "ignore-rules": directives.flag,
        "limit-desk-width": directives.flag,
        "teacher-view": directives.flag,
        "storage-key": directives.unchanged,
        "class": directives.class_option,
    }

    def _warn(self, message):
        logger.warning("seatingplan: " + message, location=self.get_location())

    def run(self):
        env = self.env

        count = env.temp_data.get("seatingplan_count", 0)
        env.temp_data["seatingplan_count"] = count + 1
        storage_id = self.options.get("storage-key") or "%s#%d" % (env.docname, count)

        mode = self.options.get("mode", "rows")
        per_row = self.options.get("tables-per-row", 3)
        layout, tables = [6] * 5, None
        if mode == "tables":
            try:
                tables = _parse_tables(self.options.get("layout", "4,4,4,4 / 4,4,4,4"), per_row)
            except ValueError:
                self._warn(
                    "invalid tables :layout: %r; using 8 tables of 4. List the seats at each table "
                    "(4, 6 or 6d) with commas between tables and '/' between rows, e.g. "
                    "'6,4,6 / 4,6,4', or '2x3' for 2 rows of 3 tables of 4 (up to 8 rows of 8 tables)."
                    % self.options.get("layout")
                )
                tables = _parse_tables("4,4,4,4 / 4,4,4,4")
        else:
            try:
                layout = _parse_layout(self.options.get("layout", "5x6"))
            except ValueError:
                self._warn(
                    "invalid :layout: %r; using 5x6. Use e.g. '5x6' for 5 rows of 6 or "
                    "'7,8,9,6' for rows of 7, 8, 9 and 6 (up to 12 rows of 1-20 desks). Put empty spaces "
                    "in brackets: '[2]3[2],7' is 2 spaces, 3 desks, 2 spaces, then a row of 7."
                    % self.options.get("layout")
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
            except (OSError, ValueError, UnicodeDecodeError) as exc:
                self._warn("cannot read roster %r: %s" % (roster, exc))
            else:
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
            key = " ".join(("%s %s" % (s["firstName"], s["surname"])).split()).lower()
            if key in by_name:
                self._warn(
                    "two students are called %r; rules naming them apply to the first."
                    % ("%s %s" % (s["firstName"], s["surname"]))
                )
            by_name.setdefault(key, idx)

        def find(name, kind):
            idx = by_name.get(" ".join(name.split()).lower())
            if idx is None:
                self._warn("'%s:' rule skipped: no student called %r." % (kind, name))
            return idx

        rules = []
        for kind, body in rule_lines:
            if kind in SINGLE_STUDENT_RULES:
                a = find(body, kind)
                if a is not None:
                    rules.append({"type": RULE_TYPES[kind], "a": a, "b": None})
                continue
            # pair: 2-4 names sit side by side; separate: any number, none next to each other
            names = [n.strip() for n in body.split("|")]
            limit = (6 if mode == "tables" else 4) if kind == "pair" else None
            if len(names) < 2 or not all(names) or (limit and len(names) > limit):
                self._warn(
                    "'%s:' rule skipped: it needs %s names separated by '|'."
                    % (kind, "2 to %d" % limit if limit else "2 or more")
                )
                continue
            ids = [find(n, kind) for n in names]
            if None in ids:
                continue
            if len(set(ids)) != len(ids):
                self._warn("'%s:' rule skipped: the same student is named twice." % kind)
                continue
            group = "d%d-%d" % (count, len(rules)) if len(ids) > 2 else None
            if kind == "pair":
                links = list(zip(ids, ids[1:]))
            else:
                links = [(x, y) for i, x in enumerate(ids) for y in ids[i + 1:]]
            for x, y in links:
                rule = {"type": RULE_TYPES[kind], "a": x, "b": y}
                if group:
                    rule["g"] = group
                rules.append(rule)

        _note_doc(env)
        node = seatingplan()
        node["config"] = {
            "id": storage_id,
            "title": self.options.get("title", ""),
            "layout": layout,
            "mode": mode,
            "tables": tables,
            "tablesPerRow": per_row,
            "fill": self.options.get("fill", "first"),
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
                "limitWidth": "limit-desk-width" in self.options,
                "teacherView": "teacher-view" in self.options,
            },
            "students": students,
            "rules": rules,
        }
        node["classes"] = self.options.get("class", [])
        return [node]


class seatingplan_print(nodes.General, nodes.Element):
    pass


class SeatingPlanPrintDirective(SphinxDirective):
    """A button that prints every seating plan on the page, one plan per sheet.

        .. seatingplan-print::
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
        node = seatingplan_print()
        node["label"] = self.options.get("label") or "Print all seating plans"
        node["config"] = {
            "title": self.options.get("title", ""),
            "skipEmpty": "skip-empty" in self.options,
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


PRINTER_ICON = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
    'class="sp-btn-icon"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 '
    '2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>'
)


def visit_seatingplan_print_html(self, node):
    payload = html.escape(json.dumps(node["config"], ensure_ascii=False), quote=True)
    classes = " ".join(["seatingplan-print"] + list(node.get("classes", [])))
    self.body.append(
        '<div class="%s"><button type="button" class="sp-btn" data-sp-print="%s">%s%s</button>'
        '<span class="sp-print-all-msg" role="status"></span>'
        % (classes, payload, PRINTER_ICON, html.escape(node["label"]))
    )


def depart_seatingplan_print_html(self, node):
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


def _copy_assets(app):
    if app.builder.format != "html":
        return
    target = Path(app.outdir) / "_static"
    target.mkdir(parents=True, exist_ok=True)
    for name in ASSETS:
        source = _find_asset(name)
        if source is None:
            logger.warning(
                "seatingplan: cannot find %s next to seatingplan.py or in its _static folder; "
                "the seating plan will not display.", name
            )
            continue
        shutil.copyfile(str(source), str(target / name))


# ----------------------------------------------------------------------------
# Rebuild pages with seating plans when the css/js change, so their ?v= tags update
# ----------------------------------------------------------------------------

def _note_doc(env):
    if not hasattr(env, "seatingplan_docs"):
        env.seatingplan_docs = set()
    env.seatingplan_docs.add(env.docname)


def _assets_hash():
    import hashlib
    h = hashlib.sha1()
    for name in ASSETS:
        source = _find_asset(name)
        if source is not None:
            h.update(source.read_bytes())
    return h.hexdigest()


def purge_doc(app, env, docname):
    getattr(env, "seatingplan_docs", set()).discard(docname)


def merge_docs(app, env, docnames, other):
    if not hasattr(env, "seatingplan_docs"):
        env.seatingplan_docs = set()
    env.seatingplan_docs |= getattr(other, "seatingplan_docs", set())


def outdated_if_assets_changed(app, env, added, changed, removed):
    new_hash = _assets_hash()
    if getattr(env, "seatingplan_assets_hash", None) == new_hash:
        return []
    env.seatingplan_assets_hash = new_hash
    return sorted(getattr(env, "seatingplan_docs", set()) - set(removed))


def copy_static_files_early(app):
    """Copy the css/js into the built site's _static folder before any page is written.

    Sphinx adds ?v=<checksum> to the <script>/<link> tags from the file it finds in the
    output _static folder while writing each page. Copying first means the checksum matches
    the new file, so browsers fetch the new version instead of a cached old one.
    Done here rather than via html_static_path so conf.py is left untouched (changing it
    made Sphinx report "configuration has changed" on every build).
    """
    _copy_assets(app)


def copy_static_files(app, exception):
    """Copy again at the end in case anything replaced the files during the build."""
    if exception is None:
        _copy_assets(app)


def setup(app):
    app.add_node(
        seatingplan,
        html=(visit_seatingplan_html, depart_seatingplan_html),
        latex=(skip_seatingplan, None),
        text=(skip_seatingplan, None),
        man=(skip_seatingplan, None),
        texinfo=(skip_seatingplan, None),
    )
    app.add_node(
        seatingplan_print,
        html=(visit_seatingplan_print_html, depart_seatingplan_print_html),
        latex=(skip_seatingplan, None),
        text=(skip_seatingplan, None),
        man=(skip_seatingplan, None),
        texinfo=(skip_seatingplan, None),
    )
    app.add_directive("seatingplan", SeatingPlanDirective)
    app.add_directive("seatingplan-print", SeatingPlanPrintDirective)
    app.add_css_file("seatingplan.css")
    app.add_js_file("seatingplan.js", defer="defer")
    app.connect("builder-inited", copy_static_files_early)
    app.connect("env-purge-doc", purge_doc)
    app.connect("env-merge-info", merge_docs)
    app.connect("env-get-outdated", outdated_if_assets_changed)
    app.connect("build-finished", copy_static_files)
    return {"version": "1.0", "parallel_read_safe": True, "parallel_write_safe": True}