---
sidebar_position: 0
---

# Akita Simulator Engine

Akita is a flexible, high-performance, and user-friendly engine for building computer architecture simulators. Written in the Go programming language, it functions not as a complete, standalone simulator but as a modular framework, analogous to a game engine for game development.

## Why Akita?

- **Akita is an engine.** We strongly believe on by building an engine, separately from building the simulator, we can achieve a better developer experience.
- **Akita is written in Go.** If you have used C++, and then tried Go, you can never go back.
- **Akita emphasizes explainability.** Imagine you can build a new simulator in a few hours and immediately have real-time monitoring and visualization to aid in debugging and analysis.

## Key Elements

Akita includes a few key elements that make it a powerful tool for building computer architecture simulators.

- **Akita Engine Core**: The engine core uses a high-performance, event-driven model to efficiently simulate systems, only performing computations when an event occurs. To simplify development, it features "Smart Ticking," which provides developers with an intuitive cycle-by-cycle programming experience while retaining the performance benefits of the event-driven back end. The core is also designed for parallel execution, allowing it to leverage multiple CPU cores to speed up large-scale simulations.

- **Daisen Visualization Tool**: Daisen is a post-simulation, web-based visualization tool that helps researchers understand simulation results. By processing detailed execution traces, it creates hierarchical timelines that show how tasks are executed across different hardware components. This is essential for discovering performance bottlenecks, analyzing latencies, and verifying the correctness of complex hardware interactions, especially in GPU architectures.

- **AkitaRTM (Real-Time Monitor)**: AkitaRTM is an interactive, web-based dashboard that allows for the live monitoring of a simulation as it runs. It solves the "black box" problem of simulators by providing real-time insight into the state of various components and in-flight messages. This is invaluable for debugging issues like deadlocks and for conducting interactive performance analysis without waiting for the simulation to complete.

- **First-Party Components**: Akita includes a library of pre-built, standard hardware modules to accelerate development. These serve as the building blocks for new simulators. **Memory (mem)** includes generic components for caches (write-through, write-back), Translation Lookaside Buffers (TLBs), and memory controllers. **Network-on-Chip (noc)** provides models for switches and interconnects to simulate on-chip communication networks.

## Successful Stories

Akita has been used in building several simulators, including: 

- [MGPUSim](/docs/mgpusim/01_getting_started.md)
- [Yori](https://michaeltshen.github.io/Files/Yori.pdf)
- [TrioSim](https://github.com/sarchlab/triosim)

## Key Contributors

- [Yifan Sun, Assistant Professor @ W&M](https://sarchlab.org/syifan)
- [Mengyang He, Former Undergraduate Student @ W&M](https://github.com/MengyangHe1)
- [Daoxuan Xu, PhD Student @ W&M](https://github.com/DX990307)
- [Xuzhong Wang, Undergraduate Student @ W&M](https://github.com/xuzhongwm)
- [Huizhi Zhao, Undergraduate Student @ W&M](https://github.com/sylvzhz)