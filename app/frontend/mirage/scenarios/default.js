export default function(server) {
  // Scenarios run only in development/demo — acceptance tests build their own state.
  // Leaving empty on purpose so the default dev experience is a blank slate.
  if (server) { /* no-op */ }
}
