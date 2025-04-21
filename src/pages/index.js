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
import HomepagePapers from "../components/HomepagePapers";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  const { isDarkTheme } = useColorMode().colorMode == "dark";

  return (
    <header className="section">
      <div className="sectionContent sectionContentCentered">
        <div className={styles.row}>
          <Link
            className={clsx("heroLogo", styles.heroLogo)}
            to={siteConfig.customFields.akitalink}
            target="_blank"
          >
            <div className={styles.heroLogoImg} />
          </Link>

          <div className={styles.heroContent}>
            <Heading as="h1" className={clsx("heroTitle", styles.heroTitle)}>
              {siteConfig.title}
            </Heading>
            <p className={clsx("heroSubtitle", styles.heroSubtitle)}>
              Computer architecture simulation with
              <br />
              good user and developer experiences.
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={`${siteConfig.title}`} description={`${siteConfig.tagline}`}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <HomepageSimulators />
        <HomepageEvents />
        <HomepagePapers />
      </main>
    </Layout>
  );
}
