# Smart Ticking

In [Event Driven Simulation](./event_driven_simulation.md), we have demonstrated that event-driven simulation can improve simulation performance by skipping part of the simulation. However, if a simulator is written in a pure event-driven simulation style, the code can get uncontrollably complex, especially when there are many events. 

Moreover, pure event-driven simulation cannot solve the retry problem. When a component fails to perform one action, pure event-driven simulation can only keep scheduling retry events repeatedly, cycle by cycle. In this case, event-driven simulation will fall back into cycle-based simulation, or even worse, if we consider the event management overhead.

We use Smart Ticking to address both the complexity problem and the retry problem. Code related to Smart Ticking is located in `sim/ticker.go`.

## Ticking Components

Since cycle-based simulations are simpler and easier to program, let’s use Akita’s Event-driven simulation engine to mimic the cycle-based simulation programming interface. 

We start by defining a `TickEvent`, which only maintains a handler and the event time. The constructor of the `TickEvent` is named as `MakeTickEvent`. Using `Make` rather than `New`, we hint that the constructor creates a `TickEvent` by returning a value rather than a pointer. 

Then, every component that can handle the `TickEvent` is called a `TickingComponent`. If a user-defined component needs to be a `TickingComponent`, it can simply embed the TickingComponent struct and implement a Tick function. Here, the constructor of the TickingComponent needs four arguments, including the name of the component, the engine, the frequency, and the `Ticker`. Here, the `Ticker` is the struct that implements the `Tick` function and is usually the component itself. 

Here is an example of implementing the `PingAgent` as a `TickingComponent`.

```go
type TickingPingAgent struct {
	*sim.TickingComponent
}

func NewTickingPingAgent(
	name string,
	engine sim.Engine,
	freq sim.Freq,
) *TickingPingAgent {
	a := &TickingPingAgent{}
	a.TickingComponent = sim.NewTickingComponent(name, engine, freq, a)
	return a
}

func (a *TickingPingAgent) Tick(now sim.VTimeInSec) bool {
	...
}

```

The `TickingComponent` struct will handle `Tick` events by calling the Tick function of the component (or we can also say the `Ticker`).

## Make Ticking Smart

If we schedule a Tick event at every cycle for every component, our simulator falls back to an event-driven simulator. We need to make the Ticking mechanism smarter, so that it can skip unnecessary ticks.

Before introducing details of smart ticking, let’s review how we can safely (without sacrificing simulation accuracy) improve simulation performance. In general, if, in one cycle, a component is not substantially changing its states, we can skip the state update of that component in the cycle. Here, non-substantial state updates include updates that can be recovered and recalculated in a later tick (e.g., auto-incrementing counter). 

Then, what prevents the component from making a substantial update? We consider two cases: 1) being idle (this include the case if a component is waiting for a critical request to return) and 2) being fully jammed. When a component has no tasks to do, ticking it will not cause it to perform any action, and hence, no internal state can be updated. Also, a component may try to communicate with an external component, but the outgoing networks are all busy processing other messages. In this case, no state update can happen. 

In general, if we detect that one component is not making a state update, the component must be experiencing either of being idle or being fully jammed. Unless the external environment changes (i.e., the arrival of new tasks, freeing up of networks), no further progress can be made by this component. So, as a summary, if a component is not making a state update in one cycle, we can safely put it to sleep. 

Therefore, we require the `Tick` function to return a boolean value. If the return value is true, the `TickingComponent`’s tick event handler will automatically schedule a tick event in the next cycle. Otherwise, it will not schedule a tick event, putting the component to sleep. This logic is reflected in the implementation of the `TickingComponent`'s `Handle` method as shown below. 

```go
func (c *TickingComponent) Handle(e Event) error {
	now := e.Time()
	madeProgress := c.ticker.Tick(now)
	
	if madeProgress {
		c.TickLater(now)
	}
	
	return nil
}
```

:::note[What should I do if my simulator hangs or quits early?]
Very likely it is because all your `TickingComponent` are sleeping. If all of them are sleeping, there is no event in the event-driven simulation engine and the simulation terminates. So, check if you mistakenly return a False in the case where you need to return a True. 
:::

Then, the next question is when the component can wake up to continue ticking. We consider if the reason why the component is not making progress is resolved, it should wake up. If the component was idle, the arriving of a message can be a request that needs the component to response. If the component was fully jammed, the freeing up of one outgoing buffer may allow the component to move forward. Therefore, in both case, we wake up the component. Remember when we introduce components, each component has two methods called `NotifyRecv` and `NotifyPortFree`? These are perfect triggers to wake up a component. See the code below. How simple are these functions!

