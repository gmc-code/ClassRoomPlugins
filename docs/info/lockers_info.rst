============================
Locker Allocation user guide
============================

The locker tool keeps track of which student has which locker. You set up the
locker numbers once, load a class list, then allocate lockers by typing,
pasting, dragging or with one click. Everything happens in your browser:
student names are never sent anywhere, and your work is saved on this computer
as you go.

Technical details for whoever runs the website are in :doc:`/info/lockers_dev`.

All the pictures in this guide use made-up students.

.. figure:: images/lockers/lockers_overview.png
   :alt: Three year levels of lockers in two areas, coloured by year, with each student's year and homeroom (top right) and padlock combination
   :width: 100%

   Three year levels of lockers in two areas, coloured by year, with each student's year and homeroom (top right) and padlock combination.

----

Quick start
-----------

#. Press **Lockers** and type the locker numbers, e.g. ``101-160``.
#. Press **Import** and choose the class's Excel or CSV export.
#. Allocate lockers, using whichever way suits:

   * **A–Z**, **Homeroom** or **Random** to fill the lockers in order, or
   * click a locker, type a few letters of a name and press **Enter**, or
   * **By Student** to type numbers down a list, or
   * **Paste** to paste a list from Excel or an email.

#. **Map** (a map of the lockers) or **List** (names in
   surname order with their locker).
#. Press **Save** to keep a backup copy.

The toolbar
~~~~~~~~~~~

The buttons are coloured by what they do:

* **Blue**: bring students in (**Import**, **Add**).
* **Lighter blue**: files (**Open**, **Save**, **Export**).
* **Teal**: printing (**Print**, **Map**, **List**).
* **Grey**: **Undo** and **Reset**.
* **Amber** and **purple**: setting up and allocating (**Lockers**,
  **By Student**, **Paste**, **Combos**, **A–Z**, **Random** …), and **red**
  for **Clear** and **Remove: Y9 / Y12**.

Hover over any button to see what it does.

.. figure:: images/lockers/lockers_toolbar.png
   :alt: The toolbar
   :width: 100%

   The toolbar.

Setting up the lockers
----------------------

Press **Lockers**. Type one *bank* of lockers per line. A name and a
colon at the start is optional:

.. figure:: images/lockers/lockers_setup.png
   :alt: Set up lockers: the line under the box counts the lockers in each bank as you type
   :width: 80%

   Set up lockers: the line under the box counts the lockers in each bank as you type.


.. code-block:: text

   Corridor A: 101-140
   Corridor B: 201-230, 235, 240-244
   Gym: G1-G24
   Science: 001-030

* ``101-140`` is every locker from 101 to 140.
* ``G1-G24`` (or ``G1-24``) works for lockers with letters in front.
* ``001-030`` keeps the zeros, so the lockers are 001, 002 ... 030.
* Single lockers and ranges can be mixed with commas.

The box shows how many lockers each line makes as you type, and points out
mistakes and lockers listed twice.

Small banks of 4, 6 or 8
~~~~~~~~~~~~~~~~~~~~~~~~

Lockers often come in small banks whose numbers don't follow on from each
other. Give each small bank its own line, put the numbers in the order you
want them read, and group the banks under an **area** heading in square
brackets. Banks in an area sit side by side, like the real lockers.

.. code-block:: text

   [Corridor A]
   A1: 101-104 | 2 high
   A2: 211-213, 301-303 | 2 high across
   A3: 543-550 | 2 high right
   A4: 620-623 | 4 high
   [Gym]
   Gym: G1-G24 | 1 high

* A bank can mix ranges: ``211-213, 301-303`` puts six lockers in one bank.
  With ``across`` and ``2 high``, 211–213 make the top row and 301–303 the
  bottom row.
* After the ``|``, each bank can have its own shape:

  ========================  ==============================================
  Option                    Meaning
  ========================  ==============================================
  ``2 high`` (1 to 6)       how many lockers tall the bank is
  ``down`` / ``across``     numbers go down each column, or along each row
  ``right``                 first locker at the right-hand end
  ``bottom``                first locker in the bottom row
  ========================  ==============================================

  Anything you leave out follows the toolbar (**Tiers**, **Run**,
  **Start**).

