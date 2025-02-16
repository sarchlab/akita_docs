---
sidebar_position: 4
---

# 2.4 Hooking and Tracing [Ongoing]

Simulator users usually want to export meaningful information from simulations for further analysis. In other simulators, data exporting is typically supported by adding variables and print commands to the component code. However, mixing the data-collecting code with component logic bloats the code and makes the software hard to maintain. Even worse, simulators tend to use Singletons to aggregate data (because all the instances can report data to a centralized location). We consider that Singletons significantly harm the flexibility of the code, making it difficult to adapt to users’ needs. To solve this problem and to ensure both flexibility and elegant code, we employ the Observer Pattern. Specifically, we introduce the Hooks and Tracers to decouple the hardware logic and the need to collect data from the simulator. 

## 2.4.1 Hooks

A hook is a piece of software that can be called when certain actions happen. Such actions can be the start of an event handling or when an element is popped from a buffer. Everything related to Hooks is implemented in `sim/hook.go`.

Any element that can accept hooks is called a hookable. Developers need to invoke the hooks at certain locations in the hookable code. For example, the event-driven simulation engine is a hookable. And the following hook-invoking code is used before the event-driven simulation engine triggers an event. 

```go
hookCtx := HookCtx{
	Domain: e,
	Pos:    HookPosBeforeEvent,
	Item:   evt,
}
e.InvokeHook(hookCtx)
```

Central to the example is the `InvokeHook` function. This function is provided in the `HookableBase` struct. So any hookable that can simply embed the `HookableBase` struct to avoid reimplementing the methods related to hookables in every struct. When the `InvokeHook` function is called, all the hooks that are attached to the current hookable is invoked. 

The `InvokeHook` method needs an argument, named as `HookCtx` (hook context). The hook context is a struct with three fields, including the domain, the position (`pos`) and the item. The domain is the hookable. The item is the object of the action. In this example, since the hook is about the triggering of an event, the item is the event. Finally, we need a position field to describe what is happening. 

The position field needs an variable with type `HookPos`. Developers should define all the possible hook positions as package-level, exported, variables. For example, when defining event-handling related positions, we use the following code. These two lines of code do not belong to any function. 

```go
// HookPosBeforeEvent is a hook position that triggers before handling an event.
var HookPosBeforeEvent = &HookPos{Name: "BeforeEvent"}

// HookPosAfterEvent is a hook position that triggers after handling an event.
var HookPosAfterEvent = &HookPos{Name: "AfterEvent"}
```

It is also easy to implement a hook. A hook only needs to define a function named `Func`, which takes the `HookCtx` as an argument. The `Func` can decide what to do according to the `Domain`, `Pos`, or `Item`. For example, the code below is a simplified version of an `EventLogger`, which simply dumps all the events triggered before each event is handled. 

```go
// EventLogger is an hook that prints the event information
type EventLogger struct {
	...
}

// Func writes the event information into the logger
func (h *EventLogger) Func(ctx HookCtx) {
	if ctx.Pos != HookPosBeforeEvent {
		return
	}

	evt, ok := ctx.Item.(Event)
	if !ok {
		return
	}

	
	fmt.Printf(...)
}
```

In this example, we can see that the hook first checks the `ctx.Pos`. It only cares about the `HookPosBeforeEvent` position. Also, it doublechecks if the item is an event. It both criterions meet, the hook prints the event information. Note that the hookable may invoke hooks for many different reasons and at various positions. Therefore, it is the hook’s responsibility to determine if an action need to be taken. 

The configuration code needs to associate the desired hook to hookables, deciding what data to collect. To attach a hook to an hookable, we can simply call the `AcceptHook` method of the hookable. For example, to attach the `EventLogger` to an engine, we can use the following code. 

```go
var engine sim.Engine
engine = sim.NewSerialEngine()

engine.AcceptHook(sim.NewEventLogger(log.New(os.Stdout, "", 0)))
```

## 2.4.1 Basic Concepts of Tracing

Hook provides the fundamental mechanism to collect data. However, it is a bit too flexible. Users and developers may need a more structured guidance on what data to collect. Therefore, we build the tracing system on top of the hooking system. 

// Yifan stopped here.

The purpose of running a simulation is to acquire performance metrics. Akita uses a tracing system to allow users to extract desired performance metrics from the simulator. The tracing system is mainly composed of two parts: the simulation annotating API and the tracers. Tracing is implemented at gitlab.com/akita/util/tracing.

### Annotating API

**Tasks**

The core concept in the tracing system is "Task", which describes a multi-cycle action performed by a component. The execution of an instruction, a cache access, and a DRAM transaction are all examples of tasks. A task is represented using the following struct definition.

```go
type Task struct {
	ID        string           `json:"id"`
	ParentID  string           `json:"parent_id"`
	Kind      string           `json:"kind"`
	What      string           `json:"what"`
	Where     string           `json:"where"`
	StartTime akita.VTimeInSec `json:"start_time"`
	EndTime   akita.VTimeInSec `json:"end_time"`
	Steps     []TaskStep       `json:"steps"`
	Detail    interface{}      `json:"-"`
}
```

