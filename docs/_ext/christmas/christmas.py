"""Sphinx extension: ``christmas`` directive.

Shows a Christmas scene of pictures that come to life when they are clicked. Each picture is an
animated GIF. It sits still (showing its first frame) until it is clicked, then it plays.

    .. christmas::
       :title: Our Christmas scene
       :background: christmas/background.png
       :folder: christmas
       :play: once
       :snow:
       :sound:

       star.gif     | Star     | x=50 y=12 width=10
       tree.gif     | Tree     | x=20 y=62 width=22
       present.gif  | Present  | x=34 y=84 width=11

Each content line is ``file | name | settings``. Only the file is needed.

* ``x`` and ``y`` are where the middle of the picture goes, as a percentage across and down the
  background (0 to 100). ``width`` is how wide it is, as a percentage of the background.
* ``seconds`` is how long it plays for after a click. Leave it out and the length of the GIF is
  read from the file. ``still=picture.png`` uses a separate picture while the GIF is not playing
  (otherwise the first frame of the GIF is used).
* ``move=right`` or ``move=left`` makes the picture travel when it is clicked: it goes off that
  side of the scene, comes back in on the other side and returns to its place. ``seconds`` is
  then how long the trip takes (6 if left out).

With ``:background:`` the pictures are placed over the background (a scene). Without it they are
set out in a grid of cards (``:columns:``). ``:play:`` is ``once`` (play once per click),
``toggle`` (click to start, click to stop) or ``hover`` (play while the mouse is over it).
The Arrange button lets pictures be dragged and resized on the page, then gives the lines to
paste back into the directive.

The page is rendered client-side by christmas.js / christmas.css, which are copied into
``_static`` by Sphinx during an HTML build. The same two files run the student kit (a plain web
page with no Sphinx), which is described in ``info/christmas_tutorial.rst``.
"""

import hashlib
import html
import json
import shutil
import struct
from pathlib import Path

from docutils import nodes
from docutils.parsers.rst import directives
from sphinx.util import logging
from sphinx.util.docutils import SphinxDirective
from sphinx.util.osutil import relative_uri

logger = logging.getLogger(__name__)

HERE = Path(__file__).parent
ASSETS = ("christmas.css", "christmas.js")
MEDIA_DIR = "_static/christmas-media"
PLAY_MODES = ("once", "toggle", "hover")
ITEM_KEYS = ("x", "y", "width", "seconds", "still", "move")
MOVES = ("left", "right")
DEFAULT_SECONDS = 3.0
DEFAULT_MOVE_SECONDS = 6.0


# ----------------------------------------------------------------------------
# Reading a GIF (no extra packages needed)
# ----------------------------------------------------------------------------

def gif_info(path):
    """Return ``{"width", "height", "frames", "seconds", "loops"}`` for a GIF file.

    ``seconds`` is the time for one run through all the frames. ``loops`` is 0 for a GIF that
    repeats forever, otherwise the number of times it plays. Raises ValueError if the file is
    not a GIF.
    """
    data = Path(path).read_bytes()
    if data[:6] not in (b"GIF87a", b"GIF89a"):
        raise ValueError("not a GIF file")
    width, height, flags = struct.unpack("<HHB", data[6:11])
    pos = 13
    if flags & 0x80:
        pos += 3 * (2 ** ((flags & 0x07) + 1))
    frames, centiseconds, loops = 0, 0, 1
    delay = 0

    def skip_sub_blocks(p):
        while p < len(data) and data[p]:
            p += data[p] + 1
        return p + 1

    while pos < len(data):
        block = data[pos]
        if block == 0x3B:  # trailer
            break
        if block == 0x21:  # extension
            label = data[pos + 1]
            if label == 0xF9:  # graphic control: holds the frame delay
                delay = struct.unpack("<H", data[pos + 4:pos + 6])[0]
                pos = skip_sub_blocks(pos + 2)
            elif label == 0xFF and data[pos + 3:pos + 14] in (b"NETSCAPE2.0", b"ANIMEXTS1.0"):
                sub = pos + 14
                if data[sub] >= 3 and data[sub + 1] == 1:
                    loops = struct.unpack("<H", data[sub + 2:sub + 4])[0]
                pos = skip_sub_blocks(pos + 2)
            else:
                pos = skip_sub_blocks(pos + 2)
        elif block == 0x2C:  # image
            frames += 1
            centiseconds += delay if delay > 1 else 10  # browsers play 0 and 1 as 10
            delay = 0
            local = data[pos + 9]
            pos += 10
            if local & 0x80:
                pos += 3 * (2 ** ((local & 0x07) + 1))
            pos = skip_sub_blocks(pos + 1)
        else:
            break
    return {
        "width": width,
        "height": height,
        "frames": frames,
        "seconds": centiseconds / 100.0,
        "loops": loops,
    }


