---
sidebar_position: 1
---

# 2.1 Time Management

Simulators replicate computer chip behavior using software, requiring action-by-action recreation in chronological order for accurate behavior emulation. Effective time management is crucial in computer architecture simulators to advance the simulated environment's time appropriately. This ensures that instructions, events, and system state updates are logical and consistent, mirroring the behavior and timing of the target architecture.

## 2.1.1 **Record time with floating point numbers.**

In most simulators, time is typically recorded using unsigned 64-bit integers as a unit of cycles. These simulators report the number of cycles required for an application to run, which is generally sufficient for most cases. However, in Akita, we aim to provide a more generic and flexible approach.

There are several cases that need to be considered. First, the Dynamic Voltage and Frequency Scaling (DVFS) feature allows the system's frequency to change dynamically. Second, some architectures have multiple frequency domains; cores and memory systems can run at different frequencies. In both cases, using integers to represent time can be more complex.

To simplify, we represent time as a floating-point number, using the type VTimeInSec (refer to the code below). "V" in this type stands for virtual time, which is different from real time. Virtual time refers to the time in the simulated world, whereas real time is the actual time elapsed in our world. For instance, if our simulator takes 1 hour to simulate a GPU executing a 1 ms application, the 1 hour is real time and 1 ms is virtual time. Additionally, "InSec" indicates that the time unit in Akita is consistently in seconds, eliminating confusion and miscommunication about the time unit.

```go
type VTimeInSec float64
```

## 2.1.2 **Frequency and clock cycles.**

Digital circuit update their states at clock cycle boundaries (ticks). These clock cycles usually maintain a steady frequency, which defines how soon digital circuit can update their status. This requires the simulator keep needing to calculate the time of the next cycle boundary. To address the need, Akita provides a `frequency` type. 

The frequency type is also simply an alias of float64 (see code below). 

```go
type Freq float64
```

However, it provides a few utility functions that can perform commonly used calculations, including `Period`, `ThisTick`, and `NextTick`. `Period` returns the reciprocal of the frequency, representing the during between two cycle boundaries.  `ThisTick` and `NextTick` both takes a time as input argument and return the cycle boundary time. `ThisTick` returns the earliest cycle boundary time that is equal or after the input time, while `NextTick` returns the earliest cycle boundary time that is after the input time. The only difference is that if the input time is right on a boundary, `TickTick` will return the input time, but `NextTick` will return the input time plus a period. The relationship is also depicted in the figure below.

```go
func (f Freq) ThisTick(now VTimeInSec) VTimeInSec
func (f Freq) NextTick(now VTimeInSec) VTimeInSec
```

![The relationship between `ThisTick` and `NextTick` functions.](figures/this_and_next_tick.png)

The relationship between `ThisTick` and `NextTick` functions.

<aside>
💬 Q: What is the drawback of defining time and frequency as floating point numbers. 
A: Since floating point calculation is not precise, some times it is difficult to determine if you are at or slightly before/after a clock cycle. This forces us to use a trick to calculate `NextTick`, using `cycle := math.Floor(math.Round(float64(now)*10*float64(f)) / 10)`. This adds computational burden and is still not fully safe. Without this trick, `NextTick` may return current time, making the whole simulation not moving forward.

</aside>

## 2.1.3 Events

In Akita, an event is an action to happen in the future. Events do not have durations. So the action of an event happens instantaneously. 

An event has two mandatory properties, the **time** and the **handler**. Both fields are immutable. Those fields can only be assigned when the event initiates and cannot be updated afterward.

The definition of the `Event` interface is defined below. We will explain the `IsSecondary` function later. 

```go
// An Event is something going to happen in the future.
type Event interface {
	// Return the time that the event should happen
	Time() VTimeInSec

	// Returns the handler that should handle the event
	Handler() Handler

	// IsSecondary tells if the event is a secondary event. Secondary event are
	// handled after all same-time primary events are handled.
	IsSecondary() bool
}
```

Simulator developers can define their own `Event` structs. Other than the time and handler properties, simulator developers can associate extra information with an event. 

The handler knows what will happen when the event take place. The handler is a very simple interface (see the code below). Akita mainly rely on simulator developers to define the action that an action trigger. 

```go
type Handler interface {
	Handle(e Event) error
}
```

<aside>
💬 Q: Why not let the event define its own behavior.
A: A type of event may have different behavior according to who is the handler. For example, `TickEvent` can be pretty much handled by most of the hardware components, but every component has its own behavior. Having two different entities **decouples** the data (event and its associated information) and action (handler).

</aside>

## 2.1.3 Event-Driven Simulation Engine

Since we have defined event, a simulation can be considered as replaying a list of events in chronological order. Such a player is called an **event-driven simulation engine,** or **engine** for short. The engine maintains a queue of events and triggers events one by one. 

Central to the engine interface are two functions named `Schedule` and `Run`. `Schedule` registers an event to be triggered in the future. `Run` triggers all the events (handled by handlers) until no event is left in the event queue. Note that the handlers can schedule future events while handling one event. 

Akita supports two implementations of engines, one serial engine and one parallel engine. The serial engine simply maintains an event queue and triggers event in order. We will discuss the parallel engine later. 

