=====================================
Student Groups developer reference
=====================================

Technical reference for the ``studentgroups`` Sphinx extension: installing it,
the directives and their options, the file formats, browser storage, how
groups are worked out, and how to restyle the planner. For how teachers use
it, see :doc:`/info/studentgroups_info`.

----

Files and installation
----------------------

.. code-block:: text

   studentgroups/
       __init__.py
       studentgroups.py          # directives, roster reading, build-time checks
       _static/
           studentgroups.js      # the planner (plain ES5, no dependencies)
           studentgroups.css

Put the folder where Sphinx can import it (e.g. next to ``conf.py`` with
``sys.path`` set up) and enable it:

.. code-block:: python

   extensions = [
       # ...
       "studentgroups",
   ]

* ``studentgroups.css`` and ``studentgroups.js`` (``defer``) are added to every
  HTML page. The files are copied into the built site's ``_static`` folder at
  ``builder-inited`` and again at ``build-finished``, so nothing needs adding to
  ``html_static_path`` and ``conf.py`` is not changed.
* **Cache busting.** The extension keeps a SHA-1 of both assets in the build
  environment. When either file changes, every page containing a planner is
  marked out of date (``env-get-outdated``) and rewritten, so the ``?v=``
  checksum Sphinx adds to the tags changes and browsers fetch the new files.
* **Other builders.** LaTeX/PDF, text, man and texinfo builds skip the nodes.
* The extension declares ``parallel_read_safe`` and ``parallel_write_safe``.
* **Optional dependency:** ``openpyxl``, only to read ``.xlsx`` rosters at
  build time.


The ``studentgroups`` directive
-------------------------------

.. code-block:: rst

   .. studentgroups::
      :title: 8J Science
      :roster: rosters/8J.csv
      :sizes: 3x4, 5
      :sort: random
      :roles: science lab
      :group-names: elements
      :number-students:
      :one-line:
      :hide-badges:

      # students written here are added after the roster file
      Alex Smith, H11
      Sam Jones, B11

      separate: Alex Smith | Sam Jones | Tom Lee
      pair: Priya Patel | Maya Singh

With no options and no content it renders an empty planner; teachers then use
**Import Roster**.


Content
~~~~~~~

Each non-empty line is a student or a rule. Lines starting with ``#`` are
ignored.

Students
   ``First Surname, Homeroom``. Everything before the first space is the first
   name, the rest (up to the comma) the surname; the homeroom is optional. A
   one-word name gets a number as its surname.

``separate:`` / ``apart:``
   ``separate: A | B | C``. Creates a ``SEPARATE`` rule for **every pair**
   (A–B, A–C, B–C).

``pair:`` / ``together:``
   ``pair: A | B | C``. Creates a **chain** of ``PAIR`` rules (A–B, B–C); the
   planner treats a connected chain as one keep-together block.

Rule names are matched against the roster case-insensitively, with runs of
spaces collapsed. A rule line naming three or more students gets a group id
(``"g"``), so it shows as one group in the Rules panel.


