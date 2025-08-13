# Top Parser Stage

The top parser is the entry point of the cache pipeline. It accepts requests from the upper level via `topPort`, wraps them into an internal `transaction`, and enqueues them to the Directory stage buffer.

The implementation of the top parser is straightforward. But let's walk line by line to set up your basic understanding of how Akita generally works. 

```go
func (p *topParser) Tick() bool {
```

There is only one method in the top parser, `Tick() bool`. It is called by the cache component every time the cache ticks. The return value indicates whether the top parser made progress (i.e., it has accepted a new request). 

```go
if p.cache.state != cacheStateRunning {
    return false
}

req := p.cache.topPort.PeekIncoming()
if req == nil {
    return false
}

if !p.cache.dirStageBuffer.CanPush() {
    return false
}
```

At the beginning of the `Tick` method, the top parser needs to check if the request can be processed. There are three conditions that need to be met:

- The cache is running (not paused or being flushed).
- There is a request in the top port.
- The directory stage buffer has space to store the transaction.

If any of the conditions is not met, the top parser returns false.

```go
trans := &transaction{
	id: sim.GetIDGenerator().Generate(),
}
switch req := req.(type) {
case *mem.ReadReq:
	trans.read = req
case *mem.WriteReq:
	trans.write = req
}

p.cache.dirStageBuffer.Push(trans)
p.cache.inFlightTransactions = append(p.cache.inFlightTransactions, trans)
tracing.TraceReqReceive(req, p.cache)
p.cache.topPort.RetrieveIncoming()

return true
```

Once we know that there is no barrier that blocks the top parser from processing the request, the top parser can process it. Here, the top parser wraps the request into a transaction, which is a struct that contains all the information associated with the request. Then, in the last four lines, we perform the following actions:

- Push the transaction to the directory stage buffer so that the directory stage can process it later
- Add the transaction to the list of in-flight transactions.
- Trace the request for visualization and metrics collection.
- Retrieve the request from the top port.

Finally, the top parser returns true to indicate that it has made progress.
