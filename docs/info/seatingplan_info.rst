=============================
Seating Plan Directive info
=============================

The ``seatingplan`` directive embeds an interactive classroom seating plan
designer in a documentation page.

Students can be automatically arranged, manually dragged between desks,
imported from CSV or Excel files, exported as JSON, printed, and managed using
seating rules and constraints. Rows can include empty spaces, so horseshoes,
aisles and other room shapes can be drawn.

Each plan is remembered by the browser, so a page with several directives
keeps several classes. A companion ``seatingplan-print`` directive adds one
button that prints every plan on the page.

.. contents::
   :local:
   :depth: 1

----

Quick start
-----------

Add the directive to an RST page:

.. code-block:: rst

   .. seatingplan::
      :layout: 5x6
      :title: Year 8 Science

      Alex Smith, H11
      Sam Jones, B11
      Priya Patel, N12

      separate: Alex Smith | Sam Jones
      front: Priya Patel

Directive options
-----------------

``:layout:``
   Defines the desk layout.

   * ``5x6`` — 5 rows of 6 desks (default).
   * ``4x7`` — 4 rows of 7 desks.
   * ``11,11,6`` — rows containing 11, 11 and 6 desks.
   * ``7,8,9,6`` — rows of 7, 8, 9 and 6 desks.
   * ``[2]3[2],7`` — a row of 3 desks with 2 empty spaces each side, then a
     row of 7. See `Empty spaces, aisles and horseshoes`_.
   * ``4[3]4, 1[9]1, 4[3]4, 1[9]1, 5[1]5`` — a horseshoe (the **HS 5x11** preset).

   Rows are listed front row first, separated by commas. A layout can have up
   to 12 rows of 1–20 desks each, and a row can be up to 24 places wide
   (desks plus empty spaces).

   The layout can also be changed in the browser with the layout buttons or
   the **Custom** box. See `Changing the layout`_.

   With ``:mode: tables`` the layout lists tables instead, for example
   ``6,4,6 / 4,6,4``. See `Table mode`_.

``:mode:``
   ``rows`` (default) for rows of desks, or ``tables`` for a room set out in
   tables of 4 or 6. Can also be switched in the browser with **Rows** and
   **Tables**. See `Table mode`_.

``:tables-per-row:``
   In table mode, how many tables go in each row when the layout is a single
   list without ``/`` (default 3).

``:roster:``
   Loads a roster from a CSV file or Excel workbook (``.xlsx``), relative to
   the documentation page.

   Excel support requires ``openpyxl``.

   Supported columns:

   * ``Preferred``
   * ``First Name``
   * ``Surname``
   * ``Last Name``
   * ``Homeroom``

``:title:``
   Sets the initial title displayed above the seating plan. The title can also
   be edited in the browser, and **Import Roster** replaces it with the
   imported file's name.

``:fill:``
   Determines which end of the room fills first.

   * ``first`` — fill from the first end (default).
   * ``last`` — fill from the opposite end.

``:sort:``
   Sets the initial seating order.

   * ``none`` — preserve the supplied order (default).
   * ``az`` — alphabetical order.
   * ``za`` — reverse alphabetical order.
   * ``homeroom`` — by homeroom, then by surname. Students without a homeroom
     are placed last.
   * ``random`` — random order.

``:one-line:``
   Starts with **One-line Names** ticked, so each name is shown on a single
   line.

``:surname-initial:``
   Starts with **Surname Initial Only** ticked.

``:hide-homeroom:``
   Starts with **Show Homeroom** unticked.

``:hide-badges:``
   Starts with **Hide Rule Badges** ticked.

``:ignore-rules:``
   Starts with **Ignore Rules** ticked, so the first arrangement is made
   without the rules.

``:limit-desk-width:``
   Starts with **Limit Desk Width** ticked, so rows with fewer than 6 desks
   use the same desk width as a 6-desk row instead of stretching across the
   room. See `Display options`_.

