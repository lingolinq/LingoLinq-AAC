import { Factory } from 'miragejs';

export default Factory.extend({
  // Defaults for a minimal valid board. Override in tests via server.create('board', { ... }).
  id: (i) => `1_${i + 1}`,
  name: 'Test Board',
  key: 'tester/test-board',
  user_name: 'tester',
  description: '',
  public: false,
  protected_material: false,
  locale: 'en',
  locales: ['en'],
  valid_id: true,
  license: { type: 'private' },
  permissions: { view: true, edit: true },
  grid: {
    rows: 3,
    columns: 4,
    order: [
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null]
    ]
  },
  buttons: [],
  image_urls: {},
  images: []
});
