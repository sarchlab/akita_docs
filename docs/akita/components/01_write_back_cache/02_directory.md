# Directory Stage

The directory stage is probably the most complex subcomponent in the writeback cache. It is responsible for looking up tags/metadata, consulting MSHRs, and choosing the next action. Additionally, we model a timing delay for directory lookup. 

## Directory Lookup Latency Modeling

We first use a simple pipeline to model the directory lookup latency. 

```go
func (ds *directoryStage) acceptNewTransaction() bool {
	madeProgress := false

	for i := 0; i < ds.cache.numReqPerCycle; i++ {
		if !ds.pipeline.CanAccept() {
			break
		}

		item := ds.cache.dirStageBuffer.Peek()
		if item == nil {
			break
		}

		trans := item.(*transaction)
		ds.pipeline.Accept(dirPipelineItem{trans})
		ds.cache.dirStageBuffer.Pop()

		madeProgress = true
	}

	return madeProgress
}
```


The `acceptNewTransaction` method, implemented in a way similar to the top parser, is responsible for taking the actions from the directory stage buffer to the pipeline. 

```go
madeProgress = ds.pipeline.Tick() || madeProgress
```

After the `acceptNewTransaction` method, the directory stage ticks the internal pipeline, creating a latency for every transaction. The transactions that have passed the pipeline are temporarily stored in a internal buffer (`ds.buf`) to be processed in the next tick.

## Transaction Processing

After the delay, the directory stage will process the transaction in `processTransaction` method. 

```go
func (ds *directoryStage) processTransaction() bool {
	...

		if _, evicting := ds.cache.evictingList[cacheLineID]; evicting {
			break
		}

	..
}
```

In the `processTransaction` method, one thing needs to note is that the directory stage will not process the transaction if the cache line is being evicted. If such prevention is not used, errors can occur in the following scenario. 

- The cache line is being evicted and fetching from the memory is in progress. 
- At this moment, the directory is still storing the old address and is still showing as valid. So the transaction is still sent to the bank. 
- Right before the bank can process the read-hit, the fetched data returns and the cache line is updated. 
- The bank will still read that cache line. However, it is now storing the data for a different address. 

Next, the most important code in the `processTransaction` method is the following part, as we start to process the transaction for different cases. 

```go
func (ds *directoryStage) processTransaction() bool {
	...

		if trans.read != nil {
			madeProgress = ds.doRead(trans) || madeProgress
			continue
		}

		madeProgress = ds.doWrite(trans) || madeProgress
	..
}
```

In total, we consider 7 different cases. 

- Read MSHR hit
- Read hit
- Read miss
- Write MSHR hit
- Write hit
- Write miss, full line
- Write miss, partial line

### At‑a‑glance case matrix

| Case                               | Preconditions                                   | Directory action                                | Bank action                 | Write buffer action                 | MSHR |
|------------------------------------|--------------------------------------------------|--------------------------------------------------|-----------------------------|-------------------------------------|------|
| Read MSHR hit                      | Line tracked in MSHR                             | Append to MSHR entry                             | –                           | –                                   | keep |
| Read hit                           | Block present, not locked                        | Program bank read                                | `bankReadHit`               | –                                   | –    |
| Read miss – no eviction            | Victim clean and available                       | Fetch: add MSHR, pre‑alloc block                 | `writeBufferFetch`          | Issue read to bottom                | add  |
| Read miss – need eviction          | Victim dirty and available                       | Evict then fetch                                 | `bankEvictAndFetch`         | Write dirty victim, then fetch      | add  |
| Write MSHR hit                     | Line tracked in MSHR                             | Append to MSHR entry                             | –                           | –                                   | keep |
| Write hit                          | Block present; not locked; no outstanding reads  | Program bank write                               | `bankWriteHit`              | –                                   | –    |
| Write miss, full line              | Full‑line write; victim available                | If dirty: evict; else allocate and write         | `bankWriteHit`              | Flush dirty victim                  | –    |
| Write miss, partial – no eviction  | Not full‑line; victim clean and available        | Fetch: add MSHR, pre‑alloc block                 | `writeBufferFetch`          | Issue read to bottom                | add  |
| Write miss, partial – need eviction| Not full‑line; victim dirty and available        | Evict then fetch                                 | `bankEvictAndFetch`         | Write dirty victim, then fetch      | add  |

### Common patterns and invariants

