# MGPUSim: Preparing New Experiments

## The MGPUSim Driver API

The Driver API is designed to be consistent with mainstream GPU programming frameworks (e.g., CUDA, HIP). So, experienced GPU programmers should find the MGPUSim Driver API straightforward. 

**Context.** At the beginning of a GPU program, the driver’s `Init` method should be called to create a new context. Most of the subsequent API calls should carry the context as an argument. The context stores information that may be carried across API calls. The `Init` function creates a new process ID (PID) so that concurrently running programs can have totally disjoint virtual address spaces. 

Another related function is `InitWithExistingPID`. This function is similar to `Init`, but will use the provided context’s PID. This function is used when one GPU benchmark needs multiple threads. Each thread may have different contextual information, but shares one PID, allowing data sharing. 

**Device APIs.** The driver provides a few functions so that the program can interact with the devices, including `RegisterGPU`, `GetNumGPUs`, `SelectGPU`, and `CreateUnifiedGPUs`. The first two APIs are straightforward, so we skip them. 

`SelectGPU` declares which GPU to use. Once this function is called, all the subsequent API calls will perform action (e.g., allocate memory, launch kernel) on the selected GPU until this function is called again. The GPU selection is per-context-based. So, selecting GPUs in one context will not impact the execution of another context. 

`CreateUnifiedGPUs` can combine multiple GPUs and create a virtual device ID. If this virtual device is selected, all the memory allocation and kernel launching will be distributed to all the actual GPUs that form the unified GPU. We will discuss unified GPUs in more detail later.

**Command Queues.** The MGPUSim Command Queue mimics the CUDA streams. Commands such as memory copy and kernel launching can be inserted into Command Queues. Commands within the same Command queue are always executed in order and without overlap, while commands from different queues can be executed in parallel. 

There are two APIs directly related to the Command Queue. One is `CreateCommandQueue`, which creates a command queue within the given context. The other one is `DrainCommandQueue`, which guarantees that all the commands in the queue are finished before returning. 

<aside>
🤫 **Something that can be improved if the team has more resources.** 
We do not support freeing Command Queues yet.

</aside>

**Memory Management.** The MGPUSim driver API allows explicit memory management. Basic APIs include `AllocateMemory` and `FreeMemory`.

Memory can be copied from one location to another. To support memory copy, MGPUSim’s driver provides APIs, including `MemCopyH2D`, `MemcopyD2H`, and `MemcopyD2D`. Here, the suffix `H2D`, `D2H`, and `D2D` denote copy directions, with `H` representing the host and `D` representing the device (GPU). 

If the memory copy operation involves host memory, the host memory is a data structure that is defined in Go. For example, if the data is an array of single-precision floating-point numbers, we can define the host memory as `[]float32`.

<aside>
🤫 **Something that can be improved if the team has more resources.** 
Currently, the CPU memory is part of the simulator rather than a component that is being simulated. Not modeling CPU memory is simple, but it forbids us from modeling the behavior of CPU memory.

</aside>

Additionally, all memory copy APIs include an asynchronous version (e.g., `EnqueueMemcopyH2D`). These asynchronous APIs require an additional Command Queue argument. The function returns without waiting for the memory copy to finish. 

Note that memory copy in MGPUSim does not finish immediately. Instead, MGPUSim models the memory copy latency according to the amount of data and the bandwidth of the network. We will discuss this later. 

MGPUSim also provides a few extra APIs that facilitate multi-GPU computing. For example, the `Remap` API allows the pages to be moved to another GPU without changing the virtual address. Since the `Remap` API will only modify the page table without moving the underlying data, it can only be called before the buffer is initialized with data. The `Distribute` function can automatically distribute a buffer evenly across a few GPUs, utilizing the `Remap` API. Finally, if users do not want to manually manage the memory, MGPUSim allows the allocation of unified memory using the `AllocateUnifiedMemory` API. Pages allocated with unified memory can be migrated while the GPU program is executing.

**Kernel Launching.** A GPU program can launch a kernel using the `LauchKernel` API. The signature of the `LaunchKernel` API is defined as follows. 

```go
func (d *Driver) LaunchKernel(
	ctx *Context,
	co *insts.HsaCo,
	gridSize [3]uint32,
	wgSize [3]uint16,
	kernelArgs interface{},
)
```

The first argument is the context of the kernel. The context carries information about the process ID and the selected device. Then, the second argument is an HSACO object. HSACO stands for HSA Code Object. An HSACO is a binary object that contains the GPU instruction to be executed. 

The third and the fourth argument are the grid size and the work group size. Here, we follow the OpenCL convention, where the gridSize represents the number of threads (rather than the number of blocks, as seen in CUDA convention) in each dimension. MGPUSim does not require the grid size to be a multiple of the block size (represented by wgSize argument) by supporting partial blocks. 

