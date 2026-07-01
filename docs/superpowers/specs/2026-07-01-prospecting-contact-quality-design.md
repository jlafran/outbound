# Prospecting Contact Quality Design

## Objective

Improve the prospecting core so a run produces fewer SEO/editorial false positives, clearer contact readiness, better official-site person discovery, and no unnecessary No2Bounce spend for emails copied directly from official websites.

## Decisions

- Emails found on the official company website are primary-source contacts. They must not be submitted to No2Bounce in this version.
- Emails inferred from a decision maker name and company domain are guesses. They may be submitted to No2Bounce.
- The UI must not expose `unknown` as a final-looking label. It should render user-facing labels such as “tomado de web oficial”, “verificando”, “verificado”, “riesgoso”, “inválido”, or “sin verificación externa”.
- Leads must be separated conceptually:
  - Personal-ready: associated decision maker plus a useful personal channel.
  - Institutional-ready: validated company plus generic official channel, WhatsApp, or form, without an associated person.
  - Research-pending: data is still being enriched or verified.
  - Not-ready: weak company identity or no useful channel.
- The crawler should prioritize official pages likely to contain people and contacts: team, staff, professionals, doctors, about/us, nosotros, quienes-somos, contacto.
- The extractor should sanitize malformed emails before they enter scoring or verification.
- LinkedIn should be used as a decision-maker discovery source via public search results and saved profile URLs, not as an automated logged-in scraping target.

## Components

- `OfficialWebsiteCrawler`: discover and fetch higher-priority contact/team/about pages.
- `WebsiteResearchExtractor`: extract clean emails, people, phones, social URLs, services, and signals from official pages.
- `DentalAestheticsProspectingService`: build email candidates with explicit source semantics, verify only guessed/pattern emails, associate people, score leads, and choose recommended contact.
- `ProspectingLeadEnrichment`: show contact readiness and verification/source labels in the campaign UI.

## Error Handling

- Malformed emails are discarded before persistence and are not verified.
- Pending verifier responses remain pending internally, but the UI presents them as “verificando”.
- If no decision maker is associated, a lead can still be institutional-ready when the company and official contact channel are strong.

## Testing

- Unit tests must prove official website emails do not call No2Bounce.
- Unit tests must prove guessed pattern emails still call No2Bounce.
- Unit tests must prove malformed scraped emails are rejected.
- Unit tests must prove people can be extracted from team/about-style pages.
- Component tests must prove user-facing labels do not show raw `unknown`.