<aside>
💬 Q: Why use event driven simulation?
A: A more simpler type of simulation is called cycle-based simulation, where the engine polls all the components in a simulator to update their states in every cycle. Cycle-based simulation is typically slower than cycle-based simulation. This is mainly because it cannot fast forward useless simulations. For example, it a memory controller takes 1000 cycles to handle a request, event-driven simulation can skip the 999 cycles in between and jump to the end. But cycle-based simulations has to tick all the cycles. Additionally, cycle-based simulations have challenges handling systems with multiple frequency domains. Therefore, Akita uses event-driven simulation.

</aside>

## 2.1.4 A Simple Event-Driven Example

Let’s show how to use the event system with a simple example. Suppose we have one small bacteria at the beginning. It splits into two at the second 1. After that, every bacteria waits for a random time between 0.5–2.5 seconds before the next split. We want to run a simulation that can count the number of bacteria at the 10th second.

The first step is to declare an event. Let’s make is a primary event by always returning `false` in the `IsSecondary` function.

```go
type SplitEvent struct {
    time akita.VTimeInSec
    handler akita.Handler
}

func (e SplitEvent) Time() akita.VTimeInSec {
    return e.time
}

func (e SplitEvent) Handler() akita.Handler {
    return e.handler
}

func (e SplitEvent) IsSecondary() bool {
    return false
}
```

Then, we need to define the action associated with a split event. We can define the action in an event handler.

```go
type SplitHandler struct {
    total int
    engine akita.Engine
}

func (h *SplitHandler) Handle(evt akita.Event) error {
		// Increment total cell count.
    h.total++    

		// Get current time recorded in the event struct.
		now := evt.Time()

		// Schedule the next split event.
    nextTime := now + akita.VTimeInSec(rand.Float64()*2+0.5)
    if nextTime < 10.0 { // Never go beyond the end of the simulation.
        nextEvt := SplitEvent{
            time: nextTime,
            handler: h,
         }
         h.engine.Schedule(nextEvt)
    }    

		// The new cell will also split in the future.
		nextTime = now + akita.VTimeInSec(rand.Float64()*2+0.5)
    if nextTime < 10.0 {
        nextEvt := SplitEvent{
            time: nextTime,
            handler: h,
        }
        h.engine.Schedule(nextEvt)
    }    

		return nil
}
```

When a handler handles one event, it can schedule future events. In our example, one bacteria becomes two when one event is handled. And we schedule the 2 future split events if the events will happen before the 10th second.

Finally, we put the code together in the main program.

```go
func main() {
    engine := akita.NewSerialEngine()
    splitHandler := SplitHandler{
        total: 0,
        engine: engine,
    }  
		  
		engine.Schedule(SplitEvent{
        time: 0,
        handler: &splitHandler,
    })    
		
		engine.Run()    
		fmt.Printf(“Total number at time 10: %d\n”, splitHandler.total)
}
```

In the main function, we first create a serial engine and a `splitHandler`. We then schedule the first split event to create the first bacteria and kick-start the whole simulation. The simulation runs with `engine.Run()`. After the `Run` function returns, all the events have been triggered and simulation is completed. Finally, in the last line of the function, we print the total number of bacteria.

## 2.1.5 Parallel Simulation

Digital circuits intrinsically execute in parallel. This is because each circuit part can only access its input and output registers in a cycle. In other words, if we can isolate the input and output of the simulator components, we can also simulate them in parallel with multiple cores. 

Akita provides a `ParallelEngine` to support parallel simulation. The `ParallelEngine` follows the exact same interface as the serial engine. Therefore, develops of event handlers should almost never need to consider parallel simulation. 

Determining if the `ParalllelEngine` or the `SimulationEngine` should be used fully depends on the simulation configuration. See the following code for how we create either a`SerialEngine` or  a `ParallelEngine`.  This is the only place we need to differentiate if the serial or the parallel engine should be used. 

```go
var engine sim.Engine
if b.useParallelEngine {
	engine = sim.NewParallelEngine()
} else {
	engine = sim.NewSerialEngine()
}
```

<aside>
💬 Q: Can the parallel engine still maintain deterministic execution?

A: No. Since parallel execution is naturally non-deterministic, parallel simulation will also not create deterministic execution results. 

</aside>

So how the `ParallelEngine` is implemented. Here, we want to explain a few key point in the implementation. 

The principle of the parallel execution is that only same-time events can be executed in parallel. We call the events that are scheduled at the same time a round. The `ParallelEngine` first identify the time of the next round and triggers the events in the next round. 

We use one go routine to handle one event. This is a debatable solution. Another solution is to create a fixed number of goroutines that serve as workers and use go channels to dispatch the events. However, we do not find much performance differences. Therefore, we use the simple, one event per goroutine, solution. 

Another concern is that the queue can be a major performance bottleneck due to locking requirement. At the beginning of each round, we trigger events from the queue. While it is triggering, we cannot allow future events to be added to the event queue to prevent race conditions. However, a major part of the event handling is to schedule future events. Then, all these goroutines will have to wait until the queue finishes dispatching. 

To alleviate this problem, we create a multi-queue design. The `ParallelEngine` maintains many queues (we set to the number of cores of the system, defined by `GOMAXPROCS` environment variable). Events are distributed in all these queues, when one queue is done with dispatching, it will be returned to the pool of available queues. This multi-queue design can reduces the blocking latency as later executed events can easily find earlier queues to schedule future events. 

## 2.1.6 Summary

As demonstrate in the example above, Akita defines a minimalistic framework to manage time within the simulation. With a few key concepts including virtual time, frequency, event, handler, and engine, users can already define interesting simulations.