---
sidebar_position: 2
---


# Command Line Arguments

Most of the benchmarks in the `samples` directory have similar command line arguments. Overall, we follow the Go's command line argument convention, where each argument are lead by a single dash. Values of the argument can be either separated by a space or a equal sign. Users can use `-h` to get help information. The arguments are mainly divided into the following categories:

* Simulation arguments:
    * `-timing`: Enable detailed timing simulation.
    * `-parallel`: Enable parallel simulation (not recommended).
    * `-magic-memory-copy`: Do not simulate the memory copy process. All the memory copy are completed without taking virtual time. 
    * `-debug-isa`: Dump a file that records the execution of the GPU instructions and the corresponding hardware state after the execution of each instruction.
    * `-trace-vis`: Collect very detailed traces of the GPU execution. The visualization traces can be examined with Daisen. 
    * `-verify`: Run the execution again in the simulator to verify if the execution is correct. Most benchmarks, but not all, support this argument. This benchmark cannot be used together with `-magic-memory-copy`. 
  
* Hardware-related arguments:
    * `-gpus`: Specify the GPUs to be used by the benchmark. Note that not all the benchmark support real multi-GPU execution. For example, if 4 GPUs wants to be used, the argument should be `-gpus=1,2,3,4`. Note that the GPU ID starts from 1, as device ID 0 is reserved for the host CPU.
    * `-unified-gpus`: Specify the GPUs to be used by the benchmark. This is different from the `-gpus` argument. With unified GPUs, the driver will create a virtual GPU interface that represent all the physical GPUs specified in the list. The workload will feel like it is running on a single GPU. The driver will split the kernel into sub-kernels and execute them on the physical GPUs. All benchmarks support this argument.
* Metrics-related arguments:
	* `-report-all`: Report all the performance metrics. By default, only the total execution time and each GPU's kernel execution time are reported. The `-report-all` argument enables hardware performance metrics (e.g, cache hit rate).
	* `-report-busy-time`: Report the time that each SIMD unit is being used. This can be used to calculate GPU ALU utilization.
	* `-report-cache-hit-rate`: Report the number of transactions that hit and miss in each cache. Note that we separate read and write operations. Also, we include a special class named as MSHR hit, which generally should be considered as a miss, but the performance impact is not as high as regular misses. 
	* `-report-cache-latency`: Report the average access latency at each cache unit. 
	* `-report-cpi-stack`: Report the CPI stack recorded from each compute unit.
	* `-report-dram-transaction-count`: Report the number of transactions that hit the memory controllers. 
	* `-report-inst-count`: Report the number of instructions executed by each compute unit. 
	* `-report-rdma-transaction-count`: Report the number of transactions that hit the RDMA controllers (inter-GPU cache-line level memory access).
	* `-report-tlb-hit-rate`: Report the number of transactions that hit and miss in each TLB. Similar to cache hit rate, we also report MSHR hit as a special class. 
* Benchmark-specific arguments:
    These arguments are specific to each benchmark. For example, many benchmark has the `-length` argument to specify the length of the input data.