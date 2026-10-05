import type { Place, Site } from "./types";

const toronto: Site = {
  id: "toronto",
  label: "Toronto, Ontario",
  coordinates: [-79.3957, 43.6453],
};

const universityOfWaterloo: Site = {
  id: "university-of-waterloo",
  label: "University of Waterloo, Waterloo, Ontario",
  coordinates: [-80.5449, 43.4723],
};

const engineering5: Site = {
  id: "engineering-5",
  label: "Engineering 5, University of Waterloo",
  coordinates: [-80.54, 43.4728],
};

const aroundUniversityOfWaterloo: Site = {
  id: "around-university-of-waterloo",
  label: "Around the University of Waterloo",
  coordinates: universityOfWaterloo.coordinates,
  radiusMeters: 450,
};

const northHillPark: Site = {
  id: "north-hill-park",
  label: "North Hill Park, Bolton, Ontario",
  coordinates: [-79.7492, 43.89],
};

const caledonEastCommunityComplex: Site = {
  id: "caledon-east-community-complex",
  label: "Caledon East Community Complex, Ontario",
  coordinates: [-79.8598, 43.874],
};

export const places: readonly Place[] = [
  {
    id: "shopify",
    category: "experience",
    name: "Shopify",
    subtitle: "Three engineering internships",
    period: "Jan. 2025 — Aug. 2026",
    site: toronto,
    summary:
      "Production infrastructure and Customer Account API work across three internship terms, from zero-downtime migrations to public API features used by third-party developers.",
    sections: [
      {
        kind: "roles",
        roles: [
          {
            title: "Production Infrastructure Engineering Intern",
            period: "May — Aug. 2026",
            highlights: [
              { text: "Built and shipped cluster-gated shadow validation for a zero-downtime migration of 1,400+ routing rules." },
              { text: "Migrated the shop signup workflow and reduced polling requests by 90% with backoff and jitter." },
              { text: "Designed retry-based alerting to suppress transient errors and escalate persistent failures." },
            ],
          },
          {
            title: "Software Engineering Intern",
            period: "Sept. — Dec. 2025",
            highlights: [
              {
                text: "Led an expansion of the Customer API with Media and Metaobjects for safer third-party access.",
                link: {
                  label: "Changelog",
                  href: "https://shopify.dev/changelog/metafield-references-added-to-customer-account-api",
                },
              },
              { text: "Reworked an in-memory query using SQL and hashing, reducing runtime by 90%." },
              {
                text: "Investigated app proxy authentication and contributed to an official guide.",
                link: {
                  label: "Guide",
                  href: "https://shopify.dev/docs/storefronts/headless/building-with-the-customer-account-api/authenticate-customers?extension=javascript",
                },
              },
            ],
          },
          {
            title: "Software Engineering Intern",
            period: "Jan. — Apr. 2025",
            highlights: [
              { text: "Used Observability to resolve backend issues, including reducing OAuth redirect errors by 95%." },
              {
                text: "Added localization to the Customer API for more than one million monthly interactions.",
                link: {
                  label: "Changelog",
                  href: "https://shopify.dev/changelog/exposed-incontext-directive-with-the-customer-account-api",
                },
              },
            ],
          },
        ],
      },
    ],
    tags: ["Production infrastructure", "Backend", "GraphQL", "SQL", "Observability", "Ruby on Rails", "Alerting", "Migrations"],
    links: [{ label: "shopify.com", href: "https://www.shopify.com" }],
    featured: true,
  },
  {
    id: "ontario-chamber-of-commerce",
    category: "experience",
    name: "Ontario Chamber of Commerce",
    subtitle: "Small Business Digital Advisor",
    period: "May — Aug. 2024",
    site: toronto,
    summary: "Supported Skills Bridge, a digital training platform for Ontario small businesses.",
    sections: [
      {
        kind: "highlights",
        title: "What I did",
        highlights: [
          { text: "Contributed to the Skills Bridge training platform through product planning, analytics, QA, and outreach." },
        ],
      },
    ],
    tags: ["Product planning", "Analytics", "QA", "Outreach"],
    links: [{ label: "occ.ca", href: "https://occ.ca" }],
  },
  {
    id: "waterloo-rocketry",
    category: "experience",
    name: "Waterloo Rocketry",
    subtitle: "Systems Engineer",
    period: "Jan. — Oct. 2024",
    site: engineering5,
    summary: "Hardware and machining work on a student-built liquid rocket.",
    sections: [
      {
        kind: "highlights",
        title: "What I did",
        highlights: [
          { text: "Created engineering drawings and worked on machining and hardware for the rocket’s upper body tube and fuel injector tests." },
        ],
      },
    ],
    tags: ["Hardware", "Machining", "Engineering drawings", "Design team"],
    links: [{ label: "waterloorocketry.com", href: "https://www.waterloorocketry.com" }],
  },
  {
    id: "cookd",
    category: "projects",
    name: "Cookd.ca",
    subtitle: "Co-founder · Social recipe platform",
    period: "Live",
    site: aroundUniversityOfWaterloo,
    summary:
      "A social recipe platform with hundreds of daily visitors and hundreds of recipes. I built features across cooks, comments, images, profiles, and the backend platform.",
    sections: [
      {
        kind: "facts",
        facts: [
          { label: "Role", value: "Co-founder" },
          { label: "Traffic", value: "Hundreds of daily visitors" },
        ],
      },
    ],
    tags: ["NestJS", "TypeScript", "Supabase", "Cloudflare", "PostgreSQL"],
    links: [{ label: "cookd.ca", href: "https://cookd.ca" }],
    featured: true,
  },
  {
    id: "blindseer",
    category: "projects",
    name: "Blindseer",
    subtitle: "Assistive navigation · Team project",
    period: "Team project",
    site: aroundUniversityOfWaterloo,
    summary:
      "An assistive navigation project for visually impaired users. I worked on the Flutter mobile app and its Google Cloud text-to-speech integration.",
    sections: [],
    tags: ["Flutter", "Dart", "Google Cloud", "Raspberry Pi", "Accessibility"],
    links: [{ label: "GitHub", href: "https://github.com/Trivial-Solution" }],
  },
  {
    id: "real-time-os",
    category: "projects",
    name: "Real-Time OS",
    subtitle: "Systems · Course project",
    period: "Course project",
    site: aroundUniversityOfWaterloo,
    summary:
      "A real-time operating system for STM32 with first-fit memory allocation, scheduling, and preemptive multitasking.",
    sections: [],
    tags: ["C", "ARM", "STM32", "Operating systems", "Embedded"],
    links: [],
  },
  {
    id: "viavision",
    category: "projects",
    name: "ViaVision",
    subtitle: "Computer vision · Sandbox",
    period: "Sandbox",
    site: aroundUniversityOfWaterloo,
    summary: "A small Python sandbox for learning and experimenting with computer vision.",
    sections: [],
    tags: ["Python", "Computer vision"],
    links: [{ label: "GitHub", href: "https://github.com/MarcoLoDico/ViaVision" }],
  },
  {
    id: "md-viewer",
    category: "projects",
    name: "md-viewer",
    subtitle: "Open source · Tooling",
    period: "Open source",
    site: aroundUniversityOfWaterloo,
    summary: "A browser-based tool for storing Markdown files in a directory and reading them through a focused interface.",
    sections: [],
    tags: ["HTML", "CSS", "JavaScript", "Markdown"],
    links: [{ label: "GitHub", href: "https://github.com/MarcoLoDico/md-viewer" }],
  },
  {
    id: "university-of-waterloo",
    category: "education",
    name: "University of Waterloo",
    subtitle: "Bachelor of Software Engineering",
    period: "2023 — 2028",
    site: universityOfWaterloo,
    summary: "Software Engineering, a joint program between the Faculty of Engineering and the Faculty of Mathematics.",
    sections: [
      {
        kind: "facts",
        facts: [
          { label: "Coursework", value: "Data Structures & Algorithms, Operating Systems, Compilers, Databases, Computer Architecture" },
          { label: "Award", value: "Outstanding Course Performance — Technical Communication" },
        ],
      },
    ],
    tags: ["Software engineering", "Algorithms", "Operating systems", "Compilers", "Databases", "Computer architecture"],
    links: [{ label: "uwaterloo.ca", href: "https://uwaterloo.ca/software-engineering" }],
    featured: true,
  },
  {
    id: "baseball-umpire",
    category: "other-work",
    name: "Baseball Umpire",
    subtitle: "Baseball Ontario",
    period: "2018 — Present",
    site: northHillPark,
    summary: "Rep games across age groups, including twelve tournament championships.",
    sections: [
      {
        kind: "facts",
        facts: [
          { label: "Games", value: "200+" },
          { label: "Championships", value: "12 tournaments" },
        ],
      },
    ],
    tags: ["Officiating", "Baseball", "Leadership"],
    links: [],
  },
  {
    id: "hockey-referee",
    category: "other-work",
    name: "Hockey Referee",
    subtitle: "Ontario Minor Hockey Association",
    period: "2019 — 2023",
    site: caledonEastCommunityComplex,
    summary: "Officiated across multiple levels, including rep hockey.",
    sections: [
      {
        kind: "facts",
        facts: [{ label: "Games", value: "100+" }],
      },
    ],
    tags: ["Officiating", "Hockey", "Leadership"],
    links: [],
  },
];

export function findPlace(id: string): Place | undefined {
  return places.find((place) => place.id === id);
}