Options
~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 22 16 62

   * - Option
     - Default
     - Description
   * - ``:title:``
     - Student Groups
     - Starting title.
   * - ``:roster:``
     - —
     - ``.csv`` or ``.xlsx`` file, relative to the page (see `Roster files`_).
       Registered as a dependency, so editing it rebuilds the page.
   * - ``:size:``
     - ``4``
     - Students per group, 2–10. If the value looks like a list (contains
       ``,``, ``;``, ``x`` or two numbers), it is treated as ``:sizes:``.
   * - ``:sizes:``
     - —
     - Per-group sizes: comma, semicolon or space separated; ``NxS`` repeats
       (``3x4`` = 4, 4, 4). 1–10 each, at most 40 groups. Without ``:size:``,
       the size buttons start on the most common size in the list.
   * - ``:sort:``
     - ``none``
     - ``none``, ``az``, ``za``, ``homeroom`` or ``random`` (sent to the page as
       ``DEFAULT``, ``AZ``, ``ZA``, ``HOMEROOM``, ``RANDOM``).
   * - ``:roles:``
     - —
     - Comma or semicolon list (up to 10, 30 characters each) or a set name:
       ``classic``, ``science lab``, ``discussion``, ``pair programming``,
       ``maths``, ``reading circle``, ``project team``, ``encourager``
       (aliases: ``science``, ``lab``, ``coding``, ``microbit``,
       ``programming``, ``math``, ``reading``, ``project``, ``default``). A
       leading emoji sets that role's icon. Turns ``showRoles`` on.
   * - ``:show-roles:``
     - off
     - Flag. ``showRoles`` on with the classic roles.
   * - ``:group-names:``
     - —
     - A theme keyword (``elements``, ``planets``, ``scientists``, ``colours``;
       also ``element``, ``planet``, ``moons``, ``colour``, ``color``,
       ``colors``), ``numbers`` for none, or a comma list of names (80
       characters each).
   * - ``:number-students:``
     - off
     - Flag. ``display.numberStudents``.
   * - ``:align-left:``
     - off
     - Flag. ``display.alignLeft``.
   * - ``:large-icons:``
     - off
     - Flag. ``display.bigIcons``.
   * - ``:one-line:``
     - off
     - Flag. ``display.oneLine``.
   * - ``:surname-initial:``
     - off
     - Flag. ``display.surnameInitial``.
   * - ``:hide-homeroom:``
     - off
     - Flag. ``display.homeroom`` = false.
   * - ``:hide-badges:``
     - off
     - Flag. ``display.hideBadges``.
   * - ``:ignore-rules:``
     - off
     - Flag. ``display.ignoreRules``.
   * - ``:storage-key:``
     - ``<docname>#<n>``
     - Browser storage id (see `Browser storage`_).
   * - ``:class:``
     - —
     - Extra classes on the planner's root ``div``.


Build warnings
~~~~~~~~~~~~~~

These are reported as Sphinx warnings with the directive's location; the build
continues (so they fail only with ``-W``):

* ``:size:`` not a whole number from 2 to 10 → uses 4.
* ``:sizes:`` not valid → uses groups of one size.
* Roster can't be read (missing file, bad encoding, ``openpyxl`` not installed)
  or has no students.
* Two students with the same full name (rules use the first).
* A rule with fewer than two names, a name repeated, or a name not in the roster
  → that rule line is skipped.
* Keep-together chains linking more students than the largest group, or a
  ``separate`` rule between students linked by ``pair`` rules (these can never
  be met; the page drops them and says so).


Roster files
~~~~~~~~~~~~

The header row is matched case-insensitively. Recognised columns:
``Preferred`` / ``First Name`` / ``FirstName``, ``Surname`` / ``Last Name`` /
``LastName``, ``Homeroom``. Other columns are ignored and blank rows skipped.

* **CSV:** UTF-8 (with or without BOM) or UTF-16 with BOM. The delimiter
  (comma, tab or semicolon) is sniffed.
* **Excel:** first worksheet only, read with ``openpyxl`` in read-only,
  values-only mode; whole-number floats such as ``11.0`` become ``11``.
* **Homeroom** is shortened in the browser to its first character plus the last
  two digits (``H-Room 211`` → ``H11``).

**Import Roster** in the browser reads the same columns. CSV is parsed by the
script itself; ``.xlsx``/``.xls`` loads SheetJS
(``xlsx@0.18.5`` from cdn.jsdelivr.net) the first time it is needed, so Excel
import needs internet access.


The ``studentgroups-print`` directive
-------------------------------------

Adds a button that prints every planner on the page, one per landscape sheet.

.. code-block:: rst

   .. studentgroups-print::
      :label: Print all my classes
      :title: Term 3 groups
      :skip-empty:

.. list-table::
   :header-rows: 1
   :widths: 22 78

   * - Option
     - Description
   * - ``:label:``
     - Button text. Default *Print all groups*.
   * - ``:title:``
     - Print window title. Default: the page's ``document.title``.
   * - ``:skip-empty:``
     - Flag. Leave out planners with no students.
   * - ``:class:``
     - Extra classes on the button's container.

