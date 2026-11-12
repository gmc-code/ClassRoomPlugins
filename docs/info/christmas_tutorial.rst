=========================================
Make a clickable Christmas scene
=========================================

In this tutorial you will make your own animated pictures (GIFs) in Photoshop and
put them into a Christmas scene on a web page. Each picture stays still until
someone clicks it. Then it comes to life.

Here is a finished scene. Click the star, the tree and the snowman. Then click
Santa and the elf and watch them go!

.. christmas::
   :title: A finished scene
   :background: /tools/christmas/background.png
   :folder: /tools/christmas
   :snow:
   :sound:

   star.gif    | Star           | x=50 y=14 width=9
   tree.gif    | Christmas tree | x=22 y=58 width=20
   snowman.gif | Snowman        | x=72 y=66 width=15
   santa_sleigh.gif | Santa's sleigh | x=40 y=33 width=30 move=right seconds=8
   elf_green.gif    | Elf            | x=47 y=91 width=8 move=right seconds=6

.. admonition:: What you will learn

   * How a GIF makes a moving picture out of still **frames**
   * How to use **layers** and the **Timeline** in Photoshop
   * How to export a GIF with a see-through background
   * How to add your GIF to a web page by changing one line of code

----

What you need
-------------

* A computer with **Adobe Photoshop**
* The **student kit**: :download:`christmas_student_kit.zip <christmas_kit/christmas_student_kit.zip>`

Get the kit ready
~~~~~~~~~~~~~~~~~

#. Download the kit.
#. Find it in your **Downloads** folder. Right-click it and choose **Extract All**.
#. Open the new ``christmas_student_kit`` folder. You should see this:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - File or folder
     - What it is for
   * - ``index.html``
     - Your web page. Double-click it to see your scene.
   * - ``my_scene.js``
     - The list of your GIFs. **This is the only file you change.**
   * - ``gifs``
     - Save the GIFs you make here.
   * - ``images``
     - The background picture.
   * - ``photoshop_frames``
     - Ready-made frames to turn into GIFs.
   * - ``photoshop_parts``
     - The separate pieces of each picture, for making your own frames.
   * - ``engine``
     - The code that makes the scene work. Do not change it.

4. Double-click ``index.html``. It opens in your web browser.
#. Click the snowman. It should wave at you.

.. tip::

   Keep ``index.html`` open in your browser for the whole lesson. Each time you
   change something, press **F5** to refresh the page and see what happened.

----

How does a GIF work?
--------------------

A GIF is a stack of pictures called **frames**. The computer shows them one after
another, very quickly, so the picture looks like it is moving. A flip book works
the same way.

Each frame is shown for a short time called the **delay**.

.. admonition:: GIF maths

   **Length of the GIF = number of frames × delay**

   A GIF with 6 frames and a delay of 0.2 seconds lasts 6 × 0.2 = **1.2 seconds**.

----

Part 1: Make a twinkling star
-----------------------------

The six pictures of the star are already drawn for you. You will turn them into
a GIF.

Step 1: Load the pictures as layers
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

#. Open **Photoshop**.
#. Click **File > Scripts > Load Files into Stack...**
#. Click **Browse**. Go to your ``photoshop_frames`` folder.
#. Click ``star_1.png``. Hold **Shift** and click ``star_6.png`` so all six star
   pictures are selected. Click **Open**, then **OK**.
#. Look at the **Layers** panel. There are six layers, one for each picture.

Step 2: Turn the layers into frames
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

#. Click **Window > Timeline**. The Timeline panel opens at the bottom.
#. In the middle of the Timeline there is a button with a small arrow next to
   it. Click the **arrow** and choose **Create Frame Animation**. Then click the
   **button**.
#. Click the **menu icon** (four small lines) at the top right of the Timeline.
#. Choose **Make Frames From Layers**. You now have six frames.
#. Is frame 1 the biggest star? Then the frames are backwards. Click the menu
   icon again and choose **Reverse Frames**. Frame 1 should be the small, plain
   star.

Step 3: Set the delay
~~~~~~~~~~~~~~~~~~~~~

#. Click the menu icon and choose **Select All Frames**.
#. Under any frame, click the time (it says **0 sec.**).
#. Choose **0.2** seconds.
#. At the bottom left of the Timeline, change **Once** to **Forever**.
#. Press the **Play** button (the triangle) to watch your star. Press it again to stop.

