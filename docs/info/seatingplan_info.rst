=======================
Seating Plan user guide
=======================

The seating plan lets you load a class list, set up the room, add seating
rules and arrange students on desks, then print it or show it on the
projector. Everything happens in your browser: student names are never sent
anywhere, and the plan is saved on this computer as you work.

This guide shows how to use the seating plan and get the most out of it.
Technical details for whoever runs the website are in
:doc:`/info/seatingplan_dev`.

----

Quick start
-----------

#. Press **Import Roster** and choose your class's Excel or CSV export.
#. Click the title and type the class name, e.g. *8 Science W9*.
#. Pick a layout that matches the room, or type your own.
#. Press **Rules** to add any seating rules.
#. Press **A → Z**, **Random** or another sort, then drag students to fine-tune.
#. **Print**, or press **Projector View** to show it to the class.
#. Press **Export JSON** to keep a backup copy.

Importing a class list
----------------------

**Import Roster** reads an Excel file (``.xlsx`` or ``.xls``) or a CSV file.
The first row must be a header row with these columns (in any order, any
capitals):

* **Preferred** or **First Name**: the name shown on the desk
* **Surname** or **Last Name**
* **Homeroom** (optional): shown as a small badge, e.g. *H11*

Other columns are ignored, so an export from School Class Lists works as it
is. The plan's title is taken from the file name (``8_Science_W9.xlsx``
becomes *8 Science W9*), and you can click it to change it.

Importing a new class list **removes the existing rules**, because they
belonged to the old students; you are asked to confirm first.

The title
---------

Click the dark title bar to type a new title, then press **Enter** or click
away. The title is saved, printed at the top of the page and used as the
suggested file name for **Export JSON**.

The toolbar
-----------

Top row: files and output
~~~~~~~~~~~~~~~~~~~~~~~~~

**Import Roster**
   Load a class list (see `Importing a class list`_).

**Import JSON**
   Load a plan saved with **Export JSON**: title, class list, rules, layout,
   seats and display options all come back exactly as they were.

**Export JSON**
   Save the whole plan as a file. In Chrome and Edge you choose the folder
   and name; other browsers ask for a name and save to Downloads.

**Reset**
   Go back to the plan as it was first set up on the page (usually empty),
   removing your class list, rules and changes from this browser. You are
   asked to confirm.

**Revert**
   Go back to the last file you imported or exported, undoing everything
   since. This is greyed out until you have imported or exported something. After an
   **Import Roster**, it returns the class to the file's original order.

**Print**
   Print this plan on one landscape page (see `Printing`_).

**Projector View**
   Show only the whiteboard and desks, full screen, in large text. Press
   **Esc** or **✕ Exit projector view** to return.

Second row: arranging students
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

**Clear**
   Move every student off the desks into the **Unassigned** list, ready to
   drag them into place by hand.

**A → Z** / **Z → A**
   Seat students in surname order.

**Homeroom A → Z**
   Group students by homeroom, then by surname within each homeroom.

**Random**
   Seat students in a random order. Press again for a new arrangement.

**Reverse**
   Reverse the current order, so the student at the first desk moves to the
   last desk and so on.

**Fill: First → Last** / **Fill: Last → First**
   Choose whether seating starts at desk 1 (front left) or at the last desk
   (back right). Fill from the back when the class is smaller than the room
   and you want the front rows empty.

**Rules**
   Open the seating rules (see `Seating rules`_).

**Rows** / **Tables**
   Switch between rows of desks and groups of tables (see `Layouts`_).

Every sort follows the rules first, then fills the remaining desks in the
chosen order. Desks are numbered in the order they are filled.

Third row: layouts
~~~~~~~~~~~~~~~~~~

Press a preset button, or type a layout in the **Custom** box and press
**Apply** (or **Enter**). The current layout is always shown in the box, so
you can tweak it. Changing the layout re-seats everyone using the last sort.

Fourth row: display options
~~~~~~~~~~~~~~~~~~~~~~~~~~~

**Surname Initial Only**
   Show *Alex S.* instead of *Alex Smith*.

**One-line Names**
   First name and surname side by side, with shorter desks. Useful for large
   classes.

**Show Homeroom**
   Show or hide the homeroom badge.

**Ignore Rules**
   Arrange students without applying any rules (the rules are kept, just not
   used).

