import Component from '@ember/component';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import LingoLinq from '../app';
import app_state from '../utils/app_state';
import { observer } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    var _this = this;
    runLater(function() {
      _this.draw();
    });
  },
  willDestroyElement: function() {
    $(this.get('element')).empty();
    // teardown?
  },
  fit_bounds: observer('center', function() {
    var map = this.map;
    if(!map) { return; }
    var markers = this.get('markers') || [];
    var bounds = new window.google.maps.LatLngBounds();
    for(var i=0;i<markers.length;i++) {
     bounds.extend({lat: markers[i].lat, lng: markers[i].lng});
    }
    if(markers.length === 0) {
      bounds.extend(this.get('center'));
    }
    map.fitBounds(bounds);
  }),
  set_geos: function() {
    var geos = [];
    (this.get('markers') || []).forEach(function(marker) {
      if(marker.marker) {
        geos.push(marker.lat + "," + marker.lng);
      }
    });
    this.set('geos', geos.join(';'));
    var callback = this.get('action');
    callback(this.get('geos'));
  },
  add_marker: function(lat, lng) {
    var _this = this;
    var map = this.map;
    var markers = _this.get('markers') || [];
    var id = 'marker_' + (new Date()).getTime() + "_" + Math.random(99999);
    var marker = new window.google.maps.Marker({
      position: new window.google.maps.LatLng(lat, lng),
      // TODO: https://developers.google.com/maps/documentation/javascript/examples/marker-animations-iteration
      animation: window.google.maps.Animation.DROP,
      title: 'marker'
    });
    marker.setMap(map);
    markers.pushObject({
      lat: lat,
      lng: lng,
      marker: marker,
      id: id
    });
    var info = new window.google.maps.InfoWindow({
      content: "Sidebar board location<br/><br/><a href='#' class='ember_link' id='" + id + "'>remove this marker</a>"
    });
    marker.addListener('click', function() {
      if(_this.current_info) { _this.current_info.close(); }
      _this.current_info = info;
      info.open(map, marker);
    });
    _this.set('markers', markers);
    _this.set_geos();
  },
  draw: function() {
    var elem = this.get('element') && this.get('element').getElementsByClassName('map_with_geo')[0];
    elem.innerHTML = "";
    var _this = this;

    LingoLinq.Visualizations.wait('geo', function() {
      if(elem) {
        _this.set('center', {lat: 40.7608, lng: -111.8910});
        if(elem) {
          var map = new window.google.maps.Map(elem, {
            scrollwheel: false,
            maxZoom: 16
          });
          _this.map = map;
          _this.set('markers', []);
          if(navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(geo) {
              _this.set('center', {lat: geo.coords.latitude, lng: geo.coords.longitude});
            });
          }
          map.addListener('click', function(e) {
            _this.add_marker(e.latLng.lat(), e.latLng.lng());
          });
          var geos = _this.get('geos') || [];
          if(geos.split) { geos = geos.split(/;/).map(function(g) { return g.split(/,/).map(function(n) { return parseFloat(n); }); }); }
          console.log(geos);
          geos.forEach(function(geo) {
            var parts = geo;
            if(parts.length == 2) {
              _this.add_marker(parseFloat(parts[0]), parseFloat(parts[1]));
            }
          });
          _this.fit_bounds();
        }
      }
    });
  },
  click: function(event) {
    if(event.target.tagName == 'A' && event.target.className == 'ember_link') {
      event.preventDefault();
      this.remove_marker($(event.target).attr('id'));
    }
  },
  remove_marker: function(id) {
    var markers = this.get('markers') || [];
    var res = [];
    markers.forEach(function(marker) {
      if(marker.id != id) {
        res.push(marker);
      } else if(marker.marker) {
        marker.marker.setMap(null);
      }
    });
    this.set('markers', res);
    this.set_geos();
  },
  actions: {
    mark_center: function() {
      var map = this.map;
      var _this = this;
      if(navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(geo) {
          map.setCenter({lat: geo.coords.latitude, lng: geo.coords.longitude});
          _this.add_marker(geo.coords.latitude, geo.coords.longitude);
        });
      }
    }
  }
});
