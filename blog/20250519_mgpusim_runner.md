---
title: A New Runner in MGPUSim
description: We have recently fully rewritten the `runner` package, which serves as the configuration file for MGPUSim.
slug: a-new-runner-in-mgpusim
authors: yifansun
tags: [mgpusim, runner]
hide_table_of_contents: false
---

# A New Runner in MGPUSim

We have recently fully rewritten the `runner` package, which serves as the configuration file for MGPUSim.

<!-- truncate -->

Yet another 3000+/4000- line of code [pull request](https://github.com/sarchlab/mgpusim/pull/173).

## Problems

If you have used MGPUSim before, you may hate the runner code as it is probably the most messy part of the codebase. Now, it is time to rewrite it. 

So, what is the problem before? Several things: 

* The filenames are not easy to understand and search.
* Complex dependencies between different components. 
* There are several simulation-level elements, such as the monitor, the visualization tracer, etc. are mixed in the configuration code. What is worse, every component may have a different way to link with those simulation-level elements.

Therefore, we want to have a new runner that is more organized and easier to understand. 

## Domain-Based Configuration

Two related concepts here: (1) A `Component` is a struct that implements some hardware logic. For example, a command processor, a compute unit, a memory controller, etc. (2) A `Domain` is a collection of components that are connected closely together. For example, we consider a GPU as a domain, which contains a command processor, several compute units, and several memory controllers, etc. 

So the most critical change is to have one package to build each domain. Instead of a flat structure, we now have the file structure as follows:

```
runner/
├── emusystem/
│   ├── emugpu/
│   │   ├── builder.go
│   └── builder.go
├── timingconfig/
│   ├── r9nano/
│   │   ├── builder.go
│   ├── shaderarray/
│   │   ├── builder.go
│   └── builder.go
└── runner.go
```

For example, now, a `ShaderArray` is a domain. For each domain, we have a `builder.go` file that defines the components and how they are internally connected together. Also, the `builder.go` file will determine what components' ports are exposed to the outside of the domain. Even the outside-most level is considered a domain (e.g., `timingconfig`). It just have no exposed ports.

We require an outer-level domain to only interact with the exposed ports of the inside domains. For example, the `r9nano` domain can only interact with the exposed ports of the `ShaderArray` domain. It cannot directly access the `ShaderArray` components.

## Use of `Simulation` Struct from Akita. 

A recent update in Akita is that now we have a `Simulation` struct. It bundles commonly used resources, such as the Data Recorder, the Monitor, and the Visualization Tracer. `Simulation` struct also centrally manages all the components and ports used in the system. The simulation struct totally changed how to link the global resources to the components. 

Previously, we are likely need to pass the `Monitor` and the `DataRecorder` to each builder, which adds complexity and make the code difficult to maintain. Now, we centralize the linking process. 

When a component is created, we need to register it to the `Simulation` struct. But that is all we need to do when we create components. When registering the component, the `Simulation` struct will automatically register it to the monitor. 

For attaching tracers or hooks, we now process them after all the components are created. Since the `Simulation` struct can list all the components, we use a string matching method to identify the components that need to be attached with a tracer or hook. Users can always use a regular expression to match the component name for finer-grained control. 

Below is an example of how to attach a tracer to all the Command Processors in the system. While this is not particularly efficient, since it is only executed once during the configuration, it is still acceptable. 

```go
for _, comp := range s.Components() {
  if strings.Contains(comp.Name(), "CommandProcessor") {
    tracer := tracing.NewBusyTimeTracer(...)
    tracing.CollectTrace(comp, tracer)
  }
}
```

## What's Next?

The MGPUSim runner always provides examples for configuration of Akita-based simulators. So we hope other simulators can follow the pattern. 

There are still some problems with circular dependencies between domains and components. So, we will continue to improve the runner logic. 