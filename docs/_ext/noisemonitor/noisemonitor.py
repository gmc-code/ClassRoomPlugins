"""
noisemonitor — a Sphinx directive that renders a classroom noise-level monitor.

Usage::

    .. noisemonitor::
       :threshold: 70
       :image-min: 35
       :image-max: 85
       :step-down: 3
       :scene: classroom
       :scene-cycle: 4
       :session: 20
       :config: settings/noise-room12.json
       :msg0: Silent and focused.

``:scene:`` is ``classroom`` (default), ``lab`` or ``groups``: an empty room that
fills with silly animated things as the noise rises. Each level picks a random
mix from its pool of gags every time it switches on.
``:finale:`` picks the Level 5 finale: ``room`` (default: classroom tornado,
lab rocket launch, group-tables inflatable dinosaur), ``tornado``, ``foam``, ``rocket`` or ``dino``.
``:scene-cycle:`` rotates the scene background every N minutes while monitoring.
``:session:`` sets how many minutes the monitor runs before stopping itself
(0 = no limit; the toolbar timer then counts up).

Every setting can also be changed live in the settings panel (gear button),
exported to JSON and imported again. A JSON file exported from the panel can be
passed straight to ``:config:`` so a page starts with those settings.
Precedence: built-in defaults < ``:config:`` file < individual options.
"""

import html
import json
from pathlib import Path

from docutils import nodes
from docutils.parsers.rst import directives
from sphinx.util import logging
from sphinx.util.docutils import SphinxDirective
from sphinx.util.osutil import relative_uri

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent / "_static"
NUM_LEVELS = 6

# Messages from earlier versions. They are still recognised as "untouched
# defaults" so saved settings switch to the current room's messages.
LEGACY_ZOO_MESSAGES = [
    "Level 0 - Zoo Zen. Even the meerkats are meditating. Perfect silence!",
    "Level 1 - Sneaky Safari. Whisper like a mouse sneaking past a sleeping lion!",
    "Level 2 - Monkey Business! The monkeys are chattering. Bring the volume down!",
    "Level 3 - Feeding Frenzy! The parrots are squawking and the monkeys are going bananas!",
    "Level 4 - ROAR ALERT! The lions have joined the conversation. Quieten things down!",
    "Level 5 - ZOO-MAGEDDON! The elephants are trumpeting, the monkeys are screaming, "
    "and the whole zoo is stampeding! SOUND THE ALARM!",
]

# Default messages for each scene room (used when a room is showing and the
# message for that level hasn't been customised).
ROOM_MESSAGES = {
    "classroom": [
        "Level 0 - Library Mode. You could hear a pin drop. Magnificent!",
        "Level 1 - Quiet Visitors. Something small just wandered in. Keep it this calm!",
        "Level 2 - Things Are Stirring! The classroom is waking up. Bring it down a notch!",
        "Level 3 - On the Loose! Animals are roaming the room. Volume down!",
        "Level 4 - Up in the Air! Things are flying everywhere. QUIETEN DOWN!",
        "Level 5 - TOTAL CHAOS! The whole classroom has gone bonkers! SOUND THE ALARM!",
    ],
    "lab": [
        "Level 0 - Lab Silence. Even the atoms are holding still. Brilliant!",
        "Level 1 - Calm Chemistry. Things are bubbling gently. Keep it this calm!",
        "Level 2 - The Lab Is Waking Up! Something just moved. Bring it down a notch!",
        "Level 3 - Sparks and Fizz! The experiments are going off. Volume down!",
        "Level 4 - Atoms on the Loose! Molecules are zooming everywhere. QUIETEN DOWN!",
        "Level 5 - LAB MELTDOWN! Everything is blasting off! SOUND THE ALARM!",
    ],
    "groups": [
        "Level 0 - Cosy Corner. Calm as a sleeping kitten. Lovely!",
        "Level 1 - Gentle Visitors. Someone small is wandering by. Keep it this calm!",
        "Level 2 - Playtime Is Starting! The toys are waking up. Bring it down a notch!",
        "Level 3 - Zoom Zoom! Things are speeding around. Volume down!",
        "Level 4 - Things Are Flying! Catch them if you can. QUIETEN DOWN!",
        "Level 5 - PARTY PANDEMONIUM! It's a full-on party! SOUND THE ALARM!",
    ],
}

