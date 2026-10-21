# Qubit Syndrome Weaver

**Live Demo:** [https://qubit-syndrome-weaver.lovable.app](https://qubit-syndrome-weaver.lovable.app)

## What is this?
This is an interactive Quantum Error Correction (QEC) simulator. It visually demonstrates the critical difference between basic Minimum Weight Perfect Matching (MWPM) and advanced **Weighted Graph Decoding** when handling complex error chains in a Surface Code topology. 

The goal of this project is to highlight the software bottlenecks in scaling fault-tolerant quantum computers, specifically how naive decoding algorithms can cause Logical Errors.

## How to Use the Simulator
1. **Inject Noise:** Use the "Noise Injection" slider to simulate ambient hardware noise, or manually click on the white "Data Qubits" (circles) to trigger X-errors (orange).
2. **Observe Syndromes:** Notice how the intermediate "Measure Qubits" (squares) light up red when they detect an odd parity change.
3. **Test Basic Decoding:** Turn on **"Show Error Correction"**. The simulator will attempt to pair the red syndromes using basic Euclidean distance (blue lines). Notice how it often makes mistakes (drawing crossing lines or ignoring the actual error path).
4. **Test Smart Decoding:** Turn on **"Smart Matching (Weighted)"**. The algorithm switches to an advanced pathfinding mode that routes directly through the existing X-errors (green lines). This accurately reconstructs the physical error chain and prevents logical errors.
