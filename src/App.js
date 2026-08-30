import { useEffect, useState } from "react";
import "./site.css";

const projects = [
  {
    index: "01",
    name: "Cookd.ca",
    type: "Co-founder · Product",
    description:
      "A social recipe platform with hundreds of daily visitors and hundreds of recipes. I built features across cooks, comments, images, profiles, and the backend platform.",
    stack: "NestJS · TypeScript · Supabase · Cloudflare",
    href: "https://cookd.ca",
    featured: true,
  },
  {
    index: "02",
    name: "Blindseer",
    type: "Accessibility · Team project",
    description:
      "An assistive navigation project for visually impaired users. I worked on the Flutter mobile app and its Google Cloud text-to-speech integration.",
    stack: "Flutter · Dart · Google Cloud · Raspberry Pi",
    href: "https://github.com/Trivial-Solution",
  },
  {
    index: "03",
    name: "Real-Time OS",
    type: "Systems · Course project",
    description:
      "A real-time operating system for STM32 with first-fit memory allocation, scheduling, and preemptive multitasking.",
    stack: "C · ARM · STM32",
  },
  {
    index: "04",
    name: "ViaVision",
    type: "Computer vision · Sandbox",
    description:
      "A small Python sandbox for learning and experimenting with computer vision.",
    stack: "Python · Computer vision",
    href: "https://github.com/MarcoLoDico/ViaVision",
  },
  {
    index: "05",
    name: "md-viewer",
    type: "Open source · Tooling",
    description:
      "A browser-based tool for storing Markdown files in a directory and reading them through a focused interface.",
    stack: "HTML · CSS · JavaScript",
    href: "https://github.com/MarcoLoDico/md-viewer",
  },
];

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function ExternalLink({ href, children }) {
  return (
    <a className="inline-link" href={href} target="_blank" rel="noreferrer">
      {children} <Arrow />
    </a>
  );
}

