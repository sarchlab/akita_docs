---
sidebar_position: 2
---

# Data Recorder

Akita simulations require recording and storing data. Therefore, the `datarecording` package is created to provide a unified interface for recording data. The goal is to record all the data associated with one simulation in a single SQLite database file.

This documents provide guidance on how to use data recording feature of Akita. 

## Create Database and DataRecorder

To start recording data, we need to create a database and a data recorder. The following code snippet demonstrates how to create a database and a data recorder.

```go
dataRecorder := datarecording.NewSQLiteWriter("example.db")
dataRecorder.Init()
```

## Creating a Table

Before recording data, we need to create a table in the database. Since we consider that each data entry in a table is a struct, creating a table only requires providing a sample entry, like the following code snippet.

```go
type Task struct {
	ID   int
	Name string
}

dataRecorder.CreateTable("tasks", task{})
```

Notice there are some restrictions for the input struct. Considering the potential complexity brought by composite objects in which fields refers to another object, we only allow fields listed below to be written into the SQL database. The program will panic if the input struct contains any other types. 

```go
func (t *SQLiteWriter) isAllowedType(kind reflect.Kind) bool {
	switch kind {
	case
		reflect.Bool,
		reflect.Int,
		reflect.Int8,
		reflect.Int16,
		reflect.Int32,
		reflect.Int64,
		reflect.Uint,
		reflect.Uint8,
		reflect.Uint16,
		reflect.Uint32,
		reflect.Uint64,
		reflect.Uintptr,
		reflect.Float32,
		reflect.Float64,
		reflect.Complex64,
		reflect.Complex128,
		reflect.String,
		reflect.UnsafePointer:
		return true
	default:
		return false
	}
}
```

## Insert Data Entries

Data entries can be inserted as the simulation is running. The following code snippet demonstrates how to insert a data entry.

```go
task := Task{ID: 1, Name: "Task 1"}
dataRecorder.Insert("tasks", task)
```