The button finds every ``.studentgroups[data-studentgroups]`` element on the
page and calls the ``sgPrintSection()`` function each planner attaches to its
root element. If there is nothing to print, a message appears beside the
button.


How the page is built
---------------------

The directive renders::

   <div class="studentgroups [classes]" data-studentgroups="{...json...}">
     <noscript>JavaScript is required to show the group planner.</noscript>
   </div>

``data-studentgroups`` holds the build-time configuration:

.. code-block:: json

   {
     "id": "tools/groups#0",
     "title": "8J Science",
     "groupSize": 4,
     "groupSizes": [4, 4, 4, 5],
     "roles": ["Investigator", "Recorder"],
     "groupNames": {"theme": "elements"},
     "sort": "RANDOM",
     "display": {"oneLine": true, "surnameInitial": false, "homeroom": true,
                 "hideBadges": true, "ignoreRules": false, "showRoles": true,
                 "numberStudents": true, "alignLeft": false, "bigIcons": false},
     "students": [{"firstName": "Alex", "surname": "Smith", "homeroom": "H11"}],
     "rules": [{"type": "SEPARATE", "a": 0, "b": 1, "g": "d0-0"}]
   }

``groupNames`` is ``{"theme": ...}``, ``{"list": [...]}`` or ``null``. In
``rules``, ``a`` and ``b`` are indexes into ``students``.

``studentgroups.js`` runs immediately, on ``DOMContentLoaded`` and on ``load``,
and builds a planner for each element not already marked ``data-sg-ready``. If a
planner fails to start, the error is logged and shown in place of the planner.
The Rules, Attendance and Group Options panels are appended to ``<body>`` as
``.sg-modal`` elements.


Start-up and precedence
~~~~~~~~~~~~~~~~~~~~~~~

#. The build-time configuration sets the page's defaults.
#. If ``localStorage`` holds a saved plan for this storage id, it replaces them
   completely, including where every student was placed.
#. Otherwise the students are arranged using ``sort``.

So once a teacher has used a planner, editing the directive has no visible
effect for them until they press **Reset**. To push a changed class list to
everyone, change ``:storage-key:``, which gives everyone a fresh plan.


How groups are worked out
-------------------------

Arranging (sort buttons, size changes, Regroup) is done by a pure function,
``planGroups(students, rules, sizes, {randomise, exact, fixed})``:

#. **Blocks.** ``PAIR`` rules are merged with union–find, so each keep-together
   chain becomes one block. ``SEPARATE`` rules become conflict edges between
   blocks. A ``SEPARATE`` rule inside a block, a block larger than the biggest
   group, or a block containing students locked into two different groups makes
   that rule set infeasible.
#. **Capacities.** With one size for every group (``exact`` false), the planner
   first tries *balanced* capacities (the class spread evenly, sizes differing
   by at most one), then the full group sizes. With custom sizes it uses the
   sizes as given.
#. **Search.** Only constrained blocks (keep-together blocks, students with
   keep-apart rules, locked students) are placed by depth-first search. It
   always picks the block with the fewest possible groups, preferring bigger
   blocks and more conflicts on ties, and tries the emptiest groups first. Locked
   students may only go in their own group. The search stops after 20,000 steps.
#. **Dropping rules.** If no arrangement exists, rules are added back one at a
   time in their original order, and any rule that makes the set infeasible is
   dropped and reported. If even locks alone can't be kept (because the sizes
   changed), the locks are released.
#. **Everyone else** fills the remaining places in the chosen sort order,
   always into the group that would be least full afterwards, as a share of
   its size. Groups of mixed sizes therefore fill in proportion to their size.
   With **Random Grouping**, ties are broken at random.

Then locked students go back into their exact slot, and the others fill the
group's free slots in order. Students who don't fit go to *Unassigned*.

