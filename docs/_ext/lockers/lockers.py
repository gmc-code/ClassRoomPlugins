"""Sphinx extension: ``lockers`` directive.

Embeds an interactive locker allocation tool in a page: set up banks of lockers
from number ranges, then give each student a locker by typing, pasting, dragging
or auto-allocating.

    .. lockers::
        :title: Year 7 lockers
        :lockers: Corridor A: 101-140; Corridor B: 201-240
        :tiers: 2

        Alex Smith, H11
        Sam Jones, B11 = 105
        Priya Patel, N12 = 106

        unavailable: 112, 118-120
        year 7: Corridor A, 201-210

After a bank's ranges, ``| options`` give it its own shape: ``2 high``,
``down``/``across``, ``right`` (numbers start at the right-hand end) and
``bottom`` (first locker in the bottom row). ``:start:``, ``:first-row:``,
``:tiers:`` and ``:order:`` set the defaults for every bank. In the content,
``[Corridor A]`` (or ``area: Corridor A``) starts an area: the banks after it
are shown side by side under that heading.

``year 7: Corridor A, 201-210`` keeps lockers for a year level (bank or area
names, ranges or single lockers; ``Corridor A top``, ``Corridor A bottom`` or
``Corridor A row 2`` for one row): A–Z, Homeroom and Random only put Year 7
students in them. Teachers can change this on the page with **Year levels**.

Locker ranges: ``101-140``, ``A1-A30`` (or ``A1-30``), ``001-060`` (keeps the
zeros) or single numbers, separated by commas. Banks are separated by ``;`` in
``:lockers:``, or written one per line in the content as ``bank: Name: 101-140``.

The page is rendered client-side by lockers.js / lockers.css, which are copied
into ``_static`` by Sphinx during an HTML build.
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
ASSETS = ("lockers.css", "lockers.js")

MAX_RANGE = 1000      # lockers in one range, e.g. 1-1000
MAX_LOCKERS = 2000    # lockers in one tool

RANGE_RE = re.compile(r"^([A-Za-z]*)(\d+)\s*[-–]\s*([A-Za-z]*)(\d+)$")
SINGLE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9./]*$")
BANK_LINE_RE = re.compile(r"^bank\s*:\s*(.+)$", re.IGNORECASE)
AREA_LINE_RE = re.compile(r"^(?:area\s*:\s*(.+)|\[(.*)\])$", re.IGNORECASE)
YEAR_LINE_RE = re.compile(r"^(?:year|yr|y)\s*(\d{1,2})\s*:\s*(.+)$", re.IGNORECASE)
OUT_LINE_RE = re.compile(r"^(?:unavailable|out|broken)\s*:\s*(.+)$", re.IGNORECASE)


# ----------------------------------------------------------------------------
# Locker ranges (kept in step with expandSpec() in lockers.js)
# ----------------------------------------------------------------------------

def _expand_item(item):
    """'101-105' -> ['101', ..., '105']; 'A1-A3' -> ['A1', 'A2', 'A3']; '007-009' keeps zeros."""
    item = item.strip()
    m = RANGE_RE.match(item)
    if m:
        prefix, start, prefix2, end = m.groups()
        if prefix2 and prefix2.lower() != prefix.lower():
            raise ValueError("%r: both ends need the same letters" % item)
        a, b = int(start), int(end)
        if abs(b - a) + 1 > MAX_RANGE:
            raise ValueError("%r: a range can hold at most %d lockers" % (item, MAX_RANGE))
        width = len(start) if (start.startswith("0") and len(start) > 1) else 0
        step = 1 if b >= a else -1
        return ["%s%s" % (prefix, str(n).zfill(width)) for n in range(a, b + step, step)]
    if SINGLE_RE.match(item):
        return [item]
    raise ValueError("%r is not a locker number or range" % item)


def expand_spec(spec):
    ids = []
    for item in spec.split(","):
        if item.strip():
            ids.extend(_expand_item(item))
    return ids


def _bank_opts(text):
    """'2 high across right' -> {'tiers': 2, 'order': 'across', 'side': 'right', 'row': ''}.
    Kept in step with parseBankOpts() in lockers.js."""
    o = {"tiers": 0, "order": "", "side": "", "row": ""}
    t = re.sub(r"\btiers?\s*(\d)", r"\1high", text.lower())
    t = re.sub(r"(\d)\s*(high|tiers?)\b", r"\1high", t)
    for word in re.split(r"[\s,]+", t.strip()):
        m = re.fullmatch(r"(\d)high", word)
        if word in ("left", "right"):
            o["side"] = word
        elif word in ("top", "bottom"):
            o["row"] = word
        elif word in ("down", "across"):
            o["order"] = word
        elif m and 1 <= int(m.group(1)) <= 6:
            o["tiers"] = int(m.group(1))
        elif word:
            raise ValueError("unknown option %r (use e.g. 2 high, across, down, right, bottom)" % word)
    return o


def _split_bank(text):
    """'A3: 543-550 | 2 high right' -> ('A3', '543-550', {options}).

    Options after '|': N high (tiers), down/across, left/right (which end the
    numbers start from) and top/bottom (which row the first locker is in)."""
    text, _, opts = text.partition("|")
    o = _bank_opts(opts)
    name, sep, spec = text.partition(":")
    if not sep:
        return "", text.strip(), o
    return name.strip(), spec.strip(), o


# ----------------------------------------------------------------------------
# Roster reading (same column names as the seatingplan directive, plus Locker)
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
    return list(csv.DictReader(io.StringIO(text), dialect=dialect))


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
        v = int(v)  # Excel stores 105 as 105.0
    return str(v).strip()


def _students_from_rows(rows):
    students = []
    for row in rows:
        r = {str(k).strip().lower(): _cell_text(v) for k, v in row.items() if k is not None}
        first = r.get("preferred") or r.get("first name") or r.get("firstname") or ""
        surname = r.get("surname") or r.get("surname name") or r.get("last name") or r.get("lastname") or ""
        if not first and not surname:
            continue
        students.append({
            "firstName": first or "Student",
            "surname": surname or str(len(students) + 1),
            "homeroom": r.get("homeroom") or r.get("home room") or r.get("home group") or r.get("homegroup") or r.get("form") or "",
            "year": r.get("year") or r.get("year level") or r.get("yr") or r.get("yr level") or r.get("year group") or r.get("grade") or "",
            "locker": r.get("locker") or r.get("locker number") or r.get("locker no") or "",
            "combo": r.get("locker combo") or r.get("combo") or r.get("combination") or r.get("lock combo") or "",
            # every other column (TG, House ...) is kept as extra information
            "extra": {str(k).strip(): _cell_text(v) for k, v in row.items()
                      if k is not None and str(k).strip()
                      and str(k).strip().lower() not in KNOWN_COLS and _cell_text(v)},
        })
    return students


KNOWN_COLS = {
    "preferred", "first name", "firstname", "given name", "surname", "last name", "lastname",
    "family name", "surname name", "locker combo", "combo", "combination", "lock combo",
    "locker combination", "lock combination", "locker", "locker number", "locker no", "locker #", "status", "homeroom",
    "home room", "form", "bank", "student", "home group", "homegroup", "year", "year level", "yr",
    "yr level", "year group", "grade",
}


def _choice(*values):
    return lambda arg: directives.choice(arg, values)


def _tiers(arg):
    value = directives.positive_int(arg)
    if value > 6:
        raise ValueError("tiers must be 1 to 6")
    return value


# ----------------------------------------------------------------------------
# Node + directive
# ----------------------------------------------------------------------------

class lockers(nodes.General, nodes.Element):
    pass


class LockersDirective(SphinxDirective):
    has_content = True
    required_arguments = 0
    optional_arguments = 0
    option_spec = {
        "title": directives.unchanged,
        "lockers": directives.unchanged,
        "tiers": _tiers,
        "order": _choice("down", "across"),
        "start": _choice("left", "right"),
        "first-row": _choice("top", "bottom"),
        "roster": directives.path,
        "surname-initial": directives.flag,
        "hide-homeroom": directives.flag,
        "storage-key": directives.unchanged,
        "class": directives.class_option,
    }

    def _warn(self, message):
        logger.warning("lockers: " + message, location=self.get_location())

    def run(self):
        env = self.env
        count = env.temp_data.get("lockers_count", 0)
        env.temp_data["lockers_count"] = count + 1
        storage_id = self.options.get("storage-key") or "%s#%d" % (env.docname, count)

        bank_texts = [("", b) for b in self.options.get("lockers", "").split(";") if b.strip()]
        area = ""
        out_specs = []
        year_specs = []
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

        for line in self.content:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = AREA_LINE_RE.match(line)
            if m:
                area = (m.group(1) or m.group(2) or "").strip()
                continue
            m = BANK_LINE_RE.match(line)
            if m:
                bank_texts.append((area, m.group(1)))
                continue
            m = OUT_LINE_RE.match(line)
            if m:
                out_specs.append(m.group(1))
                continue
            m = YEAR_LINE_RE.match(line)
            if m:
                # bank/area names are resolved in lockers.js, so the spec is passed on as written
                year_specs.append({"year": str(int(m.group(1))), "spec": m.group(2).strip()})
                continue
            body, _, locker = line.rpartition("=") if "=" in line else (line, "", "")
            name, _, homeroom = body.partition(",")
            parts = name.split(None, 1)
            if not parts:
                continue
            students.append({
                "firstName": parts[0],
                "surname": parts[1].strip() if len(parts) > 1 else str(len(students) + 1),
                "homeroom": homeroom.strip(),
                "locker": locker.strip(),
            })

        # --- banks ---
        banks, seen, total = [], set(), 0
        for area_name, text in bank_texts:
            try:
                name, spec, o = _split_bank(text)
                ids = expand_spec(spec)
            except ValueError as exc:
                self._warn("bank %r skipped: %s." % (text.strip(), exc))
                continue
            dupes = [i for i in ids if i.lower() in seen]
            if dupes:
                self._warn("locker(s) %s listed more than once; only the first is used."
                           % ", ".join(dupes[:5]))
            seen.update(i.lower() for i in ids)
            total += len(ids)
            bank = {"name": name or "Bank %d" % (len(banks) + 1), "spec": spec, "area": area_name}
            bank.update(o)
            banks.append(bank)
        if total > MAX_LOCKERS:
            self._warn("%d lockers is more than the %d allowed; extra lockers are ignored."
                       % (total, MAX_LOCKERS))

        # --- unavailable lockers ---
        unavailable = []
        for spec in out_specs:
            try:
                ids = expand_spec(spec)
            except ValueError as exc:
                self._warn("'unavailable:' line skipped: %s." % exc)
                continue
            for i in ids:
                if seen and i.lower() not in seen:
                    self._warn("unavailable locker %r is not in any bank." % i)
                unavailable.append(i)

        # --- allocations given in the content or roster ---
        used = {}
        for s in students:
            locker = s["locker"]
            if not locker:
                continue
            key = locker.lower()
            who = "%s %s" % (s["firstName"], s["surname"])
            if seen and key not in seen:
                self._warn("%s: locker %r is not in any bank; it is added to an 'Other' bank."
                           % (who, locker))
            if key in used:
                self._warn("%s and %s are both given locker %r; only %s gets it."
                           % (used[key], who, locker, used[key]))
                s["locker"] = ""
                continue
            used[key] = who

        _note_doc(env)
        node = lockers()
        node["config"] = {
            "id": storage_id,
            "title": self.options.get("title", ""),
            "banks": banks,
            "tiers": self.options.get("tiers", 1),
            "order": self.options.get("order", "down"),
            "start": self.options.get("start", "left"),
            "firstRow": self.options.get("first-row", "top"),
            "unavailable": unavailable,
            "years": year_specs,
            "display": {
                "surnameInitial": "surname-initial" in self.options,
                "homeroom": "hide-homeroom" not in self.options,
            },
            "students": students,
        }
        node["classes"] = self.options.get("class", [])
        return [node]


# ----------------------------------------------------------------------------
# Visitors
# ----------------------------------------------------------------------------

def visit_lockers_html(self, node):
    payload = html.escape(json.dumps(node["config"], ensure_ascii=False), quote=True)
    # notranslate: browser page translation must not turn surnames (Le, Ang ...) into words
    classes = " ".join(["lockers", "notranslate"] + list(node.get("classes", [])))
    self.body.append('<div class="%s" translate="no" data-lockers="%s">' % (classes, payload))
    self.body.append("<noscript>JavaScript is required to show the locker allocation tool.</noscript>")


def depart_lockers_html(self, node):
    self.body.append("</div>")


def skip_lockers(self, node):
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
            logger.warning("lockers: cannot find %s next to lockers.py or in its _static folder; "
                           "the locker tool will not display.", name)
            continue
        shutil.copyfile(str(source), str(target / name))


# ----------------------------------------------------------------------------
# Rebuild pages with locker tools when the css/js change, so their ?v= tags update
# ----------------------------------------------------------------------------

def _note_doc(env):
    if not hasattr(env, "lockers_docs"):
        env.lockers_docs = set()
    env.lockers_docs.add(env.docname)


def _assets_hash():
    import hashlib
    h = hashlib.sha1()
    for name in ASSETS:
        source = _find_asset(name)
        if source is not None:
            h.update(source.read_bytes())
    return h.hexdigest()


def purge_doc(app, env, docname):
    getattr(env, "lockers_docs", set()).discard(docname)


def merge_docs(app, env, docnames, other):
    if not hasattr(env, "lockers_docs"):
        env.lockers_docs = set()
    env.lockers_docs |= getattr(other, "lockers_docs", set())


def outdated_if_assets_changed(app, env, added, changed, removed):
    new_hash = _assets_hash()
    if getattr(env, "lockers_assets_hash", None) == new_hash:
        return []
    env.lockers_assets_hash = new_hash
    return sorted(getattr(env, "lockers_docs", set()) - set(removed))


def copy_static_files_early(app):
    _copy_assets(app)


def copy_static_files(app, exception):
    if exception is None:
        _copy_assets(app)


def setup(app):
    app.add_node(
        lockers,
        html=(visit_lockers_html, depart_lockers_html),
        latex=(skip_lockers, None),
        text=(skip_lockers, None),
        man=(skip_lockers, None),
        texinfo=(skip_lockers, None),
    )
    app.add_directive("lockers", LockersDirective)
    app.add_css_file("lockers.css")
    app.add_js_file("lockers.js", defer="defer")
    app.connect("builder-inited", copy_static_files_early)
    app.connect("env-purge-doc", purge_doc)
    app.connect("env-merge-info", merge_docs)
    app.connect("env-get-outdated", outdated_if_assets_changed)
    app.connect("build-finished", copy_static_files)
    return {"version": "1.0", "parallel_read_safe": True, "parallel_write_safe": True}
