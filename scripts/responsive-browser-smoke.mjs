import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchTestBrowser, previewUrl } from './lib/browser.mjs';

const DRAWER = '[data-mobile-drawer="true"]';
const BACKDROP = '[data-mobile-drawer-backdrop="true"]';
const TOGGLE = '[data-mobile-menu-toggle="true"]';

/**
 * Copy that can carry a too-small font size. `div` is not decoration: both real
 * sub-10px offenders that ever shipped in this shell were `<div>` badges
 * (App.tsx CAD chip, AiBuilderView.tsx preset caption), so a selector without it
 * cannot regress-guard the very defect this list was written for.
 * `assertTypeScaleDetector` pins this down.
 */
const TYPE_SCALE_SELECTOR = 'button, span, p, h1, h2, h3, label, a, div';

/** Parse `rgb()` / `rgba()` into channel values plus alpha. */
function parseColor(value) {
  const match = String(value).match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(/[,/\s]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

/** Relative luminance, used to prove a focus ring is actually perceivable. */
function luminance({ r, g, b }) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two opaque colours. */
function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Alpha-composite `fg` over opaque `bg`, so translucent rings are measured honestly. */
function composite(fg, bg) {
  const alpha = Number.isFinite(fg.a) ? fg.a : 1;
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    a: 1,
  };
}

const FOCUS_RING_MIN_CONTRAST = 2.4;

/**
 * A focus indicator is an outline. `box-shadow` is decoration: `.studio-input:focus`
 * declares `outline: none` plus a shadow whose stops are fully transparent, so a
 * shadow-only predicate reports "visible" for a control that paints nothing.
 * Translucent rings are composited over the surface before measuring, because a
 * 20% alpha ring passes no contrast check once actually blended.
 */
function focusRingVerdict(probe, surface = { r: 7, g: 9, b: 14, a: 1 }) {
  const ringColor = parseColor(probe.outlineColor);
  const hasRing = probe.outlineStyle !== 'none' && probe.outlineWidth > 0 && ringColor !== null;
  if (!hasRing) {
    return {
      ok: false,
      reason: 'no outline ring is painted (a box-shadow stop is not a focus indicator)',
      hasRing: false,
    };
  }
  const ratio = contrast(composite(ringColor, surface), surface);
  return {
    ok: ratio >= FOCUS_RING_MIN_CONTRAST,
    reason: `ring contrast ${ratio.toFixed(2)}:1 must be at least ${FOCUS_RING_MIN_CONTRAST}:1`,
    hasRing: true,
    ratio,
  };
}

/**
 * Guards the guard: the predicate above must reject the two shapes that used to
 * slip through — a transparent shadow with no outline, and a barely-there ring.
 */
async function assertFocusRingPredicate() {
  const shadowOnly = {
    text: 'shadow-only',
    outlineStyle: 'none',
    outlineWidth: 0,
    outlineColor: 'rgb(244, 244, 245)',
    boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px',
  };
  const shadowVerdict = focusRingVerdict(shadowOnly);
  assert.equal(
    shadowVerdict.ok,
    false,
    'a transparent box-shadow must never satisfy the focus ring assertion',
  );

  const faintRing = {
    text: 'faint-ring',
    outlineStyle: 'solid',
    outlineWidth: 1,
    outlineColor: 'rgba(255, 255, 255, 0.2)',
    boxShadow: 'none',
  };
  const faintVerdict = focusRingVerdict(faintRing);
  assert.equal(
    faintVerdict.ok,
    false,
    `a 20% alpha ring must be measured after compositing and rejected (got ${faintVerdict.reason})`,
  );

  const realRing = {
    text: 'real-ring',
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: 'rgb(125, 211, 252)',
    boxShadow: 'none',
  };
  assert.equal(focusRingVerdict(realRing).ok, true, 'an opaque accent ring must still pass');
}

/**
 * Keyboard focus must be perceivable on the dark shell. A browser-default
 * `auto` outline paints near-black on this surface, which is invisible.
 * Probes with real Tab presses so the check reflects `:focus-visible`.
 * Every assertion here is additive.
 */
async function assertFocusVisible(page, viewport) {
  const label = `${viewport.width}px`;
  const surface = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const surfaceColor = parseColor(surface) ?? { r: 7, g: 9, b: 14, a: 1 };

  await page.evaluate(() => document.body.focus?.());
  const seen = [];
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab');
    const probe = await page.evaluate(() => {
      const node = document.activeElement;
      if (!node || node === document.body) return null;
      const style = getComputedStyle(node);
      return {
        text: (node.textContent || '').trim().slice(0, 20) || `<${node.tagName}>`,
        focusVisible: node.matches(':focus-visible'),
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth) || 0,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      };
    });
    if (probe) seen.push(probe);
  }

  assert.ok(seen.length >= 5, `keyboard Tab must reach at least 5 controls at ${label} (reached ${seen.length})`);

  for (const probe of seen) {
    assert.ok(probe.focusVisible, `"${probe.text}" must match :focus-visible when reached by keyboard at ${label}`);

    const verdict = focusRingVerdict(probe, surfaceColor);
    assert.ok(
      verdict.ok,
      `focused control "${probe.text}" must paint a perceivable ring at ${label}: ${verdict.reason} (outline ${probe.outlineStyle} ${probe.outlineWidth}px ${probe.outlineColor}; box-shadow ${probe.boxShadow})`,
    );
  }
}