LEGACY_LAB_MESSAGES = [
    "Level 0 - Lab Silence. Even the atoms are holding still. Brilliant!",
    "Level 1 - Safety Snails. Snails in goggles are on patrol. Keep it this calm!",
    "Level 2 - Mr Bones Is Dancing! The skeleton heard you. Bring it down a notch!",
    "Level 3 - Atoms on the Loose! Electrons are zooming everywhere. Volume down!",
    "Level 4 - High Voltage! The Tesla coil is sparking and the hamster is sprinting. QUIETEN DOWN!",
    "Level 5 - LAB MELTDOWN! Beakers are flying everywhere! SOUND THE ALARM!",
]

LEGACY_CLASSROOM_MESSAGES = [
    "Level 0 - Library Mode. You could hear a pin drop. Magnificent!",
    "Level 1 - Snail Parade. The snails are out for a stroll. Keep it this calm!",
    "Level 2 - Chicken Alert! Someone woke the rubber chicken. Bring it down a notch!",
    "Level 3 - Flying Books! The textbooks are trying to escape. Volume down!",
    "Level 4 - Goat on the Loose! It's eating the homework and the disco has started. QUIETEN DOWN!",
    "Level 5 - TOTAL CHAOS! The llama is swinging from the light! SOUND THE ALARM!",
]
LEGACY_GROUPS_MESSAGES = [
    "Level 0 - Cosy Corner. Calm as a sleeping kitten. Lovely!",
    "Level 1 - Snail Party. The party snails are on the move. Keep it this calm!",
    "Level 2 - Teddy Is Awake! The beach ball is bouncing. Bring it down a notch!",
    "Level 3 - Pillow Fight! There are feathers everywhere. Volume down!",
    "Level 4 - Toy Box Riot! The toys have come alive. QUIETEN DOWN!",
    "Level 5 - PARTY PANDEMONIUM! Confetti and balloons everywhere! SOUND THE ALARM!",
]

# Room messages from the previous version (recognised as untouched defaults).
LEGACY_ROOM_MESSAGES_2 = {
    "classroom": [
        "Level 0 - Library Mode. You could hear a pin drop. Magnificent!",
        "Level 1 - Quiet Visitors. Something small just wandered in. Keep it this calm!",
        "Level 2 - Things Are Stirring! The classroom is waking up. Bring it down a notch!",
        "Level 3 - Flying Objects! Stuff is taking off. Volume down!",
        "Level 4 - Wild Animals Inside! The zoo has arrived. QUIETEN DOWN!",
        "Level 5 - TOTAL CHAOS! The whole classroom has gone bonkers! SOUND THE ALARM!",
    ],
    "lab": [
        "Level 0 - Lab Silence. Even the atoms are holding still. Brilliant!",
        "Level 1 - Calm Chemistry. Things are bubbling gently. Keep it this calm!",
        "Level 2 - The Lab Is Waking Up! Something just moved. Bring it down a notch!",
        "Level 3 - Atoms on the Loose! Molecules are zooming everywhere. Volume down!",
        "Level 4 - High Voltage! Sparks are flying in the lab. QUIETEN DOWN!",
        "Level 5 - LAB MELTDOWN! Everything is blasting off! SOUND THE ALARM!",
    ],
    "groups": [
        "Level 0 - Cosy Corner. Calm as a sleeping kitten. Lovely!",
        "Level 1 - Gentle Visitors. Something soft is floating by. Keep it this calm!",
        "Level 2 - Playtime Is Starting! The toys are waking up. Bring it down a notch!",
        "Level 3 - Things Are Flying! Catch them if you can. Volume down!",
        "Level 4 - Toy Box Riot! The toys have come alive. QUIETEN DOWN!",
        "Level 5 - PARTY PANDEMONIUM! It's a full-on party! SOUND THE ALARM!",
    ],
}