- MSHR‑first policy: always check and append to MSHR before directory lookup.
- Evicting guard: if a line is present in `evictingList`, skip processing it this tick.
- Bank selection: compute `bank := bankID(block, wayAssoc, numBanks)` and verify `bankBuf.CanPush()` before dispatch.
- Metadata updates: use `directory.Visit` to update LRU; set `block.IsLocked` while data is being fetched or written; update `block.Tag`, `block.PID`, `block.IsValid` when allocating.
- Action programming: set `trans.block` and `trans.action` to direct downstream behavior (bank or write buffer).

### Shared eviction path

When eviction is required, directory prepares the victim and programs one of the eviction actions. The essential steps are:

```go
func (ds *directoryStage) evict(trans *transaction, victim *cache.Block) bool {
    // Identify owning bank and ensure capacity
    bankNum := bankID(victim, ds.cache.directory.WayAssociativity(), len(ds.cache.dirToBankBuffers))
    bankBuf := ds.cache.dirToBankBuffers[bankNum]
    if !bankBuf.CanPush() { return false }

    // Determine request address/PID and compute cacheLineID
    // ... select addr, pid ...

    ds.updateTransForEviction(trans, victim, pid, cacheLineID)
    ds.updateVictimBlockMetaData(victim, cacheLineID, pid)

    ds.buf.Pop()
    bankBuf.Push(trans)
    ds.cache.evictingList[trans.victim.Tag] = true
    return true
}
```

`updateTransForEviction` decides whether a fetch is also needed (default) or a write‑only eviction suffices (full‑line write). `updateVictimBlockMetaData` locks and pre‑allocates the victim for the incoming line.


## Read

Let's first take a look at the `doRead` method. 

```go
func (ds *directoryStage) doRead(trans *transaction) bool {
	cachelineID, _ := getCacheLineID(
		trans.read.Address, ds.cache.log2BlockSize)

	mshrEntry := ds.cache.mshr.Query(trans.read.PID, cachelineID)
	if mshrEntry != nil {
		return ds.handleReadMSHRHit(trans, mshrEntry)
	}

	block := ds.cache.directory.Lookup(
		trans.read.PID, cachelineID)
	if block != nil {
		return ds.handleReadHit(trans, block)
	}

	return ds.handleReadMiss(trans)
}
```

The `doRead` method dispatches the transaction to different methods based on the result of the directory lookup. We first check the MSHR to see if the data is currently being fetched. We check MSHR before directory lookup. This is a simple solution to avoid errors. If the cache line is not in the MSHR, we look up in the directory. If no block is found, we handle the read miss. Otherwise, we handle the read hit. 

### Read MSHR Hit

```go
func (ds *directoryStage) handleReadMSHRHit(
	trans *transaction,
	mshrEntry *cache.MSHREntry,
) bool {
	trans.mshrEntry = mshrEntry
	mshrEntry.Requests = append(mshrEntry.Requests, trans)

	ds.buf.Pop()

	tracing.AddTaskStep(
		tracing.MsgIDAtReceiver(trans.read, ds.cache),
		ds.cache,
		"read-mshr-hit",
	)

	return true
}
```

MSHR hit is the simplest case. The transaction is simply added to the MSHR entry and the subsequent action is handled by the MSHR stage. The `AddTaskStep` call is used to tag the transaction with `read-mshr-hit` for data collection. We will skip the tracing part in the rest of the document. 

### Read Hit

Read hit processing is also straightforward (see the code list below).
```go
func (ds *directoryStage) handleReadHit(
	trans *transaction,
	block *cache.Block,
) bool {
	if block.IsLocked {
		return false
	}

	return ds.readFromBank(trans, block)
}

```

The main action is delegated to the bank stage. Still, before any action can be taken, we need to check if the block is locked (being evicted or being written) before sending the transaction to the bank. 

```go

func (ds *directoryStage) readFromBank(
	trans *transaction,
	block *cache.Block,
) bool {
	...
}
```

The `readFromBank` method is the first example of creating a command for the bank. Let's break down the code. 

```go 
numBanks := len(ds.cache.dirToBankBuffers)
bank := bankID(block, ds.cache.directory.WayAssociativity(), numBanks)
```

Since a cache can have multiple banks, we first need to identify the bank. Here, we use the `bankID` function to calculate the bank ID. 

```go
bankBuf := ds.cache.dirToBankBuffers[bank]
if !bankBuf.CanPush() {
	return false
}
```

