---
sidebar_position: 6
---

# Page migration

## GPU-GPU page migration
In a NUMA multi-GPU system, after initially allocating data in GPUs, some data is very frequently accessed by remote GPUs. The frequently remote data accessing behavior will introduce non-negligible communication overhead and occupancy of Bandwidth resources. To address this problem, GPU-GPU page migration occurs periodically to move data to an appropriate GPU. The GPU-GPU page migration procedure can be divided into three steps: (1) preparing the page migration, (2) processing the page migration, and (3) finishing the page migration.

Assuming the data that the target GPU needs is located in the source GPU. After TLB returns the physical address, the reorder buffer(RoB) forwards this physical address to the L1 Cache to find the corresponding data. Once the L1 Cache cannot serve this data access request, the data access request will be cached in the L1 Cache's MSHR temporarily. By parsing the physical address of the data access request, if the physical address is out of the range of the local DRAM address, a far page fault occurs, and Remote Direct Memory Access(RDMA) issues this data access request to source GPU. 

The far page fault triggers a far page fault counter that will be augmented to record this far page fault. After the data access request arrives at the source GPM, the source GPM's RDMA promptly sends this request to the source GPU's L2 Cache for further search. The data access request is cached in MSHR and handled by DRAM if it cannot be found in the L2 Cache. Upon finding the corresponding data, this data is sent back to the source GPM's RDMA through the L2 Cache. Finally, the target GPU's RDMA receives this data and responds to the data access request to the L1 Cache. 

In a wafer-scale GPU, high-frequency page migration between GPUs occurs at irregular intervals will bring significant overhead due to pipeline flush and TLB shootdowns. To mitigate this, the MMU will periodically launch(e.g., 10000 cycles) a "page migration phase", during which all pending migration requests are processed in a centralized manner. In this period, the far page fault history that is recorded in the counter will be reported to the MMU. The MMU will decide to migrate the page from the source GPM to the target GPM if the page meets the page migration condition. 

After deciding which page to migrate, on the one hand, the driver will check the IOMMU to find an empty page in the target GPM to store the migrated page. On the other hand, the driver will broadcast a page locking message to all GPMs' command processors. A page locking request is sent by the command processor to let GPMs flush the migrated page to DRAM. This page is also marked as invalid to be accessed until the page migration procedure finishes. When GPMs finish the locking procedure, a message is sent back to the driver to inform the driver that the preparation step is finished. A page-moving message is sent by the driver to the source GPM, and a data-storing message is sent to the target GPM. 

After finishing the page migration preparation, source GPM's RDMA will send a write request to the target GPM with the migrated page data, including flags. The migrated page data, along with the associated flags received by the target GPM's RDMA through the on-chip network. After the target GPM stores the migrated page and associated flags, the page migration completion message is sent to notify the driver that the page migration procedure is finished.  

Upon being notified of the completion of the page migration, the driver promptly broadcasts a resume message along with the new physical address of the migrated page to all GPMs. The TLB check is performed to update the new physical address of the migrated page with the old one. Once the new physical address is updated, GPMs resume normal operation.

Before processing the page migration, the first problem that needs to be addressed is when to process the page migration. To this end, there are several page migration polices have been proposed by researchers. The on-demand page migration is widely implemented in current GPUs

## component by component development
To support page migration, the whole storage system(command processor, cache, and TLB) and driver need to be redsigned. The concrete part will be discussed in the following part.

<!-- ### TLB design -->

