=========================
Student Groups user guide
=========================

The student groups planner sorts a class into groups for you. It can keep
chosen students together or apart, give each student a role, and leave out
students who are away. You can drag students between groups by hand, lock
students in place, show the groups full-screen on a projector, or print them.

Everything happens in your browser. Student names are never sent anywhere. The
page remembers your groups exactly as you leave them, and a whole plan can be
saved to a file and opened again later.

This guide shows how to use the planner and get the most out of it. Technical
details for whoever runs the website are in :doc:`/info/studentgroups_dev`.

Getting started
---------------

1. **Load your class.** If the planner already shows your students, skip this
   step. Otherwise press **Import Roster** and choose your class list (an Excel
   or CSV file, see `Class lists`_). The planner is named after the file, e.g.
   *8_Science_P3.xlsx* becomes "8 Science P3". Click the title to change it.
2. **Choose a group size.** Click a number under **Group Size**.
3. **Make the groups.** Press **Random Grouping** for a fresh mix, or **A → Z**,
   **Z → A** or **Homeroom A → Z** to fill the groups in order. Press Random
   Grouping again for a different mix.
4. **Adjust by hand.** Drag a student onto another student to swap them, onto
   an empty place to move them, or to *Unassigned* to take them out of the
   groups.

That's all you need. The rest of this page covers everything else the planner
can do.


Class lists
-----------

**Import Roster** reads an Excel (``.xlsx``, ``.xls``) or ``.csv`` file. The
first row must be headings. These headings are recognised (any case):

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Heading
     - Notes
   * - ``Preferred`` or ``First Name``
     - The name shown on the card. ``Preferred`` is used first if both are
       there.
   * - ``Surname`` or ``Last Name``
     - Shown under the first name.
   * - ``Homeroom``
     - Optional. Shortened to its first letter and last two digits, so
       ``H-Room 211`` shows as ``H11``.

Empty rows are skipped. Importing a new class list clears any rules (you are
asked first) and puts everyone back in the groups.


The toolbar at a glance
-----------------------

.. list-table::
   :header-rows: 1
   :widths: 26 74

   * - Button
     - What it does
   * - **Import Roster**
     - Loads a class list from Excel or CSV.
   * - **Import JSON** / **Export JSON**
     - Opens or saves a whole plan (see `Saving and opening plans`_).
   * - **Reset**
     - Goes back to the page's own class list and starting settings.
   * - **Revert**
     - Goes back to the last file you opened or saved.
   * - **Print**
     - Prints the groups.
   * - **Projector View**
     - Shows just the groups, full-screen, in large text.
   * - **Clear**
     - Empties every group into *Unassigned*, ready to place students by hand.
   * - **A → Z** / **Z → A**
     - Fills the groups in surname order.
   * - **Homeroom A → Z**
     - Fills the groups homeroom by homeroom.
   * - **Random Grouping**
     - Shuffles the class into new groups.
   * - **Rules**
     - Keep students together or apart (see `Rules`_).
   * - **Attendance**
     - Mark students who are away today (see `Attendance`_).
   * - **Group Options**
     - Edit roles and group names (see `Roles`_ and `Group names`_).
   * - **Rotate Roles**
     - Moves each role along to the next student. Shown while roles are on.

Messages appear in a yellow bar under the toolbar. Click **✕** to dismiss one.


Group sizes
-----------

The **Group Size** buttons (2–10) make every group that size, with as many
groups as the class needs. Students are spread evenly, so 27 students in groups
of 4 make six groups of 4 and one of 3.

**Groups of different sizes.** Type the sizes in the box beside the buttons and
press **Apply** (or Enter):

* ``3, 3, 3, 4, 4, 5, 6`` makes seven groups of those sizes.
* ``3x4, 5`` is a shortcut for three groups of 4, then one of 5.

Each group can hold 1–10 students, and there can be up to 40 groups. Clicking a
size button fills the box with that layout, ready to tweak; for example, pick 4
and change the last group to 3.

