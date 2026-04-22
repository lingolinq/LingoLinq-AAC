import { Response } from 'ember-cli-mirage';

export default function() {
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

  // Users — minimal handler so app_state.sessionUser has something to work with
  this.get('/users/:id', function(schema, request) {
    var user = schema.users.find(request.params.id);
    if(!user) {
      return new Response(404, {}, { error: 'not found' });
    }
    return { user: user.attrs };
  });

  this.get('/users/:id/stats', function() { return { stats: {} }; });

  // Anything else hits a no-op handler so tests don't explode on unmocked endpoints.
  // Add specific handlers above this line as tests require them.
  this.passthrough('/**/assets/**');
  this.passthrough('/assets/**');

  // Uncomment to see all unhandled requests during test development:
  // this.logging = true;
}
