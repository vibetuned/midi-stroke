# Jazz licks — credits

The saxophone's **Jazz licks** builder and the **jazz licks** collections of the saxophone
and piano libraries are the 653 interval patterns of the Jazzomat Research Project's
*Pattern History Explorer*: the most common patterns of eminent players in the Weimar Jazz
Database, each of at least six intervals, used by one player in at least three of their solos.

- **Patterns:** The Jazzomat Research Project, Pattern History Explorer,
  <https://jazzomat.hfm-weimar.de/pattern_history/>. Described in K. Frieler, F. Höger,
  M. Pfleiderer and S. Dixon, "Two web applications for exploring melodic patterns in jazz
  solos", Proceedings of the 19th ISMIR Conference, Paris, 2018.
- **Solos:** the Weimar Jazz Database (WJazzD) 2.1, The Jazzomat Research Project,
  University of Music "Franz Liszt" Weimar, 2012–2017, <https://jazzomat.hfm-weimar.de/>.
  Every lick's usual rhythm, chords, players and first recording come from its instances there.

`jazzomat-licks.json` is data derived from the Weimar Jazz Database, which is made available
under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1.0/);
this file is released under the same licence. It is built by `scripts/build-jazz-licks.py`
from the pattern list in `scripts/data/jazzomat-653-patterns.json` and the database.

The licks are written out by this app, in its own notation: a pattern's intervals, over the
chords it is most often played over, in the rhythm it is most often played in. No solo is
reproduced.

## If you made these patterns or this database

Thank you for them. If you would rather they were not used here, or want the credit worded
differently, please email [dev@vibetuned.com](mailto:dev@vibetuned.com) or open an issue at
[github.com/vibetuned/midi-stroke](https://github.com/vibetuned/midi-stroke/issues), and they
will be removed or changed straight away.
