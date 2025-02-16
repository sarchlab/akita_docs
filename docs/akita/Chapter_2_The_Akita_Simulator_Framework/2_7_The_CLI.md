---
sidebar_position: 7
---
# 2.7 The CLI

Description: user can create a comp through command line interactions.

Develop process:

- Install cobra
- Make sure $GOPATH/bin directory is in your $PATH.
- Create new dir **akita** in akita
- cd to the new dir
- First, type `go mod init akita` to establish go.mod
- Then, follow cobra instructions, initialize a **Cobra CLI application** with command cobra-cli init in the new dir so that a standard frame is set up to be modified

NOTE: if you create a dir manually first, then use cobra-cli init command to build cobra cli. Otherwise, use cobra-cli init [filename]  when the command is not built.

Call to function: 

**go build -> go install -> akita [command]**

**go run main.go [command]**

Problems encountered

1. If the external function used in the cmd go file does not belong to packages in the application dir (i.e. akita/akita in this case), we should import the package with **full module path** as "github.com/sarchlab/akita/v4/sim" instead of “sim”
2. Make sure the application name “akita”is referenced correctly in the entire project (especially if the name was refactored)
3. Make sure variables declared in the func in the cmd file is used