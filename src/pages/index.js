import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import HomepageFeatures from "@site/src/components/HomepageFeatures";
import { useColorMode } from "@docusaurus/theme-common";

import Heading from "@theme/Heading";
import styles from "./index.module.css";
import HomepageSimulators from "../components/HomepageSimulators";
import HomepageEvents from "../components/HomepageEvents";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  const { isDarkTheme } = useColorMode();

  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <Link
        className={clsx("heroLogo", styles.heroLogo)}
        to={siteConfig.customFields.akitalink}
        target="_blank"
      >
        <img
          src={
            isDarkTheme
              ? "/img/akita_logo_dark.png"
              : "/img/akita_logo_white.png"
          }
          alt="Akita Logo"
          className={clsx("heroLogoImg", styles.heroLogoImg)}
        />
      </Link>

      <div className={clsx("heroContent", styles.heroContent)}>
        <Heading as="h1" className={clsx("heroTitle", styles.heroTitle)}>
          {siteConfig.title}
        </Heading>
        <p className={clsx("heroSubtitle", styles.heroSubtitle)}>
          {siteConfig.tagline}
        </p>
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
        <HomepageSimulators />
        <HomepageEvents />
      </main>
    </Layout>
  );
}
