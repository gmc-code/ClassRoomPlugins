===============================
Noise Monitor directive info
===============================

The ``noisemonitor`` directive adds a live classroom noise meter to a page. It listens through the
computer's microphone, shows the current sound level on a meter bar, and swaps a large picture and
message as the room gets louder. Each of the six levels (Level 0 to Level 5) has its own picture and
its own message, so students can see at a glance how they are going and what the consequence is.

.. contents:: On this page
   :local:
   :depth: 1


Quick start
-----------

.. code-block:: rst

   .. noisemonitor::

That is all that is needed. The monitor appears with the default levels, a threshold of 60 and a
meter range of 0 to 100. To tune it for your room and your own wording:

.. code-block:: rst

   .. noisemonitor::
      :threshold: 55
      :image-min: 10
      :image-max: 70
      :msg0: Level 0 - Zoo Zen. Even the meerkats are meditating. Perfect silence!
      :msg1: Level 1 - Sneaky Safari. Whisper like a mouse sneaking past a sleeping lion!
      :msg2: Level 2 - Monkey Business! The monkeys are chattering. Bring the volume down!
      :msg3: Level 3 - Feeding Frenzy! The parrots are squawking and the monkeys are going bananas!
      :msg4: Level 4 - ROAR ALERT! The lions have joined the conversation. Quieten things down!
      :msg5: Level 5 - ZOO-MAGEDDON! The elephants are trumpeting, the monkeys are screaming, and the whole zoo is stampeding! SOUND THE ALARM!

The directive takes no content, only options.


How it works
------------

1. The teacher presses **Start Mic Monitor**. The browser asks for permission to use the microphone.
2. Sound from the room is measured many times a second and turned into a number from 0 to 100.
3. The meter bar fills according to that number. It is green below the threshold and turns red at or
   above it, and the status line changes to a warning.
4. The number is also converted into one of six **levels**. The picture and the large message change
   to match the level.
5. Pressing **Stop Mic Monitor** releases the microphone.

The number is a relative scale
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The number shown next to "dB" is worked out from the microphone signal as a value between 0 and 100.
It is **not** a calibrated sound pressure level or a true decibel reading, and the same room will give different numbers on different
computers, microphones and volume settings. Use the sliders described below to adjust the monitor to
suit each room, rather than relying on the numbers matching a sound meter.

How levels are chosen
~~~~~~~~~~~~~~~~~~~~~

The range between **Min Level** and **Max Level** is split into six equal bands. A reading at or
below the minimum is Level 0, and a reading at or above the maximum is Level 5.

For example, with a minimum of 10 and a maximum of 70, each band is 10 wide:

.. list-table::
   :header-rows: 1
   :widths: 25 25

   * - Reading
     - Level
   * - Below 20
     - Level 0
   * - 20 to 29
     - Level 1
   * - 30 to 39
     - Level 2
   * - 40 to 49
     - Level 3
   * - 50 to 59
     - Level 4
   * - 60 and above
     - Level 5

Moving the minimum up ignores background hum. Moving the maximum down makes the monitor more
sensitive, so the top levels are reached with less noise.

Going up fast, coming down slowly
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The monitor reacts straight away when the room gets louder, jumping up to the new level at once. When
the room goes quiet again, it steps **down one level every 3 seconds** rather than dropping back
immediately. A sudden shout therefore stays on the board for a moment, and the class has to settle
for a few seconds to work their way back to Level 0.

The meter bar and the number respond instantly. Only the picture, message and level change slowly.


Options
-------

All options are optional.

.. list-table::
   :header-rows: 1
   :widths: 20 14 66

   * - Option
     - Default
     - Description
   * - ``:threshold:``
     - ``60``
     - A whole number from 0 to 100. At or above this reading the meter bar turns red and the status
       reads "Warning: Exceeding Noise Threshold!". It does not change the level on its own.
   * - ``:image-min:``
     - ``0``
     - The reading that counts as the bottom of the scale (Level 0). Whole number from 0 to 100.
   * - ``:image-max:``
     - ``100``
     - The reading that counts as the top of the scale (Level 5). Whole number from 0 to 100. It must
       be greater than ``:image-min:``. Otherwise a build warning appears and the range falls back to
       0 to 100.
   * - ``:msg0:`` to ``:msg5:``
     - see below
     - The message shown for each level. Plain text on one line. Any HTML characters are shown as
       typed rather than being interpreted.

Default messages
~~~~~~~~~~~~~~~~

The default messages follow a zoo theme, getting wilder as the room gets louder.

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Level
     - Message
   * - 0
     - Level 0 - Zoo Zen. Even the meerkats are meditating. Perfect silence!
   * - 1
     - Level 1 - Sneaky Safari. Whisper like a mouse sneaking past a sleeping lion!
   * - 2
     - Level 2 - Monkey Business! The monkeys are chattering. Bring the volume down!
   * - 3
     - Level 3 - Feeding Frenzy! The parrots are squawking and the monkeys are going bananas!
   * - 4
     - Level 4 - ROAR ALERT! The lions have joined the conversation. Quieten things down!
   * - 5
     - Level 5 - ZOO-MAGEDDON! The elephants are trumpeting, the monkeys are screaming, and the
       whole zoo is stampeding! SOUND THE ALARM!

You can set only some of the messages. Any level you leave out keeps its default.


Controls on the page
--------------------

