/**
 * Template helper functions for use in Handlebars templates and app code.
 * Replaces Ember.templateHelpers to fix ember-global deprecation.
 * Functions that depend on i18n are registered via registerTemplateHelpers(i18n).
 */
import { htmlSafe } from '@ember/template';
import capabilities from './capabilities';

var templateHelpers = {};

// path() - depends on capabilities only
templateHelpers.path = function(value1, options) {
  if(capabilities.installed_app) {
    return value1;
  } else {
    return '/' + value1;
  }
};

// Pure helpers - no i18n dependency
templateHelpers.date = function(date, precision) {
  var now = new Date();
  if(arguments.length == 1) {
    date = now;
  }
  if(typeof date == 'number') {
    if(date * 1000 < now.getTime()) {
      date = date * 1000;
    }
  }
  var moment = window.moment(date);
  if(precision == 'day') {
    return moment.format('MMMM Do YYYY');
  } else if(precision == 'short_day') {
    return moment.format('MMM Do YYYY');
  } else if(precision == 'tiny_day') {
    if(moment._d.getFullYear() == now.getFullYear()) {
      return moment.format('MMM D');
    } else {
      return moment.format('MMM D, YY');
    }
  } else if(precision == 'abbrev') {
    return moment.format('MMM Do YYYY, h:mm a');
  } else {
    return moment.format('MMMM Do YYYY, h:mm a');
  }
};

templateHelpers.time = function(date) {
  date = date || new Date();
  var moment = window.moment(date);
  return moment.format('h:mma');
};

templateHelpers.is_equal = function(lhs, rhs) {
  return lhs == rhs;
};

templateHelpers.duration = function(duration) {
  if(duration && duration > 0) {
    duration = Math.round(duration);
    var result = '';
    var seconds = duration % 60;
    var minutes = Math.floor(duration / 60) % 60;
    var hours = Math.floor(duration / 3600);
    if(hours > 0) {
      result = hours + ':';
      if(minutes < 10) {
        result = result + '0';
      }
      result = result + minutes + ':';
    } else {
      result = minutes + ':';
    }
    if(seconds < 10) {
      result = result + '0';
    }
    result = result + seconds;
    return result;
  } else {
    return '';
  }
};

templateHelpers.round = function(number) {
  var val = parseFloat(number);
  if (number === undefined || number === null || Number.isNaN(val)) {
    return 0;
  }
  return Math.round(val * 100) / 100;
};

templateHelpers.safe = function(str, type) {
  if(!str) { return ''; }
  if(type == 'stripped') {
    const doc = new DOMParser().parseFromString(str, 'text/html');
    return htmlSafe(doc.body.textContent || '');
  } else {
    return htmlSafe(str);
  }
};

/**
 * Registers helpers that depend on i18n. Call from i18n.js after i18n is created.
 */