/**
 * Type scale must stay on the declared ladder (11 / 12 / 14 / 16 / 20).
 * Sub-10px copy is unreadable on the dark shell and was never an approved step.
 * Every assertion here is additive.
 */
async function assertTypeScale(page, viewport) {
  const label = `${viewport.width}px`;
  const offenders = await page.evaluate((selector) => {
    const out = [];
    for (const node of document.querySelectorAll(selector)) {
      const text = (node.textContent || '').trim();
      if (!text) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const size = parseFloat(getComputedStyle(node).fontSize);
      if (!Number.isFinite(size) || size <= 0) continue;
      if (size < 10) out.push({ size, text: text.slice(0, 24) });
    }
    return out;
  }, TYPE_SCALE_SELECTOR);

  assert.deepEqual(
    offenders,
    [],
    `no visible copy below 10px at ${label} (found ${offenders.length}: ${JSON.stringify(offenders.slice(0, 3))})`,
  );

  const sizes = await page.evaluate((selector) => {
    const seen = new Set();
    for (const node of document.querySelectorAll(selector)) {
      const text = (node.textContent || '').trim();
      if (!text) continue;
      const size = parseFloat(getComputedStyle(node).fontSize);
      if (Number.isFinite(size)) seen.add(Math.round(size));
    }
    return [...seen].sort((a, b) => a - b);
  }, TYPE_SCALE_SELECTOR);
  assert.ok(
    sizes.length <= 6,
    `type scale must stay disciplined at ${label} (got ${sizes.length} sizes: ${sizes.join('/')})`,
  );
}

/**
 * Guards the scanner itself: an injected 9px `<div>` and 9px `<span>` must both be
 * reported. Without `div` in the selector the div probe is silently missed, which is
 * exactly how the two real 9px offenders escaped this check before they were fixed
 * by hand — nothing would have caught a regression.
 */
async function assertTypeScaleDetector(page, viewport) {
  const label = `${viewport.width}px`;
  const detected = await page.evaluate((selector) => {
    const host = document.createElement('div');
    host.setAttribute('data-type-scale-probe', 'true');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;';

    const div = document.createElement('div');
    div.textContent = 'PROBE_DIV_9PX';
    div.style.fontSize = '9px';

    const span = document.createElement('span');
    span.textContent = 'PROBE_SPAN_9PX';
    span.style.fontSize = '9px';

    host.append(div, span);
    document.body.append(host);

    const hits = [];
    for (const node of document.querySelectorAll(selector)) {
      const text = (node.textContent || '').trim();
      if (!text || !text.startsWith('PROBE_')) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const size = parseFloat(getComputedStyle(node).fontSize);
      if (size < 10) hits.push(node.tagName);
    }
    host.remove();
    return hits;
  }, TYPE_SCALE_SELECTOR);

  assert.ok(
    detected.includes('DIV'),
    `type scale scanner must inspect <div> at ${label}; a 9px div probe went undetected (selector: ${TYPE_SCALE_SELECTOR})`,
  );
  assert.ok(
    detected.includes('SPAN'),
    `type scale scanner must inspect <span> at ${label}; a 9px span probe went undetected (selector: ${TYPE_SCALE_SELECTOR})`,
  );
}

/**
 * Text fields and sliders must show focus too. The ring rule was declared with
 * `:where(...)`, which contributes no specificity, so `.studio-input:focus { outline: none }`
 * (0,2,0) and `input[type="range"] { outline: none }` (0,1,1) both outranked it and erased
 * the ring on every form control.
 */
