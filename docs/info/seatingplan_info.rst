=============================
Seating Plan Directive info
=============================

The ``seatingplan`` directive embeds an interactive classroom seating plan
designer in a documentation page.

Students can be automatically arranged, manually dragged between desks,
imported from CSV or Excel files, exported as JSON, printed, and managed using
seating rules and constraints.

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

   Rows are listed front row first. A layout can have up to 12 rows of 1–20
   desks each.

   The layout can also be changed in the browser with the layout buttons or
   the **Custom** box. See `Changing the layout`_.

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
   be edited in the browser.

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

These five options take no value. They set how the page first appears; the
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

``:storage-key:``
   Sets a custom key for storing seating plans in the browser. If omitted,
   the page name and directive position are used automatically.

``:class:``
   Adds CSS classes to the seating plan container.

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
     - Prevents the students from sitting beside each other, including diagonally.
   * - Pair
     - ``pair: Mia Chen | Zoe Adams``
     - Requires the students to sit together.
   * - Front row
     - ``front: Priya Patel``
     - Requires the student to sit in the front row.
   * - Back row
     - ``back: Tom Brown``
     - Requires the student to sit in the back row.
   * - Sit left
     - ``left: Mia Chen``
     - Requires the student to sit on the left side of the classroom.
   * - Sit right
     - ``right: Ben Clark``
     - Requires the student to sit on the right side of the classroom.
   * - Empty seat
     - ``empty: Tom Brown``
     - Requires the student to have an empty seat beside them.

``front:``, ``back:``, ``left:``, ``right:`` and ``empty:`` each take one
student. Use a separate line for each student.

All of these rules can also be added and removed in the browser with the
**Rules** button.

Using the seating plan
----------------------

Students can be dragged between the **Unassigned** list and classroom desks.
Dropping a student onto an occupied desk swaps the two students.

Desks that violate seating rules are highlighted in red, unless **Hide Rule
Badges** is ticked.

Toolbar controls
~~~~~~~~~~~~~~~~

.. list-table::
   :widths: 22 78
   :header-rows: 1

   * - Control
     - Function
   * - **Import Roster**
     - Loads a CSV or Excel class list into the browser.
   * - **Export JSON**
     - Downloads the complete seating plan, including students, rules, layout
       and desk positions.
   * - **Import JSON**
     - Restores a previously exported seating plan.
   * - **Reset**
     - Restores the roster and rules originally defined in the directive.
   * - **Print**
     - Opens a print-friendly version of the seating plan.
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
     - Opens the seating rules editor.

Changing the layout
~~~~~~~~~~~~~~~~~~~

The third toolbar row holds the layout buttons. Choosing one rearranges the
students into that layout.

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
   * - **5,8,8,6**
     - Rows of 5, 8, 8 and 6 desks.
   * - **3x9**
     - 3 rows of 9 desks.
   * - **3x10**
     - 3 rows of 10 desks.
   * - **7,10,10**
     - Rows of 7, 10 and 10 desks.
   * - **6,11,11**
     - Rows of 6, 11 and 11 desks.
   * - **4,12,12**
     - Rows of 4, 12 and 12 desks.
   * - **14,14**
     - 2 rows of 14 desks.

If the directive's ``:layout:`` is not one of these, it gets its own button at
the start of the row.

Custom layouts
^^^^^^^^^^^^^^

To use any other room shape, type the number of desks in each row into the
**Custom** box, front row first, separated by commas, then press
:kbd:`Enter` or **Apply**. For example:

* ``7,8,9,6`` — rows of 7, 8, 9 and 6 desks.
* ``5x6`` — 5 rows of 6 desks (``5×6`` also works).

A layout can have up to 12 rows of 1–20 desks each. If the entry is not
recognised, the box is outlined in red and a message explains the format.

The custom layout is added as a new button so you can switch back to it, and
the browser remembers it on later visits.

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

What the browser remembers
~~~~~~~~~~~~~~~~~~~~~~~~~~

The browser remembers the title, students, rules, layout and display options
for each directive. The remembered layout and display options take priority
over the directive's ``:layout:`` and display options on later visits.
**Reset** returns the page to the students, rules, layout, sort order and
display options written in the directive.

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

Empty class
~~~~~~~~~~~

Use an empty directive when you want users to import their own class list.

.. seatingplan::
   :layout: 5x6
   :title: Empty Class