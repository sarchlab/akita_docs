# Directory Stage

The directory stage is probably the most complex subcomponent in the writeback cache. It is responsible for looking up tags/metadata, consulting MSHRs, and choosing the next action. Additionally, we model a timing delay for directory lookup. 

**Directory Lookup Latency:**

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

**Transaction Processing:**

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

**Read Processing:**

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

**Read MSHR Hit:**

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

**Read Hit:**

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

Read hit processing is also straightforward as the action will be delegated to the bank stage. We need to check if the block is locked (being evicted or being written) before sending the transaction to the bank. 


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

**Read Miss:**
 
When the directory lookup fails, we handle the read miss. The directory stage decides whether to evict a victim (if it is valid and dirty) or to fetch directly into a victim block. It also sets up MSHR state to aggregate any concurrent requests for the same cache line.

```go
func (ds *directoryStage) handleReadMiss(trans *transaction) bool {
	req := trans.read
	cacheLineID, _ := getCacheLineID(req.Address, ds.cache.log2BlockSize)

	if ds.cache.mshr.IsFull() {
		return false
	}

	victim := ds.cache.directory.FindVictim(cacheLineID)
	if victim.IsLocked || victim.ReadCount > 0 {
		return false
	}

	if ds.needEviction(victim) {
		ok := ds.evict(trans, victim)
		if ok {
			tracing.AddTaskStep(
				tracing.MsgIDAtReceiver(trans.read, ds.cache),
				ds.cache,
				"read-miss",
			)
		}
		return ok
	}

	ok := ds.fetch(trans, victim)
	if ok {
		tracing.AddTaskStep(
			tracing.MsgIDAtReceiver(trans.read, ds.cache),
			ds.cache,
			"read-miss",
		)
	}
	return ok
}
```

In summary:
- The directory checks MSHR capacity, picks a victim, and stalls if the victim is locked or being read.
- If the victim needs eviction (valid and dirty), it prepares an eviction; otherwise, it fetches the missed line.
- In either path, it moves the transaction to the bank stage for execution.

Eviction path. The directory preps the transaction and victim metadata and decides whether to fetch after eviction (misses always fetch):

```go
func (ds *directoryStage) evict(
	trans *transaction,
	victim *cache.Block,
) bool {
	bankNum := bankID(victim,
		ds.cache.directory.WayAssociativity(), len(ds.cache.dirToBankBuffers))
	bankBuf := ds.cache.dirToBankBuffers[bankNum]
	if !bankBuf.CanPush() {
		return false
	}

	// Update trans and victim metadata
	cacheLineID, _ := getCacheLineID(trans.read.Address, ds.cache.log2BlockSize)
	ds.updateTransForEviction(trans, victim, trans.read.PID, cacheLineID)
	ds.updateVictimBlockMetaData(victim, cacheLineID, trans.read.PID)

	ds.buf.Pop()
	bankBuf.Push(trans)
	ds.cache.evictingList[trans.victim.Tag] = true
	return true
}

func (ds *directoryStage) updateTransForEviction(
	trans *transaction, victim *cache.Block, pid vm.PID, cacheLineID uint64,
) {
	trans.action = bankEvictAndFetch // default for reads
	trans.victim = &cache.Block{ PID: victim.PID, Tag: victim.Tag,
		CacheAddress: victim.CacheAddress, DirtyMask: victim.DirtyMask }
	trans.block = victim
	trans.evictingPID = trans.victim.PID
	trans.evictingAddr = trans.victim.Tag
	trans.evictingDirtyMask = victim.DirtyMask

	if ds.evictionNeedFetch(trans) { // true for reads
		m := ds.cache.mshr.Add(pid, cacheLineID)
		m.Block = victim
		m.Requests = append(m.Requests, trans)
		trans.mshrEntry = m
		trans.fetchPID = pid
		trans.fetchAddress = cacheLineID
		trans.action = bankEvictAndFetch
	} else {
		trans.action = bankEvictAndWrite
	}
}
```

Fetch path. If no eviction is needed, the directory allocates an MSHR entry and locks the chosen victim block, then asks the bank to forward a fetch request to the write buffer:

```go
func (ds *directoryStage) fetch(
	trans *transaction,
	block *cache.Block,
) bool {
	cacheLineID, _ := getCacheLineID(trans.read.Address, ds.cache.log2BlockSize)

	bankNum := bankID(block,
		ds.cache.directory.WayAssociativity(), len(ds.cache.dirToBankBuffers))
	bankBuf := ds.cache.dirToBankBuffers[bankNum]
	if !bankBuf.CanPush() {
		return false
	}

	m := ds.cache.mshr.Add(trans.read.PID, cacheLineID)
	trans.mshrEntry = m
	trans.block = block
	block.IsLocked = true
	block.Tag = cacheLineID
	block.PID = trans.read.PID
	block.IsValid = true
	ds.cache.directory.Visit(block)

	ds.buf.Pop()
	trans.action = writeBufferFetch
	trans.fetchPID = trans.read.PID
	trans.fetchAddress = cacheLineID
	bankBuf.Push(trans)

	m.Block = block
	m.Requests = append(m.Requests, trans)
	return true
}
```

End-to-end, a read miss proceeds as:
- Directory allocates MSHR and selects a victim; evict-if-dirty else fetch.
- Bank reads victim data (for eviction) and forwards to the write buffer.
- Write buffer writes back dirty data and fetches the missed line (from local eviction data if available, otherwise from the lower memory).
- Bank installs fetched data into the array and wakes the MSHR.
- MSHR returns `DataReadyRsp` for the read and drains any coalesced writes.