# Cribl Synth

## Overview

Cribl Synth is a fully playable, browser-based virtual analog synthesizer built as a Cribl App. It features a multi-oscillator engine (sine, square, sawtooth, triangle, noise) with FM synthesis, unison voicing, dual filters with drive and key tracking, ADSR envelopes for volume/filter/pitch, an LFO with multiple shapes and sync divisions, an arpeggiator, and a full effects chain (compressor, distortion, phaser, delay) with drag-reorderable signal routing. It also includes a real-time oscilloscope and spectrum analyzer, preset management with save/load/delete, and 13 visual themes.

## User Manual

### Getting Started

Open the app in your browser. Sound is produced by clicking the on-screen piano keyboard or by pressing keys on your computer keyboard (toggle keyboard input with the switch in the bottom-right). Tooltips are available throughout the synth -- hover over controls to see explanations of what they do.

### A Word of Caution

This is a powerful synthesizer and it is entirely possible to create extremely loud or harsh sounds. If things get out of control, click the **PANIC** button to immediately kill all sound. Be especially careful with the **Random** button -- it generates randomized patches that can produce extreme or unexpected sounds at full volume. Consider lowering your system volume or the volume knob in the master section before experimenting.

### Keyboard Mapping

The bottom two rows of your keyboard map to a piano layout:

- **White keys:** A S D F G H J K L ;
- **Black keys:** W E T Y U O P

### Octave and Tempo

- Use the **octave** buttons (left/right arrows) below the keyboard to shift the pitch range (octaves 1-7).
- Set the **BPM** (beats per minute) control in the top center to set the global tempo. This affects all time-based modulations throughout the synth, including the LFO rate, arpeggiator speed, delay time, and envelope speeds. Changing the BPM will simultaneously change the feel and rhythm of all these parameters together.

### Oscillator Section

Mix between five waveforms (sine, square, sawtooth, triangle, noise) using the sliders. Square wave has an adjustable pulse width. FM synthesis (frequency modulation) and a harmonizer are available below the main oscillators. Unison mode stacks up to 8 detuned voices with stereo spread.

### Envelope Section

Four independent ADSR envelopes control volume, filter cutoff, filter resonance, and pitch. Each has attack, decay, curve, sustain, and release knobs plus an amount control for filter/pitch depth.

### Filter Section

Dual filters (switchable via the 1/2 buttons) with lowpass, highpass, bandpass, and band-reject types. Each filter has cutoff, resonance, and drive knobs, selectable slope (6/12/24/36 dB), and optional key tracking.

### LFO

Tempo-synced LFO with six shapes (sine, square, sawtooth, triangle, noise, sample & hold). Modulation targets include filter cutoff, filter resonance, coarse pitch, fine pitch, pulse width, and FM depth. Features ramp-up fade-in and polarity flip.

### Arpeggiator

Toggle the arpeggiator on/off and configure time division, pattern (up, down, up-down, random), and octave range (1-3 octaves).

### Effects Chain

Four effects in a reorderable chain:

- **Compressor** -- threshold, ratio, attack, release
- **Distortion** -- drive, tone, bit crush, dry/wet mix
- **Phaser** -- rate, depth, feedback, dry/wet mix
- **Delay** -- tempo-synced time, feedback, tone filter, offset, dry/wet mix

Use the arrow buttons next to each effect title to reorder the signal chain.

### Presets

Use the **Presets** dropdown in the header to load, save, rename, or delete presets. The **Random** button generates a randomized patch. Several bundled presets are included.

### Themes

Use the **theme dropdown** or left/right arrows in the header to switch between 13 visual themes: Cyan, Red, Green, Purple, Orange, Yellow, White, Zebra, Tiger, Matrix, Rasta, Skeuomorphic, and Juno.

### Visualizer

The bottom-right panel shows a real-time **oscilloscope** or **spectrum analyzer** (click the buttons to toggle). Hover over the spectrum view to see frequency readouts.

### Controls Reference

- **Knobs** -- click and drag up/down to adjust. Double-click to reset to default.
- **Sliders** -- click and drag horizontally. Double-click to reset to default.
- **Buttons** -- click to toggle or select.
- **MONO** -- enables monophonic mode (one note at a time with optional glide/slide).
- **PANIC** -- kills all sound immediately.

## License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](LICENSE) file for details.

## Installation

1. Log in to Cribl and then click on **Apps->View All**
2. Click **Add App->Import from Git**.
3. Paste the repo url and "latest" for the release tag.
4. Click **Import**.

## Contact

**Author:** Ryan Semple
**Email:** rsemple@cribl.io
