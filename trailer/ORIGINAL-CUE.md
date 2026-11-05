# Original trailer music cue

Status: rendered from `music/cue.py` and in use. The trailer plays this cue.

## Composition

- Length: 36 s. Tempo: 108 BPM. Meter: 4/4. Tonal center: G major.
- Motif: B4, D5, E5, G5, A5, B5 on a kalimba, rising in G pentatonic. It opens
  the trailer alone, and comes back when the phone appears and in the
  "Apply. Learn. Lead." scene.
- Harmony: G, D, Em7, C. The mission scene starts on Em7 and Cmaj7 for the
  gap in opportunity, and arrives on G at "We're here to balance the
  equation." The cue ends on G(add9).
- Sound: kalimba, nylon guitar, marimba, glockenspiel, finger bass, strings and
  light hand percussion. The guitar plays offbeat eighths for a highlife
  feel. There is no synth lead and no stock-music swell. Everything comes from
  built-in LMMS sounds.

## Picture map

| Time | Picture beat | Music change |
| --- | --- | --- |
| 0.00-5.60 | Brand hook | Kalimba arpeggio and the motif, alone and soft. |
| 5.60-11.80 | Mission | Strings and a quiet bass come in under the kalimba. No drums. |
| 11.80-18.90 | Product view | The groove starts with the whoosh at 11.80 s: guitar, bass, kick, shaker, and the motif again. |
| 18.90-26.10 | Program paths | Congas and a marimba answer join. The kalimba and marimba stay off the clicks at 22.00 and 23.10 s. |
| 26.10-31.30 | Apply, learn, lead | The strongest part: kick on every beat, side stick, louder strings, and glockenspiel pairs for the three words. |
| 31.30-36.00 | End card | Resolve to G(add9) on 31.11 s and hold. The chime at 31.60 s rings over a quiet chord. A kalimba roll follows once it fades, then a held G5 to the fade from 34.40 s. |

## Mix and export

`lmms-cue render` writes `cue.wav` (48 kHz), `cue.mp3` and `cue.report.json` at
-17 LUFS and -2 dBTP. A master limiter in `cue.py` keeps LMMS from clipping its
16-bit output and lets the loudness pass stay linear. `preview-new-cue.mp4` is
the trailer with this cue and its existing sound effects.

In use: `music/cue.mp3` is copied to `public/audio.mp3`.