``:teacher-view:``
   Starts with **Teacher's View** ticked, so the room is shown as seen from
   the front: whiteboard at the bottom and left and right swapped. See
   `Display options`_.

These seven options take no value. They set how the page first appears; the
matching checkboxes can still be changed in the browser. See
`What the browser remembers`_.

For example, a page set up for showing the plan to the class:

.. code-block:: rst

   .. seatingplan::
      :layout: 5x6
      :title: Year 8 Science
      :one-line:
      :surname-initial:
      :hide-badges:

A room with a short front row, where the front desks should stay the same
size as the others:

.. code-block:: rst

   .. seatingplan::
      :layout: 4,6,6,6
      :limit-desk-width:

A plan to print for the teacher's desk:

.. code-block:: rst

   .. seatingplan::
      :layout: 5x6
      :title: 8 Science
      :teacher-view:

``:storage-key:``
   Names the slot the browser saves this plan in (see
   `What the browser remembers`_). If omitted, the page name and the plan's
   position on the page are used, for example ``classes/8sci#0`` for the
   first plan on ``classes/8sci.rst`` and ``classes/8sci#1`` for the second.

   Set a key when:

   * **The page may change.** Adding a plan above this one, reordering plans
     or renaming the page changes the automatic key, and the browser no
     longer finds the saved roster, rules and layout. A fixed key keeps them.
   * **Two pages should share one plan.** Plans with the same key load the
     same saved class, for example a planning page and a page for the
     projector.

   Use a short name that is unique on the site:

   .. code-block:: rst

      .. seatingplan::
         :layout: 5x6
         :title: 8 Science
         :storage-key: 8sci-2026

   Changing the key starts a fresh plan. The old saved plan stays in the
   browser but is no longer shown; export it as JSON first if it is needed.

``:class:``
   Adds CSS classes to the seating plan container, so one plan can be styled
   differently from the others. See `Customising with CSS`_.

Student and rule definitions
----------------------------

Each non-blank content line defines either a student or a seating rule.
Lines beginning with ``#`` are ignored.

Student entries
~~~~~~~~~~~~~~~

Enter students using either of these formats:

.. code-block:: text

   First Surname
   First Surname, Homeroom

For example:

.. code-block:: text

   Alex Smith
   Priya Patel, N12
   Mia Chen, Hughes 11

The first word becomes the student's first name, and the remaining text
becomes the surname. Short homeroom codes such as ``7A`` or ``N12`` are kept
as they are; longer names are shortened to the first letter and last two
digits, so ``Hughes 11`` becomes ``H11``.

Seating rules
~~~~~~~~~~~~~

Rules are entered directly below the student list.

.. list-table::
   :widths: 22 38 40
   :header-rows: 1

   * - Rule
     - Example
     - Effect
   * - Separate
     - ``separate: Alex Smith | Sam Jones``
     - Prevents the students from sitting beside each other, including
       diagonally. List more names to make a group, none of whom sit next to
       each other: ``separate: Alex Smith | Sam Jones | Tom Brown``.
   * - Pair
     - ``pair: Mia Chen | Zoe Adams``
     - Requires the students to sit side by side in the same row, in any
       order. Up to four names can be listed:

       * 2 students: the plan prefers a 2-desk block (desks 1–2, 3–4, 5–6 …)
         but any two neighbouring desks, such as 2–3, keep the rule.
       * 3 students: any three neighbouring desks.
       * 4 students: two whole blocks, i.e. desks 1–4, 3–6, 5–8 ….

       In table mode the students sit at the same table instead, up to the
       size of the largest table.
   * - Front row
     - ``front: Priya Patel``
     - Requires the student to sit in the front row.
   * - Back row
     - ``back: Tom Brown``
     - Requires the student to sit in the back row.
   * - Sit left
     - ``left: Mia Chen``
     - Requires the student to sit at the left-hand end of a row (the first
       desk in the row, not counting empty spaces).
   * - Sit right
     - ``right: Ben Clark``
     - Requires the student to sit at the right-hand end of a row (the last
       desk in the row, not counting empty spaces).
   * - Empty seat
     - ``empty: Tom Brown``
     - Requires the student to have an empty seat beside them.

