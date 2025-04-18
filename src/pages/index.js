import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import HomepageFeatures from "@site/src/components/HomepageFeatures";

import Heading from "@theme/Heading";
import styles from "./index.module.css";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <div className="heroBanner">
          <Link
            className="heroLogo"
            to={siteConfig.customFields.akitalink}
            target="_blank"
          >
            <img
              src="/img/akita_logo.png"
              alt="Akita Logo"
              className="hero__logo--img"
            />
          </Link>
        </div>
        <div className="heroContent">
          <Heading as="h1" className="heroTitle">
            {siteConfig.title}
          </Heading>
          <p className="heroSubtitle">{siteConfig.tagline}</p>
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="Description will go into a meta tag in <head />"
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
