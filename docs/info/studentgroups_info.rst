===================================
Using the Student Groups Directive
===================================

The ``studentgroups`` directive embeds an interactive student group planner
in a documentation page.

Students can be imported from CSV or Excel files or entered directly in the
directive, then sorted or randomised into groups, kept together or apart with
rules, rearranged by dragging, shown full screen on a projector, saved as JSON
and printed as compact group cards.

----

Quick start
-----------

Add the directive to an RST page:

.. code-block:: rst

   .. studentgroups::
      :size: 4
      :title: Year 8 Science Groups

      Alex Smith, H11
      Sam Jones, B11
      Priya Patel, N12
      Jordan Lee, N12
      Mia Chen, H11
      Tom Brown, B11

      separate: Alex Smith | Sam Jones
      pair: Mia Chen | Tom Brown

Directive options
-----------------

``:size:``
   Sets the number of students per group.

   * ``4`` — four students per group (default).
   * Any whole number from ``2`` to ``10``. Other values give a build warning
     and fall back to ``4``.

   The group size can also be changed in the browser.

``:roster:``
   Loads a roster from a CSV file or Excel workbook (``.xlsx``), relative to
   the documentation page. Students listed in the directive body are added
   after the roster.

   Excel support requires ``openpyxl``.

   Supported columns:

   * ``Preferred`` or ``First Name``
   * ``Surname`` or ``Last Name``
   * ``Homeroom`` (optional)

``:title:``
   Sets the initial title displayed above the groups. The title can also be
   edited in the browser and is included on printouts.

``:sort:``
   Sets the order used when the page first arranges the groups.

   * ``none`` — preserve the supplied order (default).
   * ``az`` — alphabetical by surname.
   * ``za`` — reverse alphabetical by surname.
   * ``homeroom`` — by homeroom, then by surname.
   * ``random`` — random groups.

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
   Starts with **Ignore Rules** ticked, so the first groups are made without
   the rules.

These five options take no value. They set how the page first appears; the
matching checkboxes can still be changed in the browser. See
`What the browser remembers`_.

For example, a page set up for showing groups to the class:

.. code-block:: rst

   .. studentgroups::
      :size: 4
      :title: Practical Groups
      :sort: random
      :one-line:
      :surname-initial:
      :hide-badges:

``:storage-key:``
   Sets a custom key for storing the class list and settings in the browser.
   If omitted, the page name and directive position are used automatically.

``:class:``
   Adds CSS classes to the student groups container.

Student and rule definitions
----------------------------

Each non-blank content line defines either a student or a grouping rule.
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
becomes the surname. Homerooms are abbreviated automatically where possible,
so ``Hughes 11`` is shown as ``H11``.

Grouping rules
~~~~~~~~~~~~~~

Rules are entered below the student list, using names exactly as they appear
in the list.

.. list-table::
   :widths: 18 42 40
   :header-rows: 1

   * - Rule
     - Example
     - Effect
   * - Separate
     - ``separate: Alex Smith | Sam Jones``
     - Puts the students in different groups. With three or more names, every
       student listed is kept apart from the others.
   * - Pair
     - ``pair: Mia Chen | Zoe Adams``
     - Puts the students in the same group. Three or more names are all kept
       together.

``apart:`` can be used in place of ``separate:``, and ``together:`` in place
of ``pair:``.

If the rules cannot all be met, for example when more students are paired
together than fit in one group, the build shows a warning. The page keeps as
many rules as it can, giving earlier rules priority, and lists the ones it
left out.

Rules can also be added and removed in the browser with the **Rules** button.

Using the student groups
------------------------

When the page loads, students are placed into groups automatically. Each
group is shown as a card with its group name and members.

* Drag a student to another seat to move them. Dropping onto an occupied seat
  swaps the two students.
* Students who are not in a group appear in the **Unassigned** list on the
  left, which is hidden when everyone is placed.
* Students breaking a rule are highlighted in red.
* Students with a rule show a **⚠️ Sep** or **🔗 Pair** badge.
* Click the title or a group name to rename it.

Toolbar controls
~~~~~~~~~~~~~~~~

.. list-table::
   :widths: 24 76
   :header-rows: 1

   * - Control
     - Function
   * - **Import Roster**
     - Loads a CSV or Excel class list into the browser, replacing the
       current students and rules. Imported data is not uploaded anywhere.
   * - **Import JSON**
     - Restores a previously exported plan, including the group placements.
   * - **Export JSON**
     - Downloads the complete plan, including students, rules, group size,
       group names and placements.
   * - **Reset**
     - Restores the class list and rules originally defined in the directive.
   * - **Print**
     - Opens a landscape, print-friendly version of the groups.
   * - **Projector View**
     - Shows only the title and groups, in large text, filling the screen.
       Press **Exit projector view** or :kbd:`Esc` to return.
   * - **Clear**
     - Moves every student back to the Unassigned list.
   * - **A → Z**
     - Groups students alphabetically by surname.
   * - **Z → A**
     - Groups students in reverse alphabetical order.
   * - **Homeroom A → Z**
     - Groups students by homeroom, then by surname.
   * - **Random Grouping**
     - Makes random groups that still follow the rules.
   * - **Rules**
     - Opens the rules editor.
   * - **Group Size**
     - Sets the number of students per group, from 2 to 10, and rearranges
       the groups.

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
     - Ignores all rules the next time groups are made.
   * - **One-line Names**
     - Shows each name on a single line, making the cards about half as tall.
       Printouts use the same layout.
   * - **Hide Rule Badges**
     - Hides the Sep and Pair badges and their card colours, which is useful
       when the groups are displayed to the class. The rules still apply.

What the browser remembers
~~~~~~~~~~~~~~~~~~~~~~~~~~

The browser remembers the title, students, rules, group size, group names and
display options for each directive. Exact seat placements are not remembered,
so groups are rearranged when the page is reloaded. Use **Export JSON** to keep
a particular arrangement.

Remembered display options take priority over the directive's display options
on later visits. **Reset** returns the page to the students, rules, sort order
and display options written in the directive.

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

Copy the ``studentgroups`` folder next to ``conf.py``. It contains:

* ``__init__.py``
* ``studentgroups.py``
* ``_static/studentgroups.css``
* ``_static/studentgroups.js``

Add the extension to ``conf.py``:

.. code-block:: python

   import os
   import sys

   sys.path.insert(0, os.path.abspath('.'))

   extensions = [
       'studentgroups',
   ]

The CSS and JavaScript assets are automatically copied into the generated
``_static`` directory during HTML builds, so no additional configuration is
required on Read the Docs. The directive produces no output in PDF or text
builds.

To enable build-time reading of Excel roster files, add ``openpyxl`` to your
documentation requirements. Excel files imported in the browser need an
internet connection the first time, to load the Excel reader.

Examples
--------

Example class
~~~~~~~~~~~~~

This example demonstrates a populated class split into groups of four, with
grouping rules.

.. studentgroups::
   :size: 4
   :title: Example Class Groups

   Alex Smith, H11
   Sam Jones, H11
   Priya Patel, N12
   Jordan Lee, N12
   Mia Chen, H11
   Tom Brown, N12
   Zoe Adams, H11
   Ben Clark, N12
   Ava Wilson, H11
   Lucas White, N12
   Noah Green, H11
   Ella Taylor, N12

   separate: Alex Smith | Sam Jones
   pair: Mia Chen | Zoe Adams

Empty class
~~~~~~~~~~~

Use an empty directive when you want users to import their own class list.

.. studentgroups::
   :size: 4
   :title: Empty Class