The fields of a task are straightforward. Each task has a unique `ID`. A user can use `akita.GetIDGenerator().Generate()` to acquire a unique ID (unique within the simulation run, consistent across multiple runes). Each task should also have a Parent task, identified by the `ParentID` field. For example, if a cache access task is generated from the execution of an instruction, then the instruction task is the parent task of the cache access task. `Kind` and `What` denote the action of the task. `Where` is the name of the component that carries out the task. `StartTime` and `EndTime` represent when the task is started and completed. Also, users are allowed to attach any extra information in the `Detailed` field. We will talk about the `Steps` field later. 

When a developer implements a component, the developer needs to annotate the component using the annotating APIs. When the task starts, the `StartTask` function needs to be called. When the task finishes, the `EndTask` function needs to be called.  Here are the function signatures for `StartTask` and `EndTask`. Most of the fields are straightforward. The only exception is the field `domain`, which represents where the task happens. A domain is typically an Akita component.

```go
func StartTask(
	id string,
	parentID string,
	now akita.VTimeInSec,
	domain NamedHookable,
	kind string,
	what string,
	detail interface{},
)

func EndTask(
	id string,
	now akita.VTimeInSec,
	domain NamedHookable,
)
```

**Request-Based Tasks**

A received request is a task to complete. Therefore, Akita provides convenient APIs to record request-based tasks. 

Suppose we have a core connecting to an L1 cache. When the core wants to send a read request to the L1 cache, it creates the request in the current cycle. We say this is the cycle that the request is **Initiated**. The core then sends the message through a interconnect to the L1 cache. The request may also be buffered at the L1 cache for a while before it can be processed. We say the cycle that the L1 cache starts to process the request is the cycle that the request is **Received.** After a few cycles, the L1 cache may have the data ready and can send the response back to the core. We say this is the cycle that the request is **Completed.** Finally, it takes a few extra cycles for the core to receive the response. We say the cycle that the core receives the response to be the cycle that the request is **Finalized**. 

Following this terminologies, Akita provides 4 APIs:

```go
func TraceReqInitiate(msg akita.Msg, now akita.VTimeInSec, domain NamedHookable, taskParentID string)
func TraceReqReceive(msg akita.Msg, now akita.VTimeInSec, domain NamedHookable)
func TraceReqComplete(msg akita.Msg, now akita.VTimeInSec, domain NamedHookable)
func TraceReqFinalize(msg akita.Msg, now akita.VTimeInSec, domain NamedHookable)
```

These 4 APIs create and complete 2 tasks. The `TraceReqInitiate` API and the `TraceReqFinalize` API create a task with the `req_out` kind. The `TraceReqReceive` and the `TraceReqComplete` create a task with the `req_in` kind. The `req_in` task is a subtask of the `req_out` task. The ID of the `req_in`task can be found using a combination of the request message and the domain, by calling this function

```go
func MsgIDAtReceiver(msg akita.Msg, domain NamedHookable) string
```

**Task Steps**

In many cases, tracing at the granularity of tasks is not detailed enough. For example, if a cache access is a task recorded without any extra information, we will have no idea if it is a cache hit or a cache miss. Tagging in the simulator code can solve this problem. The tagging API is also simple:

```go
func AddTaskStep(id string,	now akita.VTimeInSec,	domain NamedHookable,	what string) 
```

### **Tracer**

Tracers are a type of structs that can handle the annotating trace API calls. The interface of a tracer is very simple, as it simply defines the action when a task starts, when a task ends, and when we annotate the task steps.

```go
type Tracer interface {
	StartTask(task Task)
	StepTask(task Task)
	EndTask(task Task)
}
```

Although the Tracer interface is very simple, tracers can be versatile. For example, Akita provides a `BusyTimeTracer` which can measure the time that a component is running at least one component, which can be used to measure performance and measure hardware utilization. `AverageTimeTracer` can calculate the average time of tasks. We use this tracer to measure the average request handling time for caches, understanding how efficient the caches are. Akita also provides `StepCountTracer`, which we use to count the number of cache hits and misses. Finally, we provide a `MySQLTracer` and a `MongoDBTracer`, which can store all the tasks into a MySQL or a MongoDB database. 

Most of the first-party tracers supports a task filter so that the tracer can records a specific type of tasks. A task filter is a call back function defined as 

```go
type TaskFilter func(t Task) bool
```

When creating a tracer, the method can take a task filter function as an argument. The task is only considered when the task filter returns true. For example, in MGPUSim, when creating an `AverageTimeTracer` for a cache unit to measure the average request latency, we add a simple inline function. 

```go
tracer := tracing.NewAverageTimeTracer(
				r.platform.Engine,
				func(task tracing.Task) bool {
					return task.Kind == "req_in"
				})
```

In case if a user wants to tell the average request time for read and write requests separately, the solution should be creating two different tracers with different filters that filters according to both the `Kind` and the `What` field of the task. 

Users can select from which component to collect trace. The API to attach a tracer to a component is `func CollectTrace(domain NamedHookable, tracer Tracer)`.