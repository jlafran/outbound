# Industrial Distributor Prospecting Design

## Objective

Replace the fixed dental prospecting test with a real Argentina-focused test for B2B distributors of industrial supplies, machinery, tools, and safety equipment. Reuse the current Brave → official-site research → decision-maker association → contact selection → scoring → personalized-message pipeline while fixing the two defects confirmed in production: no decision makers were associated and the displayed run time was incorrect.

## Target and offer

- Geography: Argentina.
- Companies: B2B distributors or wholesalers of industrial supplies, machinery, tools, EPP, and industrial safety products.
- Minimum size: at least 50 employees or at least 3 branches. Size may be supported by a public company profile, the official site, or multiple official branch pages.
- Offer: researched outbound prospecting that helps the distributor win new B2B customers and qualified sales meetings.
- Target decision makers: owner/CEO, general manager, commercial director, sales manager, business-development manager, and marketing manager.

## Architecture

The existing vertical-specific code will be generalized just enough to accept a prospecting profile. The first production profile will be `industrial-distributors`; the dental profile and dental-specific UI wording will be removed from the active test rather than maintaining two parallel implementations.

The data flow remains:

`Brave discovery → company validation → official-site crawl → public-person discovery → decision-maker association → contact extraction/verification → scoring → message`

### Discovery

Queries will cover three distinct jobs instead of mixing everything into one result pool:

1. Company discovery using distributor, wholesale, industrial-supply, machinery, tools, EPP, and safety terminology.
2. Decision-maker discovery using the validated company name/domain plus the approved commercial roles and public LinkedIn profile results.
3. Evidence discovery using official branches, company/about/team pages, public job posts, trade-fair catalogs, associations, and company news.

Directories, chambers, fairs, marketplaces, news, and LinkedIn company pages are discovery/evidence sources; they are not final company websites. Editorial pages, retail-only shops, tiny local stores, manufacturers without a distribution operation, and unrelated marketplaces are rejected or retained only as source evidence.

### Company validation and size

A lead must have a validated official domain and clear evidence that it sells B2B industrial products. The size gate passes when either:

- a public source reports 50 or more employees; or
- the official site identifies at least 3 branches/locations.

If size cannot be confirmed, the lead remains `research_pending`; it is not presented as ready.

### Decision-maker discovery and association

The system will run company-specific person searches after company validation. It will extract a normalized person name, approved role, current-company evidence, source URL, and LinkedIn URL when available.

Association requires at least one strong identity signal:

- exact normalized company name in the profile/result evidence;
- official domain or distinctive domain token;
- a distinctive company token plus an approved current role; or
- a person and role published on the official company site.

Generic words such as `industrial`, `distribuidora`, `mayorista`, `seguridad`, `insumos`, and `argentina` cannot associate a person by themselves. A person discovered globally but not safely associated remains in the unassociated section and does not increase the lead score.

### Contact policy

- Official-site emails are stored as `official_website` and are not sent to No2Bounce.
- Inferred personal emails may be verified through No2Bounce.
- Generic official addresses can be displayed as institutional contacts, but they do not make a lead ready.
- A lead is `personal_ready` only when it has an associated named decision maker plus either a public personal channel, a verified inferred email, or a public LinkedIn profile suitable for manual outreach.
- Completed research with no associated decision maker is `incomplete`, never `unknown` or `ready`.

### Scoring and message

Scoring will reward validated B2B fit, confirmed size, strong decision-maker association, a usable personal channel, first-party evidence, and a concrete commercial signal. It will penalize ambiguous company identity, retail-only businesses, insufficient size, and missing decision makers.

Messages will address the named person and use evidence relevant to outbound growth, such as national distribution, represented brands, new branches, commercial hiring, catalog breadth, target industries, or expansion. If no named decision maker and specific evidence exist, no personalized message is generated.

## User interface

- Rename the test and all explanatory copy from dentistry/aesthetics to industrial B2B distributors.
- Show company-size evidence and the reason a lead passed or failed the threshold.
- Differentiate `personal_ready`, `research_pending`, `incomplete`, and `discarded` in Spanish.
- Keep a visible loading state while a run is active and refresh automatically when it completes.
- Render persisted timestamps in `America/Argentina/Buenos_Aires`; do not depend on the server or browser default timezone.
- Preserve the separation of associated and unassociated decision makers.

## Error handling

- A failed company-specific person search does not fail the whole run; the lead becomes incomplete with a recorded reason.
- A timeout or blocked official page is shown as source-level evidence and does not silently become positive evidence.
- Malformed emails are discarded before persistence or verification.
- External calls are not repeated on page refresh.
- A completed run never displays a raw `unknown` value.

## Verification criteria

1. Production completes a new run without persistence errors.
2. Results contain only industrial B2B distributor candidates or explicitly classified source/rejected records.
3. Every `personal_ready` lead has a named, associated decision maker and association evidence.
4. Generic company emails alone never produce `personal_ready`.
5. Official-site emails bypass No2Bounce; inferred emails remain eligible for verification.
6. Malformed emails do not appear in persistence or UI.
7. The displayed run time matches Buenos Aires time.
8. Unit tests cover queries, classification, size gating, role extraction, association ambiguity, readiness, messages, and timezone formatting.
9. The deployed browser flow and corresponding Supabase run are verified end to end.

## Scope control

This change reuses the existing persistence and external integrations. It does not add paid data providers, authenticated LinkedIn scraping, a generic profile builder UI, or a new background-job platform. Those remain future options after the industrial test proves decision-maker yield.
