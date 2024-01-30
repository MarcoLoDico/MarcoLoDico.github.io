import React from "react";
import './interests.css';
import bg from "../../assets/aviation-modified.png";
import Accordion from "../Accordion/accordion.jsx";

const Interests = () => {
    const data = [
        {
            id: 0,
            label: "Sports",
            renderContent: () => (
                <div id="dropdownText">
                    <p>
                        Sports have been a huge part of my life! I started playing hockey when I was around 6 years old, and I continued until I was 17.
                        I have played at both the rep and select levels during this time. I also dabbled with baseball, but never got into it as much as hockey.
                        However, exposure to both of these sports is what got me into officiating! In terms of the big leagues, I am a Toronto fan.
                    </p>
                </div>
            ),
        },
        {
            id: 1,
            label: "Aviation",
            renderContent: () => (
                <div id="dropdownText">
                    <p>
                        I have always loved aviation, longer than I have played sports. I have my radio operator's license and around 6 hours of
                        flight time in the Cessna 172. I hope to get my private pilot's license in the future. Also, Mayday is a great show!
                    </p>
                </div>
            ),
        },
        {
            id: 2,
            label: "Games",
            renderContent: () => (
                <div id="dropdownText">
                    <p>
                        Video games are what got me into software. My first lines of code (besides hello world) were creating a simple multiple choice game with Bash, shortly after I built my first computer a little over 6 years ago.
                        I have played a variety of games from all different categories, but I have probably put the most time into Minecraft, Destiny, and Halo. There are some great single player games as well!
                    </p>
                </div>
            ),
        },
        {
            id: 3,
            label: "Social",
            renderContent: () => (
                <div id="dropdownText">
                    <p>
                        Friends and family are what makes life so awesome. There are too many activities to list here, but after last summer, boating with friends deserves a shout-out!
                    </p>
                </div>
            ),
        },
    ]

    return (
        <section id="interests">
            <div className="interestsText">
                <h1 className="sectionHeader">
                    Interests
                </h1>
                <p className="paragraphText">
                    I like lots of things! Not all of them technical. On my free time I enjoy sports, aviation, games, and being with friends and family.
                </p>
                <Accordion items={data} keepOthersOpen={true}/>
            </div>
            <div className="imgDiv">
                <img src={bg} alt="Profile" className="interestsImage"/>
            </div>
        </section>
    )
}

export default Interests;