``front:``, ``back:``, ``left:``, ``right:`` and ``empty:`` each take one
student. Use a separate line for each student.

Left and right are always the students' left and right as they face the
whiteboard. In **Teacher's View** a ``left:`` student therefore appears on
the right-hand side of the plan.

All of these rules can also be added and removed in the browser with the
**Rules** button. See `The Rules panel`_.

Using the seating plan
----------------------

Students can be dragged between the **Unassigned** list and classroom desks.
Dropping a student onto an occupied desk swaps the two students.

Desks that violate seating rules are highlighted in red, unless **Hide Rule
Badges** is ticked.

Each desk shows the student's first name and surname, with the homeroom and
any rule badges on one line underneath. If a desk is too narrow for all of
them, the badges wrap onto a second line and the desk grows taller, so names
and badges are never cut off. Names too long for the desk end in "…".

Toolbar controls
~~~~~~~~~~~~~~~~

.. list-table::
   :widths: 22 78
   :header-rows: 1

   * - Control
     - Function
   * - **Import Roster**
     - Loads a CSV or Excel class list into the browser. The file name becomes
       the plan's title, without the extension and with underscores shown as
       spaces, so ``8_Science Period 3.xlsx`` gives "8 Science Period 3". Click
       the title to change it.
   * - **Export JSON**
     - Saves the complete seating plan as a ``.json`` file: title, students,
       rules, layout (including Rows/Tables and any empty spaces, such as a
       horseshoe), the desk each student is sitting at, the sort order,
       **Fill** direction and the display options (**Teacher's View**,
       **One-line Names** and the other checkboxes). In Chrome and Edge a Save As box
       opens so you can choose the folder and file name. Other browsers ask
       for a file name, then save it to the Downloads folder. The exported
       plan is also what **Revert** goes back to.
   * - **Import JSON**
     - Restores a previously exported seating plan exactly as it was saved,
       with every student back on the same desk and the same checkboxes
       ticked. Files exported before display options were saved keep the
       checkboxes as they are.
   * - **Reset**
     - Restores the roster and rules originally defined in the directive.
       Also clears what **Revert** would go back to.
   * - **Revert**
     - Goes back to the last file you imported or exported, undoing every
       change since: after **Import JSON** or **Export JSON**, the plan
       exactly as it was in that file (title, layout, students, rules, seats
       and display options); after **Import Roster**, the class list in the
       file's own order, with no rules. Asks before reverting. Greyed out
       until something has been imported or exported.
   * - **Print**
     - Opens a print-friendly version of this seating plan, landscape, with
       rule badges removed. To print every plan on the page at once, see
       `Printing every plan on a page`_.
   * - **Projector View**
     - Shows only the title, whiteboard and desks, in large text, filling the
       screen. Press **Exit projector view** or :kbd:`Esc` to return.
   * - **A → Z**
     - Sorts students alphabetically by surname.
   * - **Z → A**
     - Sorts students in reverse alphabetical order.
   * - **Homeroom A → Z**
     - Sorts students by homeroom, then by surname.
   * - **Random**
     - Randomly distributes students.
   * - **Reverse**
     - Reverses the current seating sequence.
   * - **Fill: First → Last**
     - Switches which end of the room fills first (**First → Last** or
       **Last → First**) and rearranges the students.
   * - **Rules**
     - Opens the Rules panel. See `The Rules panel`_.

The Rules panel
~~~~~~~~~~~~~~~

**Rules** opens a panel with a **Rule** dropdown and a list of the class.
Choose a rule, then tick the students it applies to. Changes are saved
straight away; **Done** closes the panel. The dropdown shows how many
students or groups each rule has, for example *Front row (3)*.