Next, we check if the bank buffer has space to store the transaction. If not, we wait.

```go
ds.cache.directory.Visit(block)

block.ReadCount++
```

Then, a few bookkeeping actions are performed. The `Visit` call is used to update the LRU call so that this block is now the most recently used block. We also increment the read count of the block. This number is kept since we allow multiple read hits to be processed in parallel. 

```go
trans.block = block
trans.action = bankReadHit
```

Now we update the transaction to setup the command for the bank. In the `block` field, we associate the block with the transaction. In theory, each transaction should associate and can only associate with one block. We also define the `action` field to `bankReadHit` to indicate that the bank should read the data from the block and directly respond to the transaction. 

```go
ds.buf.Pop()
bankBuf.Push(trans)
```

Finally, we move the transaction from the directory stage internal buffer (after the pipeline) to the bank buffer. 

### Read Miss

The read miss processing is a bit more complex. 
 

```go
func (ds *directoryStage) handleReadMiss(trans *transaction) bool {
    req := trans.read
    cacheLineID, _ := getCacheLineID(req.Address, ds.cache.log2BlockSize)

    // If we cannot track another miss, stall.
    if ds.cache.mshr.IsFull() {
        return false
    }

    // Identify a replace target and make sure it is available.
    victim := ds.cache.directory.FindVictim(cacheLineID)
    if victim.IsLocked || victim.ReadCount > 0 {
        return false
    }

    // Dirty victims are written back before we can reuse the slot.
    if ds.needEviction(victim) {
        ok := ds.evict(trans, victim)
        if ok {
            // tracing: "read-miss"
        }
        return ok
    }

    // Otherwise we can fetch the new line directly.
    ok := ds.fetch(trans, victim)
    if ok {
        // tracing: "read-miss"
    }
    return ok
}
```

There are a few conditions to check before we can proceed with the read miss. 

- If the MSHR is full, we cannot store the transaction to fetch. So we stall. 
- If the victim, identified by the `FindVictim` method, is locked or being served by outstanding reads, we stall.

If all the conditions are met, we can proceed with the read miss. There are two cases to consider. One is the eviction path and one is the direct fetch path. If the victim is valid and dirty, we need to write it back before we can reuse the slot. Otherwise, we can directly fetch the new line. 

#### Direct fetch path

If the victim is not dirty, we perform a direct fetch (see the code below). 

```go
func (ds *directoryStage) fetch(trans *transaction, block *cache.Block) bool {
    // Determine target set/bank and verify space.
    bankNum := bankID(block, ds.cache.directory.WayAssociativity(), len(ds.cache.dirToBankBuffers))
    bankBuf := ds.cache.dirToBankBuffers[bankNum]
    if !bankBuf.CanPush() { return false }

    // Create the MSHR entry and pre-allocate the directory block.
    mshrEntry := ds.cache.mshr.Add(pid, cacheLineID)
    trans.mshrEntry = mshrEntry
    trans.block = block
    block.IsLocked = true
    block.Tag = cacheLineID
    block.PID = pid
    block.IsValid = true
    ds.cache.directory.Visit(block)

    // Program the bank command and dispatch.
    ds.buf.Pop()
    trans.action = writeBufferFetch
    trans.fetchPID = pid
    trans.fetchAddress = cacheLineID
    bankBuf.Push(trans)

    mshrEntry.Block = block
    mshrEntry.Requests = append(mshrEntry.Requests, trans)

    return true
}
```

Compare to the eviction path, the direct fetch path is much simpler. In general, we take the following steps:

- Allocate an MSHR entry. 
- Update the victim block metadata to reflect the new cache line address and PIE. Not that we mark the block as locked to prevent any reading or writing to the block, until the fetch is completed.
- Program the bank command with a `writeBufferFetch` action and dispatch the transaction to the bank. 


#### Eviction path

When eviction is needed, the directory stage builds a bank command and pre‑allocates the victim for the cache line to be fetched.

Let's read the `evict` method. 

```go
func (ds *directoryStage) evict(trans *transaction, victim *cache.Block) bool {
    bankNum := bankID(victim, ds.cache.directory.WayAssociativity(), len(ds.cache.dirToBankBuffers))
    bankBuf := ds.cache.dirToBankBuffers[bankNum]
    if !bankBuf.CanPush() { return false }

	...
   
}
```

