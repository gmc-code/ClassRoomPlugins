=================================
Christmas scene: developer notes
=================================

The ``christmas`` directive shows animated GIFs that stay on their first frame
until they are clicked. For how to use it in class see :doc:`/info/christmas_info`.

----

Installing
----------

#. Copy the ``christmas`` folder into ``docs/_ext``. It holds ``__init__.py``,
   ``christmas.py`` and ``_static/christmas.css`` and ``_static/christmas.js``.
#. Add it to ``extensions`` in ``conf.py``:

   .. code-block:: python

      extensions = [
          "christmas.christmas",
      ]

No extra Python packages are needed. GIF sizes and lengths are read by a small
parser in ``christmas.py``.


Directive
---------

.. code-block:: rst

   .. christmas::
      :title: Our Christmas scene
      :background: christmas/background.png
      :folder: christmas
      :play: once
      :snow:
      :sound:

      star.gif    | Star    | x=50 y=14 width=9
      present.gif | Present | x=37 y=82 width=10 seconds=3
      box.gif     | Mystery | x=60 y=80 width=10 still=box_wrapped.png


Options
-------

.. list-table::
   :header-rows: 1
   :widths: 24 16 60

   * - Option
     - Default
     - Meaning
   * - ``:title:``
     - Christmas
     - Heading shown above the scene.
   * - ``:background:``
     - none
     - Background picture. With it the pictures are placed by position (a scene);
       without it they are set out as a grid.
   * - ``:folder:``
     - none
     - Folder that holds the pictures, so each line only needs a file name. It is
       relative to the page, or to the top of ``docs`` if it starts with ``/``.
   * - ``:play:``
     - once
     - ``once``, ``toggle`` or ``hover``.
   * - ``:columns:``
     - 4
     - Cards in each row of a grid (1 to 8).
   * - ``:message:``
     - You found them all. Merry Christmas!
     - Shown when every picture has been clicked.
   * - ``:snow:``
     - off
     - Start with snow falling.
   * - ``:sound:``
     - off
     - Start with the bell chime on.
   * - ``:hide-names:``
     - off
     - Do not show the picture names.
   * - ``:class:``
     - none
     - Extra CSS classes for the outer ``div``.


Content lines
-------------

Each line is ``file | name | settings``. Blank lines and lines starting with
``#`` are skipped. The name defaults to the file name. Settings are separated by
spaces:

.. list-table::
   :header-rows: 1
   :widths: 24 76

   * - Setting
     - Meaning
   * - ``x=`` ``y=``
     - Centre of the picture, as a percentage across and down the background
       (0 to 100). Left out, the pictures are spread in a row at ``y=80``.
   * - ``width=``
     - Width as a percentage of the background's width.
   * - ``seconds=``
     - How long the picture plays in ``once`` mode. The default is the length of
       one run of the GIF, read from the file.
   * - ``still=``
     - A picture to show while the GIF is not playing, in place of its first frame.
   * - ``move=``
     - ``right`` or ``left``. When clicked, the picture travels off that side of
       the scene, re-enters on the other side and returns to its place.
       ``seconds`` is then the time for the trip (default 6). Scenes only.


How it works
------------

* **At build time** each picture is found (in ``:folder:``, then next to the
  page), copied to ``_static/christmas-media`` under a name that starts with a
  checksum of the file, and described in a JSON block on a
  ``<div class="christmas" data-christmas="...">``. A changed GIF therefore gets
  a new address and is never served from an old cached copy.
* **The still frame** is the first frame of the GIF drawn onto a ``<canvas>``,
  because a browser cannot pause a GIF.
* **Playing** shows an ``<img>`` of the GIF on top of the canvas. A GIF only
  restarts from its first frame when the browser sees a new address, so each
  play uses a fresh object URL made from a copy fetched once (on a website), or
  a ``?play=`` query (when opened from a folder as ``file://``).
* **Travelling** (``move=``) animates the picture's ``left`` with the Web
  Animations API: out to the edge, a jump to the opposite edge, and back to its
  ``x``. It runs once in ``once`` mode and repeats in ``toggle`` and ``hover``.
* **The student kit** loads the same ``christmas.js`` and ``christmas.css``. In
  place of the JSON block it reads the ``myGifs`` list and the other settings
  from ``my_scene.js`` and draws into ``<div data-christmas-kit>``. If
  ``my_scene.js`` has a mistake that stops it loading, the page says so in plain
  words.

Build warnings are given for a file that cannot be found, a GIF with only one
frame, a file that is not a GIF, and a setting that is not understood.


Updating the student kit
------------------------

The kit zip (``info/christmas_kit/christmas_student_kit.zip``) holds its own copy
of ``christmas.js`` and ``christmas.css`` in its ``engine`` folder. After changing
either file in ``_ext/christmas/_static``, copy them into the kit and zip it again.

The kit also holds the Photoshop resources: ``photoshop_frames`` (the star frames,
a plain tree, and a folder of numbered frames for each of the other GIFs,
including the six that travel) and ``photoshop_parts`` (the bell, bauble, present,
candle, snowman and gingerbread as separate pieces).
