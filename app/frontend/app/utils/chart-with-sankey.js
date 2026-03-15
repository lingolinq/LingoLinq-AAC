/**
 * Chart.js with Sankey plugin - bundled via npm (no CDN dependency).
 * Import Chart from here to use sankey charts; the plugin is registered on first import.
 */
import { Chart } from 'chart.js';
import { SankeyController, Flow } from 'chartjs-chart-sankey';

Chart.register(SankeyController, Flow);

export default Chart;
