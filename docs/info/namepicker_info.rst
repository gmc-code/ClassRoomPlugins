======================
Name Picker user guide
======================

The name picker chooses students at random, with a bit of theatre. A stack of
brightly coloured name cards spins upwards like a slot machine, slows down, and
settles with the chosen students on top. Pick one student to answer a question,
or up to ten at once for a group, a job or a presentation order.

Everything happens in your browser. Student names are never sent anywhere. The
page remembers your class, who is away and who has been picked, and the whole
picker can be saved to a file and opened again later.

This guide shows how to use the picker and get the most out of it. Technical
details for whoever runs the website are in :doc:`/info/namepicker_dev`.

----

Getting started
---------------

#. **Load your class.** If the picker already shows names, skip this step.
   Otherwise press **Roster** and choose your class list (see
   `Class lists`_). The picker is named after the file; click the title to
   change it.
#. **Choose how many** under **Pick** (1–10).
#. Press **Pick!** The stack spins and lands on your students. Press
   **Pick Again!** for the next turn.

That's all you need. The rest of this page covers everything else the picker can
do.


Class lists
-----------

**Roster** reads an Excel (``.xlsx``, ``.xls``) or ``.csv`` file whose
first row is headings. These headings are recognised (any case):

* **Preferred** or **First Name**: the name shown on the card
* **Surname** or **Last Name** (optional)
* **Homeroom** (optional): shown as a small badge, e.g. *H11*

Other columns are ignored. Importing a new class list clears the picks and the
history; you're asked first if there is a history to lose.

**Already set up a class in another tool?** **Import** also accepts a file
saved from the **student groups** planner or the **seating plan**. The picker
takes the class and its title, and from student groups also who is away. Your
picker settings stay as they are. This is the quickest way to use the same class
in every tool.


The toolbar
-----------

.. list-table::
   :header-rows: 1
   :widths: 26 74

   * - Button
     - What it does
   * - **Roster**
     - Imports a class list from Excel or CSV.
   * - **Import** / **Export**
     - Opens or saves the whole picker as a JSON file (see `Saving and opening`_).
   * - **Reset**
     - Goes back to the page's own class list and settings.
   * - **Revert**
     - Goes back to the last file you opened or saved.
   * - **Print**
     - Prints the last pick as a large numbered list.
   * - **Class**
     - The class list: mark who is here today (see `Who is here`_).
   * - **History**
     - Every pick so far, and how often each student has been picked.
   * - **Projector**
     - Just the title, the Pick button and the cards, full-screen.
   * - **Pick** 1–10
     - How many students to pick at once.
   * - **Order**
     - The order picked students are shown in (see `Order of the picks`_).
   * - **Time** and **Speed**
     - How long the stack spins, and how many names pass the top each second.
   * - **Easing** and **Settings**
     - How the spin speeds up and slows down; **Settings** opens Animation
       Settings.
   * - **Forget**
     - Forget Picks: puts everyone back in the hat (the history is kept).

Hover over any button or option to see what it does. Messages appear in a
yellow bar under the toolbar. Click **✕** to dismiss one.


How many, how long, and how it moves
------------------------------------

**Pick (1–10).** How many students to pick at once. With more than one, the
chosen cards are numbered 1, 2, 3 … (see `Order of the picks`_). If fewer
students are available than you asked for, everyone available is picked and a
message says so.

**Animation time (1–20 seconds).** How long the stack spins. Short times keep a
quick question moving; longer times build suspense.

