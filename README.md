# Accessibility Checker

A local web app that scans web pages for accessibility problems and tracks the
findings over time. It loads each page in headless Chrome, evaluates it with
[axe-core](https://github.com/dequelabs/axe-core) plus 38 custom rules, and
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
| `contrast-translucent-background` | Failed, serious | 1.4.3 | Small text that only reaches 4.5:1 because of a semi-transparent background; measured against the nearest solid background |
| `link-label-in-name` | Failed, minor | 2.5.3 | A link with an `aria-label` that does not contain its visible text exactly |
| `table-no-headers` | Failed, minor | 1.3.1 | A table with no `th` and no caption that is not marked `role="presentation"` |
| `iframe-width-absolute` | Failed, minor | 1.4.4 | An iframe with a `width` attribute in pixels |
| `iframe-height-absolute` | Failed, minor | 1.4.4 | An iframe with a `height` attribute in pixels |
| `link-name-generic` | Needs review | 2.4.4 | A link named "click here", "read more" and similar |
| `link-name-short` | Needs review | 2.4.4 | A link name of three characters or fewer that is not a number |
| `list-empty` | Needs review | 1.3.1 | A `ul` or `ol` with no `li` children |
| `label-empty` | Needs review | 1.3.1 | A `label` with no text |

The remaining rules cover the rest of what Level Access checks on this site.
They pass on the HPC pages today, so they change no current score there.

| Rule | Recorded as | Criterion | What it flags |
|---|---|---|---|
| `image-alt-suspicious` | Failed, critical | 1.1.1 | Alt text that is a file name or a word like "image" |
| `role-img-name-suspicious` | Failed, serious | 1.1.1 | The same, on elements with `role="img"` |
| `iframe-name-suspicious` | Failed, serious | 4.1.2 | An iframe titled "frame", "untitled" and similar |
| `title-suspicious` | Failed, serious | 2.4.2 | A page title such as "Untitled" or a file name |
| `fieldset-name-suspicious` | Failed, serious | 3.3.2 | A legend such as "fieldset" or "group" |
| `input-text-name-suspicious` | Failed, serious | 4.1.2 | A text field named "input", "text field" and similar |
| `input-radio-name-suspicious` | Failed, serious | 4.1.2 | A radio button named "radio" or "option" |
| `button-name-suspicious` | Failed, serious | 4.1.2 | A button named "button" or "click" |
| `dialog-name-suspicious` | Failed, serious | 2.4.2 | A dialog named "dialog", "popup" and similar |
| `click-without-keyboard` | Failed, serious | 2.1.1 | An `onclick` attribute with no key handler on a non-control |
| `handler-without-tabindex` | Failed, serious | 2.1.1 | Click or key handler attributes on an element that cannot be focused |
| `role-button-no-tabindex` | Failed, serious | 4.1.2 | `role="button"` with no `tabindex` |
| `link-no-href` | Failed, serious | 2.1.1 | An `a` that acts on click but has no `href` or `tabindex` |
| `fieldset-name` | Failed, moderate | 1.3.1 | A fieldset with no legend or label |
| `input-placeholder-name` | Failed, moderate | 4.1.2 | A field whose only name is its placeholder |
| `aria-owns-not-allowed` | Failed, moderate | 4.1.2 | `aria-owns` on an `img` or `input` |
| `iframe-src-image` | Failed, moderate | 1.1.1 | An iframe that loads an image file |
| `dialog-empty` | Failed, moderate | 4.1.2 | An exposed dialog with nothing in it |
| `alt-not-allowed` | Failed, minor | 1.3.1 | An `alt` attribute on something that is not an image |
| `aria-disabled-redundant` | Failed, minor | 4.1.2 | `aria-disabled` together with `disabled` |
| `nav-name` | Failed, minor | 1.3.1 | An unnamed `nav` on a page with more than one |
| `role-application` | Needs review | 4.1.2 | Any use of `role="application"` |
| `link-to-image` | Needs review | 1.1.1 | A link that opens an image file |
| `lang-region` | Needs review | 3.1.1 | A page language with a region or private-use part |

Two limits of these. The "suspicious name" rules compare the name with a short
list of placeholder words (and, for images, file names); Level Access's own
lists are not public. The mouse-only rules see handlers written as attributes
(`onclick="..."`), not listeners added from script.

The rules skip elements hidden from screen readers. A responsive site hides
different elements at each width, which is why scanning at both viewports
matters: on one documentation page, 1 of 28 `nav[aria-expanded]` elements is
exposed at desktop width and all 28 at mobile width.

### Compared with Level Access

`docs/level-access-coverage.md` lists every rule Access Engine reported on a
scan of this site (113 of them) and what this checker reports for an example
of each: 91 are caught, 7 only with best practices on, 15 are flagged for
review only, and none is missed. Regenerate it with
`node scripts/level-access-coverage.mjs`. The examples are written from the
rule names, so this shows that each kind of problem is detected, not that the
two tools agree on every page.

On `https://hpc.njit.edu/MIG/` (11 Nov 2026) Access Engine and this checker
report the same findings and the same score:

| Level Access rule | Level Access | This checker |
|---|---:|---:|
| Aria-expanded used where it is not allowed | 28 | 28 |
| Focusable elements cannot be missing a role | 1 | 1 |
| Link has non-unique accessible name | 4 | 4 |
| Non-large text without sufficient contrast | 8 | 8 |
| A element contains visible text not found in the accessible name | 6 | 6 |
| Ul element is empty (flagged) | 1 | 1 |
| Label element empty (flagged) | 1 | 1 |
| **Failed findings** | **47** | **47** |
| **Score** | **80** | **80** |

`https://hpc.njit.edu/Courses/` (12 Nov 2026) also matches: 55 failed findings
and a score of 78 in both, including one each for the iframe width and height
rules.

Two things to know about that match:

- The eight contrast findings are white and light-grey footer text on a
  near-black, semi-transparent background (`rgba(0, 0, 0, 0.87)`). The text is
  readable as rendered, and axe-core's own contrast rule passes it. Level
  Access ignores semi-transparent backgrounds and compares the text with the
  white page behind them. `contrast-translucent-background` measures the same
  way so the two tools agree; giving the footer a solid background colour
  clears the findings in both.
- On `/HPC_Events_and_Workshops/` this checker scores 80 and Level Access 79.
  Level Access also fails that page's events table as a layout table, although
  it has seven header cells. That finding is not reproduced.

## How the score works

    score = 85 − 0.93 for each failing rule (0.65 if its severity is minor),
            rounded down

- The most a page can score is 85. Automated rules cover only part of WCAG,
  so passing all of them is not shown as 100.
- What counts is whether a rule fails on the page, not how many elements fail
  it: 28 elements failing one rule cost the same as one.
- Rules that need review, did not apply, or are only best practices cost
  nothing.

A scan's score is the mean of its page scores. Bands: 80 and up is Good, 50
to 79 is Fair, below 50 is Poor.

The numbers are calibrated to Level Access, not taken from it. Its page code
shows a weighted average over rules with a factor of 0.85, its Monitoring view
shows 0.9 points of "score impact" per failing High rule, and four of its
scans of these pages fix the rest: 4, 4, 6 and 6 failing High rules with 1, 2,
1 and 2 failing Low rules scored 80, 79, 78 and 78, which this formula
reproduces. Level Access's weight for Critical rules is not known; critical
and moderate rules are charged the same as serious ones here.

## Limits

- Automated rules catch only part of WCAG. A clean scan is not a conformance
  claim; keyboard, screen reader and content checks still need a person.
- Other checkers apply rules this one does not have, and count differently.
  Level Access, for example, also reports elements that are hidden from
  screen readers, and has rules for non-unique link names and for visible
  text missing from an accessible name.
- The published copy can only scan sites that allow other websites to read
  them; see "Publish a copy that runs in the browser".
- A page whose own stylesheet fails to load is not reported on. Checked
  without its styles, a page produces hundreds of false findings, so both
  scanners load it once more and then fail that page with a message naming
  the stylesheet. A stylesheet from another site that fails, typically web
  fonts, does not stop the scan; the page is scanned and carries a note.
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
