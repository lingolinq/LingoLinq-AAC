import { Rule } from 'ember-template-lint';

const HANDLER_FACTORY_NAMES = new Set([
  'ctrlAction',
  'ctrlActionNoBubble',
  'invokeAttr',
  'invokeAttr0',
  'selfActionNoBubble'
]);

function handlerFactoryName(pathNode) {
  if (!pathNode || pathNode.type !== 'PathExpression' || !pathNode.this) {
    return null;
  }

  const parts = pathNode.parts || [];
  if (parts.length === 1 && HANDLER_FACTORY_NAMES.has(parts[0])) {
    return parts[0];
  }

  const match = (pathNode.original || '').match(/^this\.(.+)$/);
  if (match && HANDLER_FACTORY_NAMES.has(match[1])) {
    return match[1];
  }

  return null;
}

function reportFnHandlerFactory(node, log) {
  if (!node.path || node.path.original !== 'fn') {
    return;
  }

  const factoryName = handlerFactoryName(node.params && node.params[0]);
  if (!factoryName) {
    return;
  }

  log({
    message:
      'Do not wrap `' + factoryName + '` in `fn`. Use `(this.' + factoryName +
      ' ...)` instead — these helpers already return a click handler; `(fn ...)` ' +
      'calls the factory and discards the returned function so clicks fail silently.',
    node
  });
}

export default class NoFnHandlerFactory extends Rule {
  visitor() {
    const log = this.log.bind(this);

    return {
      SubExpression(node) {
        reportFnHandlerFactory(node, log);
      },
      MustacheStatement(node) {
        if (node.path && node.path.original === 'fn') {
          reportFnHandlerFactory(node, log);
        }
      }
    };
  }
}
