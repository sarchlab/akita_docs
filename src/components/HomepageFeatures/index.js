import clsx from "clsx";
import Heading from "@theme/Heading";
import styles from "./styles.module.css";

const FeatureList = [
  {
    title: "Easy to Build",
    Svg: require("@site/static/img/undraw_docusaurus_mountain.svg").default,
    description: (
      <>
        Akita is designed to boost developer efficiency to quickly prototype
        novel computer architectures.
      </>
    ),
  },
  {
    title: "High Performance",
    Svg: require("@site/static/img/undraw_docusaurus_tree.svg").default,
    description: (
      <>
        Akita delivers high-performance computer architecture simulation through
        innovative features like Smart Ticking, Availability Backpropagation,
        and programmer-transparent parallel simulation.
      </>
    ),
  },
  {
    title: "Observability & Explainability",
    Svg: require("@site/static/img/undraw_docusaurus_react.svg").default,
    description: (
      <>
        Akita provides deep insights into simulations through AkitaRTM for
        real-time monitoring and Daisen for detailed execution analysis, both
        seamlessly supporting all Akita-based simulators.
      </>
    ),
  },
];

function Feature({ Svg, title, description }) {
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

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
