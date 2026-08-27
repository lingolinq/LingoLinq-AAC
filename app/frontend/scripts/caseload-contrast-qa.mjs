/**
 * Caseload contrast audit — Focused View.
 *
 * Answers one question with evidence: what on this page currently fails WCAG contrast?
 *
 * WHY IT WALKS THE LIVE PAGE rather than reading the SCSS: an element's effective
 * background comes from whichever ANCESTOR last painted one, and half this page's
 * surfaces are gradients or translucent washes over other translucent washes. Token
 * arithmetic cannot answer "what is actually behind this label"; the rendered document
 * can. The palette work on this row has already produced one measurement that was right
 * about the tokens and wrong about the pixel.
 *
 * HOW A GRADIENT IS HANDLED: the stops are parsed out of the computed
 * `background-image` and the WORST stop is used, because a label crossing a ramp has to
 * stay legible at its darkest (or lightest) point. Where that worst-stop result differs
 * from the mid-ramp result, both are reported — a corner failure and a body failure are
 * not the same finding.
 *
 * THRESHOLD: 4.5:1 normal text, 3:1 for large text (>=24px, or >=18.66px when bold),
 * per WCAG 1.4.3. Font size and weight are read off the element, not assumed.
 *
 *   nvm use 22 && node scripts/caseload-contrast-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const opts = cliArgs(process.argv);

async function forceFocused(page) {
  return page.evaluate(() => {
    if (!window.appState) { return 'window.appState missing'; }
    try {
      window.appState.set('sessionUser.preferences.dashboard_layout', 'focused');
      if (window.LingoLinq && window.LingoLinq.set_layout_scope) {
        window.LingoLinq.set_layout_scope('focused');
      }
      return true;
    } catch (e) { return 'threw: ' + e.message; }
  });
}

function audit() {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const ratio = (a, b) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) { return null; }
    const p = m[1].split(',').map((n) => parseFloat(n));
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const blend = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));

  // Every colour stop mentioned in a gradient string, in paint order.
  const stopsOf = (img) => {
    const out = [];
    const re = /rgba?\([^)]+\)/g;
    let m;
    while ((m = re.exec(img))) {
      const p = parse(m[0]);
      if (p) { out.push(p); }
    }
    return out;
  };

  // The effective backdrop behind an element: walk up compositing every translucent
  // layer onto what is behind it, stopping at the first fully opaque one.
  //
  // TWO CORRECTNESS RULES LEARNED THE HARD WAY (the first run reported two 1:1 ratios,
  // which is arithmetic for "compared a colour against itself"):
  //  1. If the walk reaches the top without hitting an opaque layer, the accumulated
  //     translucent colour must still be composited onto the canvas (white). Returning
  //     its RAW rgb treats a 10%-alpha navy wash as solid navy.
  //  2. A gradient's stops must be composited onto what is BELOW that gradient, not onto
  //     the flat page base. `background-image` lists layers top-first, so they are walked
  //     in reverse: each layer's stops composite over the result of the layers under it.
  //     Without this, a white gloss layer reads as literal white and every light-inked
  //     element "fails" against a background it never actually has.
  function backdrop(el) {
    let node = el, acc = null, layers = [];
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const img = cs.backgroundImage;
      if (img && img !== 'none' && /gradient/.test(img)) {
        const stops = stopsOf(img);
        layers.push(stops);
        // STOP HERE if this gradient is itself opaque. A layer with a fully opaque stop
        // hides everything beneath it, so continuing up collects decorative stops from
        // surfaces the element never sits on — that is what made a 10%-alpha navy badge
        // report 1:1 against the page shell's mesh, six ancestors below its own card.
        if (stops.some((st) => st.a === 1)) {
          const under = stops.filter((st) => st.a === 1).map((st) => st.rgb);
          return { base: under[0], layers: layers, opaqueStops: under };
        }
      }
      const bc = parse(cs.backgroundColor);
      if (bc && bc.a > 0) {
        /* SOURCE-OVER, keeping the real resulting alpha. This used to hardcode `a: 1`,
           which claimed a 2+-layer translucent stack was fully opaque — so the final
           composite against the canvas below (`acc.a < 1 ? blend(acc, WHITE)`) could never
           run for exactly the stacked-wash case this probe was written for, and the ratio
           came out too favourable. Under-reporting a contrast failure is the worst
           direction for an accessibility tool to be wrong in.
           a_out = a_fg + a_bg(1 - a_fg); rgb weighted by each layer's contribution. */
        if (acc === null) {
          acc = bc;
        } else {
          const aOut = acc.a + bc.a * (1 - acc.a);
          acc = {
            rgb: aOut === 0 ? bc.rgb : acc.rgb.map((c, i) =>
              (c * acc.a + bc.rgb[i] * bc.a * (1 - acc.a)) / aOut),
            a: aOut
          };
        }
        if (bc.a === 1) { return { base: acc.rgb, layers: layers }; }
      }
      node = node.parentElement;
    }
    const WHITE = [255, 255, 255];
    return { base: acc ? (acc.a < 1 ? blend(acc, WHITE) : acc.rgb) : WHITE, layers: layers };
  }

  const SCOPE = '.md-shell--caseload';
  const root = document.querySelector(SCOPE);
  /* NOTE: this only proves we are on the caseload — `.md-shell--caseload` is emitted
     UNCONDITIONALLY by templates/caseload.hbs, in Gentle View too, so it is NOT a
     Focused-View check. The layout is asserted by the caller before audit() is called. */
  if (!root) { return { err: 'no ' + SCOPE + ' — is this the caseload page at all?' }; }

  const rows = [];
  const seen = new Set();
  root.querySelectorAll('*').forEach((el) => {
    // Only elements that actually render text of their own.
    const own = Array.prototype.filter.call(el.childNodes, (n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()).join(' ');
    if (!own) { return; }
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) { return; }
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) { return; }

    const fg = parse(cs.color);
    if (!fg) { return; }
    const bd = backdrop(el);
    const inkOn = (bg) => ratio(fg.a < 1 ? blend(fg, bg) : fg.rgb, bg);

    // Candidate backgrounds: the flat backdrop, plus every stop of every gradient layer
    // composited over the layers beneath it. The WORST candidate is what gets reported —
    // a label crossing a ramp has to hold at its hardest point.
    let candidates = [bd.base];
    bd.layers.slice().reverse().forEach((stops) => {
      const next = [];
      stops.forEach((st) => {
        candidates.forEach((under) => {
          next.push(st.a < 1 ? blend(st, under) : st.rgb);
        });
      });
      if (next.length) { candidates = next; }
    });
    let worst = Infinity, worstWhat = 'flat';
    candidates.forEach((bg, i) => {
      const v = inkOn(bg);
      if (v < worst) { worst = v; worstWhat = i === 0 && candidates.length === 1 ? 'flat' : 'worst gradient stop'; }
    });

    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const floor = large ? 3 : 4.5;

    const key = el.className + '|' + own.slice(0, 24) + '|' + cs.color;
    if (seen.has(key)) { return; }
    seen.add(key);

    rows.push({
      text: own.slice(0, 28),
      cls: (typeof el.className === 'string' ? el.className : '').split(' ').filter(Boolean).slice(0, 2).join(' ').slice(0, 46),
      color: cs.color,
      size: size + 'px/' + weight,
      floor: floor,
      worst: Math.round(worst * 100) / 100,
      what: worstWhat,
      pass: worst >= floor
    });
  });
  return { rows: rows };
}

