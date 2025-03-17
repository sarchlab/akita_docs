---
sidebar_position: 5
---

# Data Recorder

Akita simulations require recording and storing data. Therefore, the `datarecording` package is created to provide a unified interface for recording data. The goal is to record all the data associated with one simulation in a single SQLite database file.

This document provides guidance on how to use the data recording feature of Akita.

## Create Database and DataRecorder

To start recording data, we need to create a database and a data recorder. The following code snippet demonstrates how to create a database and a data recorder.

```go
dataRecorder := datarecording.NewDataRecorder("example")
```

This will create a SQLite database file named "example.sqlite3" in the current directory.

You can also create a data recorder with an existing database connection:

```go
db, err := sql.Open("sqlite3", "example.sqlite3")
if (err != nil) {
    panic(err)
}
dataRecorder := datarecording.NewDataRecorderWithDB(db)
```

## Creating a Table

Before recording data, we need to create a table in the database. Since we consider that each data entry in a table is a struct, creating a table only requires providing a sample entry, as in the following code snippet:

```go
type Task struct {
    ID   int
    Name string
    Age  int
}

dataRecorder.CreateTable("tasks", Task{})
```

All fields from the struct will be automatically stored in the database as columns.

### Improving Query Performance with Struct Field Tags (Optional)

For large datasets, you can improve query performance by adding indexes to specific fields using struct tags. These tags are completely optional but can significantly speed up data retrieval.

Here's an example using struct field tags:

```go
type Task struct {
    ID   int    `akita_data:"unique"` // Create a unique index on ID field
    Name string `akita_data:"index"`  // Create a regular index on Name field
    Age  int    `akita_data:"ignore"` // This field will not be stored
}

dataRecorder.CreateTable("tasks", Task{})
```

The following tags are supported:

- `akita_data:"unique"`: Creates a unique index on the field, which improves query performance when searching by this field and enforces uniqueness
- `akita_data:"index"`: Creates a regular index on the field, which improves query performance for filters and sorting
- `akita_data:"ignore"`: The field will not be stored in the database

Adding indexes can significantly improve performance when querying large datasets, but may slightly slow down data insertion.

### Type Restrictions

Notice there are some restrictions for the input struct. Considering the potential complexity brought by composite objects in which fields refer to another object, we only allow primitive types to be written into the SQL database. The program will panic if the input struct contains any other types.

```go
func (t *sqliteWriter) isAllowedType(kind reflect.Kind) bool {
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
        reflect.Float32,
        reflect.Float64,
        reflect.Complex64,
        reflect.Complex128,
        reflect.String:
        return true
    default:
        return false
    }
}
```

## Insert Data Entries

Data entries can be inserted as the simulation is running. The following code snippet demonstrates how to insert a data entry.

```go
task := Task{ID: 1, Name: "Task 1", Age: 30}
dataRecorder.InsertData("tasks", task)
```

Note that the entry to be inserted must be of the same type as the sample entry provided when creating the table. Fields marked with `akita_data:"ignore"` will not be stored in the database.

## Flushing Data to Disk

Data entries are buffered in memory and written to disk when the buffer is full or when explicitly requested. The default buffer size is 100,000 entries. You can explicitly flush the data using:

```go
dataRecorder.Flush()
```

The data recorder will also automatically flush all buffered data when the program exits.

## Listing Tables

To get a list of all tables in the database:

```go
tableNames := dataRecorder.ListTables()
for _, name := range tableNames {
    fmt.Println("Table:", name)
}
```

## Closing the Data Recorder

When you're done with the data recorder, you can close it:

```go
dataRecorder.Close()
```

## Reading from a Database

To read data from a previously created database, you can use the Reader:

```go
reader := datarecording.NewReader("example.sqlite3")
reader.MapTable("tasks", Task{})
```

### Querying Data

To query data from a table:

```go
results, columns, err := reader.Query("tasks", datarecording.QueryParams{})
if err != nil {
    panic(err)
}

for _, result := range results {
    task := result.(*Task)
    fmt.Printf("ID: %d, Name: %s\n", task.ID, task.Name)
}
```

When you're done with the reader, close it:

```go
reader.Close()
```

## Complete Example

Here's a complete example of using the data recorder:

```go
package main

import (
    "fmt"
    "os"

    "github.com/sarchlab/akita/v4/datarecording"
)

type Task struct {
    ID   int    `akita_data:"unique"`
    Name string `akita_data:"index"`
    Age  int    `akita_data:"ignore"`
}

func main() {
    dbPath := "test"
    recorder := datarecording.NewDataRecorder(dbPath)
    
    task1 := Task{1, "task1", 30}
    recorder.CreateTable("test_table", task1)
    
    task2 := Task{2, "task2", 15}
    recorder.InsertData("test_table", task2)
    recorder.Flush()
    
    tables := recorder.ListTables()
    fmt.Printf("Table: %s\n", tables[0])
    
    recorder.Close()
    
    reader := datarecording.NewReader(dbPath + ".sqlite3")
    reader.MapTable("test_table", Task{})
    
    results, _, err := reader.Query("test_table", datarecording.QueryParams{})
    if err != nil {
        panic(err)
    }
    
    for _, result := range results {
        task := result.(*Task)
        fmt.Printf("ID: %d, Name: %s\n", task.ID, task.Name)
    }
    
    reader.Close()
    
    os.Remove(dbPath + ".sqlite3")
}
```