* You don't have to type it. Press the **⚙** button on a bank to change its
  name, height, direction, start corner and area. Typing an area name there
  moves the bank into that area.

.. figure:: images/lockers/lockers_bank_settings.png
   :alt: The ⚙ panel for bank A3, which starts at the right-hand end (111 is bottom right)
   :width: 70%

   The ⚙ panel for bank A3, which starts at the right-hand end (111 is bottom right).


Removing lockers
~~~~~~~~~~~~~~~~

* Press **✕** at the top right of a bank to remove that whole bank, or
* open **Lockers** and delete or change its line. Clearing the box
  removes every locker.

Students in removed lockers go back to the **No locker** list (you are asked
first), and **Undo** brings the bank back.

Tiers and numbering
~~~~~~~~~~~~~~~~~~~

Use **Tiers** to match how the lockers are stacked: 2 for double-height, 3 for
three-high and so on. **Run** sets the direction the numbers go:

**↓**
   101 at the top, 102 underneath, then the next column (most common).

**→**
   Along the top row first, then the next row.

With 1 tier the lockers simply wrap to fit the screen.

Which end the numbers start
~~~~~~~~~~~~~~~~~~~~~~~~~~~

Lockers aren't always numbered left to right. For a bank where 543 is at the
right-hand end and the numbers go up towards the left, press the bank's **⚙**
and set **First locker** to *Right*. **First row** set to *Bottom* is for
banks whose first locker is in the bottom row.

The toolbar's **Tiers**, **Run**, **Start** and **Top / Bottom**
set every bank at once, replacing any bank's own setting.

You can also type it in **Lockers** after a ``|``:

.. code-block:: text

   Corridor A: 101-140
   Corridor B: 543-550 | right
   Gym: G1-G24 | right bottom

Out-of-service lockers
~~~~~~~~~~~~~~~~~~~~~~

**Right-click** a locker (or select it and press **Out of service**) to mark
it broken or unavailable. It is shaded, skipped by the automatic allocation
and by the quick entry bar. Right-click it again to bring it back.

Importing a class list
----------------------

**Import** reads Excel (``.xlsx``, ``.xls``) or CSV files with a header
row. It uses the same columns as the seating plan:

* **Preferred** or **First Name**
* **Surname** or **Last Name**
* **Homeroom** (optional), also read from **Home Group** or **Form**
* **Year** (optional), also read from **Year Level**, **Yr** or **Grade**
* **Locker** (optional): if the file already has locker numbers, students are
  put straight into those lockers. Any locker number that has not been set up
  is added to a bank called *Other*.

Year levels and homerooms are kept separately and shortened to fit on a
locker. A **House** column such as *Hughes 13* is used as the homeroom if there
is no Homeroom column.

=============================================  ========  ========  ===============
In the class list                              Year      Homeroom  Year + Homeroom
=============================================  ========  ========  ===============
Homeroom *Hughes 13*, Year *Year 7*            Y7        H13       7 H13
Homeroom *Year 7 in Hughes 13*                 Y7        H13       7 H13
House *Hughes 13*, Year Level *Year 9*         Y9        H13       9 H13
=============================================  ========  ========  ===============

To add the year level to students you already have, use **Add**
with a file that has names and a **Year** column.

A file saved with **Export** (either layout) can be imported again this way.

Adding more students
~~~~~~~~~~~~~~~~~~~~

**Import** replaces the students already in the tool. To keep them and
add another class (for example a second homeroom or a late enrolment list),
use **Add** instead:

* New students are added to the **No locker** list.
* Anyone already on the list (same first name and surname, capitals don't
  matter) is not added twice. Instead their details are **updated** from the
  file.
* If the file has a **Locker** column, students without a locker are put in
  it; existing allocations are left alone.

Adding TG, House or other details
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Any extra column in a class list, such as **TG**, **House**, **Tutor** or
**Student ID**, is kept with each student. So to add tutor groups to the
students you already have, use **Add** with a file like this:

.. code-block:: text

   Surname,Preferred,TG,House
   Smith,Alex,7A,Red
   Jones,Sam,7B,Blue

Each matching student gets the new details; a value in the file replaces the
old one. The message line says how many students were updated and which new
details were found.

* **Badge** (in the toolbar) picks which detail shows beside each name:

  * **Year** — *Y7*
  * **Homeroom** — *H13*
  * **Year + Homeroom** — *7 H13* (the starting choice when years are known)
  * any other column from your class list, such as **TG**
  * **None**

  Columns such as House, Gender, Email, phone numbers, date of birth and
  student ID are kept with each student (and in the full **Export**) but are not
  offered as badges or shown when you hover.
  Long values with a number are shortened like homerooms, so a House of
  *Hughes 13* shows as **H13**. Short values (*7A*, *Red*) and names without
  a number (*Chisholm*) show in full.
* The second **Allocate** button sorts by whatever the badge shows, and its
  label changes to match (e.g. **House**), so you can keep each house's
  lockers together.
* Hover over a locker or name to see all of a student's details.
* **Find…** and the **By Student** filter search all
  the details, so typing ``7A`` finds everyone in 7A.
* The full **Export** includes every detail column, and **List** shows
  homeroom plus up to three more.

**Undo** takes the added students out again.

Allocating lockers
------------------

The quick entry bar
~~~~~~~~~~~~~~~~~~~

This is the fastest way to work through a pile of forms or a list on paper.

#. Click a locker (or type its number in the **Locker** box and press **Enter**).
#. Type a few letters of the student's name: first name, surname, either way
   round, or initials such as ``as`` for *Alex Smith*.
#. Press **Enter** to give them the top match (**↑** and **↓** choose another).
   The bar jumps to the next locker, ready for the next name.

.. figure:: images/lockers/lockers_entry.png
   :alt: Locker G5 is picked and "ar" typed: students without a locker come first, and "has 112" shows who already has one
   :width: 100%

   Locker G5 is picked and "ar" typed: students without a locker come first, and "has 112" shows who already has one.


Other keys in the name box:

=========================  ==================================================
Type                       Then **Enter** does
=========================  ==================================================
nothing                    skips this locker and moves to the next
``-``                      empties this locker, then moves on
``x``                      marks this locker out of service, then moves on
=========================  ==================================================

Students who already have a locker are listed after the others, with
*has 105* beside them. Choosing one **moves** them; whoever was in the locker
before goes back to **No locker**. The yellow message line always says what
changed, and **Undo** steps back.

Clicking names and dragging
~~~~~~~~~~~~~~~~~~~~~~~~~~~

