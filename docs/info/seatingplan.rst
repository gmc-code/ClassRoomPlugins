Seating plan directive
======================

The ``seatingplan`` directive embeds an interactive classroom seating plan
designer in a page. Students can be dragged between desks, sorted, shuffled and
printed, and seating rules are respected when the plan is arranged.

Quick start
-----------

.. code-block:: rst

   .. seatingplan::
      :layout: 5x6
      :title: Year 8 Science

      Alex Smith, H11
      Sam Jones, B11
      Priya Patel, N12

      separate: Alex Smith | Sam Jones
      front: Priya Patel

Options
-------

``:layout:``
   Rows of desks. ``5x6`` means 5 rows of 6 desks, ``11,11,6`` means rows of 11,
   11 and 6. Default ``5x6``.

``:roster:``
   Path to a ``.csv`` (or ``.xlsx`` if ``openpyxl`` is installed) file, relative
   to the page. Columns: ``Preferred`` (or ``First Name``), ``Surname`` (or
   ``Last Name``) and optionally ``Homeroom``.

``:title:``
   Heading shown above the toolbar and on the printout.

``:fill:``
   ``first`` (default) or ``last``. Which end of the room is filled first.

``:sort:``
   ``none`` (default, roster order), ``az``, ``za`` or ``random``.

``:storage-key:``
   Name used to remember a visitor's imported roster and rules in their browser.
   Defaults to the page name plus the position of the directive.

``:class:``
   Extra CSS classes on the container.

Content lines
-------------

Each non-blank line of the directive body is either a student or a rule. Lines
starting with ``#`` are ignored.

Student lines
   ``First Surname`` with an optional homeroom after a comma, for example
   ``Alex Smith, Hughes 11``. The first word is the first name and the rest is
   the surname. Homerooms are shortened on the desks (``Hughes 11`` shows as
   ``H11``).

Rule lines
   ``separate: Name | Name``
      The two students must not sit next to each other (including diagonally).
   ``pair: Name | Name``
      The two students must sit next to each other.
   ``front: Name``
      The student must sit in the front row, nearest the whiteboard.
   ``back: Name``
      The student must sit in the last row.

   Names must match a student in the roster exactly (case is ignored), otherwise
   the build reports an error.

In the page
-----------

Students are dragged between the **Unassigned** list and the desks. Dropping on
an occupied desk swaps the two students. A desk turns red when a rule is broken.

* **Rules** opens a dialog for adding and removing rules in the browser.
* **Import** loads a CSV or Excel class list. It stays in that visitor's browser
  and is never uploaded.
* **Reset** discards the visitor's imported roster and rules and goes back to
  what is written on the page.
* **Print** opens just the plan in its own window, so the rest of the docs page
  does not add blank pages.

.. note::

   A roster given in the directive or with ``:roster:`` is published inside the
   built HTML. Do not put real student names on a public site. Leave the
   directive empty and use **Import** instead, or host the docs privately.

Installing
----------

Copy ``seatingplan.py``, ``seatingplan.css`` and ``seatingplan.js`` into the same
folder (for example ``_ext/``) and add to ``conf.py``:

.. code-block:: python

   import os, sys
   sys.path.append(os.path.abspath('_ext'))
   extensions = ['seatingplan']

The CSS and JS are copied into ``_static`` at the end of an HTML build, so
nothing else needs configuring on Read the Docs. Optional: add ``openpyxl`` to
the docs requirements file to read ``.xlsx`` rosters at build time.

Live example
------------

.. seatingplan::
   :layout: 4x7
   :title: Example class

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

----

Empty class
------------

.. seatingplan::
   :layout: 5x6
   :title: Empty class



