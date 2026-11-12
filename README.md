# Accessibility Checker

A local web app that scans web pages for accessibility problems and tracks the
findings over time. It loads each page in headless Chrome, evaluates it with
[axe-core](https://github.com/dequelabs/axe-core) plus eleven custom rules, and
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

axe-core does not have these. They are in `src/core/custom-rules.js` and
always run. Each one imitates a rule of Level Access's Access Engine, written
from what that product reports on real pages, not from its code. Five came
from the Docs site's CI script (`.github/scripts/a11y-check.cjs`).

| Rule | Recorded as | Criterion | What it flags |
|---|---|---|---|
| `aria-expanded-not-allowed` | Failed, serious | 4.1.2 | `aria-expanded` on a role ARIA 1.2 does not allow it on, such as `nav` |
| `focusable-no-role` | Failed, serious | 4.1.2 | A `div`, `span` or similar put in the tab order with `tabindex` but given no role |
| `link-name-not-unique` | Failed, serious | 2.4.4 | Links with the same name that go to different places |
| `link-name-suspicious` | Failed, serious | 2.4.4 | A link named only by a symbol, or by more than 150 characters |
| `svg-accessible-name` | Failed, serious | 1.1.1 | An exposed inline SVG with no name, outside a control |
| `link-label-in-name` | Failed, minor | 2.5.3 | A link with an `aria-label` that does not contain its visible text exactly |
| `table-no-headers` | Failed, minor | 1.3.1 | A table with no `th` and no caption that is not marked `role="presentation"` |
| `link-name-generic` | Needs review | 2.4.4 | A link named "click here", "read more" and similar |
| `link-name-short` | Needs review | 2.4.4 | A link name of three characters or fewer that is not a number |
| `list-empty` | Needs review | 1.3.1 | A `ul` or `ol` with no `li` children |
| `label-empty` | Needs review | 1.3.1 | A `label` with no text |

The rules skip elements hidden from screen readers. A responsive site hides
different elements at each width, which is why scanning at both viewports
matters: on one documentation page, 1 of 28 `nav[aria-expanded]` elements is
exposed at desktop width and all 28 at mobile width.

### Compared with Level Access

On `https://hpc.njit.edu/MIG/` (11 Nov 2026) Access Engine reported 47
findings and this checker 39 of the same ones:

| Level Access rule | Level Access | This checker |
|---|---:|---:|
| Aria-expanded used where it is not allowed | 28 | 28 |
| Focusable elements cannot be missing a role | 1 | 1 |
| Link has non-unique accessible name | 4 | 4 |
| A element contains visible text not found in the accessible name | 6 | 6 |
| Non-large text without sufficient contrast | 8 | 0 |
| Ul element is empty (flagged) | 1 | 1 |
| Label element empty (flagged) | 1 | 1 |

The eight contrast findings are not reproduced on purpose. They are white and
light-grey footer text on a near-black background (`rgba(0, 0, 0, 0.87)`);
Level Access reports the background as white. axe-core measures the real
colours and passes them. Level Access also flags the events table on another
page as a layout table although it has seven header cells; `table-no-headers`
does not.

## How the score works

A page's score is a weighted average over the rules that were checked:

- A rule that passed weighs 1 and earns 1.
- A rule that failed weighs its severity (critical 4, serious 3, moderate 2,
  minor 1) and earns `weight × 0.5 × share of checked elements that passed`.
- Rules that need review, did not apply, or are only best practices are left
  out.

    score = 100 × earned / total weight

So a failing rule always costs at least half its weight, and all of it when
every element it checked fails. More failing elements, more failing rules, or
more severe rules lower the score; fixing some of them raises it. A scan's
score is the mean of its page scores. Bands: 85 and up is Good, 60 to 84 is
Fair, below 60 is Poor.

Level Access's score is also a weighted average over rules, but its weights
are not published, so the two numbers are close without being equal: 84 here
against 80 there for the page above. Scans made before 12 Nov 2026 were
rescored with this formula, but they only recorded how many findings each rule
had, so the share that passed is estimated as `1 / (1 + findings)`. Re-run
them for an exact score.

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
