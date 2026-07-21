import { Rule } from 'ember-template-lint';

// Why this rule exists (replaces the built-in `require-input-label`):
//
// The built-in rule counts `['id', 'aria-label', 'aria-labelledby']` and errors unless
// EXACTLY ONE is present (ember-template-lint 6.1.0 and 7.9.3 alike -- the logic is
// byte-identical in both, so this is not a stale-version problem). That model is wrong in
// both directions, and we hit both:
//
//   FALSE POSITIVES (22 in this app): a control with a correct `aria-labelledby` AND an
//   `id` scores 2 and is reported as "multiple labels" -- even though a bare `id` names
//   nothing and no <label for> points at it. The only markup change that satisfies the
//   built-in is deleting ids that JS/CSS/tests depend on, i.e. breaking working code to
//   quiet a linter.
//
//   FALSE NEGATIVES (45 in this app): a control with ONLY an `id` scores 1 and PASSES,
//   even when nothing references that id. Those are genuinely unlabeled fields that the
//   built-in actively hides from us.
//
// So we model what actually produces an accessible name:
//   * a non-empty `aria-label`, or
//   * an `aria-labelledby`, or
//   * a wrapping <label> (or a configured custom label component), or
//   * a `<label for="x">` in the same template where the control has `id="x"`.
// An `id` on its own is NOT a name. There is no "multiple labels" error: when both
// aria-labelledby and aria-label are present, ARIA precedence resolves it (labelledby
// wins) -- that is well-defined, not a defect.
//
// This is STRICTLY STRICTER than the built-in, not a relaxation. See
// docs/task-management/2026-07-15-template-lint-convention-migration.md.

const ERROR_MESSAGE = 'form elements require an accessible name (aria-label, aria-labelledby, or an associated <label>).';

const INCLUDED_TAGS = new Set(['Input', 'input', 'Textarea', 'textarea', 'select']);
const INCLUDED_COMPONENTS = new Set(['input', 'textarea']);

function isString(value) {
  return typeof value === 'string';
}

function isRegExp(value) {
  return value instanceof RegExp;
}

function allowedFormat(value) {
  return isString(value) || isRegExp(value);
}

function findAttr(node, name) {
  return (node.attributes || []).find((a) => a.name === name || a.name === '@' + name);
}

// A TextNode value returns its string; a bound value returns null (unresolvable).
function staticValue(attr) {
  if (!attr) return undefined;
  if (attr.value && attr.value.type === 'TextNode') return attr.value.chars;
  return null;
}

function tagMatches(tag, patterns) {
  return patterns.some((item) => (isRegExp(item) ? item.test(tag) : item === tag));
}

export default class RequireInputLabel extends Rule {
  parseConfig(config) {
    if (config === false || config === undefined) return false;

    switch (typeof config) {
      case 'boolean': {
        return config ? { labelTags: ['label'] } : false;
      }
      case 'object': {
        if (Array.isArray(config.labelTags) && config.labelTags.every(allowedFormat)) {
          return { labelTags: ['label', ...config.labelTags] };
        }
        break;
      }
    }
    return { labelTags: ['label'] };
  }

  // Collect every `for` target in the template up front, so a <label for> that appears
  // AFTER the control (or in a sibling branch) still counts.
  collectLabelTargets(templateNode) {
    const staticTargets = new Set();
    let hasBoundTarget = false;

    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'ElementNode') {
        if (node.tag.toLowerCase() === 'label') {
          const forAttr = findAttr(node, 'for');
          if (forAttr) {
            const v = staticValue(forAttr);
            if (v === null) hasBoundTarget = true;
            else staticTargets.add(v);
          }
        }
        (node.children || []).forEach(walk);
        (node.attributes || []).forEach((a) => walk(a.value));
      } else if (node.body) {
        node.body.forEach(walk);
      }
      if (node.program) walk(node.program);
      if (node.inverse) walk(node.inverse);
      if (node.children) node.children.forEach(walk);
    };

    walk(templateNode);
    this._labelTargets = staticTargets;
    this._hasBoundLabelTarget = hasBoundTarget;
  }

  hasLabelParent(path) {
    const labelTags = this.config.labelTags;
    for (const parent of path.parents()) {
      const node = parent.node;
      if (!node || node.type !== 'ElementNode') continue;
      if (!tagMatches(node.tag, labelTags)) continue;
      // A custom label component wraps its own text -- we cannot inspect it, so trust it.
      if (node.tag.toLowerCase() !== 'label') return true;
      // A real <label> only names the control if it also contains text.
      return (node.children || []).some(
        (child) =>
          (child.type === 'TextNode' && child.chars.trim() !== '') ||
          child.type === 'MustacheStatement' ||
          (child.type === 'ElementNode' && child.tag.toLowerCase() !== 'input')
      );
    }
    return false;
  }

  visitor() {
    return {
      Template: {
        enter(node) {
          this.collectLabelTargets(node);
        }
      },

      ElementNode(node, path) {
        if (!INCLUDED_TAGS.has(node.tag)) return;
        // Splatted attributes may carry the label in from the caller.
        if (findAttr(node, '...attributes')) return;

        const typeAttr = findAttr(node, 'type');
        if (staticValue(typeAttr) === 'hidden') return;

        const ariaLabel = findAttr(node, 'aria-label');
        if (ariaLabel) {
          const v = staticValue(ariaLabel);
          // bound (null) counts; only an explicitly empty literal does not
          if (v === null || v.trim() !== '') return;
        }
        if (findAttr(node, 'aria-labelledby')) return;
        if (this.hasLabelParent(path)) return;

        const idAttr = findAttr(node, 'id');
        if (idAttr) {
          const idValue = staticValue(idAttr);
          // A bound id can only be matched by a bound <label for> -- assume paired.
          if (idValue === null && this._hasBoundLabelTarget) return;
          if (idValue !== null && this._labelTargets.has(idValue)) return;
        }

        this.log({ message: ERROR_MESSAGE, node });
      },

      MustacheStatement(node, path) {
        if (node.path.type !== 'PathExpression' || !INCLUDED_COMPONENTS.has(node.path.original)) {
          return;
        }
        if (this.hasLabelParent(path)) return;

        const pairs = node.hash.pairs;
        const typePair = pairs.find((p) => p.key === 'type');
        if (typePair && typePair.value.value === 'hidden') return;
        if (pairs.some((p) => p.key === 'aria-label' || p.key === 'aria-labelledby')) return;

        this.log({ message: ERROR_MESSAGE, node });
      }
    };
  }
}