In the first part, we identify the bank that owns the victim block. Note that the victim block must also be the block where the fetched data will be stored. 


```go
func (ds *directoryStage) evict(trans *transaction, victim *cache.Block) bool {
	...

	var addr uint64; var pid vm.PID
	if trans.read != nil { addr = trans.read.Address; pid = trans.read.PID }
	else { addr = trans.write.Address; pid = trans.write.PID }
	cacheLineID, _ := getCacheLineID(addr, ds.cache.log2BlockSize)

	...
}
```

Next, we get the cache line initial address and the PID. Here, we use a if statement because the `evict` method serves both read and write requests. 

```go
func (ds *directoryStage) evict(trans *transaction, victim *cache.Block) bool {
	...

	ds.updateTransForEviction(trans, victim, pid, cacheLineID)
	ds.updateVictimBlockMetaData(victim, cacheLineID, pid)

	...
}
```

The following the two function calls to `updateTransForEviction` and `updateVictimBlockMetaData` are the core to the eviction action. 

The `updateTransForEviction` method is listed below. 

```go
func (ds *directoryStage) updateTransForEviction(
	trans *transaction,
	victim *cache.Block,
	pid vm.PID,
	cacheLineID uint64,
) {
	trans.action = bankEvictAndFetch
	trans.victim = &cache.Block{
		PID:          victim.PID,
		Tag:          victim.Tag,
		CacheAddress: victim.CacheAddress,
		DirtyMask:    victim.DirtyMask,
	}
	trans.block = victim
	trans.evictingPID = trans.victim.PID
	trans.evictingAddr = trans.victim.Tag
	trans.evictingDirtyMask = victim.DirtyMask

	if ds.evictionNeedFetch(trans) {
		mshrEntry := ds.cache.mshr.Add(pid, cacheLineID)
		mshrEntry.Block = victim
		mshrEntry.Requests = append(mshrEntry.Requests, trans)
		trans.mshrEntry = mshrEntry
		trans.fetchPID = pid
		trans.fetchAddress = cacheLineID
		trans.action = bankEvictAndFetch
	} else {
		trans.action = bankEvictAndWrite
	}
}
```

For most of the case, an eviction also requires a fetch. Consider 2 cases:

- Read miss: We need to fetch the data from the lower memory. 
- Write miss (partial line write): We also need to fetch the data from the lower memory so that the written data can be merged with the fetched data. 

One exception case is when writing a full cache line. In this case, we directly allocate the block and write the data to the block. Therefore, we do not need to allocate MSHR entry and the bank action can be simply `bankEvictAndWrite`.

Next, we call the `updateVictimBlockMetaData` method to update the victim block metadata (see the code below).

```go
func (ds *directoryStage) updateVictimBlockMetaData(
	victim *cache.Block,
	cacheLineID uint64,
	pid vm.PID,
) {
	victim.Tag = cacheLineID
	victim.PID = pid
	victim.IsLocked = true
	victim.IsDirty = false
	ds.cache.directory.Visit(victim)
}
```

The victim block metadata is updated to represent the new cache line address and PID. However, we mark the victim as locked, to mark the block do not yet have the data. 


## Write

After reads, writes follow a parallel decision flow: check MSHR first, then directory, and finally choose between write‑hit, write‑miss full line, or write‑miss partial line. The top‑level dispatcher is `doWrite`:

```go
func (ds *directoryStage) doWrite(trans *transaction) bool {
    write := trans.write
    cachelineID, _ := getCacheLineID(write.Address, ds.cache.log2BlockSize)

    mshrEntry := ds.cache.mshr.Query(write.PID, cachelineID)
    if mshrEntry != nil {
        ok := ds.doWriteMSHRHit(trans, mshrEntry)
        // tracing: "write-mshr-hit"
        return ok
    }

    block := ds.cache.directory.Lookup(trans.write.PID, cachelineID)
    if block != nil {
        ok := ds.doWriteHit(trans, block)
        if ok { /* tracing: "write-hit" */ }
        return ok
    }

    ok := ds.doWriteMiss(trans)
    if ok { /* tracing: "write-miss" */ }
    return ok
}
```

### Write MSHR Hit

If the line is already being fetched (MSHR hit), we append the write to the existing MSHR entry and let the MSHR stage handle merging once data arrives.