Step 4: Save it as a GIF
~~~~~~~~~~~~~~~~~~~~~~~~

#. Click **File > Export > Save for Web (Legacy)...**
#. At the top right, choose **GIF**.
#. Make sure **Transparency** is ticked. This keeps the background see-through.
#. At the bottom right, check **Looping Options** says **Forever**.
#. Click **Save...**
#. Go to your ``gifs`` folder. Name the file ``star`` and click **Save**.

.. important::

   File names for web pages should use **lowercase letters** with **no spaces**.
   ``star.gif`` is good. ``My Star 2.gif`` will cause problems.

Also click **File > Save As** and save the Photoshop file (``star.psd``) in your
kit folder, so you can change it later.

----

Part 2: Put your star in the scene
----------------------------------

Step 1: Add a line of code
~~~~~~~~~~~~~~~~~~~~~~~~~~

#. In your kit folder, right-click ``my_scene.js`` and choose
   **Open with > Notepad**.
#. Find the list called ``myGifs``. It has one line, for the snowman:

   .. code-block:: javascript

      const myGifs = [
        { file: "example_snowman.gif", name: "Snowman", x: 72, y: 66, width: 15, seconds: 1.2 },
      ];

#. Add a new line for your star under the snowman line:

   .. code-block:: javascript

      const myGifs = [
        { file: "example_snowman.gif", name: "Snowman", x: 72, y: 66, width: 15, seconds: 1.2 },
        { file: "star.gif", name: "Star", x: 50, y: 15, width: 10, seconds: 1.2 },
      ];

#. Press **Ctrl + S** to save.
#. Go to your browser and press **F5**. Click your star!

What do the numbers mean?
~~~~~~~~~~~~~~~~~~~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Setting
     - Meaning
   * - ``file``
     - The file name of your GIF. It must be spelt exactly the same.
   * - ``name``
     - What your picture is called.
   * - ``x``
     - How far **across** it is. 0 is the left edge and 100 is the right edge.
   * - ``y``
     - How far **down** it is. 0 is the top and 100 is the bottom.
   * - ``width``
     - How big it is. 10 means one tenth of the width of the background.
   * - ``seconds``
     - How long it plays after a click. Use the GIF maths: frames × delay.

.. admonition:: Try it

   Change ``x`` to 20, save, and refresh. Which way did the star move?
   Change ``width`` to 25. What happened?

Step 2: Move pictures the easy way
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

#. In your browser, click the **Arrange** button above the scene.
#. **Drag** your star to where you want it.
#. Click the star, then move the **Size** slider to make it bigger or smaller.
#. Under the scene is a box of code. Click **Copy**.
#. Go back to Notepad. Select the lines **between** ``const myGifs = [`` and ``];``
   and paste over them (**Ctrl + V**).
#. Save (**Ctrl + S**) and refresh (**F5**).

----

Part 3: Make the tree lights blink
----------------------------------

This time you will draw the frames yourself, using layers.

Step 1: Paint two sets of lights
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

#. In Photoshop, click **File > Open** and open ``tree_plain.png`` from the
   ``photoshop_frames`` folder.
#. Click **Layer > New > Layer...** Name it ``lights 1`` and click **OK**.
#. Choose the **Brush** tool (press **B**). Pick a bright colour and a round
   brush about 14 pixels wide.
#. Click on the tree to paint 6 or 7 lights.
#. Make another new layer. Name it ``lights 2``.
#. Pick a different colour. Paint 6 or 7 lights in **different** places.

Step 2: Make the frames
~~~~~~~~~~~~~~~~~~~~~~~

#. Open the Timeline (**Window > Timeline**) and click **Create Frame
   Animation**, the same way as in Part 1.
#. You have one frame. In the Layers panel, click the **eye** next to
   ``lights 2`` to hide it. Frame 1 now shows only the first set of lights.
#. At the bottom of the Timeline, click **Duplicate selected frames** (the
   square with a plus sign). This makes frame 2.
#. With frame 2 selected, hide ``lights 1`` and show ``lights 2``.
#. Select all the frames and set the delay to **0.5** seconds. Set looping to
   **Forever**.
#. Press **Play** to check it.

Step 3: Save it and add it
~~~~~~~~~~~~~~~~~~~~~~~~~~

