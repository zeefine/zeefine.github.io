# Collection Surfer

Source: https://componentry.dev/r/collection-surfer.json (retrieved 2026-09-29).
Documentation: https://componentry.dev/docs/components/collection-surfer
Author/repository: https://github.com/harshjdhv/componentry
License: MIT, reproduced in LICENSE. Unmodified registry source retained in collection-surfer.upstream.tsx.txt.

The running component is src/components/ui/collection-surfer.tsx. The user's pasted original is retained in collection-surfer.user-reference.tsx.txt. Desktop motion and layout match that source: window useScroll(), 50000px spacer, duplicated items/modulo loop, centered zero-size track, 300×400 cards, default magnetic behavior, original spring/track/perspective/rotation. Only renderItem for article text, visible labels and palette are adapted. No custom opacity, finite range, local scrolling or inactive-card filtering remains. Archive search and timeline controls are fixed outside the scene; mobile retains native scroll snap and reduced motion uses the static Astro timeline.

## Newsletter Bookshelf (active archive component)

Source: https://componentry.dev/r/newsletter-bookshelf.json (2026-09-29), MIT as above. Exact payload source preserved in newsletter-bookshelf.upstream.tsx.txt. Running source: src/components/ui/newsletter-bookshelf.tsx. Adaptations: local cn import, Chinese canvas text wrapping and font, theme colors supplied through public color/foil props, Chinese interface text, Phosphor navigation/close buttons and onClose callback. Book geometry, textures, focus transitions, orbit, camera and drag logic retained. The earlier Collection Surfer snapshots are historical references only.
