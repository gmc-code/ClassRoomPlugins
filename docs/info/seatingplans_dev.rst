=========================================
Class Seating Plans developer reference
=========================================

How the :doc:`/tools/seatingplans` page is built, and what to watch when
changing it. The page is twelve ``seatingplan`` directives and one
``seatingplan-print`` button; everything about those directives is in
:doc:`/info/seatingplan_dev`. For how teachers use the page, see
:doc:`/info/seatingplans_info`.

----

Page structure
--------------

A page like this needs nothing beyond the ``seatingplan`` extension:

.. code-block:: rst

   Class seating plans
   ===================

   .. seatingplan-print::
      :label: Print all my classes
      :skip-empty:

   Plan 1
   ------

   .. seatingplan::
      :storage-key: seatingplans-1

   Plan 2
   ------

   .. seatingplan::
      :storage-key: seatingplans-2

   .. ... and so on to Plan 12

* Each plan is an independent instance with its own storage, Reset, Revert,
  Print, Save PNG and Projector View. No data is shared between them.
* The plans have no content, so each starts empty (5 × 6 rows, or 8 tables of
  4 in tables mode) and teachers load their own class with **Import Roster**.
* ``:skip-empty:`` makes **Print all my classes** leave out unused plans. Each
  plan prints on its own landscape sheet with the fixed print styles.
* The *Plan 1* … *Plan 12* headings are ordinary section titles, so they give
  each plan an anchor and a sidebar entry. The plan's own title (in its dark
  title bar) is the teacher's name for the class.


Storage keys: keep them stable
------------------------------

Each plan is saved in the teacher's browser under
``seatingplan:<storage-key>`` (plus ``seatingplan:<storage-key>:imported`` for
Revert).

Without ``:storage-key:``, the key is ``<docname>#<n>``, with *n* the plan's
position on the page from 0, e.g. ``tools/seatingplans#3`` for *Plan 4*. That
makes the key depend on the page's path and on the order of the plans:

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Change to the page
     - Effect with default keys
   * - Rename or move the page
     - Every plan appears empty. Teachers' data is still in their browsers under
       the old keys, but the page no longer reads it.
   * - Insert or remove a plan above others
     - Plans below it shift: *Plan 5* now shows what was saved for *Plan 4*.
   * - Add plans at the end
     - Safe.

**Recommendation:** give every plan an explicit ``:storage-key:`` that never
changes (as above), and never reuse a key for a different slot. If the page
already uses default keys and teachers have data in it, keep the plans in the
same order and the page at the same path, or set ``:storage-key:`` to the old
value, e.g. ``:storage-key: tools/seatingplans#3``.

``localStorage`` belongs to the site's origin, so every version of the docs on
the same domain (``/en/latest/``, ``/en/stable/`` …) reads the same keys, and a
plan saved on one version appears on the others.


Capacity
--------

``localStorage`` gives each origin about 5 MB in most browsers, shared by every
tool on the site (seating plans, student groups, the noise monitor). A plan with
30 students, rules and seats is usually 10–20 KB, plus the same again for its
Revert copy, so twelve full plans use well under 1 MB. If storage fills or is
blocked, plans keep working but stop being saved; nothing warns the teacher, so
remind them to use **Export JSON**.


Privacy notes for the site
--------------------------

* Student data never leaves the teacher's browser. The page makes no network
  requests for it. The plans load two libraries from cdn.jsdelivr.net, each
  only when first needed: the Excel reader (SheetJS, ``xlsx@0.18.5``) the first
  time a teacher imports an ``.xlsx`` or ``.xls`` file, and the image maker
  (``html2canvas@1.4.1``) the first time they press **Save PNG**. Neither
  receives any class data. If that CDN is blocked, CSV import and **Print**
  still work.
* Exported JSON files and saved pictures contain names and homerooms. Point
  teachers to an approved place to keep them.
* On shared computers the plans are visible to anyone using the same browser
  profile. The user guide tells teachers to press **Reset** before leaving.


Changing the page safely
------------------------

* **Add a plan:** append a new section with the next unused
  ``:storage-key:``.
* **Remove a plan:** delete its section. Data under that key stays in teachers'
  browsers but is no longer shown; reusing the key later would bring it back.
* **Give the page a starting class:** don't. Content in a plan applies to every
  teacher who hasn't used it yet. Keep these plans empty.
* **Update the extension:** pages with plans are rebuilt automatically when
  ``seatingplan.js`` or ``seatingplan.css`` change, so browsers fetch the new
  files. Saved plans carry over, since the stored format is unchanged and older
  files still load.