==========================
Noise Monitor user guide
==========================

The noise monitor helps a class manage its own volume. It listens through the
computer's microphone, shows a live noise meter, and fills an empty room picture
with silly animated things as the class gets louder. When the room settles, the
level steps back down and the picture empties again.

It is designed to be projected: there is a full-screen mode, a countdown clock,
and short messages that can be read from the back of the room.

This guide shows how to use it and get the most out of it. Technical details
for whoever runs the website are in :doc:`/info/noisemonitor_dev`.

----

Quick start
-----------

#. Open the page on the computer connected to the projector.
#. Press **Start monitor** and allow microphone access when the browser asks.
#. Ask the class to be silent, open **Settings** (the gear) and press
   **Calibrate**. This sets a quiet room to Level 0.
#. Press **Full screen**.

That's all you need. The rest of this page explains what you can change.


How it works
------------

How it works
------------

The microphone reading is shown on a 0–100 dB scale. The range between
**Min** and **Max** is split evenly into six levels, 0 to 5.

* **Level 0** is a calm, empty room.
* As the noise rises, each level adds more animated things to the picture.
  Things on the floor, desks and walls come first; flying things arrive at the
  louder levels.
* **Level 5** sets off flashing alarm lights and the room's grand finale.

The level jumps **up** straight away when the noise rises, but only steps
**down** one level at a time once the room has been quieter for the
*step-down* delay (3 seconds by default). This stops the picture flickering.

At each level, the monitor picks a fresh random mix from a pool of gags every
time that level switches on, so the scene is different from lesson to lesson.

Once the room reaches Level 4, things are thinned out (one gag per lower level)
so the busiest levels stay readable. At Level 3, a Level 4 gag occasionally
peeks in for a few seconds as a warning.



Rooms
-----

Rooms
-----

There are four rooms. Choose one in the settings panel (**Picture**).
Each room is drawn in layers, so walking things pass *behind* desks, benches
and tables in front of them.

.. list-table::
   :header-rows: 1
   :widths: 26 74

   * - Room
     - Level 5 finale
   * - Classroom (default)
     - A see-through indoor tornado whirling chairs, socks and pencils
   * - Science lab
     - A rocket with a dog astronaut counts down and blasts off
   * - Group tables
     - A giant inflatable dinosaur bouncing on the front table
   * - Maths room
     - A huge glowing ∞ with numbers and symbols racing around it



What appears at each level
~~~~~~~~~~~~~~~~~~~~~~~~~~

Each level shows a random pick from its pool (usually two at Levels 1–3 and one
at Levels 4–5).

**Classroom**

.. list-table::
   :header-rows: 1
   :widths: 10 90

   * - Level
     - Pool
   * - 1
     - Snails in beanies, cat asleep on a desk, hopping pencils, dancing flower,
       spinning wall clock, whiteboard rocket doodle
   * - 2
     - Rubber chicken, hopping backpacks, bouncing basketball, juggling octopus,
       dangling spider
   * - 3
     - Goat eating the homework, bounding kangaroo, paper balls, paper plane
   * - 4
     - Flying books, sticky notes, pigeon, disco ball
   * - 5
     - Alarm lights, plus a llama on the light, a UFO beaming up a chair, or
       ceiling sprinklers

**Science lab**

.. list-table::
   :header-rows: 1
   :widths: 10 90

   * - Level
     - Pool
   * - 1
     - Lava lamp, magnet collecting paperclips, slime blob, ladybird under a
       magnifying glass, Newton's cradle, prism rainbow, lab mouse
   * - 2
     - Dancing skeleton, plasma ball, flame test (copper, sodium, potassium,
       lithium), rising bubbles, hamster wheel
   * - 3
     - Tesla coil, cola fountain, solar-system mobile, escaping periodic-table tiles
   * - 4
     - Atoms and molecules, DNA helixes, winged beakers
   * - 5
     - Alarm lights, plus a test-tube rocket or flying beakers

**Group tables**