```go
func (ds *directoryStage) doWriteMSHRHit(
    trans *transaction,
    mshrEntry *cache.MSHREntry,
) bool {
    trans.mshrEntry = mshrEntry
    mshrEntry.Requests = append(mshrEntry.Requests, trans)
    ds.buf.Pop()
    return true
}
```

### Write Hit

On a write hit, we must ensure the block is not locked and not currently serving readers (no outstanding read hits). Then we program a bank command to modify the line in place.

```go
func (ds *directoryStage) doWriteHit(
    trans *transaction,
    block *cache.Block,
) bool {
    if block.IsLocked || block.ReadCount > 0 { return false }
    return ds.writeToBank(trans, block)
}
```

`writeToBank` prepares the transaction for the bank and updates directory metadata:

```go
func (ds *directoryStage) writeToBank(
    trans *transaction,
    block *cache.Block,
) bool {
    numBanks := len(ds.cache.dirToBankBuffers)
    bank := bankID(block, ds.cache.directory.WayAssociativity(), numBanks)
    bankBuf := ds.cache.dirToBankBuffers[bank]
    if !bankBuf.CanPush() { return false }

    addr := trans.write.Address
    cachelineID, _ := getCacheLineID(addr, ds.cache.log2BlockSize)

    ds.cache.directory.Visit(block)
    block.IsLocked = true
    block.Tag = cachelineID
    block.IsValid = true
    block.PID = trans.write.PID
    trans.block = block
    trans.action = bankWriteHit

    ds.buf.Pop()
    bankBuf.Push(trans)
    return true
}
```

- **Locking**: the block is marked locked to prevent concurrent reads/writes while the bank stage completes the write.
- **Action**: `bankWriteHit` instructs the bank to merge bytes and mark dirty.

### Write Miss

Writes that miss are split into two categories depending on whether they write a full cache line.

```go
func (ds *directoryStage) doWriteMiss(trans *transaction) bool {
    write := trans.write
    if ds.isWritingFullLine(write) { return ds.writeFullLineMiss(trans) }
    return ds.writePartialLineMiss(trans)
}
```

#### Full‑line write miss

If the write covers the entire line (all bytes dirty), we can allocate the line without fetching. However, if the replacement victim is valid and dirty, we must evict it first.

```go
func (ds *directoryStage) writeFullLineMiss(trans *transaction) bool {
    write := trans.write
    cachelineID, _ := getCacheLineID(write.Address, ds.cache.log2BlockSize)

    victim := ds.cache.directory.FindVictim(cachelineID)
    if victim.IsLocked || victim.ReadCount > 0 { return false }

    if ds.needEviction(victim) {
        return ds.evict(trans, victim)
    }
    return ds.writeToBank(trans, victim)
}
```

Notes:

- If eviction is needed, `evict` will program a `bankEvictAndWrite` action (no fetch required for full‑line writes). The write buffer will send the eviction down and a `bankWriteHit` to the bank.
- Otherwise, we directly allocate the victim for this line via `writeToBank`.

#### Partial‑line write miss

For partial writes, we must fetch the existing line from lower memory before merging the new bytes. We also need MSHR space to track the miss.

```go
func (ds *directoryStage) writePartialLineMiss(trans *transaction) bool {
    write := trans.write
    cachelineID, _ := getCacheLineID(write.Address, ds.cache.log2BlockSize)

    if ds.cache.mshr.IsFull() { return false }

    victim := ds.cache.directory.FindVictim(cachelineID)
    if victim.IsLocked || victim.ReadCount > 0 { return false }

    if ds.needEviction(victim) { return ds.evict(trans, victim) }
    return ds.fetch(trans, victim)
}
```

If eviction is needed (dirty victim), we evict first, then fetch the new line (the `evict` helper will set up MSHR and the appropriate actions). Otherwise, we set up a direct fetch via `fetch`, which allocates the MSHR, pre‑allocates the block, and programs a `writeBufferFetch` command.

### Full‑line detection

Full‑line writes are detected by write length and dirty mask coverage:

```go
func (ds *directoryStage) isWritingFullLine(write *mem.WriteReq) bool {
    if len(write.Data) != (1 << ds.cache.log2BlockSize) { return false }
    if write.DirtyMask != nil {
        for _, dirty := range write.DirtyMask {
            if !dirty { return false }
        }
    }
    return true
}
```

This allows the directory to skip fetches and MSHR allocation when the incoming write completely overwrites a line.