The last argument is the kernel arguments. Users should define a struct for the kernel to launch. Suppose we have the OpenCL kernel is written as the code below. 

```c
__kernel void PageRankUpdateGpu(uint num_rows, __global uint* rowOffset,
                                __global uint* col, __global float* val,
                                __local float* vals, __global float* x,
                                __global float* y) {
```

The struct that carries the argument should be defined as below.

```go
type KernelArgs struct {
	NumRows   uint32
	Padding   uint32
	RowOffset driver.Ptr
	Col       driver.Ptr
	Val       driver.Ptr
	Vals      driver.LocalPtr
	Padding2  uint32
	X         driver.Ptr
	Y         driver.Ptr
	HiddenGlobalOffsetX int64
	HiddenGlobalOffsetY int64
	HiddenGlobalOffsetZ int64
}
```

Here are a few rules of defining the entries. 

1. If the original argument is a scalar value, use the closest type in Go. Types without explicitly specifying bit-length should be avoided. 
2. If the original argument is a global pointer, use `driver.Ptr` type, which is an 8-byte address. 
3. If the original argument is a local pointer, use `driver.LocalPtr` type. The `driver.LocalPtr` type is 4 byte long. When calling the kernel, set the `driver.LocalPtr` to  the size that needs to be allocated, rather than an address. The driver will make proper allocation and convert it to address. 
4. Every field should by 8-bit aligned. If it is not, add padding fields. 
5. It is recommended to add the `HiddenGlobalOffset[X][Y][Z]` fields at the end. The ROCm OpenCL compiler adds these fields. Most likely, we want them to be set to 0 when the kernel launches. But we will demonstrate how to leverage these fields to support multi-GPU programming easily. These fields also need to be 8-byte aligned. 

Other than the `LaunchKernel` API, MGPUSim also provides a `EnqueueLaunchKernel` API for asynchronous kernel launching. It requires an extra command queue argument to specify which command queue the kernel should be enqueued. 

## Benchmark Example

Let’s use the ReLU benchmark to demonstrate how we can define a benchmark for MGPUSim. We first introduce how the benchmark can be implemented for single GPU platforms, before expanding it for multiple GPUs. 

**Prepare the kernel.** In this example, we use the GPU to perform the ReLU algorithm on an array of single-precision floating-point data. The kernel source code is straightforward (listed below). 

```c
__kernel void ReLUForward(
	const int count, 
	__global float* in, 
	__global float* out
) {
  int index = get_global_id(0);
  
  if(index < count) {
    out[index] = in[index] > 0? in[index]:0;
  }
}
```

We compile the kernel with the ROCm’s OpenCL compiler, using the following command. 

```bash
clang-ocl -mcpu=gfx803 kernels.cl -o kernels.hsaco
```

Here, `gfx803` is the instruction set architecture (ISA) that Akita GCN3 supports. In case you want to dump the human-readable assembly, you can slightly change the command above to:

```bash
clang-ocl -mcpu=gfx803 kernels.cl -S -o kernels.asm
```

**Single-GPU program.** In the benchmark’s Go code, we first define a struct for the Benchmark using the code below. The struct holds all the necessary dependencies and state information.

```go
type Benchmark struct {
	driver  *driver.Driver
	context *driver.Context
	gpus    []int
	hsaco   *insts.HsaCo

	Length      int
	inputData   []float32
	outputData  []float32
	gInputData  driver.Ptr
	gOutputData driver.Ptr

	useUnifiedMemory bool
}
```

To load the HSACO from the file, we use the file embedding feature of Go, so that the binary file does not need to be carried with the simulator executable. 

```go
//go:embed kernels.hsaco
var hsacoBytes []byte
```

Next, in the constructor of the benchmark, we use the driver instance to create a context and also parse the HSACO file to an HSACO object. 

```go
// NewBenchmark returns a benchmark
func NewBenchmark(driver *driver.Driver) *Benchmark {
	b := new(Benchmark)

	b.driver = driver
	b.context = driver.Init()
	b.hsaco = kernels.LoadProgramFromMemory(hsacoBytes, "ReLUForward")

	return b
}
```

For the methods of the benchmark, we first define the `initMem` method to allocate memory for the GPU program. 

```go
func (b *Benchmark) initMem() {
  // Allocate memory
  b.gInputData = b.driver.AllocateMemory(b.context, uint64(b.Length*4))
  b.gOutputData = b.driver.AllocateMemory(b.context, uint64(b.Length*4))
	
	// Initialize the memory on the CPU side. 
	b.inputData = make([]float32, b.Length)
	b.outputData = make([]float32, b.Length)
	for i := 0; i < b.Length; i++ {
		b.inputData[i] = float32(i) - 0.5
	}

  // Copy the input data from the host to device. 
	b.driver.MemCopyH2D(b.context, b.gInputData, b.inputData)
}

```

