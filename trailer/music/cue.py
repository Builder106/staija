"""STAIJA trailer cue, composed from ORIGINAL-CUE.md.

Render with `lmms-cue render music/cue.py` (see SankofaForge/lmms-cue).
108 BPM in 4/4, so one beat is 0.556 s and the 36 s trailer is 16.2 bars.
Key: G major.
"""

from lmms_cue import Song, effect, reverb, sf2

BPM = 108
song = Song(bpm=BPM, length=36.0, fade_out=(34.4, 36.0),
            master_fx=[
                reverb(size=0.8, color=7500, wet=0.26),
                # A limiter keeps peaks out of LMMS's 16-bit clip and lets the
                # render's loudness normalisation stay linear.
                effect("compressor", "CompressorControls", threshold=-17, ratio=20, attack=0.5,
                       release=120, knee=2, lookahead=1, lookaheadLength=5, peakmode=1, limiter=1),
            ])


def at(seconds: float, grid: float = 1.0) -> float:
    """Beat nearest a picture time, on a grid of `grid` beats."""
    return round(song.beat(seconds) / grid) * grid


# GM drum keys on the standard kit.
KICK, SIDE_STICK, MARACAS, CLAVES = 36, 37, 70, 75
CONGA_MUTE, CONGA_HI, CONGA_LO = 62, 63, 64

drums = song.track("Percussion", sf2(0, bank=128, gain=3), volume=80)
kalimba = song.track("Kalimba", sf2(108, gain=3), volume=88, pan=-10)
marimba = song.track("Marimba", sf2(12, gain=3), volume=60, pan=20)
bells = song.track("Glockenspiel", sf2(9, gain=3), volume=55, pan=15)
guitar = song.track("Nylon guitar", sf2(24, gain=3), volume=75, pan=-20)
bass = song.track("Finger bass", sf2(33, gain=3), volume=80)
strings = song.track("Strings", sf2(48, gain=3), volume=55)

# One chord a bar from bar 6; the first bars lean on Em7 for the mission.
PROG = {0: "G", 1: "D", 2: "Em7", 3: "C", 4: "G", 5: "D"}
for bar in range(6, 14):
    PROG[bar] = ["G", "D", "Em7", "C"][(bar - 6) % 4]
PROG[14] = "G"
PROG[15] = "G"

ROOT = {"G": "G2", "D": "D2", "Em7": "E2", "C": "C2"}
STRIKE = {"G": ["G3", "B3", "D4"], "D": ["D3", "F#3", "A3"],
          "Em7": ["E3", "G3", "D4"], "C": ["C3", "E3", "B3"]}
PAD = {"G": ["G3", "D4", "A4"], "D": ["D3", "A3", "F#4"],
       "Em7": ["E3", "B3", "G4"], "C": ["C3", "G3", "E4"]}
ARP = {"G": ["G4", "B4", "D5", "A4"], "D": ["D4", "F#4", "A4", "D5"],
       "Em7": ["E4", "G4", "B4", "D5"], "C": ["C4", "E4", "G4", "B4"]}

# Picture times in beats: 5.6 s = 10, 11.8 s = 21, 18.9 s = 34, 26.1 s = 47,
# 31.3 s = 56. Effects: whoosh at 11.8 s, clicks at 22.0 and 23.1 s, chime at 31.6 s.
MISSION, PHONE, PROGRAMS, IMPACT, END_CARD = 10, 21, 34, 47, 56
CLICKS = [at(22.0, 0.25), at(23.1, 0.25)]
CHIME = at(31.6, 0.25)


def near_click(beat: float) -> bool:
    return any(abs(beat - c) < 0.5 for c in CLICKS)


TOTAL_STEPS = int(song.beat(36.0) * 4)

