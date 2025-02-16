# Discarded

# How to write a typical GPU program?

When writing a GPU program, you can now typically use standard programming languages such as C, Go, or Python. This is often the case when working with tools like TensorFlow or PyTorch while utilizing a GPU. This is made possible by leveraging NVIDIA's or AMD's libraries, which hide the complexities of GPU implementation behind the scenes.

However, to gain a deeper understanding of how a GPU functions, you should be able to write a GPU program on your own. Instead, you often have to rely on vendor-provided frameworks. One such well-known framework is CUDA, which allows for GPU programming using an extended version of the C programming language.

CUDA is an NVIDIA programming framework, the whole ecosystem of GPU development. Meanwhile, AMD also has an counterpart that is called OpenCL, which was deprecated by Apple before. OpenCL is not only used for GPU but also for FPGA, which makes the language very verbose and hard to use. Thus, AMD later came up with a language called HIP, quite similar to CUDA that can both run on Nvidia and AMD. Besides, Apple also has its framework metal that is only well integrated with the apple hardware, where most of developers will not use. HIP, similar to CUDA will be mostly discussed here.

HIP or CUDA is basically considered as two parts: Runtime library(Interface) and Programming Language. Runtime library is mainly used for CPU to control the GPU to allocate memory or copy memory from CPU to GPU or from GPU to CPU. Programming language, similar to C, is designed for GPU to run a program utilizing thousands of cores that are available on a GPU. Let us take vector add using pseudo codes as an example.

Vector Add:

```latex
$ \hat{C} = \hat{A} + \hat{B} $
```

Elements with the same corresponding index will be added together. So, the summation of elements with different index are independent from each other. Since they are independent, you can run them in parallel, which is super suitable for GPU to program. And, this kind of workload is also called embarrassingly parallel workload.

Then, let’s see how we typically implement such program. Firstly, we need to include header files and define constants such as

```cpp
# include <hip/hip.runtime.h>
# define N 1000000
```

.Then, we need to define vectors through malloc and hipMalloc operations to allocate memory on both CPU and GPU, such as 

```cpp
float h_a, h_b, h_c;
h_a = malloc(N*sizeof(float))
h_b = malloc(N*sizeof(float))
h_c = malloc(N*sizeof(float))
float d_a*;
hipmalloc(&d_a, N*sizeof(float))
hipmalloc(&d_b, N*sizeof(float))
hipmalloc(&d_c, N*sizeof(float)
```

As GPU works as slave of CPU and CPU can not access the data buffer on GPU side directly, data on CPU side should be copied to the GPU side at first, with operations such as

```cpp
hipMemcpyHtoD(d_a, a, N*sizeof(float))
hipMemcpyHtoD(d_b, b, N*sizeof(float))
hipMemcpyHtoD(d_c, c, N*sizeof(float)
```

Then, we need to call kernel function to execute the vector add. A GPU program is called a kernel function. Every time we start a GPU program from the GPU side, we can say we are launching a kernel.

```cpp
# Kernel launching
// N threads
// block_size: 256
// grid_size: N/256 -> (N-1)/256 + 1
vector_add<<<#1, #2>>>(d_a, d_b ,d_c,N) 
// vector_add<<<grid_size, block_size>>>(d_a, d_b ,d_c,N)
```

In the previous kernel part, we need to define how many threads we want to use and what is the responsibility of each thread. In this example, as elements with corresponding the same index added together is independent, we basically want each thread to only calculate one summation. In total, we need N threads to finish N summations. 

Now, let’s dive in details of setting the parameters. Firstly, it is block, a group of threads (like 256 threads), which is always scheduled together. And, threads in a block can communicate with each other. Outside the structure of block, there is no standard or easy way to communicate. Secondly, we need to determine grid size. The grid size is the number of blocks that we want to launch. We can set it by $N/256$. Now, we met a minor problem. If N is not a multiplier of 256, then we may not able to get the right number of grids by integer division as it was rounded down. Then, we probably use $(N-1)/256 + 1$ to ensure the number is correct. 

