/**
 * Re-mounts on every navigation: a short fade + rise (transform/opacity only).
 * Deliberately a CSS animation on a SERVER component: a JS-driven `opacity: 0` start (framer-motion) hides
 * the page in the server HTML until hydration finishes, which measured as ~1.5 s of LCP. CSS plays at first
 * paint. Reduced motion is handled globally (animation-duration collapses to ~0).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-[route-in_320ms_var(--ease-out)_both]">{children}</div>;
}