If the groups have fewer places than students, the leftover students wait in
*Unassigned* and a message says so. If there are spare places, students are
spread in proportion to each group's size.


Rules
-----

Rules keep particular students together or apart whenever the groups are made.

Press **Rules**, choose *Keep together* or *Keep apart* from the dropdown, then:

1. Press **+ New group**.
2. Tick the students (use the search box to find them quickly).
3. Press **Save group**.

Keep together
   Everyone in the group is always put in the same group, so a keep-together
   group can't be bigger than your groups.

Keep apart
   No two students in the group are ever put in the same group. Add as many
   students as you like.

Each rule group can be edited or deleted later. Students who can't join a
group, for example because they are already being kept apart from someone in
it, are greyed out with the reason beside them.

**How rules show on the groups.** Students with rules carry small numbered
badges: 🔗 for keep-together groups (the whole card also takes that group's
colour) and ⚠️ for keep-apart groups. Anyone breaking a rule, for example after
you drag them, is highlighted in red.

**When rules can't all be met.** The planner keeps as many as it can (the
earliest rules first) and lists the ones it left out in the message bar.

**Ignore Rules** makes groups without using any rules. **Hide Rule Badges**
hides the badges, the red highlights and the "rules left out" message, which is
handy when the groups are on the projector.


Attendance
----------

Press **Attendance** and tick the students who are away today. They move to an
*Away today* list in the sidebar and are left out when groups are made.

* **Regroup** rearranges the groups with only the students who are here.
* **Everyone here** clears the list.
* You can also drag a student onto *Away today* to mark them away, or drag them
  from it into a group when they arrive.

The button shows how many are away, e.g. **Attendance (2 away)**. Away students
are listed at the bottom of printouts.


Locking students in place
-------------------------

Hover over a student in a group and click the 🔓 padlock. They are now locked in
that place: the card gets an amber outline and a 🔒. The padlock beside a
group's name locks or unlocks the whole group.

Locked students stay exactly where they are when you press Random Grouping,
A → Z or a size button, and everyone else is rearranged around them. This is
useful when you have placed a few students carefully and want the rest
shuffled.

* A locked student you drag somewhere else stays locked in the new place.
* Moving a student to *Unassigned* or *Away today* unlocks them.
* If the group sizes change so a locked place no longer exists, the locks are
  released and a message says so.

On touch screens the padlocks are always faintly visible.


Roles
-----

Tick **Show Roles** to give each student in a group a role. The first student
in each group gets the first role, the second gets the second, and so on.
Students beyond the number of roles get none.

Each role shows as an icon to the left of the student's first name, and a key
above the groups shows what each icon means
(*Roles: 👑 Leader · ✏️ Scribe · ⏱️ Timekeeper · 🧰 Materials*). Hover over a
card to see its role.

**Rotate Roles** moves every role along to the next student in each group, so
roles can change each lesson without changing the groups.


Changing the roles
~~~~~~~~~~~~~~~~~~

Open **Group Options**. Changes show on the groups straight away.

* Each role has its own row: an icon picker, the role name, **↑** / **↓** to
  reorder and **✕** to remove. *auto* picks an icon to suit the name.
* **+ Add role** adds another (up to 10).
* Renaming a role keeps its icon if the new name doesn't have one of its own,
  so *Recorder* renamed to *Data recorder* keeps 📋.
* A role without an icon shows as an orange circle with its first letter.
* Choose a ready-made set from the list and press **Use**:

.. list-table::
   :header-rows: 1
   :widths: 26 74

   * - Set
     - Roles
   * - Classic (default)
     - 👑 Leader, ✏️ Scribe, ⏱️ Timekeeper, 🧰 Materials
   * - Science lab
     - 🔬 Investigator, 📋 Recorder, 🧪 Equipment, 🦺 Safety officer,
       📣 Reporter
   * - Discussion
     - 🧭 Facilitator, 📝 Note-taker, 🗣️ Spokesperson, ❓ Questioner,
       🤔 Challenger
   * - Pair programming / Micro:bit
     - 💻 Driver, 🧭 Navigator, 🐞 Tester, 🔎 Researcher
   * - Maths problem solving
     - 💡 Strategist, 🧮 Calculator, ✅ Checker, 🎤 Presenter
   * - Reading circle
     - 📖 Reader, 🧾 Summariser, 🔤 Word finder, 🔗 Connector, 🎨 Illustrator
   * - Project team
     - 📅 Project manager, 🎨 Designer, 🔧 Builder, 📊 Data analyst,
       🎤 Presenter
   * - Encourager set
     - 👑 Leader, 🌟 Encourager, ✅ Checker, 📣 Reporter

**Save as my set** keeps your current roles under a name you choose. Your sets
appear with a ★ in the list on every planner in that browser, and can be
removed with **Delete**.


Group names
-----------

Click a group's name on the plan to rename it (press Enter to finish), or open
**Group Options** to name them all in one place:

* There is a box for each group. Leave one empty to show *Group 1*, *Group 2*
  and so on.
* Pick a theme and press **Use** to name every group at once: *Elements*
  (Hydrogen, Helium, …), *Planets & moons* (Mercury, Venus, …), *Scientists*
  (Curie, Darwin, …) or *Colours* (Red, Orange, …). *Group 1, Group 2 …*
  clears the names.
* **Save as my list** keeps your group names to reuse on any planner in that
  browser.

Your saved role sets and name lists are kept in the browser, so they don't
follow you to another computer. The roles and names a plan is using are saved
with it when you press **Export JSON**.


Display options
---------------

The checkboxes on the bottom row change how the groups look. They also apply
to projector view and printouts.

.. list-table::
   :header-rows: 1
   :widths: 28 72

   * - Checkbox
     - Effect
   * - Surname Initial Only
     - Shows "Smith" as "S."
   * - Show Homeroom
     - Shows the homeroom badge on each card.
   * - Ignore Rules
     - Makes groups without using the rules.
   * - One-line Names
     - First name and surname side by side on shorter cards.
   * - Hide Rule Badges
     - Hides rule badges, red highlights and the "rules left out" message.
   * - Show Roles
     - Shows role icons and the role key.
   * - Number Students
     - Numbers the students 1, 2, 3 … in each group.
   * - Left-align Names
     - Lines the names up on the left of each card (otherwise centred).
   * - Large Icons
     - Doubles the size of the role icons and numbers, in a column at the left
       of each card.

One-line Names with Large Icons can be tight when groups are narrow; long names
are then cut short. The stacked layout doesn't have this problem.


Projector view and printing
---------------------------

**Projector View** fills the screen with just the groups and the role key, in
large text. Press **✕ Exit projector view** or Esc to leave.

**Print** opens a printable copy in landscape, with the title, the role key,
the groups (names, numbers and role icons) and a list of anyone away. Buttons,
padlocks, rule badges and red highlights are left out, and there is no box
around each student; each group keeps its outline.

If the page has a **Print all** button, it prints every planner on the page,
each on its own sheet. That's handy for printing all your classes at once.


Saving and opening plans
------------------------

**The browser remembers.** Every change (students, rules, sizes, who is in which
group, names, roles, attendance, locks and display options) is kept in that
browser, so the page reopens exactly as you left it.

**Export JSON** saves the whole plan as a file. In Chrome and Edge a *Save As*
box lets you choose the folder and name; other browsers ask for a file name and
download it. Use this to keep a plan, move it to another computer, or share it.

**Import JSON** opens a saved plan, on this page or another. The file is checked
before anything changes, and a message says what was loaded, for example
*Imported 8J.json: 27 students, 10 rules, groups of 4 and the saved groups.*
Damaged files and files from other tools are turned away with a reason.

**Revert** goes back to the last file you opened or saved, or the last class
list you imported (in its original order). It's greyed out until there is
something to go back to.

