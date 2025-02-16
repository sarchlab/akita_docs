# CPI Stack

**Author: Yifan Sun, Zoha Peterson**

Cycle-Per-Instruction (CPI) is a crucial metric for evaluating the performance of a program running on hardware. If the program has a fixed number of instructions, fewer cycles used to execute each instruction on average translate to better performance. Measuring CPI is usually easy: measure the overall time (in cycles) and count the instructions executed, then divide the time by the number of instructions.

CPI stack is a performance analysis tool derived from the CPI metric. As forementioned, the CPI metric is calculated by dividing the total cycle time by the number of instructions for single thread execution. A CPI stack is then created based on the stall events that are caused by each type of task. Each of these proportions then make up the entire CPI stack. The CPI stack offers a visual representation of how the resources of the CU and GPU are being spent and where there is inefficiency. 

The concept of CPI Stack is created in the single-core era, mostly utilized in the realm of the CPU. On the other hand, GPUs have thousands of threads running simultaneously and creating CPI stack faces major challenges. This poses various questions, including the following: How do we keep track of each type of instruction? If multiple instructions are executing at once, which instruction do we allocate the resources of the CU to? 

Stall Reason [1]

## CPI vs. SIMD CPI

Here, we provide a formal definition for the CPI stack portions. We consider that a piece of time is added to a portion of the CPI stack if the compute unit is not being able to do something useful (we will define what is something useful later) because of this particular reason. The only exception is the “base” portion. The base portion represents the rate that the compute unit can process the “useful” stuff. The other stacks that make up the CPI stack are where the CU has inefficiency.

We can consider two simple situations. In both situations, there are two wavefronts shares one SIMD unit.  

## CPI Stack Tracer

A particular challenge for a CPI tracer that works in MGPUSim is that MGPUSim is not a cycle-based simulator. The CPI Tracer cannot calculate cycle-by-cycle behavior of the issuer to determine… MGPUSim uses event driven simulation, meaning that the type of tasks that are being executed tracked. This offers a new perspective on how to calculate the CPI stack and in turn discover the performance statistics of the GPU. This offers a whole new perspective where a new alogrithm and program design is necessary.

## CPI Stack Tracer for the Memory System

CPI stack can help us identify the performance bottleneck of the GPU program. Since many GPU programs are bounded by the performance of the memory system, the CPI Stack Tracer should not be satisfied with only tracing types of instructions, but also how the time is spent in the memory system. For example, if a workload suffers from long virtual-to-physical address translation, we should see a big portion as either L1TLB, L2TLB, or MMU. If we do not trace the memory system, we can only see that part as “memory”, which is not providing sufficient information about why the memory access is so slow.

## References

[1] Alsop, Johnathan, Matthew D. Sinclair, Rakesh Komuravelli, and Sarita V. Adve. "GSI: A GPU stall inspector to characterize the sources of memory stalls for tightly coupled GPUs." In *2016 IEEE International Symposium on Performance Analysis of Systems and Software (ISPASS)*, pp. 172-182. IEEE, 2016.