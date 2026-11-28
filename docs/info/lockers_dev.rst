=====================================
Locker Allocation developer reference
=====================================

Technical reference for the ``lockers`` Sphinx extension. For how teachers use
it, see :doc:`/info/lockers_info`. The extension is built the same way as
:doc:`/info/seatingplan_dev`.

----

Files and installation
----------------------

.. code-block:: text

   lockers/
       __init__.py
       lockers.py          # directive, range parsing, roster reading
       _static/
           lockers.js      # the tool (plain ES5; loads SheetJS on demand for .xlsx)
           lockers.css

Enable it in ``conf.py``:

.. code-block:: python

   extensions = [
       # ...
       "lockers.lockers",
   ]

* ``lockers.css`` and ``lockers.js`` (``defer``) are added to every HTML page and
  copied into the built ``_static`` folder at ``builder-inited`` and
  ``build-finished``, as for ``seatingplan``.
* When either asset changes, every page with a locker tool is rewritten
  (``env-get-outdated``) so the ``?v=`` checksum updates.
* Non-HTML builders skip the node. Parallel read and write safe.
* Optional: ``openpyxl`` for ``.xlsx`` rosters at build time.

The ``lockers`` directive
-------------------------

.. code-block:: rst

   .. lockers::
      :title: Year 7 lockers
      :lockers: Corridor A: 101-140; Corridor B: 201-240
      :tiers: 2
      :order: down

      Alex Smith, H11
      Sam Jones, B11 = 105
      Priya Patel, N12 = 106

      bank: Gym: G1-G24
      unavailable: 112, 118-120
      year 7: Corridor A, 201-210

Options
~~~~~~~

``:title:``
   Title bar text. Teachers can click it to change it.

``:lockers:``
   Banks separated by ``;``. Each bank is ``Name: ranges`` or just ``ranges``
   (named *Bank 1*, *Bank 2* ...), optionally followed by ``| options``:
   ``N high`` (also ``Nhigh``, ``tiers N``), ``down``/``across``,
   ``odd-top``/``even-top`` (2-high banks: ``parityLayout()`` pairs lockers by
   number, so odd or even numbers are always in the top row and gaps are left
   for missing lockers; column order follows the bank's own order, flipped for
   ``right``), and ``left``/``right`` and ``top``/``bottom`` override ``:tiers:``,
   ``:order:``, ``:start:`` and ``:first-row:`` for that bank, e.g.
   ``A3: 543-550 | 2 high right``.

``:tiers:``
   1 to 6 (default 1). How many lockers high each column is.

``:order:``
   ``down`` (default) or ``across``: which way the numbers run when tiers > 1.

``:start:``
   ``left`` (default) or ``right``: which end of each bank the first locker
   is at.

``:first-row:``
   ``top`` (default) or ``bottom``: which row the first locker is in (tiers > 1).

``:roster:``
   A CSV or ``.xlsx`` file, relative to the page. Columns as for **Import
   Roster**, including an optional **Locker** column.

``:surname-initial:``, ``:hide-homeroom:``, ``:tutor-group-colours:``
   Starting display options. ``:tutor-group-colours:`` starts with
   **Tutor group colours** ticked.

``:storage-key:``
   Browser storage name. Defaults to ``<docname>#<n>``. Give two pages the same
   key to share one set of allocations.

``:class:``
   Extra CSS classes on the outer ``div``.

Content lines
~~~~~~~~~~~~~

``First Surname[, Homeroom][ = Locker]``
   A student, optionally with a locker.

``bank: [Name:] ranges [| options]``
   Another bank (added after those in ``:lockers:``).

``[Area name]`` or ``area: Area name``
   Starts an area. The ``bank:`` lines after it belong to it and are shown
   side by side under the heading. ``[]`` ends the area.

``---``
   Ends the row of banks: the next bank starts a new line on the left (it gets
   ``"br": true``). In ``:lockers:`` write it as its own item,
   e.g. ``A: 1-4; ---; B: 5-8``.

``unavailable: ranges`` (also ``out:`` or ``broken:``)
   Lockers that start out of service.

``year N: lockers`` (also ``yr N:`` or ``yN:``)
   Keeps lockers for year level *N*: bank or area names, ranges and single
   lockers, separated by commas. ``Corridor A top``, ``Corridor A bottom`` or
   ``Corridor A row 2`` is one row of a bank (as shown on screen, row 1 at the
   top); ``top`` or ``bottom`` on its own is that row of every bank more than
   one locker high. A–Z, Homeroom and Random only put Year *N*
   students in them. Names are matched in the page (lockers.js), so the build
   doesn't check them; unknown ones are listed in the page's **Year levels**
   dialog.

