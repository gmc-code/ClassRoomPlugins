=========================
Introduction
=========================

| The following documentation provides an overview of the available classroom tools and their usage.


.. list-table:: Classroom tools
   :header-rows: 1
   :widths: 25 25 25 25

   * - Tool
     - Working example
     - User guide
     - Developer reference
   * - Seating plan
     - :doc:`Seating plan </tools/seatingplan>`
     - :doc:`User guide </info/seatingplan_info>`
     - :doc:`Developer reference </info/seatingplan_dev>`
   * - Class seating plans (12 plans)
     - :doc:`Class seating plans </tools/seatingplans>`
     - :doc:`User guide </info/seatingplans_info>`
     - :doc:`Developer reference </info/seatingplans_dev>`
   * - Student groups
     - :doc:`Student groups </tools/studentgroups>`
     - :doc:`User guide </info/studentgroups_info>`
     - :doc:`Developer reference </info/studentgroups_dev>`
   * - Name picker
     - :doc:`Name picker </tools/namepicker>`
     - :doc:`User guide </info/namepicker_info>`
     - :doc:`Developer reference </info/namepicker_dev>`
   * - Noise monitor
     - :doc:`Noise monitor </tools/noisemonitor>`
     - :doc:`User guide </info/noisemonitor_info>`
     - :doc:`Developer reference </info/noisemonitor_dev>`

----

About these classroom tools
===========================

The seating plan, student groups planner, name picker and noise monitor are **Sphinx
directives**: small extensions to `Sphinx <https://www.sphinx-doc.org>`_, the
tool that builds this website from plain-text pages. A website author adds one
line, such as ``.. seatingplan::``, to a page, and Sphinx turns it into a working
tool on the published site.

Where they can be used
----------------------

* **Any Sphinx website.** That includes sites hosted on Read the Docs, GitHub
  Pages, a school intranet, or a folder of HTML files opened on one computer.
  Each tool is a single folder added to the site's ``conf.py``.
* **Pages written in reStructuredText.** In reStructuredText use
  ``.. studentgroups::``.
* **Any page, as often as needed.** A page can hold several tools, for
  example twelve seating plans, or a group planner next to a noise monitor.
* **Web pages only.** They run in the browser, so they appear in the HTML
  version of the site.

Using them needs nothing but a modern browser (Chrome, Edge, Firefox or
Safari). There is no account or sign-in. Everything a teacher enters stays in
their own browser and is never sent to the website. The noise monitor also
needs microphone permission and a secure (``https://``) page.

Each tool has two pages:

* a **user guide** for teachers, on how to use the tool and get the most out
  of it;
* a **developer reference** for website authors, covering installation,
  directive options, file formats and styling.

