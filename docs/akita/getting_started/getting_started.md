---
sidebar_position: 1
---

# Getting Started with Akita

## Environment Setup

The only requirement is to have a working Go environment. Akita supports most of the major operating systems running on major architectures. You can test your environment by running the following command:

```bash
go version
```

Go is not difficult to learn. If you are not familiar with Go, there are plenty of YouTube videos. Go also has an excellent tutorial on their website [here](https://go.dev/learn/#tutorials).

## Writing Your First Simulation

To create a new simulation, let's start by creating a new Git repository. I assume you know how to do this step and have already created a new repository with a path `github.com/user/simulator`.

To start, you actually do not need to install or clone Akita. Go will automatically manage the dependencies for you. You can start by creating a new Go module by using the following command in your repositories's root directory.

```bash
go mod init github.com/user/simulator
```

This will create a new `go.mod` file in the root of your repository. You can then add Akita as a dependency to your module by adding the following line to the `go.mod` file:

```go
require github.com/sarchlab/akita/v3 v3.X.X
```

Next, you can create a new file `main.go` in the root of your repository and add the following code:

```go
package main

import (
	"github.com/sarchlab/akita/v4/sim"
)

func main() {
	simulation.
}
```