async function assertFormFocusVisible(page, viewport) {
  const label = `${viewport.width}px`;
  const surface = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const surfaceColor = parseColor(surface) ?? { r: 7, g: 9, b: 14, a: 1 };

  await page.evaluate(() => document.body.focus?.());
  let probe = null;
  for (let step = 0; step < 120; step += 1) {
    await page.keyboard.press('Tab');
    const sample = await page.evaluate(() => {
      const node = document.activeElement;
      if (!node) return null;
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)) return null;
      const style = getComputedStyle(node);
      return {
        tag: node.tagName,
        type: node.getAttribute('type') || '',
        focusVisible: node.matches(':focus-visible'),
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth) || 0,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      };
    });
    if (sample) {
      probe = sample;
      break;
    }
  }

  assert.ok(
    probe,
    `keyboard Tab must reach a form control within 120 presses at ${label} (reached none)`,
  );
  assert.ok(
    probe.focusVisible,
    `form control <${probe.tag}${probe.type ? ` type="${probe.type}"` : ''}> must match :focus-visible when reached by keyboard at ${label}`,
  );

  const verdict = focusRingVerdict(probe, surfaceColor);
  assert.ok(
    verdict.ok,
    `focused form control <${probe.tag}${probe.type ? ` type="${probe.type}"` : ''}> must paint a perceivable ring at ${label}: ${verdict.reason} (outline ${probe.outlineStyle} ${probe.outlineWidth}px ${probe.outlineColor}; box-shadow ${probe.boxShadow})`,
  );
}

/**
 * Drawer contract: a left-floating panel below lg, with a real modal shell.
 * Every assertion here is additive; none of the pre-existing checks are relaxed.
 */
async function assertDrawerContract(page, viewport) {
  if (viewport.width >= 1024) return;
  const toggle = page.locator(TOGGLE);
  const label = `${viewport.width}px`;

  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', `toggle aria-expanded must start false at ${label}`);
  const controls = await toggle.getAttribute('aria-controls');
  assert.ok(controls && controls.length > 0, `toggle must expose aria-controls at ${label}`);

  await toggle.click();
  const drawer = page.locator(DRAWER);
  await drawer.waitFor();
  // The panel slides in from the left; measure the settled geometry, not a frame mid-animation.
  await drawer.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));

  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', `toggle aria-expanded must be true while open at ${label}`);
  assert.equal(await drawer.getAttribute('id'), controls, `aria-controls must reference the drawer id at ${label}`);
  assert.equal(await drawer.getAttribute('role'), 'dialog', `drawer must be a dialog at ${label}`);
  assert.equal(await drawer.getAttribute('aria-modal'), 'true', `drawer must be aria-modal at ${label}`);
  assert.equal(await page.locator(BACKDROP).count(), 1, `drawer must render exactly one backdrop at ${label}`);

  // Every drawer row is a real touch target, not a 32px mouse-only row.
  const rowHeights = await drawer.evaluate((element) => [...element.querySelectorAll('button')]
    .filter((node) => node.getBoundingClientRect().width > 0)
    .map((node) => Math.round(node.getBoundingClientRect().height)));
  assert.ok(rowHeights.length >= 10, `drawer must list every workspace at ${label} (found ${rowHeights.length})`);
  assert.ok(
    rowHeights.every((height) => height >= 44),
    `drawer rows must be at least 44px tall at ${label} (got ${Math.min(...rowHeights)})`,
  );

  // Rows share one radius so the panel reads as a single system.
  const rowRadii = await drawer.evaluate((element) => [...new Set([...element.querySelectorAll('button')]
    .map((node) => getComputedStyle(node).borderRadius))]);
  assert.equal(rowRadii.length, 1, `drawer rows must share one radius at ${label} (got ${rowRadii.join(' / ')})`);

  const geometry = await drawer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, width: rect.width, right: rect.right, viewportWidth: window.innerWidth, position: getComputedStyle(element).position };
  });
  assert.ok(geometry.width < geometry.viewportWidth - 1, `drawer must not span the viewport at ${label} (${geometry.width}/${geometry.viewportWidth})`);
  assert.ok(geometry.left >= 0 && geometry.left < 1, `drawer must float from the left edge at ${label} (left=${geometry.left})`);
  assert.equal(geometry.position, 'fixed', `drawer must be viewport-anchored at ${label}`);

  // Stacking: the drawer must paint above every in-canvas dock that shares its z-index band.
  const stacking = await drawer.evaluate((element) => {
    const drawerZ = Number(getComputedStyle(element).zIndex) || 0;
    const rivals = [...document.querySelectorAll('main *')]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && ['fixed', 'absolute'].includes(style.position) && (Number(style.zIndex) || 0) >= drawerZ;
      })
      .map((node) => ({ z: Number(getComputedStyle(node).zIndex) || 0, cls: String(node.className).slice(0, 40) }));
    return { drawerZ, rivals };
  });
  assert.deepEqual(stacking.rivals, [], `drawer z-index ${stacking.drawerZ} must outrank in-canvas docks at ${label}`);

  // Focus must stay inside the open drawer.
  const escapees = [];
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Tab');
    escapees.push(await page.evaluate((selector) => {
      const node = document.querySelector(selector);
      const active = document.activeElement;
      return node ? node.contains(active) || active === document.body : true;
    }, DRAWER));
  }
  assert.ok(escapees.every(Boolean), `focus escaped the drawer while tabbing at ${label}`);

  // Escape closes and returns focus to the toggle.
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'detached' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', `aria-expanded must reset after Escape at ${label}`);
  assert.equal(
    await page.evaluate((selector) => document.activeElement?.getAttribute('data-mobile-menu-toggle') === 'true' || !!document.querySelector(selector)?.contains(document.activeElement), TOGGLE),
    true,
    `focus must return to the toggle after Escape at ${label}`,
  );

  // Backdrop click closes — click well to the right of the floating panel.
  await toggle.click();
  await drawer.waitFor();
  const backdropBox = await page.locator(BACKDROP).boundingBox();
  assert.ok(backdropBox, `backdrop must be measurable at ${label}`);
  await page.mouse.click(backdropBox.x + backdropBox.width - 12, backdropBox.y + backdropBox.height - 12);
  await drawer.waitFor({ state: 'detached' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', `aria-expanded must reset after backdrop click at ${label}`);
}

/**
 * The first Tab must reveal the skip link, and activating it must move focus to the
 * main region instead of leaving keyboard users to tab through the whole header.
 */
async function assertSkipLink(page, viewport) {
  const label = `${viewport.width}px`;
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active.tagName !== 'A') return null;
    return { href: active.getAttribute('href'), opacity: getComputedStyle(active).opacity };
  });
  assert.ok(focused, `first Tab must reach the skip link at ${label}`);
  assert.equal(focused.href, '#craftaib-main', `skip link must target the main region at ${label}`);
  await page.waitForFunction(() => Number(getComputedStyle(document.activeElement).opacity) > 0.9);
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'craftaib-main',
    `skip link must focus the main region at ${label}`,
  );
}

