import Navbar from "./components/NavBar/navbar";
import Intro from "./components/Intro/intro";
import About from "./components/About/about";
import Experience from "./components/Experience/experience";
import Interests from "./components/Interests/interests";
import Projects from "./components/Projects/projects";
import Education from "./components/Education/education";

function App() {
  return (
    <div className="App">
      <Navbar/>
      <Intro/>
      <About/>
      <Projects/>
      <Experience/>
      <Education/>
      <Interests/>
    </div>
  );
}

export default App;