The number of groups (one size for every group) is
``ceil(students present / size)`` and is kept until the next arrangement, so
marking a student back from *Away* doesn't add or remove a group on its own.

**Rule checking for red highlights** is separate: after any change, every
``PAIR`` rule with the two students in different groups, and every
``SEPARATE`` rule with them in the same group, marks both slots
``.sg-conflict`` (unless ``hideBadges`` is on).

**Roles** are assigned per group by slot order of the occupied slots: the
student in position *k* of *m* gets ``roles[(k − roleOffset) mod m]``.


JSON file format
----------------

**Export JSON** (and the browser copy) uses this shape; ``version`` is
currently 2:

.. code-block:: json

   {
     "app": "studentgroups",
     "version": 2,
     "title": "8J Science",
     "groupSize": 4,
     "groupSizes": null,
     "groupCount": 7,
     "sortMode": "RANDOM",
     "students": [{"id": "student-0", "firstName": "Alex", "surname": "Smith",
                   "fullName": "Alex Smith", "homeroom": "H11"}],
     "rules": [{"id": "rule-1", "student1Id": "student-0",
                "student2Id": "student-1", "type": "SEPARATE", "group": "g-1"}],
     "groupCustomNames": {"0": "Hydrogen"},
     "display": {"surnameInitial": false, "homeroom": true, "ignoreRules": false,
                 "oneLine": true, "hideBadges": false, "showRoles": true,
                 "numberStudents": true, "alignLeft": false, "bigIcons": false},
     "absent": ["student-9"],
     "locks": {"student-4": {"g": 1, "s": 0}},
     "roles": ["🔬 Investigator", "📋 Recorder"],
     "roleOffset": 0,
     "placement": [{"slotIndex": 0, "studentId": "student-0"},
                   {"slotIndex": null, "studentId": "student-9"}]
   }

.. list-table::
   :header-rows: 1
   :widths: 22 78

   * - Field
     - Notes
   * - ``groupSize`` / ``groupSizes`` / ``groupCount``
     - ``groupSizes`` (list, 1–10 each, ≤ 40) wins when present; otherwise
       ``groupCount`` groups of ``groupSize`` (2–10).
   * - ``sortMode``
     - ``DEFAULT``, ``AZ``, ``ZA``, ``HOMEROOM`` or ``RANDOM``.
   * - ``students``
     - ``id`` must be unique; duplicates are dropped. Names are trimmed;
       ``fullName`` is rebuilt on import.
   * - ``rules``
     - ``type`` ``PAIR`` or ``SEPARATE``; rules naming unknown students, or the
       same student twice, are dropped and counted in the import message.
       ``group`` (optional) groups ``SEPARATE`` rules in the Rules panel.
   * - ``groupCustomNames``
     - Keys are 0-based group indexes as strings; up to 80 characters each.
   * - ``display``
     - Any subset; only boolean values are used.
   * - ``absent`` / ``locks``
     - Student ids. Lock ``g`` and ``s`` are 0-based group and slot.
   * - ``roles`` / ``roleOffset``
     - Up to 10 roles of up to 30 characters; a leading emoji is the icon.
   * - ``placement``
     - ``slotIndex`` counts slots through the groups in order (0-based);
       ``null`` = not in a group. Students missing from the list go to
       *Unassigned*. An empty or missing list means "arrange afresh".

**Import checks** (nothing changes unless all pass):

* the file is under 2 MB and valid JSON;
* ``app``, if present, is ``studentgroups``, and ``version`` is not newer than
  this script;
* there is a ``students`` list and at least one student can be read.

Older files without ``app``, ``display`` or ``placement`` load normally.

**Seating plan files** are recognised by a ``layout`` list (and no ``app``, or
``app: "seatingplan"``) and converted. In tables mode each table becomes a
group (``4`` → 4 places, ``6``/``6w``/``6d`` → 6) in desk order; in rows mode
each row becomes a group, split evenly into groups of up to 10. Empty
tables/rows are dropped, ``groupSizes`` is set from the remaining ones, and
students keep their table-mates. Only ``PAIR`` and ``SEPARATE`` rules are
kept.


