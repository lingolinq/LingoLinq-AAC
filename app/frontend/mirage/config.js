import { Response, createServer } from 'miragejs';

// ember-cli-mirage 3.x calls the default export with the addon's own config
// (environment, models, factories, serializers discovered from mirage/) and
// expects it to CREATE and return the server. The 2.x style — a zero-arg
// function whose `this` was the server, declaring routes directly — now trips
// `Mirage config default exported function must at least one parameter` inside
// startMirage, which throws in beforeEach before a test's `visit()` ever runs.
// That single assertion, not the app's boot chain, was why every acceptance
// test touching Mirage was skipped.
//
// Route definitions keep the `this`-style body: `routes` is invoked with the
// server as `this`, so the existing handlers are unchanged.
export default function (config) {
  return createServer({
    ...config,
    routes,
    logging: false
  });
}

function routes() {
  // Route prefix matches the LingoLinq Rails JSON API
  this.namespace = 'api/v1';

  // Boards — return whatever the test factory created, serialized as the Rails API expects
  this.get('/boards/:user_name/:boardname', function(schema, request) {
    var key = request.params.user_name + '/' + request.params.boardname;
    var board = schema.boards.findBy({ key: key });
    if(!board) {
      return new Response(404, {}, { error: 'not found' });
    }
    return { board: board.attrs };
  });

  // Users — minimal handler so app_state.sessionUser has something to work with.
  // The API's :id segment is a `find_by_path` value: a global_id OR a user_name
  // (/api/v1/users/tester). `schema.users.find` only knows record ids and THROWS
  // on a miss, which surfaced as a 500 and killed the route — so match on
  // user_name first and only fall back to id for a numeric segment.
  this.get('/users/:id', function(schema, request) {
    var ref = request.params.id;
    var user = schema.users.findBy({ user_name: ref });
    if(!user && /^\d+$/.test(ref)) {
      user = schema.users.find(ref);
    }
    if(!user) {
      return new Response(404, {}, { error: 'not found' });
    }
    return { user: user.attrs };
  });

  this.get('/users/:id/stats', function() { return { stats: {} }; });

  // Board hierarchy. board-detail's model hook fetches `/tree?root_only=1` first
  // to paint, then warms the full `/tree` in the background — so BOTH must answer
  // or the route never resolves and the test times out. Shape mirrors
  // boards_controller#tree: `{ root: <wrapped board>, descendants: [...] }`,
  // which the client checks as `data.root.board` before using it.
  this.get('/boards/:user_name/:boardname/tree', function(schema, request) {
    var key = request.params.user_name + '/' + request.params.boardname;
    var board = schema.boards.findBy({ key: key });
    if(!board) {
      return new Response(404, {}, { error: 'not found' });
    }
    // Descendants stay empty: these tests cover a single board, and an empty
    // list is a valid tree (a board with no linked boards).
    return { root: { board: board.attrs }, descendants: [] };
  });

  // Locale strings. The app requests these during boot; an unhandled request
  // logs a persistence warning and leaves a pending fetch behind.
  this.get('/lang/:locale', function() { return {}; });

  // Outbound proxy (locale files, symbol audio). Never let a test reach the
  // network — answer empty so callers settle instead of hanging.
  this.get('/search/proxy', function() { return {}; });

  // Anything else hits a no-op handler so tests don't explode on unmocked endpoints.
  // Add specific handlers above this line as tests require them.
  this.passthrough('/**/assets/**');
  this.passthrough('/assets/**');

  // Flip `logging: true` in the createServer call above to see unhandled requests
  // while developing a test.
}
