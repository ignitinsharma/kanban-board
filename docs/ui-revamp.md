# Kanban UI revamp

The supplied DESIGN.md describes signed-in Hiretivo. Apply its shared palette to signed-in Kanban and leave its Hiretivo-specific layouts out of this project. Map canvas to #f7f8f9, surfaces to #ffffff, borders and hover to #dcdfe4 and #f1f2f4, primary and primary hover to #0c66e4 and #0055cc, selection and focus to #e9f2ff and #388bff, text to #172b4d and #44546f, disabled text to #8993a4, and status accents to #1f845a, #f5cd47 and #c9372c. Retain the system font stack and 4px spacing grid. Use consistent 8px corners, stronger control outlines for contrast and reserve shadows for floating surfaces.

- Login and signup use a centered form and a desktop-only illustration. Randomize the decorative image on the server so the form can render independently and hydration stays stable. Use local WebP images and record their origins. The auth surface has its own composition because DESIGN.md leaves sign-in styling open.
- The signed-in shell has a wordmark and account disclosure. The dashboard uses a responsive grid, existing update dates and owner actions, with loading, empty and retry states.
- A board has a breadcrumb, filters, horizontally scrollable columns, compact cards and the existing activity timeline. Keep drag geometry and event handling intact. Restyle the card and member dialogs and inline forms using existing primitives. Present mutation feedback without shifting the board.

Expected files include src/styles/tokens.css, src/components, the auth pages and src/features/auth, the signed-in layout and shell styles, the rendering modules under src/features/board, public/auth, README.md, docs/decisions.md and docs/screenshots.