Front row, Back row, Left side, Right side, Empty seat beside
   Tick each student the rule applies to. **Search students** filters the
   list, **Ticked only** shows just the students with the rule, and
   **Clear all** removes the rule from everyone.

Keep together, Keep apart
   These rules are made of groups. **+ New group** shows the class list:
   tick the students and press **Save group**. Each group is listed with
   **Edit** and a delete button.

   * **Keep together** groups have 2 to 4 students, who sit side by side in a
     row in any order (see the Pair rule above for which desks count). In
     table mode they sit at the same table and a group can be as big as the
     largest table. A student can be in only one keep-together group.
   * **Keep apart** groups have 2 or more students, none of whom sit next to
     each other. A student can be in several keep-apart groups.

Rules that can never work together are prevented: a student greyed out in the
list shows why, for example *in Back row*, *kept apart from Sam* or *already
in group 1*.

Rules written in the directive appear in the panel in the same way and can be
changed there; **Reset** brings back the directive's rules.

Changing the layout
~~~~~~~~~~~~~~~~~~~

**Rows** and **Tables**, at the right-hand end of the second toolbar row,
switch between rows of desks and `Table mode`_. The third toolbar row holds
the layout buttons for that mode. Choosing one rearranges the students into
that layout. In rows mode the buttons are:

.. list-table::
   :widths: 24 76
   :header-rows: 1

   * - Button
     - Layout
   * - **5x6**
     - 5 rows of 6 desks.
   * - **4x7**
     - 4 rows of 7 desks.
   * - **4x8**
     - 4 rows of 8 desks.
   * - **6,8,8,6**
     - Rows of 6, 8, 8 and 6 desks.
   * - **3x9**
     - 3 rows of 9 desks.
   * - **3x10**
     - 3 rows of 10 desks.
   * - **8,10,10**
     - Rows of 8, 10 and 10 desks.
   * - **6,11,11**
     - Rows of 6, 11 and 11 desks.
   * - **4,12,12**
     - Rows of 4, 12 and 12 desks.
   * - **14,14**
     - 2 rows of 14 desks.
   * - **HS 5x11**
     - ``4[3]4, 1[9]1, 4[3]4, 1[9]1, 5[1]5``: 5 rows, 11 places wide, 30
       desks. Rows of 4 either side of a central gap, with single desks
       against each side wall between them and a back row of 5 and 5.
   * - **HS 5x10**
     - ``1[1]5[1]1, 1[8]1, 1[1]6[1]1, 1[8]1, 10``: 5 rows, 10 places wide,
       29 desks. Single desks down each side wall, centre rows of 5 and 6
       and a full back row of 10.

If the directive's ``:layout:`` is not one of these, it gets its own button at
the start of the row.

Clicking any layout button also copies that layout into the **Custom** box,
so it can be adjusted and applied straight away (see below).

Custom layouts
^^^^^^^^^^^^^^

To use any other room shape, type the number of desks in each row into the
**Custom** box, front row first, separated by commas, then press
:kbd:`Enter` or **Apply**. For example:

* ``7,8,9,6`` — rows of 7, 8, 9 and 6 desks.
* ``5x6`` — 5 rows of 6 desks (``5×6`` also works).
* ``[2]3[2],7`` — 3 desks in the middle of the front row, then a row of 7.

A layout can have up to 12 rows of 1–20 desks each. If the entry is not
recognised, the box is outlined in red and a message explains the format.

The quickest way to make a new shape is to click the closest layout button,
edit the text it puts in the **Custom** box, and press :kbd:`Enter`. The box
is wide enough for a five-row horseshoe, and after **Apply** the layout stays
in the box for further changes.

The custom layout is added as a new button so you can switch back to it, and
the browser remembers it on later visits (see
`What the browser remembers`_).

Empty spaces, aisles and horseshoes
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