After setting these parameters, we can run the kernel with these parameters. Every kernel launch by default is an asynchronous execution, which means CPU execution is not waiting for this GPU function to return. So, what if we want to wait for the GPU to complete? We can use instructions as

```cpp
hipDeviceSynchronize(); // Waiting for all GPU kernels to finish
hipMemcpyDtoH(c, d_c, N*sizeof(float))
```

In the end, we need to free up the gpu memory.

Now, we know the whole process how GPU runs kernels, but vector add is still not implemented yet. To implement a kernel function that run on GPU gpu side, we need a specifier ___global___, like

```cpp
__global__ void vector_add(float *a, float *b, float *c, int N){
}
```

If we program on CPU, the program will be executed by a thread. And it is the same for programing on GPU. Each GPU thread will execute the vector_add function function. The only difference is that these threads should take different actions, such as thread one will sum up a_1 and b_1 while thread two will sum up a_2 and b_2. To make it happen, each thread should know its index and do boundary check to ensure actions are taken on desired elements. It can be:

```cpp
__global__ void vector_add(float *a, float *b, float *c, int N)
{
int gid = blockIdx_x * blockDim_x + threadIdx.x;
if (gid > N){
	return;
}
C[gid] = a[gid] + b[gid[
return;
}
```

# Driver API in MGPUSIMs

# Driver Component

The driver is actually a componenet. As a component, the driver maintains a large number of queues. In the queues, there are lots of tasks, such as memory coy, kernel and so on. The driver only has one port called GPU port. The reason why driver has only one port is because driver is where the program initiates. And, when we run our program, the program will run the driver API, then, the driver will inject all these tasks into queues. The driver will transform these queued tasks into GPU commands and send them to the command processor part of GPU to execute.

## Driver-Engine Interaction

---

## Memory Management in Driver

Before talking about memory management, we need to know what is virtual memory. Virtual memory uses hard drive as memory spill. It means when your memory can not allocate some part of memory any more, some part of the data will be moved to the hardware and accessed with virtual address. This feature was also used in memory management driver. Suppose that you want to implemente a vector_add function and you defined float *a as a pointer, which should be stored in your register. But it is actually difficult for you to tell where it is actually located. It can be on your hard drive or your memory. To solve this problem, computer scientists added an indirection layer through creating a table mapping virtual address to physical address. So, every time we want to access one piece of data, we will search the table to find the physical address. Now, threads organized by the same process share the same virtual address space to access data. But, threads from different processes can not have access to each other’s data.

---

# Chain of Responsibility - A software pattern

The chain of Responsibility is a pattern that is a particular way to implement to fulfill the principles that allows you to extend or change your features without modifying your existed code. In a more familiar way, it was also called middleware that is used in web development more frequently. MIddleware is usually used in the server part that handles differnet types of HTTP Response and direct them to different destinations instead of designing a larger server class to handle everything without any scalabitlity. Besides, not only one middlewares can exist in one server. Multiple middlewares can be organized in a hierachical way. For example, the middleware 1 is responsible for authentication and can returns the response directly to the user if the authentication is not correct. However, If the HTTP request passed the middleware 1, the request will be passed to the middleware 2 and it keeps passing until the request is responsed. This middleware design actually spearate the configuration with your implementation that developers only need to care about implementing each individual middleware and don’t need to worry too much about how these middlewares are combined together eventually for deployment.  

In the design of driver, it already ensembles the middleware design. taking memory copy as an example. when we are using memory copy command, we want to copy data from CPU to GPU or from GPU to CPU. However, if we design simulators to simulate this process, we have two options. They are actual memory copy and magic memory copy. The difference between magic copy and actual copy is that magic copy do not model the time of moving data from CPU ot GPU and assume the data is already ready on our desired place. We use magic copy because we may don’t care about execution time, which may takes a long while. 