# What appears at each level in each room: (always shown, random pool, how many
# to pick from the pool). A fresh random pick is made each time a level switches on.
LAB_POOLS = [
    ([], ["lavalamp", "tardigrade", "cradle", "prism", "mouse"], 2),       # on the benches / floor
    ([], ["skeleton", "plasma", "flame", "bubbles", "hamster"], 2),
    ([], ["tesla", "mentos", "solar", "periodic"], 2),                     # first things take off
    ([], ["molecules", "dna", "beakers"], 1),                              # flying
    (["alarm"], ["rocket", "flung"], 1),
]
CLASSROOM_POOLS = [
    ([], ["snails", "cat", "pencils", "flower", "clock", "doodle"], 2),    # floor, desks, walls
    ([], ["chicken", "backpacks", "basketball", "octopus", "spider"], 2),
    ([], ["goat", "kangaroo", "paperballs", "plane"], 2),                  # first things take off
    ([], ["books", "stickynotes", "pigeon", "disco"], 1),                  # flying
    (["alarm"], ["llama", "ufo", "sprinklers"], 1),
]
GROUPS_POOLS = [
    ([], ["tortoises", "puppy", "teddy", "top", "ducks"], 2),             # floor, tables, beanbags
    ([], ["train", "robot", "blocks", "jack", "balloondog"], 2),
    ([], ["rccar", "beachball", "plane", "butterflies", "soapbubbles"], 2),  # first things take off
    ([], ["pillows", "kites", "frisbees", "yoyo"], 1),                     # flying
    (["alarm"], ["party", "pinata", "bubbleflood"], 1),
]


def _layers(room, pools):
    return [([f"gag-{room}-{g}" for g in a], [f"gag-{room}-{g}" for g in r], n) for a, r, n in pools]


# How far back each walking/standing gag is. 0 = behind the back row of
# furniture, 1 = behind the middle row, ... Anything not listed (flying things,
# things on desk tops at the front) is drawn on top of all the furniture.
ROOM_ROWS = {"classroom": 3, "lab": 3, "groups": 2}
GAG_DEPTH = {
    "gag-classroom-snails": 2, "gag-classroom-backpacks": 1, "gag-classroom-basketball": 1,
    "gag-classroom-goat": 1, "gag-classroom-kangaroo": 1,
    "gag-lab-tardigrade": 2, "gag-lab-prism": 1, "gag-lab-skeleton": 1, "gag-lab-tesla": 2,
    "gag-lab-plasma": 2, "gag-lab-flame": 2, "gag-lab-rocket": 1, "gag-lab-mentos": 1,
    "gag-groups-tortoises": 1, "gag-groups-teddy": 1, "gag-groups-beachball": 1, "gag-groups-ducks": 1,
    "gag-groups-top": 1, "gag-groups-balloondog": 1, "gag-groups-train": 0, "gag-groups-robot": 1,
    "gag-groups-jack": 1, "gag-groups-blocks": 1, "gag-groups-rccar": 1,
}

SCENE_LAYERS = {
    "classroom": _layers("classroom", CLASSROOM_POOLS),
    "lab": _layers("lab", LAB_POOLS),
    "groups": _layers("groups", GROUPS_POOLS),
}

# Level 5 "finale" drawn on top of the room's own Level 5 gags.
FINALES = {
    "room": "Match the room",
    "tornado": "Tornado",
    "foam": "Foam volcano",
    "rocket": "Rocket launch",
    "dino": "Inflatable dinosaur",
}
ROOM_FINALE = {"classroom": "tornado", "lab": "rocket", "groups": "dino"}

# Each scene is an empty-room background with silly animated overlays that
# pile up as the level rises.
SCENES = {
    "classroom": "Classroom scene",
    "lab": "Science lab scene",
    "groups": "Group tables scene",
}

