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
    id: 'focusable-no-role',
    level: 'error',
    impactRank: 3,
    help: 'Focusable elements must have a role',
    description:
      'A div or span was put in the keyboard focus order with tabindex, but it has no role, so assistive technology cannot ' +
      'tell people what it is or how to use it. Use a native element such as button or a link, or add the ARIA role that ' +
      'matches what it does (for a scrollable area, role="region" with an aria-label). Content that is not interactive ' +
      'should not be in the focus order; tabindex="-1" keeps it focusable from script only.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value',
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
    id: 'link-name-not-unique',
    level: 'error',
    impactRank: 3,
    help: 'Links with the same name must go to the same place',
    description:
      'Two or more links have the same accessible name but different destinations. Someone listening to a list of links ' +
      'cannot tell them apart. Give each one a name that says where it goes, for example with an aria-label that adds the section.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context',
    tags: ['custom', 'wcag2a', 'wcag244'],
  },
  {
    id: 'link-label-in-name',
    level: 'error',
    impactRank: 1,
    help: 'The visible text of a link must be part of its accessible name',
    description:
      'The link has an aria-label, and the text people can see is not contained in it exactly. People who use speech ' +
      'input say what they see, so the accessible name should contain the visible text, including its punctuation.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/label-in-name',
    tags: ['custom', 'wcag21a', 'wcag253'],
  },
  {
    id: 'table-no-headers',
    level: 'error',
    impactRank: 1,
    help: 'Tables must have header cells, or be marked as layout',
    description:
      'The table has no header cells and no caption. If it only arranges content, add role="presentation" so it is not ' +
      'announced as a table. If it holds data, mark its headers with th elements.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships',
    tags: ['custom', 'wcag2a', 'wcag131'],
  },
  {
    id: 'list-empty',
    level: 'warning',
    impactRank: 1,
    help: 'Lists should contain list items',
    description: 'A ul or ol element has no li children. It is announced as a list with nothing in it. Remove it, or check whether its items are added later by script.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships',
    tags: ['custom', 'wcag2a', 'wcag131'],
  },
  {
    id: 'label-empty',
    level: 'warning',
    impactRank: 1,
    help: 'Label elements should not be empty',
    description: 'A label element has no text. If it labels a control, that control has no usable name from it; if it is only a click target, check that it is hidden from assistive technology.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships',
    tags: ['custom', 'wcag2a', 'wcag131'],
  },
  {
    id: 'contrast-translucent-background',
    level: 'error',
    impactRank: 3,
    help: 'Text must not depend on a semi-transparent background for its contrast',
    description:
      'Measured against the nearest solid background, this text does not reach 4.5:1. A semi-transparent background ' +
      'sits in between, and it is not counted, because what shows through it can change. This is how Level Access measures ' +
      'contrast; axe-core blends the layers and may pass the same text. If the text is readable as rendered, give the ' +
      'element a solid background colour so every tool agrees, or dismiss the finding.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum',
    tags: ['custom', 'wcag2aa', 'wcag143'],
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

    // Links that share a name but not a destination, and links whose visible
    // text is not inside their aria-label. Names are compared without case.
    const norm = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const byName = new Map();
    for (const link of document.querySelectorAll('a[href]')) {
      if (!exposed(link)) continue;
      const name = norm(axe.commons.text.accessibleText(link));
      if (!name) continue;
      count('link-name-not-unique');
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(link);

      if (link.hasAttribute('aria-label') || link.hasAttribute('aria-labelledby')) {
        const visible = norm(link.innerText);
        if (visible) {
          count('link-label-in-name');
          if (!name.includes(visible)) {
            flag('link-label-in-name', link, `The visible text "${visible}" is not found in the accessible name "${name}"`);
          }
        }
      }
    }
    for (const [name, links] of byName) {
      if (new Set(links.map((l) => l.href)).size < 2) continue;
      for (const link of links) {
        flag('link-name-not-unique', link, `Another link is also named "${name}" but goes somewhere else`);
      }
    }

    // Table with no header cells: a layout table not marked as one, or a data table without headers.
    for (const table of document.querySelectorAll('table')) {
      const role = table.getAttribute('role');
      if (role === 'presentation' || role === 'none' || !exposed(table)) continue;
      count('table-no-headers');
      if (!table.querySelector('th, caption, [scope], [headers], [role="columnheader"], [role="rowheader"]')) {
        flag('table-no-headers', table, 'The table has no th cells and no caption');
      }
    }

    // Empty lists and empty labels: usually leftovers, sometimes filled in by script.
    for (const list of document.querySelectorAll('ul, ol')) {
      const role = list.getAttribute('role');
      if (role === 'presentation' || role === 'none' || !exposed(list)) continue;
      count('list-empty');
      if (!list.querySelector(':scope > li')) flag('list-empty', list, `This ${list.tagName.toUpperCase()} has no list items`);
    }
    for (const label of document.querySelectorAll('label')) {
      if (!exposed(label)) continue;
      count('label-empty');
      if (!norm(axe.commons.text.accessibleText(label)) && !label.querySelector('input, select, textarea')) {
        flag('label-empty', label, 'This label has no text');
      }
    }

    // Small text whose contrast depends on a semi-transparent background.
    // The colour is compared with the nearest fully opaque background; the
    // translucent layers in between are skipped, and so is text opacity.
    const parseColor = (value) => {
      const m = /^rgba?\(([^)]+)\)$/.exec(String(value).trim());
      if (!m) return null;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return p.length >= 3 && p.every((n) => !Number.isNaN(n)) ? { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } : null;
    };
    const luminance = (c) => {
      const channel = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
    };
    const contrast = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    const white = { r: 255, g: 255, b: 255, a: 1 };
    for (const el of document.querySelectorAll('body *')) {
      if (/^(script|style|noscript|template|option)$/i.test(el.tagName)) continue;
      if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (!exposed(el)) continue;
      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize);
      const bold = (parseInt(style.fontWeight, 10) || 400) >= 700;
      if (size >= 24 || (bold && size >= 18.66)) continue; // large text has a lower bar and is left to axe-core
      const text = parseColor(style.color);
      if (!text) continue;
      let solid = null;
      let translucent = false;
      for (let n = el; n && n.nodeType === 1 && !solid; n = n.parentElement) {
        const c = parseColor(getComputedStyle(n).backgroundColor);
        if (!c || c.a === 0) continue;
        if (c.a < 1) translucent = true;
        else solid = c;
      }
      if (!translucent) continue; // text on solid backgrounds is axe-core's color-contrast rule
      count('contrast-translucent-background');
      const ratio = contrast(text, solid || white);
      if (ratio < 4.5) {
        flag('contrast-translucent-background', el,
          `Text colour ${hex(text)} against the nearest solid background ${hex(solid || white)} is ${ratio.toFixed(2)}:1; a semi-transparent background in between is not counted`);
      }
    }

    // Focusable element with no implicit or explicit role. Only elements put
    // in the tab order with tabindex are checked; elements that mean something
    // without an ARIA role, such as label and summary, are left alone.
    const meaningful = new Set(['label', 'summary', 'legend', 'caption', 'figcaption', 'video', 'audio', 'object', 'embed', 'iframe', 'canvas', 'body', 'html']);
    for (const el of document.querySelectorAll('[tabindex]')) {
      if (!(parseInt(el.getAttribute('tabindex'), 10) >= 0) || !exposed(el)) continue;
      count('focusable-no-role');
      const tag = el.tagName.toLowerCase();
      const role = axe.commons.aria.getRole(el);
      if ((!role || role === 'generic' || role === 'none' || role === 'presentation') && !meaningful.has(tag)) {
        flag('focusable-no-role', el, `This ${tag.toUpperCase()} is focusable (tabindex="${el.getAttribute('tabindex')}") but has no role`);
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
    const checked = examined[rule.id] || 0;
    rules.push({
      id: rule.id,
      outcome: own.length ? kind : checked ? 'pass' : 'inapplicable',
      impactRank: rule.impactRank,
      nodes: own.length,
      // Elements that passed and failed, for the score.
      passed: Math.max(0, checked - own.length),
      failed: kind === 'fail' ? own.length : 0,
    });
    for (const h of own) {
      findings.push({ ruleId: rule.id, kind, impactRank: rule.impactRank, selector: h.selector, html: h.html, summary: h.detail });
    }
  }
  const meta = CUSTOM_RULES.map(({ id, help, description, helpUrl, tags }) => ({ id, help, description, helpUrl, tags }));
  return { rules, findings, meta };
}