.. list-table::
   :header-rows: 1
   :widths: 28 72

   * - Control
     - What it does
   * - **Start / Stop Mic Monitor**
     - Turns the microphone on and off. The button turns red while monitoring.
   * - **Threshold Level** slider
     - Changes the point where the meter bar turns red and the warning appears.
   * - **Min Level** slider
     - Sets the bottom of the scale. If it is moved up to or past the maximum, the maximum is pushed
       up by 1 to stay ahead of it.
   * - **Max Level** slider
     - Sets the top of the scale. If it is moved down to or below the minimum, the minimum is pushed
       down by 1.
   * - **Custom Level Messages**
     - Six text boxes, one per level. Edit any of them and the message on screen updates straight away.
   * - **Export Settings**
     - Downloads the current threshold, min and max levels and all six messages as a file called
       ``noise-monitor-settings.json``.
   * - **Import Settings**
     - Loads a settings file saved with **Export Settings** and applies it straight away. A message under
       the buttons says whether it worked.

The meter bar is drawn with level markers **L0** to **L5** along it, so students can see which band
the noise is in.

The sliders and message boxes are for adjusting the monitor during a lesson. Changes are **not
saved automatically**. When the page is reloaded the values written in the directive are used again.
Use **Export Settings** to keep a set you are happy with, or copy the final values into the
directive options.


Saving and sharing settings
---------------------------

**Export Settings** and **Import Settings** let teachers keep several setups, such as a quiet
written task, a practical lesson and a group discussion, and switch between them in seconds. Each
setup is a small file that can be stored on the computer or shared with colleagues who use a
different room or microphone.

1. Adjust the sliders and messages until the monitor suits the lesson.
2. Press **Export Settings**. The browser saves ``noise-monitor-settings.json``. Rename the file to
   say what it is for, for example ``practical-lab.json``.
3. On any noise monitor page, press **Import Settings** and choose the file. The sliders, level
   markers and messages update at once.

The file is plain text in JSON format and can be edited in any text editor:

.. code-block:: json

   {
     "type": "noisemonitor-settings",
     "version": 1,
     "threshold": 55,
     "imageMin": 10,
     "imageMax": 70,
     "messages": [
        "Level 0 - Zoo Zen. Even the meerkats are meditating. Perfect silence!",
        "Level 1 - Sneaky Safari. Whisper like a mouse sneaking past a sleeping lion!",
        "Level 2 - Monkey Business! The monkeys are chattering. Bring the volume down!",
        "Level 3 - Feeding Frenzy! The parrots are squawking and the monkeys are going bananas!",
        "Level 4 - ROAR ALERT! The lions have joined the conversation. Quieten things down!",
        "Level 5 - ZOO-MAGEDDON! The elephants are trumpeting, the monkeys are screaming, and the whole zoo is stampeding! SOUND THE ALARM!"
        ]
   }

When a file is imported:

* Numbers are rounded to whole numbers and kept between 0 and 100.
* If ``imageMax`` is not above ``imageMin``, the range falls back to 0 to 100, as it does for the
  directive option, and a note appears.
* Anything missing from the file is left as it is, so a file with only ``"threshold": 45`` changes
  just the threshold.
* A file that is not valid JSON, or has none of the settings above, is rejected and nothing
  changes.

Importing changes only the page in front of you. It does not edit the source of the documentation,
and the settings are lost when the page is reloaded unless they are imported again.


Setting it up for a room
------------------------

1. Press **Start Mic Monitor** while the class is working silently and note the number. Set
   ``:image-min:`` a little above it so that normal quiet work sits at Level 0.
2. Ask the class for the loudest "acceptable" talking and note that number. This is a good place for
   ``:threshold:``.
3. Ask for a very loud noise, such as everyone speaking at once, and set ``:image-max:`` near that
   number so the top level can be reached.
4. Copy the final values into the directive options so they are used each time the page loads.

Place the computer where the microphone picks up the room evenly. A laptop on the teacher's desk
usually reads quieter than one on a bench in the middle of the class.


Pictures
--------

Six pictures are included with the extension, one for each level, in its ``_static`` folder:

.. code-block:: text

   noise0.png   noise1.png   noise2.png   noise3.png   noise4.png   noise5.png

The picture for the current level is shown at 60% of the width of the monitor, between the button
and the message. To use your own pictures, replace these files with images of the same names before
building. The pictures are shared by every noise monitor in the site.


Requirements and limits
-----------------------

* **A secure page is needed.** Browsers only allow microphone access on pages served over
  ``https://`` or from ``localhost``. Read the Docs and most school intranets using https are fine.
  A page opened as a plain ``http://`` address will show "Unable to access the microphone".
* **The teacher must allow the microphone.** If permission is blocked, reset it in the browser's site
  settings and try again.
* **Audio stays on the device.** The sound is analysed in the browser and is not recorded or sent
  anywhere.
* **Use one monitor per page.** Each monitor asks for the microphone, and the sliders and message
  boxes use fixed ids, so a second monitor on the same page can confuse the labels.
* **HTML output only.** The directive has no output for PDF or text builds, so a page that contains
  it will report an error in those builders.
* **Use the** ``html`` **builder.** The extension copies its pictures, style sheet and script when an
  ``html`` build finishes. Other HTML-based builders, such as ``dirhtml``, are not copied.


Installing the extension
------------------------

1. Copy the ``noisemonitor`` folder (containing ``__init__.py``, ``noisemonitor.py`` and ``_static``
   with the six pictures, ``noisemonitor.css`` and ``noisemonitor.js``) next to your ``conf.py``.
2. Add it to the extensions list:

   .. code-block:: python

      extensions = [
          "noisemonitor",
      ]

3. Build as usual. The files are copied into ``_static`` in the output folder automatically.


Live example
------------

Press **Start Mic Monitor** and allow the microphone to try it.

.. noisemonitor::
   :threshold: 55
   :image-min: 10
   :image-max: 70