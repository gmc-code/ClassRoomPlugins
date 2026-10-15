=================================
Name Picker developer reference
=================================

Technical reference for the ``namepicker`` Sphinx extension: installing it, the
directive and its options, the file format, browser storage, how the animation
and picking work, and how to restyle the picker. For how teachers use it, see
:doc:`/info/namepicker_info`.

----

Files and installation
----------------------

.. code-block:: text

   namepicker/
       __init__.py
       namepicker.py          # directive, roster reading, build-time checks
       _static/
           namepicker.js      # the picker (plain ES5, no dependencies)
           namepicker.css

Enable it in ``conf.py``:

.. code-block:: python

   extensions = [
       # ...
       "namepicker",
   ]

* ``namepicker.css`` and ``namepicker.js`` (``defer``) are added to every HTML
  page. They are copied into the built site's ``_static`` folder at
  ``builder-inited`` and again at ``build-finished``; ``html_static_path`` and
  ``conf.py`` are left alone.
* **Cache busting.** A SHA-1 of both assets is kept in the build environment.
  When either changes, every page with a picker is rewritten
  (``env-get-outdated``), so the ``?v=`` checksum on the tags changes and
  browsers fetch the new files.
* LaTeX/PDF, text, man and texinfo builds skip the node.
* The extension declares ``parallel_read_safe`` and ``parallel_write_safe``.
* **Optional dependency:** ``openpyxl``, only for ``.xlsx`` rosters at build
  time.


The directive
-------------

.. code-block:: rst

   .. namepicker::
      :title: Who's Up?
      :count: 3
      :duration: 6
      :easing: ease-out-strong
      :roster: rosters/8J.csv
      :no-repeat:
      :sound:

      # students written here are added after the roster file
      Alex Smith, 7A
      Sam Jones, 7B

With no options and no content it renders an empty picker; teachers then use
**Import Roster**.

**Content:** one student per line, ``First Surname, Homeroom``. The first word
is the first name and the rest the surname (which may be empty); the homeroom is
optional. Lines starting with ``#`` are ignored.


Options
~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 22 18 60

   * - Option
     - Default
     - Description
   * - ``:title:``
     - Name Picker
     - Starting title.
   * - ``:count:``
     - ``1``
     - Students picked at once, 1–10.
   * - ``:duration:``
     - ``6``
     - Animation time in seconds, 1–20 (decimals allowed).
   * - ``:easing:``
     - ``ease-out``
     - A style key from `Easing curves`_ (``linear``, ``ease-out``,
       ``ease-in-out``, ``ease-out-strong``, ``sine``, ``expo``, ``circ``,
       ``back``, ``elastic``, ``spring``, ``bounce``, ``rubber-band``,
       ``anticipate``, ``steps``, ``ratchet``, ``drumroll``, ``near-miss``) or
       ``random``.
   * - ``:easing-strength:``
     - per easing
     - 0–100: strength of the chosen easing (see `Easing curves`_). Ignored for
       styles without a strength and for ``random``.
   * - ``:random-from:``
     - all styles
     - Styles ``random`` chooses from, as keys separated by commas or spaces,
       e.g. ``steps, ratchet, drumroll, near-miss``.
   * - ``:spin-speed:``
     - ``6``
     - Names passing the top per second, 1–15.
   * - ``:roster:``
     - —
     - ``.csv`` or ``.xlsx`` file relative to the page; registered as a
       dependency, so editing it rebuilds the page.
   * - ``:order:``
     - ``random``
     - Order picked students are shown in: ``random`` (as landed), ``az``,
       ``za`` or ``homeroom``.
   * - ``:no-repeat:``
     - off
     - Flag. **No repeats** on.
   * - ``:surname-initial:``
     - off
     - Flag. **Surname initial** on.
   * - ``:hide-homeroom:``
     - off
     - Flag. **Homeroom** off.
   * - ``:skip-animation:``
     - off
     - Flag. **No animation** on.
   * - ``:sound:``
     - off
     - Flag. **Sound** on.
   * - ``:storage-key:``
     - ``<docname>#<n>``
     - Browser storage id (see `Browser storage`_).
   * - ``:class:``
     - —
     - Extra classes on the picker's root ``div``.


Build warnings
~~~~~~~~~~~~~~

Reported as Sphinx warnings at the directive; the build continues:

* ``:count:`` not a whole number from 1 to 10 → 1;
* ``:duration:`` not a number from 1 to 20 → 6;
* ``:easing-strength:`` not 0–100 → 50; ``:spin-speed:`` not 1–15 → 6;
* ``:random-from:`` names an unknown style → it is skipped (and if none are
  known, Random uses every style);
* the roster can't be read (missing file, bad encoding, ``openpyxl`` missing) or
  has no students;
