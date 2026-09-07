# Audio sources

All shipped sounds are free under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Source pages and license labels checked 2026-09-07. Only the selected, compressed clips ship; original archives are not bundled.

## Pistol shots

- Creators: Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney.
- Collection: [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library).
- [Original archive](https://opengameart.org/sites/default/files/Prepared%20SFX%20Library.7z), CC0.
- Original file: `Prepared SFX Library/1911/A_42P.wav` (metadata: 1911, .45 handgun, near distance, front of shooter, stereo).
- `sfx/shot-01.mp3`: excerpt 0.938–1.438 seconds.
- `sfx/shot-02.mp3`: excerpt 4.998–5.498 seconds.
- Edits: mono downmix, 65 Hz high-pass, 0.15-second fade from 0.35 seconds, gain ×0.5, 44.1 kHz / 96 kbps MP3, metadata removed. Attack windows selected using waveform/silence analysis. The compact near-distance recordings replace the previous 2-second generic gunfire clip; two takes alternate with slight pitch variation.

## Footsteps, target feedback and surface impacts

- Creator: Kenney.
- Collection: [Impact Sounds](https://kenney.nl/assets/impact-sounds), CC0.
- [Original archive](https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip).

| Shipped files | Original files in `Audio/` |
| --- | --- |
| `sfx/footstep-01.mp3` through `footstep-05.mp3` | `footstep_concrete_000.ogg` through `_004.ogg` |
| `sfx/hit-01.mp3` through `hit-03.mp3` | `impactPlate_light_000.ogg` through `_002.ogg` |
| `sfx/impact-concrete.mp3` | `impactMining_000.ogg` |
| `sfx/impact-metal.mp3` | `impactMetal_light_000.ogg` |

Edits: mono, 44.1 kHz / 96 kbps MP3, metadata removed. Surface impacts limited to 0.4 seconds with a 0.1-second fade from 0.3 seconds. Target feedback uses light plate impacts for the metal training targets. Footstep cadence remains unchanged.

## Landing

- Creator: MentalSanityOff; submitted by qubodup.
- [Jump Landing Sound](https://opengameart.org/content/jump-landing-sound), CC0.
- [Original recording](https://www.freesound.org/people/MentalSanityOff/sounds/148796/).
- `sfx/landing.mp3`: existing project MP3 retained unchanged, renamed from `jump.mp3` to match its landing event. Original collection offers `jumpland.wav` and MP3 conversions.

## Reload

- Creator: zer0_sol.
- [Handgun Reload Sound Effect](https://opengameart.org/content/handgun-reload-sound-effect), CC0.
- Original file: `reload.wav`.
- `sfx/reload.mp3`: existing project MP3 retained. The real magazine removal/insertion and slide-rack sequence plays at `decoded duration / requested duration`, so the complete sequence follows the existing 1.4-second reload. No random pitch change is applied to this timed cue.

## Runtime mix

Effects feed a 0.65 master gain and a dynamics compressor (−12 dB threshold, 6 dB knee, 12:1 ratio, 3 ms attack, 120 ms release). Shots have lower individual gain and short tails for the unchanged 0.12-second fire interval. Concrete and metal impacts use stereo pan from hit direction. Pausing suspends the audio clock and preserves in-progress reload position.
