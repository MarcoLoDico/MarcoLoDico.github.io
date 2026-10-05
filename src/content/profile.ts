import type { Link } from "./types";

export interface SkillGroup {
  readonly label: string;
  readonly skills: readonly string[];
}

export type SocialNetwork = "github" | "linkedin" | "x";

export interface SocialLink extends Link {
  readonly network: SocialNetwork;
}

export const profile = {
  name: "Marco Lo Dico",
  initials: "ML",
  headline: "Software Engineering · University of Waterloo",
  bio: "Production infrastructure, backend systems, and product engineering. Previously interned at Shopify. Co-founder of Cookd.ca.",
  socials: [
    { network: "github", label: "GitHub", href: "https://github.com/MarcoLoDico" },
    { network: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/in/marcolodico/" },
    { network: "x", label: "X", href: "https://x.com/Marco_Lo_Dico" },
  ],
  skillGroups: [
    { label: "Languages", skills: ["Rust", "Python", "C", "C++", "TypeScript", "JavaScript", "Ruby", "SQL", "Assembly"] },
    { label: "Infrastructure", skills: ["Kubernetes", "Envoy", "NGINX", "Cloudflare", "Docker", "GitHub Actions", "Observability"] },
    { label: "Application", skills: ["NestJS", "GraphQL", "React", "Ruby on Rails", "PostgreSQL", "MySQL", "Supabase"] },
  ],
} as const satisfies {
  name: string;
  initials: string;
  headline: string;
  bio: string;
  socials: readonly SocialLink[];
  skillGroups: readonly SkillGroup[];
};