# ----------------------------------------------------------------------------
# Node + directive
# ----------------------------------------------------------------------------

class christmas(nodes.General, nodes.Element):
    pass


def _choice(*values):
    return lambda arg: directives.choice(arg, values)


def _number(text, low, high):
    val = float(str(text).strip().rstrip("%"))
    if val < low or val > high:
        raise ValueError
    return int(val) if val == int(val) else val


class ChristmasDirective(SphinxDirective):
    has_content = True
    required_arguments = 0
    optional_arguments = 0
    option_spec = {
        "title": directives.unchanged,
        "background": directives.unchanged,
        "folder": directives.unchanged,
        "play": _choice(*PLAY_MODES),
        "columns": directives.unchanged,
        "message": directives.unchanged,
        "snow": directives.flag,
        "sound": directives.flag,
        "hide-names": directives.flag,
        "class": directives.class_option,
    }

    def warn(self, msg):
        logger.warning("christmas: " + msg, location=self.get_location())

    def _media(self, filename, files, what):
        """Find a picture, remember it for copying and return its name in the built site."""
        env = self.env
        folder = self.options.get("folder", "").strip().rstrip("/")
        tries = []
        if folder and not filename.startswith("/"):
            tries.append(folder + "/" + filename)
        tries.append(filename)
        for candidate in tries:
            _, abspath = env.relfn2path(candidate)
            if Path(abspath).is_file():
                env.note_dependency(abspath)
                digest = hashlib.sha1(Path(abspath).read_bytes()).hexdigest()[:10]
                outname = "%s-%s" % (digest, Path(abspath).name.replace(" ", "_"))
                files[outname] = abspath
                return outname, abspath
        self.warn("cannot find the %s %r (looked for %s)." % (what, filename, " and ".join(tries)))
        return None, None

    def _settings(self, text, filename):
        found = {}
        for part in text.replace(",", " ").split():
            key, eq, value = part.partition("=")
            key = key.strip().lower()
            if not eq or key not in ITEM_KEYS:
                self.warn("%s: do not understand %r. Use %s." % (
                    filename, part, ", ".join(k + "=" for k in ITEM_KEYS)))
                continue
            if key == "still":
                found[key] = value
                continue
            if key == "move":
                if value.lower() in MOVES:
                    found[key] = value.lower()
                else:
                    self.warn("%s: move=%r should be move=left or move=right." % (filename, value))
                continue
            try:
                found[key] = _number(value, *{"seconds": (0.2, 60)}.get(key, (0, 100)))
            except ValueError:
                self.warn("%s: %s=%r is not a number in range, so it was left out." % (filename, key, value))
        return found

    def run(self):
        env = self.env
        counter = env.temp_data.get("christmas_count", 0)
        env.temp_data["christmas_count"] = counter + 1
        files = {}
        items = []

        for line in self.content:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [part.strip() for part in line.split("|")]
            filename = parts[0]
            outname, abspath = self._media(filename, files, "picture")
            if outname is None:
                continue
            name = parts[1] if len(parts) > 1 and parts[1] else Path(filename).stem.replace("_", " ").capitalize()
            settings = self._settings(parts[2], filename) if len(parts) > 2 else {}
            item = {"file": filename, "src": outname, "name": name}
            for key in ("x", "y", "width"):
                if key in settings:
                    item[key] = settings[key]
            loops = 0
            if abspath.lower().endswith(".gif"):
                try:
                    info = gif_info(abspath)
                except (ValueError, IndexError, struct.error):
                    self.warn("%s does not look like a GIF, so its length could not be read." % filename)
                else:
                    item["w"], item["h"] = info["width"], info["height"]
                    if info["frames"] < 2:
                        self.warn("%s has only one frame, so it will not move when clicked." % filename)
                    elif info["seconds"]:
                        item["seconds"] = round(info["seconds"], 2)
                    loops = info["loops"]
            else:
                self.warn("%s is not a .gif file. It will show, but only GIFs are animated." % filename)
            if "move" in settings:
                # a lap of the scene takes longer than one run of the GIF
                item["move"] = settings["move"]
                item["seconds"] = DEFAULT_MOVE_SECONDS
            if "seconds" in settings:
                item["seconds"] = settings["seconds"]
            # settings the Arrange button must keep when it writes the line out again
            keep = ["%s=%s" % (k, settings[k]) for k in ("seconds", "still", "move") if k in settings]
            if keep:
                item["keep"] = " ".join(keep)
            item.setdefault("seconds", DEFAULT_SECONDS)
            item["loops"] = loops
            if "still" in settings:
                still, _ = self._media(settings["still"], files, "still picture")
                if still:
                    item["still"] = still
            items.append(item)

        if not items:
            self.warn("no pictures were listed. Add lines like 'star.gif | Star'.")

        background = None
        if "background" in self.options:
            background, _ = self._media(self.options["background"].strip(), files, "background")

        columns = 4
        if "columns" in self.options:
            try:
                columns = int(_number(self.options["columns"], 1, 8))
            except ValueError:
                self.warn(":columns: %r is not a whole number from 1 to 8; using 4." % self.options["columns"])

        _note_doc(env)
        node = christmas()
        node["files"] = files
        node["config"] = {
            "id": "%s#%d" % (env.docname, counter),
            "title": self.options.get("title", "Christmas"),
            "background": background,
            "play": self.options.get("play", "once"),
            "columns": columns,
            "message": self.options.get("message", "You found them all. Merry Christmas!"),
            "snow": "snow" in self.options,
            "sound": "sound" in self.options,
            "showNames": "hide-names" not in self.options,
            "items": items,
        }
        node["classes"] = self.options.get("class", [])
        return [node]


