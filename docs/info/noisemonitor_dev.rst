====================================
Noise Monitor developer reference
====================================

Technical reference for the ``noisemonitor`` Sphinx extension: installing it,
the directive and its options, the settings file, browser storage, how sound is
turned into levels, and how to restyle the monitor. For how teachers use it,
see :doc:`/info/noisemonitor_info`.

----

Files and installation
----------------------

.. code-block:: text

   noisemonitor/
       __init__.py
       noisemonitor.py          # directive, settings merge, HTML output
       _static/
           noisemonitor.js      # monitor (ES2017+, no dependencies)
           noisemonitor.css
           nm-scenes/           # room backgrounds, layers, gags and finales (SVG)

Enable it in ``conf.py``:

.. code-block:: python

   extensions = [
       # ...
       "noisemonitor",
   ]

* At ``config-inited`` the extension adds its own ``_static`` folder to
  ``html_static_path``, so the script, stylesheet and pictures are copied into
  the site's ``_static``. The pictures end up in ``_static/nm-scenes/``.
* ``noisemonitor.js`` (``defer``) and ``noisemonitor.css`` are added to every
  HTML page.
* LaTeX/PDF, text, man and texinfo builds skip the node.
* The extension declares ``parallel_read_safe`` and ``parallel_write_safe``
  (version 2.0).


The directive
-------------

.. code-block:: rst

   .. noisemonitor::
      :scene: lab
      :scene-cycle: 4
      :session: 20
      :threshold: 65
      :config: settings/room12-noise.json
      :id: room12
      :msg0: Silent reading time.
      :msg5: Freeze! Hands on heads.

The directive has no content.


Options
~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 22 18 60

   * - Option
     - Default
     - Description
   * - ``:scene:``
     - ``classroom``
     - ``classroom``, ``lab``, ``groups`` or ``maths``.
   * - ``:scene-cycle:``
     - ``0``
     - Minutes between automatic room changes while monitoring (0–60;
       0 = never).
   * - ``:reverse:``
     - off
     - Flag. Busy room when quiet, empty when loud.
   * - ``:session:``
     - ``0``
     - Timer length in minutes (0–240; 0 = count up, no limit).
   * - ``:threshold:``
     - ``70``
     - Warning level, 0–100 on the monitor's scale.
   * - ``:image-min:``
     - ``35``
     - Bottom of Level 0 (0–99).
   * - ``:image-max:``
     - ``85``
     - Top of Level 5 (1–100). If not above ``:image-min:``, a warning is
       logged and it is set to ``image-min + 1``.
   * - ``:step-down:``
     - ``3``
     - Seconds of quieter sound before the level drops by one (0.5–30).
   * - ``:sensitivity:``
     - ``0``
     - Microphone boost added to every reading (−30 to 30).
   * - ``:smoothing:``
     - ``0.8``
     - Smoothing factor, 0–0.95 (see `From sound to levels`_).
   * - ``:title:``
     - 🔊 Noise Level Monitor
     - Up to 120 characters; empty hides it.
   * - ``:msg0:`` … ``:msg5:``
     - room messages
     - Message for each level (up to 400 characters).
   * - ``:hide-meter:``, ``:hide-db:``, ``:hide-status:``
     - off
     - Flags. Set ``showMeter``, ``showDb``, ``showStatus`` to false.
   * - ``:config:``
     - —
     - JSON settings file, relative to the page (see `Settings file`_).
       Registered as a dependency, so editing it rebuilds the page.
   * - ``:id:``
     - —
     - Storage name (see `Browser storage`_).
   * - ``:no-storage:``
     - off
     - Flag. Don't remember changes made in the browser.

Out-of-range numbers are clamped, not rejected; invalid values for typed
options (e.g. a negative ``:threshold:``) are reported by docutils as directive
errors.


Precedence
~~~~~~~~~~

Each layer overrides the one before:

#. built-in defaults;
#. the ``:config:`` file (an unreadable file logs a warning and is ignored);
#. individual directive options;
#. settings saved in the browser from the settings panel (unless
   ``:no-storage:``).

Untouched default messages are then swapped for the chosen room's messages,
both at build time and whenever the room changes in the browser. Messages from
earlier versions' defaults are also treated as untouched.


Settings file
-------------

The same format is used by ``:config:``, **Export JSON**, **Import JSON** and
the browser copy:

.. code-block:: json

   {
     "app": "noisemonitor",
     "version": 2,
     "title": "Room 12",
     "scene": "maths",
     "sceneCycleMinutes": 4,
     "reverseScene": false,
     "sessionMinutes": 20,
     "stopAtTimeUp": true,
     "threshold": 65,
     "imageMin": 30,
     "imageMax": 80,
     "stepDownSeconds": 3,
     "sensitivity": 0,
     "smoothing": 0.8,
     "showDb": true,
     "showMeter": true,
     "showStatus": true,
     "messages": ["Silent work", "Keep it this calm!", "Bring it down a notch!",
                  "Volume down!", "QUIETEN DOWN!", "SOUND THE ALARM!"]
   }

.. list-table::
   :header-rows: 1
   :widths: 24 18 58

   * - Key
     - Type / range
     - Notes
   * - ``threshold``, ``imageMin``, ``imageMax``
     - integer 0–100
     - ``imageMin`` 0–99, ``imageMax`` 1–100 and above ``imageMin``.
   * - ``stepDownSeconds``
     - number 0.5–30
     -
   * - ``sceneCycleMinutes``
     - integer 0–60
     -
   * - ``sessionMinutes``
     - integer 0–240
     -
   * - ``sensitivity``
     - integer −30–30
     -
   * - ``smoothing``
     - number 0–0.95
     -
   * - ``showDb``, ``showMeter``, ``showStatus``, ``reverseScene``,
       ``stopAtTimeUp``
     - boolean
     - Non-boolean values are ignored.
   * - ``scene``
     - string
     - ``classroom``, ``lab``, ``groups`` or ``maths``.
   * - ``title``
     - string
     - Cut to 120 characters.
   * - ``messages``
     - list of 6 strings, or object ``{"0": …}``
     - Partial lists/objects change only the levels given. ``msg0`` … ``msg5``
       keys also work.

Every key is optional; unknown keys are ignored, and numbers outside their range
are clamped. Directive-style spellings are accepted too: ``image-min``,
``image_min``, ``image-max``, ``image_max``, ``step-down``, ``stepDown``,
``scene-cycle``, ``session``, ``show-db``, ``show-meter``, ``show-status``,
``reverse``.

**Import JSON** in the browser rejects files over 100 KB, invalid JSON, and
files whose ``app`` is not ``noisemonitor``, then reports how many settings were
applied.


Browser storage
---------------

Settings are saved to ``localStorage`` 250 ms after each change, as the full
settings object:

.. list-table::
   :header-rows: 1
   :widths: 46 54

   * - Key
     - When
   * - ``noisemonitor:<id>``
     - ``:id:`` given. Use the same id on several pages to share settings.
   * - ``noisemonitor:<docname>:<n>``
     - Default; *n* is a serial number for the monitor within the build.
   * - (none)
     - ``:no-storage:``.

**Reset** removes the key. Because the default key includes the page name,
moving or renaming the page starts it fresh. ``localStorage`` is per origin, so
all versions of the docs on the same domain share keys. If storage is blocked,
the monitor works but forgets changes.


From sound to levels
--------------------