A number in square brackets is empty floor space, the width of that many
desks. Plain numbers are desks. A row can mix them in any order:

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Row
     - Meaning
   * - ``[2]3[2]``
     - 2 spaces, 3 desks, 2 spaces: 3 desks centred in a 7-wide room.
   * - ``4[1]4``
     - 4 desks, an aisle 1 desk wide, 4 more desks.
   * - ``1[9]1``
     - A single desk against each side wall with a 9-desk gap between: the
       arms of a horseshoe.
   * - ``[4]3``
     - 3 desks pushed to the right-hand side.

Desks line up from row to row only when every row is the same total width
(desks plus spaces). ``[2]3[2]`` and ``7`` are both 7 wide, so they line up;
every row of the **HS 5x11** preset is 11 wide. Rows of different widths each stretch
across the room, as plain rows do.

Empty spaces are not seats: no student is put there, they are not counted in
the number of desks and they have no desk number. They change how the rules
work in that row:

* Desks either side of a space are **not neighbours**, so a keep-together
  group cannot be split across an aisle and keep-apart students on opposite
  sides of it are fine.
* **Pairs and groups of 4** use 2-desk blocks counted from the start of each
  run of desks, so in ``[1]2[1]`` the two desks are a block.
* **Left** and **Right** mean the first and last desk in the row. In a
  horseshoe those are the desks against the side walls.
* **Front row** and **Back row** are still the first and last rows written.

For example, a horseshoe for a class of 30 (the **HS 5x11** preset):

.. code-block:: rst

   .. seatingplan::
      :layout: 4[3]4, 1[9]1, 4[3]4, 1[9]1, 5[1]5
      :title: 9 Science — horseshoe

Table mode
~~~~~~~~~~

For rooms set out in tables rather than rows of desks. Choose it with
``:mode: tables`` in the directive or the **Tables** button in the browser.
Each table is drawn as a box with its seats inside; seats are numbered table
by table.

**Table sizes**

* ``4`` — 4 seats, 2 wide and 2 deep.
* ``6`` or ``6w`` — 6 seats, 3 wide and 2 deep (long side facing the front).
* ``6d`` — 6 seats, 2 wide and 3 deep.

**Writing the layout**

List the size of each table, with commas between tables and ``/`` between
rows of tables, front row first:

.. code-block:: rst

   .. seatingplan::
      :mode: tables
      :layout: 6,4,6 / 4,6,4

Shorter forms when every table is the same:

* ``2x3`` — 2 rows of 3 tables of 4.
* ``2x3 6`` — 2 rows of 3 tables of 6 (``2x3 6d`` for deep tables).

A list without ``/``, such as ``6,4,6,4,6,4``, is split into rows of 3 tables,
or the number set by ``:tables-per-row:``. A layout can have up to 8 rows of 8
tables. The same text works in the **Custom** box when **Tables** is
selected.

**Table presets** in the browser: 6 tables of 4, 8 tables of 4, 5 tables of 6,
6,4,6 / 4,6,4 and 6 tables of 6 deep.

**Rules at tables**

.. list-table::
   :widths: 26 74
   :header-rows: 1

   * - Rule
     - At tables
   * - Keep together (``pair:``)
     - Same table. A group can be as big as the largest table, and
       ``pair:`` lines can list up to 6 names.
   * - Keep apart (``separate:``)
     - Different tables.
   * - Front row / Back row
     - A table in the front / back row of tables.
   * - Left side / Right side
     - The left-hand / right-hand table of a row of tables.
   * - Empty seat beside
     - An empty seat at the same table.

Sorting, **Fill**, **Reverse**, dragging, **Teacher's View**,
**Projector View**, **Print**, JSON export and import, **Revert** and
**Reset** all work with tables. **Limit Desk Width** applies only to rows of
desks and is greyed out in table mode.

Display options
~~~~~~~~~~~~~~~

