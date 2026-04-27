MIDI & MusicXML Timeline Player

A highly precise, browser-based web application designed to synchronize MIDI
playback data with MusicXML sheet music.

Features:

1 File Management & Parsing

  - MIDI (.mid, .midi): Custom binary parser reads structural data, Tempo (BPM),
    Time Signatures, Pulses Per Quarter Note (PPQ), and text events.
  - MusicXML (.xml, .musicxml): Renders visual sheet music dynamically.
    Automatically applies a "compact-tight" engraving rule to optimize screen
    real estate.
  - System Status Readouts: Integrated bottom status bar monitors file load
    success, engine readiness, and parsing errors.

2 Precision Playback & Audio Engine

  - Lookahead Metronome: Uses a high-precision Web Audio API scheduler
    (bypassing main-thread UI lag) for a flawless click track. Accents are
    dynamically adjusted based on time signatures (e.g., strong click on
    beat 1).
  - Dynamic Tempo Tracking: Engine instantly adapts to BPM changes mid-song,
    updating the real-time Tempo: [X] BPM UI display automatically.
  - Time Signature Tracking: Maps and recalculates measure lengths dynamically
    as time signatures change.

3 Visual Timeline & Sheet Music Sync

  - Auto-Scaling Timeline: Automatically scales the timeline width to perfectly
    fit up to 12 measures on screen at once.
  - Auto-Pagination: Seamlessly jumps/scrolls the timeline to the next "page" of
    measures as the playhead crosses boundaries.
  - Binary-Search Cursor Sync: A highly optimized search algorithm ensures the
    red custom sheet music cursor stays perfectly locked to the MIDI playhead,
    even when jumping randomly through the song.
  - Auto-Scrolling Sheet Music: Tracks the cursor's vertical position and
    smoothly scrolls the sheet music container to keep the active staff centered
    on-screen.

4 Smart Looping & Navigation

  - Smart Marker Extraction: Intelligently filters out useless MIDI metadata
    (copyrights, instrument names) to exclusively extract song structure markers
    (e.g., Verse, Chorus, Bridge).
  - Click-to-Jump Markers: Generates interactive buttons above the timeline for
    immediate jumping to song sections.
  - Auto-Looping: Toggling the Loop ON without manual points will automatically
    bracket the current song section (based on markers). Clicking a new marker
    while looping automatically moves the loop boundary to that new section.

 How to Use

1.  Load a MIDI file: Click Load MIDI to parse the song's timing, structure, and
    tempo.
2.  Load a MusicXML file: Click Load MusicXML to render the visual sheet music.
3.  Play: Use the UI buttons or your keyboard to begin playback. The playhead
    will track across the timeline, and the red cursor will follow the notes on
    the sheet music.

 Controls & Hotkeys

This application includes advanced desktop controls for rapid navigation and
practice.

Mouse Controls

  - Ctrl + Left-Click (on timeline): Set the Loop Start point to the beginning
    of the clicked measure.
  - Ctrl + Right-Click (on timeline): Set the Loop End point to the end of the
    clicked measure.

Keyboard Shortcuts

| Key                       | Action                                                                                                            |
| :------------------------ | :---------------------------------------------------------------------------------------------------------------- |
| `Spacebar`                | **Play / Stop** toggle.                                                                                           |
| `Spacebar` *(Double-tap)* | **Quick Rewind**. Double-tapping within 300ms stops playback and instantly rewinds to the beginning of the track. |
| `Numpad Enter`            | **Play** (Starts playback, does not toggle stop).                                                                 |
| `M`                       | Toggle **Metronome** ON/OFF.                                                                                      |
| `L`                       | Toggle **Loop** ON/OFF.                                                                                           |
| `Numpad 1`                | Jump playhead to the current **Loop Start** marker.                                                               |
| `Numpad 2`                | Jump playhead to the current **Loop End** marker.                                                                 |
| `Numpad +`                | **Step Forward**. Jump exactly one measure forward.                                                               |
| `Numpad -`                | **Step Backward**. Jump exactly one measure backward.                                                             |

 Architecture & Tech Stack

  - Language: Vanilla JavaScript, HTML5, CSS3.
  - Sheet Music Engine: OpenSheetMusicDisplay (OSMD)
  - Audio Engine: Native Web Audio API (Oscillator nodes for metronome).
  - State Management: Custom object-oriented architecture (MusicPlayerEngine
    class).
  - Performance: Decoupled logic and rendering. State/audio math is handled via
    setInterval, while DOM/visual updates are batched via requestAnimationFrame
    for buttery-smooth 60fps rendering.
