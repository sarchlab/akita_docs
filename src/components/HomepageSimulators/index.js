import clsx from "clsx";
import Heading from "@theme/Heading";
import styles from "./styles.module.css";

const SimulatorList = [
  {
    title: "MGPUSim",
    Svg: require("@site/static/img/undraw_docusaurus_mountain.svg").default,
    description: (
      <>
        MGPUSim is a cycle-accurate GPU simulator that models OpenCL workloads
        running on AMD GCN3 GPU architectures.
      </>
    ),
  },
  {
    title: "TrioSim",
    Svg: require("@site/static/img/undraw_docusaurus_tree.svg").default,
    description: (
      <>
        TrioSim is a trace-driven simulator of DNN workloads, especially on
        large-scale distributed training scenarios.
      </>
    ),
  },
  {
    title: "Zeonica",
    Svg: require("@site/static/img/undraw_docusaurus_react.svg").default,
    description: (
      <>Zeonica provides simulation capabilities for data-flow architectures.</>
    ),
  },
];

function Simulator({ Svg, title, description }) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageSimulators() {
  return (
    <section className="section">
      <div className="sectionContent">
        <div className={styles.centered + " sectionTitle"}>
          Akita Simulators
        </div>
        <div className="row">
          {SimulatorList.map((props, idx) => (
            <Simulator key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