.. list-table::
   :header-rows: 1
   :widths: 10 90

   * - Level
     - Pool
   * - 1
     - Party tortoises, sleeping puppy, teddy peeking from a beanbag,
       spinning top, rubber duck family
   * - 2
     - Toy train, wind-up robot, wobbling block tower, jack-in-the-box,
       balloon dog
   * - 3
     - Remote-control car, beach ball, paper plane, butterflies, soap bubbles
   * - 4
     - Pillow fight, kites, frisbees, yo-yo
   * - 5
     - Alarm lights, plus party balloons and confetti, a piñata, or a bubble flood

**Maths room**

.. list-table::
   :header-rows: 1
   :widths: 10 90

   * - Level
     - Pool
   * - 1
     - Abacus, walking π creatures, calculator, ruler inchworm, tumbling dice
   * - 2
     - Compass drawing a circle, marching shapes, fraction pie, tally marks,
       number cubes
   * - 3
     - Floating digits, flying protractors, bouncing die, graph-paper planes
   * - 4
     - Swirling operators, golden spirals, flying 3D solids, parabola ride
   * - 5
     - Alarm lights, plus a number storm, scrolling digits of π, or a
       calculator "ERROR" explosion



Reverse mode
~~~~~~~~~~~~

With **Reverse** ticked in the settings panel the picture runs
backwards: the room is packed with action while the class is quiet, and things
disappear as the noise rises, leaving an empty room when it is loud. The meter,
warning and messages still follow the real noise level. The room stays empty
until the monitor starts listening.



Using the monitor
-----------------

The toolbar
-----------

* **Start / Stop monitor** turns the microphone on and off.
* **Noise meter** (just under the toolbar) shows the live reading, the six
  levels, a recent-peak marker and a dashed line at the warning threshold.
* **Clock** shows the timer. Click it to open the timer controls.
* **Full screen** fills the screen for projecting.
* **Settings** (gear) opens the settings panel.

The timer
---------

Click the clock to open its panel:

* **Start / Pause / Resume** and **Reset**.
* Quick lengths: **No limit, 1, 2, 3, 4, 5, 10, 15, 20, 30, 45, 60** minutes,
  or type any number of minutes and press **Set**.
* **Stop the monitor when time is up** (on by default).

The clock starts when the monitor starts and pauses when it stops, but it can
also be run on its own. With a time limit it counts down, pulses amber in the
last minute and shows **Time's up!** at zero. With no limit it counts up.

Full screen
-----------

Full screen puts the meter, reading, clock and buttons in a strip across the
top, shows the whole picture framed below it, and the message underneath.
Press **Esc** or the full-screen button to leave.

The settings panel
------------------

The gear button opens a compact panel. Hover over a setting for a short
explanation.

* **Picture** — room, **Change room** (rotation) and **Reverse**.
* **Live** — the current reading and level, and **Calibrate**.
* **Levels** — Min, Max and Warning.
* **Response** — Step-down, Mic boost and Smoothing.
* **Display** — title, timer length, and whether to show the meter, dB
  reading and status line.
* **Level messages** — click to open and edit the six messages.
* **Export JSON**, **Import JSON**, **Reset** and **Done** along the bottom.

Calibrating
-----------

Every room and microphone is different. Ask the class to be silent, open the
settings panel and press **Calibrate**. The monitor listens for 4 seconds and
moves the whole scale so that a quiet room sits at Level 0, keeping the same
spread between Min, Max and Warning.

If the levels still climb too easily, raise **Max**; if they hardly move,
lower it or raise **Mic boost**.



Messages
--------

Each room has short default messages, one per level, for example:

.. list-table::
   :header-rows: 1
   :widths: 10 22 22 22 24

   * - Level
     - Classroom
     - Lab
     - Group tables
     - Maths
   * - 0
     - Perfect silence!
     - Lab silence. Brilliant!
     - Cosy and calm!
     - Zero noise. Perfect!
   * - 1
     - Keep it this calm!
     - Calm chemistry!
     - Keep it this calm!
     - Calm and calculated!
   * - 2
     - Bring it down a notch!
     - Bring it down a notch!
     - Bring it down a notch!
     - Subtract some noise!
   * - 3
     - Volume down!
     - Too much fizz!
     - Volume down!
     - Divide the volume!
   * - 4
     - QUIETEN DOWN!
     - HIGH VOLTAGE!
     - QUIETEN DOWN!
     - QUIETEN DOWN!
   * - 5
     - SOUND THE ALARM!
     - SOUND THE ALARM!
     - SOUND THE ALARM!
     - SOUND THE ALARM!