#. Use **File > Export > Save for Web (Legacy)...** and save it in your ``gifs``
   folder as ``tree``.
#. Add a line for it in ``my_scene.js``:

   .. code-block:: javascript

      { file: "tree.gif", name: "Christmas tree", x: 22, y: 58, width: 20, seconds: 2 },

#. Save, refresh, and use **Arrange** to put the tree where you want it.

.. admonition:: Think about it

   Your tree has 2 frames with a delay of 0.5 seconds, so one blink lasts
   2 × 0.5 = 1 second. Why does the line say ``seconds: 2``? What would you see
   if you changed it to 4?

----

Part 4: Make the rest of the set
--------------------------------

The kit has everything you need to make six more GIFs: a **bell**, a **bauble**,
a **present**, a **candle**, a **snowman** and a **gingerbread** biscuit.

There are two ways to make each one. Start with the easy way.

The easy way: ready-made frames
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Each picture has its own folder of frames inside ``photoshop_frames``. Make each
GIF the same way you made the star in Part 1:

#. **File > Scripts > Load Files into Stack...** and choose **all** the pictures
   in one folder, for example ``photoshop_frames/bell``.
#. Open the Timeline, click **Create Frame Animation**, then choose
   **Make Frames From Layers** from the Timeline menu.
#. Frame 1 should be the picture ending in ``_01``. If it is not, choose
   **Reverse Frames**.
#. Select all the frames and set the delay from the table below. Set looping to
   **Forever**.
#. Export it into your ``gifs`` folder with the file name from the table.

.. list-table::
   :header-rows: 1
   :widths: 22 14 14 25 25

   * - Folder
     - Frames
     - Delay
     - Save as
     - What it does
   * - ``bell``
     - 8
     - 0.1
     - ``bell.gif``
     - Rings from side to side
   * - ``bauble``
     - 10
     - 0.1
     - ``bauble.gif``
     - Swings on its string
   * - ``present``
     - 12
     - 0.2
     - ``present.gif``
     - Opens and a star pops out
   * - ``candle``
     - 6
     - 0.2
     - ``candle.gif``
     - The flame flickers
   * - ``snowman``
     - 8
     - 0.2
     - ``snowman.gif``
     - Waves
   * - ``gingerbread``
     - 8
     - 0.1
     - ``gingerbread.gif``
     - Jumps

Then add a line for each GIF to ``myGifs`` in ``my_scene.js``. Use the GIF maths
(frames × delay) to work out the number that goes in place of each ``?``.

.. code-block:: javascript

   { file: "bell.gif", name: "Bell", x: 10, y: 20, width: 8, seconds: ? },
   { file: "bauble.gif", name: "Bauble", x: 30, y: 6, width: 7, seconds: ? },
   { file: "present.gif", name: "Present", x: 37, y: 82, width: 10, seconds: ? },
   { file: "candle.gif", name: "Candle", x: 56, y: 84, width: 8, seconds: ? },
   { file: "snowman.gif", name: "Snowman", x: 72, y: 66, width: 15, seconds: ? },
   { file: "gingerbread.gif", name: "Gingerbread", x: 89, y: 80, width: 10, seconds: ? },

When your own ``snowman.gif`` is working, delete the ``example_snowman.gif``
line so you do not have two snowmen.

.. admonition:: Check your GIF maths
   :class: dropdown

   bell 0.8, bauble 1, present 2.4, candle 1.2, snowman 1.6, gingerbread 0.8

The harder way: build the frames yourself
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The ``photoshop_parts`` folder has each picture in separate pieces, so you can
decide how it moves. Load all the pieces in one folder with **Load Files into
Stack**. Each piece becomes its own layer. If a piece is hidden behind another
one, drag its layer up or down in the Layers panel.

.. list-table::
   :header-rows: 1
   :widths: 20 30 50

   * - Folder
     - Pieces
     - How to make it move
   * - ``bell``
     - bell, clapper
     - Turn the bell a little to the left, then to the right. Turn the clapper
       further than the bell.
   * - ``bauble``
     - bauble
     - Turn it left and right around the top of its string.
   * - ``present``
     - lid, box, star
     - Move the lid up a little each frame. Move the star up from behind the box.
   * - ``candle``
     - candle, flame
     - Stretch, squash and lean the flame. Leave the candle alone.
   * - ``snowman``
     - snowman, waving arm
     - Turn the arm up and down around the shoulder end.
   * - ``gingerbread``
     - gingerbread, shadow
     - Move the gingerbread up, then back down. Hide the shadow while it is in
       the air.