/**
 * Navigation model: below lg the hamburger owns workspace switching; from lg up
 * the top bar exposes every workspace rail directly, so the hamburger must be gone.
 */
async function assertWorkspaceNav(page, viewport) {
  const label = `${viewport.width}px`;
  const toggle = page.locator(TOGGLE).filter({ visible: true });

  if (viewport.width >= 1024) {
    assert.equal(await toggle.count(), 0, `hamburger must stay hidden at ${label}`);
    const visibleTargets = await page.locator('[data-workspace-id]').filter({ visible: true }).count();
    assert.ok(visibleTargets >= 4, `top-bar workspace nav must expose the core rail at ${label} (found ${visibleTargets})`);
    if (viewport.width >= 1536) {
      const labels = await page.evaluate(() => [...document.querySelectorAll('header nav button span')]
        .filter((node) => node.getBoundingClientRect().width > 0)
        .map((node) => node.textContent?.trim()));
      assert.ok(labels.length >= 4, `workspace labels must be visible at ${label} (found ${labels.length})`);
    }
  } else {
    assert.ok(await toggle.count() >= 1, `hamburger must be visible at ${label}`);
  }
}

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TOKEN_SOURCE_DIRS = ['frontend/src', 'packages'];

/** Every `var(--x)` reference below the given roots, ignoring build output. */
function collectTokenReferences() {
  const references = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(css|tsx?|jsx?|html)$/.test(entry.name)) continue;
      const source = readFileSync(full, 'utf8');
      for (const match of source.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
        references.set(match[1], (references.get(match[1]) ?? 0) + 1);
      }
    }
  };
  for (const dir of TOKEN_SOURCE_DIRS) walk(join(REPO_ROOT, dir));
  return references;
}

/**
 * Design tokens must stay a vocabulary, not a wish list. A declaration nobody
 * consumes rots silently: its value can drift wrong and no screenshot changes,
 * because nothing paints it. A reference to an undeclared token renders empty.
 * Both directions are asserted here, so adding a step to `:root` means adding
 * the place that consumes it — or the suite fails.
 */