* Type a locker number in the **Locker** box (it turns green when the locker
  exists, red when it doesn't), then **click a name** in the **No locker**
  list, or **drag the name onto the blue entry bar**. The student goes into
  that locker and the box moves on to the next locker.
* With a locker selected, clicking a name works the same way.
* Drag a name from the list onto a locker.
* Drag one locker onto another to swap the two students.
* Drag a locker back onto the list to empty it.

Allocate A → Z, Homeroom or Random
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

These fill the free lockers in number order, skipping out-of-service ones:

* **A–Z**: by surname, then first name
* **Homeroom** (or **TG**, **House** ...): by whatever the **Badge** shows,
  then surname, so each group is together
* **Random**: in random order

With **Keep** ticked (the usual setting), only students without a
locker are allocated. Untick it to reallocate *everyone* from the first
locker; you are asked to confirm.

**Clear** takes every student out of their locker. To clear just one bank,
press **Empty** at the top of that bank: its students go back to the
**No locker** list and the lockers stay. (**Empty** only shows when the bank
has names in it.)

End of the year: removing Year 9s or Year 12s
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

When a year group leaves, press **Y9** or **Y12** next to **Remove:** in
the toolbar. Every student
in that year comes off the list altogether (not just out of their locker), and
their lockers become free for next year's students. You are asked to confirm
first, and the message line says how many students were removed and how many
lockers are now free.

* The buttons work from each student's year level, so the class list needs a
  **Year** or **Year Level** column (or "Year 9" in the homeroom). A button is
  greyed out when there are no students in that year; hover over it to see
  how many there are.
* The students' combinations go with them.
* **Undo** brings them back. To keep a record, press **Export** or **Save**
  before removing them.
* Then use **Add** to bring in the new students and **A–Z** (with **Keep**
  ticked) to give them the free lockers.

By Student (enter lockers down a list)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Lists every student in surname order with a box for their locker number. Type a
number and press **Enter** (or **↓**) to go to the next student; **↑** goes
back. The filter box at the top narrows the list, e.g. to one homeroom.

Problems show in red beside the box: *No such locker*, *Out of service* or
*Used twice*. Press **Save** to apply; any row still showing a problem is left
without a locker.

.. figure:: images/lockers/lockers_by_student.png
   :alt: By Student: the cursor starts at the first student without a locker
   :width: 80%

   By Student: the cursor starts at the first student without a locker.


Paste (allocations from Excel or a list)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Paste lines that each have a name and a locker number, in either order. All of
these work:

.. code-block:: text

   Alex Smith	105
   106, Jones, Sam
   Priya Patel 107

Two columns copied from Excel paste as the first form. The preview shows how
many lines are ready and why any are skipped: an unknown name, a locker that is
not set up, a locker or name pasted twice. Two tick boxes let you add unknown
names as new students and unknown lockers to the *Other* bank.

Pasted allocations win: if a pasted locker belonged to someone else, they go to
**No locker**. Lockers not in the paste are left as they were.

A combination on a line (such as ``07 33 03``) is saved with that student, and
a line with just a locker and a combination (``506 07 33 03``) gives the
combination to whoever is in that locker. If the first line is a heading row, the columns are read by
their headings, so a table copied straight from Excel works:

.. code-block:: text

   Surname Name	First Name	Year Level	Locker number	Locker Combo
   Barden	Oliver	7	506	07 33 03
   Brown	Oliver	7	498	34 20 30

With **Add names that are not on the class list** ticked, new students get the
year level from the table too.

.. figure:: images/lockers/lockers_paste.png
   :alt: A table pasted from Excel, with a heading row. The line at the bottom shows what will happen before you press Apply
   :width: 80%

   A table pasted from Excel, with a heading row. The line at the bottom shows what will happen before you press Apply.


Lock combinations
-----------------

Each student can have their padlock's combination. The combination belongs
to the **student**, not the locker: if a student moves to another locker (or
is swapped, or taken out and put back), their combination goes with them.
An empty locker has no combination.

Combinations can be written ``07 33 03``, ``7-33-3`` or ``073303``; they are
tidied to ``07 33 03``.

Entering combinations
~~~~~~~~~~~~~~~~~~~~~

* **Combo box in the blue entry bar**: pick a locker, type the combination of
  the student in it and press **Enter**. The bar moves to the next locker
  that has a student, with the Combo box still selected, so you can work
  through a whole bank without the mouse (**↑** goes back). The box is greyed
  out for an empty locker.
* **Combos** button: every student in a list, in locker order (students with
  no locker at the end), with a box for their combination. **Enter** or **↓**
  moves down, and the filter narrows the list to one bank or name. Clear a box
  to remove a combination.
* **Paste**: a table with a **Locker Combo** column, or lines like
  ``506 07 33 03`` (see above).
* **Import** / **Add**: a class list with a **Locker Combo** (or **Combo**,
  **Combination**) column. A file with just **Locker** and **Locker Combo**
  columns gives each combination to the student in that locker.


.. figure:: images/lockers/lockers_combos.png
   :alt: The Combos list: one box per student, in locker order
   :width: 80%

   The Combos list: one box per student, in locker order.

Showing combinations
~~~~~~~~~~~~~~~~~~~~

Tick **Combos** in the toolbar to show each combination on its own line under
the student's name. It switches on
by itself the first time combinations are added. Hovering over a locker always
shows its combination.

**Print** and **Map** include the combinations when **Combos** is ticked, and
**List** adds a Combo column. Untick **Combos** before printing a list that
students will see.

When everyone has a locker
--------------------------

Once every student has a locker, the **No locker** list on the left is hidden
so the lockers can use the full width. A green line above the lockers shows
the totals instead. The list comes back as soon as anyone is without a locker
(for example after **Empty** or **Clear**, or when you **Add** students).

Year colours
------------

When students have a year level, each locker is coloured by year, and a key
above the lockers shows each year's colour and how many students are in it:

=======  ======
Year     Colour
=======  ======
7        blue
8        green
9        amber
10       purple
11       pink
12       teal
=======  ======

Names in the **No locker** list get a coloured stripe on the left too.
Untick **Year colours** in the toolbar to turn the colours off. The tick box
only shows when students have a year level. **Print** keeps the colours;
**Map** stays black and white.

Finding a student or locker
---------------------------

Type in **Find…** (right-hand end of the top row). Matching lockers light up
yellow, the rest fade, and matching names in the **No locker** list light up.
Press **Enter** to select the first match.

Printing and saving
-------------------

**Print**
   Prints the lockers exactly as they look on screen: colours, banks side by
   side, areas, badges and out-of-service shading. The toolbar, the
   **No locker** list and the bank buttons are left off, and the layout is
   shrunk to fit a landscape page.

**Map**
   A plain black-and-white landscape map of every bank, with names in the
   lockers. Good for pinning up near the lockers.

**List**
   Students in surname order, with the same columns as **Export**:
   **Surname Name**, **First Name**, **Year Level** and **Locker number**.
   One column down the page, about 40 names a page. Good for roll marking
   or handing to the office.

   .. figure:: images/lockers/lockers_print_list.png
      :alt: List with Combos ticked: a Locker Combo column is added. Untick Combos for a list students will see
      :width: 80%

      List with Combos ticked: a Locker Combo column is added. Untick Combos for a list students will see.


All the print buttons open your browser's print box straight over this page,
with no new window or tab, so pop-up blockers don't get in the way. Choose
**Save as PDF** there to keep a copy.

**Export**
   Downloads the list as **Excel (.xlsx)** or **CSV**. Choose the columns:

   * **Simple list**: exactly these four columns, ready for a school system
     or spreadsheet:

     ==============  ==========  ==========  =============
     Surname Name    First Name  Year Level  Locker number
     ==============  ==========  ==========  =============
     Smith           Alex        7           101
     Jones           Sam         8           302
     ==============  ==========  ==========  =============

     Options: Year Level as *7* or *Year 7*; order by surname or by locker
     number; include students without a locker (their Locker number is left
     blank) or leave them out; add a **Locker Combo** column (ticked when
     there are combinations).

   * **Full locker list**: one row per locker (number, bank, combination,
     name, year, homeroom, every other detail, status), then students with
     no locker.

   After **Download**, choose where to save it: in Chrome and Edge a Save As
   box lets you pick the folder and file name; other browsers ask for a name
   and save to Downloads. Press **Cancel** in the Save As box to go back to
   the Export dialog.

   Your choices are remembered for next time, and **Import** can read either
   file back. Excel files need an internet connection (the same as importing
   Excel); CSV always works.

   .. figure:: images/lockers/lockers_export.png
      :alt: The Export dialog
      :width: 70%

      Export: the simple list with a Locker Combo column, as an Excel file.

**Save** / **Open**
   The whole set-up: lockers, tiers, students, allocations, combinations and
   out-of-service lockers. Use it as a backup or to move to another computer.
   **Save** opens a Save As box in Chrome and Edge so you can choose the
   folder and file name; other browsers ask for a name and save to Downloads.

**Undo**
   Steps back through your last 60 changes.

**Reset**
   Goes back to how the page was first set up, removing your work from this
   browser. Undo can still bring it back until you leave the page.

Display options
---------------

* **Badge** chooses which detail shows in lockers and lists: Year (*Y7*),
  Homeroom (*H13*), Year + Homeroom (*7 H13*), another column such as TG, or
  None.
* **Initial** shows *Alex S.* instead of *Alex Smith*, for
  printouts that will be on display.
* Click the dark title bar to rename the tool, e.g. *Year 7 lockers 2027*.