**Hide Rule Badges**
   Hide the rule badges and group colours, e.g. when the plan is on the
   projector and students shouldn't see who has a rule.

**Limit Desk Width**
   Rows with fewer than 6 desks keep the width of a 6-desk row instead of
   stretching across the room. Rows mode only.

**Teacher's View**
   Show the room from the front: whiteboard at the bottom, rows reversed and
   left and right swapped. It is also used when printing.

**Row Controls**
   Show or hide the buttons beside each row (see `Moving whole rows`_). Rows
   mode only.

All display options are saved with the plan.

Layouts
-------

Rows of desks
~~~~~~~~~~~~~

Type the number of desks in each row, **front row first**, separated by
commas:

* ``7,8,9,6``: rows of 7, 8, 9 and 6 desks
* ``5x6``: 5 rows of 6 desks

Put empty floor space in square brackets, counted in desk widths:

* ``3[1]3``: 3 desks, an aisle, 3 desks
* ``[2]3[2]``: a row of 3 desks centred, with 2 spaces each side
* ``1[6]1, 1[6]1, 8``: a horseshoe

Limits: up to 12 rows, each with 1–20 desks and at most 24 places wide (desks plus
spaces). Desks either side of a space are not counted as next to each other.

Tables
~~~~~~

In **Tables** mode, type the seats at each table, commas between tables and
``/`` between rows of tables, front row first:

* ``4``: a table of 4 (2 × 2)
* ``6``: a table of 6, 3 wide and 2 deep
* ``6d``: a table of 6, 2 wide and 3 deep

| For example:
| ``6,4,6 / 4,6,4`` means tables of 6, 4 and 6 then tables of 4, 6 and 4.
| ``2x3`` means 2 rows of 3 tables of 4.
| ``2x3 6`` uses 2 rows of 3 tables of 6.
| Limits: up to 8 rows of 8 tables.

Rows and tables each keep their own layout, so you can switch between them
without losing either.

Moving students by hand
-----------------------

* **Drag** a student onto an empty desk to move them there.
* Drag onto a desk that already has a student to **swap** the two.
* When the **Unassigned** list is showing (students without a desk), drag
  students into it or out of it.

Dragging is not limited by the rules, but a desk turns **red** if the student
there breaks one, so you can see at a glance what needs fixing.

Moving whole rows
-----------------

In **Rows** mode, each row has a label (*Row 1* is the front row) and three
buttons on its left:

* **⇄ Flip** reverses the students in that row, so the student at one end
  moves to the other end.
* **⇅ Swap** exchanges two rows. Press **⇅** on the first row (it gets an
  orange dashed outline), then **⇅** on the row to swap it with, e.g. row 1
  then row 3. To cancel, press **⇅** on the same row again, or press **Esc**.
* **Shuffle** (the crossed-arrows button) mixes up the students in that row
  only. They swap among the desks they already use, so empty desks stay
  empty, and the rest of the room is untouched. It looks for an order that
  breaks no rules, so keep-together groups stay side by side. Press it again
  for a different order.

Only the students move; the desks and the layout stay the same. When
swapping, each student takes the same desk position in the other row, so an
empty desk stays where it was. If the two rows have different numbers of
desks, students who don't fit go to a free desk in the longer row, or to
**Unassigned** if there is none (a message says so).

Flipping and swapping do not check the rules: a desk turns red if a student
there now breaks one (e.g. a *Left side* student who is now on the right).

Untick **Row Controls** to hide all three buttons. They never appear in
**Projector View**, in **Tables** mode or on printouts.

Seating rules
-------------

Press **Rules**, choose a rule from the drop-down, then tick the students it
applies to. Changes are saved straight away; press **Done** to close.

**⬆ Front row** / **⬇ Back row**
   Ticked students sit in the front (or back) row.

**⬅ Left side** / **➡ Right side**
   Ticked students sit at the left (or right) end of a row. Left and right
   are the *students'* left and right, facing the whiteboard.

**🪑 Empty seat beside**
   Ticked students get an empty desk next to them. That desk is kept free, so
   it counts towards the room's capacity.

**🔗 Keep together**
   Press **+ New group** and tick 2–4 students who should sit side by side.
   A pair is placed on a shared pair of desks (desks 1–2, 3–4 …) where
   possible; 3 sit on neighbouring desks; 4 fill two pairs of desks. A
   student can only be in one keep-together group.