function assertTokenDiscipline() {
  const css = readFileSync(join(REPO_ROOT, 'frontend/src/index.css'), 'utf8');
  const root = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  assert.ok(root, 'frontend/src/index.css must declare a :root token block');
  const declared = [...root[1].matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1]);
  assert.ok(declared.length >= 10, `expected a full token block in :root, parsed only ${declared.length}`);

  const references = collectTokenReferences();
  const unused = declared.filter((token) => !references.has(token));
  const dangling = [...references.keys()].filter((token) => !declared.includes(token)).sort();

  assert.deepEqual(
    unused,
    [],
    `every declared token needs a var() consumer; unreferenced: ${unused.join(', ')}`,
  );
  assert.deepEqual(
    dangling,
    [],
    `every var() reference must resolve to a declared token; dangling: ${dangling.join(', ')}`,
  );
}

// Runs before the browser opens: a token defect is a static fact, and failing
// here costs milliseconds instead of a 40-second browser round trip.
assertTokenDiscipline();

const browser = await launchTestBrowser();
const errors = [];
try {
  for (const viewport of [
    { width: 1600, height: 900 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(previewUrl);
    await page.locator('[data-active-workspace]').waitFor();
    await assertSkipLink(page, viewport);
    for (const id of ['settings', 'map_art', 'ai_builder']) {
      const navigation = page.locator(`[data-workspace-id="${id}"]`).filter({ visible: true }).first();
      if (!(await navigation.count())) {
        if (viewport.width < 1024) {
          await page.locator(TOGGLE).click();
          const menuLayout = await page.locator(DRAWER).evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return { width: rect.width, viewportWidth: window.innerWidth };
          });
          assert.ok(menuLayout.width < menuLayout.viewportWidth, `mobile menu covers full viewport at ${viewport.width}px`);
        } else {
          await page.locator('[data-toolbox-toggle="true"]').click();
        }
      }
      await page.locator(`[data-workspace-id="${id}"]`).filter({ visible: true }).first().click();
      await page.locator(`[data-active-workspace="${id}"]`).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${id} overflows ${viewport.width}px by ${overflow}px`);
      const clippedHeaderActions = await page.evaluate(() => [...document.querySelectorAll('header > div:last-child button')]
        .filter((element) => element.getBoundingClientRect().width > 0)
        .some((element) => element.getBoundingClientRect().right > window.innerWidth + 1));
      assert.equal(clippedHeaderActions, false, `header actions clipped at ${viewport.width}px`);
      const projectActionLabels = await page.evaluate(() => [...document.querySelectorAll('[data-project-action]')]
        .filter((element) => element.getBoundingClientRect().width > 0)
        .map((element) => element.textContent?.trim()));
      if (viewport.width < 768) assert.deepEqual(projectActionLabels, [], `secondary project labels visible at ${viewport.width}px`);
      if (viewport.width >= 768 && viewport.width < 1280) assert.ok(projectActionLabels.length <= 1, `too many secondary labels visible at ${viewport.width}px`);
    }

    // The header export action must stay legible and unclipped at every width,
    // and keep the accessible name the file-action suite depends on.
    const exportState = await page.evaluate(() => {
      const button = [...document.querySelectorAll('header button')]
        .find((node) => /litematic/i.test(node.textContent || ''));
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      const spans = [...button.querySelectorAll('span')]
        .map((node) => ({ text: node.textContent?.trim(), width: node.getBoundingClientRect().width }));
      return {
        visibleText: spans.filter((span) => span.width > 0).map((span) => span.text).join(''),
        right: rect.right,
        width: rect.width,
      };
    });
    assert.ok(exportState, `export action must exist at ${viewport.width}px`);
    assert.equal(exportState.visibleText, '.litematic', `export action label must stay ".litematic" at ${viewport.width}px (got "${exportState.visibleText}")`);
    assert.ok(exportState.right <= viewport.width + 1, `export action must stay inside the viewport at ${viewport.width}px (right=${exportState.right})`);

    await assertFocusVisible(page, viewport);
    await assertTypeScale(page, viewport);
    await assertFocusRingPredicate();
    await assertTypeScaleDetector(page, viewport);
    await assertFormFocusVisible(page, viewport);
    await assertWorkspaceNav(page, viewport);
    await assertDrawerContract(page, viewport);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Responsive navigation passed: desktop, compact desktop, mobile.');
} finally {
  await browser.close();
}