# Keys and ranges here mirror SCHEMA in noisemonitor.js.
DEFAULTS = {
    "title": "🔊 Noise Level Monitor",
    "scene": "classroom",
    "finale": "room",
    "threshold": 70,
    "imageMin": 35,
    "imageMax": 85,
    "stepDownSeconds": 3,
    "sceneCycleMinutes": 0,
    "sessionMinutes": 0,
    "sensitivity": 0,
    "smoothing": 0.8,
    "showDb": True,
    "showMeter": True,
    "showStatus": True,
    "messages": ROOM_MESSAGES["classroom"],
}

NUMERIC_LIMITS = {
    "threshold": (0, 100),
    "imageMin": (0, 99),
    "imageMax": (1, 100),
    "stepDownSeconds": (0.5, 30),
    "sceneCycleMinutes": (0, 60),
    "sessionMinutes": (0, 240),
    "sensitivity": (-30, 30),
    "smoothing": (0, 0.95),
}

# Older / directive-style spellings accepted in JSON config files.
KEY_ALIASES = {
    "image-min": "imageMin",
    "image_min": "imageMin",
    "image-max": "imageMax",
    "image_max": "imageMax",
    "step-down": "stepDownSeconds",
    "stepDown": "stepDownSeconds",
    "scene-cycle": "sceneCycleMinutes",
    "session": "sessionMinutes",
    "show-db": "showDb",
    "show-meter": "showMeter",
    "show-status": "showStatus",
}


def _merge_settings(base, raw):
    """Return a copy of ``base`` with every valid field from ``raw`` applied."""
    out = dict(base)
    out["messages"] = list(base["messages"])
    if not isinstance(raw, dict):
        return out

    for key, value in raw.items():
        key = KEY_ALIASES.get(key, key)
        if key in NUMERIC_LIMITS:
            try:
                num = float(value)
            except (TypeError, ValueError):
                continue
            lo, hi = NUMERIC_LIMITS[key]
            num = min(max(num, lo), hi)
            out[key] = int(round(num)) if key in ("threshold", "imageMin", "imageMax", "sensitivity", "sceneCycleMinutes", "sessionMinutes") else num
        elif key in ("showDb", "showMeter", "showStatus") and isinstance(value, bool):
            out[key] = value
        elif key == "title" and isinstance(value, str):
            out["title"] = value[:120]
        elif key == "scene" and value in SCENES:
            out["scene"] = value
        elif key == "finale" and value in FINALES:
            out["finale"] = value
        elif key == "messages":
            items = value.items() if isinstance(value, dict) else enumerate(value or [])
            for idx, msg in items:
                try:
                    idx = int(idx)
                except (TypeError, ValueError):
                    continue
                if 0 <= idx < NUM_LEVELS and isinstance(msg, str):
                    out["messages"][idx] = msg[:400]
        elif key.startswith("msg") and key[3:].isdigit() and isinstance(value, str):
            idx = int(key[3:])
            if 0 <= idx < NUM_LEVELS:
                out["messages"][idx] = value[:400]

    if out["imageMax"] <= out["imageMin"]:
        out["imageMax"] = min(100, out["imageMin"] + 1)
    return out


def _messages_for_scene(settings):
    """Swap untouched default messages to match the chosen picture style / room."""
    target = ROOM_MESSAGES.get(settings["scene"], ROOM_MESSAGES["classroom"])
    known = [LEGACY_ZOO_MESSAGES, LEGACY_LAB_MESSAGES, LEGACY_CLASSROOM_MESSAGES, LEGACY_GROUPS_MESSAGES,
             *LEGACY_ROOM_MESSAGES_2.values(), *ROOM_MESSAGES.values()]
    settings["messages"] = [
        target[i] if any(m == k[i] for k in known) else m for i, m in enumerate(settings["messages"])
    ]
    return settings


# --------------------------------------------------------------------------- #
# Node + HTML rendering
# --------------------------------------------------------------------------- #

class noisemonitor_node(nodes.General, nodes.Element):
    pass