for i in range(TOTAL_STEPS):
    b = i / 4
    bar = int(b // 4)
    chord = PROG[min(bar, 15)]
    step = i % 16
    on_beat = i % 4 == 0
    eighth = i % 2 == 0
    off_eighth = i % 4 == 2
    arp_note = ARP[chord][(i // 2) % 4]

    # Hook: kalimba arpeggio under the motif, then through the mission, soft.
    if b < PHONE:
        if eighth and b < END_CARD:
            velocity = 46 if b < MISSION else 38
            kalimba.note(b, 0.6, arp_note, velocity)

    # Phone, programs and impact: the highlife groove.
    elif b < END_CARD:
        level = 0 if b < PROGRAMS else 1
        if off_eighth:
            guitar.chord(b, 0.35, STRIKE[chord], 44 + 8 * level + (16 if b >= IMPACT else 0))
        if step in (0, 6, 10, 14):
            note = ROOT[chord]
            if step == 6:
                note = note[:-1] + str(int(note[-1]) + 1)
            bass.note(b, 0.75 if step == 0 else 0.4, note, 72 if step == 0 else 58)
        if step in (0, 10) or (b >= IMPACT and on_beat):
            drums.note(b, 0.25, KICK, 62 + (20 if b >= IMPACT else 0))
        if i % 2 == 0:
            drums.note(b, 0.1, MARACAS, 38 if on_beat else 26)
        if b >= PROGRAMS and step in (3, 6, 12):
            drums.note(b, 0.2, {3: CONGA_MUTE, 6: CONGA_HI, 12: CONGA_LO}[step], 48 + (24 if b >= IMPACT else 0))
        if b >= IMPACT and step in (4, 12):
            drums.note(b, 0.2, SIDE_STICK, 70)
        # Kalimba keeps the arpeggio going, thinner than the hook so the melody sits on top.
        if eighth and not near_click(b):
            kalimba.note(b, 0.5, arp_note, 36)
        # Marimba answers from the programs scene, on the offbeat sixteenths.
        if b >= PROGRAMS and step in (3, 7, 11, 15) and not near_click(b):
            marimba.note(b, 0.4, ARP[chord][(step // 4 + 1) % 4].replace("4", "5"), 38)

# Bass and strings: strings under the mission and everything after it.
for bar in range(2, 16):
    start = bar * 4
    chord = PROG[bar]
    if start < END_CARD:
        begin = max(start, MISSION)
        strings.chord(begin, start + 4 - begin, PAD[chord], 36 + 2 * (bar - 2) if bar < 12 else 88 + 6 * (bar - 12))
    if bar < 6 and start >= MISSION - 2:
        begin, end = max(start, MISSION), min(start + 4, PHONE)
        bass.note(begin, end - begin, ROOT[chord], 50)

# The motif, in G pentatonic, rising like a door opening.
MOTIF = [("B4", 1), ("D5", 1), ("E5", 1), ("G5", 1.5), ("A5", 0.5), ("B5", 3)]


def motif(start: float, velocity: int = 72, instrument=kalimba, up: int = 0):
    beat = start
    for note, length in MOTIF:
        name = note[:-1] + str(int(note[-1]) + up)
        instrument.note(beat, length, name, velocity)
        beat += length


motif(0.0, 90)  # the hook, alone over the soft arpeggio
motif(PHONE, 76)  # the phone appears with the groove

# Programs scene: motif on the marimba an octave lower than the bells, then the bells chime in.
motif(PROGRAMS + 0.5, 54, marimba)
# 22.0 s and 23.1 s are the two clicks; the motif above ends before them.

# Impact: the bells state Apply, Learn, Lead with three rising pairs.
for beat, notes in [(IMPACT + 1, ["G5", "B5"]), (IMPACT + 3, ["A5", "D6"]), (IMPACT + 5, ["B5", "E6"])]:
    for n in notes:
        bells.note(beat, 1.5, n, 78)
motif(IMPACT + 1.0, 86, kalimba, up=0)

# End card: resolve to G(add9) on the bar line, hold, and let the chime ring on top.
bass.note(END_CARD, 72 - END_CARD, "G2", 70)
strings.chord(END_CARD, 72 - END_CARD, ["G3", "D4", "A4", "B4"], 64)
guitar.chord(END_CARD, 3, ["G3", "B3", "D4", "A4"], 60)
kalimba.note(END_CARD, 1, "G4", 54)
# Arpeggio rolls up once the chime has faded, then the held G5.
for step, note in enumerate(["G4", "B4", "D5", "A5"]):
    kalimba.note(CHIME + 1.5 + step * 0.5, 1, note, 50 + step * 4)
kalimba.note(CHIME + 4, 8, "G5", 58)
