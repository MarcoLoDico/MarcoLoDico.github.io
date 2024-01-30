import React from "react";
import './about.css';
import bg from "../../assets/placeholder.png";

const About = () => {
    return (
        <section id="about">
            <div className="aboutTextCenter">
                <h1 className="sectionHeader">
                    About
                </h1>
                <p className="paragraphTextAbout">
                    Hello! I'm Marco, thanks for stopping by. This is my personal website where you can see my projects, experience, education, and interests.
                    If you want to contact me, there is a link to my LinkedIn on the "Home" section of the website. Feel free to reach out, connect, ask for a more "formal" resume, or tell
                    me to fix something on this website!
                </p>
            </div>
            {/*<div className="imageDiv">*/}
            {/*    <img src={bg} alt="Profile" className="aboutImage"/>*/}
            {/*</div>*/}
        </section>
    )
}

export default About;