```go
func (c *TickingComponent) NotifyPortFree(
	now VTimeInSec,
	_ Port,
) {
	c.TickLater(now)
}

func (c *TickingComponent) NotifyRecv(
	now VTimeInSec,
	_ Port,
) {
	c.TickLater(now)
}

```

:::note[Is there any special case where there is no state update, but the `Tick` function should return True?]

A: A very practical case involves a round robin scheduler. Say if I have 4 pools of instructions to issue and only pool 4 has instructions. The issue arbiter works in the round-robin way, so that it issues instructions from one pool in one cycle. Say, in cycle 1, the arbiter is issuing instructions from pool 1. It cannot issue, because there is no instruction in pool 1. However, we should not say it is not making progress. It merely not issuing from pool 4. If we put it to sleep, we will miss the action that issues instruction from pool 4 at three cycles later. In this case, a smarter algorithm that determines if the component is stuck is required. An easy (but a bit dirty) way is to only return false when the component is not making progress for 4 consecutive cycles. 
:::

## A Example of a Ticking Component

Next, let's take a closer look at how a Tick function is implemented. This is still the example of the `TickingPingAgent`.

```go
func (a *TickingPingAgent) Tick(now akita.VTimeInSec) bool {
	madeProgress := false

	madeProgress = a.sendRsp(now) || madeProgress
	madeProgress = a.sendPing(now) || madeProgress
	madeProgress = a.countDown() || madeProgress
	madeProgress = a.processInput(now) || madeProgress

	return madeProgress
}
```

In the tick function, we divide the component into a few smaller stages. The whole tick function returns true (progress is made), if any of the stages made progress.

In this implementation, agent A creates a ping message in the `SendPing` stage and sends it over the network at the 1st cycle. Assuming the connection is a perfect connection that has 0 latency, agent B, the receiver, can pick the message up in the process Input stage at the 2nd cycle. As we set the latency to 2 cycles, the message stays in the countDown stage of agent B for the 3rd and 4th cycles. At the 5th cycle, agent B sends the response to agent A in the sendRsp stage. Finally, agent A can process the response at cycle 6. Therefore, the end-to-end latency is 5 cycles.

## Secondary Ticking

There is yet another problem with the current Ticking system. Assuming we have two component A and B. A send requests to B and B consumes it. In real hardware, if A sends a request in cycle 1, it should only be consumed by B in cycle 2. In the simulator, the behavior is at the mercy of event orders. Say, in cycle 1, A ticks after B’s tick, the behavior is correct as B can only consume the request in cycle 2. However, if in cycle 1, A ticks before B, A’s tick event may have already pushed the message to B’s buffer and B can consume the request also in cycle 1, which is different from the real-hardware scenario. 

To address this problem, Akita introduce the concept of primary events and secondary events. Assuming we have several primary events and several secondary events scheduled at the same time, Akita’s event-driven simulation engine will finish triggering all the primary events before working on second events. 

With the separation of primary events and secondary events, the problem above can be easily addressed. We can set both A and B’s tick events as primary events. Then, we create a new event, say deliver event, as a secondary event, that add the message to B’s buffer. With this mechanism, no matter what is the order of A’s tick and B’s tick, B can only consume the request in cycle 2. 

The primary and secondary events are supported by event-driven simulation engines with two separate queues. One queue only stores primary events and one queue only stores secondary queues. When triggering events, the engine will trigger events from the primary queue before triggering events from the secondary queue, if the event in the secondary queue are scheduled at the same time of the just-triggered primary events. 

Primary and secondary events also applies to tick events. By default, developers can use `NewTickingComponents` to declare a `TickingComponent`. In this case, all the tick events scheduled for this component are primary events. If secondary tick events are needed, developers can all `NewSecondaryTickingComponents`. As an example, the `DirectConnection` is a secondary components because it’s tick event is responsible for delivering components. (Yes, a `DirectConnection` is also a `TickingComponent`.  Therefore, the constructor of the `DirectConnection` is written as follows.

```go
func NewDirectConnection(
	name string,
	engine Engine,
	freq Freq,
) *DirectConnection {
	c := new(DirectConnection)
	c.TickingComponent = NewSecondaryTickingComponent(name, engine, freq, c)
	c.ends = make(map[Port]*directConnectionEnd)
	return c
}
```

In general, other than components related to communication, there is no need to use secondary events.