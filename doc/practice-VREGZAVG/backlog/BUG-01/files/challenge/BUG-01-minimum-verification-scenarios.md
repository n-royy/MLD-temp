# Minimum verification scenarios

## BUG-01-TC-01

Precondition: Signed in; development app running.

Data: Desktop 1440px viewport; Dashboard statistics present.

1. Open Dashboard.
2. Inspect the leftmost content and top bar.

Expected: No main content or top-bar control is obscured by the sidebar.

Required evidence (screenshot): tc-01-desktop-dashboard.png

## BUG-01-TC-02

Precondition: Signed in; production build running.

Data: 1024px viewport; Accounting and Boards have content.

1. Run pnpm build and pnpm start.
2. Open Accounting and Boards.
3. Inspect sidebar boundaries and top bar.

Expected: Main content and top bar remain beside the sidebar in production.

Required evidence (screenshot): tc-02-production-layout.png

## BUG-01-TC-03

Precondition: Signed in; app running.

Data: 390px viewport.

1. Open Dashboard and Accounting.
2. Use mobile navigation.

Expected: Mobile content and navigation remain usable.

Required evidence (screenshot): tc-03-mobile-dashboard.png and tc-03-mobile-accounting.png
