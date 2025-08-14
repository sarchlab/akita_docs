# Write Buffer Stage

The write buffer stage mediates between banks and the lower memory system. It buffers evictions, issues reads for fetches, coalesces returned data with pending writes, and forwards completed lines back to the owning bank. It enforces capacity and in‑flight limits to model realistic back‑pressure.

## Data Structures and Limits

The stage maintains three queues and several limits:

- `pendingEvictions`: evictions queued to be written to lower memory
- `inflightFetch`: outstanding fetch reads to lower memory
- `inflightEviction`: outstanding eviction writes to lower memory
- `writeBufferCapacity`: maximum number of entries across `pendingEvictions` and `inflightEviction`
- `maxInflightFetch`, `maxInflightEviction`: per‑type concurrency limits

## Tick Order

Each tick, the write buffer:

```go
func (wb *writeBufferStage) Tick() bool {
    madeProgress := false
    madeProgress = wb.write() || madeProgress
    madeProgress = wb.processReturnRsp() || madeProgress
    madeProgress = wb.processNewTransaction() || madeProgress
    return madeProgress
}
```

1) advances eviction writes first, 2) handles any bottom responses, then 3) accepts new work from banks.

## Accepting New Transactions

New commands arrive via `writeBufferBuffer`. The stage peeks the head item and dispatches by action:

```go
func (wb *writeBufferStage) processNewTransaction() bool {
    item := wb.cache.writeBufferBuffer.Peek()
    if item == nil { return false }
    trans := item.(*transaction)
    switch trans.action {
    case writeBufferFetch:
        return wb.processWriteBufferFetch(trans)
    case writeBufferEvictAndWrite:
        return wb.processWriteBufferEvictAndWrite(trans)
    case writeBufferEvictAndFetch:
        return wb.processWriteBufferFetchAndEvict(trans)
    case writeBufferFlush:
        return wb.processWriteBufferFlush(trans, true)
    default:
        panic("unknown transaction action")
    }
}
```

### Fetch Path

For `writeBufferFetch`, the stage first tries to find the needed data locally from evictions of the same line (write‑allocate hit in the buffer). Otherwise it issues a read to lower memory.

```go
func (wb *writeBufferStage) processWriteBufferFetch(trans *transaction) bool {
    if wb.findDataLocally(trans) {
        return wb.sendFetchedDataToBank(trans)
    }
    return wb.fetchFromBottom(trans)
}

func (wb *writeBufferStage) findDataLocally(trans *transaction) bool {
    for _, e := range wb.inflightEviction {
        if e.evictingAddr == trans.fetchAddress {
            trans.fetchedData = e.evictingData
            return true
        }
    }
    for _, e := range wb.pendingEvictions {
        if e.evictingAddr == trans.fetchAddress {
            trans.fetchedData = e.evictingData
            return true
        }
    }
    return false
}
```

If data is found locally, the stage prepares a `bankWriteFetched` for the owning bank, merges pending writes via the MSHR entry, and removes the MSHR entry (the line is now present in the bank):

```go
func (wb *writeBufferStage) sendFetchedDataToBank(trans *transaction) bool {
    bankNum := bankID(trans.block, wb.cache.directory.WayAssociativity(), len(wb.cache.dirToBankBuffers))
    bankBuf := wb.cache.writeBufferToBankBuffers[bankNum]
    if !bankBuf.CanPush() { trans.fetchedData = nil; return false }

    trans.mshrEntry.Data = trans.fetchedData
    trans.action = bankWriteFetched
    wb.combineData(trans.mshrEntry)
    wb.cache.mshr.Remove(trans.mshrEntry.PID, trans.mshrEntry.Address)

    bankBuf.Push(trans)
    wb.cache.writeBufferBuffer.Pop()
    return true
}
```

Otherwise the stage issues a read to lower memory, respecting in‑flight limits and port availability:

```go
func (wb *writeBufferStage) fetchFromBottom(trans *transaction) bool {
    if wb.tooManyInflightFetches() { return false }
    if !wb.cache.bottomPort.CanSend() { return false }

    low := wb.cache.addressToPortMapper.Find(trans.fetchAddress)
    read := mem.ReadReqBuilder{}.
        WithSrc(wb.cache.bottomPort.AsRemote()).
        WithDst(low).
        WithPID(trans.fetchPID).
        WithAddress(trans.fetchAddress).
        WithByteSize(1 << wb.cache.log2BlockSize).Build()
    wb.cache.bottomPort.Send(read)

    trans.fetchReadReq = read
    wb.inflightFetch = append(wb.inflightFetch, trans)
    wb.cache.writeBufferBuffer.Pop()

    tracing.TraceReqInitiate(read, wb.cache, tracing.MsgIDAtReceiver(trans.req(), wb.cache))
    return true
}
```

When the read completes, the data is forwarded to the bank and the MSHR is merged and removed:

```go
func (wb *writeBufferStage) processDataReadyRsp(dataReady *mem.DataReadyRsp) bool {
    trans := wb.findInflightFetchByFetchReadReqID(dataReady.RespondTo)
    bankIndex := bankID(trans.block, wb.cache.directory.WayAssociativity(), len(wb.cache.dirToBankBuffers))
    bankBuf := wb.cache.writeBufferToBankBuffers[bankIndex]
    if !bankBuf.CanPush() { return false }

    trans.fetchedData = dataReady.Data
    trans.action = bankWriteFetched
    trans.mshrEntry.Data = dataReady.Data
    wb.combineData(trans.mshrEntry)
    wb.cache.mshr.Remove(trans.mshrEntry.PID, trans.mshrEntry.Address)

    bankBuf.Push(trans)
    wb.removeInflightFetch(trans)
    wb.cache.bottomPort.RetrieveIncoming()
    tracing.TraceReqFinalize(trans.fetchReadReq, wb.cache)
    return true
}
```

