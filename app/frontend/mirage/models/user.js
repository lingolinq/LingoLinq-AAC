import { Model } from 'miragejs';

// Required for `schema.users` to exist. Factories alone do NOT register a
// collection on the schema — without this model, every handler doing
// `schema.users.findBy(...)` threw and Mirage answered 500, which is what
// broke `/api/v1/users/:id` and took the board-detail route down with it.
export default Model.extend({});