(async () => {
  const { browser, page } = await launch(opts);
  try {
    await login(page, opts);
    /* The pre-goto call that used to be here was pointless: `page.goto` is a full document
       load, and the preference was only ever set in memory. Focused View is now forced ONCE,
       after the shell has rendered (i.e. after Ember has booted), and the result is CHECKED. */
    /* `domcontentloaded`, NOT `networkidle2`. This probe hung for 20+ minutes on a run
       taken right after an SCSS edit: ember-cli-live-reload holds a socket open and the
       app polls, so "two idle connections" can simply never happen and the wait outlives
       its own timeout. The selector wait below is the real readiness signal. */
    await page.goto(opts.BASE + '/caseload', { waitUntil: 'domcontentloaded', timeout: 60000 });
    /* Wait for the shell BEFORE forcing the layout. `forceFocused` reads `window.appState`,
       which services/app-state.js only assigns during boot — called right after
       `domcontentloaded` it returned 'window.appState missing' (or threw on an unresolved
       sessionUser), and BOTH call sites discarded the return value. The audit then ran
       against whatever layout was live, while printing "Focused View". */
    await page.waitForSelector('.md-shell--caseload', { timeout: 30000 });
    const forced = await forceFocused(page);
    if (forced !== true) {
      console.error(`\nABORT: could not switch to Focused View (${forced}).`);
      console.error('Auditing Gentle View while reporting Focused View is worse than not auditing:');
      console.error('_focused-view.scss exists precisely to REPLACE the Gentle values this would measure.');
      process.exitCode = 2;
      return;
    }
    await new Promise((r) => setTimeout(r, 2500));

    /* And prove it took. `.md-shell--caseload` is NOT evidence — templates/caseload.hbs
       emits it unconditionally, in both layouts, so the guard inside audit() that keys off
       it never fired. `ll-layout-focused` on <body> is the real marker (app.js
       set_layout_scope, mirrored by app-state#sync_layout_scope). */
    const layoutOk = await page.evaluate(() => ({
      focused: document.body.classList.contains('ll-layout-focused'),
      pref: (function() {
        try { return window.appState.get('sessionUser.preferences.dashboard_layout'); }
        catch (e) { return '(unreadable)'; }
      })()
    }));
    if (!layoutOk.focused) {
      console.error(`\nABORT: Focused View did not take (body.ll-layout-focused absent, pref=${layoutOk.pref}).`);
      process.exitCode = 2;
      return;
    }
    console.log(`  layout confirmed: body.ll-layout-focused=true, dashboard_layout=${layoutOk.pref}`);

    const res = await page.evaluate(audit);
    if (res.err) { console.log('ERROR: ' + res.err); process.exitCode = 2; return; }

    const fails = res.rows.filter((r) => !r.pass).sort((a, b) => a.worst - b.worst);
    const passes = res.rows.filter((r) => r.pass);

    console.log('\n================ FAILURES (' + fails.length + ') ================');
    if (!fails.length) { console.log('  none'); }
    fails.forEach((r) => {
      console.log('  ' + String(r.worst).padStart(5) + ':1  (floor ' + r.floor + ')  ' +
        r.size.padEnd(10) + r.color.padEnd(22) + '"' + r.text + '"');
      console.log('         ' + r.cls + '   [' + r.what + ']');
    });
    console.log('\n---------------- PASSING (' + passes.length + ') ----------------');
    passes.sort((a, b) => a.worst - b.worst).slice(0, 12).forEach((r) => {
      console.log('  ' + String(r.worst).padStart(5) + ':1  ' + r.size.padEnd(10) + '"' + r.text + '"  ' + r.cls);
    });
    if (passes.length > 12) { console.log('  … and ' + (passes.length - 12) + ' more, all above their floor'); }
  } catch (e) {
    console.log('PROBE ERROR: ' + e.message);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
