# Game sounds — credits

Short cuts from larger sample libraries, made by `scripts/build-game-sounds.py`
(`npm run build:game-sounds`). The source libraries are not in this repository.

| Game | Files | Source |
|---|---|---|
| Slingshot | `slingshot/sonar-59.mp3`, `slingshot/takeoff-61.mp3` | *Nasa Space Pad* by Tim Steemson (Pianobook): "Cold sun sonar", from the camera on NASA InSight's robotic arm scanning Mars (sol 98); "Takeoff guitar", from the take-off of NASA's SOFIA observatory aircraft. |
| Conductor | `conductor/voice-*.mp3` | *The Spellsinger* (Decent Sampler / Kontakt library): six of its sustained notes. |
| Rhythm echo | `echo/star-56.mp3`, `echo/earth-*.mp3` | *Space Voices* (Pianobook, Decent Sampler): "Hum and Whistle", high G♯ for the star, low C and G for Earth. |
| Groove Builder | `groove/*.mp3` | NASA/JPL-Caltech. The Perseverance rover: SuperCam's microphone recording its laser zapping a rock (sol 12; SuperCam: NASA/JPL-Caltech/LANL/CNES/CNRS/ISAE-SUPAERO); its wheels driving (sol 16); the MOXIE oxygen experiment running (NASA/JPL-Caltech/MIT). The InSight lander: a meteoroid striking Mars. |

## Before a public release

The NASA and JPL recordings are generally free to reuse with credit. The
*Nasa Space Pad*, *Space Voices* and *The Spellsinger* samples belong to their
makers. Free libraries of this kind usually allow using the sounds in music,
but not handing the samples themselves on, which is what shipping them in an
app does. Ask their makers before a public release. Or, for the Slingshot,
cut the same two sounds from the NASA originals, which the *Nasa Space Pad*
readme names.