**Pieces that only move or hide** (present, gingerbread). Use the method from
Part 3: make a frame, click **Duplicate selected frames**, then move the piece
with the **Move** tool (press **V**) or click its eye. Each frame remembers
where the pieces were.

**Pieces that turn or change shape** (bell, bauble, candle, snowman). Turning a
layer changes it in every frame, so each pose needs to be saved as its own layer:

#. Click the layer of the piece. Press **Ctrl + T** (Free Transform).
#. To turn it around one end, drag the small **centre point** to that end first
   (the top of the bell, the shoulder of the arm). If you cannot see the centre
   point, tick the **reference point** box at the left of the options bar.
#. Turn the piece by dragging just outside a corner. Press **Enter**.
#. Press **Ctrl + Alt + Shift + E**. This makes a new layer that is a copy of
   everything you can see. Rename it ``frame 1``, then click its eye to hide it.
#. Change the pose and repeat for ``frame 2``, ``frame 3`` and so on. Hide each
   frame layer after you make it.
#. When you have all your frames, **delete the layers of the pieces** and show
   all the frame layers.
#. Open the Timeline and use **Make Frames From Layers**. Set the delay and
   looping, then export.

.. tip::

   Save your Photoshop file before you delete the layers of the pieces, then use
   **File > Save As** with a new name. Then you can go back and make more poses.

----

Part 5: Make pictures that travel
---------------------------------

Some pictures do more than move on the spot. They can **travel** right across
your scene: Santa's sleigh flies across the sky and an elf runs across the snow.

The GIF only has to show the movement **on the spot** (legs running, reindeer
galloping). One extra word in your code makes it travel.

Step 1: Make the GIFs
~~~~~~~~~~~~~~~~~~~~~

These folders are in ``photoshop_frames``. Make each GIF from its frames, the
same way as in Part 4.

.. list-table::
   :header-rows: 1
   :widths: 24 12 12 28 24

   * - Folder
     - Frames
     - Delay
     - Save as
     - Travels
   * - ``santa_sleigh``
     - 8
     - 0.1
     - ``santa_sleigh.gif``
     - right
   * - ``elf_green``
     - 8
     - 0.1
     - ``elf_green.gif``
     - right
   * - ``elf_red``
     - 8
     - 0.1
     - ``elf_red.gif``
     - right
   * - ``penguin``
     - 6
     - 0.1
     - ``penguin.gif``
     - left
   * - ``snowball``
     - 8
     - 0.1
     - ``snowball.gif``
     - right
   * - ``shooting_star``
     - 4
     - 0.1
     - ``shooting_star.gif``
     - left

Step 2: Add ``move`` to the line
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Add these lines to ``myGifs`` in ``my_scene.js``. Look for the new setting,
``move``, at the end of each line.

.. code-block:: javascript

   { file: "santa_sleigh.gif", name: "Santa's sleigh", x: 40, y: 33, width: 30, seconds: 8, move: "right" },
   { file: "shooting_star.gif", name: "Shooting star", x: 72, y: 8, width: 13, seconds: 3, move: "left" },
   { file: "elf_green.gif", name: "Green elf", x: 47, y: 91, width: 8, seconds: 6, move: "right" },
   { file: "elf_red.gif", name: "Red elf", x: 40, y: 93, width: 8, seconds: 6.5, move: "right" },
   { file: "penguin.gif", name: "Penguin", x: 78, y: 95, width: 9, seconds: 6, move: "left" },
   { file: "snowball.gif", name: "Snowball", x: 8, y: 92, width: 5, seconds: 7, move: "right" },

Save, refresh and click Santa. He flies off the right side, comes back in on the
left and stops where he started.

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Setting
     - Meaning
   * - ``move``
     - ``"right"`` or ``"left"``: the way the picture travels.
   * - ``seconds``
     - For a picture that travels, this is how long the **whole trip** takes.

.. admonition:: Try it

   * Change Santa's ``seconds`` from 8 to 3. Is he faster or slower? Why?
   * The two elves have different ``seconds``. What happens when you click
     **Play all**? Which elf wins the race?
   * Change the penguin to ``move: "right"``. What looks wrong? This is why a
     picture should **face the way it travels**.

