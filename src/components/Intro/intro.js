import React from "react";
import './intro.css';
import linkedin from '../../assets/in.png'
import github from '../../assets/github-mark-white.png'
const Intro = () => {
    return (
        <section id="intro">
            <div className="introContent">
                <span className="hello">Welcome,</span>
                <div className="introText">
                    I'm <span className="introName">Marco</span>
                    <div className="socialLinks">
                        <a href="https://www.linkedin.com/in/marcolodico" target="_blank" rel="noopener noreferrer">
                            <img src={linkedin} alt="LinkedIn Profile" className="socialIcon"/>
                        </a>
                        <a href="https://github.com/marcolodico" target="_blank" rel="noopener noreferrer">
                            <img src={github} alt="GitHub Profile" className="socialIcon"/>
                        </a>
                    </div>
                </div>
                <p className="introParagraph">A Software Engineering student from the University of Waterloo</p>
            </div>
        </section>

    )
}

export default Intro;