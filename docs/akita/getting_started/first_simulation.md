---
sidebar_position: 1
---

# Writing Your First Simulation

## Creating a Code Repository

To create a new simulation, let's start by creating a new Git repository. I assume you know how to do this step and have already created a new repository with a path `github.com/user/simulator`.

To start, you actually do not need to install or clone Akita. Go will automatically manage the dependencies for you. You can start by creating a new Go module by using the following command in your repositories's root directory.

```bash
go mod init github.com/user/simulator
```

This will create a new `go.mod` file in the root of your repository. You can then add Akita as a dependency to your module by adding the following line to the `go.mod` file:

```go
require github.com/sarchlab/akita/v4 v4.X.X
```

Please make sure to use the latest version of Akita. 

## Creating a New Simulation

Next, you can create a new file `main.go` in the root of your repository and add the following code:

```go
package main

import (
	"github.com/sarchlab/akita/v4/sim"
	"github.com/sarchlab/akita/v4/simulation"
)

func main() {
	s := simulation.MakeBuilder().Build()
	e := s.GetEngine()

	err := e.Run()
	if err != nil {
		panic(err)
	}

	s.Terminate()
}
```

With the above code, you have create a simulation, although the simulation is not doing anything. Dissecting the code, we see that we have created a simulation and terminated it at the very end. In between, we get the engine from the simulation and run the engine. 

## Creating an Event Handler

The task for you is to tell the simulation what will happen and what to do when something happens. To do this, you will need to create an event handler to trigger the desired action. 

For example, we can create a event handler that prints the time of the event.

```go
type EventPrinter struct {
}

func (e *EventPrinter) Handle(event sim.Event) error {
	fmt.Printf("Event: %.10f\n", event.Time())

	return nil
}
```

Then, in the main function, we can create an event and schedule it to the engine.

```go
handler := &EventPrinter{}
evt := sim.NewEventBase(1, handler)

e.Schedule(evt)
```

Here, we simply use the base event as an event that do not carry any information. We schedule the event to be trigger at time 1.0 second. When the `Run` method of the engine is called, the event will be triggered at the right time and the `Handle` method of the event handler will be called.

## What's Next?

Congratulations! You have just created your first simulation. Next, we will create some more complex simulations that involve more events. 






