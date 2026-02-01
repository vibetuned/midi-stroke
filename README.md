# Midi Stroke
### Precision-Engineered MIDI Training for Piano & Finger Drums (WIP)

**Midi Stroke** is a high-performance, web-based training suite designed to bridge the gap between technical execution and professional music notation. 
By leveraging real-time MIDI data and industry-standard rendering engines, it provides a data-driven environment for mastering both melodic keys and rhythmic percussion.

---

## Technical Architecture

The application is built on a web stack trying to be optimized for low-latency audio processing and high-fidelity visual rendering:

* **React (Frontend):** Manages a reactive UI state, ensuring seamless synchronization between MIDI input and visual feedback.
* **Verovio (Notation Engine):** Renders **SMuFL-compliant** sheet music in real-time. By utilizing the MEI (Music Encoding Initiative) format, Midi Stroke provides professional-grade engraving that scales perfectly across all resolutions.
* **Tone.js (Audio Framework):** Handles the web audio pipeline, providing scheduling and synthesis for internal metronomes and practice cues with sample-accurate precision.
* **Web MIDI API:** Facilitates direct, low-latency communication with external hardware, allowing for real-time velocity and timing analysis.

---

## Core Features

* **Hybrid Input Processing:** Specialized algorithms for both 
- **Piano** (polyphonic, scale-based)
- (**TODO**) **Finger Drums** (rhythmic, velocity-sensitive) training.
* **Dynamic Notation Mapping:** Interactive sheet music that responds to MIDI input, providing instant visual confirmation of accuracy.
* **Precision Tempo Control:** A high-resolution transport system for granular practice, from slow-motion technical drills to full-speed performance.


---

## Getting Started

### Prerequisites
* A MIDI-compatible keyboard or pad controller.
* A modern web browser with Web MIDI API support (Chrome, Edge, Opera).

### Installation
1.  Clone the repository: `git clone https://github.com/your-username/midi-stroke.git`
2.  Install dependencies: `npm install`
3.  Launch the development server: `npm start`

---

> **Note:** For the best experience, ensure your MIDI device is connected before launching the application to allow for automatic hardware detection.