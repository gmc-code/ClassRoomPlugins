===================================
Name Picker Directive info
===================================

The ``namepicker`` directive embeds an animated random name picker in a
documentation page.

A stack of brightly coloured name cards cycles upwards and settles with the
chosen students on top. Students can be imported from CSV or Excel files or
entered directly in the directive, marked absent, picked one or several at a
time, kept from being picked twice, shown full screen on a projector, saved as
JSON and printed as a list.

.. contents::
   :local:
   :depth: 1

----

Quick start
-----------

Add the directive to an RST page:

.. code-block:: rst

   .. namepicker::
      :title: Who's Up?

      Alex Smith, H11
      Sam Jones, B11
      Priya Patel, N12
      Jordan Lee, N12
      Mia Chen, H11
      Tom Brown, B11

Directive options
-----------------

``:count:``
   Sets how many students are picked each time.

   * ``1`` — one student (default).
   * Any whole number from ``1`` to ``10``. Other values give a build warning
     and fall back to ``1``.

   The number can also be changed in the browser.

``:duration:``
   Sets how long the cards cycle before settling, in seconds.

   * ``6`` — six seconds (default).
   * Any number from ``1`` to ``20``, including halves such as ``2.5``. Other
     values give a build warning and fall back to ``6``.

``:easing:``
   Sets how the cycling cards slow down.

   * ``ease-out`` — smooth slow down (default).
   * ``linear`` — constant speed, then a sudden stop.
   * ``ease-in-out`` — slow start and slow end.
   * ``ease-out-strong`` — fast, then a long crawl to the end.
   * ``back`` — slips past the final name and settles back.
   * ``elastic`` — springy finish.
   * ``bounce`` — bounces into place.

``:roster:``
   Loads a roster from a CSV file or Excel workbook (``.xlsx``), relative to
   the documentation page. Students listed in the directive body are added
   after the roster.

   Excel support requires ``openpyxl``.

   Supported columns:

   * ``Preferred`` or ``First Name``
   * ``Surname`` or ``Last Name`` (optional)
   * ``Homeroom`` (optional)

``:title:``
   Sets the initial title displayed above the picker. The title can also be
   edited in the browser and is included on printouts.

``:no-repeat:``
   Starts with **Skip Students Already Picked** ticked, so each student is
   picked once before anyone is picked again.

``:surname-initial:``
   Starts with **Surname Initial Only** ticked.

``:hide-homeroom:``
   Starts with **Show Homeroom** unticked.

``:skip-animation:``
   Starts with **Skip Animation** ticked, so the result appears straight away.

These four options take no value. They set how the page first appears; the
matching checkboxes can still be changed in the browser. See
`What the browser remembers`_.

For example, a picker that chooses three students at a time, takes everyone
in turn and finishes with a bounce:

.. code-block:: rst

   .. namepicker::
      :title: Practical Team Leaders
      :count: 3
      :duration: 8
      :easing: bounce
      :no-repeat:
      :surname-initial:

``:storage-key:``
   Sets a custom key for storing the class list and settings in the browser.
   If omitted, the page name and directive position are used automatically.

``:class:``
   Adds CSS classes to the name picker container.

Student definitions
-------------------

Each non-blank content line defines a student. Lines beginning with ``#`` are
ignored.

Student entries
~~~~~~~~~~~~~~~

Enter students using any of these formats:

.. code-block:: text

   First
   First Surname
   First Surname, Homeroom

For example:

.. code-block:: text

   Alex
   Priya Patel, N12
   Mia Chen, Hughes 11

The first word becomes the student's first name, and the remaining text
becomes the surname. Homerooms are abbreviated automatically where possible,
so ``Hughes 11`` is shown as ``H11``.

If two students have the same name, the build shows a warning. Give them
different names, for example by adding an initial, so the class can tell them
apart.

Using the name picker
---------------------

Press **Pick!** to start. The name cards cycle upwards for the chosen
animation time, then the stack settles with the picked students on top,
numbered in order. Their names are also listed under the cards.

Press **Pick Again!** to choose again. The previous result slides back into
the stack before the cards start cycling.

* The line under the cards shows how many students are in the hat and, when
  **Skip Students Already Picked** is ticked, how many have not been picked
  yet.
* Click the title to rename it.
* In **Projector View**, the :kbd:`Space` bar also presses **Pick!**, as do
  :kbd:`Page Down` and :kbd:`→`, so a presentation clicker works too.

Toolbar controls
~~~~~~~~~~~~~~~~

.. list-table::
   :widths: 24 76
   :header-rows: 1

   * - Control
     - Function
   * - **Import Roster**
     - Loads a CSV or Excel class list into the browser, replacing the
       current students. Imported data is not uploaded anywhere.
   * - **Import JSON**
     - Restores a previously exported picker, including its settings,
       absences and picks.
   * - **Export JSON**
     - Downloads the students, settings, absences, students already picked
       and the last result.
   * - **Reset**
     - Restores the class list and settings originally defined in the
       directive.
   * - **Print**
     - Opens a print-friendly list of the students picked last time.
   * - **Class List**
     - Opens the class list, where students can be marked present or absent.
   * - **Projector View**
     - Shows only the title, the **Pick!** button and the cards, filling the
       screen, with the card stack enlarged to fit. Press **Exit projector
       view** or :kbd:`Esc` to return.
   * - **Students to pick**
     - Sets how many students are picked each time, from 1 to 10.
   * - **Animation time**
     - Sets how long the cards cycle, from 1 to 20 seconds.
   * - **Easing**
     - Sets how the cards slow down. See ``:easing:`` above.
   * - **Forget Picks**
     - Clears the record of students already picked, so everyone present can
       be chosen again.

Display options
~~~~~~~~~~~~~~~

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Option
     - Effect
   * - **Surname Initial Only**
     - Shows only the first letter of each surname.
   * - **Show Homeroom**
     - Shows or hides homerooms on the cards and printouts.
   * - **Skip Students Already Picked**
     - Picks only students who have not been picked yet. When too few are
       left, everyone goes back in the hat and a message says so.
   * - **Skip Animation**
     - Shows the result straight away, without cycling the cards.

Marking students absent
~~~~~~~~~~~~~~~~~~~~~~~

**Class List** opens a list of every student with a tick box. Untick a
student to mark them absent, so they can't be picked. **All Present** and
**None Present** tick or untick everyone at once. Students who have already
been picked are tagged *picked*.

If fewer students are present than the number to pick, everyone present is
picked and a message says so.

What the browser remembers
~~~~~~~~~~~~~~~~~~~~~~~~~~

The browser remembers the title, students, absences, students already picked,
the last result and all settings for each directive. This means absences and
the "already picked" record carry over between lessons until they are changed,
**Forget Picks** is pressed or the page is reset.

Remembered settings take priority over the directive's options on later
visits. **Reset** returns the page to the students and settings written in the
directive.

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

Copy the ``namepicker`` folder next to ``conf.py``. It contains:

* ``__init__.py``
* ``namepicker.py``
* ``_static/namepicker.css``
* ``_static/namepicker.js``

Add the extension to ``conf.py``:

.. code-block:: python

   import os
   import sys

   sys.path.insert(0, os.path.abspath('.'))

   extensions = [
       'namepicker',
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

This example picks two students at a time, without picking anyone twice.

.. namepicker::
   :title: Example Class
   :count: 2
   :no-repeat:

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

Empty class
~~~~~~~~~~~

Use an empty directive when you want users to import their own class list.

.. namepicker::
   :title: Empty Class