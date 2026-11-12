# Accessibility Checker

A local web app that scans web pages for accessibility problems and tracks the
findings over time. It loads each page in headless Chrome, evaluates it with
[axe-core](https://github.com/dequelabs/axe-core) plus six custom rules, and
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

## Publish a copy that runs in the browser

```bash
npm run deploy
```

This writes a version of the checker that needs no server and replaces the
`gh-pages` branch of the `origin` remote, which GitHub Pages serves. Run it
again to publish newer results. `npm run export -- <directory>` writes the
same files without publishing them.

The published copy is the same interface and the same code (`src/core` is
copied into it), with SQLite and axe-core running inside the page:

- It opens with the results that were in your database when you deployed.
- Visitors can run scans, remove scans, and dismiss or restore findings.
  Those changes are saved in their own browser only, and "Reset to published
  results" discards them.
- **It can only scan sites that let other websites read them.** That means
  pages on the same address as the published copy, and sites that send an
  `Access-Control-Allow-Origin` header, which GitHub Pages does. A site that
  does not, such as one on an ordinary Apache server, fails with a message
  saying so; scan it with the local checker instead.
- A page is fetched and rendered in a sandboxed frame **without running its
  own scripts**, and a "mobile" scan is a narrow window, not an emulated
  phone. Scores can differ slightly from the local checker for that reason.

The published page is public even when the repository is private, and it
contains the addresses, markup snippets and page titles of everything scanned.

## What it does

- **Scans:** list the pages to check, one address per line. Every listed page
  is scanned, and the checker can also follow links from the first page to
  find more, up to 50 pages in all. Choose WCAG 2.0, 2.1 or 2.2 Level AA,
  optional best-practice rules, and a viewport. The default loads every page
  at desktop and mobile widths and merges the results. Scans run one at a
  time. Removing a scan discards its results; findings seen only in that scan
  go with it.
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

axe-core does not have these. They are in `src/custom-rules.js`. Five were
ported from the Docs site's CI script (`.github/scripts/a11y-check.cjs`), and
`focusable-no-role` was added here; all imitate rules of Level Access's Access
Engine. They always run.

| Rule | Recorded as | Criterion | What it flags |
|---|---|---|---|
| `aria-expanded-not-allowed` | Failed | 4.1.2 | `aria-expanded` on a role ARIA 1.2 does not allow it on, such as `nav` |
| `focusable-no-role` | Failed | 4.1.2 | A `div`, `span` or similar put in the tab order with `tabindex` but given no role |
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
- The published copy can only scan sites that allow other websites to read
  them; see "Publish a copy that runs in the browser".
- Content inside iframes is not evaluated.
- Pages behind a login are not reachable; the scanner has no session.
- The crawler follows links found in the page, not sitemaps, and does not read
  `robots.txt`. Keep page counts modest on sites you do not run.
- The server listens on localhost only. It fetches whatever address it is
  given, so do not expose it to a network as is.

## Layout

    src/core/            everything that runs both on the server and in the browser:
      store.js             SQLite schema and queries
      api.js               the API, independent of HTTP
      engine.js            viewports, crawl loop, axe-core result handling
      custom-rules.js      rules axe-core does not have
      jobs.js score.js search.js urls.js views.js wcag.js sha1.js sqljs-adapter.js
    src/server.js        local web server (Express) around the API
    src/scanner.js       page scanner using Playwright and an installed browser
    src/db.js            opens the database with Node's built-in SQLite
    src/export.js        writes the copy that runs in the browser
    public/              the interface (no build step)
      browser-api.js       the API inside the page, on sql.js, saved to IndexedDB
      browser-scanner.js   page scanner using fetch and sandboxed frames
    scripts/deploy.sh    publish to GitHub Pages
    test/                unit, end-to-end and real-browser tests
