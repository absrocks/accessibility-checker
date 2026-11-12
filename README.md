# Accessibility Checker

A local web app that scans web pages for accessibility problems and tracks the
findings over time. It loads each page in headless Chrome, evaluates it with
[axe-core](https://github.com/dequelabs/axe-core) plus five custom rules, and
stores the results in a SQLite file.

## Run it

Requires Node 22.13 or newer and Google Chrome (or Microsoft Edge).

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:4310. Set `PORT` to change the port and `A11Y_DB`
to change where the database lives (default `data/checker.db`).

```bash
npm test
```

The end-to-end test starts a real browser and scans the pages in
`test/fixtures/`.

## What it does

- **Scans:** check one page, or crawl up to 50 same-site pages from a starting
  address. Choose WCAG 2.0, 2.1 or 2.2 Level AA, optional best-practice rules,
  and a viewport. The default loads every page at desktop and mobile widths
  and merges the results. Scans run one at a time.
- **Results:** a score per page and per scan, findings by severity and by
  conformance level, and rules grouped into failed, needs review and passed.
  View results by rule or by page.
- **Findings:** each finding has the element's selector and markup, what is
  wrong, the WCAG criterion, and a link to fix guidance. Search by code
  snippet, selector, page address or page title (contains, starts with, ends
  with, regex). Dismiss findings with a reason, restore them, export CSV.
- **History:** the same problem on the same element of the same page is one
  finding across scans, with first-seen and last-seen dates. A dismissal
  carries over to later scans.
- **Overview:** latest score, change since the previous scan, score trend.

## Custom rules

axe-core does not have these. They are in `src/custom-rules.js`, ported from
the Docs site's CI script (`.github/scripts/a11y-check.cjs`), where they
imitate rules of Level Access's Access Engine. They always run.

| Rule | Recorded as | Criterion | What it flags |
|---|---|---|---|
| `aria-expanded-not-allowed` | Failed | 4.1.2 | `aria-expanded` on a role ARIA 1.2 does not allow it on, such as `nav` |
| `svg-accessible-name` | Failed | 1.1.1 | An exposed inline SVG with no name, outside a control |
| `link-name-suspicious` | Failed | 2.4.4 | A link named only by a symbol, or by more than 150 characters |
| `link-name-generic` | Needs review | 2.4.4 | A link named "click here", "read more" and similar |
| `link-name-short` | Needs review | 2.4.4 | A link name of three characters or fewer that is not a number |

The rules skip elements hidden from screen readers. A responsive site hides
different elements at each width, which is why scanning at both viewports
matters: on one documentation page, 1 of 28 `nav[aria-expanded]` elements is
exposed at desktop width and all 28 at mobile width.

## How the score works

For each page: every rule that passed counts 1; every rule that failed counts
against the page by severity (critical 4, serious 3, moderate 2, minor 1).

    score = 100 × passed / (passed + sum of failed weights)

Rules that need manual review and rules that did not apply are left out. A
scan's score is the mean of its page scores. Bands: 85 and up is Good, 60 to 84
is Fair, below 60 is Poor. The formula is this project's own; scores are not
comparable with other tools.

## Limits

- Automated rules catch only part of WCAG. A clean scan is not a conformance
  claim; keyboard, screen reader and content checks still need a person.
- Other checkers apply rules this one does not have, and count differently.
  Level Access, for example, also reports elements that are hidden from
  screen readers, and has rules for non-unique link names and for visible
  text missing from an accessible name.
- Content inside iframes is not evaluated.
- Pages behind a login are not reachable; the scanner has no session.
- The crawler follows links found in the page, not sitemaps, and does not read
  `robots.txt`. Keep page counts modest on sites you do not run.
- The server listens on localhost only. It fetches whatever address it is
  given, so do not expose it to a network as is.

## Layout

    src/server.js    HTTP API and static files
    src/jobs.js      scan queue
    src/scanner.js   browser launch, crawl, axe-core run, viewport merge
    src/custom-rules.js  rules axe-core does not have
    src/db.js        SQLite schema and queries
    src/score.js     scoring
    src/search.js    advanced search
    src/wcag.js      WCAG criteria table and axe tag mapping
    public/          the web interface (no build step)
    test/            unit and end-to-end tests