The `combineData` method overlays all pending writes in the MSHR onto the fetched line and updates the block’s dirty mask:

```go
func (wb *writeBufferStage) combineData(m *cache.MSHREntry) {
    m.Block.DirtyMask = make([]bool, 1<<wb.cache.log2BlockSize)
    for _, t := range m.Requests {
        trans := t.(*transaction)
        if trans.read != nil { continue }
        m.Block.IsDirty = true
        write := trans.write
        _, offset := getCacheLineID(write.Address, wb.cache.log2BlockSize)
        for i := 0; i < len(write.Data); i++ {
            if write.DirtyMask == nil || write.DirtyMask[i] {
                index := offset + uint64(i)
                m.Data[index] = write.Data[i]
                m.Block.DirtyMask[index] = true
            }
        }
    }
}
```

### Eviction Paths

For `writeBufferEvictAndWrite`, the write buffer schedules an eviction write to lower memory and simultaneously sends a bank write (hit) to update the cache line locally:

```go
func (wb *writeBufferStage) processWriteBufferEvictAndWrite(trans *transaction) bool {
    if wb.writeBufferFull() { return false }
    bankNum := bankID(trans.block, wb.cache.directory.WayAssociativity(), len(wb.cache.dirToBankBuffers))
    bankBuf := wb.cache.writeBufferToBankBuffers[bankNum]
    if !bankBuf.CanPush() { return false }

    trans.action = bankWriteHit
    bankBuf.Push(trans)
    wb.pendingEvictions = append(wb.pendingEvictions, trans)
    wb.cache.writeBufferBuffer.Pop()
    return true
}
```

For `writeBufferEvictAndFetch`, the eviction is first buffered (`Flush`), then the action is rewritten to `writeBufferFetch` so the fetch path will be processed next:

```go
func (wb *writeBufferStage) processWriteBufferFetchAndEvict(trans *transaction) bool {
    ok := wb.processWriteBufferFlush(trans, false)
    if ok { trans.action = writeBufferFetch; return true }
    return false
}

func (wb *writeBufferStage) processWriteBufferFlush(trans *transaction, popAfterDone bool) bool {
    if wb.writeBufferFull() { return false }
    wb.pendingEvictions = append(wb.pendingEvictions, trans)
    if popAfterDone { wb.cache.writeBufferBuffer.Pop() }
    return true
}
```

## Writing Evictions to Lower Memory

Evictions are issued to the bottom port with concurrency control and address‑to‑port mapping. Each issued write is tracked in `inflightEviction`:

```go
func (wb *writeBufferStage) write() bool {
    if len(wb.pendingEvictions) == 0 { return false }
    trans := wb.pendingEvictions[0]
    if wb.tooManyInflightEvictions() { return false }
    if !wb.cache.bottomPort.CanSend() { return false }

    low := wb.cache.addressToPortMapper.Find(trans.evictingAddr)
    write := mem.WriteReqBuilder{}.
        WithSrc(wb.cache.bottomPort.AsRemote()).
        WithDst(low).
        WithPID(trans.evictingPID).
        WithAddress(trans.evictingAddr).
        WithData(trans.evictingData).
        WithDirtyMask(trans.evictingDirtyMask).Build()
    wb.cache.bottomPort.Send(write)

    trans.evictionWriteReq = write
    wb.pendingEvictions = wb.pendingEvictions[1:]
    wb.inflightEviction = append(wb.inflightEviction, trans)
    tracing.TraceReqInitiate(write, wb.cache, tracing.MsgIDAtReceiver(trans.req(), wb.cache))
    return true
}
```

When the write completes, the corresponding in‑flight entry is removed and the response is consumed:

```go
func (wb *writeBufferStage) processWriteDoneRsp(writeDone *mem.WriteDoneRsp) bool {
    for i := len(wb.inflightEviction) - 1; i >= 0; i-- {
        e := wb.inflightEviction[i]
        if e.evictionWriteReq.ID == writeDone.RespondTo {
            wb.inflightEviction = append(wb.inflightEviction[:i], wb.inflightEviction[i+1:]...)
            wb.cache.bottomPort.RetrieveIncoming()
            tracing.TraceReqFinalize(e.evictionWriteReq, wb.cache)
            return true
        }
    }
    panic("write request not found")
}
```

## Capacity and Limits

```go
func (wb *writeBufferStage) writeBufferFull() bool {
    numEntry := len(wb.pendingEvictions) + len(wb.inflightEviction)
    return numEntry >= wb.writeBufferCapacity
}

func (wb *writeBufferStage) tooManyInflightFetches() bool {
    return len(wb.inflightFetch) >= wb.maxInflightFetch
}

func (wb *writeBufferStage) tooManyInflightEvictions() bool {
    return len(wb.inflightEviction) >= wb.maxInflightEviction
}
```

These checks prevent over‑subscription of the buffer and model limited memory concurrency.

## Reset

```go
func (wb *writeBufferStage) Reset() {
    wb.cache.writeBufferBuffer.Clear()
}
```

Reset clears the inbound buffer to the stage; persistent in‑flight state is expected to be drained by the simulation harness when appropriate.