# ----------------------------------------------------------------------------
# Visitors
# ----------------------------------------------------------------------------

def visit_christmas_html(self, node):
    builder = self.builder
    media = Path(builder.outdir) / MEDIA_DIR
    media.mkdir(parents=True, exist_ok=True)
    for outname, source in node["files"].items():
        target = media / outname
        if not target.is_file():  # the name holds a checksum, so an existing copy is current
            try:
                shutil.copyfile(source, str(target))
            except OSError as exc:
                logger.warning("christmas: cannot copy %s: %s", source, exc)
    page = builder.get_target_uri(builder.current_docname)
    config = dict(node["config"])
    config["base"] = relative_uri(page, MEDIA_DIR + "/")
    payload = html.escape(json.dumps(config, ensure_ascii=False), quote=True)
    classes = " ".join(["christmas"] + list(node.get("classes", [])))
    self.body.append('<div class="%s" data-christmas="%s">' % (classes, payload))
    self.body.append("<noscript>JavaScript is required to show the Christmas scene.</noscript>")


def depart_christmas_html(self, node):
    self.body.append("</div>")


def skip_christmas(self, node):
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
                "christmas: cannot find %s next to christmas.py or in its _static folder; "
                "the Christmas scene will not display.", name
            )
            continue
        shutil.copyfile(str(source), str(target / name))


# Rebuild pages with Christmas scenes when the css/js change, so their ?v= tags update.

def _note_doc(env):
    if not hasattr(env, "christmas_docs"):
        env.christmas_docs = set()
    env.christmas_docs.add(env.docname)


def _assets_hash():
    h = hashlib.sha1()
    for name in ASSETS:
        source = _find_asset(name)
        if source is not None:
            h.update(source.read_bytes())
    return h.hexdigest()


def purge_doc(app, env, docname):
    getattr(env, "christmas_docs", set()).discard(docname)


def merge_docs(app, env, docnames, other):
    if not hasattr(env, "christmas_docs"):
        env.christmas_docs = set()
    env.christmas_docs |= getattr(other, "christmas_docs", set())


def outdated_if_assets_changed(app, env, added, changed, removed):
    new_hash = _assets_hash()
    if getattr(env, "christmas_assets_hash", None) == new_hash:
        return []
    env.christmas_assets_hash = new_hash
    return sorted(getattr(env, "christmas_docs", set()) - set(removed))


def copy_static_files_early(app):
    """Copy the css/js into the site's _static folder before pages are written, so the
    ?v=<checksum> on the tags matches the new files and browsers don't use a cached copy."""
    _copy_assets(app)


def copy_static_files(app, exception):
    if exception is None:
        _copy_assets(app)


def setup(app):
    app.add_node(
        christmas,
        html=(visit_christmas_html, depart_christmas_html),
        latex=(skip_christmas, None),
        text=(skip_christmas, None),
        man=(skip_christmas, None),
        texinfo=(skip_christmas, None),
    )
    app.add_directive("christmas", ChristmasDirective)
    app.add_css_file("christmas.css")
    app.add_js_file("christmas.js", defer="defer")
    app.connect("builder-inited", copy_static_files_early)
    app.connect("env-purge-doc", purge_doc)
    app.connect("env-merge-info", merge_docs)
    app.connect("env-get-outdated", outdated_if_assets_changed)
    app.connect("build-finished", copy_static_files)
    return {"version": "1.0", "parallel_read_safe": True, "parallel_write_safe": True}