**Microphone.** ``getUserMedia`` is called with ``echoCancellation``,
``noiseSuppression`` and ``autoGainControl`` all off, so loud and quiet rooms
read differently. This needs a secure context (``https://`` or ``localhost``).
The audio goes into a Web Audio ``AnalyserNode`` (``fftSize`` 2048). Nothing is
recorded or sent anywhere.

**Reading.** On every animation frame:

.. code-block:: text

   rms      = √(mean of squared samples)
   dBFS     = 20 · log10(max(rms, 1e-7))            ≈ −140 … 0
   reading  = clamp(dBFS + 100 + sensitivity, 0, 100)
   smoothed = k · smoothed + (1 − k) · reading      (k = smoothing)

The 0–100 scale is relative to the microphone's full scale, not calibrated
sound pressure. "dB" on screen means this scale.

**Levels.** The range ``imageMin``–``imageMax`` is split into six equal bands:
``level = floor(6 · (smoothed − imageMin) / (imageMax − imageMin))``, clamped to
0–5. The displayed level rises immediately to a higher band, but falls only one
step at a time, each step needing ``stepDownSeconds`` with the reading below the
current band. Above ``threshold`` the meter turns red and the status shows the
warning. The peak marker decays by 0.15 percentage points per frame.

**Calibration.** For 4 seconds the smoothed readings are collected; the 75th
percentile is taken as "quiet". ``imageMin``, ``imageMax`` and ``threshold`` are
all shifted by ``quiet − imageMin``, keeping their spacing. Fewer than 10
samples gives an error instead.

**Timer.** Counts down from ``sessionMinutes`` (or up, if 0). It starts and
pauses with the monitor but can run on its own. With ``stopAtTimeUp`` the
monitor stops at zero. ``.is-ending`` is set in the last 60 seconds.

**Screen Wake Lock** is requested while monitoring, where supported, released
when the monitor stops, and requested again when the tab becomes visible.


Scenes and pictures
-------------------

Each room has a background, a full picture (for thumbnails) and 2–3 *row*
layers, so things can walk behind the front desks. Each level has a list of
gags, some always shown and a random pick of the others, chosen afresh each
time the level switches on. A gag has a *depth* (which row layer it sits behind
or in front of), and some have a ``-quiet`` copy without speech bubbles, used
from Level 4. Level 5 adds the room's finale. All picture URLs and the gag lists
are written into the page at build time as ``data-scenes``, with paths made
relative to each page, so the monitor works at any folder depth.

From Level 4, lower levels are cut to one gag each. At Level 3, a Level 4 gag
occasionally appears briefly as a warning. With **Reverse**, the scene level is
``5 − level`` while running (and 0 while stopped). Scene cycling moves to the next room every ``sceneCycleMinutes``
while running.

The pictures are generated SVG files (about 110 files, under 1 MB together).


How the page is built
---------------------

The directive renders the whole interface in HTML, including the settings
dialog, so it is visible before the script runs::

   <div class="noise-monitor-card" id="noisemonitor-N"
        data-config="{settings json}" data-scenes="{pictures json}"
        data-storage-key="noisemonitor:…">
     … toolbar, meter, scene, message, timer, <dialog class="noise-settings"> …
   </div>

``noisemonitor.js`` starts one monitor per ``.noise-monitor-card``. The settings
panel is a native ``<dialog>`` (``showModal``).

State is exposed for styling:

.. list-table::
   :header-rows: 1
   :widths: 42 58

   * - Attribute / class
     - Meaning
   * - ``[data-level="0"…"5"]``
     - Current noise level.
   * - ``[data-scene-level]``
     - Level used by the picture (differs in Reverse mode).
   * - ``.is-running``
     - Microphone on.
   * - ``.is-fullscreen``
     - Full-screen layout.
   * - ``.is-scene``
     - A room picture is shown.
   * - ``.noise-meter-bar.is-danger``
     - Above the warning threshold.
   * - ``.noise-timer.is-idle`` / ``.is-paused`` / ``.is-done`` / ``.is-ending``
     - Timer state.


Styling
-------

Colours are custom properties on ``.noise-monitor-card``, so they can be
changed per page or per theme:

.. code-block:: css

   .noise-monitor-card {
     --nm-bg: #ffffff;          --nm-hero: #f8fafc;      --nm-surface: #ffffff;
     --nm-border: #cbd5e1;      --nm-border-soft: #e2e8f0;
     --nm-text: #0f172a;        --nm-text-2: #334155;    --nm-text-3: #64748b;
     --nm-accent: #2563eb;      --nm-accent-hover: #1d4ed8;
     --nm-accent-soft: #dbeafe; --nm-track: #e2e8f0;
     --nm-safe: #16a34a;        --nm-safe-bar: #22c55e;  --nm-warn-bar: #f59e0b;
     --nm-danger: #dc2626;      --nm-danger-bar: #ef4444;
     --nm-radius: 10px;
   }

A dark set is applied automatically under ``html[data-theme="dark"]`` or
``body[data-theme="dark"]`` (Furo, PyData, sphinx-book-theme). Override them in
your own stylesheet:

.. code-block:: css

   /* _static/custom.css, loaded with html_css_files = ["custom.css"] */
   .noise-monitor-card { --nm-accent: #7c3aed; --nm-radius: 16px; }

``@media (prefers-reduced-motion: reduce)`` removes the Level 5 shake, the
pulsing live dot and timer, and the meter transitions; the gags still animate.


Browser support
---------------

Current Chrome, Edge, Firefox and Safari. Requires ``getUserMedia``, the Web
Audio API and a secure context; without them the status line shows a message
instead of starting. Full screen uses the standard or ``webkit`` Fullscreen API;
the button is hidden where neither exists.
