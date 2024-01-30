import React from "react";
import './education.css';
import bg from "../../assets/waterlooCampus-modified.png";
import Accordion from "../Accordion/accordion.jsx";

const Education = () => {
    const data = [
        {
            id: 0,
            label: "University of Waterloo",
            renderContent: () => (
                <div id="dropdownText">
                    <p>
                        At the University of Waterloo, I am studying Software Engineering (BSE), expected to graduate in
                        2028.
                    </p>
                    <figure className="shift">
                        <figcaption className="underline">Awards:</figcaption>
                        <ul>
                            <li>President's Scholarship of Distinction - Entrance average of 95%+.</li>
                            <li>Software Engineering Entrance Scholarship - Awarded for outstanding academic and
                                extracurricular achievements.
                            </li>
                            <li>Term Distinction (1A) - Achieved an average above 80%.</li>
                        </ul>
                    </figure>
                    <figure className="shift">
                        <figcaption className="underline">Courses:</figcaption>
                        <ul>
                            <li>1A: CS 137 - Programming Principles, ECE 105 - Classical Mechanics, MATH 115 - Linear
                                Algebra
                                for Engineering, MATH 117 - Calculus 1 for Engineering, MATH 135 - Algebra for Honours
                                Mathematics,
                                SE 101 - Introduction to Methods of Software Engineering
                            </li>
                            <li>
                                1B: CS 138 - Introduction to Data
                                Abstraction and Implementation, ECE 124 - Digital Circuits and Systems, ECE 140 - Linear
                                Circuits, ENGL 119 - Communications in Mathematics & Computer Science,
                                MATH 119 - Calculus 2 for Engineering
                            </li>
                        </ul>
                    </figure>
                    <figure className="shift">
                        <figcaption className="underline">Activities:</figcaption>
                        <ul>
                            <li>Waterloo Rocketry</li>
                            <li>Intramural Innertube Waterpolo</li>
                        </ul>
                    </figure>
                </div>

            ),
        },
        {
            id: 1,
            label: "St. Michael Catholic Secondary School",
            renderContent: () => (
                <div id="dropdownText">
                    <p>
                        At the University of Waterloo, I am studying Software Engineering (BSE), expected to graduate in
                        2028.
                    </p>
                    <figure className="shift">
                        <figcaption className="underline">Awards:</figcaption>
                        <ul>
                            <li>Governor General’s Academic Medal (99.16% average).</li>
                            <li>13 subject awards.</li>
                            <li>Schulich Leader Scholarship Nominee.</li>
                            <li>High Distinction (avg. above 90%) every year.</li>
                            <li>St. Michael CSS Champion award for scholarship, leadership, citizenship, and integrity.</li>
                        </ul>
                    </figure>
                    <figure className="shift">
                        <figcaption className="underline">Activities:</figcaption>
                        <ul>
                            <li>Math Club Founder</li>
                            <li>Student Council</li>
                            <li>Peer Tutoring</li>
                            <li>Chess Team</li>
                        </ul>
                    </figure>
                </div>
            ),
        },

    ]

    return (
        <section id="education">
            <div className="educationText">
                <h1 className="sectionHeader">
                    Education
                </h1>
                <span className="paragraphSpan">
                    <p className="paragraphText">
                        I am currently a student at the University of Waterloo, where I study Software Engineering. Previously, I was a student at St. Michael CSS in Bolton, Ontario.
                    </p>
                    <Accordion items={data} keepOthersOpen={true}/>
                </span>

            </div>
            <div className="imgDiv">
                {<img src={bg} alt="Profile" className="educationImage"/>}
            </div>


        </section>
    )
}

export default Education;