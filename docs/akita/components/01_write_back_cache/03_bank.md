# Bank Stage


The bank stage executes the concrete read/write/evict operations on a cache bank after the directory stage programs a command. Each bank maintains its own small pipeline to model latency, arbitrates inputs from the directory and the write buffer, and finalizes transactions by either responding upstream or forwarding work to the write buffer.

## Tick Order and Pipeline

Each tick, the bank stage (1) finalizes ready transactions, (2) advances its internal pipeline, then (3) admits new transactions from its input buffers. This ordering frees resources before pulling new work and ensures the programmed latency is honored.

```go
func (s *bankStage) Tick() (madeProgress bool) {
    for i := 0; i < s.cache.numReqPerCycle; i++ {
        madeProgress = s.finalizeTrans() || madeProgress
    }

    madeProgress = s.pipeline.Tick() || madeProgress

    for i := 0; i < s.cache.numReqPerCycle; i++ {
        madeProgress = s.pullFromBuf() || madeProgress
    }

    return madeProgress
}
```

Transactions that complete the latency pipeline are staged in `postPipelineBuf` and are consumed by `finalizeTrans` in subsequent ticks.

## Inputs, Arbitration, and Back‑pressure

The bank arbitrates between two inputs:

- `writeBufferToBankBuffers[bankID]`: commands coming back from the write buffer (e.g., data arrived and needs to be written to the bank).
- `dirToBankBuffers[bankID]`: commands issued by the directory (e.g., read hit, write hit, eviction).

Admission is subject to pipeline capacity and back‑pressure to avoid jamming downstream buffers and to reserve bandwidth for up‑going transactions.

```go
func (s *bankStage) pullFromBuf() bool {
    if !s.pipeline.CanAccept() { return false }

    // Prefer work from the write buffer first.
    inBuf := s.cache.writeBufferToBankBuffers[s.bankID]
    if trans := inBuf.Pop(); trans != nil {
        s.pipeline.Accept(bankPipelineElem{trans: trans.(*transaction)})
        s.inflightTransCount++
        return true
    }

    // Do not jam the write-buffer's outbound queue.
    if !s.cache.writeBufferBuffer.CanPush() { return false }

	// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
	// Above processes bottom-up traffic
	// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

	// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
	// Below processes top-down traffic
	// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓

    // Reserve one lane for up-going transactions.
    if s.downwardInflightTransCount >= s.pipelineWidth-1 { return false }

    inBuf = s.cache.dirToBankBuffers[s.bankID]
    if trans := inBuf.Pop(); trans != nil {
        t := trans.(*transaction)
        if t.action == writeBufferFetch { // send down immediately
            s.cache.writeBufferBuffer.Push(trans)
            return true
        }
        s.pipeline.Accept(bankPipelineElem{trans: t})
        s.inflightTransCount++
        switch t.action { // count lanes used in downward direction
        case bankEvict, bankEvictAndFetch, bankEvictAndWrite:
            s.downwardInflightTransCount++
        }
        return true
    }
    return false
}
```

- **`inflightTransCount`**: total number of transactions currently inside the bank pipeline or waiting to finalize.
- **`downwardInflightTransCount`**: number of in‑flight transactions that will send work to the write buffer; used to reserve one pipeline lane for up‑going operations (hits that immediately respond upstream).

## Finalization Paths

After a transaction exits the latency pipeline, `finalizeTrans` selects the correct completion path based on the programmed action:

```go
switch trans.action {
case bankReadHit:
    done = s.finalizeReadHit(trans)
case bankWriteHit:
    done = s.finalizeWriteHit(trans)
case bankWriteFetched:
    done = s.finalizeBankWriteFetched(trans)
case bankEvictAndFetch, bankEvictAndWrite, bankEvict:
    done = s.finalizeBankEviction(trans)
default:
    panic("bank action not supported")
}
```

### Read Hit

On a read hit, the bank reads the requested bytes out of the block in the cache storage and directly replies upstream.

```go
func (s *bankStage) finalizeReadHit(trans *transaction) bool {
    if !s.cache.topPort.CanSend() { return false }

    read := trans.read
    _, offset := getCacheLineID(read.Address, s.cache.log2BlockSize)
    block := trans.block

    data, _ := s.cache.storage.Read(block.CacheAddress+offset, read.AccessByteSize)

    s.removeTransaction(trans)
    s.inflightTransCount--
    s.downwardInflightTransCount--
    block.ReadCount--

    rsp := mem.DataReadyRspBuilder{}.
        WithSrc(s.cache.topPort.AsRemote()).
        WithDst(read.Src).
        WithRspTo(read.ID).
        WithData(data).Build()
    s.cache.topPort.Send(rsp)
    tracing.TraceReqComplete(read, s.cache)
    return true
}
```

Key effects:

