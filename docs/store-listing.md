# Store listing — App Store and Google Play

> Drafts for the listings of the Android and iOS apps ([mobile.md](mobile.md)). Verovio's licence
> (LGPL-3.0) asks for visible attribution in the stores' metadata: the credit line below goes in
> both full descriptions, and the app carries the full notices (About & licences).

## Names

| | App Store | Google Play |
|---|---|---|
| Name | Midi Stroke (30 max) | Midi Stroke (30 max) |
| Subtitle / short description | Piano, drums & sax trainer (30 max) | Learn piano, drums and saxophone with your MIDI instrument, free. (80 max) |
| Category | Education (secondary: Music) | Education |
| Price | Free, no in-app purchases | Free, no in-app purchases, no ads |

## Full description

> Midi Stroke is a free music trainer for piano, drums and saxophone. Connect your MIDI
> instrument — a keyboard, an electronic drum kit or pads, a wind controller — by USB or
> Bluetooth, and play along with a score that scrolls under a cursor.
>
> • Rhythm mode scores your timing note by note; Practice mode waits for the right notes.
> • A count-in, a visual metronome riding the cursor, and results at the end of every piece:
>   your precision, your timing, where the mistakes were, and your progress session by session.
> • A library of studies, folk tunes and exercises; a scale and arpeggio generator; the 653
>   most common jazz licks of the great improvisers; 1,150 real drummers' grooves; theory
>   lessons; and rhythm games that need no instrument.
> • Bring your own scores (MEI): repeats, D.C. and D.S. are written out so the page reads
>   straight through.
>
> Midi Stroke is made in the open by Vibetuned, a non-profit for music and arts education. It is
> free software (GNU AGPL v3): the source is at github.com/vibetuned/midi-stroke.
>
> **Music notation is engraved by Verovio (verovio.org), © RISM Digital Center, used under the
> GNU LGPL v3.** Grooves from the Groove MIDI Dataset (Magenta, Google; CC BY 4.0); jazz patterns
> from the Weimar Jazz Database (The Jazzomat Research Project; ODbL); piano samples from the
> Salamander Grand Piano (Alexander Holm; CC BY 3.0).

**App Store keywords** (100 characters, comma-separated):
`piano,drums,saxophone,midi,sheet music,score,practice,rhythm,metronome,sight reading,music lessons`

**URLs**: support `https://ms.vibetuned.com/contact/` · marketing `https://ms.vibetuned.com/` ·
privacy policy `https://ms.vibetuned.com/privacy/` (`site/src/content/docs/privacy.md`).

## Privacy answers

What the app does: everything stays on the device — statistics, settings, imported scores
(the webview's storage). No account, no analytics, no advertising, no tracking. It reaches the
network for the piano samples (`tonejs.github.io`), for the theory lessons' videos (YouTube's
privacy-enhanced embeds, `youtube-nocookie.com`, through `ms.vibetuned.com/app/yt.html`), and when
a link is opened. Bluetooth is used only to connect a MIDI instrument the user picks.

- **App Store privacy label**: Data Not Collected.
- **Google Play data safety**: no data collected, no data shared; *Data is encrypted in transit*
  (HTTPS).
- **Permissions**: Bluetooth / nearby devices (Android 12+), the location on Android 8–11 (a
  Bluetooth scan needs it there, `maxSdkVersion 30`), internet.

The privacy policy is the site's [Privacy page](../site/src/content/docs/privacy.md), published at
`https://ms.vibetuned.com/privacy/`.

## Screenshots

`npm run store:screenshots` (`scripts/store-screenshots.mjs`) makes them from the app itself, into
`store/screenshots/` (not kept in git): the instruments, the piano played, the results at the end
of a piece, a drum groove, the saxophone played — played by a stand-in MIDI keyboard, the results
those of the piece played twice.

| Folder | Size | For |
|---|---|---|
| `ios-iphone-6.9/` | 2868 × 1320 | App Store, iPhone 6.9″ (the smaller iPhones are scaled from it) |
| `ios-ipad-13/` | 2752 × 2064 | App Store, iPad 13″ |
| `android-phone/` | 1920 × 1080 | Google Play, phone |
| `android-tablet/` | 2560 × 1440 | Google Play, 7″ and 10″ tablets |
| `google-play/feature-graphic.png` | 1024 × 500 | Google Play's feature graphic |

The app icon comes with the builds (`src-tauri/icons/source/`).

## Content ratings

No violence, no user-generated content shared with others, no purchases, no chat. Expected:
App Store 4+, Google Play *Everyone* (IARC). See [mobile.md](mobile.md) on declaring children as
the target audience.
