---
sidebar_position: 0
---

# Getting Started with Akita

## Environment Setup

Setting up the environment for Akita is easy. The only requirement is to have a working Go environment. You can follow the instructions [here](https://go.dev/doc/install) to install Go. Akita supports most of the major operating systems running on major architectures. You can test your environment by running the following command:

```bash
go version
```

Go is not difficult to learn. If you are not familiar with Go, there are plenty of YouTube videos. Go also has an excellent tutorial on their website [here](https://go.dev/learn/#tutorials).

## Running a simulation

In theory, if you develop with Akita, you do not need to clone the Akita repo. However, for demonstration purposes, we will clone the Akita repo and run a simple simulation.

```bash
git clone https://github.com/sarchlab/akita.git
cd akita
```

Then, you can run the following command to run a simple simulation:

```bash
cd examples/02_cell_split
go run main.go
```

If you see the the output like the following, you have successfully run your first simulation.

```bash
...
Cell 33 split at 9.9780434027, current count: 74
Cell 38 split at 9.9905839906, current count: 75
Cell count at time 10: 75
```

## What's Next?

Akita users eventually use Akita to build their own simulations. To do this, we will walk through the key features of Akita in the following tutorials. 