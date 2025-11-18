describe('Board', function() {
  beforeEach(function() {
    Ember.testing = true;
    LingoLinq.reset();
  });
  
  describe("user_name", function() {
    it("should not error on null user_name", function() {
      var board = LingoLinq.store.createRecord('board', {});
      expect(board.get('user_name')).toEqual("");
    });
    it("should pull user_name from the key attribute", function() {
      var board = LingoLinq.store.createRecord('board', {key: "hat"});
      expect(board.get('user_name')).toEqual("hat");
      board.set('key', 'hat/bacon');
      expect(board.get('user_name')).toEqual("hat");
      board.set('key', 'hart/bacon');
      expect(board.get('user_name')).toEqual("hart");
    });
  });
  
  describe("icon_url_with_fallback", function() {
    it("should not error on null image_url", function() {
      var board = LingoLinq.store.createRecord('board', {});
      expect(board.get('icon_url_with_fallback')).toNotEqual("");
      expect(board.get('icon_url_with_fallback')).toNotEqual(null);
    });
    it("should return image_url if specified", function() {
      var board = LingoLinq.store.createRecord('board', {image_url: "http://pics.pic/pic.png"});
      expect(board.get('icon_url_with_fallback')).toEqual("http://pics.pic/pic.png");
    });
    it("should return fallback url if image_url is empty", function() {
      var board = LingoLinq.store.createRecord('board', {});
      expect(board.get('icon_url_with_fallback')).toEqual(board.fallback_image_url);
    });
    it("should automatically check for locally-stored data-uri on load");
  });
  
  describe("key_placeholder", function() {
    it("should stay in sync with the name attribute", function() {
      var board = LingoLinq.store.createRecord('board', {name: "Bacon"});
      expect(board.get('key_placeholder')).toEqual("bacon");
      board.set('name', 'Bacon and eggs');
      expect(board.get('key_placeholder')).toEqual("bacon-and-eggs");
      board.set('name', null);
      expect(board.get('key_placeholder')).toEqual("my-board");
      board.set('name', "");
      expect(board.get('key_placeholder')).toEqual("my-board");
    });
    it("should strip out non-key characters from the name attribute", function() {
      var board = LingoLinq.store.createRecord('board', {name: "Bacon!"});
      expect(board.get('key_placeholder')).toEqual("bacon");
      board.set('name', '!$%&$#&_$#%$&-$#%&#Bacon and *#$#$^*eggs____---@$%@');
      expect(board.get('key_placeholder')).toEqual("-_-bacon-and-eggs____");
    });
  });
  
  describe("labels", function() {
    it("should not error on empty grid or buttons", function() {
      var board = LingoLinq.store.createRecord('board', {});
      expect(board.get('labels')).toEqual("");
    });
    
    it("should return list of labels on specified buttons", function() {
      var board = LingoLinq.store.createRecord('board', {
        buttons: [
          {id: 1, label: "hat"},
          {id: 2, label: "car"}
        ],
        grid: {
          rows: 2,
          columns: 2,
          order: [[1,2],[2,2]] 
        }
      });
      expect(board.get('labels')).toEqual("hat, car, car, car");
    });
    
    it("should skip empty buttons", function() {
      var board = LingoLinq.store.createRecord('board', {
        buttons: [
          {id: 1, label: "hat"},
          {id: 2, label: "car"},
          {id: 3}
        ],
        grid: {
          rows: 2,
          columns: 2,
          order: [[1,2],[null,3]] 
        }
      });
      expect(board.get('labels')).toEqual("hat, car");
    });
  });
  
//   star_or_unstar: function(star) {
//     var _this = this;
//     console.log(star);
//     persistence.ajax('/api/v1/boards/' + this.get('id') + '/stars', {
//       type: 'POST',
//       data: {
//         '_method': (star ? 'POST' : 'DELETE')
//       }
//     }).then(function(data) {
//       _this.set('starred', data.starred);
//       _this.set('stars', data.stars);
//     }, function() {
//       modal.warning(i18n.t('star_failed', "Star action failed"));
//     });
//   },
//   star: function() {
//     return this.star_or_unstar(true);
//   },
//   unstar: function() {
//     return this.star_or_unstar(false);
//   },
  describe("star/unstar", function() {
    it("should make the appropriate call to star a board", function() {
      var called = false;
      stub(persistence, 'ajax', function(url, opts) {
        called = true;
        expect(url).toEqual('/api/v1/boards/123/stars');
        expect(opts.type).toEqual('POST');
        expect(opts.data._method).toEqual('POST');
        return Ember.RSVP.resolve({starred: true, stars: 4});
      });
      var board = LingoLinq.store.createRecord('board', {id: '123'});
      expect(board.get('starred')).not.toEqual(true);
      board.star();
      expect(called).toEqual(true);
      waitsFor(function() { return board.get('starred'); });
      runs(function() {
        expect(board.get('starred')).toEqual(true);
        expect(board.get('stars')).toEqual(4);
      });
    });
    
    it("should make the appropriate call to unstar a board", function() {
      var called = false;
      stub(persistence, 'ajax', function(url, opts) {
        called = true;
        expect(url).toEqual('/api/v1/boards/1234/stars');
        expect(opts.type).toEqual('POST');
        expect(opts.data._method).toEqual('DELETE');
        return Ember.RSVP.resolve({starred: false, stars: 2});
      });
      var board = LingoLinq.store.createRecord('board', {id: '1234', starred: true});
      expect(board.get('starred')).toEqual(true);
      board.unstar();
      expect(called).toEqual(true);
      waitsFor(function() { return !board.get('starred'); });
      runs(function() {
        expect(board.get('starred')).toEqual(false);
        expect(board.get('stars')).toEqual(2);
      });
    });
    it("should update the board's star attributes after success", function() {
      var called = false;
      stub(persistence, 'ajax', function(url, opts) {
        called = true;
        expect(url).toEqual('/api/v1/boards/12345/stars');
        expect(opts.type).toEqual('POST');
        expect(opts.data._method).toEqual('POST');
        return Ember.RSVP.resolve({starred: true, stars: 4});
      });
      var board = LingoLinq.store.createRecord('board', {id: '12345', stars: 3});
      expect(board.get('stars')).toEqual(3);
      board.star();
      expect(called).toEqual(true);
      waitsFor(function() { return board.get('starred'); });
      runs(function() {
        expect(board.get('stars')).toEqual(4);
      });
    });
    it("should not vomit on API call failure", function() {
      var called = false;
      stub(modal, 'warning', function(message) {
        called = true;
        expect(message).toEqual("Star action failed");
      });
      stub(persistence, 'ajax', function(url, opts) {
        expect(url).toEqual('/api/v1/boards/123456/stars');
        expect(opts.type).toEqual('POST');
        expect(opts.data._method).toEqual('POST');
        return Ember.RSVP.reject();
      });
      var board = LingoLinq.store.createRecord('board', {id: '123456', stars: 3});
      board.star();
      waitsFor(function() { return called; });
    });
  });
  
  describe("add_button", function() {
    it("should add the button to the list", function() {
      var board = LingoLinq.store.createRecord('board');
      board.add_button(LingoLinq.Button.create({id: 123}));
      expect(board.get('buttons').length).toEqual(1);
      expect(board.get('buttons')[0].id).toEqual(123);
      
      board.add_button(LingoLinq.Button.create({id: 1234}));
      expect(board.get('buttons').length).toEqual(2);
      expect(board.get('buttons')[0].id).toEqual(123);
      expect(board.get('buttons')[1].id).toEqual(1234);
    });
    
    it("should generate a new, unique id if an existing button has that id", function() {
      var board = LingoLinq.store.createRecord('board');
      board.set('buttons', [{
        id: 123, label: 'hat'
      }]);
      board.add_button(LingoLinq.Button.create({id: 123, label: 'cat'}));
      expect(board.get('buttons').length).toEqual(2);
      expect(board.get('buttons')[0].id).toEqual(123);
      expect(board.get('buttons')[0].label).toEqual('hat');
      expect(board.get('buttons')[1].id).toEqual(124);
      expect(board.get('buttons')[1].label).toEqual('cat');
      
      board.add_button(LingoLinq.Button.create({id: 123, label: 'rat'}));
      expect(board.get('buttons').length).toEqual(3);
      expect(board.get('buttons')[0].id).toEqual(123);
      expect(board.get('buttons')[0].label).toEqual('hat');
      expect(board.get('buttons')[1].id).toEqual(124);
      expect(board.get('buttons')[1].label).toEqual('cat');
      expect(board.get('buttons')[2].id).toEqual(125);
      expect(board.get('buttons')[2].label).toEqual('rat');
    });
    
    it("should return the id of the button as the result", function() {
      var board = LingoLinq.store.createRecord('board');
      board.set('buttons', [{
        id: 123, label: 'hat'
      }]);
      expect(board.add_button(LingoLinq.Button.create({id: 123, label: 'cat'}))).toEqual(124);
      expect(board.add_button(LingoLinq.Button.create({id: 129, label: 'cat'}))).toEqual(129);
    });
    
    it("should add to the first empty spot it finds in the grid", function() {
      var board = LingoLinq.store.createRecord('board');
      board.set('buttons', [{
        id: 123, label: 'hat'
      }]);
      board.set('grid', {
        order: [[1,2,null],[2,null,null]]
      });
      expect(board.add_button(LingoLinq.Button.create({id: 123, label: 'cat'}))).toEqual(124);
      expect(board.get('grid').order).toEqual([[1,2,124],[2,null,null]]);
      expect(board.add_button(LingoLinq.Button.create({id: 129, label: 'cat'}))).toEqual(129);
      expect(board.get('grid').order).toEqual([[1,2,124],[2,129,null]]);
    });
  });
  
  describe("button_visible", function() {
    it("should return true if the id is in the grid order", function() {
      var board = LingoLinq.store.createRecord('board');
      board.set('grid', {
        order: [[1,2,3],[2,3,4],[6,7,8]]
      });
      expect(board.button_visible(1)).toEqual(true);
      expect(board.button_visible(2)).toEqual(true);
      expect(board.button_visible(3)).toEqual(true);
      expect(board.button_visible(4)).toEqual(true);
      expect(board.button_visible(6)).toEqual(true);
      expect(board.button_visible(7)).toEqual(true);
      expect(board.button_visible(8)).toEqual(true);
    });
    
    it("should return false if the id is not in the grid order", function() {
      var board = LingoLinq.store.createRecord('board');
      board.set('grid', {
        order: [[1,2,3],[2,3,4],[6,7,8]]
      });
      expect(board.button_visible(5)).toEqual(false);
      expect(board.button_visible(9)).toEqual(false);
      expect(board.button_visible('5')).toEqual(false);
      expect(board.button_visible('a')).toEqual(false);
      expect(board.button_visible(null)).toEqual(false);
    });
    
    it("should not error on malformed grid", function() {
      var board = LingoLinq.store.createRecord('board');
      board.set('grid', {
        order: []
      });
      expect(board.button_visible(5)).toEqual(false);
      board.set('grid', {
        order: null
      });
      expect(board.button_visible(5)).toEqual(false);
    });
  });
});