**Easing** changes how the spin slows down. Choose a style from the **Easing**
list on the toolbar; the **Settings** button beside it opens **Animation Settings** to
adjust the speed and the style's settings (see `Animation Settings`_).

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Easing
     - Feel
   * - Linear
     - Constant speed, then a sudden stop.
   * - Ease out (default)
     - Fast at first, slowing smoothly to a stop.
   * - Ease in-out
     - Slow start, fast middle, slow finish.
   * - Ease out strong
     - Very fast, then a long, tense crawl to the end.
   * - Sine
     - A gentle, even slow-down.
   * - Exponential
     - Very fast, then a sudden brake.
   * - Circular
     - Fast, then a long smooth glide to the end.
   * - Overshoot
     - Slips just past the final name, then settles back.
   * - Elastic
     - Springs past and bounces back and forth before settling.
   * - Spring
     - Wobbles either side of the final name, like a spring coming to rest.
   * - Bounce
     - Lands and bounces like a dropped ball.
   * - Rubber band
     - Stretches a few names past the end, then snaps back.
   * - Anticipate
     - Pulls back a name or two first, then spins away.
   * - Steps
     - Moves one name at a time, at a steady pace.
   * - Ratchet
     - Slows down click by click, pausing on each name.
   * - Drumroll
     - Races up, waits trembling one name short, then drops in the last name.
   * - Near miss
     - Seems to stop one or two names short, then creeps on to the real pick.
   * - Random
     - A different style each pick, chosen at random from the styles you tick
       in Animation Settings (each with its own strength). The line under the
       cards says which style was used.

Whatever the style, it only changes how the stack moves: who is picked is
decided before the spin starts, so every style is equally fair.

Animation Settings
~~~~~~~~~~~~~~~~~~

Press **Settings** beside the **Easing** list to fine-tune the spin. Changes are saved straight
away, and **▶ Preview** tries them on a moving dot (and the graph) without
picking anyone.

* **Animation time**: the same setting as the toolbar slider.
* **Spin speed** (1–15 names a second, also **Speed** on the toolbar): how many names rush past the top. More
  names makes a faster, longer spin; fewer makes it calmer and easier to read.
  The footer shows roughly how many names will spin past.
* **Easing**: choose a style from the list. The graph shows how the stack moves
  over time: a curve above the *end* line means it slips past and comes back,
  and below the *start* line means it pulls back first.
* **Strength**: most styles have a slider. It sets, for example, how hard
  *Ease out* brakes, how far *Overshoot* or *Rubber band* go past, how long the
  *Drumroll* lasts or how long *Near miss* seems to stop. **Default strength**
  puts it back.
* **Random**: tick the styles Random may choose from (**All** ticks them all;
  **None** leaves just one, as at least one must stay ticked). The graph shows
  each ticked style in its own colour, and **Preview** tries one at random and
  names it. To change the strength of a style Random uses, choose that style in
  the list, set its strength, then choose **Random** again.

Each style remembers its own strength. The strengths and the styles ticked for
Random are saved with the picker and in **Export**.

**Checkboxes:**

.. list-table::
   :header-rows: 1
   :widths: 34 66

   * - Option
     - Effect
   * - Surname initial
     - Shows "Smith" as "S."
   * - Homeroom
     - Shows the homeroom badge on each card.
   * - No repeats
     - Skips students already picked: nobody is picked twice until everyone
       present has had a turn (see `Fair turns`_).
   * - No animation
     - Shows the result straight away.
   * - Sound
     - A soft tick as each name passes the top, and a chime when the pick
       lands.


Order of the picks
------------------

**Order** sets the order of the name stack and of the picked students:

* **Random**: the stack is shuffled, and the picks are shown in the order they
  landed.
* **A → Z** / **Z → A**: the stack runs in surname order, and the picks are
  listed in that order.
* **Homeroom**: the stack runs homeroom by homeroom (then surname).

The stack changes as soon as you choose an order, and the names spin past in
that order, like a reel. Where it stops is still random, so the student on top
is a fair pick. When you pick several at once with a sorted order, they are
neighbours in the list (e.g. three surnames in a row); use **Random** for a
fully mixed group.

Changing the order after a pick re-arranges the picked cards straight away. The
*Picked:* line, **Print** and **Put Back** follow the same order; the history
records the order they landed in.


Fair turns
----------

Tick **No repeats** to work through the class. Picked students
stay out of the hat until everyone present has been picked. When too few
unpicked students are left for the number you asked for, everyone goes back in
the hat and a message says so. Press **Forget** to start a new round
yourself.

The info line under the cards shows how many students are in the hat and how
many haven't been picked yet.

**History** shows every pick (newest first, with the time) and a *Times picked*
list with the least-picked students at the top. It's a quick way to check that
everyone gets a fair go over a term. **Clear history** empties it.


