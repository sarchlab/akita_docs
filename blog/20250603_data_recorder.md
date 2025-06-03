---
title: Introducing the Data Recording Package in Akita
description: We have added a dedicated package for data recording in Akita.
slug: data-recording-package-in-akita
authors: [xuzhongwang, yifansun]
tags: [akita, datarecording]
hide_table_of_contents: false
---

# Introducing the Data Recording Package in Akita

We have added a dedicated package for data recording in Akita.

<!-- truncate -->

## Problems

In the past, we use rather ad-hoc methods to record data in Akita. For example, MGPUSim metrics are dumped into a CSV file named `metrics.csv` in the working directory. Daisen traces are recorded in a SQLite file. We also collect traces for Vis4Mesh, but the code was not fully integrated into the main codebase. We consider this is not a good practice as users may not be able to find the data and matches the data with the simulation executed. 

## Solution

We create a dedicated service package called `datarecording` to record data in Akita. With `datarecording`, we can record all the data from one simulation run into a SQLite file. Different data types are stored in different tables. Users can use a few simple APIs to record any type of data easily. 

## How to Use

It is very easy to use `datarecording` service package. It only takes a few simple steps. 

First, create a new data recorder:

```go
recorder := datarecording.NewDataRecorder("data")
```

Alternatively, rather than creating a `DataRecorder` object, we recommend to directly create a `Simulation` object, which automatically creates several elements, including the `Engine`, the `DataRecorder`, the AkitaRTM `Monitor`, and the Daisen `VisTracer`. Then, users can simply use `simulation.GetDataRecorder()` to retrieve the `DataRecorder` object.

```go
s := simulation.MakeBuilder().Build()
recorder := s.GetDataRecorder()
```

Then, users can create a table that represent a certain type of data. For example, to record the metrics of a simulation, users can create a table called `metrics` with the following code:

```go
type metric struct {
	Location string
	What     string
	Value    float64
	Unit     string
}

recorder.CreateTable("metrics", metric{})
```

Here, we pass a `metric` struct to the `CreateTable` function. The `metric` struct serves as the schema of the table. 

:::warning
All the fields in the struct must be exported. The `datarecording` package will use reflection to create the table schema. The struct itself can be unexported. Also, the struct must be a plain struct. No list, maps, or other complex types are allowed.
:::

After creating the table, users can record data into the table by calling `InsertData` method. For example, to record a metric, users can call the following code:

```go
recorder.InsertData("metrics", metric{
	Location: "GPU",
	What:     "Memory Usage",
	Value:    100,
	Unit:     "MB",
})
```

## Performance Optimization

Often, we want to create indices on fields to define data constrains or speed up data retrieval. We allow users to add struct tags to the fields to specify the index. For example, to create an index on the `Location` field, users can add the following tag to the `Location` field:

```go
type metric struct {
	ID       int    `akita_data:"unique"`
	Location string `akita_data:"index"`
	What     string
	Value    float64
	Unit     string
}
```

The `akita_data:"index"` tag will create an index on the `Location` field. The `akita_data:"unique"` tag will create a unique index on the `ID` field.

## Recording the Execution

Every time a data recorder is created, we always record the execution information into a table called `exec_info`. The tables contains a few fields, including the working directory, the command line arguments, the start time, and the end time.

## What's Next?

Providing easy analysis capability is always a main goal of Akita. We will continue to add more features to the `datarecording` package to make it easier to use. Moreover, we will adapt the current simulator code to use the `datarecording` package. For more information, please refer to the [documentation](/docs/akita/getting_deeper/data_recorder).