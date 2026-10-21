# Qubit Syndrome Weaver

Build a modern React web application that visualizes a Quantum Error Correction (QEC) Surface Code topology. Please implement this carefully by following these three core requirements:

1. UI & TOPOLOGY (The Grid)

- Create a 7x7 grid UI that behaves like a checkerboard with two distinct types of nodes.

- "Data Qubits": Represented as circles (default color: slate-200). These hold the quantum state.

- "Measure Qubits" (Syndromes): Represented as squares (default color: slate-300). These sit between Data Qubits.

- Use a dark-mode, futuristic UI with Tailwind CSS. Add a top header: "QEC Surface Code Simulator".

2. PHYSICS LOGIC (Errors & Syndromes)

- When a user clicks on any Data Qubit, toggle an "X-Error" (Bit-flip) and change its color to bright orange.

- A Measure Qubit must constantly check the state of its immediate top, bottom, left, and right Data Qubit neighbors.

- If an ODD number (1 or 3) of its neighbors have an X-Error, the Measure Qubit "lights up" (changes color to bright red). If EVEN (0, 2, or 4), it stays normal.

3. AUTOMATION & ALGORITHM (Matching)

- Add a control panel with a "Noise Injection" slider (Error Rate: 0% to 20%) and a "Simulate Noise" button. When clicked, randomly apply X-Errors to Data Qubits based on the probability.

- Add a "Show Error Correction" toggle switch. When ON, simulate a basic Minimum Weight Perfect Matching (MWPM) by finding pairs of "lit up" Measure Qubits and drawing a glowing SVG line between the closest pairs.

- Add a "Reset" button to clear all errors. Ensure smooth CSS transitions.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://qubit-syndrome-weaver.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d216d271-a21e-4c57-a90c-90783c3af5a9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
