import { install_symbol_filters } from '../utils/symbol_filters';

// The SVG filters app.scss names for AAC symbols, in every page shell (utils/symbol_filters.js).
export default {
  name: 'symbol-filters',
  initialize: function() {
    install_symbol_filters();
  }
};