Browser storage
---------------

All data stays in ``localStorage`` on the teacher's device. Nothing is sent to
a server.

.. list-table::
   :header-rows: 1
   :widths: 46 54

   * - Key
     - Contents
   * - ``studentgroups:<storage-key>``
     - The current plan (the JSON format above), saved after every change.
   * - ``studentgroups:<storage-key>:imported``
     - ``{kind, name, data}``: the last JSON imported or exported, or roster
       imported (``kind`` = ``json``, ``export`` or ``roster``), for **Revert**.
   * - ``studentgroups:custom-sets``
     - ``{roles: [{label, roles}], names: [{label, names}]}``: teachers' own
       role sets and name lists, shared by every planner on the site.

* ``<storage-key>`` defaults to ``<docname>#<n>``, where *n* counts planners on
  the page from 0. **Moving or renaming the page, or inserting a planner above
  another, changes the key**, so the planner starts fresh (the old data remains
  under the old key). Set ``:storage-key:`` on pages where this matters.
* Two planners with the same ``:storage-key:`` share one plan; the last one
  saved wins.
* ``localStorage`` is per origin. All versions of the docs on the same domain
  (e.g. ``/en/latest/`` and ``/en/stable/``) share the same keys.
* If storage is blocked (some privacy modes), the planner still works but
  forgets everything when the page closes; Revert stays disabled.

**Export JSON** uses the File System Access API (``showSaveFilePicker``) where
available (Chrome and Edge on ``https``/``localhost``), falling back to a
file-name prompt and a normal download.


Styling
-------

All selectors are prefixed ``sg-``. Useful hooks:

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Selector
     - What it is
   * - ``.studentgroups``
     - Root element (plus any ``:class:`` names).
   * - ``.sg-title``, ``.sg-toolbar``, ``.sg-status``
     - Title bar, toolbar, message bar.
   * - ``.sg-sidebar``, ``.sg-pool``, ``.sg-away``
     - Sidebar with *Unassigned* and *Away today*.
   * - ``.sg-role-legend``
     - The role key above the groups.
   * - ``.sg-group-box[data-size]``, ``.sg-group-header``
     - A group and its name.
   * - ``.sg-slot``, ``.sg-card``, ``.sg-first``, ``.sg-last``
     - A place, the student card in it, and the two name lines.
   * - ``.sg-badge-hr``, ``.sg-badge-grp``, ``.sg-role-icon``, ``.sg-num``
     - Homeroom badge, numbered rule badge, role icon, number.
   * - ``.sg-card.sg-has-grp``, ``.sg-card.sg-has-sep``, ``.sg-card.sg-locked``,
       ``.sg-slot.sg-conflict``
     - Keep-together colour, keep-apart card, locked card, broken rule.

The root element also gets state classes: ``sg-compact``, ``sg-hide-badges``,
``sg-show-roles``, ``sg-align-left``, ``sg-big-icons`` and ``sg-projector``.
Keep-together colours are set per card as the custom properties
``--sg-grp-fg`` and ``--sg-grp-bg``.

Restyle one planner with ``:class:`` and your own stylesheet:

.. code-block:: rst

   .. studentgroups::
      :class: lab-groups

.. code-block:: css

   /* _static/custom.css, loaded with html_css_files = ["custom.css"] */
   .studentgroups.lab-groups .sg-title { background: #166534; }
   .studentgroups.lab-groups .sg-slot { height: 84px; }

.. note::

   Styling applies on screen and in Projector View only. **Print** and the
   print-all button use their own fixed print styles, so printouts look the
   same for every planner.


Browser support
---------------

The planner targets current Chrome, Edge, Firefox and Safari. It uses
``localStorage``, ``FileReader``, ``TextDecoder``, HTML drag and drop and the
Fullscreen API (projector view falls back to a full-window overlay). Dragging
is unreliable on some touch devices.
