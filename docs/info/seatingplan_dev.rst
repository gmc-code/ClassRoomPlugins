=================================
Seating Plan developer reference
=================================

Technical reference for the ``seatingplan`` Sphinx extension: installing it,
the directives and their options, the plan file, browser storage, how seats are
worked out, and how to restyle a plan. For how teachers use it, see
:doc:`/info/seatingplan_info`; for the twelve-plan page, see
:doc:`/info/seatingplans_dev`.

----

Files and installation
----------------------

.. code-block:: text

   seatingplan/
       __init__.py
       seatingplan.py          # directives, layout parsing, roster reading
       _static/
           seatingplan.js      # the plan (plain ES5, no dependencies)
           seatingplan.css

Enable it in ``conf.py``:

.. code-block:: python

   extensions = [
       # ...
       "seatingplan",
   ]

* ``seatingplan.css`` and ``seatingplan.js`` (``defer``) are added to every HTML
  page. The files are copied into the built site's ``_static`` folder at
  ``builder-inited`` and again at ``build-finished``; ``html_static_path`` and
  ``conf.py`` are left alone (changing them made Sphinx report "configuration
  has changed" on every build).
* **Cache busting.** A SHA-1 of both assets is kept in the build environment.
  When either changes, every page with a plan is rewritten
  (``env-get-outdated``), so the ``?v=`` checksum on the tags changes and
  browsers fetch the new files.
* LaTeX/PDF, text, man and texinfo builds skip the nodes.
* The extension declares ``parallel_read_safe`` and ``parallel_write_safe``.
* **Optional dependency:** ``openpyxl``, only for ``.xlsx`` rosters at build
  time.


The ``seatingplan`` directive
-----------------------------

.. code-block:: rst

   .. seatingplan::
      :layout: 5x6
      :title: Year 8 Science
      :sort: az

      Alex Smith, H11
      Sam Jones, B11
      Priya Patel, N12

      separate: Alex Smith | Sam Jones
      pair: Priya Patel | Sam Jones
      front: Priya Patel

With no options and no content it renders an empty 5 × 6 plan; teachers then
use **Import Roster**.


Content
~~~~~~~

Each non-empty line is a student or a rule; lines starting with ``#`` are
ignored.

Students
   ``First Surname, Homeroom``. The first word is the first name, the rest the
   surname; the homeroom is optional.

Single-student rules
   ``front:``, ``back:``, ``left:``, ``right:``, ``empty:`` followed by one name.
   Types ``FRONT_ROW``, ``BACK_ROW``, ``SIT_LEFT``, ``SIT_RIGHT``,
   ``EMPTY_SEAT``.

``pair:``
   2–4 names (up to 6 in tables mode) separated by ``|``. Creates a chain of
   ``PAIR`` rules (A–B, B–C …).

``separate:``
   2 or more names. Creates a ``SEPARATE`` rule for every pair.

Names are matched case-insensitively with spaces collapsed. A rule line with
three or more names gets a group id (``"g"``), so it shows as one group in the
Rules panel.


Options
~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 24 18 58

   * - Option
     - Default
     - Description
   * - ``:layout:``
     - ``5x6`` / 8 tables of 4
     - Rows: ``5x6``, ``7,8,9,6``, ``3[1]3``, ``[2]3[2]`` (see `Layout syntax`_).
       Tables: ``6,4,6 / 4,6,4``, ``2x3``, ``2x3 6d``.
   * - ``:mode:``
     - ``rows``
     - ``rows`` or ``tables``.
   * - ``:tables-per-row:``
     - ``3``
     - Tables mode: wrap a ``/``-less list after this many tables.
   * - ``:roster:``
     - —
     - ``.xlsx``/``.csv`` file relative to the page; registered as a
       dependency. Content students are added after it.
   * - ``:title:``
     - Seating Plan
     - Starting title.
   * - ``:fill:``
     - ``first``
     - ``first`` or ``last`` (fill from the back).
   * - ``:sort:``
     - ``none``
     - ``none``, ``az``, ``za``, ``homeroom`` or ``random``.
   * - ``:one-line:``, ``:surname-initial:``, ``:hide-badges:``,
       ``:ignore-rules:``, ``:limit-desk-width:``, ``:teacher-view:``
     - off
     - Flags. Start with that display option on.
   * - ``:hide-homeroom:``
     - off
     - Flag. Start with **Show Homeroom** off.
   * - ``:hide-row-controls:``
     - off
     - Flag. Start with **Row Controls** off.
   * - ``:storage-key:``
     - ``<docname>#<n>``
     - Browser storage id (see `Browser storage`_).
   * - ``:class:``
     - —
     - Extra classes on the plan (see `Restyling a plan with :class:`_).


Layout syntax
~~~~~~~~~~~~~

**Rows** (front row first): a comma list of rows, or ``RxD`` for *R* rows of *D*
desks (``×`` also works). Inside a row, a number is desks and ``[n]`` is *n*
desk-widths of empty floor; adjacent runs of the same kind are merged.
Limits: 1–12 rows, 1–20 desks per row, at most 24 places wide.

**Tables** (front row of tables first): table codes ``4`` (2 × 2), ``6`` or
``6w`` (3 wide × 2 deep) and ``6d`` (2 wide × 3 deep), commas between tables and
``/`` between rows. ``RxT`` gives *R* rows of *T* tables of 4; ``RxT 6`` or
``RxT 6d`` uses tables of 6. Limits: up to 8 rows of 8 tables.

Rows and tables layouts are kept separately, so switching mode doesn't lose
either.


Build warnings
~~~~~~~~~~~~~~

Reported as Sphinx warnings at the directive; the build continues:

* invalid ``:layout:`` → 5 × 6 (rows) or 8 tables of 4 (tables);
* roster can't be read;
* two students with the same name (rules use the first);
* a rule naming an unknown student, with the wrong number of names, or naming
  someone twice → that rule line is skipped.


The ``seatingplan-print`` directive
-----------------------------------

A button that prints every plan on the page, one per landscape sheet:

.. code-block:: rst

   .. seatingplan-print::
      :label: Print all my classes
      :skip-empty:

.. list-table::
   :header-rows: 1
   :widths: 22 78

   * - Option
     - Description
   * - ``:label:``
     - Button text. Default *Print all seating plans*.
   * - ``:title:``
     - Print window title. Default: the page's ``document.title``.
   * - ``:skip-empty:``
     - Flag. Leave out plans with no students.
   * - ``:class:``
     - Extra classes on the button's container.

It collects every ``.seatingplan[data-seatingplan]`` on the page through the
``spPrintSection()`` function each plan attaches to its root element.


How the page is built
---------------------

The directive renders::

   <div class="seatingplan [classes]" data-seatingplan="{...json...}">
     <noscript>JavaScript is required to show the seating plan.</noscript>
   </div>

``data-seatingplan`` holds the build-time configuration: ``id``, ``title``,
``layout`` (list of rows), ``mode``, ``tables`` (rows of table codes, or
``null``), ``tablesPerRow``, ``fill``, ``sort``, ``display`` (the eight display
flags), ``students`` (``firstName``, ``surname``, ``homeroom``) and ``rules``
(``type``, ``a``, ``b`` as student indexes, optional ``g``).

``seatingplan.js`` runs immediately, on ``DOMContentLoaded`` and on ``load``,
and starts a plan for each element not already marked ``data-sp-ready``. The
Rules panel is appended to ``<body>`` as ``.sp-modal``.

**Start-up and precedence.** The build-time configuration sets the defaults. If
``localStorage`` holds a saved plan for this storage id, it replaces them, and
students go back to their saved desks. Otherwise students are arranged with
``sort``. So editing the directive has no visible effect for a teacher who has
used the plan until they press **Reset**; changing ``:storage-key:`` gives
everyone a fresh plan.


How seats are worked out
------------------------

Only students with rules are placed by the solver; everyone else fills the
remaining desks in the chosen sort order (desks in reverse with
**Fill: Last → First**), skipping desks reserved by *empty seat* rules.

**The room.** Each desk knows its row and column (empty floor counts towards the
column, so desks either side of a gap are not neighbours), which run of desks it
is in, and its 2-desk block (desks 1–2, 3–4 … counted from the start of each
run). In tables mode each desk knows its table, its row of tables and the
table's position in that row.

.. list-table::
   :header-rows: 1
   :widths: 22 39 39

   * - Rule
     - Rows
     - Tables
   * - Front / back
     - First / last row
     - First / last row of tables
   * - Left / right
     - First / last desk of the row
     - First / last table in its row
   * - Empty seat
     - A reserved desk directly left or right
     - A reserved seat at the same table
   * - Keep apart
     - Not adjacent, including diagonally
     - Not at the same table
   * - Keep together
     - Same row and run: 2 share a block (or, failing that, any two neighbours);
       3 on neighbouring desks; 4 fill two adjacent blocks
     - Same table

**The search.** Each ruled student (plus a placeholder for each reserved empty
desk) is a variable whose domain is the desks meeting its single-student rules.
A depth-first search with forward checking picks the variable with the fewest
remaining desks, breaking ties by rule priority (left/right, then front, back,
keep apart, keep together, empty seat) and then by number of links. Keep-apart
students try desks with the most free neighbours first. The search stops after
60,000 steps.

**Fallbacks.** Pairs are first required to share a 2-desk block, then any
neighbours. A random arrangement that fails is retried in order. If no seating
meets every rule, rules are added back one at a time in their original order,
and any rule that can't be met is dropped and reported.

**Red desks** are checked separately after every change, using the same room
rules, so hand-made changes are flagged too.


Plan file and storage
---------------------

**Export JSON**, **Import JSON** and the browser copy use:

.. code-block:: json

   {
     "title": "8 Science W9",
     "mode": "tables",
     "layout": [6, 6, 6, 6, 6],
     "tables": [["4", "4", "4", "4"], ["4", "4", "4", "4"]],
     "fillFromLast": false,
     "sortMode": "RANDOM",
     "students": [{"id": "student-0", "firstName": "Luca", "surname": "Antonelli",
                   "fullName": "Luca Antonelli", "homeroom": "H11"}],
     "rules": [
       {"id": "rule-1", "student1Id": "student-6", "student2Id": null,
        "type": "BACK_ROW"},
       {"id": "rule-2", "student1Id": "student-0", "student2Id": "student-1",
        "type": "PAIR", "group": "g-mv8kc658wwi"}
     ],
     "display": {"surnameInitial": false, "homeroom": true, "ignoreRules": false,
                 "oneLine": true, "hideBadges": false, "limitWidth": false,
                 "teacherView": true, "rowControls": true},
     "placement": [{"deskIndex": 0, "studentId": "student-13"},
                   {"deskIndex": null, "studentId": "student-20"}]
   }

* ``layout`` holds rows: numbers, or strings such as ``"[2]3[2]"`` for rows with
  gaps. ``tables`` holds rows of table codes (``4``, ``6w``, ``6d``).
* ``deskIndex`` counts desks as they are built, from 0: row by row from the
  front row (left to right), or table by table. It does not change with
  **Fill** or **Teacher's View**. ``null`` means *Unassigned*.
* Rule types: ``FRONT_ROW``, ``BACK_ROW``, ``SIT_LEFT``, ``SIT_RIGHT``,
  ``EMPTY_SEAT`` (``student2Id`` null), ``PAIR`` and ``SEPARATE``. ``group``
  groups rules in the Rules panel.

**Import checks:** ``students`` and ``layout`` must be lists and the layout must
be valid; in tables mode ``tables`` must be valid too. Students without an id,
or with a repeated id, are dropped. Files from older versions without
``display`` or ``placement`` still load (students are then arranged afresh).
Nothing changes unless the file passes.

The student groups tool also reads these files (see
:doc:`/info/studentgroups_dev`).


Browser storage
~~~~~~~~~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 46 54

   * - Key
     - Contents
   * - ``seatingplan:<storage-key>``
     - The current plan, saved after every change.
   * - ``seatingplan:<storage-key>:imported``
     - ``{kind, name, data}``: the last JSON imported or exported, or roster
       imported, for **Revert**.

``<storage-key>`` defaults to ``<docname>#<n>``, where *n* counts plans on the
page from 0. **Renaming or moving the page, or inserting a plan above another,
changes the key** and the plan starts fresh (the old data stays under the old
key). Set ``:storage-key:`` where this matters. ``localStorage`` is per origin,
so all versions of the docs on one domain share keys. With storage blocked the
plan works but forgets everything when the page closes.

**Export JSON** uses ``showSaveFilePicker`` where available (Chrome and Edge on
``https``/``localhost``), otherwise a file-name prompt and a normal download.
**Import Roster** loads SheetJS (``xlsx@0.18.5`` from cdn.jsdelivr.net) the
first time an Excel file is chosen; CSV needs no download.


Restyling a plan with ``:class:``
---------------------------------

``:class:`` adds your own class names to the plan, so you can restyle that
plan without touching the directive's CSS. Several names can be given,
separated by spaces.

**1. Add the class to the plan:**

.. code-block:: rst

   .. seatingplan::
      :layout: 3x10
      :title: 9 Science 2 – Lab B
      :class: lab-room roomy

**2. Write the CSS** in your own stylesheet, e.g. ``_static/custom.css``.
Start each rule with ``.seatingplan.`` and your class name, so it applies
only to plans with that class:

.. code-block:: css

   /* Taller desks and wider gaps between desks */
   .seatingplan.roomy {
       --sp-desk-height: 95px;            /* desk height (default 75px) */
       --sp-desk-height-projector: 130px; /* in Projector View (default 112px) */
       --sp-row-gap: 14px;                /* gap between desks in a row (default 8px) */
   }
   .seatingplan.roomy .sp-grid { gap: 16px; }   /* gap between rows */

   /* A green title bar to mark lab plans */
   .seatingplan.lab-room .sp-title { background: #166534; }

**3. Load the stylesheet** in ``conf.py``:

.. code-block:: python

   html_static_path = ["_static"]
   html_css_files = ["custom.css"]

The settings you can override directly are:

* ``--sp-desk-height``: desk height on screen
* ``--sp-desk-height-projector``: desk height in **Projector View**
* ``--sp-row-gap``: gap between desks in a row
* ``--sp-limit-seats``: the desk count that **Limit Desk Width** matches
  (default 6)

Anything else can be targeted through the plan's own classes, e.g.
``.sp-title``, ``.sp-whiteboard``, ``.sp-desk``, ``.sp-card`` and ``.sp-grid``.

.. note::

   Extra classes change the plan **on screen and in Projector View only**.
   **Print** and **Print all my classes** use their own fixed print styles,
   so printouts look the same for every plan.


Other style hooks
~~~~~~~~~~~~~~~~~

The root element also gets state classes: ``sp-compact``, ``sp-hide-badges``,
``sp-teacher-view``, ``sp-hide-row-ctrl`` and ``sp-projector``. Keep-together
colours are set per card as ``--sp-grp-fg`` and ``--sp-grp-bg``. One-line names
use ``--sp-desk-height-compact`` (default 48px) for the desk height.


Browser support
---------------

Current Chrome, Edge, Firefox and Safari. The plan uses ``localStorage``,
``FileReader``, ``TextDecoder``, HTML drag and drop and the Fullscreen API
(projector view falls back to a full-window overlay). Dragging is unreliable on
some touch devices.