- Reads only the accessed bytes using the computed `offset` into the cache line.
- Decrements the book‑keeping counters and completes the request.

### Write Hit

On a write hit, the bank merges the incoming bytes into the cache line and marks the block dirty.

```go
func (s *bankStage) finalizeWriteHit(trans *transaction) bool {
    if !s.cache.topPort.CanSend() { return false }
    write := trans.write
    _, offset := getCacheLineID(write.Address, s.cache.log2BlockSize)

    dirtyMask := s.writeData(trans.block, write, offset)
    trans.block.IsValid = true
    trans.block.IsLocked = false
    trans.block.IsDirty = true
    trans.block.DirtyMask = dirtyMask

    s.removeTransaction(trans)
    s.inflightTransCount--
    s.downwardInflightTransCount--

    done := mem.WriteDoneRspBuilder{}.
        WithSrc(s.cache.topPort.AsRemote()).
        WithDst(write.Src).
        WithRspTo(write.ID).Build()
    s.cache.topPort.Send(done)
    tracing.TraceReqComplete(write, s.cache)
    return true
}
```

The merge is performed by `writeData`, which reads the whole line, updates the touched bytes according to the incoming `DirtyMask`, writes the full line back to storage, and returns the updated mask:

```go
func (s *bankStage) writeData(block *cache.Block, write *mem.WriteReq, offset uint64) []bool {
    data, _ := s.cache.storage.Read(block.CacheAddress, 1<<s.cache.log2BlockSize)
    dirtyMask := block.DirtyMask
    if dirtyMask == nil { dirtyMask = make([]bool, 1<<s.cache.log2BlockSize) }
    for i := 0; i < len(write.Data); i++ {
        if write.DirtyMask == nil || write.DirtyMask[i] {
            index := offset + uint64(i)
            data[index] = write.Data[i]
            dirtyMask[index] = true
        }
    }
    _ = s.cache.storage.Write(block.CacheAddress, data)
    return dirtyMask
}
```

### Write Fetched (commit fetched line)

When fetched data returns from lower memory, the write buffer routes a `bankWriteFetched` command to the owning bank. The bank writes the full line into storage, marks the block valid/unlocked, and hands the MSHR entry to the MSHR stage for request wake‑ups.

```go
func (s *bankStage) finalizeBankWriteFetched(trans *transaction) bool {
    if !s.cache.mshrStageBuffer.CanPush() { return false }

    mshrEntry := trans.mshrEntry
    block := mshrEntry.Block
    s.cache.mshrStageBuffer.Push(mshrEntry)
    _ = s.cache.storage.Write(block.CacheAddress, mshrEntry.Data)
    block.IsLocked = false
    block.IsValid = true
    s.inflightTransCount--
    return true
}
```

### Eviction Paths (forward to write buffer)

For eviction actions, the bank reads out the victim line and forwards a new command to the write buffer, transforming the action as needed. This is the only finalize path that increases traffic to the write buffer.

```go
func (s *bankStage) finalizeBankEviction(trans *transaction) bool {
    if !s.cache.writeBufferBuffer.CanPush() { return false }

    victim := trans.victim
    data, _ := s.cache.storage.Read(victim.CacheAddress, 1<<s.cache.log2BlockSize)
    trans.evictingData = data

    switch trans.action {
    case bankEvict:          trans.action = writeBufferFlush
    case bankEvictAndFetch:  trans.action = writeBufferEvictAndFetch
    case bankEvictAndWrite:  trans.action = writeBufferEvictAndWrite
    default: panic("unsupported action")
    }

    delete(s.cache.evictingList, trans.evictingAddr)
    s.cache.writeBufferBuffer.Push(trans)
    s.inflightTransCount--
    s.downwardInflightTransCount--
    return true
}
```

## Transaction Book‑keeping and Hooks

- The bank removes finished transactions from the global `inFlightTransactions` list:

```go
func (s *bankStage) removeTransaction(trans *transaction) { /* … */ }
```

- The lightweight `bufferImpl` used by the stage supports hooks that fire on `Push`, `Pop`, and `Remove`, enabling data collection without perturbing logic.

```go
type bufferImpl struct { sim.HookableBase; /* … */ }
```

Each pipeline element is tagged with a stable task ID to support tracing:

```go
func (e bankPipelineElem) TaskID() string {
    return e.trans.req().Meta().ID + "_write_back_bank_pipeline"
}
```

## Reset Semantics

The bank can be reset to a clean state between simulations or when clearing state in testing.

```go
func (s *bankStage) Reset() {
    s.cache.dirToBankBuffers[s.bankID].Clear()
    s.pipeline.Clear()
    s.postPipelineBuf.Clear()
    s.inflightTransCount = 0
}
```

This drains all stage‑local buffers and resets counters, while global structures (e.g., directory, write buffer) remain intact.
