"""Sphinx extension: ``gifscene`` directive.

Shows a scene of pictures that come to life when they are clicked. Each picture is an animated
GIF. It sits still (showing its first frame) until it is clicked, then it plays.

    .. gifscene::
       :theme: christmas
       :title: Our Christmas scene
       :background: christmas/background.png
       :folder: christmas
       :play: once
       :start-effect:
       :sound:

       star.gif     | Star     | x=50 y=12 width=10
       tree.gif     | Tree     | x=20 y=62 width=22
       sleigh.gif   | Sleigh   | x=40 y=30 width=25 move=right seconds=8

Each content line is ``file | name | settings``. Only the file is needed.

* ``x`` and ``y`` are where the middle of the picture goes, as a percentage across and down the
  background (0 to 100). ``width`` is how wide it is, as a percentage of the background.
* ``seconds`` is how long it plays for after a click. Leave it out and the length of the GIF is
  read from the file. ``still=picture.png`` uses a separate picture while the GIF is not playing
  (otherwise the first frame of the GIF is used).
* ``move=`` makes the picture travel when it is clicked, and ``seconds`` is then how long the trip
  takes (6 if left out, 1.5 for ``jump``). ``left``/``right``/``up``/``down`` go off that side of
  the scene, come back in on the other side and return home; ``wave-left``/``wave-right`` bob up
  and down as they go; ``hop-left``/``hop-right`` bounce along; ``jump`` leaps up in an arc and
  lands back in place.
* ``spawn=small.gif`` makes copies of another GIF come out of the picture when it plays.
  ``count`` is how many (5 if left out, up to 20), ``spread`` is how they move (``burst`` out in
  all directions, float ``up``, fall ``down``, ``fountain`` up and over, or ``trail`` behind a
  travelling picture, one at a time while it plays) and ``spawnwidth`` is their size as a
  percentage of the background (a third of the picture's width if left out; a range such as
  ``2-5`` gives each copy a random size). ``every`` makes them come out one at a time, that many
  seconds apart, ``spawnfor`` is how many seconds that keeps going (otherwise as long as the
  picture plays), ``life`` is how many seconds each copy takes and ``distance`` is how far each
  copy goes, as a percentage of the scene.

With ``:background:`` the pictures are placed over the background (a scene). Without it they are
set out in a grid of cards (``:columns:``). ``:play:`` is ``once`` (play once per click),
``toggle`` (click to start, click to stop) or ``hover`` (play while the mouse is over it).
``play=`` on a picture's line gives that picture its own mode, overriding ``:play:``.

``:theme:`` (``christmas``, ``beach``, ``reef`` or ``toyroom``; neutral if left out) sets the colours and the defaults
for ``:title:``, ``:effect:`` (``snow``, ``bubbles``, ``confetti`` or ``wind``), ``:icon:`` and
``:message:``. Any of those given on the directive win over the theme. ``:start-effect:`` turns
the effect on when the page opens; it always comes on when every picture has been found.
``:intensity:`` is ``light``, ``medium`` (default) or ``heavy``: fewer, slower pieces or more,
faster ones.

The Arrange button lets pictures be dragged and resized on the page, then gives the lines to
paste back into the directive.

The page is rendered client-side by gifscene.js / gifscene.css, which are copied into
``_static`` by Sphinx during an HTML build. The same two files run the student kits (a plain web
page with no Sphinx), where the theme defaults live in gifscene.js.
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
ASSETS = ("gifscene.css", "gifscene.js")
MEDIA_DIR = "_static/gifscene-media"
PLAY_MODES = ("once", "toggle", "hover")
ITEM_KEYS = ("x", "y", "width", "seconds", "still", "move", "play", "spawn", "count", "spread", "spawnwidth",
             "every", "spawnfor", "life", "distance")
# settings that only mean something with spawn=, and their names in the JSON for gifscene.js
SPAWN_KEYS = (("count", "count"), ("spread", "spread"), ("spawnwidth", "spawnWidth"), ("every", "every"),
              ("spawnfor", "spawnFor"), ("life", "life"), ("distance", "distance"))
# allowed range for each number setting (others are 0 to 100)
NUMBER_RANGES = {"seconds": (0.2, 60), "every": (0.05, 10), "spawnfor": (0.1, 60), "life": (0.2, 20),
                 "distance": (1, 150)}
SPREADS = ("burst", "up", "down", "fountain", "trail")
MOVES = ("left", "right", "up", "down", "wave-left", "wave-right", "hop-left", "hop-right", "jump")
EFFECTS = ("snow", "bubbles", "confetti", "wind")
INTENSITIES = ("light", "medium", "heavy")
THEMES = ("none", "christmas", "beach", "reef", "toyroom")
DEFAULT_SECONDS = 3.0
DEFAULT_MOVE_SECONDS = 6.0
DEFAULT_JUMP_SECONDS = 1.5


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

class gifscene(nodes.General, nodes.Element):
    pass


def _choice(*values):
    return lambda arg: directives.choice(arg, values)


def _number(text, low, high):
    val = float(str(text).strip().rstrip("%"))
    if val < low or val > high:
        raise ValueError
    return int(val) if val == int(val) else val


class GifSceneDirective(SphinxDirective):
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
        "start-effect": directives.flag,
        "effect": _choice(*EFFECTS),
        "intensity": _choice(*INTENSITIES),
        "icon": directives.unchanged,
        "theme": _choice(*THEMES),
        "sound": directives.flag,
        "hide-names": directives.flag,
        "class": directives.class_option,
    }

    def warn(self, msg):
        logger.warning("gifscene: " + msg, location=self.get_location())

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
            if key in ("still", "spawn"):
                found[key] = value
                continue
            if key == "spread":
                if value.lower() in SPREADS:
                    found[key] = value.lower()
                else:
                    self.warn("%s: spread=%r should be one of: %s." % (filename, value, ", ".join(SPREADS)))
                continue
            if key == "count":
                try:
                    found[key] = int(_number(value, 1, 20))
                except ValueError:
                    self.warn("%s: count=%r should be a whole number from 1 to 20." % (filename, value))
                continue
            if key == "play":
                if value.lower() in PLAY_MODES:
                    found[key] = value.lower()
                else:
                    self.warn("%s: play=%r should be one of: %s." % (filename, value, ", ".join(PLAY_MODES)))
                continue
            if key == "move":
                if value.lower() in MOVES:
                    found[key] = value.lower()
                else:
                    self.warn("%s: move=%r should be one of: %s." % (filename, value, ", ".join(MOVES)))
                continue
            if key == "spawnwidth" and "-" in value.strip().lstrip("-"):
                # a range such as 2-5: each copy gets a random size between the two
                try:
                    low, high = (_number(v, 0.1, 100) for v in value.split("-", 1))
                    found[key] = [min(low, high), max(low, high)]
                except ValueError:
                    self.warn("%s: spawnwidth=%r should be a number or a range like 2-5." % (filename, value))
                continue
            try:
                found[key] = _number(value, *NUMBER_RANGES.get(key, (0, 100)))
            except ValueError:
                self.warn("%s: %s=%r is not a number in range, so it was left out." % (filename, key, value))
        return found

    def run(self):
        env = self.env
        counter = env.temp_data.get("gifscene_count", 0)
        env.temp_data["gifscene_count"] = counter + 1
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
                item["seconds"] = DEFAULT_JUMP_SECONDS if settings["move"] == "jump" else DEFAULT_MOVE_SECONDS
            if "seconds" in settings:
                item["seconds"] = settings["seconds"]
            # settings the Arrange button must keep when it writes the line out again
            def shown(v):
                return "%s-%s" % tuple(v) if isinstance(v, list) else v
            keep = ["%s=%s" % (k, shown(settings[k]))
                    for k in ("seconds", "still", "move", "play", "spawn") + tuple(k for k, _ in SPAWN_KEYS)
                    if k in settings]
            if keep:
                item["keep"] = " ".join(keep)
            item.setdefault("seconds", DEFAULT_SECONDS)
            item["loops"] = loops
            if "play" in settings:
                item["play"] = settings["play"]
            if "still" in settings:
                still, _ = self._media(settings["still"], files, "still picture")
                if still:
                    item["still"] = still
            if "spawn" in settings:
                spawn, _ = self._media(settings["spawn"], files, "spawned picture")
                if spawn:
                    item["spawn"] = spawn
                    for key, out in SPAWN_KEYS:
                        if key in settings:
                            item[out] = settings[key]
            else:
                for key, _ in SPAWN_KEYS:
                    if key in settings:
                        self.warn("%s: %s= only works with spawn=." % (filename, key))
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
        node = gifscene()
        node["files"] = files
        node["config"] = {
            "id": "%s#%d" % (env.docname, counter),
            "theme": self.options.get("theme", "none"),
            "background": background,
            "play": self.options.get("play", "once"),
            "columns": columns,
            "startEffect": "start-effect" in self.options,
            "intensity": self.options.get("intensity", "medium"),
            "sound": "sound" in self.options,
            "showNames": "hide-names" not in self.options,
            "items": items,
        }
        # left out here, these come from the theme in gifscene.js
        for key in ("title", "effect", "icon", "message"):
            if key in self.options:
                node["config"][key] = self.options[key]
        node["classes"] = self.options.get("class", [])
        return [node]


# ----------------------------------------------------------------------------
# Visitors
# ----------------------------------------------------------------------------

def visit_gifscene_html(self, node):
    builder = self.builder
    media = Path(builder.outdir) / MEDIA_DIR
    media.mkdir(parents=True, exist_ok=True)
    for outname, source in node["files"].items():
        target = media / outname
        if not target.is_file():  # the name holds a checksum, so an existing copy is current
            try:
                shutil.copyfile(source, str(target))
            except OSError as exc:
                logger.warning("gifscene: cannot copy %s: %s", source, exc)
    page = builder.get_target_uri(builder.current_docname)
    config = dict(node["config"])
    config["base"] = relative_uri(page, MEDIA_DIR + "/")
    payload = html.escape(json.dumps(config, ensure_ascii=False), quote=True)
    classes = " ".join(["gifscene"] + list(node.get("classes", [])))
    self.body.append('<div class="%s" data-gifscene="%s">' % (classes, payload))
    self.body.append("<noscript>JavaScript is required to show this scene.</noscript>")


def depart_gifscene_html(self, node):
    self.body.append("</div>")


def skip_gifscene(self, node):
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
                "gifscene: cannot find %s next to gifscene.py or in its _static folder; "
                "the scenes will not display.", name
            )
            continue
        shutil.copyfile(str(source), str(target / name))


# Rebuild pages with scenes when the css/js change, so their ?v= tags update.

def _note_doc(env):
    if not hasattr(env, "gifscene_docs"):
        env.gifscene_docs = set()
    env.gifscene_docs.add(env.docname)


def _assets_hash():
    h = hashlib.sha1()
    for name in ASSETS:
        source = _find_asset(name)
        if source is not None:
            h.update(source.read_bytes())
    return h.hexdigest()


def purge_doc(app, env, docname):
    getattr(env, "gifscene_docs", set()).discard(docname)


def merge_docs(app, env, docnames, other):
    if not hasattr(env, "gifscene_docs"):
        env.gifscene_docs = set()
    env.gifscene_docs |= getattr(other, "gifscene_docs", set())


def outdated_if_assets_changed(app, env, added, changed, removed):
    new_hash = _assets_hash()
    if getattr(env, "gifscene_assets_hash", None) == new_hash:
        return []
    env.gifscene_assets_hash = new_hash
    return sorted(getattr(env, "gifscene_docs", set()) - set(removed))


def copy_static_files_early(app):
    """Copy the css/js into the site's _static folder before pages are written, so the
    ?v=<checksum> on the tags matches the new files and browsers don't use a cached copy."""
    _copy_assets(app)


def copy_static_files(app, exception):
    if exception is None:
        _copy_assets(app)


def setup(app):
    app.add_node(
        gifscene,
        html=(visit_gifscene_html, depart_gifscene_html),
        latex=(skip_gifscene, None),
        text=(skip_gifscene, None),
        man=(skip_gifscene, None),
        texinfo=(skip_gifscene, None),
    )
    app.add_directive("gifscene", GifSceneDirective)
    app.add_css_file("gifscene.css")
    app.add_js_file("gifscene.js", defer="defer")
    app.connect("builder-inited", copy_static_files_early)
    app.connect("env-purge-doc", purge_doc)
    app.connect("env-merge-info", merge_docs)
    app.connect("env-get-outdated", outdated_if_assets_changed)
    app.connect("build-finished", copy_static_files)
    return {"version": "2.4", "parallel_read_safe": True, "parallel_write_safe": True}
