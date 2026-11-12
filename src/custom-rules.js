// Rules that axe-core does not have. They mirror checks made by other
// engines (notably Level Access's Access Engine) and were ported from this
// site's own CI script, .github/scripts/a11y-check.cjs in the Docs repository.
//
// `level` decides how a hit is recorded: 'error' is a failed finding,
// 'warning' is a finding that needs a person to review it.

export const CUSTOM_RULES = [
  {
    id: 'aria-expanded-not-allowed',
    level: 'error',
    impactRank: 3,
    help: 'aria-expanded is only allowed on elements that open or close something',
    description:
      'ARIA 1.2 allows aria-expanded only on roles such as button, link, combobox, tab and treeitem. ' +
      'axe-core still accepts it on nav and region, following ARIA 1.1. Move the attribute to the control ' +
      'that expands the content, or remove it.',
    helpUrl: 'https://www.w3.org/TR/wai-aria-1.2/#aria-expanded',
    tags: ['custom', 'wcag2a', 'wcag412'],
  },
  {
    id: 'svg-accessible-name',
    level: 'error',
    impactRank: 3,
    help: 'SVG images must have an accessible name or be hidden from assistive technology',
    description:
      'An inline SVG that is exposed to screen readers needs a name. Add aria-hidden="true" if the icon is ' +
      'decorative, or role="img" with an aria-label if it carries meaning.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-content',
    tags: ['custom', 'wcag2a', 'wcag111'],
  },
  {
    id: 'link-name-suspicious',
    level: 'error',
    impactRank: 3,
    help: 'Links must have a name that describes their purpose',
    description: 'The link has a name, but it is only a symbol or is longer than 150 characters, so it does not tell people where the link goes.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context',
    tags: ['custom', 'wcag2a', 'wcag244'],
  },
  {
    id: 'link-name-generic',
    level: 'warning',
    impactRank: 2,
    help: 'Link names should describe where the link goes',
    description: 'Names such as "click here" or "read more" mean nothing when links are read out of context. Check whether the surrounding text makes the purpose clear.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context',
    tags: ['custom', 'wcag2a', 'wcag244'],
  },
  {
    id: 'link-name-short',
    level: 'warning',
    impactRank: 1,
    help: 'Very short link names may be flagged as lacking purpose',
    description: 'A link name of three characters or fewer (other than a number) may not describe the destination. Check whether it is clear in context.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context',
    tags: ['custom', 'wcag2a', 'wcag244'],
  },
];

/**
 * Runs inside the page, after axe-core has been injected. Returns, per rule,
 * how many elements were examined and the elements that were flagged.
 * Self-contained: it is serialized and sent to the browser.
 */
/* c8 ignore start */
export function runCustomRulesInPage({ maxHtml }) {
  const { axe } = window;
  const examined = {};
  const hits = [];
  const count = (rule) => { examined[rule] = (examined[rule] || 0) + 1; };
  const flag = (rule, el, detail) =>
    hits.push({ rule, selector: axe.utils.getSelector(el), html: el.outerHTML.replace(/\s+/g, ' ').slice(0, maxHtml), detail });

  axe.setup();
  try {
    const exposed = (el) => axe.commons.dom.isVisibleToScreenReaders(el);

    // SVG element missing accessible name. Icons inside a control are named by the control.
    const controls =
      'a, button, meter, [role="button"], [role="checkbox"], [role="img"], [role="menuitemcheckbox"], ' +
      '[role="menuitemradio"], [role="meter"], [role="option"], [role="progressbar"], [role="radio"], ' +
      '[role="scrollbar"], [role="separator"], [role="slider"], [role="switch"], [role="tab"]';
    for (const svg of document.querySelectorAll('svg')) {
      if (svg.hasAttribute('role') || svg.closest(controls) || !exposed(svg)) continue;
      count('svg-accessible-name');
      const named =
        (svg.getAttribute('aria-label') || '').trim() ||
        svg.hasAttribute('aria-labelledby') ||
        [...svg.children].some((c) => c.tagName.toLowerCase() === 'title' && c.textContent.trim());
      if (!named) {
        flag('svg-accessible-name', svg, 'Add aria-hidden="true" if the icon is decorative, or role="img" with an aria-label if it carries meaning');
      }
    }

    // Link has a suspicious, generic or very short accessible name.
    const generic = /^(click here|here|link|this link|this|this page|read more|learn more|more|details)$/i;
    for (const link of document.querySelectorAll('a[href]')) {
      if (!exposed(link)) continue;
      const name = axe.commons.text.accessibleText(link).replace(/\s+/g, ' ').trim();
      if (!name) continue; // an empty name is axe-core's own link-name rule
      count('link-name-suspicious');
      count('link-name-generic');
      count('link-name-short');
      if (name.length > 150) {
        flag('link-name-suspicious', link, `The link's name is ${name.length} characters long (the limit is 150)`);
      } else if (!/[\p{L}\p{N}]/u.test(name)) {
        flag('link-name-suspicious', link, `The link's name is only a symbol: "${name}"`);
      } else if (generic.test(name)) {
        flag('link-name-generic', link, `The link's name is "${name}"`);
      } else if (name.length <= 3 && !/^\d+$/.test(name)) {
        flag('link-name-short', link, `The link's name is "${name}"`);
      }
    }

    // aria-expanded used where it is not allowed (ARIA 1.2).
    const expandable = new Set([
      'application', 'button', 'checkbox', 'columnheader', 'combobox', 'gridcell', 'link', 'listbox',
      'menuitem', 'menuitemcheckbox', 'menuitemradio', 'row', 'rowheader', 'switch', 'tab', 'treeitem',
    ]);
    for (const el of document.querySelectorAll('[aria-expanded]')) {
      if (!exposed(el)) continue;
      count('aria-expanded-not-allowed');
      const role = axe.commons.aria.getRole(el);
      if (!expandable.has(role)) {
        flag('aria-expanded-not-allowed', el, role ? `The element's role is "${role}"` : 'The element has no role');
      }
    }
  } finally {
    axe.teardown();
  }
  return { examined, hits };
}
/* c8 ignore stop */

/**
 * Turn the in-page result into the same shape the scanner uses for axe-core
 * results: one rule row per custom rule, plus findings.
 */
export function shapeCustomResults({ examined, hits }) {
  const rules = [];
  const findings = [];
  for (const rule of CUSTOM_RULES) {
    const own = hits.filter((h) => h.rule === rule.id);
    const kind = rule.level === 'error' ? 'fail' : 'review';
    rules.push({
      id: rule.id,
      outcome: own.length ? kind : examined[rule.id] ? 'pass' : 'inapplicable',
      impactRank: rule.impactRank,
      nodes: own.length,
    });
    for (const h of own) {
      findings.push({ ruleId: rule.id, kind, impactRank: rule.impactRank, selector: h.selector, html: h.html, summary: h.detail });
    }
  }
  const meta = CUSTOM_RULES.map(({ id, help, description, helpUrl, tags }) => ({ id, help, description, helpUrl, tags }));
  return { rules, findings, meta };
}