export function registerTemplateHelpers(i18n) {
  templateHelpers.delimit = function(num, type) {
    var val = parseFloat(num);
    if (num === undefined || num === null || Number.isNaN(val) || val < 0) {
      return '0';
    }
    var pieces = [];
    var leftover = val;
    while(leftover >= 1000) {
      leftover = Math.floor(leftover);
      pieces.push(leftover % 1000);
      leftover = leftover / 1000;
    }
    pieces.push(Math.floor(leftover));
    pieces = pieces.reverse().map(function(p, idx) { p = p.toString(); while(idx > 0 && p.length < 3) { p = '0' + p; } return p; });
    if(pieces.length == 1) {
      return val.toString();
    } else if(pieces.length > 2 && type != 'full') {
      pieces.pop();
      var dec = parseInt(pieces.pop(), 10);
      if(pieces.length == 1 && pieces[0] < 10) {
        pieces[0] = parseInt(pieces[0], 10) + (dec / 1000);
        pieces[0] = Math.round(pieces[0] * 100) / 100;
      }
      return i18n.t('n_million', '%{num}M', {num: pieces.join(',')});
    } else if(pieces.length > 1 && type != 'full') {
      var dec = parseInt(pieces.pop(), 10);
      if(pieces.length == 1 && pieces[0] < 10) {
        pieces[0] = parseInt(pieces[0], 10) + (dec / 1000);
        pieces[0] = Math.round(pieces[0] * 10) / 10;
      }
      return i18n.t('n_thousand', '%{num}k', {num: pieces.join(',')});
    } else {
      return pieces.join(',');
    }
  };

  templateHelpers.locale = function(str) {
    str = str.replace(/-/g, '_');
    var pieces = str.split(/_/);
    if(pieces[0]) { pieces[0] = pieces[0].toLowerCase(); }
    if(pieces[1]) { pieces[1] = pieces[1].toUpperCase(); }
    str = pieces[0] + '_' + pieces[1];
    var res = i18n.get('locales')[str];
    if(!res) {
      res = i18n.get('locales')[pieces[0]];
    }
    res = res || i18n.t('unknown_locale', 'Unknown');
    return res;
  };

  templateHelpers.date_ago = function(date, precision) {
    if(typeof(date) == 'number' && date < 1577862000000) {
      date = date * 1000;
    }
    var moment = window.moment(date);
    if(precision == 'day') {
      var pre = window.moment();
      pre.hours(0).minutes(0).seconds(0);
      pre.add(1, 'day');
      var post = window.moment();
      post.hours(0).minutes(0).seconds(0);
      post.add(2, 'day');
      if(moment >= pre && moment <= post) {
        return i18n.t('tomorrow', 'tomorrow');
      }
      pre.subtract(1, 'day');
      post.subtract(1, 'day');
      if(moment >= pre && moment <= post) {
        return i18n.t('today', 'today');
      }
      pre.subtract(1, 'day');
      post.subtract(1, 'day');
      if(moment >= pre && moment <= post) {
        return i18n.t('yesterday', 'yesterday');
      }
    }
    return moment.fromNow();
  };

  templateHelpers.seconds_ago = function(seconds, distance) {
    seconds = (Math.round(seconds * 10) / 10);
    if(!seconds || seconds <= 0) {
      return '';
    } else if(seconds < 60) {
      if(distance == 'brief') {
        return i18n.t('brief_seconds_ago', '%{n}s', {hash: {n: seconds}});
      } else {
        return i18n.t('seconds_ago', 'second', {hash: {count: seconds}});
      }
    } else if(seconds < 3600) {
      var minutes = Math.round(seconds / 60 * 10) / 10;
      if(distance == 'brief') {
        return i18n.t('brief_minutes_ago', '%{n}m', {hash: {n: minutes}});
      } else {
        return i18n.t('minutes_ago', 'minute', {hash: {count: minutes}});
      }
    } else {
      var hours = Math.round(seconds / 3600 * 10) / 10;
      if(distance != 'long' || hours < 24) {
        if(hours > 999) {
          hours = templateHelpers.delimit(hours) + ' ';
          distance = 'brief';
        }
        if(distance == 'brief') {
          return i18n.t('brief_hours_ago', '%{n}hr', {hash: {n: hours, number: true}});
        } else {
          return i18n.t('hours_ago', 'hour', {hash: {count: hours, number: true}});
        }
      } else {
        var days = Math.round(hours / 24);
        if(days < 7) {
          return i18n.t('days_ago', 'day', {hash: {count: days}});
        } else {
          var weeks = Math.round(days / 7 * 10) / 10;
          if(weeks < 12) {
            return i18n.t('weeks_ago', 'week', {hash: {count: weeks}});
          } else {
            var months = Math.round(days / 30 * 10) / 10;
            return i18n.t('months_ago', 'month', {hash: {count: months}});
          }
        }
      }
    }
  };

  templateHelpers.t = function(str, options) {
    return htmlSafe(i18n.t(options.key, str, options));
  };
}

export default templateHelpers;