ICON_GEAR = (
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/>'
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 '
    '1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 '
    '1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 '
    '4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 '
    '1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06'
    '.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>'
)
ICON_EXPAND = (
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3'
    'M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>'
)
ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
ICON_MIC = (
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/>'
    '<path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/></svg>'
)
ICON_DOWNLOAD = (
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'
    'M7 10l5 5 5-5M12 15V3"/></svg>'
)
ICON_UPLOAD = (
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'
    'M17 8l-5-5-5 5M12 3v12"/></svg>'
)
ICON_RESET = (
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
)


def _slider(uid, key, label, lo, hi, step, unit, hint=""):
    hint_html = f'<span class="noise-field-hint">{hint}</span>' if hint else ""
    return f"""
        <div class="noise-field">
          <div class="noise-field-head">
            <label for="{uid}-{key}">{label}</label>
            <output class="noise-field-value" for="{uid}-{key}" data-out="{key}"></output><span class="noise-field-unit">{unit}</span>
          </div>
          <input type="range" id="{uid}-{key}" data-setting="{key}" min="{lo}" max="{hi}" step="{step}">
          {hint_html}
        </div>"""


def _select(uid, key, label, options, hint=""):
    opts = "".join(f'<option value="{v}">{html.escape(t)}</option>' for v, t in options)
    hint_html = f'<span class="noise-field-hint">{hint}</span>' if hint else ""
    return f"""
        <div class="noise-field">
          <label for="{uid}-{key}">{label}</label>
          <select id="{uid}-{key}" data-setting="{key}">{opts}</select>
          {hint_html}
        </div>"""


ICON_TIMER = (
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/>'
    '<path d="M12 9v4l2.5 2.5M9 2h6M12 2v3"/></svg>'
)


def _checkbox(uid, key, label):
    return f"""
          <label class="noise-check" for="{uid}-{key}">
            <input type="checkbox" id="{uid}-{key}" data-setting="{key}"> {label}
          </label>"""


