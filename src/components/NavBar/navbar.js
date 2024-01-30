import React from 'react';
import './navbar.css';
//import logo from '../../assets/logo.png';
import { Link } from 'react-scroll';

const Navbar = () => {
    return (
        <nav className="navbar">
            <img src = {require('../../assets/logo.png')}  alt = "Logo" className="logo"/>
            <div className = "desktopMenu">
                <Link activeClass='active' to='intro' spy={true} smooth={true} offset={-50} duration={500} className = "desktopMenuListItem">Home</Link>
                <Link activeClass='active' to='about' spy={true} smooth={true} offset={10} duration={500} className ='desktopMenuListItem'>About</Link>
                <Link activeClass='active' to='projects' spy={true} smooth={true} offset={10} duration={500} className ='desktopMenuListItem'>Projects</Link>
                <Link activeClass='active' to='experience' spy={true} smooth={true} offset={10} duration={500} className ='desktopMenuListItem'>Experience</Link>
                <Link activeClass='active' to='education' spy={true} smooth={true} offset={10} duration={500} className ='desktopMenuListItem'>Education</Link>
                <Link activeClass='active' to='interests' spy={true} smooth={true} offset={10} duration={500} className ='desktopMenuListItem'>Interests</Link>
            </div>
        </nav>
    )
}

export default Navbar;