Untouched default messages follow the room, so they change when you change the
room. A message you write yourself stays the same in every room. To write your
own, open **Settings**, click **Level messages** and type in the box for each
level. An empty box shows no message at that level; **Reset** brings back the
room's messages.


Getting the most out of it
--------------------------

**Calibrate every lesson.** Rooms, microphones and class sizes differ, and even
the same room sounds different with the windows open. A 4-second calibration at
the start keeps the levels fair.

**Agree what each level means.** Before you start, tell the class what you
expect: for example *Level 0–1 for silent work, up to Level 2 for partner talk,
Level 3 means stop and check*. Write those expectations into the level messages
so they are on the screen all lesson.

**Pick the right Warning level.** The red warning should mean "too loud for
this activity". For quiet reading set it low; for group work raise it so normal
discussion doesn't trigger it.

**Use the timer.** Set the activity length (e.g. 10 minutes) so the class can
see how long is left. With **Stop the monitor when time is up**, the monitor
stops at zero and shows *Time's up!*.

**Make the reward the quiet room.** Students quickly learn which gags appear at
each level. Some classes like to "earn" a calm room; others enjoy the
challenge of keeping the picture empty. With younger classes, try
**Reverse** so a quiet room is full of fun things and noise makes them vanish.

**Keep it fresh.** Set **Change room** to rotate the rooms every few minutes, or
pick a room to suit the lesson (the lab for practicals, the maths room for
maths). Each level picks a new random mix of gags every time.

**Tame sudden noises.** If a dropped pencil keeps setting off the levels, raise
**Smoothing** or **Step-down** in the settings panel.

**Position the microphone.** A laptop microphone near the front mostly hears the
front rows. If you can, place the computer (or an external microphone) more
centrally, then calibrate.

**Save your settings.** Once it suits a class, press **Export JSON** in the
settings panel and keep the file. **Import JSON** puts everything back on any
computer.


Saving and sharing settings
---------------------------

Changes made in the settings panel are remembered in that browser for that
monitor, so the page opens with your settings next time. **Reset** returns to
the page's own settings.

**Export JSON** saves every setting as a small file. **Import JSON** loads one
back, on this page or another, or on another computer. A message says how many
settings were loaded; files from other tools are turned away.

If you would like a page to always start with your settings, send the exported
file to whoever runs the website.


Privacy
-------

* The monitor measures **how loud** the room is, many times a second. The sound
  is not recorded, stored or sent anywhere; nothing leaves the computer.
* The microphone is only on while the monitor is running. Press **Stop
  monitor** (or close the page) to turn it off. The browser shows a microphone
  indicator while it is on.
* Settings are saved only in this browser.


Requirements and tips
---------------------

* **Allow the microphone** when the browser asks. If it was blocked, use the
  icon in the address bar to allow it, then press Start again.
* **Close video calls.** Another app using the microphone can stop the monitor
  hearing the room.
* **The screen stays awake** while monitoring, on browsers that support it.
* **Reduce motion.** If the computer's *reduce motion* setting is on, the gags
  still move, but the whole-picture shake at Level 5 and a few pulsing effects
  are switched off.


Troubleshooting
---------------

The level never changes
   Check the microphone is allowed and not in use by another app (for example,
   a video call). Try **Calibrate**, or raise **Mic boost**.

It's always at Level 5
   The scale is too low for the room. Press **Calibrate** while the class is
   silent, or raise **Min** and **Max**.

It reacts to every little noise
   Raise **Smoothing** or **Step-down**, or raise **Max**.

My changes didn't stick on another computer
   Settings are remembered per browser. Use **Export JSON** and **Import JSON**.

The default messages changed when I switched rooms
   That is expected: untouched default messages follow the room. Edit a
   message to make it stay the same everywhere.

The microphone button says it isn't available
   The page must be opened over ``https://`` for the browser to allow the
   microphone. Ask whoever runs the website.
