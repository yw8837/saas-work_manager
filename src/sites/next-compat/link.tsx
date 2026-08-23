import { Link as RouterLink } from "react-router-dom";
import type { ComponentProps } from "react";

type NextHref = string | {
  pathname?: string;
  query?: Record<string, string | number | boolean | undefined>;
};

type NextLinkProps = Omit<ComponentProps<typeof RouterLink>, "to"> & {
  href: NextHref;
  prefetch?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  locale?: string;
  legacyBehavior?: boolean;
  passHref?: boolean;
};

function toPath(href: NextHref): string {
  if (typeof href === "string") return href;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(href.query ?? {})) {
    if (value !== undefined) query.set(key, String(value));
  }
  const search = query.toString();
  return `${href.pathname ?? "/"}${search ? `?${search}` : ""}`;
}

/** Minimal client-side replacement for the Next Link API used by the existing UI. */
export default function Link(nextProps: NextLinkProps) {
  const { href, ...props } = nextProps;
  delete (props as Partial<NextLinkProps>).prefetch;
  delete (props as Partial<NextLinkProps>).scroll;
  delete (props as Partial<NextLinkProps>).shallow;
  delete (props as Partial<NextLinkProps>).locale;
  delete (props as Partial<NextLinkProps>).legacyBehavior;
  delete (props as Partial<NextLinkProps>).passHref;
  return <RouterLink to={toPath(href)} {...props} />;
}