But, what if we want to change between actual memory and magic memory? There is actually a driver middleware that can do this. In general, driver middleware can do two things, including processing commands and processing driver-GPU communication. Driver maintains several command queues and send the commands to middleware, such as memory copy middleware o kernel middleware. Then, these middlewares will see whether they can process the input request or not and then send the request to the GPU to process or pass to another middleware. 

This architectural design offers several benefits. Firstly, it splits large classes into smaller ones, which obeys the single responsibility principle. Secondly, we can replace the middleware to use at configuration or run time, such as default memory copy middleware and magic memory copy middleware both taking care of requests from command queues and responses from the GPU side.

Now, let’s dive into details about the implementation of the middleware. The middleware contains two functions ```ProcessCommand``` and ```Tick``` functions, as shown in the figure.

```cpp
type Middleware interface {
	ProcessCommand(
		now sim.VTimeInSec,
		cmd Command,
		queue *CommandQueue,
	) (processed bool)
	Tick(now sim.VTimeInSec) (madeProgress bool)
}
```

ProcessCommand is the function we use to process commands and the tick function is responsible for checking the data, the responses that are returned from the GPU to see if some requests are completed or not.

```cpp
// File: memorycopy.go
// defaultMemoryCopyMiddleware handles memory copy commands and related
// communication.
type defaultMemoryCopyMiddleware struct {
	driver *Driver
}

func (m *defaultMemoryCopyMiddleware) ProcessCommand(
	now sim.VTimeInSec,
	cmd Command,
	queue *CommandQueue,
) (processed bool) {
	switch cmd := cmd.(type) {
	case *MemCopyH2DCommand:
		return m.processMemCopyH2DCommand(now, cmd, queue)
	case *MemCopyD2HCommand:
		return m.processMemCopyD2HCommand(now, cmd, queue)
	// No default
	}

	return false
}
```

From this part of code, we can see that there is a switch operation without default option. This means that this driver can only process memory copy from host to device and device to the host. If there is other command like kernel command, this driver can not solve that. And this kernel command will be passed to another middleware to solve. Now, let’s take a furthr look on how processMemCopyH2DCommand is implemented

```cpp
// memorycopy.go
func (m *defaultMemoryCopyMiddleware) processMemCopyH2DCommand(
	now sim.VTimeInSec,
	cmd *MemCopyH2DCommand,
	queue *CommandQueue,
) bool {
	if m.needFlushing(queue.Context, cmd.Dst, uint64(binary.Size(cmd.Src))) {
		m.sendFlushRequest(now, cmd)
	}

	buffer := bytes.NewBuffer(nil)
	err := binary.Write(buffer, binary.LittleEndian, cmd.Src)
	if err != nil {
		panic(err)
	}
	rawBytes := buffer.Bytes()

	offset := uint64(0)
	addr := uint64(cmd.Dst)
	sizeLeft := uint64(len(rawBytes))
	for sizeLeft > 0 {
		page, found := m.driver.pageTable.Find(queue.Context.pid, addr)
		if !found {
			panic("page not found")
		}

		pAddr := page.PAddr + (addr - page.VAddr)
		sizeLeftInPage := page.PageSize - (addr - page.VAddr)
		sizeToCopy := sizeLeftInPage
		if sizeLeft < sizeLeftInPage {
			sizeToCopy = sizeLeft
		}

		gpuID := m.driver.memAllocator.GetDeviceIDByPAddr(pAddr)
		req := protocol.NewMemCopyH2DReq(now,
			m.driver.gpuPort, m.driver.GPUs[gpuID-1],
			rawBytes[offset:offset+sizeToCopy],
			pAddr)
		cmd.Reqs = append(cmd.Reqs, req)
		m.driver.requestsToSend = append(m.driver.requestsToSend, req)

		sizeLeft -= sizeToCopy
		addr += sizeToCopy
		offset += sizeToCopy

		m.driver.logTaskToGPUInitiate(now, cmd, req)
	}

	queue.IsRunning = true

	return true
}
```

