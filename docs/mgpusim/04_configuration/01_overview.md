---
sidebar_position: 0
---

# Overview

MGPUSim do not use any configuration files. Instead, it uses code to configure the hardware. We believe code is more expressive and flexible than configuration files. 

All the configuration code is located in the `amd/samples/runner` folder. Understanding the code in this folder allows you to configure the hardware that you want to simulate, by modifying the code. 

MGPUSim uses a hierarchical configuration system. At the outside most level, we define the runner struct and apply global settings. Then within each sub-folder, we define something that is called a `domain`. A domain is a collection of components or other domains with exposed ports. Everything outside the domain can only communicate with the components inside the domain through the exposed ports. 

In the next section, we start with introducing the global settings, which are organized in the `Runner` struct. After that, we dive into each domain. 

