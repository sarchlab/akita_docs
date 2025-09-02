---
title: Introducing TLB Middleware in Akita
description: We have updated TLB with new protocols and the TLB Middleware
slug: tlb-middleware-in-akita
authors: [daoxuanxu, huizhizhao]
tags: [akita, tlb]
hide_table_of_contents: false
---

# TLB Middleware in Akita

The Translation Lookaside Buffer (TLB) is a crucial component in virtual memory systems that speeds up virtual-to-physical address translation. We have updated the `tlb` package with our “drain-flush-restart” protocol and implemented middlewares to support higher modularity, flexibility, and efficiency.

`tlbMiddleware` is responsible for managing and executing all internal TLB requests and tasks. It is designed to operate in a pipelined manner, processing up to multiple requests per cycle and maintaining internal state for control flow.

<!-- truncate -->

## Problems
TLB only supports 1-cycle latency when processing requests. Control messages and operational requests are not diversified. TLB functionalities are concentrated and lengthy.

## Work Principle

### Key Components and Features
A. ControlPort Handling(Flush/Restart/switch): Manages incoming control messages, enables reaction to system-level control.

B. State Machine(Enable/Drain/Pause): Specifies actions under different circumstances, ensures that the component works properly if simulation process is somehow paused or stopped.

C. Pipeline: Operates as an intermediate queue to enable multiple requests to be processed.

### Ticking Flow
The basic flow of the `tlbMiddleware` is as follows:

For each "Ticking" cycle, tlbMiddleware first peeks into the controlPort and performs the control message to either perform `Flush`/`Restart` or switch the state of tlbMiddleware between `enable`/`drain`/`pause`.

According to its current state, the middleware executes state-dependent behavior: enabled, draining, or paused.

 - In the `enable` state, the middleware first tries to retrieve and send responded MSHR entries to top via `respondMSHREntry()`. Then, it parses incoming translation responses from lower memory via `parseBottom()`. After generating responses, it ticks the pipeline to retrieve new translation requests and process requests in line via `lookup()`.

- In the `drain` state, the middleware does similar cyclic tasks as in the `enable` state, where it responds to completed MSHR entries and parses incoming translation responses from lower memory. However, when ticking the pipeline, it no longer fetches new requests and only processes remaining requests in the pipeline. After both MSHR and bottomPort are drained to empty, the state will be switched to `pause`.

- In the `pause` state, the middleware does nothing.


With pipeline and actions regulated by different states, tlbMiddleware improves the efficiency of the TLB component in handling requests in parallel.