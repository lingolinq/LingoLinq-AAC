import Component from '@ember/component';
import templateHelpers from '../../utils/template_helpers';
import LingoLinq from '../../app';
import i18n from '../../utils/i18n';
import { htmlSafe } from '@ember/template';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default Component.extend({
  didInsertElement: function() {
    this.draw();
  },
  elem_class: computed('side_by_side', function() {
    if(this.get('side_by_side')) {
      return htmlSafe('col-sm-6');
    } else {
      return htmlSafe('col-sm-8');
    }
  }),
  elem_style: computed('right_side', function() {
    if(this.get('right_side')) {
      return htmlSafe('border-left: 1px solid #eee;');
    } else {
      return htmlSafe('');
    }
  }),
  draw: observer('usage_stats.draw_id', function() {
    var stats = this.get('usage_stats');
    var elem = this.get('element').getElementsByClassName('geo_map')[0];

    LingoLinq.Visualizations.wait('geo', function() {
      if(elem && stats && stats.get('geo_locations')) {
        var current_info = null;
        if(elem) {
          var map = new window.google.maps.Map(elem, {
            scrollwheel: false,
            maxZoom: 16
          });
          var markers = [];
          stats.get('geo_locations').forEach(function(location) {
            var title = i18n.t('session_count', "session", {count: location.total_sessions});
            var marker = new window.google.maps.Marker({
              position: new window.google.maps.LatLng(location.geo.latitude, location.geo.longitude),
              // TODO: https://developers.google.com/maps/documentation/javascript/examples/marker-animations-iteration
              // animation: window.google.maps.Animation.DROP,
              title: title
            });
            // TODO: popup information for each location
            marker.setMap(map);
            markers.push(marker);

            var dater = templateHelpers.date;
            var container = document.createElement('div');
            container.appendChild(document.createTextNode(title));
            container.appendChild(document.createElement('br'));
            container.appendChild(document.createTextNode(dater(location.started_at, null)));
            container.appendChild(document.createTextNode(' to '));
            container.appendChild(document.createElement('br'));
            container.appendChild(document.createTextNode(dater(location.ended_at, null)));
            container.appendChild(document.createElement('br'));
            var link = document.createElement('a');
            link.href = '#';
            link.className = 'ember_link';
            link.dataset.location_id = String(location.id);
            link.textContent = i18n.t('filter_by_location', 'filter by this location');
            container.appendChild(link);

            var info = new window.google.maps.InfoWindow({
              content: container
            });
            window.google.maps.event.addListener(marker, 'click', function() {
              if(current_info) {
                current_info.close();
              }
              current_info = info;
              info.open(map, marker);
            });
          });
          var bounds = new window.google.maps.LatLngBounds();
          for(var i=0;i<markers.length;i++) {
           bounds.extend(markers[i].getPosition());
          }
          map.fitBounds(bounds);
        }
      }
    });
  }),
  actions: {
    marker_link_select: function(data) {
      if(data.location_id) {
        if (this.filter) {
          this.filter('location', data.location_id);
        }
      }
    }
  }
});