Lines starting with ``#`` are ignored.

Locker ranges
-------------

Ranges are expanded identically by ``expand_spec()`` in ``lockers.py`` and
``expandSpec()`` in ``lockers.js``. Keep them in step.

======================  ==============================================
Item                    Lockers
======================  ==============================================
``101-105``             101, 102, 103, 104, 105
``A1-A3``, ``A1-3``     A1, A2, A3 (both ends must share any letters)
``007-010``             007, 008, 009, 010 (leading zero keeps width)
``110-108``             110, 109, 108 (descending is allowed)
``B12``                 a single locker; letters, digits, ``.`` and ``/``
======================  ==============================================

Bank layout
~~~~~~~~~~~

``bankLayout()`` in ``lockers.js`` gives every locker an explicit
``grid-column`` / ``grid-row`` from its position in the bank, the tiers, the
order and the bank's start side and row (``tiers: 0`` and blank
``order``/``side``/``row`` use the tool-wide setting). Banks in an area are a
flex row that wraps. A 1-high bank is only as wide as its lockers (a
flex row of cells that wraps only when it runs out of room). A bank with ``br``
gets a full-width ``.lk-row-break`` element before it (``.lk-prow-break`` in
Print), so it starts on a new line. Print uses the same function. With 1 tier the bank is a
wrapping row instead, with ``direction: rtl`` when it starts on the right.

Limits: 1000 lockers per range, 2000 per tool. Locker numbers are matched
without regard to capitals; a number listed twice is kept only the first time.

Build warnings
~~~~~~~~~~~~~~

* a bank whose ranges cannot be read (the bank is skipped)
* lockers listed more than once
* an ``unavailable`` locker not in any bank
* a student's locker not in any bank (added to an *Other* bank in the page)
* two students given the same locker (the first keeps it)

Saved data
----------

The tool saves to ``localStorage`` under ``lockers:<storage-key>`` after every
change, and **Save** writes the same object:

.. code-block:: json

   {
     "title": "Year 7 lockers",
     "banks": [{ "name": "A3", "spec": "543-550", "area": "Corridor A",
                 "tiers": 2, "order": "", "side": "right", "row": "",
                 "top": "", "br": false }],
     "tiers": 2,
     "order": "down",
     "side": "left",
     "row": "top",
     "students": [{ "id": "s…", "firstName": "Alex", "surname": "Smith", "year": "7", "homeroom": "H11",
                    "combo": "07 33 03", "extra": { "TG": "7A", "House": "Red" } }],
     "assign": { "101": "s…" },
     "out": { "112": true },
     "reserve": { "101": "7", "102": "7" },
     "keepExisting": true,
     "display": { "homeroom": true, "field": "yearroom", "surnameInitial": false }
   }

