import clsx from "clsx";
import Heading from "@theme/Heading";
import styles from "./styles.module.css";

const UpcomingEvent = [];

const EventList = [
  {
    title: "The 1st Lightweight Workshop on Akita and MGPUSim (Akita '24)",
    link: "https://sarchlab.org/akita/akita24",
  },
];

export default function HomepageSimulators() {
  return (
    <section className="section sectionWhite">
      <div className="sectionContent">
        <h2 className="sectionTitle">Community Events</h2>
        <div className="row">
          <div>
            <ul className={styles.eventList}>
              {EventList.map((props, idx) => (
                <li key={idx}>
                  <a href={props.link} as="h3">
                    {props.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