* two students with the same full name (case and spacing ignored).

An unknown ``:easing:`` value is a directive error from docutils.


Roster files
~~~~~~~~~~~~

The header row is matched case-insensitively: ``Preferred`` / ``First Name`` /
``FirstName``, ``Surname`` / ``Last Name`` / ``LastName``, ``Homeroom``. Other
columns are ignored and blank rows skipped. CSV may be UTF-8 (with or without
BOM) or UTF-16 with BOM, with the delimiter (comma, tab, semicolon) sniffed.
Excel reads the first sheet; whole-number floats such as ``11.0`` become ``11``.
Homerooms are shortened in the browser to the first character plus the last two
digits (``H-Room 211`` → ``H11``).

**Import Roster** in the browser reads the same columns. Excel files load
SheetJS (``xlsx@0.18.5`` from cdn.jsdelivr.net) on first use.


How the page is built
---------------------

The directive renders::

   <div class="namepicker [classes]" data-namepicker="{...json...}">
     <noscript>JavaScript is required to show the name picker.</noscript>
   </div>

``data-namepicker`` holds ``id``, ``title``, ``count``, ``duration``,
``easing``, ``easingStrength`` (0–1 or ``null``), ``randomPool`` (list of
style keys, or ``null`` for all), ``spinSpeed``, ``order``, ``noRepeat``, ``surnameInitial``, ``showHomeroom``,
``skipAnimation``, ``sound`` and ``students`` (``firstName``, ``surname``,
``homeroom``).

``namepicker.js`` runs immediately, on ``DOMContentLoaded`` and on ``load``, and
starts a picker for each element not already marked ``data-np-ready``. If one
fails to start, the error is logged and shown in its place. The Class List and
History panels are appended to ``<body>`` as ``.np-modal`` elements.

**Start-up and precedence.** The build-time configuration sets the defaults. If
``localStorage`` holds a saved picker for this storage id, it replaces them
(class, absences, picks, history and settings). So editing the directive has no
visible effect for a teacher who has used the picker until they press **Reset**;
changing ``:storage-key:`` gives everyone a fresh picker.


How picking works
-----------------

**The pool.** Students present (not marked away). With **Skip Students Already
Picked**, students in ``picked`` are left out, unless fewer than
``min(count, present)`` would remain, in which case ``picked`` is cleared and
everyone goes back in. ``N = min(count, pool size)`` students are picked.

**The stack.** The pool is put into a cyclic order: shuffled for ``RANDOM``,
otherwise sorted by ``order`` (the same comparison as below). Up to 10 cards are
visible (``MAX_VISIBLE``), drawn from ``visible + 3`` card elements that are
reused as names move up. Cards are 56 px tall (``CARD_H``, must match the CSS)
and 46 px apart (``STEP``), so they overlap; cards further down are slightly
smaller. The stack is rebuilt when the pool or the order changes (the view's key is the
order plus the pool). With ``RANDOM`` and an unchanged pool, the names on screen
stay put and the off-screen order is reshuffled before each spin; sorted orders
keep their order.

**The spin.** The number of names that pass the top is

.. code-block:: text

   steps = max(visible + N + 3, round(duration × spinSpeed)) + random(0 … pool − 1)

and position ``steps × ease(t)`` is drawn every animation frame for ``duration``
seconds. The random extra steps decide who lands on top, so every student in the
pool is equally likely to be first; the next ``N − 1`` in the cycle follow
(with a sorted order, these are alphabetical or homeroom neighbours). The easing only changes how the motion looks, not who is picked.

Easing curves
~~~~~~~~~~~~~

Each easing maps time ``t`` (0–1) to progress (0 at the start, 1 at the end;
some styles go past 1, or below 0, and come back). Strength ``s`` (0–1) changes
one parameter. Several styles also use ``n``, the number of names the spin
passes (``steps`` above), so that they pause or snap exactly on a name; the graph
and Preview use ``n = round(duration × spinSpeed)``. Helpers: ``eo(t, p) = 1 −
(1 − t)^p``; ``eio`` is cubic ease-in-out; ``smooth`` is smoothstep.

