# Runner

The `Runner` struct serves as the central orchestrator in the MGPUSim simulator, managing the execution of GPU benchmarks. It provides a high-level interface for configuring the simulation environment, with the `Init` method, and running benchmarks, with the `Run` method, abstracting away the complexities of hardware simulation.

## Hardware Configuration (Init)

The `Init()` method is responsible for setting up the simulation environment. Let's list the code here:

```go
// Init initializes the platform simulate
func (r *Runner) Init() *Runner {
	r.parseFlag()

	log.SetFlags(log.Llongfile | log.Ldate | log.Ltime)

	r.initSimulation()

	if r.Timing {
		r.buildTimingPlatform()
	} else {
		r.buildEmuPlatform()
	}

	r.createUnifiedGPUs()

	return r
}
```

In general, the `Init` method performs 4 main steps, including (1) parsing command-line flags, (2) initializing the simulation, (3) building the hardware platform to be simulated, and (4) creating the unified GPUs. In this section, we will focus on (2) and (3). 

### 1. Initialize the simulation

In the first step, we initialize the simulation. The code for the `initSimulation` method is simple as it calls the simulation builder to build the simulation struct. The only configuration we do here is to enable parallel execution if the `-parallel` flag is set. The simulation builder will build the event-driven simulation engine, AkitaRTM, and visualization tracer. 

```go
func (r *Runner) initSimulation() {
	builder := simulation.MakeBuilder()

	if *parallelFlag {
		builder = builder.WithParallelEngine()
	}

	r.simulation = builder.Build()
}
```

### 2. Build the hardware platform

In the second step, we build the hardware platform to be simulated. Here, we consider two cases: timing simulation and emulation. They have fully different hardware configurations.

Let's take a look at the code for the `buildEmuPlatform` method.

```go
func (r *Runner) buildEmuPlatform() {
	b := emusystem.MakeBuilder().
		WithSimulation(r.simulation).
		WithNumGPUs(r.GPUIDs[len(r.GPUIDs)-1])

	if *isaDebug {
		b = b.WithDebugISA()
	}

	r.platform = b.Build()
}
```

You can consider that building the emulation platform is just building a domain that has no exposed ports. To build a domain, we use the domain's builder. 

In MGPUSim, we use "With" functions to set the properties. For example, here, `WithSimulation` is used to set the simulation struct and `WithNumGPUs` is used to set the number of GPUs to simulate.

There is a convention in MGPUSim that the builder's "With" functions can be chained, like the example above, as each "With" function returns the builder. Just be careful, if you need to change a configuration outside the chain, make sure you assigned the builder back to the variable. Otherwise, the builder will not be updated. Finally, we call the `Build` function to build the domain. 

For the timing platform, the logic is similar (see the code below). The only difference is that we setup sampled engine at the beginning and we setup the reporter and visualization tracer at the end. We will talk about the reporter and visualization tracer in the next section. 

```go
func (r *Runner) buildTimingPlatform() {
	sampling.InitSampledEngine()

	b := timingconfig.MakeBuilder().
		WithSimulation(r.simulation).
		WithNumGPUs(r.GPUIDs[len(r.GPUIDs)-1])

	if *magicMemoryCopy {
		b = b.WithMagicMemoryCopy()
	}

	r.platform = b.Build()

	r.reporter = newReporter(r.simulation)
	r.configureVisTracing()
}
```

## Benchmark Execution (Run)

The `Run()` method orchestrates the execution of benchmarks. It works like the main program of a simulation that defines major steps. The code is as follows:

```go
func (r *Runner) Run() {
	r.Driver().Run()

	var wg sync.WaitGroup
	for _, b := range r.benchmarks {
		wg.Add(1)
		go func(b benchmarks.Benchmark, wg *sync.WaitGroup) {
			if r.Verify {
				if b, ok := b.(verificationPreEnablingBenchmark); ok {
					b.EnableVerification()
				}
			}

			b.Run()

			if r.Verify {
				b.Verify()
			}
			wg.Done()
		}(b, &wg)
	}
	wg.Wait()

	if r.reporter != nil {
		r.reporter.report()
	}

	r.Driver().Terminate()
	r.simulation.Terminate()
}
```

The code is a bit complex. The main difficulty comes from the requirement of supporting multiple benchmarks running concurrently. Let's remove the need, and instead, see a simpler version of the code. 

```go
func (r *Runner) Run() {
	r.Driver().Run()

	b.Run()

	if r.Verify {
		b.Verify()
	}

	if r.reporter != nil {
		r.reporter.report()
	}

	r.Driver().Terminate()
	r.simulation.Terminate()
}
```

After trimming the code, we can simply reduce the code into 4 steps before cleaning up the simulation. These steps include (1) launching the GPU driver, (2) executing the benchmark, (3) verifying the result, and (4) reporting the performance.
