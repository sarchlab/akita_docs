# Write-Back Cache


A **write-back cache** is a cache component that uses the write-back policy: modified (dirty) data is written to lower memory only when it is evicted. The implementation in Akita is modular, pipelined, and highly configurable.



## Architecture 

The cache is implemented by the `Comp` struct in [`writebackcache.go`](https://github.com/sarchlab/akita/blob/main/mem/cache/writeback/writebackcache.go). It exposes three external ports, organizes work into subcomponents, and connects them with internal buffers.

**Interfaces (ports):**

  - `topPort`: Receives read/write requests from upper levels and returns data ready/write done responses.
  - `bottomPort`: Issues read/write requests to lower memory/cache and receives their responses.
  - `controlPort`: Handles control traffic (pause, flush, continue).

**Subcomponents:**

  - Top Parser (`topparser.go`): Parses top-port requests and creates transactions.
  - Directory (`directorystage.go`): Looks up tags/metadata, consults MSHRs, and chooses the next action.
  - Bank (`bankstage.go`): Reads/writes the local data store. It is also responsible for responding read hit and write hit transactions (no MSHR involved).
  - Write Buffer (`writebufferstage.go`): Serves as the interface between the writeback cache and the lower memory. It accumulates dirty lines for write-back, merges writes, and issues fetches to lower memory.
  - MSHR (`mshrstage.go`): Manages outstanding misses and emits responses when data becomes available.
  - Flusher (`flusher.go`): Services flush and other control requests.

**Data-flow across subcomponents:**

  - Top parser sends transactions to the directory.
  - Directory determines the action to take and sends the transaction to the bank.
  - Banks can send transactions in three directions: 
    - Read-hit and write-hit transactions are responded through the top port  directly.
    - Anything that requires interaction with the lower memory is sent to the write buffer. 
    - Transactions, when the fetched data returns, are sent to the MSHR. 
  - The write buffer takes actions from the bank and sends them to the lower memory. The returned data from the bottom port is sent to the bank. 
  - Flusher sends control requests to the top parser. It may send actions to the bank.

**Internal buffers:**
  
  There is a list of buffers that connect the subcomponents. Transactions are stored in the buffers and waiting to be processed by the subsequent subcomponents.

  - `dirStageBuffer`: Top Parser → Directory Stage
  - `dirToBankBuffers[N]`: Directory Stage → Bank Stage[N]
  - `writeBufferToBankBuffers[N]`: Write Buffer Stage → Bank Stage[N]
  - `writeBufferBuffer`: Bank Stage → Write Buffer Stage
  - `mshrStageBuffer`: Bank Stage → MSHR Stage