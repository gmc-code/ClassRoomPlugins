========================
Christmas scene
========================

Click a picture to bring it to life. See :doc:`/info/christmas_info` for how to use it, and
:doc:`/info/christmas_tutorial` for the Year 7 tutorial on making the GIFs in Photoshop.

.. christmas::
   :title: Christmas scene
   :background: christmas/background.png
   :folder: christmas
   :snow:
   :sound:

   star.gif        | Star              | x=50 y=14 width=9
   bauble.gif      | Bauble            | x=30 y=6.2 width=7
   bell.gif        | Bell              | x=10 y=20 width=8
   tree.gif        | Christmas tree    | x=22 y=58 width=20
   snowman.gif     | Snowman           | x=72 y=66 width=15
   present.gif     | Present           | x=37 y=82 width=10
   candle.gif      | Candle            | x=56 y=84 width=8
   gingerbread.gif | Gingerbread       | x=89 y=80 width=10
   santa_sleigh.gif  | Santa's sleigh  | x=40 y=33 width=30 move=right seconds=8
   shooting_star.gif | Shooting star   | x=72 y=8 width=13 move=left seconds=3
   elf_green.gif     | Green elf       | x=47 y=91 width=8 move=right seconds=6
   elf_red.gif       | Red elf         | x=40 y=93 width=8 move=right seconds=6.5
   penguin.gif       | Penguin         | x=78 y=95 width=9 move=left seconds=6
   snowball.gif      | Snowball        | x=8 y=92 width=5 move=right seconds=7

The sleigh, the shooting star, the elves, the penguin and the snowball have ``move=`` on
their lines, so they travel across the scene when they are clicked.

----

As a grid
---------------

Leave out ``:background:`` and the pictures are set out as cards. This one uses
``:play: toggle``, so a click starts a picture and another click stops it.

.. christmas::
   :title: Christmas cards
   :folder: christmas
   :columns: 4
   :play: toggle

   star.gif
   bell.gif
   bauble.gif
   present.gif
   candle.gif
   snowman.gif
   tree.gif | Christmas tree
   gingerbread.gif
   santa_sleigh.gif | Santa's sleigh
   elf_green.gif | Green elf
   elf_red.gif | Red elf
   penguin.gif
   snowball.gif
   shooting_star.gif | Shooting star