.. list-table::
   :widths: 24 76
   :header-rows: 1

   * - Option
     - Effect
   * - **Surname Initial Only**
     - Shows only the first letter of each surname.
   * - **Show Homeroom**
     - Shows or hides homeroom badges.
   * - **Ignore Rules**
     - Ignores all seating rules the next time students are arranged.
   * - **One-line Names**
     - Shows each name on a single line, making the desks shorter. Printouts
       use the same layout.
   * - **Hide Rule Badges**
     - Hides every sign of the rules, which is useful when the plan is
       displayed to the class: the rule badges (Sep, Pair, Front, Back and so
       on), their card colours, the red highlight on desks breaking a rule and
       the message listing rules that were left out. The rules still apply
       when students are arranged. Untick it to check for broken rules.
   * - **Limit Desk Width**
     - Stops rows with fewer than 6 desks stretching across the room. Their
       desks keep the width of a desk in a 6-desk row and the row is centred,
       so a short front row of 2 or 4 desks looks like the rest of the room.
       Names in those rows are also sized as in a 6-desk row. Rows with 6 or
       more desks are not changed.
   * - **Teacher's View**
     - Shows the room as the teacher sees it from the front: the whiteboard
       at the bottom, the front row nearest it, and left and right swapped,
       so desk 1 is at the bottom right. Only the display changes; desk
       numbers, rules and where students sit stay the same, and students can
       still be dragged between desks. **Print** and **Projector View** use
       the same layout, and the printout's title says "(teacher's view)".

What the browser remembers
~~~~~~~~~~~~~~~~~~~~~~~~~~

Every change you make (importing a class, adding a rule, changing the
layout, ticking an option, editing the title) is saved straight away in the
browser's own storage (``localStorage``). There is no **Save** button and
nothing is sent to a server. Close the tab, shut down the computer, and the
plan is still there the next time the page is opened in the same browser.

**What is saved**

Everything that **Export JSON** writes is also kept in the browser, after
every change:

* the title, students and homerooms, and rules;
* the layout (including custom layouts, empty spaces and Rows/Tables);
* **where each student is sitting**, including students you dragged and the
  results of **A → Z**, **Random**, **Reverse** and the other buttons;
* the sort order and **Fill** direction;
* the display options (**Teacher's View**, **One-line Names** and the other
  checkboxes);
* a copy of the last file you imported or exported, so **Revert** still
  works after the page is closed.

So the page reopens exactly as you left it, with every student on the same
desk.

A plan nobody has changed is not saved at all, so it keeps following the
directive: if the page's author changes the students or ``:layout:``, the
change shows. Once you change a plan, your saved copy takes priority over
the directive's students, rules, layout and display options on later visits.
**Reset** goes back to the students, rules, layout, sort order and display
options written in the directive and deletes the saved copy, so the plan
follows the directive again until you next change it.

**One saved plan per directive**

