import speecher from '../utils/speecher';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),

  opening: function() {
    var _this = this;
    if(this.get('model.button')) {
      var locations = this.get('model.button.geos') || this.get('model.button.ssids');
      var times = this.get('model.button.times');
      var places = this.get('model.button.places');
      if(!this.get('model.button.highlight_type')) {
        if((locations && times) || (locations && places) || (times && places)) {
          this.set('model.button.highlight_type', 'custom');
        } else if(locations) {
          this.set('model.button.highlight_type', 'locations');
        } else if(times) {
          this.set('model.button.highlight_type', 'times');
        } else if(places) {
          this.set('model.button.highlight_type', 'places');
        }
      }
      this.set('model.button.fenced', !!this.get('model.button.highlight_type'));
      if(this.get('model.button.ssids')) {
        this.set('model.button.ssids', this.get('model.button.ssids').join(','));
      }
      if(times) {
        if(times.split) {
          times = times.split(/;/).map(function(t) { return t.split(/-/); });
        }
        var readable_times = [];
        times.forEach(function(parts) {
          var part_strings = parts.map(function(part) {
            return _this.format_time(part);
          });
          readable_times.push(part_strings.join('-'));
        });
        this.get('model.button.times', readable_times.join(';'));
      }
      if(places) {
        this.set('model.button.places', this.get('model.button.places').join(','));
      }
    }
  },
  closing: function() {
    if(!this.get('model.button.fenced')) {
      this.set('model.button.highlight_type', null);
      this.set('model.button.times', null);
      this.set('model.button.geos', null);
      this.set('model.button.places', null);
      this.set('model.button.ssids', null);
    }
  },
  format_time: function(str) {
    var blocks = str.split(/:/).map(function(p) { return parseInt(p, 10); });
    var am = true;
    if(blocks[0] === 0) {
      blocks[0] = 12;
    } if(blocks[0] > 11) {
      if(blocks[0] != 12) {
        blocks[0] = blocks[0] - 12;
      }
      am = false;
    }
    var res = "";
    if(blocks[0] < 10) { res = res + "0"; }
    res = res + blocks[0];
    res = res + ":";
    if(blocks[1] < 10) { res = res + "0"; }
    res = res + blocks[1];
    res = res + (am ? i18n.t('am', 'am') : i18n.t('pm', 'pm'));
    return res;
  },
  highlight_types: [
    {name: i18n.t('select_type', "[ Select Type ]"), id: 'none'},
    {name: i18n.t('location_based', "Highlight at Specific Locations"), id: 'locations'},
    {name: i18n.t('time_based', "Highlight at Certain Times of Day"), id: 'times'},
    {name: i18n.t('place_based', "Highlight at Types of Locations"), id: 'places'},
    {name: i18n.t('multiple_types', "Multiple Highlighting Types"), id: 'custom'}
  ],
  location_setting: computed('model.button.highlight_type', function() {
    return this.get('model.button.highlight_type') == 'locations' || this.get('model.button.highlight_type') == 'custom';
  }),
  time_setting: computed('model.button.highlight_type', function() {
    return this.get('model.button.highlight_type') == 'times' || this.get('model.button.highlight_type') == 'custom';
  }),
  place_setting: computed('model.button.highlight_type', function() {
    return this.get('model.button.highlight_type') == 'places' || this.get('model.button.highlight_type') == 'custom';
  }),
  places_list: [
    // https://developers.google.com/places/web-service/search
    {name: i18n.t('select_place', "[Select Location Type]"), id: ''},
    {name: i18n.t('accounting', "Accountant"), id: 'accounting'},
    {name: i18n.t('airport', "Airport"), id: 'airport'},
    {name: i18n.t('amusement_park', "Amusement Park"), id: 'amusement_park'},
    {name: i18n.t('aquarium', "Aquarium"), id: 'aquarium'},
    {name: i18n.t('art_gallery', "Art Gallery"), id: 'art_gallery'},
    {name: i18n.t('atm', "ATM"), id: 'atm'},
    {name: i18n.t('bakery', "Bakery"), id: 'bakery'},
    {name: i18n.t('bank', "Bank"), id: 'bank'},
    {name: i18n.t('bar', "Bar"), id: 'bar'},
    {name: i18n.t('beauty_salon', "Beauty Salon"), id: 'beauty_salon'},
    {name: i18n.t('bicycle_store', "Bicycle Store"), id: 'bicycle_store'},
    {name: i18n.t('book_store', "Book Store"), id: 'book_store'},
    {name: i18n.t('bowling_alley', "Bowling Alley"), id: 'bowling_alley'},
    {name: i18n.t('bus_station', "Bus Station"), id: 'bus_station'},
    {name: i18n.t('cafe', "Cafe"), id: 'cafe'},
    {name: i18n.t('campground', "Campground"), id: 'campground'},
    {name: i18n.t('car_dealer', "Car Dealer"), id: 'car_dealer'},
    {name: i18n.t('car_rental', "Car Rental"), id: 'car_rental'},
    {name: i18n.t('car_repair', "Car Repair"), id: 'car_repair'},
    {name: i18n.t('car_wash', "Car Wash"), id: 'car_wash'},
    {name: i18n.t('casino', "Casino"), id: 'casino'},
    {name: i18n.t('cemetery', "Cemetery"), id: 'cemetery'},
    {name: i18n.t('church', "Church"), id: 'church'},
    {name: i18n.t('city_hall', "City Hall"), id: 'city_hall'},
    {name: i18n.t('clothing_store', "Clothing Store"), id: 'clothing_store'},
    {name: i18n.t('convenience_store', "Convenience Store"), id: 'convenience_store'},
    {name: i18n.t('courthouse', "Courthouse"), id: 'courthouse'},
    {name: i18n.t('dentist', "Dentist"), id: 'dentist'},
    {name: i18n.t('department_store', "Department Store"), id: 'department_store'},
    {name: i18n.t('doctor', "Doctor"), id: 'doctor'},
    {name: i18n.t('electrician', "Electrician"), id: 'electrician'},
    {name: i18n.t('electronics_store', "Electronics Store"), id: 'electronics_store'},
    {name: i18n.t('embassy', "Embassy"), id: 'embassy'},
    {name: i18n.t('fire_station', "Fire Station"), id: 'fire_station'},
    {name: i18n.t('florist', "Florist"), id: 'florist'},
    {name: i18n.t('funeral_home', "Funeral Home"), id: 'funeral_home'},
    {name: i18n.t('furniture_store', "Furniture Store"), id: 'furniture_store'},
    {name: i18n.t('gas_station', "Gas Station"), id: 'gas_station'},
    {name: i18n.t('gym', "Gym"), id: 'gym'},
    {name: i18n.t('hair_care', "Hair Care"), id: 'hair_care'},
    {name: i18n.t('hardware_store', "Hardware Store"), id: 'hardware_store'},
    {name: i18n.t('hindu_temple', "Hindu Temple"), id: 'hindu_temple'},
    {name: i18n.t('home_goods_store', "Home Goods Store"), id: 'home_goods_store'},
    {name: i18n.t('hospital', "Hospital"), id: 'hospital'},
    {name: i18n.t('insurance_agency', "Insurance Agency"), id: 'insurance_agency'},
    {name: i18n.t('jewelry_store', "Jewelry Store"), id: 'jewelry_store'},
    {name: i18n.t('laundry', "Laundry"), id: 'laundry'},
    {name: i18n.t('lawyer', "Lawyer"), id: 'lawyer'},
    {name: i18n.t('library', "Library"), id: 'library'},
    {name: i18n.t('liquor_store', "Liquor Store"), id: 'liquor_store'},
    {name: i18n.t('local_government_office', "Local Government Office"), id: 'local_government_office'},
    {name: i18n.t('locksmith', "Locksmith"), id: 'locksmith'},
    {name: i18n.t('lodging', "Lodging"), id: 'lodging'},
    {name: i18n.t('meal_delivery', "Meal Deliver"), id: 'meal_delivery'},
    {name: i18n.t('meal_takeaway', "Meal Takeout"), id: 'meal_takeaway'},
    {name: i18n.t('mosque', "Mosque"), id: 'mosque'},
    {name: i18n.t('movie_rental', "Movie Rental"), id: 'movie_rental'},
    {name: i18n.t('movie_theater', "Movie Theater"), id: 'movie_theater'},
    {name: i18n.t('moving_company', "Moving Company"), id: 'moving_company'},
    {name: i18n.t('museum', "Museum"), id: 'museum'},
    {name: i18n.t('night_club', "Night Club"), id: 'night_club'},
    {name: i18n.t('painter', "Painter"), id: 'painter'},
    {name: i18n.t('park', "Park"), id: 'park'},
    {name: i18n.t('parking', "Parking"), id: 'parking'},
    {name: i18n.t('pet_store', "Pet Store"), id: 'pet_store'},
    {name: i18n.t('pharmacy', "Pharmacy"), id: 'pharmacy'},
    {name: i18n.t('physiotherapist', "Physiotherapist"), id: 'physiotherapist'},
    {name: i18n.t('plumber', "Plumber"), id: 'plumber'},
    {name: i18n.t('police', "Police"), id: 'police'},
    {name: i18n.t('post_office', "Post Office"), id: 'post_office'},
    {name: i18n.t('real_estate_agency', "Real Estate Agency"), id: 'real_estate_agency'},
    {name: i18n.t('restaurant', "Restaurant"), id: 'restaurant'},
    {name: i18n.t('roofing_contractor', "Roofing Contractor"), id: 'roofing_contractor'},
    {name: i18n.t('rv_park', "RV Park"), id: 'rv_park'},
    {name: i18n.t('school', "School"), id: 'school'},
    {name: i18n.t('shoe_store', "Shoe Store"), id: 'shoe_store'},
    {name: i18n.t('shopping_mall', "Shopping Mall"), id: 'shopping_mall'},
    {name: i18n.t('spa', "Spa"), id: 'spa'},
    {name: i18n.t('stadium', "Stadium"), id: 'stadium'},
    {name: i18n.t('storage', "Storage"), id: 'storage'},
    {name: i18n.t('store', "Store"), id: 'store'},
    {name: i18n.t('subway_station', "Subway Station"), id: 'subway_station'},
    {name: i18n.t('synagogue', "Synagogue"), id: 'synagogue'},
    {name: i18n.t('taxi_stand', "Taxi Stand"), id: 'taxi_stand'},
    {name: i18n.t('train_station', "Train Station"), id: 'train_station'},
    {name: i18n.t('transit_station', "Transit Station"), id: 'transit_station'},
    {name: i18n.t('travel_agency', "Travel Agency"), id: 'travel_agency'},
    {name: i18n.t('university', "University"), id: 'university'},
    {name: i18n.t('veterinary_care', "Veterinary Care"), id: 'veterinary_care'},
    {name: i18n.t('zoo', "Zoo"), id: 'zoo'}
  ],
  actions: {
    alert: function() {
      speecher.beep();
    },
    add_ssid: function() {
      if(this.appState.get('current_ssid')) {
        var ssids = (this.get('model.button.ssids') || '').split(/,/);
        if(ssids.length == 1 && ssids[0] === '') { ssids = []; }
        ssids.push(this.appState.get('current_ssid'));
        this.set('model.button.ssids', ssids.uniq().join(','));
      }
    },
    add_place: function() {
      if(this.get('place')) {
        var places = (this.get('model.button.places') || '').split(/,/);
        if(places.length == 1 && places[0] === '') { places = []; }
        places.push(this.get('place'));
        this.set('model.button.places', places.uniq().join(','));
      }
    },
    add_time: function() {
      var start = this.get('start');
      var end = this.get('end');
      if(start && end) {
        var times = (this.get('model.button.times') || '').split(/;/);
        if(times.length == 1 && times[0] === '') { times = []; }
        times.push(this.format_time(start) + "-" + this.format_time(end));
        this.set('model.button.times', times.uniq().join(';'));
      }
    }
  }
});


