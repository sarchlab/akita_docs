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












```go
func (ds *directoryStage) evict(trans *transaction, victim *cache.Block) bool {
	...

	ds.buf.Pop()
	bankBuf.Push(trans)
	ds.cache.evictingList[trans.victim.Tag] = true

	...
}
```



Key details:

- **Transaction programming.** `updateTransForEviction` (below) snapshots the old line into `trans.victim` so the bank can write it back, then decides whether the eviction also needs a **fetch** of the new line:
  - For **reads**, a fetch is always required.
  - For **writes**, a fetch is required unless the write covers the **full line** (in which case we can allocate and write directly).
- **Victim metadata.** We retag and lock the directory block for the incoming line to reserve the slot and preserve ordering. We also mark the old tag in `evictingList` to prevent racy hits while the eviction is in flight.

```go
func (ds *directoryStage) updateTransForEviction(
    trans *transaction, victim *cache.Block, pid vm.PID, cacheLineID uint64,
) {
    trans.action = bankEvictAndFetch
    trans.victim = &cache.Block{ PID: victim.PID, Tag: victim.Tag, CacheAddress: victim.CacheAddress, DirtyMask: victim.DirtyMask }
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

The helper below encodes the policy described above:

```go
func (ds *directoryStage) evictionNeedFetch(t *transaction) bool {
    if t.write == nil { return true }                 // read → must fetch
    if ds.isWritingFullLine(t.write) { return false } // full-line write → no fetch
    return true                                       // partial-line write → fetch
}
```

#### Direct fetch path

If the victim is not dirty, the directory pre‑allocates the block and enqueues a **fetch** command to the bank:

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

In short, **read miss** turns into either *Evict→(WriteBack)→Fetch* or a single *Fetch*, both flowing through the bank with an MSHR entry tracking completion and response fan‑out to all waiting transactions.


## Write

### Write MSHR Hit

### Write Hit

### Write Miss, Full Line

### Write Miss, Partial Line