.. list-table::
   :header-rows: 1
   :widths: 20 48 32

   * - Key
     - Curve
     - Strength → parameter (default)
   * - ``linear``
     - ``t``
     - —
   * - ``ease-out``
     - ``eo(t, p)``
     - ``p = 1.5 + 5s`` (s 0.3 → p 3)
   * - ``ease-in-out``
     - ``2^(p−1)·t^p``, then mirrored
     - ``p = 2 + 4s`` (s 0.25 → p 3)
   * - ``ease-out-strong``
     - ``eo(t, p)``
     - ``p = 3 + 5s`` (s 0.4 → p 5)
   * - ``sine``
     - ``sin(πt / 2)``
     - —
   * - ``expo``
     - ``(1 − 2^(−kt)) / (1 − 2^(−k))``
     - ``k = 4 + 12s`` (s 0.4 → 8.8)
   * - ``circ``
     - ``√(1 − (t − 1)²)``
     - —
   * - ``back``
     - ``1 + c₃(t − 1)³ + c₁(t − 1)²``, ``c₃ = c₁ + 1``
     - ``c₁ = 0.5 + 3s`` (s 0.4 → 1.7)
   * - ``elastic``
     - ``2^(−kt)·sin((10t − 0.75)·2π/3) + 1``
     - ``k = 16 − 12s`` (s 0.5 → 10)
   * - ``spring``
     - ``1 − e^(−kt)·cos(wt)``, exactly 1 at ``t = 1``
     - ``k = 10 − 5s``, ``w = (2 + 3s)π`` (s 0.4)
   * - ``bounce``
     - standard bounce-out
     - —
   * - ``rubber-band``
     - ``eo`` up to ``1 + a`` by ``t = 0.6``, back to ``1 − 0.6a`` by 0.8, then
       to 1
     - ``a = min(0.3, (1 + 4s) / n)``: 1–5 names past (s 0.4)
   * - ``anticipate``
     - back to ``−a`` by ``t = 0.2``, then ``eo(·, 3)`` to 1
     - ``a = min(0.25, (1 + 3s) / n)``: 1–4 names back (s 0.4)
   * - ``steps``
     - name by name at a steady pace; each move takes the first ``j`` of its
       slot
     - ``j = 0.6 − 0.5s`` (s 0.5)
   * - ``ratchet``
     - ``eo(t, 2.5)`` progress, but each name waits for ``pause`` of its slot,
       then snaps
     - ``pause = 0.3 + 0.5s`` (s 0.4)
   * - ``drumroll``
     - ``eo`` to ``(n − 1) / n``, a trembling hold until ``t = 0.85``, then the
       last name
     - hold length ``h = 0.15 + 0.3s`` (s 0.5)
   * - ``near-miss``
     - ``eo`` to ``(n − m) / n`` by ``t = 0.6`` (``m`` = 1 or 2 at random),
       still for ``h``, then creeps on to 1
     - ``h = 0.05 + 0.25s`` (s 0.4)
   * - ``random``
     - one of the styles in ``randomPool``, drawn at random once per pick, with
       that style's own strength
     - —

Every curve ends exactly at 1, so the easing only changes how the motion looks,
never who is picked. Files from older versions with ``easing: "custom"`` load as
``ease-out``; their ``curve`` is ignored.

The **Animation Settings** panel draws the curve as an SVG graph (y from −0.58 to
1.58); for ``random`` it draws every style in the pool in its own colour and
shows a checkbox per style (**All** / **None**; at least one stays ticked).
**Preview** runs the curve on a dot without picking, and for ``random`` names
and highlights the style it drew.

**Settling.** The chosen cards move into a numbered column (10 px apart) with a
CSS transition; the others fade out. The pick is added to ``picked``,
``lastResult`` and ``history`` (at most 200 rounds kept).

**Order.** ``lastResult`` and ``history`` keep the order students landed in.
For display, printing and the *Picked:* line, ``lastResult`` is sorted by
``order`` (choosing an order while idle rebuilds the stack in that order): ``RANDOM`` keeps it, ``AZ`` / ``ZA`` sort by surname then first name,
``HOMEROOM`` by homeroom (blank last) then surname. Changing the order after a
pick moves the chosen cards with the same CSS transition.

