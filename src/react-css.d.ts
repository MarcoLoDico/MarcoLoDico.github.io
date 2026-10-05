import "react";

declare module "react" {
  interface CSSProperties {
    "--category-color"?: string;
    "--cluster-ring"?: string;
    "--sheet-visible"?: string;
  }
}