In this example, we use the driver to allocate memory on GPU, using the `AllocateMemory` method. The context provides necessary information for the thread to execute. The amount of data to allocate is `b.Length * 4`. Here, 4 is the size of a single-precision floating-point number. After initializing the data using the for loop, we use `MemCopyH2D` to copy data from the CPU to the GPU.

Next, we define the `exec` function which describes how the benchmark program executes. To execute the kernel, we set the kernel arguments by filling the `KernelArgs` struct, before launching the kernel. We use one thread to process one data point and set the block size to 64. Since the ReLU kernel is 1D, we set the Y and Z dimension with size 1. 

Finally, we copy the results back from the the GPU to the CPU, with the `MemCopyD2H` API.

```go
func (b *Benchmark) exec() {
	kernArg := KernelArgs{
		uint32(b.Length), 0,
		b.gInputData, b.gOutputData,
		0, 0, 0,
	}

	b.driver.LaunchKernel(
		b.hsaco,
		[3]uint32{uint32(b.Length), 1, 1},
		[3]uint16{64, 1, 1},
		&kernArg,
	)
	
	b.driver.MemCopyD2H(b.context, b.outputData, b.gOutputData)
}
```

**Extend the program to multi-GPU platforms**. Supporting multi-GPU calculation needs us to update the host code with a more sophisticated memory management and kernel launching scheme. 

In the `initMem` method, we add a code block that distribute the memory to multiple GPUs. The `Distribute` API will evenly split the buffers and send them to all the selected GPUs. If another distribution scheme is desired, users can use the `Remap` API to create more precise distribution.

```go
func (b *Benchmark) initMem() {
  // Allocate memory
  b.gInputData = b.driver.AllocateMemory(b.context, uint64(b.Length*4))
  b.gOutputData = b.driver.AllocateMemory(b.context, uint64(b.Length*4))
  
  // Distribute the memory to multiple GPUs
  b.driver.Distribute(b.context, b.gInputData, uint64(b.Length*4), b.gpus)
  b.driver.Distribute(b.context, b.gOutputData, uint64(b.Length*4), b.gpus)
	
	// Initialize the memory on the CPU side. 
	b.inputData = make([]float32, b.Length)
	b.outputData = make([]float32, b.Length)
	for i := 0; i < b.Length; i++ {
		b.inputData[i] = float32(i) - 0.5
	}

  // Copy the input data from the host to device. 
	b.driver.MemCopyH2D(b.context, b.gInputData, b.inputData)
}

```

Next, let’s take a look at how to update the kernel launching process for multi-GPU platforms. We first create an empty list of Command Queues. Then, we start to iterate through the GPUs. In each iteration, we first select the GPU to use, before creating a Command Queue for the GPU. The created Command Queue is added to the list of Command Queues. 

We calculate the number of threads that needs to be executed in the line `numWI := b.Length / len(b.gpus)`. Since the kernel is define to process one data point with one thread, `b.Length` is the total number of threads. We evenly distribute the thread to each GPU. So the `numWI` field holds the number of thread that needs to be executed in each GPU. 

Then, we set the kernel argument. We want to highlight the field `int64(numWI * i)`. This value feeds the `HiddenOffsetX` field, indicating the kernel launch does not start from thread 0, but the given offset. Suppose there are 4000 threads, then the first GPU will start from 0, the second will start from 1000, and so on. Leveraging the `HiddenOffsetX` field, we can easily support multi-GPU programming without modifying the GPU kernel. 

```go
func (b *Benchmark) exec() {
	queues := make([]*driver.CommandQueue, len(b.gpus))

	for i, gpu := range b.gpus {
		b.driver.SelectGPU(b.context, gpu)
		q := b.driver.CreateCommandQueue(b.context)
		queues[i] = q

		numWI := b.Length / len(b.gpus)

		kernArg := KernelArgs{
			uint32(b.Length), 0,
			b.gInputData, b.gOutputData,
			int64(numWI * i), 0, 0,
		}

		b.driver.EnqueueLaunchKernel(
			q,
			b.hsaco,
			[3]uint32{uint32(numWI), 1, 1},
			[3]uint16{64, 1, 1},
			&kernArg,
		)
	}

	for _, q := range queues {
		b.driver.DrainCommandQueue(q)
	}

	b.driver.MemCopyD2H(b.context, b.outputData, b.gOutputData)
}
```

After launching all the kernels to all the GPUs, we use another loop to drain all the Command Queues. After this function is called, all the kernels are completed with their execution. Then, it is safe to copy the memory back to the CPU. Even if the memory is distributed to multiple GPUs, the API is smart enough to bring all the data back. 

## Compile a Kernel

[Metrics Collection](MGPUSim%20Preparing%20New%20Experiments%209b85ee8759064ddab8f0b745bab97057/Metrics%20Collection%209a55a9068afb4cd2a92af0b90e23d5da.md)