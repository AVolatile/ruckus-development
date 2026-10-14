# Preserved portfolio presentation

These pages are source archives, not production routes: Brand, Campaign, CaseStudy, and the former Editorial pages (including portfolio About and pricing). The startup route tree imports none of them. `/brand`, `/campaign`, and `/case-study` now resolve to the normal not-found screen. `/about` redirects to `/product`.

The original visual assets and `styles/portfolio.css` are retained. The portfolio stylesheet is no longer imported by the production app. Static campaign artwork and email files remain in `public/campaign` for preservation; they are not part of production navigation. Historical reports and `portfolio-assets` describe the original demo, not current product capability.

There was no reusable organization BrandKit implementation in this checkout. Ruckus identity components, cover-style types, avatars, illustrations, and export utilities remain intact. Future workspace Brand Kits should reuse those primitives without treating this showcase as an organization system.

The fictional Paper Moon starter is retained as `ARCHIVED_TEMPLATES` in `shared/content/library.ts`, outside `TEMPLATES`. Existing local boards, including previously copied demo boards, are untouched.
