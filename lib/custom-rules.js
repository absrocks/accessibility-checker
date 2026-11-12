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
    id: 'iframe-width-absolute',
    level: 'error',
    impactRank: 1,
    help: 'Iframe width should not be set in absolute units',
    description:
      'The iframe has a width attribute in pixels. A fixed width does not adapt when people zoom in or use a narrow ' +
      'screen, so the framed content can be cut off. Size it with CSS instead, for example width: 100% with a max-width.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/resize-text',
    tags: ['custom', 'wcag2aa', 'wcag144'],
  },
  {
    id: 'iframe-height-absolute',
    level: 'error',
    impactRank: 1,
    help: 'Iframe height should not be set in absolute units',
    description:
      'The iframe has a height attribute in pixels. A fixed height does not grow when text is enlarged, so the framed ' +
      'content can be cut off. Size it with CSS instead, for example with aspect-ratio.',
    helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/resize-text',
    tags: ['custom', 'wcag2aa', 'wcag144'],
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

// More rules, in a shorter form: id, level, severity rank, WCAG tags, the
// "Understanding" page for the criterion, what to do, and why.
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding/';
const define = (id, level, impactRank, tags, page, help, description) =>
  CUSTOM_RULES.push({ id, level, impactRank, help, description, helpUrl: UNDERSTANDING + page, tags: ['custom', ...tags] });

// Names that say what kind of thing an element is, not what it is for.
define('image-alt-suspicious', 'error', 4, ['wcag2a', 'wcag111'], 'non-text-content',
  'Image alternative text must describe the image',
  'The alt text is a file name or a placeholder word such as "image". It is read out as is and tells people nothing. Describe what the image shows, or use alt="" if it is decorative.');
define('role-img-name-suspicious', 'error', 3, ['wcag2a', 'wcag111'], 'non-text-content',
  'Elements with role img must have a name that describes them',
  'The accessible name is a file name or a placeholder word such as "image" or "icon". Say what the graphic shows.');
define('iframe-name-suspicious', 'error', 3, ['wcag2a', 'wcag412'], 'name-role-value',
  'Iframe titles must describe the framed content',
  'The iframe is named with a placeholder such as "frame" or "untitled". Give it a title that says what it contains, for example "Lecture recording: Intro to Slurm".');
define('title-suspicious', 'error', 3, ['wcag2a', 'wcag242'], 'page-titled',
  'The page title must describe the page',
  'The title is a placeholder such as "Untitled" or a file name. The title is the first thing announced and what appears in tabs and history.');
define('fieldset-name-suspicious', 'error', 3, ['wcag2a', 'wcag332'], 'labels-or-instructions',
  'Fieldset legends must describe the group',
  'The fieldset is named with a placeholder such as "fieldset" or "group". Say what the grouped controls are about.');
define('input-text-name-suspicious', 'error', 3, ['wcag2a', 'wcag131', 'wcag412'], 'name-role-value',
  'Text fields must have a name that says what to enter',
  'The field is named with a placeholder such as "input" or "text field". Name it for what goes in it.');
define('input-radio-name-suspicious', 'error', 3, ['wcag2a', 'wcag131', 'wcag412'], 'name-role-value',
  'Radio buttons must have a name that says what they select',
  'The radio button is named with a placeholder such as "radio" or "option". Name it for the choice it makes.');
define('button-name-suspicious', 'error', 3, ['wcag2a', 'wcag412'], 'name-role-value',
  'Buttons must have a name that says what they do',
  'The button is named with a placeholder such as "button" or "click". Name it for its action.');
define('dialog-name-suspicious', 'error', 3, ['wcag2a', 'wcag131', 'wcag242'], 'name-role-value',
  'Dialogs must have a name that says what they are for',
  'The dialog is named with a placeholder such as "dialog" or "popup". Name it for its purpose.');

// Markup that does not do what it appears to.
define('alt-not-allowed', 'error', 1, ['wcag2a', 'wcag131'], 'info-and-relationships',
  'The alt attribute only works on images',
  'An alt attribute was put on an element that is not an img, area or image input. It is ignored there. Use visible text or aria-label instead.');
define('fieldset-name', 'error', 2, ['wcag2a', 'wcag131'], 'info-and-relationships',
  'Fieldsets must have a legend',
  'The fieldset has no legend and no aria-label, so the group is announced without a name. Add a legend as its first child.');
define('aria-disabled-redundant', 'error', 1, ['wcag2a', 'wcag412'], 'name-role-value',
  'Do not combine aria-disabled with the disabled attribute',
  'The control has both disabled and aria-disabled. The native attribute already tells assistive technology; the two can disagree. Remove aria-disabled.');
define('aria-owns-not-allowed', 'error', 2, ['wcag2a', 'wcag412'], 'name-role-value',
  'aria-owns cannot be used on images or inputs',
  'aria-owns makes other elements children of this one, but an img or input cannot have children. Remove it.');
define('iframe-src-image', 'error', 2, ['wcag2a', 'wcag111'], 'non-text-content',
  'Do not show images through an iframe',
  'The iframe loads an image file. An image shown this way has no alternative text. Use an img element with alt.');
define('dialog-empty', 'error', 2, ['wcag2a', 'wcag131', 'wcag412'], 'name-role-value',
  'Dialogs must not be empty',
  'An element with role dialog is exposed but has no content. Hide it until it is opened, or remove the role.');
define('input-placeholder-name', 'error', 2, ['wcag2a', 'wcag131', 'wcag412'], 'labels-or-instructions',
  'Fields must not rely on a placeholder for their name',
  'The only thing naming this field is its placeholder, which disappears when someone types and is not exposed reliably. Add a label element or an aria-label.');
define('nav-name', 'error', 1, ['wcag2a', 'wcag131'], 'info-and-relationships',
  'When a page has several navigation regions, each needs a name',
  'This nav has no aria-label or aria-labelledby, and the page has more than one. People moving between landmarks cannot tell them apart.');

// Reported like any other failure, but marked best-practice so it does not move the score.
define('heading-level-skipped', 'error', 1, ['best-practice', 'wcag2a', 'wcag131'], 'info-and-relationships',
  'Headings must not skip levels, and a page should have one h1',
  'The heading is more than one level below the heading before it, or it is an h1 that is not the first on the page. People who move through a page by its headings rely on the levels to understand how sections relate. Use the next level down for a subsection, and keep h1 for the page title.');

// Controls that only work with a mouse. Only handlers written as attributes
// (onclick="...") can be seen; listeners added from script cannot.
define('click-without-keyboard', 'error', 3, ['wcag2a', 'wcag211'], 'keyboard',
  'Elements with a click handler must also work from the keyboard',
  'The element has an onclick handler but no key handler, and it is not a native control. Use a button or link, or add a keydown handler for Enter and Space.');
define('handler-without-tabindex', 'error', 3, ['wcag2a', 'wcag211'], 'keyboard',
  'Elements with click or key handlers must be focusable',
  'The element reacts to clicks or keys but cannot receive keyboard focus. Use a button or link, or add tabindex="0".');
define('role-button-no-tabindex', 'error', 3, ['wcag2a', 'wcag412'], 'name-role-value',
  'Elements with role button must be focusable',
  'The element says it is a button but has no tabindex, so it cannot be reached with the keyboard. Use a button element, or add tabindex="0" and key handling.');
define('link-no-href', 'error', 3, ['wcag2a', 'wcag211'], 'keyboard',
  'Links that do something must be focusable',
  'This a element acts as a link or button but has no href and no tabindex, so it is not in the focus order. Give it an href, or use a button.');

// Worth a look; not necessarily wrong.
define('role-application', 'warning', 1, ['wcag2a', 'wcag412'], 'name-role-value',
  'Check that role application is really needed',
  'role="application" turns off the screen reader\'s normal reading keys inside the element. It is rarely the right choice for web content.');
define('link-to-image', 'warning', 1, ['wcag2a', 'wcag111'], 'non-text-content',
  'Check links that open an image file',
  'The link goes straight to an image file, which opens with no alternative text. Check that the same information is available as text.');
define('lang-region', 'warning', 1, ['wcag2a', 'wcag311'], 'language-of-page',
  'Check the page language value',
  'The lang attribute has extra parts after the language, such as a region or a private-use tag. Some assistive technology only understands the simple form, for example "en".');

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
  // The in-browser scanner renames handler attributes (onclick -> data-checker-onclick) so they
  // cannot run; findings show them under their real names.
  const flag = (rule, el, detail) =>
    hits.push({ rule, selector: axe.utils.getSelector(el), html: el.outerHTML.replace(/\s+/g, ' ').replace(/data-checker-(on[a-z]+=)/g, '$1').slice(0, maxHtml), detail });

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

    // Iframes sized with pixel width or height attributes. Percentages adapt; plain numbers and px do not.
    for (const frame of document.querySelectorAll('iframe')) {
      if (!exposed(frame)) continue;
      for (const side of ['width', 'height']) {
        const rule = `iframe-${side}-absolute`;
        count(rule);
        const value = (frame.getAttribute(side) || '').trim();
        if (/^\d+(\.\d+)?(px)?$/i.test(value)) flag(rule, frame, `The ${side} attribute is "${value}", a fixed number of pixels`);
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

    // ---- names that say what kind of thing an element is ----
    const nameOf = (el) => norm(axe.commons.text.accessibleText(el));
    const fileName = (text) => /\.(jpe?g|png|gif|svg|webp|bmp|tiff?|ico)$/i.test(text);
    const placeholderName = (rule, selector, words, alsoFileNames = false) => {
      const set = new Set(words);
      for (const el of document.querySelectorAll(selector)) {
        if (!exposed(el)) continue;
        const name = nameOf(el);
        if (!name) continue; // a missing name is another rule's finding
        count(rule);
        if (set.has(name)) flag(rule, el, `The name is "${name}", which says what the element is, not what it is for`);
        else if (alsoFileNames && fileName(name)) flag(rule, el, `The name is "${name}", which is a file name`);
      }
    };
    const pictureWords = ['image', 'img', 'picture', 'photo', 'graphic', 'icon', 'alt', 'alt text', 'spacer', 'placeholder', 'untitled', 'null', 'undefined'];
    placeholderName('image-alt-suspicious', 'img[alt]', pictureWords, true);
    placeholderName('role-img-name-suspicious', '[role="img"]:not(img), [role="graphics-document"], [role="graphics-symbol"], [role="graphics-object"]', pictureWords, true);
    placeholderName('iframe-name-suspicious', 'iframe', ['frame', 'iframe', 'untitled', 'embed', 'embedded content', 'content', 'window']);
    placeholderName('fieldset-name-suspicious', 'fieldset', ['fieldset', 'field set', 'group', 'legend']);
    placeholderName('input-text-name-suspicious',
      'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="tel"], input[type="url"], input[type="password"], input[type="number"]',
      ['input', 'text', 'textbox', 'text box', 'text field', 'textfield', 'field', 'edit', 'edit text', 'textarea', 'enter text', 'type here']);
    placeholderName('input-radio-name-suspicious', 'input[type="radio"]', ['radio', 'radio button', 'radiobutton', 'option', 'radio option']);
    placeholderName('button-name-suspicious', 'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]',
      ['button', 'btn', 'click', 'click here', 'press', 'push']);
    placeholderName('dialog-name-suspicious', '[role="dialog"], [role="alertdialog"], dialog[open]',
      ['dialog', 'dialogue', 'modal', 'popup', 'pop-up', 'pop up', 'window', 'lightbox', 'overlay']);

    const titleEl = document.querySelector('title');
    const title = norm(document.title);
    if (title) {
      count('title-suspicious');
      if (['untitled', 'untitled document', 'untitled page', 'title', 'document', 'page', 'new page', 'new tab', 'index', 'default', 'test'].includes(title) ||
          /\.(html?|php|aspx?|jsp)$/i.test(title)) {
        flag('title-suspicious', titleEl || document.documentElement, `The page title is "${title}"`);
      }
    }

    // ---- markup that does not do what it appears to ----
    for (const el of document.querySelectorAll('[alt]')) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'img' || tag === 'area' || tag === 'applet' || (tag === 'input' && el.getAttribute('type') === 'image')) continue;
      if (!exposed(el)) continue;
      count('alt-not-allowed');
      flag('alt-not-allowed', el, `This ${tag.toUpperCase()} has an alt attribute, which has no effect here`);
    }
    for (const el of document.querySelectorAll('fieldset')) {
      if (!exposed(el)) continue;
      count('fieldset-name');
      if (!nameOf(el)) flag('fieldset-name', el, 'This fieldset has no legend and no aria-label');
    }
    for (const el of document.querySelectorAll('button[aria-disabled], input[aria-disabled], select[aria-disabled], textarea[aria-disabled], fieldset[aria-disabled], option[aria-disabled]')) {
      count('aria-disabled-redundant');
      if (el.hasAttribute('disabled')) flag('aria-disabled-redundant', el, `The element is disabled and also has aria-disabled="${el.getAttribute('aria-disabled')}"`);
    }
    for (const el of document.querySelectorAll('img, input')) {
      if (!exposed(el)) continue;
      count('aria-owns-not-allowed');
      if (el.hasAttribute('aria-owns')) flag('aria-owns-not-allowed', el, `This ${el.tagName.toUpperCase()} has aria-owns but cannot own other elements`);
    }
    for (const el of document.querySelectorAll('iframe[src]')) {
      if (!exposed(el)) continue;
      count('iframe-src-image');
      if (fileName((el.getAttribute('src') || '').split(/[?#]/)[0])) flag('iframe-src-image', el, 'The iframe loads an image file');
    }
    for (const el of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
      if (!exposed(el)) continue;
      count('dialog-empty');
      if (!norm(el.textContent) && !el.querySelector('img, svg, input, button, select, textarea, a[href], iframe, video, audio, canvas')) {
        flag('dialog-empty', el, 'This dialog is exposed to assistive technology but has nothing in it');
      }
    }
    for (const el of document.querySelectorAll('textarea[placeholder], input[placeholder]')) {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['hidden', 'button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file', 'range', 'color'].includes(type) || !exposed(el)) continue;
      count('input-placeholder-name');
      const labelled =
        norm(el.getAttribute('aria-label')) || el.hasAttribute('aria-labelledby') || norm(el.getAttribute('title')) ||
        norm(el.closest('label')?.textContent) ||
        (el.id && [...document.querySelectorAll('label[for]')].some((l) => l.getAttribute('for') === el.id && norm(l.textContent)));
      if (!labelled) flag('input-placeholder-name', el, `The only name for this field is its placeholder, "${norm(el.getAttribute('placeholder'))}"`);
    }
    const navs = [...document.querySelectorAll('nav, [role="navigation"]')].filter(exposed);
    if (navs.length > 1) {
      for (const el of navs) {
        count('nav-name');
        if (!norm(el.getAttribute('aria-label')) && !el.hasAttribute('aria-labelledby') && !norm(el.getAttribute('title'))) {
          flag('nav-name', el, `This is one of ${navs.length} navigation regions on the page and it has no name`);
        }
      }
    }

    // Heading structure skips a level. Level Access reports two things under
    // this rule: a heading more than one level below the one before it, and
    // every h1 after the first.
    let previousLevel = 0;
    let seenH1 = false;
    for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')) {
      if (axe.commons.aria.getRole(el) !== 'heading' || !exposed(el)) continue;
      const stated = parseInt(el.getAttribute('aria-level'), 10);
      const level = stated >= 1 ? stated : /^H[1-6]$/.test(el.tagName) ? Number(el.tagName[1]) : 2;
      count('heading-level-skipped');
      if (level === 1) {
        if (seenH1) flag('heading-level-skipped', el, 'This H1 is not the first H1 on the page, so it breaks the heading hierarchy');
        seenH1 = true;
      } else if (previousLevel && level > previousLevel + 1) {
        flag('heading-level-skipped', el, `This H${level} follows an H${previousLevel}, skipping ${level - previousLevel === 2 ? `H${previousLevel + 1}` : `H${previousLevel + 1} to H${level - 1}`}`);
      }
      previousLevel = level;
    }

    // ---- controls that only work with a mouse ----
    const has = (el, name) => el.hasAttribute(name) || el.hasAttribute(`data-checker-${name}`);
    const hasClick = (el) => has(el, 'onclick');
    const hasKey = (el) => has(el, 'onkeydown') || has(el, 'onkeyup') || has(el, 'onkeypress');
    const nativeControl = (el) => {
      const tag = el.tagName.toLowerCase();
      return ['button', 'input', 'select', 'textarea', 'summary', 'option', 'label', 'html', 'body'].includes(tag) ||
        ((tag === 'a' || tag === 'area') && el.hasAttribute('href'));
    };
    const handlerSelector = ['onclick', 'onkeydown', 'onkeyup', 'onkeypress'].flatMap((n) => [`[${n}]`, `[data-checker-${n}]`]).join(', ');
    for (const el of document.querySelectorAll(handlerSelector)) {
      if (nativeControl(el) || !exposed(el)) continue;
      const isAnchor = el.tagName.toLowerCase() === 'a'; // anchors are link-no-href's finding
      if (hasClick(el)) {
        count('click-without-keyboard');
        if (!hasKey(el)) flag('click-without-keyboard', el, 'The element has an onclick handler and no key handler');
      }
      if (!isAnchor) {
        count('handler-without-tabindex');
        if (!el.hasAttribute('tabindex')) flag('handler-without-tabindex', el, 'The element has a click or key handler but no tabindex, so it cannot be focused');
      }
    }
    for (const el of document.querySelectorAll('[role="button"]')) {
      if (nativeControl(el) || !exposed(el)) continue;
      count('role-button-no-tabindex');
      if (!el.hasAttribute('tabindex')) flag('role-button-no-tabindex', el, 'This element has role button but no tabindex');
    }
    for (const el of document.querySelectorAll('a:not([href])')) {
      const role = el.getAttribute('role');
      if (!(hasClick(el) || role === 'link' || role === 'button') || !exposed(el)) continue;
      count('link-no-href');
      if (!(parseInt(el.getAttribute('tabindex'), 10) >= 0)) flag('link-no-href', el, 'This link acts on click but has no href and no tabindex');
    }

    // ---- worth a look ----
    for (const el of document.querySelectorAll('[role="application"]')) {
      if (!exposed(el)) continue;
      count('role-application');
      flag('role-application', el, 'This element has role application');
    }
    for (const el of document.querySelectorAll('a[href]')) {
      if (!exposed(el)) continue;
      count('link-to-image');
      if (fileName((el.getAttribute('href') || '').split(/[?#]/)[0])) flag('link-to-image', el, 'This link opens an image file');
    }
    const lang = (document.documentElement.getAttribute('lang') || '').trim();
    if (lang) {
      count('lang-region');
      if (lang.includes('-')) flag('lang-region', document.documentElement, `The page language is "${lang}"`);
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