Put Back
--------

Picked someone who is out of the room, or who just answered? Press
**↩ Put Back** (beside **Pick Again!**). Those students go back in the hat, and
the pick is removed from the history, as if it never happened. Only the last
pick can be put back.


Who is here
-----------

**Class** shows the class in two columns, with a search box. Untick anyone
who is away; they are left out of the picking until you tick them again.

* **All Present** / **None Present** tick or untick everyone.
* Students already picked are tagged *picked* (or *picked before* once picks
  are forgotten), with how many times.
* **Forget** puts everyone back in the hat.


Projector view
--------------

**Projector** shows only the title, the **Pick!** button and the cards,
full-screen, and scales the stack to fill the screen.

* Press **Space**, **Page Down** or **→** to pick. Most presentation clickers
  send these keys, so you can pick from across the room.
* Press **Esc** or **✕ Exit projector view** to leave.


Printing
--------

**Print** opens the last pick as a large numbered list, with homerooms if they
are shown. It's handy for a speaking order or a list of helpers. Pick someone
first; there is nothing to print before the first pick.


Saving and opening
------------------

**The browser remembers.** The class, who is away, who has been picked, the
history and every setting are kept in that browser, so the page reopens as you
left it.

**Export** saves everything as a file. In Chrome and Edge a *Save As* box
lets you choose the folder and name; other browsers ask for a file name and
download it.

**Import** opens a saved file, or a class from the student groups or
seating plan tools. The file is checked first, and a message says what was
loaded, e.g. *Imported 8J.json: 27 students (2 away), 14 rounds of picks in the
history.* Damaged files and files from other tools are turned away with a
reason.

**Revert** goes back to the last file you opened or saved, or the last class
list you imported.

**Reset** goes back to the page's own class list and settings, and clears the
picks and history.


Getting the most out of it
--------------------------

* **Cold calling, fairly.** Leave **No repeats** on all
  lesson so everyone answers once before anyone answers twice. Use **Put Back**
  when a student genuinely can't answer, so they stay in the hat.
* **Think, then pick.** Ask the question, give thinking time, *then* press
  Pick. Everyone prepares an answer because anyone could be chosen.
* **Speaking order.** Pick 5–10 at once for presentations; the numbers on the
  cards are the order.
* **Jobs and helpers.** Pick 2–3 for monitors, equipment or tidy-up, and print
  the list for the board.
* **Build suspense, or don't.** Use *Drumroll* or *Near miss* for a dramatic
  moment, *Ease out strong* with its strength turned up for a long crawl, and
  **No animation** when you just need a name.
* **Keep them guessing.** Choose **Random** and tick only the styles your class
  enjoys, so every pick looks a little different.
* **Easier to read on the projector.** Lower the **Spin speed** so students can
  follow the names as they pass.
* **Same class everywhere.** Set the class up once in student groups or the
  seating plan, export it, and import that file here.
* **Check the spread.** Glance at **History → Times picked** at the end of a
  week to see who has hardly been picked.
* **Keep a backup.** **Export** at the end of term keeps the history.


Privacy
-------

* Class lists, picks and history stay **in this browser on this computer**.
  They are not sent to any server or copied to your other devices.
* They are lost if the browser's site data is cleared, and aren't kept at all in
  a private or incognito window. **Export** is your backup.
* On a shared computer, anyone using the same browser can see the class. Press
  **Reset** before you leave.
* **Exported files contain student names.** Keep them where you keep other class
  lists.


Troubleshooting
---------------

The Pick button is greyed out
   There is nobody to pick. Import a class, or tick students in **Class**.

The same student keeps coming up
   It's random, so repeats happen. Tick **No repeats**.

No sound
   Tick **Sound**, check the computer isn't muted, and press **Pick!** once
   (browsers only allow sound after a click on the page).

Importing an Excel file fails
   The Excel reader is downloaded the first time, so it needs an internet
   connection. Save the sheet as CSV instead.

My picks didn't follow me to another computer
   Everything is saved per browser. Use **Export** and **Import**.