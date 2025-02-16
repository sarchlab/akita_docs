# Developing MGPUSim

## Using a Local Version of Akita

We may need to modify the Akita repository and apply the changes to MGPUSim experiments. The Go environment perfectly supports this requirement. Here, we assume that the MGPUSim and Akita are cloned alongside each other. Then, in the MGPUSim repository, there is a `go.mod` file. We can add the following line to the file. 

```go
replace github.com/sarchlab/akita/v3 => ../akita
```

With this line, the Go compiler will prefer the local Akita over the remote version. This method also applies to other dependency repositories.