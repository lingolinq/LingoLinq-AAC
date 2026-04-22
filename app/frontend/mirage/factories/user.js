import { Factory } from 'ember-cli-mirage';

export default Factory.extend({
  id: (i) => `1_${i + 100}`,
  user_name: 'tester',
  name: 'Test User',
  premium: true,
  preferences: {
    home_board: null,
    device: {}
  }
});
