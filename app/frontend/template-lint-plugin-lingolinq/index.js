import noFnHandlerFactory from './rules/no-fn-handler-factory.js';
import requireInputAccessibleName from './rules/require-input-accessible-name.js';

export default {
  name: 'lingolinq',
  rules: {
    'no-fn-handler-factory': noFnHandlerFactory,
    'require-input-accessible-name': requireInputAccessibleName
  }
};
