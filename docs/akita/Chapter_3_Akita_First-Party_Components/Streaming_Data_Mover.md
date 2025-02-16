# Streaming Data Mover

Authors: Xuzhong Wang, Yifan Sun

 

```go

type DataMover interface {
     Tick()
     send()
     parseFromCtrlPort()
     handleDataMoveReq()
     handleSrc()
     parseFromSrc()
     processDataReady()
     processWriteDone()
     sendReqToOutside()
     
}
```

SDM draft:

1 port receive message from data source to data destination

1 port send read request from data source, finished with data ready signal

1 port send write request to data destination, finished with write finished signal

Process complete with cmd done signal to request source

[https://lh7-rt.googleusercontent.com/docsz/AD_4nXe66cYibb9ZdB0bV7c55LpSUkaCOtFuIjp3nb__cd-botQseAMkcqIa1eQoQwMQ-ZN8ZHS8jREqo3lNctXzJca-HaIwaIseicZdu61GeXtQ6xaCkWWVTLOE8vMyUzTO3h_cfkb1cOgGwD7HMxH2cRH679Y?key=iYkfuOlqXFKk4e_62rHe5g](https://lh7-rt.googleusercontent.com/docsz/AD_4nXe66cYibb9ZdB0bV7c55LpSUkaCOtFuIjp3nb__cd-botQseAMkcqIa1eQoQwMQ-ZN8ZHS8jREqo3lNctXzJca-HaIwaIseicZdu61GeXtQ6xaCkWWVTLOE8vMyUzTO3h_cfkb1cOgGwD7HMxH2cRH679Y?key=iYkfuOlqXFKk4e_62rHe5g)

Reference: component, reorder buffer, address translator

Alternative: DMA, pagemigrationcontroller