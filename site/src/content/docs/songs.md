---
title: Songs & importing
description: The bundled collections, offline caching, loading your own MEI files, importing ZIP bundles as permanent collections, and the score server.
---

Every instrument ships with bundled collections (Czerny, Beyer, Hanon,
machine drum patterns, public-domain melodies…), and you can bring your own
scores in three ways — from a single file to a whole library.

## The song picker

Collections sit in the left rail; pieces on the right. Each piece row shows
your best recorded precision, and a 📥 chip to save it for **offline use**
(💾 = cached; click again to evict).

## Load a single MEI file

**📁 Local MEI File** in the picker's footer opens one score straight from
disk. It plays like any bundled piece for the session, but isn't stored —
use a ZIP import for that.

## Import a ZIP of scores

**📦 Import ZIP** takes a ZIP containing MEI files and installs it as a new
collection named after the ZIP file — `My Songs.zip` becomes the collection
**My_Songs** under the current instrument. What you should know:

- **It's permanent and on-device.** The files are unpacked into your
  browser's private storage (OPFS), so the collection survives reloads and
  works offline. It belongs to this browser on this device — it isn't synced
  anywhere.
- **Anything reasonable works**: nested folders inside the ZIP are
  flattened, non-MEI files and macOS metadata are ignored.
- Imported collections show a 📦 marker in the rail and a 🗑 chip to delete
  them from the device.
- Importing a same-named ZIP again merges into the existing collection
  (same-named files are replaced) — handy for updating a set.
- Stats accumulate per piece exactly like bundled songs.

## Your MEI files need no special preparation

Earlier versions required every score to start with a special "measure zero"
(a one-beat rest used to place the clef, key and time signature and give a
count-in). **That's no longer needed**: if the first measure of an imported
score contains actual notes, the app injects the count-in measure
automatically at load time, for single files and ZIP imports alike. Scores
that already have a notes-free first measure load unchanged.

Beyond that, any MEI that Verovio can render works — including scores
exported from MusicXML converters. Ties, pickup measures, meter changes and
irregular bars are all handled by the synchronization engine.

## The score server (LAN)

For practicing from a shared library — say, a tablet at the piano and the
library on your desktop — the picker can connect to a small score server
(see `server/` in the repository). Once connected, the catalog and files
come from the server, and the footer gains an upload form to push MEI files
into server-side categories. Imported (📦) collections stay available while
connected; they're always local.

## Offline

Midi Stroke is a PWA: the app shell, engraving engine and any pieces you've
cached (📥) or imported (📦) keep working with no network at all.
