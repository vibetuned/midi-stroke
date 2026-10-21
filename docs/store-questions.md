# Store questions and tags

> The forms App Store Connect and the Google Play Console ask for, answered from what the app does.
> The listings' texts are in [store-listing.md](store-listing.md); building and publishing in
> [mobile.md](mobile.md). The stores reword their forms from time to time: answer a question asked
> differently from the same facts.

## The facts the answers rest on

| | Midi Stroke |
|---|---|
| Accounts, sign-in | None |
| Personal data collected or shared | None — everything stays on the device ([privacy](https://ms.vibetuned.com/privacy/)) |
| Advertising, tracking, analytics | None |
| Purchases, subscriptions | None — free |
| User-generated content shared with others, chat | None |
| Network | Piano samples (`tonejs.github.io`), the theory lessons' videos (YouTube, privacy-enhanced), links opened in the system browser |
| Device features | Bluetooth (to connect a MIDI instrument the user picks); on Android 8–11 the location permission, only because a Bluetooth scan needs it there |
| Microphone, camera, location data, contacts, notifications | Not used |
| Encryption | HTTPS only (exempt) |
| Third-party content | Scores, samples and data under open licences, credited in the app (About & licences) |
| Content | Music education: no violence, language, sexual content, drugs, gambling or horror |

## App Store Connect

### App information

| Field | Answer |
|---|---|
| Name / subtitle | Midi Stroke / Piano, drums & sax trainer |
| Bundle ID | `com.vibetuned.midi-stroke` |
| Primary category / secondary | Education / Music |
| Content rights — *does the app contain, show or access third-party content?* | **Yes** — and *do you have the rights?* **Yes**: open licences (CC BY, ODbL, LGPL, public domain), credited in the app |
| Copyright | © 2026 Vibetuned |
| Privacy policy URL | https://ms.vibetuned.com/privacy/ |
| Support URL / marketing URL | https://ms.vibetuned.com/contact/ / https://ms.vibetuned.com/ |
| Export compliance | No non-exempt encryption (`ITSAppUsesNonExemptEncryption = false` in the app; no question at upload) |

### Age rating

Every question **None** or **No** — expected rating **4+**.

| Group | Questions | Answer |
|---|---|---|
| In-app controls | Parental controls; age assurance | No |
| Capabilities | Unrestricted web access | **No** (links open in the system browser; the lessons' videos are embedded, not browsed) |
| | User-generated content; messaging and chat; advertising | No |
| Mature themes | Profanity or crude humour; horror or fear themes; alcohol, tobacco or drug use or references | None |
| Medical or wellness | Medical or treatment information; health or wellness topics | None / No |
| Sexuality or nudity | Mature or suggestive themes; sexual content or nudity; graphic sexual content and nudity | None |
| Violence | Cartoon or fantasy; realistic; prolonged, graphic or sadistic; guns or other weapons | None |
| Chance-based activities | Simulated gambling; gambling; contests; loot boxes | None / No |
| Made for Kids | — | No (see the audience note in [mobile.md](mobile.md)) |

### App privacy

| Question | Answer |
|---|---|
| Do you or your third-party partners collect data from this app? | **No, we do not collect data from this app** — label: *Data Not Collected* |
| Does the app track users? | No |

### Accessibility (Accessibility Nutrition Labels)

Claim only what is checked on a device. Today: **Dark Interface — yes** (the app is dark throughout).
VoiceOver, Voice Control, Larger Text, Differentiate Without Color Alone, Sufficient Contrast,
Reduced Motion, Captions, Audio Descriptions — not claimed until tested.

### Pricing and availability

Free, no in-app purchases; every country (or Vibetuned's choice).

### App Review information

Sign-in required: **No**. Contact: Vibetuned, dev@vibetuned.com. Notes:

> Midi Stroke is a music trainer for piano, drums and saxophone that listens to a MIDI instrument
> connected by USB or Bluetooth. No account is needed and no data is collected.
>
> Without an instrument: the **Games** are played by touch. In **Piano**, choose a piece and press ▶ —
> the score counts in and scrolls; the 🎧 button → *Play in sound* plays it aloud. At the end of a
> piece the results appear.
>
> Bluetooth: the Bluetooth button next to the MIDI status opens Apple's Bluetooth MIDI view to
> connect an instrument; that is the only use of Bluetooth. The app plays with the silent switch on,
> as a music app, and keeps the screen awake while it is open, because it is played from an
> instrument rather than the screen.
>
> Music notation is engraved by Verovio (LGPL v3, © RISM Digital Center), credited in the
> description and in the app (About & licences).

### Version information

| Field | Text |
|---|---|
| Promotional text (170) | Practise piano, drums and saxophone on your own MIDI instrument: a score that scrolls, a count-in, a visual metronome, and results after every piece. |
| Description | [store-listing.md](store-listing.md) — with the Verovio credit line |
| Keywords (100) | see *Tags and keywords* below |
| What's New | First release on iPhone and iPad: the piano, drums and saxophone trainers, USB and Bluetooth MIDI, results after every piece, and the games. |
| Screenshots | `store/screenshots/ios-iphone-6.9/`, `ios-ipad-13/` (`npm run store:screenshots`) |

## Google Play Console

### Store settings

| Field | Answer |
|---|---|
| App or game | App |
| Category | Education |
| Tags (up to 5, from Play's list) | see *Tags and keywords* below |
| Contact email / website | dev@vibetuned.com / https://ms.vibetuned.com/ |

### Main store listing

App name, short description (80) and full description (4000): [store-listing.md](store-listing.md).
Graphics: icon 512 × 512 (`src-tauri/icons/android/` from the logo, or `src-tauri/icons/icon.png`),
feature graphic and screenshots in `store/screenshots/` (`google-play/`, `android-phone/`,
`android-tablet/`).

### App content

| Declaration | Answer |
|---|---|
| Privacy policy | https://ms.vibetuned.com/privacy/ |
| Ads | **No**, the app contains no ads |
| App access | **All functionality is available without special access** (no login). Note for review: a MIDI instrument is optional — the games are played by touch, and any piece can be played and heard without one |
| Content rating (IARC) | see below |
| Target audience and content | Vibetuned's choice (age groups 13–15, 16–17, 18+ keep the app outside the Families policy; choosing a younger group brings its requirements — see [mobile.md](mobile.md)). Appeals to children: answer honestly — music education can |
| News app | No |
| Government app | No |
| Financial features | None |
| Health app | No |
| Advertising ID | Not used (no ads, no analytics) |
| Data safety | see below |

### Content rating (IARC questionnaire)

| Question | Answer |
|---|---|
| Category | **Reference, News, or Educational** |
| Violence; fear; sexuality; language; controlled substances; crude humour; gambling | No |
| Does the app let users interact or exchange content? | No |
| Does it share the user's physical location with other users? | No |
| Can users buy digital goods? | No |
| Unrestricted internet access (a browser, open web)? | No |
| Expected | Everyone · PEGI 3 · USK 0 · ClassInd L |

### Data safety

| Question | Answer |
|---|---|
| Does the app collect or share any of the required user data types? | **No** |
| Is all user data encrypted in transit? | Yes (HTTPS) — asked only if data were collected |
| Account creation | The app has no accounts |
| Data deletion | Not applicable: nothing is collected; the device's data goes with the app |
| Independent security review | No |

The location permission (Android 8–11) and Bluetooth are used on the device to connect an
instrument; nothing is sent anywhere, so neither counts as *collected*.

### Release notes

> First release on Android phones and tablets: the piano, drums and saxophone trainers, USB and
> Bluetooth MIDI, results after every piece, and the games.

## Tags and keywords

**App Store keywords** (100 characters, comma-separated, no spaces after commas; the name and the
category count already, so they are left out):

```
piano,drums,saxophone,midi,sheet music,score,practice,rhythm,metronome,sight reading,lessons
```

Other words worth rotating in: `keyboard`, `drum kit`, `sax`, `jazz`, `scales`, `music theory`,
`ear training`, `sight-reading`, `bluetooth midi`.

**Google Play tags** — Play offers a fixed list per category; pick the five closest to:

1. Music education / learn music
2. Musical instruments
3. Piano
4. Drums
5. Music theory

**Google Play search** reads the title and the short and full descriptions: the full description
in [store-listing.md](store-listing.md) already says *piano, drums, saxophone, MIDI, score, rhythm,
metronome, practice, scales, jazz licks, theory lessons* in its sentences — keep it that way: Play's
policy forbids keyword lists in a description.