**Put Back** restores ``picked`` to its state before the last round (or, after a
page reload, removes the last round's students from it), removes that round from
``history`` if it is the latest entry, and clears ``lastResult``.

**Sound** uses the Web Audio API, with no audio files. Each tick is a 35 ms
1.4 kHz triangle blip, played at most once per frame as a new name reaches the
top; the chime is three sine notes (G5, B5, E6). The audio context is created on
the first click, as browsers require.

**Projector view** adds ``.np-projector`` to the root, requests full screen
(falling back to a full-window overlay), and zooms the stage to fit the window
(1×–2.4×). Space, Page Down and → call Pick; Esc exits.


JSON file format
----------------

**Export JSON** and the browser copy use this shape (``version`` 2):

.. code-block:: json

   {
     "app": "namepicker",
     "version": 2,
     "title": "Who's Up?",
     "count": 2,
     "duration": 6,
     "easing": "ease-out",
     "easingStrength": {"back": 0.9},
     "randomPool": ["steps", "ratchet", "drumroll", "near-miss"],
     "spinSpeed": 6,
     "order": "RANDOM",
     "noRepeat": true,
     "surnameInitial": false,
     "showHomeroom": true,
     "skipAnimation": false,
     "sound": false,
     "students": [{"id": "student-0", "firstName": "Alex", "surname": "Smith",
                   "fullName": "Alex Smith", "homeroom": "H11"}],
     "absent": ["student-1"],
     "picked": ["student-0", "student-4"],
     "lastResult": ["student-4"],
     "history": [{"t": 1792050000000, "ids": ["student-0"]},
                 {"t": 1792050060000, "ids": ["student-4"]}]
   }

* ``absent`` and ``picked`` are lists of student ids. Version 1 objects
  (``{"student-1": true}``) are also read.
* ``history[].t`` is a JavaScript timestamp (milliseconds since 1970).
* ``count`` is clamped to 1–10, ``duration`` to 1–20 and ``spinSpeed`` to 1–15
  (missing or zero values keep the current setting); an unknown ``easing``
  becomes ``ease-out``.
* ``easingStrength`` maps easing keys to 0–1, only for easings that have a
  strength; ``randomPool`` keeps only known style keys (an empty or missing
  list means all styles).

**Import checks:** the file must be under 2 MB and valid JSON, ``app`` (if
present) must be ``namepicker``, ``studentgroups`` or ``seatingplan``, the
``version`` must not be newer than the script's, and there must be a
``students`` list with at least one readable student. Duplicate ids are dropped,
as are references to unknown students. Nothing changes unless the file passes.

**Files from other tools.** A file with ``app: "studentgroups"``, or a seating
plan file (``app: "seatingplan"`` or a ``layout`` list), supplies only
``students``, ``title`` and (for student groups) ``absent``. Picks and history
are cleared; picker settings are unchanged.


Browser storage
---------------

.. list-table::
   :header-rows: 1
   :widths: 46 54

   * - Key
     - Contents
   * - ``namepicker:<storage-key>``
     - The current picker (the JSON format above), saved after every change.
   * - ``namepicker:<storage-key>:imported``
     - ``{kind, name, data}``: the last JSON imported or exported, or roster
       imported, for **Revert**.

``<storage-key>`` defaults to ``<docname>#<n>``, where *n* counts pickers on the
page from 0. **Renaming or moving the page, or inserting a picker above another,
changes the key**, and the picker starts fresh (the old data stays under the old
key). Set ``:storage-key:`` where this matters. ``localStorage`` is per origin,
so all versions of the docs on one domain share keys. With storage blocked the
picker works but forgets everything when the page closes.

**Export JSON** uses ``showSaveFilePicker`` where available (Chrome and Edge on
``https``/``localhost``), otherwise a file-name prompt and a normal download.


Styling
-------

All selectors are prefixed ``np-``.

.. list-table::
   :header-rows: 1
   :widths: 42 58

   * - Selector
     - What it is
   * - ``.namepicker``
     - Root element (plus any ``:class:`` names).
   * - ``.np-title``, ``.np-toolbar``, ``.np-status``
     - Title bar, toolbar, message bar.
   * - ``.np-pick``, ``.np-putback``
     - The Pick and Put Back buttons.
   * - ``.np-stage``
     - The card stack. ``.np-settled`` once a pick lands, ``.np-multi`` for
       more than one pick, ``.np-big`` for three or fewer.
   * - ``.np-card``, ``.np-first``, ``.np-last``, ``.np-hr``, ``.np-rank``
     - A card, its name parts, homeroom badge and rank number.
   * - ``.np-card.np-chosen``, ``.np-card.np-dark-text``
     - A picked card; a card using dark text on a light colour.
   * - ``.np-result``, ``.np-info``
     - The "Picked: …" line and the "in the hat" line.
   * - ``.namepicker.np-projector``
     - Projector view.

Card colours come from a 12-colour palette in the script (``PALETTE``), each
card's ``background-color`` set inline. Change it there, or override with
``!important`` in your own stylesheet.

.. code-block:: css

   /* _static/custom.css, loaded with html_css_files = ["custom.css"] */
   .namepicker.lab .np-title { background: #166534; }
   .namepicker.lab .np-pick { background: #7c3aed; }

.. note::

   ``.np-card`` must stay 56 px tall (or change ``CARD_H`` in the script to
   match), because the script positions cards in pixels. **Print** uses its own
   fixed print styles.


Browser support
---------------

Current Chrome, Edge, Firefox and Safari. Uses ``localStorage``, ``FileReader``,
``TextDecoder``, ``requestAnimationFrame``, CSS transforms, the Fullscreen API
and (for Sound) the Web Audio API. Without Web Audio, the picker works silently.