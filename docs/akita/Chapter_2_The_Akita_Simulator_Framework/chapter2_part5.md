---
sidebar_position: 5
---

# 2.5 Data Recorder [Ongoing]

Authors: Xuzhong Wang, Yifan Sun

For simulation experiments with Akita, there inevitably comes the demands in recording and storing data for any future analysis. Hence, package datarecording is introduced to implement this feature. Specifically, we realize this functionality with a data writer that convert structs into slices, whose information will then be written into a SQL databse. We also build a data reader that makes previous written records accessible. Through support for retreiving information from input tasks, inserting data into existing tables, and reading data from SQLite database, writer and reader certify data organized and manageable.

## 2.5.1 Entry

Previously in Akita, recording experimental data is dependant on the struct `task` . That means all the data we want to store must firstly be converted into a `task` object. Then we retrieve information from `task`, writing it into SQL databases or CSV files. Now in the data recording package we provide a more “generic” solution: data recorder takes input entry of any struct, retrieving every field of that object, then record the information into a SQL database. This update is accomplished through `reflect` package that enables us to obtain every field and value from an arbitrary object, after which we keep those fields and corresponding value in a map.

Notice there are some restrictions for the input struct. Considering the potential complexity brought by composite objects in which fields refers to another object, we only allow fields listed below to be written into the SQL database. An error will be thrown if entry with invalid fields is recorded with the data recorder.

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

## 2.5.2 Table

Section 2.5.1 expatiates Akita’s capability in retrieving information from input struct, storing the field and corresponding value in a map before writing them to a SQL database. Now, we take a closer look at tables of therecorded data. Given an entry, Akita stores all field names into column header. The following records are then filled with values accordingly. For example, `task1` and `task2` are two entries we want to record. Data recorder firstly extract the field names `ID` and `Name`, feeding them to column header. The values of each entry are then filled into record, as the table below demonstrates. 

```go
	task := struct {
		ID   int
		Name string
	}
	task1 := Task{1, "Task1"}
	taks2 := Task{2, "Task2"}

// The table storing task1 and task2
+----+--------+
| ID | Name   |
+----+--------+
| 1  | Task1  |
| 2  | Task2  |
+----+--------+
```

## 2.5.3 SQLite Writer
Package data recording consists of two structs: `SQLiteWriter` and `SQLiteReader` , with the former object writing data and the latter object reading data from SQL database. `SQLiteWriter` is a composite object that holds a pointer to `sql.DB`. Some other fields in the writer, such as `dbName`, `batchSize`, `tableCount`, and `entryCount` holds metadata for current database. The field `tables` is a map of string to slices, where the strings are tables names, and the slices stores entries(input object) that needs to be written in the given table. Here is the defintion code for `SQLiteWriter`.

```go
// SQLiteWriter is the writer that writes data into SQLite database
type SQLiteWriter struct {
	*sql.DB
	statement *sql.Stmt

	dbName     string
	tables     map[string][]any
	batchSize  int
	tableCount int
	entryCount int
}
```

Two functions are present in `SQLiteWriter` to record data after it connects to a database, as listed below. The first one creates a new table in the SQL database. With a string table name and sample entry given, `SQLiteWriter` created a new slice and put the sample entry into the first position of that slice. Then a key-value pair is created matching table name to the slice, storing the pair into writer’s `tables` field. Similarly, to insert data, we need to provide a string table name and the entry we want to record. `SQLiterWriter` now searches through the `tables` field, checking if any pair has table name identical to the input. If there exists a pair, `SQLiteWriter` retrieves the slice mapped to that table name and appends the entry to that slice; an error will be thrown if no same table name is found.

```go

func (t *SQLiteWriter) CreateTable(table string, sampleEntry any)

func (t *SQLiteWriter) InsertData(table string, entry any)
```

It is worth noting that the previous two functions doesn’t write input entry into our database. Instead, we put this operation into `Flush` function for consistency and stability. Precisely, the `Flush()` function utilizes `reflect` package to retrive every field names and values of the preivous stored entries in `tables`, creating SQL tables based on the given string table name, and filling corresponding records with obtained field value. It iterates through every pair in tables to record all current buffered data, after which tables is pointed to a new empty map. Notice that `Flush()` function is also registered with `atexit` handler, so that even if a user doesn’t manually call this function, `Flush()` will be executed automatically when the program exits. 

```go
func (t *SQLiteWriter) Flush() {
	if t.entryCount == 0 {
		return
	}

	t.mustExecute("BEGIN TRANSACTION")
	defer t.mustExecute("COMMIT TRANSACTION")

	for tableName, storedEntries := range t.tables {
		sampleEntry := storedEntries[0]
		t.prepareStatement(tableName, sampleEntry)

		for _, task := range storedEntries {
			v := structs.Values(task)

			_, err := t.statement.Exec(v...)
			if err != nil {
				panic(err)
			}
		}
	}

	t.tables = make(map[string][]any)
	t.entryCount = 0
}
```

## 2.5.4 SQlite Reader

`SQLiteReader` is devised to access recorded data. This struct’s design is very straightforward, as it only comprised of a pointer to `sql.DB` and string `filename`. After `SQLiteReader` is initialized, it opens the database of the given `filename`. If no SQL database of given name exists, an error will be thrown. This struct can access all table names written inside the databse through `ListTables()` function that returns a slice of strings, whose implementation is shown in the code below. 