Each ``seatingplan`` directive saves into its own slot, named by its
``:storage-key:`` or, if there is none, by the page name and its position on
the page (``classes/mine#0``, ``classes/mine#1`` …). So a page with several
directives remembers several separate classes. Each one can have its own
roster, rules, layout and display options, and changing one never affects
the others.

This makes one page per teacher (or per faculty) a convenient "My classes"
page:

.. code-block:: rst

   My classes
   ==========

   .. seatingplan-print::
      :label: Print all my classes
      :skip-empty:

   7 Science
   ---------

   .. seatingplan::
      :title: 7 Science
      :storage-key: mine-7sci

   8 Science
   ---------

   .. seatingplan::
      :title: 8 Science
      :layout: 4[3]4, 1[9]1, 4[3]4, 1[9]1, 5[1]5
      :storage-key: mine-8sci

   9 Science
   ---------

   .. seatingplan::
      :title: 9 Science
      :mode: tables
      :storage-key: mine-9sci

Import each class once with **Import Roster**; from then on every plan opens
as you left it. Give each plan a ``:storage-key:`` as shown, so adding,
removing or reordering plans later does not mix up which saved class goes
with which plan. Without keys, the plans are matched by position: if a new
plan is added at the top, every plan below it would load the class saved for
the one above.

**Where the saved plans live**

The saved plans belong to one browser on one computer:

* **Another browser or computer** (Edge at school, Chrome at home, a
  different classroom PC) does not see them. Use **Export JSON** and
  **Import JSON** to move a plan.
* **Each website address** has its own storage. The published Read the Docs
  site, a preview build and a copy opened from your own disk do not share
  saved plans.
* **Private or incognito windows** forget everything when closed.
* **Clearing browsing data** (cookies and site data) for the site deletes
  the saved plans. Some schools clear this automatically when you sign out
  of a shared computer.
* **Shared computers**: anyone using the same browser profile sees the same
  saved plans, including student names.

Export JSON copies of important plans, for example at the start of each
term, so they can be restored if the browser's storage is cleared.

Printing every plan on a page
-----------------------------

Each plan's **Print** button prints just that plan. To print all the plans
on a page in one go, add the ``seatingplan-print`` directive anywhere on the
page, above, below or between the plans:

.. code-block:: rst

   .. seatingplan-print::

It shows a single **Print all seating plans** button. Clicking it opens one
print window with every seating plan on the page, each on its own landscape
sheet, exactly as that plan's own **Print** button would print it: current
seats, title, **One-line Names** and **Teacher's View** settings, with rule
badges removed.

Options:

``:label:``
   The button text (default "Print all seating plans").

``:title:``
   The name of the print job, used as the PDF file name when saving as PDF.
   Defaults to the page title.

``:skip-empty:``
   Leaves out plans that have no students yet.

``:class:``
   Adds CSS classes to the button's container.

For example:

.. code-block:: rst

   .. seatingplan-print::
      :label: Print all my classes
      :title: Term 4 seating plans
      :skip-empty:

The button prints the plans as they currently appear, so arrange each class
first. It is hidden when the page itself is printed, and like the
``seatingplan`` directive it produces no output in PDF or text builds.

Customising with CSS
--------------------

Desk sizes and spacing are set by CSS custom properties, so they can be
changed without editing ``seatingplan.css``.

.. list-table::
   :widths: 36 14 50
   :header-rows: 1

   * - Property
     - Default
     - Controls
   * - ``--sp-desk-height``
     - ``75px``
     - Minimum desk height. Desks still grow if their content needs more room.
   * - ``--sp-desk-height-compact``
     - ``48px``
     - Minimum desk height when **One-line Names** is ticked.
   * - ``--sp-desk-height-projector``
     - ``112px``
     - Minimum desk height in **Projector View**.
   * - ``--sp-row-gap``
     - ``8px``
     - Space between desks in a row (``12px`` in **Projector View**).
   * - ``--sp-limit-seats``
     - ``6``
     - With **Limit Desk Width** ticked, rows with fewer desks than this use
       the desk width of a row with this many desks.

To use them, add a CSS file to your documentation. For example, create
``_static/custom.css`` next to ``conf.py``:

.. code-block:: css

   /* Every seating plan on the site: slightly taller desks. */
   .seatingplan {
       --sp-desk-height: 85px;
   }

   /* Only plans given :class: wide-room: short rows match an 8-desk row,
      with more space between desks. */
   .seatingplan.wide-room {
       --sp-limit-seats: 8;
       --sp-row-gap: 12px;
   }

Then load it in ``conf.py``:

.. code-block:: python

   html_static_path = ['_static']
   html_css_files = ['custom.css']

Use the class on any plan that should get the second set of styles:

.. code-block:: rst

   .. seatingplan::
      :layout: 4,8,8,8
      :class: wide-room
      :limit-desk-width:

``--sp-limit-seats`` only matters when **Limit Desk Width** is ticked, either
by the ``:limit-desk-width:`` option or in the browser.

Privacy and student data
------------------------

.. warning::

   A roster supplied directly in the directive or through ``:roster:``
   becomes part of the generated HTML page.

   Do not publish real student names on a public documentation site.

   For public sites, leave the directive empty and use **Import Roster** in
   the browser instead, or host the documentation privately.

Installation
------------

Copy the ``seatingplan`` folder next to ``conf.py``. It contains:

* ``__init__.py``
* ``seatingplan.py``
* ``_static/seatingplan.css``
* ``_static/seatingplan.js``

Add the extension to ``conf.py``:

.. code-block:: python

   import os
   import sys

   sys.path.insert(0, os.path.abspath('.'))

   extensions = [
       'seatingplan',
   ]

The CSS and JavaScript assets are automatically copied into the generated
``_static`` directory during HTML builds, so no additional configuration is
required on Read the Docs. The directive produces no output in PDF or text
builds.

To enable build-time reading of Excel roster files, add ``openpyxl`` to your
documentation requirements.

Examples
--------

Example class
~~~~~~~~~~~~~

This example demonstrates a populated seating plan with several seating
constraints.

.. seatingplan::
   :layout: 4x7
   :title: Example Class

   Alex Smith, Hughes 11
   Sam Jones, Hughes 12
   Priya Patel, N13
   Jordan Lee, N13
   Mia Chen, H11
   Tom Brown, N13
   Zoe Adams, H11
   Ben Clark, N13

   separate: Alex Smith | Sam Jones
   pair: Mia Chen | Zoe Adams
   front: Priya Patel
   back: Tom Brown
   left: Jordan Lee
   empty: Ben Clark

Tables
~~~~~~

A room with tables of 6 and 4. The rules apply to tables: the keep-together
group shares a table and the keep-apart group is spread across three tables.

.. seatingplan::
   :mode: tables
   :layout: 6,4,6 / 4,6,4
   :title: Tables Example
   :storage-key: tables-example

   Alex Smith, Hughes 11
   Sam Jones, Hughes 12
   Priya Patel, N13
   Jordan Lee, N13
   Mia Chen, H11
   Tom Brown, N13
   Zoe Adams, H11
   Ben Clark, N13

   pair: Mia Chen | Zoe Adams | Ben Clark
   separate: Alex Smith | Sam Jones | Tom Brown
   front: Priya Patel

Short front row
~~~~~~~~~~~~~~~

A room with 4 desks at the front and 6 in each other row. **Limit Desk Width**
is ticked, so the front desks match the others. Untick it to compare.

.. seatingplan::
   :layout: 4,6,6,6
   :title: Short Front Row
   :limit-desk-width:
   :storage-key: short-front-row-example

   Alex Smith, Hughes 11
   Sam Jones, Hughes 12
   Priya Patel, N13
   Jordan Lee, N13

   front: Priya Patel

Horseshoe
~~~~~~~~~

The **HS 5x11** horseshoe: rows of 4 either side of a central gap, single
desks against each side wall between them, and a back row of 5 and 5.
**Left** puts Jordan on a desk against the left-hand wall.

.. seatingplan::
   :layout: 4[3]4, 1[9]1, 4[3]4, 1[9]1, 5[1]5
   :title: Horseshoe Example
   :storage-key: horseshoe-example

   Alex Smith, Hughes 11
   Sam Jones, Hughes 12
   Priya Patel, N13
   Jordan Lee, N13
   Mia Chen, H11
   Tom Brown, N13

   left: Jordan Lee
   pair: Mia Chen | Tom Brown

Empty class
~~~~~~~~~~~

Use an empty directive when you want users to import their own class list.

.. seatingplan::
   :layout: 5x6
   :title: Empty Class

Print all
~~~~~~~~~

This button prints every example plan above that has students, each on its
own page.

.. seatingplan-print::
   :label: Print all example plans
   :title: Seating plan examples
   :skip-empty: