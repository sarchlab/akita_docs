# Write-Back Cache Implementation Guide


## Overview

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

## Actions (Commands) per Subcomponent

Actions enum (see `transaction.go`) describes what a subcomponent should do next.

Bank Stage handles:
- `bankReadHit`, `bankWriteHit`
- `bankEvict`, `bankEvictAndFetch`, `bankEvictAndWrite`
- `bankWriteFetched`

Write Buffer Stage handles:
- `writeBufferFetch`, `writeBufferEvictAndFetch`, `writeBufferEvictAndWrite`, `writeBufferFlush`

Dispatcher examples:
```200:218:akita/mem/cache/writeback/bankstage.go
switch trans.action {
case bankReadHit: return s.finalizeReadHit(trans)
case bankWriteHit: return s.finalizeWriteHit(trans)
case bankWriteFetched: return s.finalizeBankWriteFetched(trans)
case bankEvictAndFetch, bankEvictAndWrite, bankEvict: return s.finalizeBankEviction(trans)
}
```
```31:49:akita/mem/cache/writeback/writebufferstage.go
switch trans.action {
case writeBufferFetch: return wb.processWriteBufferFetch(trans)
case writeBufferEvictAndWrite: return wb.processWriteBufferEvictAndWrite(trans)
case writeBufferEvictAndFetch: return wb.processWriteBufferFetchAndEvict(trans)
case writeBufferFlush: return wb.processWriteBufferFlush(trans, true)
}
```

## Deadlock Prevention

Two key rules:
1) Directory never pushes directly to write buffer; it pushes to bank with `writeBufferFetch` or eviction actions. Bank forwards to write buffer when safe.
2) Bank `pullFromBuf` ensures progress by:
   - Prioritizing write-buffer→bank traffic.
   - Only pulling directory fetches if `writeBufferBuffer` can accept.
   - Reserving at least one pipeline lane for up-going traffic.

Annotated code:
```148:197:akita/mem/cache/writeback/bankstage.go
if !s.pipeline.CanAccept() { return false }
// Prefer writeBuffer→bank path
trans := s.cache.writeBufferToBankBuffers[s.bankID].Pop()
if trans != nil { s.pipeline.Accept(bankPipelineElem{trans: trans.(*transaction)}); s.inflightTransCount++; return true }
// Do not jam writeBufferBuffer
if !s.cache.writeBufferBuffer.CanPush() { return false }
// Reserve one lane for up-going traffic
if s.downwardInflightTransCount >= s.pipelineWidth-1 { return false }
// Now consider directory→bank work
trans = s.cache.dirToBankBuffers[s.bankID].Pop()
if trans != nil {
  t := trans.(*transaction)
  if t.action == writeBufferFetch { s.cache.writeBufferBuffer.Push(trans); return true }
  s.pipeline.Accept(bankPipelineElem{trans: t}); s.inflightTransCount++
  switch t.action { case bankEvict, bankEvictAndFetch, bankEvictAndWrite: s.downwardInflightTransCount++ }
  return true
}
return false
```
And directory fetch routing:
```528:536:akita/mem/cache/writeback/directorystage.go
trans.action = writeBufferFetch
trans.fetchPID = pid
trans.fetchAddress = cacheLineID
bankBuf.Push(trans)
```

Why this prevents deadlock: all directory-sourced traffic is funneled through the bank which controls forwarding to the write buffer and keeps at least one lane free for responses.

## Transaction Flow (Lifecycle)

- Reads: MSHR hit → respond in MSHR stage; Directory hit → bank reads/returns; Miss → victim chosen, possibly evict, then fetch via write buffer, write to bank, and respond.
- Writes: MSHR hit → merged via write buffer then bank writes; Directory hit → bank writes; Miss → full-line may skip fetch, partial-line triggers fetch.
- Control: Flush drains inflight, enqueues evictions, completes when banks/write buffer drain; optional pause.

## Expanded Code Navigation with Annotations

- `builder.go`: `createInternalStages`, `createInternalBuffers` wire subcomponents and buffers.
- `writebackcache.go`: `middleware.runPipeline` shows execution order: MSHR → Banks → WriteBuffer → Directory → TopParser.
- `directorystage.go`: `doRead`/`doWrite`, `fetch`, `evict`.
- `bankstage.go`: `pullFromBuf` (deadlock avoidance), `finalize*` methods.
- `writebufferstage.go`: action dispatcher, `fetchFromBottom`, `processDataReadyRsp`, `combineData`.
- `mshrstage.go`: `processOneReq`, `respondRead`, `respondWrite`.
- `flusher.go`: `processPreFlushing`, `processFlush`, `finalizeFlushing`.