``reserve`` maps a locker id to the year level it is kept for (set by **Year
levels**, a bank's ⚙ Year level, or ``year N:`` lines in the directive).
``autoAllocate()`` fills each year's kept lockers with that year's students
first, then lockers with no entry; a kept locker is never given to another
year by the automatic allocation.

``year`` (digits only, e.g. ``"7"``) and ``homeroom`` (e.g. ``"H13"``) are
stored separately by ``parseHomeroom(hr, year)``. The year comes from a
Year/Year Level/Yr/Grade column or "Year 7" inside the homeroom text; an old
combined value like ``7 H13`` is split on load. ``roomOf()`` falls back to a
House column shortened the same way.

``display.field`` is ``auto`` (``yearroom`` when any student has a year, else
``homeroom``), ``year`` (``Y7``), ``homeroom`` (``H13``), ``yearroom``
(``7 H13``), ``none``, or an extra column name. Columns matching
``HIDDEN_COLS`` (house, gender, sex, email, phone, mobile, date of birth,
address, student ID) are stored and exported but not offered as badges or
shown in tooltips.

``extra`` holds every roster column that isn't a name, homeroom, year, locker,
status or bank column (``KNOWN_COLS`` in both files). ``display.field`` also decides the group-allocate sort. **Add** matches students on normalised
``first surname`` (or ``surname first``) and overwrites homeroom and extra
values with any non-blank value from the file.

``assign`` maps locker number to student ``id``. On import, entries for
lockers or students that do not exist are dropped.

Lock combinations
~~~~~~~~~~~~~~~~~

Each student's ``combo`` holds their padlock combination, so it moves with
them when they change lockers; ``comboOf(locker)`` reads the combination of
whoever is in a locker. (Older saves with a top-level ``combo`` map of locker
to combination are converted on load: each combination goes to the student in
that locker.) ``normCombo()`` tidies ``7-33-3`` or ``073303`` to
``07 33 03`` (2–5 groups of up to three digits); anything else is kept as
typed. Combination columns (``Locker Combo``, ``Combo``, ``Combination``,
``Lock Combo``, ``Locker Combination``) are read by **Import**, **Add**,
**Paste** (heading rows) and by ``:roster:`` files at build time.
``display.combo`` shows them under the name.

``display.tgColours`` colours a strip along the top of each filled locker (the
line with the number and badge) by tutor group (``tutorGroup()``: the
``tg`` column, else year + homeroom). Groups are sorted naturally
(``7A`` … ``7I``) and given ``TG_COLOURS`` in turn: nine colours, used again
from the start if there are more groups. The strip is a ``::before`` on
``.lk-cell.lk-tg`` (``--lk-tg``), so it sits over the year colour; **Print**
draws it as a 15 px band.

Paste reads a heading row when the first line has a recognised heading
(surname, first name or locker); otherwise each line is split on tabs, commas
or semicolons, a field matching ``COMBO_RE`` is taken as the combination (or
the last three 1–2 digit numbers on a space-separated line), and a lone 1–2
digit number is taken as the year level rather than part of the name.

Export layouts
~~~~~~~~~~~~~~

**Export** writes CSV (UTF-8 with BOM) or ``.xlsx`` (SheetJS, loaded from the
CDN on demand; numeric cells are written as numbers).

Simple: ``Surname Name, First Name, Year Level, Locker number`` and optionally
``Locker Combo``. Year Level is ``7`` or ``Year 7``; rows are ordered by
surname or by locker (students without a locker last); students without a
locker can be left out.

Full: ``Locker, Bank, Locker Combo, First Name, Surname, Year, Homeroom,
<every extra column>, Status``. Status is blank, ``Free``, ``Out of service`` or
``No locker``.

School system: ``Locker ID``, ``Location / room``, ``Surname, firstname``,
``Tutor group``, one row per allocated locker (free and out-of-service lockers
are skipped), in locker order or by surname. *Location / room* is the bank's
``area``, or its ``name`` when it has none (``location: "bank"`` always uses the
name). **Download** writes it as ``.xlsx`` or CSV like the other layouts.
**Copy without headings** writes the rows minus the heading row as
tab-separated lines (``tabText()``; a tab or line break inside a value becomes a
space), so a paste into Excel fills one column per value, using
``navigator.clipboard.writeText`` (falling back to ``execCommand('copy')``).
*Tutor group* comes from ``tutorGroup()``: the student's ``tg``, the homeroom
text exactly as imported (``parseHomeroom()`` splits ``7B`` into ``year: "7"``
and ``homeroom: "B"`` for badges, so ``tg`` keeps the original). Students saved
before ``tg`` existed fall back to year + a letter-only room (``7`` + ``B``), else
the room.

The simple and full lists read back through **Import** (``Surname Name``,
``Locker number`` and ``Locker Combo`` are recognised column names). The
dialog's choices are kept in ``display.exportPrefs`` (``layout``, ``format``,
``location``, ``schoolSort`` …).

Name matching (Paste)
---------------------

Each line is split on tabs, commas or semicolons (or spaces if there are none).
The locker is the first field that is a known locker, else the last field
containing a digit. The other fields form the name, matched against
``First Surname`` and ``Surname First`` after lower-casing, collapsing spaces
and removing accents. Two students with the same name make the line ambiguous,
and it is skipped.

Quick-entry suggestions rank: whole-name prefix, first-name or surname prefix,
anywhere in the name, then initials (``as`` or ``a sm``). Students who already
have a locker come after those who do not.

Styling
-------

All classes start ``lk-``. The locker width is the CSS variable
``--lk-cell-w`` (default ``112px``) on ``.lockers``:

.. code-block:: css

   .lockers.wide-lockers { --lk-cell-w: 140px; }

Main states: ``.lk-cell.lk-free``, ``.lk-filled``, ``.lk-out``,
``.lk-selected``, ``.lk-hit`` (search match), ``.lk-drag-over``.
