"""Sphinx extension: ``namepicker`` directive.

Embeds an animated random name picker in a page. A stack of coloured name cards cycles upwards
and settles with the chosen students on top.

    .. namepicker::
       :count: 3
       :duration: 6
       :easing: ease-out
       :roster: students.csv
       :title: Who's Up?
       :no-repeat:

       Alex Smith, 7A
       Sam Jones, 7B

Names can come from ``:roster:`` (CSV or Excel with Preferred / First Name, Surname and optional
Homeroom columns), from the directive content (one ``First Surname, Homeroom`` per line), or both.
Teachers can also import a roster in the page itself, mark students absent with the Class List
button and change the number picked, the animation time and the easing on the fly. Every pick
is kept in a history; Put Back undoes a pick; ``:sound:`` turns on tick and chime sounds.
The Animation Settings panel (and ``:easing-strength:``, ``:spin-speed:``) adjusts how the spin
moves; ``:easing: random`` uses a different style each pick, from the styles listed in
``:random-from:`` (default: all); ``:order:`` (random, az, za, homeroom) sets the order of the
stack and of the picked students.
Export JSON / Import JSON save and load the whole picker (Revert goes back to the last file),
and Import JSON also takes a class from a studentgroups or seatingplan file.

The page is rendered client-side by namepicker.js / namepicker.css, which are copied into
``_static`` by Sphinx during an HTML build.
"""

import codecs
import csv
import html
import io
import json
import shutil
from pathlib import Path

from docutils import nodes
from docutils.parsers.rst import directives
from sphinx.util import logging
from sphinx.util.docutils import SphinxDirective

logger = logging.getLogger(__name__)

HERE = Path(__file__).parent
ASSETS = ("namepicker.css", "namepicker.js")

MIN_COUNT, MAX_COUNT, DEFAULT_COUNT = 1, 10, 1
MIN_DURATION, MAX_DURATION, DEFAULT_DURATION = 1.0, 20.0, 6.0
# Styles Random can choose from, in the order of the Easing list (keep in step with namepicker.js).
STYLES = (
    "linear", "ease-out", "ease-in-out", "ease-out-strong", "sine", "expo", "circ", "back",
    "elastic", "spring", "bounce", "rubber-band", "anticipate", "steps", "ratchet", "drumroll",
    "near-miss",
)
EASINGS = STYLES + ("random",)
MIN_SPEED, MAX_SPEED, DEFAULT_SPEED = 1, 15, 6
DEFAULT_EASING = "ease-out"


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
        surname = r.get("surname") or r.get("last name") or r.get("lastname") or ""
        students.append(
            {"firstName": first, "surname": surname, "homeroom": r.get("homeroom", "")}
        )
    return students


def _parse_int(text, low, high, default, name, warn=None):
    """Return a whole number in ``low..high``, calling ``warn(message)`` if it had to be replaced."""
    try:
        val = int(str(text).strip())
    except (ValueError, TypeError):
        val = None
    if val is None or val < low or val > high:
        if warn:
            warn(
                "namepicker: :%s: %r is not a whole number from %d to %d; using %d."
                % (name, text, low, high, default)
            )
        return default
    return val


def _parse_duration(text, warn=None):
    try:
        val = float(str(text).strip())
    except (ValueError, TypeError):
        val = None
    if val is None or val < MIN_DURATION or val > MAX_DURATION:
        if warn:
            warn(
                "namepicker: :duration: %r is not a number of seconds from %g to %g; using %g."
                % (text, MIN_DURATION, MAX_DURATION, DEFAULT_DURATION)
            )
        return DEFAULT_DURATION
    return val


def _choice(*values):
    return lambda arg: directives.choice(arg, values)


# ----------------------------------------------------------------------------
# Node + directive
# ----------------------------------------------------------------------------

class namepicker(nodes.General, nodes.Element):
    pass


