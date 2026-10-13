=============================
Using the Seating plans page
=============================

The :doc:`seatingplans` page holds a separate seating plan for each of your
classes, all on one page. Each plan has its own class list, rules, layout and
seats, and the browser remembers every one of them independently. This page
explains how to work with them together. For the buttons, rules and layouts
inside a plan, see :doc:`seatingplan_info`.

.. contents::
   :local:
   :depth: 1

----

One page, many classes
----------------------

* **Each plan is separate.** Importing, sorting or changing the layout in
  *Class 3* never touches *Class 4*. Each has its own **Reset**, **Revert**,
  **Print** and **Projector View**.
* **Each plan is remembered separately.** Every change is saved straight away
  in this browser. Close the page, and every class reopens exactly as you
  left it, with each student on the same desk.
* **Plans you have not used stay empty** and are left out when printing.
  Use as many of the twelve as you need.

Setting up your classes
-----------------------

Do this once per class, at the start of the year or term:

#. Find the next empty plan and press **Import Roster**. Choose the class's
   Excel export from School Class Lists.
#. Click the plan's title and type the class name, e.g. *8 Science 3*
   (importing sets the title to the file's name).
#. Choose a layout to match the room. Different classes can use different
   rooms and layouts.
#. Add any **Rules**, then sort or drag the students into place.
#. Press **Export JSON** to keep a copy (see `Backing up and moving your
   classes`_).

The heading above each plan (*Class 1*, *Class 2* …) is part of the page and
does not change; the plan's title is what identifies the class.

Printing all your classes
-------------------------

**Print all my classes**, near the top of the page, prints every plan that has
students, each on its own landscape page, exactly as it is shown: current
seats, title, **One-line Names** and **Teacher's View**. Rule badges are left
off. Choose **Save as PDF** in the print box to keep a PDF of every class in
one file.

To print a single class, use the **Print** button in that plan.

Backing up and moving your classes
----------------------------------

The saved plans live only in **this browser on this computer**. They are not
copied to your other computers or browsers, and they are lost if the
browser's site data is cleared.

* **Back up:** press **Export JSON** in each plan you use. Keep the files
  together, e.g. in a *Seating plans* folder in your school OneDrive. Export
  again after big changes, and at the start of each term.
* **Move to another computer:** open this page there and press **Import JSON**
  in any empty plan, one file per class. Everything comes back: class list,
  rules, layout, seats and display options.
* **Undo changes to a class:** **Revert** goes back to the last file
  imported or exported in that plan.

Changing classes
----------------

* **Replace a class** (new semester, new class list): in that plan, press
  **Import Roster** with the new file. This removes the old rules. Export the
  old class first if you may want it again.
* **Clear a class:** press **Reset** in that plan. The plan is emptied in this
  browser only; any exported JSON file is unaffected.
* **Swap a class into a different slot:** **Export JSON** from one plan,
  **Import JSON** into the other, then **Reset** the first.

Good to know
------------

* **Each plan is saved under a fixed name** (``myclasses-1`` to
  ``myclasses-12``), set by ``:storage-key:`` on the page. This keeps each
  saved class with the right plan even if the page is edited later. If the
  page's author changes those names, the plans start empty again: export your
  classes before the page is updated, and import them afterwards.
* **Private by browser:** anyone who uses the same computer sign-in and
  browser can open this page and see your saved classes. Use your own staff
  computer or profile. On a shared computer, **Reset** each class before you
  leave.
* **Exported files contain student names.** Store them where you keep other
  class lists, not on shared or public drives.

For the author: adding more classes
-----------------------------------

To add a thirteenth class, copy the last section of ``seatingplans.rst`` and
give it a new heading, title and **new** storage key:

.. code-block:: rst

   ----

   Class 13
   ---------------

   .. seatingplan::
      :layout: 5x6
      :title: Enter class 13 name here
      :storage-key: myclasses-13

Keep the existing storage keys as they are, so everyone's saved classes stay
in place. Plans can be reordered or retitled freely as long as each keeps its
own key. **Print all my classes** includes new plans automatically.