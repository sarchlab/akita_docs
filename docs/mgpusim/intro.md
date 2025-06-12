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