class NamePickerDirective(SphinxDirective):
    has_content = True
    required_arguments = 0
    optional_arguments = 0
    option_spec = {
        "count": directives.unchanged,
        "duration": directives.unchanged,
        "easing": _choice(*EASINGS),
        "easing-strength": directives.unchanged,
        "random-from": directives.unchanged,
        "spin-speed": directives.unchanged,
        "order": _choice("random", "az", "za", "homeroom"),
        "roster": directives.path,
        "title": directives.unchanged,
        "no-repeat": directives.flag,
        "surname-initial": directives.flag,
        "hide-homeroom": directives.flag,
        "skip-animation": directives.flag,
        "sound": directives.flag,
        "storage-key": directives.unchanged,
        "class": directives.class_option,
    }

    def run(self):
        env = self.env

        counter = env.temp_data.get("namepicker_count", 0)
        env.temp_data["namepicker_count"] = counter + 1
        storage_id = self.options.get("storage-key") or "%s#%d" % (env.docname, counter)

        def warn(msg):
            logger.warning(msg, location=self.get_location())

        pick_count = _parse_int(
            self.options.get("count", str(DEFAULT_COUNT)),
            MIN_COUNT, MAX_COUNT, DEFAULT_COUNT, "count", warn,
        )
        duration = _parse_duration(self.options.get("duration", str(DEFAULT_DURATION)), warn)

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
                warn("namepicker: cannot read roster %r: %s" % (roster, exc))
            else:
                students.extend(_students_from_rows(rows))
                if not students:
                    warn(
                        "namepicker: roster %r has no students. It needs a header row with "
                        "Preferred (or First Name), Surname (or Last Name) and optionally Homeroom."
                        % roster
                    )

        for line in self.content:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            name, _, homeroom = line.partition(",")
            parts = name.split(None, 1)
            if not parts:
                continue
            students.append(
                {
                    "firstName": parts[0],
                    "surname": parts[1] if len(parts) > 1 else "",
                    "homeroom": homeroom.strip(),
                }
            )

        seen = set()
        for s in students:
            key = " ".join(("%s %s" % (s["firstName"], s["surname"])).split()).lower()
            if key in seen:
                warn(
                    "namepicker: more than one student is called %r. Give them different names "
                    "(e.g. an initial) so the class can tell them apart."
                    % ("%s %s" % (s["firstName"], s["surname"]))
                )
            seen.add(key)

        _note_doc(env)
        strength = None
        if "easing-strength" in self.options:
            strength = _parse_int(self.options["easing-strength"], 0, 100, 50, "easing-strength", warn) / 100.0
        easing = self.options.get("easing") or DEFAULT_EASING
        random_pool = None
        if "random-from" in self.options:
            asked = [v.strip().lower() for v in self.options["random-from"].replace(",", " ").split() if v.strip()]
            unknown = [v for v in asked if v not in STYLES]
            if unknown:
                warn("namepicker: :random-from: does not know %s; the styles are %s."
                     % (", ".join(repr(v) for v in unknown), ", ".join(STYLES)))
            random_pool = [k for k in STYLES if k in asked] or None
            if random_pool is None:
                warn("namepicker: :random-from: lists no known styles; Random will use them all.")
        spin_speed = _parse_int(self.options.get("spin-speed", str(DEFAULT_SPEED)),
                                MIN_SPEED, MAX_SPEED, DEFAULT_SPEED, "spin-speed", warn)

        node = namepicker()
        node["config"] = {
            "id": storage_id,
            "title": self.options.get("title", "Name Picker"),
            "count": pick_count,
            "duration": duration,
            "easing": easing,
            "easingStrength": strength,
            "randomPool": random_pool,
            "spinSpeed": spin_speed,
            "order": {"random": "RANDOM", "az": "AZ", "za": "ZA", "homeroom": "HOMEROOM"}[self.options.get("order", "random")],
            "noRepeat": "no-repeat" in self.options,
            "surnameInitial": "surname-initial" in self.options,
            "showHomeroom": "hide-homeroom" not in self.options,
            "skipAnimation": "skip-animation" in self.options,
            "sound": "sound" in self.options,
            "students": students,
        }
        node["classes"] = self.options.get("class", [])
        return [node]


# ----------------------------------------------------------------------------
# Visitors
# ----------------------------------------------------------------------------

def visit_namepicker_html(self, node):
    payload = html.escape(json.dumps(node["config"], ensure_ascii=False), quote=True)
    classes = " ".join(["namepicker"] + list(node.get("classes", [])))
    self.body.append('<div class="%s" data-namepicker="%s">' % (classes, payload))
    self.body.append("<noscript>JavaScript is required to show the name picker.</noscript>")


def depart_namepicker_html(self, node):
    self.body.append("</div>")


def skip_namepicker(self, node):
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
                "namepicker: cannot find %s next to namepicker.py or in its _static folder; "
                "the name picker will not display.", name
            )
            continue
        shutil.copyfile(str(source), str(target / name))


# Rebuild pages with name pickers when the css/js change, so their ?v= tags update.

def _note_doc(env):
    if not hasattr(env, "namepicker_docs"):
        env.namepicker_docs = set()
    env.namepicker_docs.add(env.docname)


def _assets_hash():
    import hashlib
    h = hashlib.sha1()
    for name in ASSETS:
        source = _find_asset(name)
        if source is not None:
            h.update(source.read_bytes())
    return h.hexdigest()


def purge_doc(app, env, docname):
    getattr(env, "namepicker_docs", set()).discard(docname)


def merge_docs(app, env, docnames, other):
    if not hasattr(env, "namepicker_docs"):
        env.namepicker_docs = set()
    env.namepicker_docs |= getattr(other, "namepicker_docs", set())


def outdated_if_assets_changed(app, env, added, changed, removed):
    new_hash = _assets_hash()
    if getattr(env, "namepicker_assets_hash", None) == new_hash:
        return []
    env.namepicker_assets_hash = new_hash
    return sorted(getattr(env, "namepicker_docs", set()) - set(removed))


def copy_static_files_early(app):
    """Copy the css/js into the site's _static folder before pages are written, so the
    ?v=<checksum> on the tags matches the new files and browsers don't use a cached copy."""
    _copy_assets(app)


def copy_static_files(app, exception):
    if exception is None:
        _copy_assets(app)


def setup(app):
    app.add_node(
        namepicker,
        html=(visit_namepicker_html, depart_namepicker_html),
        latex=(skip_namepicker, None),
        text=(skip_namepicker, None),
        man=(skip_namepicker, None),
        texinfo=(skip_namepicker, None),
    )
    app.add_directive("namepicker", NamePickerDirective)
    app.add_css_file("namepicker.css")
    app.add_js_file("namepicker.js", defer="defer")
    app.connect("builder-inited", copy_static_files_early)
    app.connect("env-purge-doc", purge_doc)
    app.connect("env-merge-info", merge_docs)
    app.connect("env-get-outdated", outdated_if_assets_changed)
    app.connect("build-finished", copy_static_files)
    return {"version": "1.0", "parallel_read_safe": True, "parallel_write_safe": True}