**⚠️ Keep apart**
   Press **+ New group** and tick 2 or more students. No two of them sit
   next to each other, including diagonally. A student can be in several
   keep-apart groups.

Use **Edit** or the bin to change or delete a group, and **Clear all** to
remove a one-student rule from everyone. Students who can't be added (e.g.
someone in the front row being put with someone in the back row) are greyed
out with the reason beside their name.

In **Tables** mode, the rules apply to tables instead: *front row* means a
table in the front row of tables, *keep together* means the same table (up
to the size of the largest table), and *keep apart* means different tables.

When not every rule can be met
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If the room can't satisfy every rule at once (too many front-row students,
say), the plan keeps as many as it can, giving priority to rules added
earlier. A message lists the rules that were left out, and the desks
breaking them are shown in red.

Badges and colours
------------------

Each student card shows small badges:

* **H11**: homeroom (hide with **Show Homeroom**)
* **⬆ Front**, **⬇ Back**, **⬅ Left**, **➡ Right**, **🪑 Empty**: the
  student has that rule; the card is blue
* **🔗 1**, **🔗 2** …: the student's keep-together group. The card is tinted
  in the group's colour, so everyone in a group shares a colour.
* **⚠️ 1**, **⚠️ 2** …: a keep-apart group, shown as a dashed badge in the
  group's colour on an orange card. Students with the same badge must not
  sit next to each other.

Group numbers and colours match the groups listed in **Rules**.
Keep-together and keep-apart groups use different colours, so **🔗 1** and
**⚠️ 1** never look alike. A **red** desk means the student there is
breaking a rule.

**Hide Rule Badges** hides all rule badges and group colours but keeps the
homeroom badge.

Printing
--------

**Print** opens a print-ready copy on one landscape page: the title,
whiteboard and desks with students' names (and homerooms, if shown), exactly
as they are seated. Rule badges, group colours, red highlights and row buttons are always
left off. **One-line Names** and **Teacher's View** are used if they are on.
Choose **Save as PDF** in the print box to keep a PDF.

Getting the most out of it
--------------------------

**Set each class up once.** Import the class list, name the plan, choose the
layout, add your rules, then press **Export JSON** and keep the file. After that,
changing the seating takes seconds.

**Add rules first, then sort.** Every sort follows the rules, so add *Front row*,
*Keep apart* and so on before pressing **A → Z** or **Random**. Then fine-tune by
dragging; red desks show anything you need to fix.

**Use as few rules as you need.** Each rule narrows the choices. With many rules
in a small room the plan may not be able to meet them all, and it tells you
which it left out. Keep the essentials (support needs, students who must be
apart) and handle the rest by hand.

**Match the real room.** Use square brackets for aisles and gaps (``3[1]3``) so
"next to" means next to in the real room. Students across an aisle are not
counted as neighbours.

**Fill from the back for small classes.** **Fill: Last → First** leaves the front
rows empty, or use it with *Front row* rules so the students who need to be
close still are.

**Freshen up without starting again.** Use a row's **Shuffle** button to mix up
one row, **⇅ Swap** to move a whole row forward, or **⇄ Flip** to swap the ends
of a row, without touching the rest of the room.

**Two layouts for one class.** Rows and Tables keep their own layouts, so the
same class can switch between test seating (rows) and group work (tables) with
one click. For a different room, keep a second plan (see
:doc:`/info/seatingplans_info`).

**Project it, then print it.** Tick **Hide Rule Badges** before **Projector
View** so students don't see who has a rule. Tick **Teacher's View** before
printing to get a copy that matches what you see from the front.

**Keep a copy before experimenting.** Press **Export JSON** first; **Revert**
brings the saved plan straight back.

Saving and privacy
------------------

* **Saved automatically.** Every change is saved straight away in this
  browser. Close the page and it reopens exactly as you left it, with every
  student on the same desk.
* **Only in this browser on this computer.** The plan is not sent to any
  server and is not copied to your other computers or browsers. It is lost
  if the browser's site data is cleared, and isn't kept at all in a private
  or incognito window.
* **Back up with Export JSON**, and use **Import JSON** to move the plan to
  another computer or browser.
* **Shared computers:** anyone using the same computer sign-in and browser
  can open the page and see the plan. Press **Reset** before you leave a
  shared computer.
* **Exported files contain student names.** Store them where you keep other
  class lists, not on shared or public drives.
