import { profile } from "../content/profile";
import { BrandIcon } from "./BrandIcon";

interface SocialLinksProps {
  readonly showLabels?: boolean;
  readonly className?: string;
}

export function SocialLinks({ showLabels = false, className }: SocialLinksProps) {
  return (
    <div className={className ? `social-links ${className}` : "social-links"}>
      {profile.socials.map((social) => (
        <a
          key={social.network}
          className={showLabels ? "social-link social-link--labelled" : "social-link"}
          href={social.href}
          target="_blank"
          rel="noreferrer"
          aria-label={showLabels ? undefined : social.label}
          title={social.label}
        >
          <BrandIcon network={social.network} />
          {showLabels && <span>{social.label}</span>}
        </a>
      ))}
    </div>
  );
}
