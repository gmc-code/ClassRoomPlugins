============================
Christmas scene user guide
============================

The Christmas scene is a picture full of surprises. Each item in it is an animated
GIF that sits still until a student clicks it, then it plays: the star twinkles,
the bell rings, the present opens. A counter shows how many have been clicked, and
there is a message (and snow) when every one has been found.

It is made for an end-of-year activity in which students build the GIFs themselves
in Photoshop. The step-by-step student tutorial and the starter files are in
:doc:`/info/christmas_tutorial`. A working example is in :doc:`/tools/christmas`.
Technical details are in :doc:`/info/christmas_dev`.

----

Getting started
---------------

#. Put a background picture and your GIFs in a folder next to the page.
#. Add the directive, with one line for each GIF:

   .. code-block:: rst

      .. christmas::
         :title: Our Christmas scene
         :background: christmas/background.png
         :folder: christmas
         :snow:

         star.gif    | Star
         tree.gif    | Christmas tree
         present.gif | Present

#. Build the site and open the page. The pictures sit in a row near the bottom.
#. Press **Arrange**, drag each picture to where it belongs, set its size, then
   press **Copy** and paste the lines back over the picture lines in the directive.


Using the scene
---------------

.. list-table::
   :header-rows: 1
   :widths: 26 74

   * - Control
     - What it does
   * - Click a picture
     - Plays its GIF. What a second click does depends on the play mode (see
       `Play modes`_).
   * - **Play all**
     - Plays every picture, one after another.
   * - **Stop all**
     - Returns every picture to its still frame.
   * - **Snow**
     - Turns the falling snow on or off.
   * - **Sound**
     - Turns the bell chime on or off. Each picture has its own note.
   * - **Arrange**
     - Lets you drag pictures to new places and resize them (scenes only). See
       `Arranging the pictures`_.
   * - **Full screen**
     - Fills the screen, for a projector.

The pictures can also be reached with the Tab key and played with Enter or the
space bar.


Scene or grid
-------------

With ``:background:`` the pictures are placed over the background picture. Each
one has a position (``x`` across and ``y`` down, as percentages of the background)
and a ``width`` (a percentage of the background's width), so the scene keeps its
layout at any size, including full screen.

Without ``:background:`` the pictures are set out as a grid of cards with their
names underneath. ``:columns:`` sets how many are in a row.


Play modes
----------

.. list-table::
   :header-rows: 1
   :widths: 26 74

   * - ``:play:``
     - What a click does
   * - ``once`` (default)
     - Plays the GIF once through from its first frame, then returns to the still
       picture. Clicking while it is playing starts it again.
   * - ``toggle``
     - Starts the GIF. It keeps going until it is clicked again.
   * - ``hover``
     - Plays while the mouse is over the picture. On a touch screen a tap starts
       and stops it.

The length of each GIF is read from the file when the site is built, so ``once``
plays exactly one run. Add ``seconds=`` to a line to make a picture play for
longer or shorter, for example ``seconds=3`` to let a 1 second GIF repeat three
times.


Pictures that travel
--------------------

Add ``move=right`` or ``move=left`` to a line and the picture travels when it is
clicked. It goes off that side of the scene, comes back in on the other side and
returns to its place, with its GIF playing the whole way.

.. code-block:: rst

   santa_sleigh.gif | Santa's sleigh | x=40 y=33 width=30 move=right seconds=8
   penguin.gif      | Penguin        | x=78 y=95 width=9 move=left seconds=6

* ``seconds`` is how long the whole trip takes (6 if it is left out). A bigger
  number makes a slower trip.
* Draw the picture facing the way it travels. The sleigh and the elves face
  right; the penguin and the shooting star face left.
* In ``toggle`` mode the picture keeps doing laps until it is clicked again.
* Travelling only happens in a scene. In a grid the GIF plays on the spot.

The example scene has six of these: Santa's sleigh with two reindeer, two running
elves, a sliding penguin, a rolling snowball and a shooting star.


Arranging the pictures
----------------------

#. Press **Arrange**. Each picture gets a dashed outline and its name.
#. Drag a picture to move it. Click it and use the **Size** slider to resize it.
   The arrow keys move the chosen picture a little at a time.
#. The box under the scene lists every picture with its new position. Press
   **Copy** and paste the lines over the picture lines in the directive.
#. Press **Arrange** again to finish.

Positions are not saved by the page itself. They only last once they are pasted
into the directive (or, in the student kit, into ``my_scene.js``).


Making GIFs that work well
--------------------------

* **See-through background.** Export with *Transparency* ticked so the scene
  shows around the picture.
* **Square and small.** 300 × 300 pixels is plenty. Most GIFs in the example are
  under 70 KB.
* **A good first frame.** The first frame is what shows before the click, so it
  should be the "resting" picture: the closed present, the bell hanging straight.
* **Short.** One or two seconds, 4 to 12 frames.
* **Looping set to Forever** suits every play mode. A GIF exported with *Once*
  still works, but stops on its last frame in ``toggle`` and ``hover`` modes.

To show a different picture before the click (a wrapped box that turns into
something else, for example), add ``still=wrapped.png`` to the line.


Running it as a class activity
------------------------------

The :doc:`student tutorial </info/christmas_tutorial>` uses a kit that runs
without this website: students unzip a folder, make GIFs in Photoshop, add a line
for each one to ``my_scene.js`` and double-click ``index.html``. The kit uses the
same code as this directive, so a finished student scene can be added to a page
here by copying their GIFs across and listing them in a directive.

A whole-class scene works well too: each student makes one GIF, and the teacher
lists them all in one directive, in a grid or over a shared background.


Troubleshooting
---------------

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Problem
     - Fix
   * - A red dashed box says "Cannot find ..."
     - The file name on the line does not match the file. Check the spelling,
       capital letters and the ``.gif`` ending, and that ``:folder:`` is right.
   * - A picture does not move when clicked
     - It has only one frame. Re-export it from the Timeline as a GIF; the build
       gives a warning that names the file.
   * - A picture has a white box around it
     - It was exported without *Transparency*, or its bottom layer is a white
       background layer.
   * - A picture stops too soon or too late
     - Add ``seconds=`` to its line.
   * - No snow
     - Add ``:snow:`` or press **Snow**. Snow does not start by itself on devices
       set to reduce motion.
