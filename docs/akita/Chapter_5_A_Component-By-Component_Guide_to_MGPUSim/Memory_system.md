# Memory system

## Coherency

MGPUSim does not keep coherence, which is not a missing feature, but is because GPUs do not need coherence. 

Since L2 caches are memory-side caches, a piece of data will never appear in two L2 caches. Each L2 cache is mapped to a range of memory, so the address of the cache line determines on which L2 cache it should appear. This rule applies to both single-GPU and multi-GPU environments.

For L1 caches, this problem is more realistic as a piece of data can present in multiple L1 caches at the same time. But L1 caches are write-through caches. So, all the writers will write to both L1 and L2 caches at the same time. If another CU needs to read the data, they read directly from the L2 cache and have the updated data, mitigating the coherency problem. However, using write-through caches cannot fully solve the problem. It is still possible that two L1 caches have the same data; one CU writes it to update, and the other CU reads the stale data (let’s call this one-write-one-read). 

To better understand why not supporting coherence is not a problem for MGPUSim, we need to first understand the GPU programming model. GPU programs are typically written in a style where each thread is responsible for generating part of the results. The results generated from each thread should not overlap. Also, the results written into the main memory should never be consumed (read) by another thread within the same kernel. Violating these rules causes wrong or undefined behavior. In case a GPU thread needs the data written from another thread, the only solution is to use atomic instructions or start another kernel.

Following the rules above, the one-write-one-read problem never happens within the same kernel. If it happens, the results are undefined in both real GPU environments and in MGPUSim. We only need to consider the one-write-one-read problem across kernels. MGPUSim's solution is to flush L1 (invalidate all) caches at kernel boundaries. So at the beginning of a kernel, all the memory reads are issued to the L2 caches, ensuring they fetch the updated data. For now, we do not support atomic instructions.