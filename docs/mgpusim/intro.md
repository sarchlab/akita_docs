---
sidebar_position: 1
---

# Getting Started

## Introduction

In this document, we introduce how to setup the simulation environment and run a sample experiment. This tutorial targets Linux OS. But you should be able to run the simulator on Windows and Mac OS with similar commands. 

## Prerequisites

* Install [Go](https://golang.org/).
* Clone MGPUSim repository `https://github.com/sarchlab/mgpusim`. 

## Run Samples

A set of sample experiments are located in `[mgpusim_root]/amd/samples` folder. Suppose we want to run the FIR benchmark, we can `cd` into the `fir` folder and run:

```bash
go build
```

This command would download all the dependencies and compile the simulator and the experiment. The output binary file should be named as `fir`. You can run `./fir -h` for help information, and run the two commands as follow for functional emulation and detailed timing simulation.

```bash
./fir            # For functional emulation
./fir -timing    # For detailed simulation
```

## What Are in the `samples` Directory?

Samples directory mainly contains a list of ready-made programs that can run a set of benchmarks in MGPUSim. For example, `aes`, `atax`, etc. are all main programs that can run a benchmark, suggested by the name of the directory, in MGPUSim. 

A few special folders that present special ways of runner benchmarks. For example, `concurrent_kernel` and `concurrent_workload` allows users to run multiple benchmarks in one hardware platform in parallel, testing multi-tenant execution. The difference between these two directory is how the workloads are executed, `concurrent_kernel` allows multiple kernels to concurrently execute in one GPU, while `concurrent_workload` places workloads in different GPUs.

A special case is the `runner` directory. The `runner` directory contains the configuration files, which are still Go code, that configures the hardware platform under simulation. 
