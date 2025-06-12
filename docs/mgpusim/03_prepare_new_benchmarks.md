---
sidebar_position: 3
---

# Prepare New Benchmarks

MGPUSim allows users to provide new benchmarks from OpenCL kernels. This tutorial will guide you through the process of preparing a new benchmark from OpenCL kernels. In general, it takes 3 steps to prepare a new benchmark: (1) compile the OpenCL kernel to HSACO, (2) write a Go program that serves as the host program, and (3) write the main program. 

## Prepare HSACO From OpenCL

HSACO stands for Heterogeneous System Architecture (HSA) Code Object. It is the binary format that is supported by the Radeon Open Compute Platform (ROCm). Akita GCN3 support unmodified HSACO file for simulation.


It is recommend to use a docker container for the compilation environment. We recommend using the 3.8 version of the rocm/dev-ubuntu-20.04 image, which is available [here](https://hub.docker.com/layers/rocm/dev-ubuntu-20.04/3.9/images/sha256-e45d1f58f02f5907baba98978b82e88b3f06f0a6edeb14597cb84248c7c27501). 

To generate an HSACO file from an OpenCL source code file, `clang-ocl` is required. `clang-ocl` is shipped with ROCm installation and you should be able to find it at `/opt/rocm/bin`.

Suppose the OpenCL file you want to compile is `kernels.cl`, you can run the following command to generate an HSACO:

```bash
clang-ocl -mcpu=gfx803 kernels.cl -o kernels.hsaco
```

Here, `gfx803` is the instruction set architecture~(ISA) that Akita GCN3 supports. In case you want to dump the human-readable assembly, you can slightly change the command above to:

```bash
clang-ocl -mcpu=gfx803 kernels.cl -S -o kernels.asm
```

As you may notice, `clang-ocl` add 3 extra arguments to the compiled kernel, including `HiddenGlobalOffsetX`, `HiddenGlobalOffsetY`, and `HiddenGlobalOffsetZ`. These fields may be helpful when we prepare benchmarks for multi-GPU execution. However, the use of these arguments should be very careful and for most of the time, only 0 should be passed to these fields.

## A Benchmark Struct

For each benchmark, we need a Go program that serves as the host program that controls the GPU execution. We recommend users to use the `amd/benchmarks/heteromark/fir` as a template.


A Benchmark is prepared as a struct that implements the `Benchmark` interface. 

```go
type Benchmark interface {
	SelectGPU(gpuIDs []int)
	Run()
	Verify()
	SetUnifiedMemory()
}
```

The `SelectGPU` function is used to select the GPUs to be used by the benchmark. The `Run` function is used to run the benchmark. The `Verify` function is used to verify the correctness of the benchmark. The `SetUnifiedMemory` function is used to set the unified memory mode (do not use yet).

Other than the required functions, it is also recommended to add a `NewBenchmark` function to serve as the "constructor" function of the benchmark struct. Typically, benchmark structs requires to interact with the driver to allocate memory, copy memory, and launch kernels. The `driver` works similar to CUDA or OpenCL APIs that provides the interface between the host program and the GPU.

## Load HSACO

To be able to execute the kernel, we have to load the HSACO binary into the GPU simulator. Luckily, we have the go:embed mechanism that can embed the HSACO files as part of the executable binary, so that we do not need to manually copy the HSACO file to the executable directory.

To use the `go:embed` mechanism, we need to add the following tag to the top of the file:

```go
//go:embed kernels.hsaco
var hsacoBytes []byte
```

Then, in the `NewBenchmark` function, we can use the `hsacoBytes` variable to load the HSACO binary into the benchmark struct.

```go
func NewBenchmark(driver *driver.Driver) *Benchmark {
	b := new(Benchmark)

	b.driver = driver

	// The kernel name is the name of the kernel in the OpenCL file. 
	// This function can be called multiple times to load multiple kernels.
	b.hsaco = kernels.LoadProgramFromMemory(hsacoBytes, "FIR")

	return b
}
```


## Initialize GPU Memory

For the rest of the tutorial, we will focus on the `Run` function. In general, the `Run` function is composed of two steps, initializing the GPU memory and running the kernel.

```go
func (b *Benchmark) Run() {
    b.initMem()
    b.exec()
}
```

Before we run the GPU kernel, we need to send data to the GPU. Now, you will need to interact with the GPU driver in the `initMem` function. Connecting the code snippets in this section is the whole `initMem` function implementation.

```go
func (b *Benchmark) initMem() {
    b.numTaps = 16
```

The first step is to allocate memory on GPU using the `AllocateMemory` function. The `AllocateMemory` function takes the number of bytes to be allocated as an argument.

```go
    b.gFilterData = b.driver.AllocateMemory(uint64(b.numTaps * 4))
    b.gHistoryData = b.driver.AllocateMemory(uint64(b.numTaps * 4))
    b.gInputData = b.driver.AllocateMemory(uint64(b.Length * 4))
    b.gOutputData = b.driver.AllocateMemory(uint64(b.Length * 4))
```

Initializing the CPU data is in native Go style:

```go
    b.filterData = make([]float32, b.numTaps)
    for i := 0; i < b.numTaps; i++ {
        b.filterData[i] = float32(i)
    }

    b.inputData = make([]float32, b.Length)
    for i := 0; i < b.Length; i++ {
        b.inputData[i] = float32(i)
    }
```

Copying the data to the GPU is also as simple as follows:

```go
    b.driver.MemCopyH2D(b.gFilterData, b.filterData)
    b.driver.MemCopyH2D(b.gInputData, b.inputData)
```

In case you want to copy the data back from the GPU to the CPU, you simply need to replace the function name as `MemCopyD2H` and invert the argument order, putting the destination in front of the source.

```go
}
```

Note that when you run the `MemCopyH2D` function, the simulator already started detailed timing simulation and the memory copy time is calculated to the total execution time.

## Run a Kernel

Finally, we can run kernels on the GPU simulator. But before we launch the kernel, we need to formally define the kernel arguments as a struct. For example, the OpenCL kernel signature of the FIR kernel is as follows:

```opencl
__kernel void FIR(
    __global float* output,
    __global float* coeff,
    __global float* input,
    __global float* history,
    uint num_tap
)
```

Then, we can convert the arguments as a Go struct:

```go
type KernelArgs struct {
    Output              driver.GPUPtr
    Filter              driver.GPUPtr
    Input               driver.GPUPtr
    History             driver.GPUPtr
    NumTaps             uint32
    Padding             uint32
    HiddenGlobalOffsetX int64
    HiddenGlobalOffsetY int64
    HiddenGlobalOffsetZ int64
}
```

For global pointers, we convert the type to driver.GPUPtr. Each pointer is 8B long. For scalar arguments, we can simply set the corresponding type in Go. Note that in the Go struct, you need to avoid types like `int`. Such types may have various sizes on different platform and they make the serializer not working properly. Finally, we also append the added 3 hidden offsets fields with type int64. We need to add a 4-byte padding field before `HiddenGlobalOffsetX`. The rule is that if the field is 8 bytes in size, the offset of the field relative to the beginning of the kernel argument struct must be a multiple of 8. The names of the arguments do have to match the OpenCL kernel signature, but all of them have to be public struct fields (capitalized first letter).

Running the benchmark is as easy as follows:

```go
func (b *Benchmark) exec() {
    kernArg := KernelArgs{
        b.gOutputData,
        b.gFilterData,
        b.gInputData,
        b.gHistoryData,
        uint32(b.numTaps),
        0,
        0, 0, 0,
    }

    b.driver.LaunchKernel(
        b.hsaco,
        [3]uint32{uint32(b.Length), 1, 1},
        [3]uint16{256, 1, 1},
        &kernArg,
    )
}
```

In the code above, we first set the fields of the kernel arguments. Then we launch the kernel with `LaunchKernel` API. The `LaunchKernel` API takes the kernel HSACO as the first argument. The global grid size (in the unit of the number of work-items) and the work-group size as the second argument. The last argument is the pointer to the kernel arguments. The `LaunchKernel` function runs the kernel on the simulator and it will return when the kernel simulation is completed. Therefore, this function may run for a very long time.

## Verification

Verification is optional but strongly recommended. With a CPU verification that compares the output with the GPU output, a user would know that the simulator is at least functionally correct.