def visit_noisemonitor_html(self, node):
    uid = node["uid"]
    settings = node["settings"]

    docname = self.builder.current_docname
    base_uri = self.builder.get_target_uri(docname)
    rooms = list(SCENES)
    asset = lambda name: relative_uri(base_uri, f"_static/nm-scenes/{name}.svg")
    def gag(name):
        item = {"src": asset(name), "depth": GAG_DEPTH.get(name, "top")}
        # A copy without speech bubbles, swapped in once the room gets busy (Level 4+).
        if (STATIC_DIR / "nm-scenes" / f"{name}-quiet.svg").exists():
            item["quiet"] = asset(f"{name}-quiet")
        return item
    scenes = {
        "backgrounds": {r: asset(f"scene-{r}-base") for r in rooms},
        "full": {r: asset(f"scene-{r}") for r in rooms},
        "rows": {r: [asset(f"scene-{r}-row{i}") for i in range(1, ROOM_ROWS[r] + 1)] for r in rooms},
        "layers": {
            r: [{"always": [gag(x) for x in a], "random": [gag(x) for x in rnd], "pick": n}
                for a, rnd, n in SCENE_LAYERS[r]]
            for r in rooms
        },
        "finales": {f: {"src": asset(f"finale-{f}"), "depth": "top"} for f in FINALES if f != "room"},
        "roomFinale": ROOM_FINALE,
        "messages": {**ROOM_MESSAGES, "legacyZoo": LEGACY_ZOO_MESSAGES, "legacyLab": LEGACY_LAB_MESSAGES,
                     "legacyClassroom": LEGACY_CLASSROOM_MESSAGES, "legacyGroups": LEGACY_GROUPS_MESSAGES,
                     **{f"legacy2{k.title()}": v for k, v in LEGACY_ROOM_MESSAGES_2.items()}},
    }

    esc = html.escape
    config_attr = esc(json.dumps(settings, ensure_ascii=False))
    first_bg = esc(scenes["full"][settings["scene"]])
    scenes_attr = esc(json.dumps(scenes, ensure_ascii=False))
    scene_options = "".join(f'<option value="{k}">{esc(v)}</option>' for k, v in SCENES.items())
    storage_key = esc(node["storage_key"]) if node["storage_key"] else ""

    message_fields = "\n".join(
        f"""
        <div class="noise-msg-row">
          <img class="noise-msg-thumb" src="{first_bg}" alt="" loading="lazy">
          <div class="noise-msg-field">
            <label for="{uid}-msg{i}">Level {i}</label>
            <textarea id="{uid}-msg{i}" class="noise-msg-input" data-level="{i}" rows="2"></textarea>
          </div>
        </div>"""
        for i in range(NUM_LEVELS)
    )

    first_msg = esc(settings["messages"][0])
    title = esc(settings["title"])

    html_out = f"""
<div class="noise-monitor-card" id="{uid}" data-config="{config_attr}" data-scenes="{scenes_attr}" data-storage-key="{storage_key}">
  <div class="noise-toolbar">
    <button type="button" class="noise-btn noise-btn-toggle" aria-pressed="false">
      {ICON_MIC}<span class="noise-btn-label">Start monitor</span>
    </button>
    <span class="noise-live-dot" aria-hidden="true"></span>
    <span class="noise-toolbar-spacer"></span>
    <span class="noise-timer" role="timer" aria-live="off" hidden>{ICON_TIMER}<span class="noise-timer-text">00:00</span></span>
    <button type="button" class="noise-btn noise-btn-icon noise-btn-fullscreen" aria-label="Full screen" title="Full screen">{ICON_EXPAND}</button>
    <button type="button" class="noise-btn noise-btn-icon noise-btn-settings" aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-controls="{uid}-settings">{ICON_GEAR}</button>
  </div>

  <div class="noise-hero">
    <div class="noise-image-wrap">
    </div>
    <h3 class="noise-title">{title}</h3>
    <p class="noise-level-message" aria-live="polite">{first_msg}</p>

    <div class="noise-meter" role="meter" aria-label="Noise level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div class="noise-meter-bar"></div>
      <div class="noise-meter-peak"></div>
      <div class="noise-meter-threshold" title="Warning threshold"></div>
      <div class="noise-meter-ticks">{"".join(f'<span class="noise-tick"><span class="noise-tick-label">L{i}</span></span>' for i in range(NUM_LEVELS))}</div>
    </div>

    <div class="noise-meter-row">
      <div class="noise-readout-level"><span class="noise-db-value">0</span> dB</div>
      <p class="noise-status-text">Press <strong>Start monitor</strong> to begin.</p>
    </div>
  </div>

  <dialog class="noise-settings" id="{uid}-settings" aria-labelledby="{uid}-settings-title">
    <div class="noise-settings-head">
      <h4 id="{uid}-settings-title">Noise monitor settings</h4>
      <button type="button" class="noise-btn noise-btn-icon noise-btn-close" aria-label="Close settings" title="Close">{ICON_CLOSE}</button>
    </div>

    <div class="noise-settings-body">
      <section class="noise-section noise-section-live">
        <div class="noise-live-row">
          <span>Live reading</span>
          <strong><span class="noise-live-db">–</span> dB</strong>
          <span class="noise-live-level">Level –</span>
        </div>
        <div class="noise-mini-meter"><div class="noise-mini-bar"></div><div class="noise-mini-threshold"></div></div>
        <button type="button" class="noise-btn noise-btn-secondary noise-btn-calibrate">Calibrate to quiet room</button>
        <p class="noise-field-hint">Ask the class to be silent, then press Calibrate. The monitor listens for 4 seconds and moves the whole scale so that silence sits at Level 0.</p>
      </section>

      <section class="noise-section">
        <h5>Levels</h5>
        {_slider(uid, "imageMin", "Min level (bottom of Level 0)", 0, 99, 1, "dB")}
        {_slider(uid, "imageMax", "Max level (top of meter)", 1, 100, 1, "dB", "The range between Min and Max is split evenly into Levels 0–5.")}
        {_slider(uid, "threshold", "Warning threshold", 0, 100, 1, "dB", "The meter turns red and a warning shows above this reading.")}
      </section>

      <section class="noise-section">
        <h5>Response</h5>
        {_slider(uid, "stepDownSeconds", "Step-down delay", 0.5, 30, 0.5, "s", "Noise jumps the level up straight away; it drops one level per delay once the room settles.")}
        {_slider(uid, "sensitivity", "Mic sensitivity", -30, 30, 1, "dB", "Raise for a quiet or distant microphone; lower for a sensitive one.")}
        {_slider(uid, "smoothing", "Smoothing", 0, 0.95, 0.05, "", "Higher values ignore brief spikes such as a dropped pencil.")}
      </section>

      <section class="noise-section">
        <h5>Session timer</h5>
        {_select(uid, "sessionMinutes", "Monitor runs for",
                 [(0, "No limit (count up)"), (5, "5 minutes"), (10, "10 minutes"), (15, "15 minutes"), (20, "20 minutes"),
                  (25, "25 minutes"), (30, "30 minutes"), (40, "40 minutes"), (45, "45 minutes"), (50, "50 minutes"),
                  (60, "1 hour"), (90, "1½ hours")],
                 "The timer shows in the toolbar. With a limit, it counts down and stops the monitor when time is up.")}
      </section>

      <section class="noise-section">
        <h5>Display</h5>
        <div class="noise-field">
          <label for="{uid}-scene">Picture style</label>
          <select id="{uid}-scene" data-setting="scene">{scene_options}</select>
          <span class="noise-field-hint">Scenes show an empty room; silly things appear one by one as the noise rises.</span>
        </div>
        {_select(uid, "sceneCycleMinutes", "Change scene background",
                 [(0, "Never"), (1, "Every minute"), (2, "Every 2 minutes"), (3, "Every 3 minutes"), (4, "Every 4 minutes"), (5, "Every 5 minutes"), (10, "Every 10 minutes")],
                 "While monitoring, rotate through the classroom, lab and group-tables rooms.")}
        {_select(uid, "finale", "Level 5 finale", list(FINALES.items()),
                 "Each room has its own grand finale; pick one here to use it in every room.")}
        <div class="noise-field">
          <label for="{uid}-title">Title</label>
          <input type="text" id="{uid}-title" data-setting="title" maxlength="120">
        </div>
        <div class="noise-check-row">
          {_checkbox(uid, "showMeter", "Show meter")}
          {_checkbox(uid, "showDb", "Show dB reading")}
          {_checkbox(uid, "showStatus", "Show status line")}
        </div>
      </section>

      <section class="noise-section">
        <h5>Level messages</h5>
        {message_fields}
      </section>
    </div>

    <div class="noise-settings-foot">
      <button type="button" class="noise-btn noise-btn-secondary noise-btn-export">{ICON_DOWNLOAD}<span>Export JSON</span></button>
      <button type="button" class="noise-btn noise-btn-secondary noise-btn-import">{ICON_UPLOAD}<span>Import JSON</span></button>
      <button type="button" class="noise-btn noise-btn-ghost noise-btn-reset">{ICON_RESET}<span>Reset</span></button>
      <input type="file" class="noise-file-import" accept=".json,application/json" hidden>
      <p class="noise-io-feedback" role="status" aria-live="polite"></p>
    </div>
  </dialog>
</div>
"""
    self.body.append(html_out)
    raise nodes.SkipNode


