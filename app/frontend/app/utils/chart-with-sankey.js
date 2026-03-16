/**
 * Chart.js with Sankey plugin - loaded via CDN in app/index.html.
 * Import the accessor from here to use sankey charts; the Sankey plugin is auto-registered when the vendor script loads.
 */
export function getChart() {
  if (typeof window === 'undefined' || !window.Chart) {
    throw new Error(
      'Chart.js with Sankey plugin is not available on window.Chart. ' +
      'Ensure the Chart.js script (with the Sankey plugin) is loaded before using chart-with-sankey.'
    );
  }

  return window.Chart;
}

export default getChart;