**Reset** goes back to the page's own class list and starting settings and
forgets this planner's remembered plan. Your saved role sets and name lists are
kept.


Using a seating plan
~~~~~~~~~~~~~~~~~~~~

**Import JSON** also opens a file saved from the seating plan:

* In **tables** layouts, each table becomes a group, so students who sit
  together stay together.
* In **rows** layouts, each row becomes a group (rows longer than 10 desks are
  split).
* Empty tables or rows are left out. Keep-together and keep-apart rules come
  across; seat-position rules (front or back row, left or right side, empty
  seat) don't, and the message says how many were left out.


Getting the most out of it
--------------------------

**Set each class up once.** At the start of term, import the class list, add
the rules you always need (who must be kept apart, who works well together),
choose your roles, then press **Export JSON** and keep the file. Each lesson
afterwards only takes a click or two.

**A typical lesson:**

#. Open the page. Your groups are as you left them.
#. Press **Attendance**, tick anyone away, then press **Regroup**.
#. Press **Random Grouping** for new groups, or keep last lesson's groups.
#. Press **Rotate Roles** so everyone gets a different job.
#. Tick **Hide Rule Badges**, then press **Projector View**.

**Ideas that work well:**

* **Mixed-ability groups.** Put your strongest students in a *Keep apart* group
  so each group gets one. Do the same for students who need extra support.
* **Reliable partners.** Use *Keep together* for a student who needs a buddy,
  such as a new student or an EAL/D student with a translator friend.
* **Hand-picked leaders.** Drag your chosen leaders into the first place of each
  group and lock them (🔓). Random Grouping then shuffles everyone else around
  them, and with roles on, each leader gets the first role.
* **Practical work.** Use the *Science lab* role set with groups of 4 or 5, so
  every student has a job (equipment, safety, recording, reporting).
* **Coding lessons.** Use groups of 2 with the *Pair programming* roles and
  press **Rotate Roles** halfway through so driver and navigator swap.
* **Uneven rooms.** If your benches seat different numbers, type the sizes in
  the group sizes box (e.g. ``4, 4, 4, 6``) to match the furniture.
* **Named groups.** Theme names (elements, planets, scientists) make it easy to
  call groups out ("Carbon group, you're up first") and are good for a quick
  quiz about the names themselves.
* **Table cards.** Print the groups with **Number Students** and **Large Icons**
  on and put the page on the front bench, so students can find their group and
  role without asking.
* **Keep a copy before experimenting.** Press **Export JSON** first; **Revert**
  brings the saved groups straight back.


Privacy
-------

* Class lists, rules and groups stay **in this browser on this computer**. They
  are not sent to any server and are not copied to your other devices.
* They are lost if the browser's site data is cleared, and aren't kept at all in
  a private or incognito window. **Export JSON** is your backup.
* On a shared computer, anyone using the same sign-in and browser can open the
  page and see your groups. Press **Reset** before you leave.
* **Exported files contain student names.** Store them where you keep other
  class lists, not on shared or public drives.


Tips
----

* **Several classes on one page.** Each planner remembers its own groups.
* **Moving to another computer.** Plans are remembered per browser. Use
  **Export JSON**, then **Import JSON** on the other computer.
* **Importing Excel** needs an internet connection the first time, to load the
  Excel reader. CSV files work offline.
* **Before projecting**, tick **Hide Rule Badges** so students don't see who is
  being kept apart.


Troubleshooting
---------------

Some students are left in *Unassigned*
   The groups have fewer places than students. Add places in the group sizes
   box, or pick a bigger group size.

A rule isn't being followed
   The rules may not all fit at once, for example a keep-together group bigger
   than a group. The message bar lists any rules left out. Also check
   **Ignore Rules** isn't ticked.

My groups didn't follow me to another computer
   Plans are remembered per browser. Use **Export JSON** and **Import JSON**.

I want to start again
   **Reset** returns to the page's own class list. **Clear** just empties the
   groups.
