import React from "react";
import './projects.css';
import bg from '../../assets/blindseer-modified.png'
import Accordion from "../Accordion/accordion.jsx";

const Projects = () => {
    const data = [
        {
            id: 0,
            label: "Blindseer",
            renderContent: () => (
                <div id="dropdownText">
                    <p>
                        A mobile application designed to assist visually impaired individuals with navigating their
                        surroundings.
                        Blindseer leverages Flutter, LLaVA, Google Cloud, Docker, Firebase, and a Raspberry Pi to
                        achieve these tasks.
                    </p>
                    <figure className="shift">
                        <figcaption className="underline">Skills:</figcaption>
                        <ul>
                            <li>
                                Worked in a team of 5 to co-develop <a href="https://github.com/Trivial-Solution" target="_blank" rel="noopener noreferrer" id="experienceLink">Blindseer</a>, a
                                Flutter-based mobile application
                                designed
                                to assist in visually
                                impaired navigation.
                            </li>
                            <li>
                                Utilized Dart to interact with the Google Cloud Platform Text-to-Speech AI API and queue
                                audio output,
                                completing core app functionality while leveraging good version control practices.
                            </li>
                        </ul>
                    </figure>
                </div>

            ),
        },
        {
            id: 1,
            label: "Poker",
            renderContent: () => (
                <div id="dropdownText">
                    <p>
                        For my final project in grade 12 computer science (ICS4U), we had the choice of choosing a card game to create.
                        <a href="https://github.com/MarcoLoDico/PokerICS4U" target="_blank" rel="noopener noreferrer" id="experienceLink"> Poker </a>
                        was labeled as one of the more difficult ones to make, so I made it! The game runs in the
                        console and uses a quasi-AI (random number generation and decision trees influenced by data)
                        for the computer to make informed decisions. There are definitely some things I would change with my current knowledge, but I am still proud with how it turned out!
                    </p>
                    <figure className="shift">
                        <figcaption className="underline">Skills:</figcaption>
                        <ul>
                            <li>
                                Used Java to implement the game-logic of Texas hold ’em poker, achieving a perfect score in grade 12 computer
                                science.
                            </li>
                            <li>
                                Demonstrated strong object-oriented programming principles to maximize code reusability and cleanliness.
                            </li>
                        </ul>
                    </figure>
                </div>
            ),
        },
        {
            id: 2,
            label: "Extreme Barbie Car Racing",
            renderContent: () => (
                <div id="dropdownText">
                    <p>
                        This project was created for my grade 12 physics (SPH4U) class. We had to create something that demonstrated the laws of physics,
                        all of the other groups opted for a physical implementation of these requirements, but I thought it would cool to make a game! It's called
                        <a href="https://github.com/MarcoLoDico/Extreme-Barbie-Car-Racing" target="_blank" rel="noopener noreferrer" id="experienceLink"> Extreme Barbie Car Racing </a>
                        as a reference to the Barbie Jeep Racing videos from Saint Jo, Texas. The game is made in the Unity game engine.
                    </p>
                    <figure className="shift">
                        <figcaption className="underline">Skills:</figcaption>
                        <ul>
                            <li>
                                Demonstrated leadership by using Unity Version Control to host and manage a project for a small team.
                            </li>
                        </ul>
                    </figure>
                </div>
            ),
        },
        {
            id: 3,
            label: "Various Unity Projects",
            renderContent: () => (
                <div id="dropdownText">
                    <p>
                        Extreme Barbie Car Racing was probably the game I wrote the least code for. Unity has been something I enjoy tinkering with for years now,
                        and I have made character controllers, combat systems, implemented basic AI, and made item management systems. The only thing stopping me from publishing
                        these projects has been the 3D modelling and art side of things, although I may publish all the code for these mini-projects in the future.
                    </p>
                </div>
            ),
        },

    ]

    return (
        <section id="projects">
            <div className="projectsText">
                <h1 className="sectionHeader">
                    Projects
                </h1>
                <p className="paragraphText">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore
                    et dolore magna aliqua.
                    Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
                    consequat. Duis aute irure dolor
                    in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint
                    occaecat cupidatat non proident,
                    sunt in culpa qui officia deserunt mollit anim id est laborum.
                </p>
                <Accordion items={data} keepOthersOpen={true}/>
            </div>
           <div className="imgDiv">

               <a href="https://www.youtube.com/watch?v=1COTQSR1okU&t=4m39s" target="_blank" rel="noopener noreferrer">
                   <img src={bg} alt="Profile" className="projectsImage"/>
               </a>
           </div>
        </section>
    )
}

export default Projects;