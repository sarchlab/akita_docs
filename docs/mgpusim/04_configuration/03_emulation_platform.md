# Emulation Platform

The emulation platform in MGPUSim provides a functional simulation environment for GPU applications. It consists of two main components: the `Builder` in the `emusystem` package and the `Builder` in the `emugpu` package. Together, they create a complete GPU emulation system that can execute GPU applications without timing simulation.

## System Builder

The `emusystem.Builder` is responsible for constructing the overall emulation system. Let's examine its key components and configuration options.

### Configuration Options

The system builder provides several configuration methods:

```go
// WithSimulation sets the simulation to use
func (b Builder) WithSimulation(sim *simulation.Simulation) Builder

// WithNumGPUs sets the number of GPUs to use
func (b Builder) WithNumGPUs(n int) Builder

// WithLog2PageSize sets the page size as a power of 2
func (b Builder) WithLog2PageSize(n uint64) Builder

// WithDebugISA enables the ISA debugging feature
func (b Builder) WithDebugISA() Builder
```

These methods allow you to configure:
- The simulation engine to use
- The number of GPUs in the system
- The page size for memory management
- Whether to enable ISA debugging for detailed instruction execution tracking

### System Construction

The `Build()` method constructs the complete emulation system:

```go
func (b Builder) Build() *sim.Domain
```

The build process involves several steps:

1. **Memory System Setup**
   - Creates a global storage with 4GB per GPU
   - Initializes a page table for address translation
   - Sets up the GPU driver with memory management capabilities

2. **Connection Setup**
   - Creates a direct connection component for GPU communication
   - Connects the driver to the external communication network

3. **GPU Creation**
   - Creates the specified number of GPUs
   - Registers each GPU with the driver
   - Connects each GPU to the communication network

## GPU Builder

The `emugpu.Builder` is responsible for constructing individual GPU components for emulation. It creates a functional GPU that can execute instructions without timing simulation.

### Configuration Options

The GPU builder provides several configuration methods:

```go
// WithSimulation sets the simulation to use
func (b Builder) WithSimulation(sim *simulation.Simulation) Builder

// WithDriver sets the GPU driver
func (b Builder) WithDriver(d *driver.Driver) Builder

// WithPageTable sets the page table
func (b Builder) WithPageTable(pageTable vm.PageTable) Builder

// WithLog2PageSize sets the page size
func (b Builder) WithLog2PageSize(n uint64) Builder

// WithStorage sets the global memory storage
func (b Builder) WithStorage(s *mem.Storage) Builder

// WithISADebugging enables instruction execution debugging
func (b Builder) WithISADebugging() Builder
```

### GPU Construction

The `Build()` method constructs a complete GPU:

```go
func (b Builder) Build(name string) *sim.Domain
```

The build process involves several steps:

1. **Memory System**
   - Creates a global memory controller
   - Connects it to the shared storage system

2. **Compute Units**
   - Creates 64 compute units
   - Each compute unit can execute GPU instructions
   - Optionally enables ISA debugging for each compute unit

3. **Command Processor**
   - Creates a command processor for handling GPU commands
   - Sets up a DMA engine for memory transfers
   - Connects to the GPU driver

4. **Internal Connections**
   - Creates a direct connection network within the GPU
   - Connects all components (command processor, compute units, memory)
   - Sets up external ports for communication

## Usage Example

Here's an example of how to create and configure an emulation platform:

```go
builder := emusystem.MakeBuilder().
    WithSimulation(simulation).
    WithNumGPUs(4).
    WithLog2PageSize(12)

if enableDebug {
    builder = builder.WithDebugISA()
}

platform := builder.Build()
```

This creates a platform with 4 GPUs, each with 64 compute units, and optionally enables instruction debugging. The platform can then be used to run GPU applications in a functional simulation mode.

