# Final Reflection

## Why Go?

## Multi-Repository Design.

## Emulation vs. Simulation

Emulation and simulation are two commonly interchangeable terms. However, in the development of Akita and MGPUSim, we distinguish them clearly. An emulator recreates the execution results of real hardware, without taking into account the time required to complete the execution. On the other hand, a simulator only evaluates the execution time, without considering the execution results. When performance is value-dependent, the simulator and the emulator need to work together.

Emulators are typically developed with functions or classes that use arguments as inputs or outputs. For example, the `Storage` class is a key element of the memory system. This class stores data for DRAMs, caches, and even register files. It is an emulation concept, as it does not take into account the time required to read or write data. The `Storage` class provides a `Write` and a `Read` method, which take a buffer (i.e., byte slice) and an address to read and write the data. Both operations complete immediately, without any latency.

To consider read and write latency, we need to add simulator elements. For example, we have a DRAM controller that administers the timing logic. The DRAM controller does not store data itself, but contains a `Storage` field to manage its content.

Software dependencies between hardware and software concepts must be managed with care. Generally, an emulation element should never depend on a simulation element. In other words, an emulator class (e.g., `Storage`, `PageTable`) should not be aware of the existence of any simulator class. However, simulators should depend on emulator concepts. The proper relationship between simulator and emulator classes should be in a way that the simulator classes intermediate the emulator classes’ action by calling their functions. 

We say magic is bad. However, when magic is needed (e.g., magic memory copy), it should happen in emulator elements. For example, when we implement the magic memory copy, we let the driver to have access to the DRAMs’ storage so that the driver can directly write data to GPUs’ DRAM without incurring any latency.