Firstly, we need to serialize the data that we want to pass. By default we serialize the data in a littleEndian way, which stores the lower address first and then store higher address. After serialization, we need to find the page to store the data according to the page tabel. The page table will takes pid and virtual address as input and output the physical address of the page. with this physical address and offset information, we can locate the page, move to the offset place and write data. After finding out which GPU wants the data through getdeviceIDByAddr, we need to send a memorycopyH2DReq to the GPU. 

Meanwhile, let’s take a look at how magic meory copy was implemented here.

```cpp
// File:memorycopyglobalstorage.go
func (m *globalStorageMemoryCopyMiddleware) processMemCopyH2DCommand(
	now sim.VTimeInSec,
	cmd *MemCopyH2DCommand,
	queue *CommandQueue,
) bool {
	buffer := bytes.NewBuffer(nil)
	err := binary.Write(buffer, binary.LittleEndian, cmd.Src)
	if err != nil {
		panic(err)
	}
	rawBytes := buffer.Bytes()

	offset := uint64(0)
	addr := uint64(cmd.Dst)
	sizeLeft := uint64(len(rawBytes))
	for sizeLeft > 0 {
		page, found := m.driver.pageTable.Find(queue.Context.pid, addr)
		if !found {
			panic("page not found")
		}

		pAddr := page.PAddr + (addr - page.VAddr)
		sizeLeftInPage := page.PageSize - (addr - page.VAddr)
		sizeToCopy := sizeLeftInPage
		if sizeLeft < sizeLeftInPage {
			sizeToCopy = sizeLeft
		}

		m.driver.globalStorage.Write(pAddr, rawBytes[offset:offset+sizeToCopy])

		sizeLeft -= sizeToCopy
		addr += sizeToCopy
		offset += sizeToCopy
	}

	queue.IsRunning = false
	queue.Dequeue()

	return true
}
```

Similarly, we need to do serialization at first. Then, we need to conduct page-by-page copy with address translation and calculating offset. But, the different part here is that we do not create request. Instead, we directly write to the global storage, which completes immediately.

## Simulation and Emulation

The difference underlying the concept of actual memorycopy and magic memorycopy is actually the difference between simulation and emulation. Simulation is also called detailed timing simulation and emulation is called functional emulation. The goal of emulation is to recreate real hardware output and do not care execution time. However, the goal of simulation is the opposite. The simulation only cares about time required but not the execution result. But, we can not do simulation without emulation, because msot simulation process are data dependent. For example, if we do matrix multiplication, the actual size of the matrixes are values that are stored in the memory. And, the size of the matrix changes the simulation time. So, we need to run emulation to realize how many instructions are executed and what is the order of the memory accesses. Due to these reason, every time we run a simulation, we need to run a emulation. 

Taking GPGPUSim, the most popular GPU simulator as example. The core will send request to access the memory and calculate the time between the request was sent and the response is received. But, the response actually does not carry any data as the core is only care about simulation or time performance. Then, if the core wants to access the data, it has backdoor to directly access the memory without data simulation. 

However, for the design of MGPUSim, the response both carries address and data. The pros are that it is more rigorous since errors happend in cache can be detected and reported from the execution result. The second benefit is the capability of modeling reliability. For example, it is possible for registers heated by high energy particles encounter bit flip problem, also called soft error. So, with the rigorous design, MGPUSim can detect it, while the GPGPUSim can not. Of course, there are also cons. First of all, it is much harder to develop, since we need to make everything correct in each step, which is error-prone.

Moreover, there are different ways of integration of simulation and emulation. For example, storage is an emulation concept, since you can directly read and write with storage without any delay. In par, we have DRAM Controller and caches as a variable in a component. Similarly, we have the concept of page table in emulation and MMU/ TLB in simulation. ALU and CU are also concepts from emulation and timing simultion. ALU can execute instructions without any delay but CU will take delay into consideration. In general, timing simulation should be dependent on emulation and the emulation concept should be independent by itself. For example, giving an instruction to ALU, the ALU should just emulate execution result for that instruction. For emulation itself, there should also be a very clear boundary between those emulation elements, and they should not talk to each other.