.. tip::

   When you design your own travelling picture, draw it facing the way it will
   go, and make the frames show it moving on the spot. Let ``move`` do the rest.

----

Part 6: Design your own GIF
---------------------------

Now make a Christmas picture that is all your own.

#. Click **File > New**. Make it **300** pixels wide and **300** pixels high.
   Set **Background Contents** to **Transparent**. Click **Create**.
#. Draw your picture on the first layer. This is your **resting** picture, the
   one people see before they click.
#. Right-click the layer and choose **Duplicate Layer**. Change the copy a
   little bit.
#. Keep duplicating and changing until you have 4 to 8 layers.
#. Open the Timeline and use **Make Frames From Layers**.
#. Set the delay and looping, then play it.
#. Export it as a GIF into your ``gifs`` folder.
#. Add a line for it in ``my_scene.js``. Work out ``seconds`` with the GIF maths.

.. list-table:: Ideas
   :header-rows: 1
   :widths: 30 70

   * - Picture
     - How it could move
   * - Candle
     - The flame leans left, then right
   * - Present
     - The lid lifts and something pops out
   * - Bell
     - It swings from side to side
   * - Bauble
     - It swings on its string
   * - Shooting star
     - It moves across in small steps
   * - Stocking
     - It fills up with presents

.. tip::

   * Small changes between frames make smooth movement. Big changes look jumpy.
   * To move something, use the **Move** tool (press **V**) on the copied layer.
   * To turn something, use **Edit > Free Transform** (**Ctrl + T**).
   * Design your own characters. Do not copy characters from films, shows or games.

----

Fix-it guide
------------

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - What you see
     - How to fix it
   * - A yellow box says **I cannot read my_scene.js**
     - There is a typing mistake. Check that each line ends with a comma, each
       ``{`` has a ``}``, and every name has speech marks at both ends.
   * - A red dashed box says **Cannot find ...**
     - The file name in your line does not match your GIF. Check the spelling
       and that the GIF is in the ``gifs`` folder.
   * - Nothing changed
     - Did you save ``my_scene.js``? Did you press **F5**?
   * - There is a white square around the picture
     - Tick **Transparency** when you export. If the bottom layer is a white
       layer called *Background*, hide it or delete it.
   * - It does not move when clicked
     - The GIF has only one frame. Check the Timeline has more than one frame,
       then export again.
   * - It stops too soon
     - Make ``seconds`` bigger.
   * - It travels backwards
     - Change ``move`` to the other direction, or flip the picture in Photoshop
       (**Image > Image Rotation > Flip Canvas Horizontal**) and export again.
   * - It moves too fast or too slowly
     - Change the delay under the frames in Photoshop, then export again.

----

Checklist
---------

.. list-table::
   :header-rows: 1
   :widths: 85 15

   * - I can ...
     - Done
   * - explain what frames and delay are
     -
   * - make frames from layers in the Timeline
     -
   * - export a GIF with a see-through background
     -
   * - add a line to ``myGifs`` for each of my GIFs
     -
   * - place and resize my pictures with Arrange
     -
   * - work out the length of a GIF from its frames and delay
     -
   * - make at least three more GIFs from the kit
     -
   * - make a picture travel across the scene with ``move``
     -
   * - show a scene with a star, a tree and at least one GIF I designed myself
     -

----

Extra challenges
----------------

#. **New title.** Change ``sceneTitle`` in ``my_scene.js`` to your own title.
#. **New message.** Change ``finishMessage``, the words shown when every picture
   has been clicked.
#. **Play modes.** Change ``playMode`` from ``"once"`` to ``"toggle"``. What is
   different? Try ``"hover"`` too.
#. **Your own background.** Make a picture 1600 pixels wide and 900 pixels high
   in Photoshop. Save it as a PNG in the ``images`` folder and change
   ``sceneBackground`` to its name.
#. **An Australian Christmas.** Christmas here is in summer! Design a beach
   background and GIFs to match.
#. **Five or more.** Make a scene with at least five of your own GIFs that tells
   a story.

Handing in your work
--------------------

Right-click your ``christmas_student_kit`` folder and choose
**Send to > Compressed (zipped) folder**. Hand in the zip file. It holds your web
page, your GIFs and your code together.
