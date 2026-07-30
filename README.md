# VKab

VKab is a practical language-learning app built around the words and phrases people actually need in their own lives.

Instead of choosing a fixed curriculum, the first version turns translation history into a personal vocabulary list: look something up, use it, and keep it for later. The longer-term goal is to turn that vocabulary into effective practice and complement it with community-built, boots-on-the-ground language packs.

The MVP is under active development. Its complete requirements are tracked in [PRD: Google Translate vocabulary lookup MVP](https://github.com/ihafkenschiel/vkab/issues/1).

## MVP

Version one intentionally does one workflow well:

1. Start immediately with an anonymous session—no signup form.
2. Choose a source language and a target language.
3. Enter a word or short phrase.
4. Translate it with Google Cloud Translation.
5. Automatically save the original text, translated text, and language direction.
6. Review saved vocabulary in newest-first order.
7. Delete entries that are mistaken or no longer useful.

Repeated lookups in the same language direction update the existing entry instead of creating duplicates. The app also records how often an entry is looked up, creating useful data for future practice features.

The MVP will be mobile-friendly, accessible, and deployable on Vercel with Supabase. Vocabulary is private to the anonymous user through database Row Level Security. In this first version, access is tied to the browser session; clearing browser data or changing devices may make the list inaccessible.

### Not in the MVP

- Quizzes, scores, or spaced repetition
- Flashcards
- Curated language packs or lessons
- Community publishing, voting, or moderation
- Permanent accounts or cross-device sync
- Audio, speech recognition, or pronunciation grading
- Monetization

Keeping these out of version one makes it possible to validate the central idea quickly: language learners benefit from remembering what they personally needed to translate.

## Planned architecture

- **Frontend:** React, Vite, and strict TypeScript
- **Hosting:** Vercel
- **Translation:** Google Cloud Translation Basic v2, called only from a server-side endpoint
- **Authentication:** Supabase anonymous authentication
- **Database:** Supabase PostgreSQL with Row Level Security
- **Validation:** Zod at application boundaries

The browser sends an authenticated request to a same-origin translation endpoint. That endpoint validates the text and language codes, calls Google, and returns the translation without exposing the API key. The browser then records the successful lookup in Supabase under the current user's ID.

Supabase decides whether a lookup is new or repeated at the database boundary. Lookup identity uses Unicode NFC normalization, removes leading and trailing whitespace, collapses internal whitespace, and compares lowercase text within the same learner and language direction. The stored display text remains NFC-normalized and whitespace-cleaned without discarding its original letter case.

Translation and persistence remain separate outcomes: if saving fails, the translation stays visible and can be saved again without paying for another translation request.

## Cost target

The project is designed for the Vercel and Supabase free allowances. Google Cloud Translation currently provides a monthly credit covering the first 500,000 NMT translation characters, but usage beyond that allowance is billable. Production setup must include a deliberately reduced daily character quota so unexpected traffic stops safely instead of creating an unexpected bill.

Pricing and platform limits can change. Check the current [Google Cloud Translation pricing](https://cloud.google.com/products/translate/pricing) and [quota documentation](https://docs.cloud.google.com/translate/quotas) before deployment.

## Local development

Requirements:

- Node.js 20.19 or newer
- pnpm 10 or newer
- A Supabase project with anonymous sign-ins enabled
- A Google Cloud project with the Cloud Translation API enabled

Install dependencies and create a local environment file:

```sh
pnpm install
cp .env.example .env.local
```

Replace the placeholders in `.env.local`. The Vite-prefixed values configure the browser session:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

The translation endpoint needs the same public Supabase project values and a restricted Google Cloud Translation key:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
GOOGLE_TRANSLATE_API_KEY=replace-with-a-restricted-server-key
```

The Supabase publishable key is intended for public clients; a service-role key is not needed and must not be configured. Never place the Google key, a service-role key, or any other secret in a `VITE_` variable. Vite exposes those variables to browser code.

### Apply the database migrations

Vocabulary storage, atomic repeated-lookup updates, and Row Level Security policies are defined in [`supabase/migrations`](./supabase/migrations). Apply the files in filename order. Anonymous Supabase users use the `authenticated` database role, and each policy limits access to rows owned by the current user.

With the Supabase CLI configured, apply the migration to a local stack:

```sh
supabase start
supabase db reset
```

To apply the same tracked migrations to a linked Supabase project:

```sh
supabase link --project-ref your-project-ref
supabase db push
```

Use the project reference for the intended environment and allow the CLI to obtain credentials through its normal login or prompt. Do not store database passwords, access tokens, or service-role keys in the repository. Production application and RLS verification are part of the deployment checklist.

Start the application:

```sh
pnpm dev
```

`pnpm dev` runs the browser application. Use the Vercel development environment when testing the `/api/translate` function locally.

The first visit creates an anonymous Supabase identity. Supabase stores that session in the browser and restores it on refresh. Clearing browser data or changing devices can make anonymous vocabulary inaccessible.

Run the project checks:

```sh
pnpm test
pnpm typecheck
pnpm build
```

## Long-term objectives

VKab should grow from a personal translation notebook into a practical learning system without losing its user-led foundation. All of the objectives below are outside the MVP.

### Learn from personal vocabulary

- Generate multiple-choice quizzes from saved lookups.
- Track answers and prioritize words the learner gets wrong.
- Use repeated lookups and practice history to choose what to review.
- Add flashcards and spaced-repetition scheduling.
- Preserve context so phrases remain useful rather than becoming isolated trivia.

### Start with practical language packs

- Offer concise country- and city-relevant packs for arriving travelers.
- Organize material around real situations such as lodging, restaurants, transport, shopping, nightlife, dating, and outdoor trips.
- Include regional vocabulary and cultural context, such as Brazilian Portuguese and Argentinian Lunfardo, instead of treating every language as geographically uniform.
- Let learners add useful pack entries to their own vocabulary and practice history.

### Learn while living or traveling there

- Add listening practice and a way to record practical pronunciation for review.
- Help learners hit the ground running with language they can hear, say, understand, and use while their boots are on the ground, rather than with classroom-style progression.
- For a Latin-alphabet learner starting Japanese, begin with practical spoken language and Latin transliteration. Introduce Japanese characters later when they unlock an immediate task, such as reading menus, signs, station names, addresses, names, or messages.

### Introduce writing systems when they are useful

- Support learning writing systems such as Cyrillic and Japanese hiragana, katakana, and practical introductory kanji.
- Adapt the sequence to the writing system and the learner's immediate needs. Cyrillic letter-sound recognition may be useful early, while Japanese should begin with heard and spoken survival language.

### Build a community library

- Let people publish and maintain language packs based on lived experience.
- Let the community vote on packs so the most useful material rises to the top.
- Support attribution, versioning, reports, and moderation so shared material can improve without becoming unsafe or unreliable.
- Make it easy to adapt a strong pack to a new place or language while preserving local nuance.

### Make learning portable

- Add permanent accounts and safe anonymous-account upgrades.
- Synchronize vocabulary and progress across devices.
- Add richer translation context where it materially helps learners communicate.
- Support import and export so learners retain control of their vocabulary.

The long-term measure of success is usefulness: helping someone say, understand, and remember what matters in the situations they are actually navigating.

## Contributing

Pull requests are welcome. Please open an issue before beginning a substantial change so the scope and product intent are clear.

## License

The repository is source-available, not open source. You may view the code and submit pull requests, but reuse, modification, redistribution, sublicensing, or use in another project requires written permission. See [LICENSE](./LICENSE) for the full terms.