def skip_node(self, node):
    """Non-HTML builders (LaTeX/PDF, text, man, epub…) simply omit the monitor."""
    raise nodes.SkipNode


# --------------------------------------------------------------------------- #
# Directive
# --------------------------------------------------------------------------- #

def _percent(argument):
    value = directives.nonnegative_int(argument)
    if value > 100:
        raise ValueError("must be between 0 and 100")
    return value


def _signed_int(argument):
    return int(directives.unchanged_required(argument))


def _positive_float(argument):
    value = float(directives.unchanged_required(argument))
    if value <= 0:
        raise ValueError("must be greater than 0")
    return value


class NoiseMonitorDirective(SphinxDirective):
    has_content = False

    option_spec = {
        "config": directives.path,
        "id": directives.unchanged_required,
        "no-storage": directives.flag,
        "title": directives.unchanged,
        "scene": lambda arg: directives.choice(arg, tuple(SCENES)),
        "scene-cycle": directives.nonnegative_int,
        "finale": lambda arg: directives.choice(arg, tuple(FINALES)),
        "session": directives.nonnegative_int,
        "threshold": _percent,
        "image-min": _percent,
        "image-max": _percent,
        "step-down": _positive_float,
        "sensitivity": _signed_int,
        "smoothing": float,
        "hide-db": directives.flag,
        "hide-meter": directives.flag,
        "hide-status": directives.flag,
        **{f"msg{i}": directives.unchanged for i in range(NUM_LEVELS)},
    }

    def run(self):
        settings = _merge_settings(DEFAULTS, {})

        # 1. Optional JSON file (e.g. one exported from the settings panel)
        if "config" in self.options:
            rel, abs_path = self.env.relfn2path(self.options["config"])
            self.env.note_dependency(rel)
            try:
                raw = json.loads(Path(abs_path).read_text(encoding="utf-8"))
                settings = _merge_settings(settings, raw)
            except (OSError, ValueError) as exc:
                logger.warning(
                    "noisemonitor: could not read config %r (%s); using defaults.",
                    self.options["config"], exc,
                    location=(self.env.docname, self.lineno),
                )

        # 2. Individual directive options win over the config file
        overrides = {}
        for opt, key in (
            ("title", "title"), ("scene", "scene"), ("scene-cycle", "sceneCycleMinutes"), ("finale", "finale"),
            ("session", "sessionMinutes"), ("threshold", "threshold"), ("image-min", "imageMin"),
            ("image-max", "imageMax"), ("step-down", "stepDownSeconds"),
            ("sensitivity", "sensitivity"), ("smoothing", "smoothing"),
        ):
            if opt in self.options:
                overrides[key] = self.options[opt]
        for flag, key in (("hide-db", "showDb"), ("hide-meter", "showMeter"), ("hide-status", "showStatus")):
            if flag in self.options:
                overrides[key] = False
        for i in range(NUM_LEVELS):
            if f"msg{i}" in self.options:
                overrides[f"msg{i}"] = self.options[f"msg{i}"]

        requested_min = overrides.get("imageMin", settings["imageMin"])
        requested_max = overrides.get("imageMax", settings["imageMax"])
        if requested_max <= requested_min:
            logger.warning(
                "noisemonitor: image-max (%s) must be greater than image-min (%s); "
                "image-max adjusted.", requested_max, requested_min,
                location=(self.env.docname, self.lineno),
            )
        settings = _merge_settings(settings, overrides)
        settings = _messages_for_scene(settings)

        serial = self.env.new_serialno("noisemonitor")
        node = noisemonitor_node()
        node["uid"] = f"noisemonitor-{serial}"
        node["settings"] = settings
        if "no-storage" in self.options:
            node["storage_key"] = ""
        elif "id" in self.options:
            node["storage_key"] = f"noisemonitor:{self.options['id']}"
        else:
            node["storage_key"] = f"noisemonitor:{self.env.docname}:{serial}"
        return [node]


# --------------------------------------------------------------------------- #
# Extension setup
# --------------------------------------------------------------------------- #

def _add_static_path(app, config):
    path = str(STATIC_DIR)
    if path not in config.html_static_path:
        config.html_static_path.append(path)


def setup(app):
    app.add_node(
        noisemonitor_node,
        html=(visit_noisemonitor_html, None),
        latex=(skip_node, None),
        text=(skip_node, None),
        man=(skip_node, None),
        texinfo=(skip_node, None),
    )
    app.add_directive("noisemonitor", NoiseMonitorDirective)
    app.add_js_file("noisemonitor.js", defer="defer")
    app.add_css_file("noisemonitor.css")
    app.connect("config-inited", _add_static_path)

    return {
        "version": "2.0",
        "parallel_read_safe": True,
        "parallel_write_safe": True,
    }
