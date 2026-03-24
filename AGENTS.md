## Learned User Preferences

- The user often writes requests in Thai; use Thai for user-facing in-app messages when it fits (dashboard alerts, quota copy, and similar).
- For targeted UI edits, the user frequently pastes Cursor DOM paths, HTML snippets, and React component names—use those to find the exact element.
- Landing and marketing UI should feel friendly and human, not generic; logo and color choices are intentional and should be adjusted carefully when redesigning.
- Performance and polish matter: the user asks for optimization and “complete” feature quality, not only minimal implementations.

## Learned Workspace Facts

- The product is branded Excaflow in the UI; the landing page lives in `app/page.tsx` and is the client `LandingPage` component.
- Data layer: PostgreSQL with Prisma (often Neon), Supabase for authentication, Stripe for subscriptions; Pro access is derived from Stripe fields on the `User` model (`stripePriceId`, `stripeCurrentPeriodEnd`).
- Canvas data is stored as `Room` records; sidebar “projects” are `Project` rows with `ProjectRoom` linking rooms to projects; REST handlers under `/api/projects`.
- Free tier limits are defined in `lib/planTier.ts` and enforced server-side via `lib/planLimits.ts` and project APIs; `/api/subscription` returns `limits` for the client.
- Public pricing on the marketing page should import the same `planTier` constants so advertised caps match the product.
