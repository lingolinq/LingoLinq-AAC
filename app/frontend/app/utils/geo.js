/**
Copyright 2021, OpenAAC
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
// import stashes from './_stashes';
// import app_state from './app_state';
// import persistence from './persistence';

var geo = EmberObject.extend({
  setup: function(appState, persistence, stashes) {
    this.appState = appState;
    this.persistence = persistence;
    this.stashes = stashes;
  },
  distance: function(lat1, lon1, lat2, lon2) {
    // http://stackoverflow.com/questions/27928/calculate-distance-between-two-latitude-longitude-points-haversine-formula
    var p = 0.017453292519943295;    // Math.PI / 180
    var c = Math.cos;
    var a = 0.5 - c((lat2 - lat1) * p)/2 +
            c(lat1 * p) * c(lat2 * p) *
            (1 - c((lon2 - lon1) * p))/2;

    var km = 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
    var ft = km * 1000 *  3.28084;
    return ft;
  },
  check_locations: function() {
    var _this = this;
    var new_coords = this.stashes.get('geo.latest.coords');
    var last_check = _this.get('last_location_check');
    if(new_coords) {
      var distance = 0;
      if(last_check) {
        distance = _this.distance(new_coords.latitude, new_coords.longitude, last_check.latitude, last_check.longitude);
      }
      if(distance > 500 || !last_check) {
        new_coords.timestamp = (new Date()).getTime();
        var id = (new Date()).getTime() + "_" + Math.random(99999);
        new_coords.check_id = id;
        _this.set('last_location_check', new_coords);
        return this.persistence.ajax('/api/v1/users/' + this.appState.get('currentUser.user_name') + '/places?latitude=' + new_coords.latitude + "&longitude=" + new_coords.longitude, {type: 'GET'}).then(function(res) {
          if(_this.get('last_location_check.id') == id) {
            _this.set('last_location_check', null);
          }
          _this.appState.set('nearby_places', res);
          return res;
        }, function(err) {
          if(_this.get('last_location_check.id') == id) {
            _this.set('last_location_check', null);
          }
          return RSVP.reject(err);
        });
      } else {
        return RSVP.reject({error: "nothing to check"});
      }
    } else {
      return RSVP.reject({error: "no coordinates found"});
    }
    // When online and geo updates, do a places check to see if there are places that
    // trigger a sidebar highlight.
    // This is an expensive lookup, so only do it if the user has a least one place-based
    // sidebar setting, or eager place lookups enabled.
    // Also keep track of the last lookup and don't ping again until you're at least
    // 500 feet away from the last successful/pending ping.

    // - if the user has a place-based sidebar setting or eager place lookups
    // - measure the distance from the last successful or pending ping
    // - if farther than 500 feet away:
    //     - set the current location as a pending ping
    //     - ping for locations and replace app_state.nearby_places
  }
}).create();

export default geo;
