import React from "react";
import './experience.css';
import bg from "../../assets/reffing-modified.png";
import Accordion from "../Accordion/accordion.jsx";

const Experience = () => {
    const data = [
        {
            id: 0,
            label: "Waterloo Rocketry",
            renderContent: () => (
                <div id="dropdownText">
                    <figure className="shift">
                        <figcaption className="underline">Jan. 2024 - Present</figcaption>
                        <ul>
                            <li>
                                Working on the controls subsystem to learn embedded software development with C, MPLAB, and KiCad.
                            </li>
                            <li>
                                Learning machine shop techniques to machine parts accurate to less than a hundredth of an inch.
                            </li>
                        </ul>
                    </figure>
                </div>

            ),
        },
        {
            id: 1,
            label: "Umpire - Baseball Ontario",
            renderContent: () => (
                <div id="dropdownText">
                    <figure className="shift">
                        <figcaption className="underline">May 2018 - Present</figcaption>
                        <ul>
                            <li>Worked up to officiating high-level rep games across different age groups, including eight tournament championships.</li>
                            <li>Used interpersonal communication skills to resolve conflict in a calm and respectful manner.</li>
                            <li>Fostered an environment of development by applying feedback from senior colleagues and providing feedback to junior umpires.</li>
                            <li>Officiated over 200 games.</li>
                            <li>Level 2.3 (level 3 next season!).</li>
                        </ul>
                    </figure>
                </div>
            ),
        },
        {
            id: 2,
            label: "Referee - Ontario Minor Hockey Association",
            renderContent: () => (
                <div id="dropdownText">
                    <figure className="shift">
                        <figcaption className="underline">Sep. 2019 - Aug. 2023</figcaption>
                        <ul>
                            <li>Officiated hockey across various levels, including rep.</li>
                            <li>Demonstrated strong interpersonal communication skills to effectively ensure a fun and fair environment.</li>
                            <li>Officiated over 100 games.</li>
                        </ul>
                        <p>Although I am not currently a referee because of school, I plan to get recertified and continue in January 2025.</p>
                    </figure>
                </div>
            ),
        },

    ]
    return (
        <section id="experience">
            <div className="experienceText">
                <h1 className="sectionHeader">
                    Experience
                </h1>
                <p className="paragraphText">
                    Professionally, I work as a sports official, both umpiring and refereeing. Recently, I have joined Waterloo Rocketry and I am gaining skills there too!
                </p>
                <Accordion items={data} keepOthersOpen={true}/>
            </div>
            <div className="imgDiv">
                <img src={bg} alt="Profile" className="experienceImage"/>
            </div>
        </section>
    )
}

export default Experience;