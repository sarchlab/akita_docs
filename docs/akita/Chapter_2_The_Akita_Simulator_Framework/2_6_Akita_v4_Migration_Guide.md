---
sidebar_position: 6
---


# 2.6 Akita v4 Migration Guide

## Search and Replace

Replacement (…/v3 → …/v4)

1. akita/v3 → akita/v4
2. akita/v3 3.0.0 → akita/v4 4.0.0-alpha.3
3. mgpusim/v3 → mgpusim/v4

go get [github.com/sarchlab/mgpusim/v4/samples/runner](http://github.com/sarchlab/mgpusim/v4/samples/runner)
go get [github.com/sarchlab/mgpusim/v4/timing/cp](http://github.com/sarchlab/mgpusim/v4/timing/cp)
go get [github.com/sarchlab/mgpusim/v4/timing/cu](http://github.com/sarchlab/mgpusim/v4/timing/cu)

(Global change?)

## Compile Error Debug Record

pkg: driver

file: driver.go

## Test Error Debug

## Mock

## Changes to Port APIs

The v4 port API changes from Retrieve to `RetrieveIncoming` and Peek to `PeekIncoming`. So, if the code is in a component, it is safe to replace all `Retreive` to `RetrieveIncoming` and `Peek` to `PeekIncoming.`

## Changes to Time Management

Ticker

**TimeTeller**

Previously, builders require a engine field. Now, we require a `TimeTeller` and a `EventScheduler` field.