function App() {
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme === "dark" ? "dark" : "light"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#111310" : "#f0eee7"
    );

    try {
      localStorage.setItem("theme", theme);
    } catch {
      // The selected theme still applies when storage is unavailable.
    }
  }, [theme]);

  const toggleTheme = () => setTheme((current) => current === "dark" ? "light" : "dark");

  return (
    <div className="site">
      <header className="header">
        <a className="brand" href="#top">Marco Lo Dico</a>
        <nav aria-label="Primary navigation">
          <a href="#experience">Experience</a>
          <a href="#projects">Projects</a>
          <a href="#education">Education</a>
          <a href="#other-work">Other work</a>
        </nav>
        <div className="header-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-pressed={theme === "dark"}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <span className="theme-dot" aria-hidden="true" />
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <div className="header-socials">
            <a href="https://github.com/MarcoLoDico" target="_blank" rel="noreferrer" aria-label="GitHub">GH</a>
            <a href="https://www.linkedin.com/in/marcolodico/" target="_blank" rel="noreferrer" aria-label="LinkedIn">LI</a>
            <a href="https://x.com/Marco_Lo_Dico" target="_blank" rel="noreferrer" aria-label="X">X</a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <p className="overline">Software Engineering · University of Waterloo</p>
          <h1>
            <span className="greeting">Hello, I’m</span>
            <span className="name-line">Marco Lo Dico.</span>
          </h1>
          <div className="hero-bottom">
            <p>
              Production infrastructure, backend systems, and product engineering.
              Software engineering student at Waterloo. Previously interned at Shopify.
              Co-founder of Cookd.ca.
            </p>
            <div className="social-links">
              <a href="https://github.com/MarcoLoDico" target="_blank" rel="noreferrer">GitHub <Arrow /></a>
              <a href="https://www.linkedin.com/in/marcolodico/" target="_blank" rel="noreferrer">LinkedIn <Arrow /></a>
              <a href="https://x.com/Marco_Lo_Dico" target="_blank" rel="noreferrer">X <Arrow /></a>
            </div>
          </div>
        </section>

        <section className="experience section-dark" id="experience">
          <div className="section-heading inverse">
            <h2>Experience</h2>
          </div>

          <div className="employers">
            <article className="employer">
              <header className="employer-header">
                <div>
                  <h3>Shopify</h3>
                  <p>Toronto, Ontario</p>
                </div>
              </header>

              <div className="role">
                <p className="role-date">May — Aug. 2026</p>
                <h4>Production Infrastructure Engineering Intern</h4>
                <ul>
                  <li>Built and shipped cluster-gated shadow validation for a zero-downtime migration of 1,400+ routing rules.</li>
                  <li>Migrated the shop signup workflow and reduced polling requests by 90% with backoff and jitter.</li>
                  <li>Designed retry-based alerting to suppress transient errors and escalate persistent failures.</li>
                </ul>
              </div>

              <div className="role">
                <p className="role-date">Sept. — Dec. 2025</p>
                <h4>Software Engineering Intern</h4>
                <ul>
                  <li>
                    Led an expansion of the Customer API with Media and Metaobjects for safer third-party access. {" "}
                    <ExternalLink href="https://shopify.dev/changelog/metafield-references-added-to-customer-account-api">Project</ExternalLink>
                  </li>
                  <li>Reworked an in-memory query using SQL and hashing, reducing runtime by 90%.</li>
                  <li>
                    Investigated app proxy authentication and contributed to an {" "}
                    <ExternalLink href="https://shopify.dev/docs/storefronts/headless/building-with-the-customer-account-api/authenticate-customers?extension=javascript">official guide</ExternalLink>.
                  </li>
                </ul>
              </div>

              <div className="role">
                <p className="role-date">Jan. — Apr. 2025</p>
                <h4>Software Engineering Intern</h4>
                <ul>
                  <li>Used Observability to resolve backend issues, including reducing OAuth redirect errors by 95%.</li>
                  <li>
                    Added localization to the Customer API for more than one million monthly interactions. {" "}
                    <ExternalLink href="https://shopify.dev/changelog/exposed-incontext-directive-with-the-customer-account-api">Project</ExternalLink>
                  </li>
                </ul>
              </div>
            </article>

            <article className="employer">
              <header className="employer-header">
                <div>
                  <h3>Ontario Chamber of Commerce</h3>
                  <p>Toronto, Ontario</p>
                </div>
              </header>
              <div className="role">
                <p className="role-date">May — Aug. 2024</p>
                <h4>Small Business Digital Advisor</h4>
                <ul>
                  <li>Contributed to the Skills Bridge training platform through product planning, analytics, QA, and outreach.</li>
                </ul>
              </div>
            </article>

            <article className="employer">
              <header className="employer-header">
                <div>
                  <h3>Waterloo Rocketry</h3>
                  <p>Waterloo, Ontario</p>
                </div>
              </header>
              <div className="role">
                <p className="role-date">Jan. — Oct. 2024</p>
                <h4>Systems Engineer</h4>
                <ul>
                  <li>Created engineering drawings and worked on machining and hardware for the rocket’s upper body tube and fuel injector tests.</li>
                </ul>
              </div>
            </article>
          </div>
        </section>

        <section className="projects section-light" id="projects">
          <div className="section-heading">
            <h2>Projects</h2>
          </div>

          <div className="project-grid">
            {projects.map((project) => {
              const content = (
                <>
                  <div className="project-topline">
                    <span>{project.index}</span>
                    <span>{project.type}</span>
                  </div>
                  <h3>{project.name}</h3>
                  <p className="project-description">{project.description}</p>
                  <div className="project-footer">
                    <span>{project.stack}</span>
                    {project.href && <Arrow />}
                  </div>
                </>
              );

              const className = project.featured ? "project-card featured" : "project-card";
              return project.href ? (
                <a className={className} href={project.href} target="_blank" rel="noreferrer" key={project.name}>{content}</a>
              ) : (
                <article className={className} key={project.name}>{content}</article>
              );
            })}
          </div>

          <a className="github-row" href="https://github.com/MarcoLoDico" target="_blank" rel="noreferrer">
            <span>More on GitHub</span>
            <Arrow />
          </a>
        </section>

        <section className="education section-light" id="education">
          <div className="section-heading">
            <h2>Education</h2>
          </div>

          <div className="education-grid">
            <article className="education-block">
              <p className="block-label">University</p>
              <h3>University of Waterloo</h3>
              <p>Bachelor of Software Engineering</p>
              <p className="muted">2023 — 2028 · Waterloo, Ontario</p>
              <div className="education-note">
                <strong>Coursework</strong>
                <span>Data Structures & Algorithms, Operating Systems, Compilers, Databases, Computer Architecture</span>
              </div>
              <div className="education-note">
                <strong>Award</strong>
                <span>Outstanding Course Performance — Technical Communication</span>
              </div>
            </article>

            <article className="skills-block">
              <p className="block-label">Skills</p>
              <div className="skill-row">
                <h3>Languages</h3>
                <p>Rust, Python, C, C++, TypeScript, JavaScript, Ruby, SQL, Assembly</p>
              </div>
              <div className="skill-row">
                <h3>Infrastructure</h3>
                <p>Kubernetes, Envoy, NGINX, Cloudflare, Docker, GitHub Actions, Observability</p>
              </div>
              <div className="skill-row">
                <h3>Application</h3>
                <p>NestJS, GraphQL, React, Ruby on Rails, PostgreSQL, MySQL, Supabase</p>
              </div>
            </article>
          </div>
        </section>

        <section className="other-work section-light" id="other-work">
          <div className="section-heading">
            <h2>Other work</h2>
          </div>
          <div className="other-work-list">
            <article>
              <p className="role-date">2018 — Present</p>
              <h3>Baseball Umpire</h3>
              <p className="job-company">Baseball Ontario</p>
              <strong>200+ games</strong>
              <p>Rep games across age groups, including twelve tournament championships.</p>
            </article>
            <article>
              <p className="role-date">2019 — 2023</p>
              <h3>Hockey Referee</h3>
              <p className="job-company">Ontario Minor Hockey Association</p>
              <strong>100+ games</strong>
              <p>Officiated across multiple levels, including rep hockey.</p>
            </article>
          </div>
        </section>
      </main>

      <footer>
        <div>
          <p className="footer-name">Marco Lo Dico</p>
          <p>Software Engineering · University of Waterloo</p>
        </div>
        <div className="footer-links">
          <a href="https://github.com/MarcoLoDico" target="_blank" rel="noreferrer">GitHub <Arrow /></a>
          <a href="https://www.linkedin.com/in/marcolodico/" target="_blank" rel="noreferrer">LinkedIn <Arrow /></a>
          <a href="https://x.com/Marco_Lo_Dico" target="_blank" rel="noreferrer">X <Arrow /></a>
        </div>
        <p className="copyright">© {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

export default App;
