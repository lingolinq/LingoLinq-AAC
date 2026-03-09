import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import {
  later as runLater,
  cancel as runCancel
} from '@ember/runloop';
import $ from 'jquery';
import editManager from './edit_manager';
import modal from './modal';
import capabilities from './capabilities';
// import app_state from './app_state';
import scanner from './scanner';
// import stashes from './_stashes';
import utterance from './utterance';
import frame_listener from './frame_listener';
// TODO: change scanning options to allow multiple buttons
// for each action if desired

// gotchas:
// - text boxes in edit mode should be clickable
// - backspace should only remove one item
// - PIN entry shouldn't double-add the selected number
// - identity dropdown should work, including picking an item in the
//   menu, and the menu auto-closing when somewhere else is hit
// - button_list should vocalize on select
// - hitting the action or image icon on a button while in edit
//   mode should open that mode, not general button settings
// - drag and drop to rearrange buttons should work
// - drag to clear/copy to stash should work
// - apply button from stash should work
// - click after short timeout even without mouseup should work
// - too-fast click should not work
// - painting should work
// - gaze_linger events should work
// - debounce should be honored
// - debounce should not apply for triple-click on clear
// - click/touch events should still work when in scanning mode
// - click/touch events should still work when in dwell tracking mode
// - keyboard events can add to the vocalization box
// - mouse cursor/joystick and control the dwell target
// - touch events on modal targets needs to work in speak mode
// - touch events for buttons inside modals need to work in speak mode
// - find a button needs to work for touch and eye gaze
// - select text in a button's text box when editing a button

var $board_canvas = null;

var eat_events = function(event) {
  // on mobile, long presses result in unexpected selection issues.
  // This is an attempt to remedy, for Speak Mode at the very least.
  if (!buttonTracker.appState || buttonTracker.appState.isDestroyed || buttonTracker.appState.isDestroying) { return; }
  var eatable = buttonTracker.appState.get('speak_mode') || (!buttonTracker.appState.get('edit_mode') && $(event.target).closest('.board .button').length > 0);
  if(eatable && capabilities.mobile && !modal.is_open() && !buttonTracker.ignored_region(event)) {
    event.preventDefault();
  }
};
// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values
// TODO: 
var special_keys = ["Unidentified", "Dead", "Alt", "AltGraph", "CapsLock", 
    "Control", "Fn", "FnLock", "Hyper", "Meta", "NumLock", "ScrollLock", 
    "Shift", "Super", "Symbol", "SymbolLock", "Tab", "ArrowDown", 
    "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", 
    "PageUp", "Backspace", "Clear", "Copy", "CrSel", "Cut", "Delete", 
    "EraseEof", "ExSel", "Insert", "Paste", "Redo", "Undo", "Accept", 
    "Again", "Attn", "Cancel", "ContextMenu", "Escape", "Execute", "Find", 
    "Finish", "Help", "Pause", "Play", "Props", "Select", "ZoomIn", 
    "ZoomOut", "BrightnessDown", "BrightnessUp", "Eject", "LogOff", 
    "Power", "PowerOff", "PrintScreen", "Hibernate", "Standby", "WakeUp", 
    "HangulMode", "HanjaMode", "JunjaMode", "Eisu", "Hankaku", "Hiragana", 
    "HiraganaKatakana", "KanaMode", "KanjiMode", "Katakana", "Romaji", 
    "Zenkaku", "ZenkakuHanaku", "AudioVolumeDown", "AudioVolumeUp",
    "AudioVolumeMute", "VolumeUp", "VolumeDown", "VolumeMute"];
window.addEventListener('touchforcechange', function() {
  // alert('uo');
});
document.addEventListener('touchstart', eat_events, {passive: false});
document.addEventListener('mousedown', eat_events, {passive: false});
$(document).on('mousedown touchstart', function(event) {
  var now = (new Date()).getTime();
  if(event.type == 'touchstart') {
    buttonTracker.lastTouchStart = now;
    buttonTracker.lastTouchStartAny = now;
  }
  if(buttonTracker.dwell_elem && isFinite(event.clientX) && isFinite(event.clientY)) {
    console.log("linger cleared because touch event");
    buttonTracker.clear_dwell();
    event.target = document.elementFromPoint(event.clientX, event.clientY);
  }
  buttonTracker.touch_start(event);
  if(capabilities.mobile && event.type == 'touchstart' && buttonTracker.appState && buttonTracker.appState.get('speak_mode') && scanner.scanning) {
    scanner.listen_for_input();
  }
}).on('gazelinger mousemove touchmove mousedown touchstart', function(event) {
  if(capabilities.system == 'iOS' && !buttonTracker.ios_start_initialized) {
    // Safari requires a user-interaction-initiated utterance before
    // it will allow unsanctioned utterances (such as on touch timeouts,
    // scanning events, etc.)
    var u = new window.SpeechSynthesisUtterance();
    u.text = "";
    window.speechSynthesis.speak(u);
    buttonTracker.ios_start_initialized = true;
  }
  if(event.type == 'mousemove' || event.type == 'mousedown') {
    buttonTracker.mouse_used = true;
  }
  buttonTracker.touch_continue(event);
}).on('mouseup touchend touchcancel blur', function(event) {
  if(capabilities.system == 'iOS' && !buttonTracker.ios_initialized) {
    // Safari requires a user-interaction-initiated utterance before
    // it will allow unsanctioned utterances (such as on touch timeouts,
    // scanning events, etc.)
    var u = new window.SpeechSynthesisUtterance();
    u.text = " ";
    window.speechSynthesis.speak(u);
    buttonTracker.ios_initialized = true;
  }
  if(event.type == 'touchend') {
    buttonTracker.lastTouchStart = null;
  }
  buttonTracker.lastTouchRelease = (new Date()).getTime();
  if((event.type == 'mouseup' || event.type == 'touchend' || event.type == 'touchcancel') && buttonTracker.dwell_elem) {
    console.log("linger cleared because touch release event");
    buttonTracker.clear_dwell();
  }
  if(!event.fake_event) {
    buttonTracker.touch_release(event);
  }
}).on('keyup', '.button', function(event) {
  // basic keyboard navigation
  // if(buttonTracker.appState && buttonTracker.appState.get('edit_mode')) { return; }
  if(event.keyCode == 13 || event.keyCode == 32 || event.code == 'Enter' || event.code == 'Space') {
    if(event.target.tagName != 'INPUT') {
      buttonTracker.button_select(this, null, 'keyboard'); // trigger_source
    }
  }
}).on('keyup', '.integration_target', function(event) {
  // basic keyboard navigation
  if(event.keyCode == 13 || event.keyCode == 32 || event.code == 'Enter' || event.code == 'Space') {
    frame_listener.trigger_target($(event.target).closest(".integration_target")[0]);
  }
}).on('keydown', function(event) {
  // if(event.target && event.target.id == 'hidden_input') { return; }
  var select_code = buttonTracker.check('select_keycode') || -1;
  var dwell_key = buttonTracker.check('dwell_enabled') && (event.keyCode == select_code || event.code == select_code) && buttonTracker.check('dwell_selection') == 'button';
  if(event.isComposing || event.keyCode == 229 || event.key == 'Unidentified' || event.key == 'Dead') { return; }
  if(special_keys.indexOf(event.key) != -1) { return; }
  if(buttonTracker.check('keyboard_listen') && !buttonTracker.check('scanning_enabled') && !dwell_key && !modal.is_open()) {
    // add letter to the sentence box
    var key = "+" + event.key;
    var $input = $("#hidden_input");
    if($input[0] && $input[0].type == 'checkbox') {
      $input.val($input.val() + (event.key == 'Enter' ? ' ' : event.key));
    }
    else if(event.code && event.code.match(/^Audio/)) { return; }
    else if(event.key == ' ' || event.key == 'Enter' || event.key == 'Spacebar') { key = ':space'; }
    else if((event.code == 'KeyM' || event.keyCode == 77) && (event.altKey || event.ctrlKey)) {
      // Toggling modeling, so don't add to the sentence box
      return;
    }
    buttonTracker.last_key = event.key;
    if(buttonTracker.appState) {
      buttonTracker.appState.activate_button({}, {
        label: event.key,
        vocalization: key,
        prevent_return: true,
        button_id: null,
        source: 'keyboard',
        board: {id: 'external_keyboard', key: 'core/external_keyboard'},
        type: 'speak'
      });
    }
  }
}).on('keydown', function(event) {
  if(event.keyCode == 9 || event.code == 'Tab') { // tab
    $board_canvas = $("#board_canvas");
    if(!$board_canvas.data('focus_listener_set')) {
      $board_canvas.data('focus_listener_set', true);
      $board_canvas.on('focus', function(event) {
        // TODO: need a reliable way to figure out if this is getting reverse-tabbed into
        buttonTracker.focus_tab(true);
      });
    }
    if(event.target.tagName == 'CANVAS') {
      var handled = buttonTracker.move_tab(!event.shiftKey);
      if(handled) {
        event.preventDefault();
      }
    } else {
      buttonTracker.clear_tab();
    }
  } else if(event.keyCode == 13 || event.keyCode == 32 || event.code == 'Enter' || event.code == 'Space') { // return
    $("#hidden_input").val("");
    if(event.target.tagName == 'CANVAS') {
      buttonTracker.select_tab();
    }
  } else if(event.keyCode == 27 || event.code == 'Escape') { // esc
    if(modal.is_open() && modal.is_closeable()) {// && (event.target.tagName == 'INPUT' || event.target.tagName == 'BUTTON' || event.target.tagName == 'TEXTAREA' || event.target.tagName == 'A')) {
      modal.close();
    } else if(buttonTracker.check('keyboard_listen') && !modal.is_open()) {
      $("#hidden_input").val("");
      if(buttonTracker.appState) {
        buttonTracker.appState.activate_button({vocalization: ':clear'}, {
          label: 'escape',
          vocalization: ':clear',
          prevent_return: true,
          button_id: null,
          source: 'keyboard',
          board: {id: 'external_keyboard', key: 'core/external_keyboard'},
          type: 'speak'
        });
      }
    }
  } else if(event.keyCode == 8 || event.code == 'Backspace') { // backspace
    if(buttonTracker.check('keyboard_listen') && !modal.is_open()) {
      var $input = $("#hidden_input");
      if($input.val()) {
        $input.val($input.val().slice(0, -1));
      }
      if(buttonTracker.appState) {
        buttonTracker.appState.activate_button({vocalization: ':backspace'}, {
          label: 'backspace',
          vocalization: ':backspace',
          prevent_return: true,
          button_id: null,
          source: 'keyboard',
          board: {id: 'external_keyboard', key: 'core/external_keyboard'},
          type: 'speak'
        });
      }
    }
  } else if([37, 38, 39, 40].indexOf(event.keyCode) != -1 || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(event.code) != -1) {
    if(buttonTracker.gamepadupdate) {
      event.preventDefault();
    }
  } else if((event.keyCode == 77 || event.code == 'KeyM') && (event.altKey || event.ctrlKey)) {
    console.log("Keyboard shortcut for toggle modeling");
    if(buttonTracker.appState) {
      buttonTracker.appState.toggle_modeling_if_possible();
    }
    event.preventDefault();
  }
}).on('keydown', function(event) {
  if([37, 38, 39, 40].indexOf(event.keyCode) != -1 || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(event.code) != -1) {
    buttonTracker.direction_event(event);
  }
}).on('keyup', function(event) {
  if([37, 38, 39, 40].indexOf(event.keyCode) != -1 || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(event.code) != -1) {
    buttonTracker.direction_event(event);
  }
}).on('headtilt', function(event) {
  if(buttonTracker.check('dwell_type') == 'head' || buttonTracker.gamepadupdate) {
    buttonTracker.direction_event(event);
  }
}).on('keydown', function(event) {
  if(buttonTracker.check('dwell_enabled') && buttonTracker.check('select_keycode') && buttonTracker.check('dwell_selection') == 'button') {
    var select_code = buttonTracker.check('select_keycode') || -1;
    if(event.keyCode == select_code || event.code == select_code) {
      if(buttonTracker.last_dwell_linger) {
        var events = buttonTracker.last_dwell_linger.events;
        var e = events[events.length - 1];
        buttonTracker.element_release(buttonTracker.last_dwell_linger, e, 'switch'); // trigger_source
      }
    }
  }
  if($(event.target).closest(".modal-content.auto_close").length > 0) {
    modal.cancel_auto_close();
  }
  if(!buttonTracker.check('scanning_enabled')) { return; }
  if(event.target.tagName == 'INPUT' && event.target.id != 'hidden_input') { return; }
  if((event.keyCode || -1) == buttonTracker.check('select_keycode') || (event.code || -1) == buttonTracker.check('select_keycode')) { // spacebar key
    scanner.pick();
    event.preventDefault();
  } else if((event.keyCode || event.code) && buttonTracker.check('any_select') && (!modal.is_open() || modal.is_open('highlight'))) {
    scanner.pick();
    event.preventDefault();
  } else if((event.keyCode || -1) == buttonTracker.check('next_keycode') || (event.code || -1) == buttonTracker.check('next_keycode')) { // 1 key
    scanner.next();
    event.preventDefault();
  } else if((event.keyCode || -1) == buttonTracker.check('prev_keycode') || (event.code || -1) == buttonTracker.check('prev_keycode')) { // 2 key
    scanner.prev();
    event.preventDefault();
  } else if((event.keyCode || -1) == buttonTracker.check('cancel_keycode') || (event.code || -1) == buttonTracker.check('cancel_keycode')) { // esc key
    scanner.stop();
    event.preventDefault();
  }
}).on('facechange', function(event) {
  if(buttonTracker.check('dwell_enabled') && buttonTracker.check('select_expression') && buttonTracker.check('dwell_selection') == 'expression') {
    var matching_expression = event.expression && event.expression == buttonTracker.check('select_expression');
    // smiles count as smirks
    if(buttonTracker.check('select_expression') == 'smirk' && event.expresssion == 'smile') {
      matching_expression = true;
    }
    if(matching_expression) {
      if(buttonTracker.last_dwell_linger) {
        var events = buttonTracker.last_dwell_linger.events;
        var e = events[events.length - 1];
        buttonTracker.element_release(buttonTracker.last_dwell_linger, e, 'expression'); // trigger_source
      }
    }
  }
}).on('gazedwell', function(event) {
  var element_wrap = buttonTracker.find_selectable_under_event(event);
  buttonTracker.frame_event(event, 'select');
  if(element_wrap && element_wrap.button) {
    buttonTracker.button_select(element_wrap, null, 'dwell'); // trigger_source
  } else {
    $(this).trigger('click');
  }
}).on('keyup', '#button_list', function(event) {
  if(event.keyCode == 13 || event.keyCode == 32 || event.code == 'Enter' || event.code == 'Space') {
    $(this).trigger('select');
  }
}).on('drop', '.button,.board_drop', function(event) {
  event.preventDefault();
  $('.button.drop_target,.board_drop.drop_target').removeClass('drop_target');
}).on('dragstart', '.button', function(event) {
  if(buttonTracker.appState && buttonTracker.appState.get('edit_mode')) {
    event.preventDefault();
  }
}).on('dragover', '.button', function(event) {
  event.preventDefault();
  if(buttonTracker.appState && buttonTracker.appState.get('edit_mode')) {
    $(this).addClass('drop_target');
  }
}).on('dragover', '.board_drop', function(event) {
  event.preventDefault();
  $(this).addClass('drop_target');
}).on('dragleave', '.button,.board_drop', function(event) {
  event.preventDefault();
  $(this).removeClass('drop_target');
}).on('mousedown touchstart', '.select_on_click', function(event) {
  $(this).focus().select();
  event.preventDefault();
});
$(document).on('click', "a[target='_blank']", function(event) {
  if(capabilities.installed_app) {
    event.preventDefault();
    capabilities.window_open(event.target.href, '_system');
  }
});
$(window).on('blur', function(event) {
  runCancel(buttonTracker.linger_clear_later);
  runCancel(buttonTracker.linger_close_enough_later);
});

var buttonTracker = EmberObject.extend({
  _services: {
    appState: null,
    persistence: null,
    stashes: null
  },
  
  get appState() {
    return this._services.appState || (window.LingoLinq && window.LingoLinq.appState) || window.appState;
  },

  set appState(val) {
    this._services.appState = val;
  },
  
  get persistence() {
    return this._services.persistence || window.persistence || (window.LingoLinq && window.LingoLinq.persistence);
  },

  set persistence(val) {
    this._services.persistence = val;
  },

  get stashes() {
    return this._services.stashes || window.stashes || (window.LingoLinq && window.LingoLinq.stashes);
  },

  set stashes(val) {
    this._services.stashes = val;
  },

  setup: function(appState, persistence, stashes) {
    this._services.appState = appState;
    this._services.persistence = persistence;
    if (stashes) {
      this._services.stashes = stashes;
    }
    // cheap trick to get us ahead of the line in front of ember
    $("#within_ember").on('click mousedown mouseup', function(event) {
      // on iOS (probably just UIWebView) this phantom
      // click event get triggered. If you tap & release 
      // really fast then tap somewhere else, right after
      // touchstart a click gets triggered at the location
      // you hit and released before. It's terrible.
      if(buttonTracker.lastTouchStart && !event.pass_through) {
        var now = (new Date()).getTime();
        if(capabilities.mobile && now - buttonTracker.lastTouchStart < 300) {
          // console.log("ERRANT CLICK", event, now - buttonTracker.lastTouchStart);
          // event.fake_event = true;
          // event.preventDefault();
          // event.stopPropagation();
        }
      }
    });
    $("#within_ember").on('click', '.advanced_selection', function(event) {
      // we're basically replacing all click events by tracking up and down explicitly,
      // so we don't want any unintentional double-triggers
      if(event.pass_through) { return; }

      // allow dropdown menu item clicks to propagate so Ember actions run
      if($(event.target).closest('.dropdown-menu').length > 0) {
        return;
      }

      // allow dark mode toggle and theme picker to propagate so Ember actions run
      if($(event.target).closest('.ll-bento-dark-toggle, .bento-dark-toggle-wrap, .ll-bento-theme-picker, .ll-bento-theme-picker__row, .ll-bento-theme-picker__options, .ll-bento-theme-picker-wrap, .ll-bento-theme-picker-backdrop').length > 0) {
        return;
      }

      // allow landing nav links to propagate so Ember actions run
      if($(event.target).closest('.landing-nav, .landing-nav-drawer__panel, .landing-nav-hamburger').length > 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      // if no recent mouseup or touchend, then we can assume
      // this is an artificial click event, and can be accepted
      var now = (new Date()).getTime();
      if(!buttonTracker.lastTouchRelease || now - buttonTracker.lastTouchRelease > 500) {
        event.artificial = true;
        event.clientX = event.clientX || 0;
        event.clientY = event.clientY || 0;
        buttonTracker.touch_release(event);
      } else if($(event.target).closest('.dropdown').length === 0) {
        // skip the ember listeners, but pass along for bootstrap dropdowns
        $(document).trigger($.Event(event));
      }
    });
  },
  check: function(attr) {
    if(buttonTracker.appState && buttonTracker.appState.get('speak_mode')) {
      return buttonTracker[attr];
    } else {
      return null;
    }
  },
  touch_start: function(event) {
    if(!buttonTracker.appState) { return; }
    // if(capabilities.system == 'iOS' && capabilities.installed_app) { console.log("TSTART", event); }
    if(event.target && event.target.closest('#sidebar')) {
      buttonTracker.sidebarScrollStart = (document.getElementById('sidebar') || {}).scrollTop || 0;
      buttonTracker.scrollStart = event.clientY;
    }

    var $overlay = $("#overlay_container");
    // INFLECTIONS OVERLAY: Clear #overlay_container when user taps outside it.
    if($overlay.length > 0 && $(event.target).closest("#overlay_container").length == 0) {
      $overlay.remove();
    }
    if(buttonTracker.lastStartEvent && buttonTracker.lastStartEvent.type == 'touchstart' && event.type == 'mousedown' && Math.abs((buttonTracker.lastStartEvent.timeStamp || 0) - (event.timeStamp || 0)) < 300) {
      // TODO: I think this is only required as long as we use UIWekView
      // instead of WKWebView. Once we switch, if you set touches to
      // select after 100ms and you can hit blank spaces without it
      // hitting somewhere else then you should be good
      return;
    }
    buttonTracker.lastStartEvent = event;
    // advanced_selection regions should be eating all click events and
    // instead manually interpreting touch and mouse events. that way we
    // can do magical things like "click" on starting/ending point
    if($(event.target).closest('.advanced_selection').length > 0) {
      buttonTracker.triggerEvent = null;
      // doesn't need to be here, but since buttons are always using advanced_selection it's probably ok
      $(".touched").removeClass('touched');
      // this is to prevent ugly selected boxes that happen with dragging
      if(buttonTracker.appState.get('edit_mode') || buttonTracker.appState.get('speak_mode')) {
        if(!buttonTracker.ignored_region(event) && event.type == 'mousedown') {
          event.preventDefault();
        }
        // In edit mode still set initialTarget so touch_release has a fallback when selectable_wrap is null
        if(buttonTracker.appState.get('edit_mode')) {
          var button_wrap = buttonTracker.find_selectable_under_event(event);
          buttonTracker.initialTarget = button_wrap;
          buttonTracker.initialEvent = event;
          if(buttonTracker.initialTarget) {
            buttonTracker.initialTarget.timestamp = (new Date()).getTime();
            buttonTracker.initialTarget.event = event;
          }
          if(button_wrap) {
            button_wrap.addClass('touched');
          } else if(buttonTracker.appState.get('board_virtual_dom')) {
            buttonTracker.appState.get('board_virtual_dom').clear_touched();
          }
          return;
        }
      }

      buttonTracker.stop_dragging();
      // track the starting point because we may be using it as the "click"
      // location, depending on the user's settings
      var button_wrap = buttonTracker.find_selectable_under_event(event);
      buttonTracker.initialTarget = button_wrap;
      buttonTracker.initialEvent = event;
      if(buttonTracker.initialTarget) {
        buttonTracker.initialTarget.timestamp = (new Date()).getTime();
        buttonTracker.initialTarget.event = event;
      }
      // doesn't need to be here, but since buttons are always using advanced_selection it's probably ok
      if(button_wrap) {
        button_wrap.addClass('touched');
      } else {
        buttonTracker.appState.get('board_virtual_dom').clear_touched();
      }
    } else {
      buttonTracker.triggerEvent = event;
      var key = Math.random();
      buttonTracker.triggerEvent.key = key;
      // Eye gaze users can't just tap again to make stuck things
      // go away, so this is a backup patch in case things get weird
      // so that they don't lose the ability to select
      runLater(function() {
        if(buttonTracker.triggerEvent && buttonTracker.triggerEvent.key == key) {
          buttonTracker.triggerEvent = null;
        }
      }, 5000);
    }
  },
  // used for handling dragging, scanning selection
  touch_continue: function(event) {
    if (!buttonTracker.appState || buttonTracker.appState.isDestroyed || buttonTracker.appState.isDestroying) { return; }
    // if(capabilities.system == 'iOS' && capabilities.installed_app) { console.log("TCONT", event); }
    var $hover_button = $(event.target).closest('.hover_button');
    if((event.type == 'touchstart' || event.type == 'mousedown') && $hover_button.length) {
      var text_popup = $hover_button.hasClass('text_popup');
      $hover_button.remove();
      if(buttonTracker.initialEvent) {
        var button_wrap = buttonTracker.find_selectable_under_event(buttonTracker.initialEvent);
        if(buttonTracker.initialTarget && buttonTracker.initialTarget.dom != button_wrap.dom) {
          buttonTracker.initialTarget = button_wrap;
        }
      }
      if(text_popup) { 
        event.preventDefault(); 
        buttonTracker.ignoreUp = true; 
        return false; 
      }
    }
    if(buttonTracker.transitioning) {
      if(event.cancelable) { event.preventDefault(); }
      var token = Math.random();
      // Don't let it get stuck in some weird transitioning state forever
      buttonTracker.transitioning = token;
      runLater(function() {
        if(buttonTracker.transitioning == token) {
          buttonTracker.transitioning = false;
        }
      }, 2000);
      return;
    }

    // not the best approach, but I was getting tired of all the selected text blue things when
    // testing dragging so I threw this in.
    if(buttonTracker.buttonDown && buttonTracker.appState.get('edit_mode') && (buttonTracker.drag || !buttonTracker.ignored_region(event))) {
      // TODO: this lookup should be a method instead of being hard-coded, like ignored_region
      if($(event.target).closest("#sidebar,.modal").length === 0) {
        event.preventDefault();
      }
    }
    if(buttonTracker.sidebarScrollStart == null && event.target && event.target.closest && event.target.closest('#sidebar')) {
      buttonTracker.sidebarScrollStart = (document.getElementById('sidebar') || {}).scrollTop || 0;
    }
    event = buttonTracker.normalize_event(event);
    if(buttonTracker.sidebarScrollStart != null && event.type && event.type.match(/touch/)) {
      // TODO: option to disable sidebar scrolling
      buttonTracker.scrollStart = buttonTracker.scrollStart || event.clientY;
      var diff = buttonTracker.scrollStart - event.clientY;
      if(document.getElementById('sidebar')) {
        document.getElementById('sidebar').scrollTop = buttonTracker.sidebarScrollStart + diff;
      }
    }

    // We disable ignoreUp on continued movement because some of our
    // movement event triggers are touchstart and mousedown
    if(event.type == 'touchstart' || event.type == 'mousedown') {
      // don't reset it if we had a touchstart event in the
      // last 500ms and now we're getting a mousedown event
      if(event.type != 'touchstart' && buttonTracker.lastTouchStart && buttonTracker.lastTouchStart > (now - 2500)) {
      } else {
        buttonTracker.ignoreUp = false;
      }
    }
    if(event.screenX != null && event.clientX != null) {
      var priors = [window.screenInnerOffsetX, window.screenInnerOffsetY];
      window.screenInnerOffsetY = event.screenY - event.clientY;
      window.screenInnerOffsetX = event.screenX - event.clientX;
      // TODO: full-screen mode will also change this without a touch event
      if(capabilities.mobile) {
        window.screenInnerOffsetY = 0;
        window.screenInnerOffsetX = 0;
      }
      if(priors[0] != window.screenInnerOffsetX || priors[1] != window.screenInnerOffsetY) {
        var stashes = (this && this.stashes) || window.stashes;
        if (stashes && typeof stashes.persist === 'function' && !stashes.isDestroyed && !stashes.isDestroying) {
          stashes.persist('screenInnerOffsetX', window.screenInnerOffsetX);
          stashes.persist('screenInnerOffsetY', window.screenInnerOffsetY);
        }
      }
    }
    if(event.type == 'touchstart' || event.type == 'mousedown' || event.type == 'touchmove') {
      buttonTracker.buttonDown = true;
      if(buttonTracker.appState.get('sidebar_toggled')) {
        buttonTracker.buttonDown = false;
      }
    } else if(event.type == 'gazelinger' && buttonTracker.check('dwell_enabled')) {
      buttonTracker.dwell_linger(event);
    } else if(event.type == 'mousemove' && buttonTracker.check('dwell_enabled') && buttonTracker.check('dwell_type') == 'mouse_dwell') {
      buttonTracker.dwell_linger(event);
    }
    if(['gazelinger', 'mousemove', 'touchmove', 'scanover'].indexOf(event.type) != -1) {
      buttonTracker.frame_event(event, 'over');
    } else if(['mousedown', 'touchstart'].indexOf(event.type) != -1) {
      buttonTracker.frame_event(event, 'start');
    }
    if(!buttonTracker.buttonDown && !buttonTracker.appState.get('edit_mode')) {
      var button_wrap = buttonTracker.find_selectable_under_event(event);
      if(button_wrap) {
        // button_wrap.addClass('hover');
        
        // TODO: this is not terribly performant, but I guess it doesn't matter
        // since it won't trigger much on mobile
        $("#board_canvas").css('cursor', 'pointer');
        if(buttonTracker.appState.get('default_mode') && button_wrap.dom) {
          var $stash_hover = $("#stash_hover");
          if($stash_hover.data('button_id') != button_wrap.id) {
            var offset = $(button_wrap.dom).offset();
            var window_width = $(window).width();
            if(offset && offset.left) {
              $stash_hover.removeClass('on_button');
              $stash_hover.removeClass('right_side');
              $stash_hover.detach();
              if(offset.left > window_width - 165) {
                $stash_hover.css({
                  top: offset.top,
                  left: window_width - 165
                });
              } else {
                $stash_hover.css({
                  top: offset.top,
                  left: offset.left
                });
              }
              $(".board").before($stash_hover);
              runLater(function() {
                $stash_hover.addClass('on_button');
                editManager.stashed_button_id = button_wrap.id;
              });
            }
            $stash_hover.data('button_id', button_wrap.id);
          }
        }
      } else {
        if($(event.target).closest("#stash_hover").length === 0) {
          $("#stash_hover").removeClass('on_button').data('button_id', null);
        }
        buttonTracker.appState.get('board_virtual_dom').clear_hover();
        $("#board_canvas").css('cursor', '');
      }
      return;
    }

    if(buttonTracker.buttonDown && buttonTracker.check('any_select') && buttonTracker.check('scanning_enabled')) {
      var skip_screen_touch = $(event.target).closest("#identity").length > 0;
      skip_screen_touch = skip_screen_touch || (buttonTracker.check('skip_header') && $(event.target).closest('header').length > 0);
      skip_screen_touch = skip_screen_touch || (modal.is_open() && !modal.is_open('highlight'));
      if(!skip_screen_touch) {
        if(event.type != 'mousedown' && event.type != 'touchstart') {
          // ignore scanning events when checking for element release
          event.preventDefault();
          buttonTracker.ignoreUp = true;
          return false;
        }
        var override_allowed = false;
        if(event.type == 'mousedown') {
          if($(event.target).closest("#identity_button,#exit_speak_mode").length > 0) {
            override_allowed = true;
          }
        }
        if(!override_allowed) {
          // allow selection events to pass through even when scanning if on identity
          buttonTracker.ignoreUp = true;
        }
        var now = (new Date()).getTime();
        if(event.type == 'mousedown' && buttonTracker.last_scanner_select && (now - buttonTracker.last_scanner_select) < 500) {
          return false;
        } else {
          if(event.type == 'touchstart') {
            buttonTracker.last_scanner_select = now;
          }
          var width = $(window).width();
          if(event.clientX <= (width / 2)) {
            if(buttonTracker.check('left_screen_action') == 'next') {
              return scanner.next();
            } else {
              return scanner.pick();
            }
          } else {
            if(buttonTracker.check('right_screen_action') == 'next') {
              return scanner.next();
            } else {
              return scanner.pick();
            }
          }
        }
      }
    }
    if(buttonTracker.buttonDown && !$(event.target).hasClass('highlight')) {
      if($(event.target).closest('#dwell_icon,#linger').length === 0) {
        modal.close_highlight();
      }
    }
    if(buttonTracker.buttonDown && editManager.paint_mode) {
      // touch drag events don't return the right 'this'.
      var elem_wrap = buttonTracker.button_from_point(event.clientX, event.clientY);
      var elem = document.elementFromPoint(event.clientX, event.clientY);
      if(elem_wrap && $(elem).closest(".board").length > 0) {
        event.preventDefault();
        event.stopPropagation();
        elem_wrap.trigger('buttonpaint');
      }
    } else if(buttonTracker.buttonDown) {
      var elem_wrap = buttonTracker.track_drag(event);
      if(event.type == 'touchstart' || event.type == 'mousedown') {
        if(buttonTracker.appState.get('speak_mode')) {
          event.long_press_target = event.target;
          if(buttonTracker.lastPressEvent && buttonTracker.lastPressEvent.type == 'touchstart' && event.type == 'mousedown' && Math.abs((buttonTracker.lastPressEvent.timeStamp || 0) - (event.timeStamp || 0)) < 300) {
            // TODO: I think this is only required as long as we use UIWekView
            // instead of WKWebView. Once we switch, if you set touches to
            // select after 100ms and you can hit blank spaces without it
            // hitting somewhere else then you should be good
            if(!buttonTracker.ignored_region(event)) {
              buttonTracker.ignoredPressEvent = event;
              event.preventDefault();  
            }
          } else {
            buttonTracker.lastLastPressEvent = buttonTracker.lastPressEvent;
            buttonTracker.lastPressEvent = event;
            buttonTracker.longPressEvent = event;
            if(buttonTracker.check('short_press_delay')) {
              buttonTracker.short_press_delay = Math.max(buttonTracker.short_press_delay || 100, buttonTracker.short_press_delay);
            }
            // INFLECTIONS OVERLAY: Schedule long-press handler when inflections_overlay is enabled.
            // track_long_press fires after long_press_delay and calls editManager.long_press_mode.
            runLater(function() {
              if(buttonTracker.track_long_press.later) {
                runCancel(buttonTracker.track_long_press.later);
                buttonTracker.track_long_press.later = null;
              }
              if(buttonTracker.track_short_press.later) {
                runCancel(buttonTracker.track_short_press.later);
                buttonTracker.track_short_press.later = null;
              }
              var inflectionsUser = buttonTracker.appState.get('speak_mode') ? buttonTracker.appState.get('referenced_user') : buttonTracker.appState.get('currentUser');
              if(buttonTracker.check('long_press_delay') || buttonTracker.appState.get('default_mode') || (inflectionsUser && inflectionsUser.get && inflectionsUser.get('preferences.inflections_overlay'))) {
                buttonTracker.track_long_press.later = runLater(buttonTracker, buttonTracker.track_long_press, buttonTracker.long_press_delay);
              }
              if(buttonTracker.check('short_press_delay')) {
                buttonTracker.track_short_press.later = runLater(buttonTracker, buttonTracker.track_short_press, buttonTracker.short_press_delay);
              }  
            });
          }
        }
      } else {
        if(event.type == 'touchend' || event.type == 'mouseup' || !buttonTracker.longPressEvent || event.target != buttonTracker.longPressEvent.long_press_target) {
          buttonTracker.longPressEvent = null;
          buttonTracker.shortPressEvent = null;
        } else if(!buttonTracker.appState.get('currentBoardState.id') || $(event.target).closest('.board .button').length == 0) {
          buttonTracker.longPressEvent = null;
          buttonTracker.shortPressEvent = null;
        }
      }
      $('.drag_button.btn-danger').removeClass('btn-danger');
      $('.drag_button.btn-info').removeClass('btn-info');
      if(buttonTracker.drag) {
        buttonTracker.drag.hide();
        var under = document.elementFromPoint(event.clientX, event.clientY);
        buttonTracker.drag.show();
        if(under) {
          if(under.id == 'edit_stash_button') {
            $(under).addClass('btn-info');
          } else if(under.id == 'edit_clear_button') {
            $(under).addClass('btn-danger');
          }
        }
      }

      buttonTracker.multi_touch = buttonTracker.multi_touch || {total: 0, multis: 0};
      buttonTracker.multi_touch.total++;
      if(event.type != 'gazelinger' && event.total_touches && event.total_touches > 1) {
        buttonTracker.multi_touch.multis++;
      }
      if(buttonTracker.initialEvent) {
        buttonTracker.initialEvent.drag_locations = buttonTracker.initialEvent.drag_locations || [];
        buttonTracker.initialEvent.drag_locations.push([event.clientX, event.clientY]);
        if(buttonTracker.initialEvent.drag_locations.length > 30) {
          // If too many, thin them out. Note, the longer the drag
          // happens, the more lossy the data at the beginning will be
          var locations = [];
          for(var idx = 0; idx < buttonTracker.initialEvent.drag_locations.length; idx = idx + 2) {
            var a = buttonTracker.initialEvent.drag_locations[idx];
            var b = buttonTracker.initialEvent.drag_locations[idx + 1] || a;
            locations.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
          }
          buttonTracker.initialEvent.drag_locations = locations;
        }
      }

      if(!elem_wrap || !buttonTracker.appState.get('edit_mode')) {
      } else {
        // this is expensive, only do when the drop target has changed
        if(elem_wrap.dom && elem_wrap.dom != buttonTracker.drag.data('over')) {
          // clear existing placeholder if one already exists
          if(buttonTracker.drag.data('over')) {
            var $elem = $(buttonTracker.drag.data('elem'));
            var $over = $(buttonTracker.drag.data('over'));
            var $overClone = $(buttonTracker.drag.data('overClone'));
            $overClone.remove();
            $over.css('opacity', 1.0);
            // if back to original state then clear target settings
            if(elem_wrap.dom == buttonTracker.drag.data('elem')) {
              buttonTracker.drag.data('over', null);
              buttonTracker.drag.data('overClone', null);
              $elem.show();
            }
          }
          // remember which element you were last over, can skip all this if hasn't changed
          buttonTracker.drag.data('over', elem_wrap.dom);

          // $over is the current drop target, make a copy of it and put it in as a
          // placeholder where the dragged button used to live
          var $over = $(elem_wrap.dom);
          var for_folder = $over.find(".action_container.folder").length > 0;
          var $overClone = null;
          try {
            $overClone = $over.clone();
          } catch(e) { }
          if($overClone) {
            if(elem_wrap.dom == buttonTracker.drag.data('elem')) {
              $overClone.css('opacity', 0.0);
            } else {
              var opacity = for_folder ? 0.2 : 0.7;
              $overClone.css('opacity', opacity);
            }
            buttonTracker.drag.data('overClone', $overClone[0]);
            var $elem = $(buttonTracker.drag.data('elem'));
            if(!for_folder) {
              $over.css('opacity', 0.0);
            }
            $overClone.css({
              top: $elem.css('top'),
              left: $elem.css('left')
            });
            $elem.hide().after($overClone);
          }
        }
      }
      if(buttonTracker.drag) {
        buttonTracker.drag.css({position: 'absolute', left: event.pageX + buttonTracker.buttonAdjustX, top: event.pageY + buttonTracker.buttonAdjustY});
      }
    }
  },
  touch_release: function(event) {
    if(!buttonTracker.appState) { return; }
    // if(capabilities.system == 'iOS' && capabilities.installed_app) { console.log("TREL", event); }
    $(event.target).closest('.hover_button').remove();
    $("#identity_button:focus").blur();
    event = buttonTracker.normalize_event(event);
    // don't remember why this is important...
    buttonTracker.buttonDown = false;
    buttonTracker.triggerEvent = null;
    // iOS is doing a weird double-trigger on an erroneous target even
    // so I'm trying to ignore it without messing anything else up
    if(buttonTracker.lastPressEvent && buttonTracker.lastPressEvent.type == 'touchstart' && event.type == 'mouseup' && Math.abs((buttonTracker.lastPressEvent.timeStamp || 0) - (event.timeStamp || 0)) < 300 && (!buttonTracker.lastReleaseEvent || buttonTracker.lastReleaseEvent != 'touchend' || Math.abs((buttonTracker.lastReleaseEvent || 0) - (event.timeStamp || 0)) > 300)) {
      // TODO: I think this is only required as long as we use UIWekView
      // instead of WKWebView. Once we switch, if you set touches to
      // select after 100ms and you can hit blank spaces without it
      // hitting somewhere else then you should be good
      return;
    }
    // Suppress synthetic mouseup that follows touchend (prevents double vocalization on touch devices)
    if(event.type === 'mouseup' && buttonTracker.lastReleaseEvent && buttonTracker.lastReleaseEvent.type === 'touchend') {
      var elapsed = event.timeStamp - (buttonTracker.lastReleaseEvent.timeStamp || 0);
      if(elapsed >= 0 && elapsed < 800) {
        return;
      }
    }
    buttonTracker.lastReleaseEvent = event;
    if(buttonTracker.sidebarScrollStart != null) {
      var scroll_start = buttonTracker.sidebarScrollStart;
      var current_scroll = (document.getElementById('sidebar') || {}).scrollTop || 0;

      buttonTracker.sidebarScrollStart = null;
      if(Math.abs(current_scroll - scroll_start) > 10) {
        if(event.cancelable) { event.preventDefault(); }
        return;
      }
    }

    var swipe_page = false;    
    if(buttonTracker.swipe_pages) {
      if(buttonTracker.initialTarget && buttonTracker.initialTarget.dom && (buttonTracker.initialTarget.dom.id == 'clear_button' || buttonTracker.initialTarget.dom.id == 'home_button')) {
        // home/clear gestures are reserved for modeling mode
      } else {
        var cutoff = buttonTracker.activation_location == 'swipe' ? 0.5 : 0.3;
        var check_swipe = false;
        if(buttonTracker.initialEvent && event.clientX - buttonTracker.initialEvent.clientX > (window.innerWidth * cutoff)) {
          check_swipe = 'e';
        } else if(buttonTracker.initialEvent && event.clientX - buttonTracker.initialEvent.clientX < (-1 * window.innerWidth * cutoff)) {
          check_swipe = 'w';
        } else if(buttonTracker.initialEvent && event.clientY - buttonTracker.initialEvent.clientY < (-1 * window.innerHeight * cutoff)) {
          check_swipe = 'n';
        } else if(buttonTracker.initialEvent && event.clientY - buttonTracker.initialEvent.clientY > (window.innerHeight * cutoff)) {
          check_swipe = 's';
        }
        if(check_swipe) {
          var offs = 0, ons = 0;
          var last = [buttonTracker.initialEvent.clientX, buttonTracker.initialEvent.clientY];
          (buttonTracker.initialEvent.drag_locations || []).forEach(function(loc) {
            if(check_swipe == 'e') {
              if(loc[0] > last[0]) { ons++; } else { offs++; }
            } else if(check_swipe == 'w') {
              if(loc[0] < last[0]) { ons++; } else { offs++; }
            } else if(check_swipe == 'n') {
              if(loc[1] < last[1]) { ons++; } else { offs++; }
            } else if(check_swipe == 's') {
              if(loc[1] > last[1]) { ons++; } else { offs++; }
            }
            last = loc;
          });
          if(ons > 0 && ons / (ons + offs) > 0.9) {
            swipe_page = check_swipe;
          }
        }
      }
    }


    var selectable_wrap = buttonTracker.find_selectable_under_event(event);
    // if dragging a button, behavior is very different than otherwise
    if(swipe_page) {
      buttonTracker.appState.jump_to_next(swipe_page == 'e' || swipe_page == 's');

    } else if(buttonTracker.drag) {
      // hide the dragged button for a second to find what's underneath it
      buttonTracker.drag.hide();
      var under = document.elementFromPoint(event.clientX, event.clientY);
      // check to see if the button was dragged to one of the helps at the top
      if(under) {
        if(under.id == 'edit_clear_button') {
          $(buttonTracker.drag.data('elem')).trigger('clear');
        } else if(under.id == 'edit_stash_button') {
          $(buttonTracker.drag.data('elem')).trigger('stash');
        }
      }
      // remove the hover, stop hiding the original
      if(buttonTracker.drag.data('over')) {
        var $over = $(buttonTracker.drag.data('over'));
        var $overClone = $(buttonTracker.drag.data('overClone'));
        $overClone.remove();
        $over.css('opacity', 1.0);
      }
      $(buttonTracker.drag.data('elem')).css('opacity', 1.0).show();
      buttonTracker.drag.remove();
      // if it's on a different button, trigger the swap event
      var button_wrap = buttonTracker.find_button_under_event(event);
      if(button_wrap) {
        var dragId = buttonTracker.drag.attr('data-id');
        var dropId = button_wrap.id;
        button_wrap.data('drag_id', dragId);
        button_wrap.data('drop_id', dropId);
        button_wrap.trigger('rearrange');
      }
      buttonTracker.drag = null;
    } else if((selectable_wrap || buttonTracker.initialTarget) && !buttonTracker.ignored_region(event)) {
      // if it either started or ended on a selectable item then there's a
      // chance we need to trigger a 'click', so pass it along
      buttonTracker.buttonDown = true;
      buttonTracker.element_release(selectable_wrap || buttonTracker.initialTarget, event, 'click'); // trigger_source
    } else {
      var $modal = $(event.target).closest(".modal-content");
      if($modal.length > 0 && buttonTracker.appState.get('speak_mode') && event.type == 'touchend' && buttonTracker.dwell_enabled) {
        event.preventDefault();
        event.stopPropagation();
        $(event.target).trigger('click');
        if(event.target.tagName == 'INPUT' || event.target.tagName == 'SELECT') {
          runLater(function() {
            $(event.target).select().focus();
          });
        }
      }
      buttonTracker.frame_event(event, 'select');
    }
    editManager.release_stroke();
    buttonTracker.stop_dragging();
    buttonTracker.initialTarget = null;
    buttonTracker.initialEvent = null;
    buttonTracker.appState.get('board_virtual_dom').clear_touched();
    $('.touched').removeClass('touched');
  },
  element_release: function(elem_wrap, event, event_source) {
    // don't remember why this is important, but I'm pretty sure it is
    if(buttonTracker.ignored_region(event)) {
      if(editManager.finding_target()) {
        // when finding a target, ignore the release event
        buttonTracker.ignoreUp = true;
        event.preventDefault();
      } else {
        return;
      }
    }
    var modeling_sequence = false;
    if(buttonTracker.initialTarget && buttonTracker.initialTarget.dom && buttonTracker.initialTarget.dom.id == 'clear_button' && elem_wrap && elem_wrap.dom && elem_wrap.dom.id == 'home_button') {
      modeling_sequence = true;
    } else if(buttonTracker.initialTarget && buttonTracker.initialTarget.dom && buttonTracker.initialTarget.dom.id == 'home_button' && elem_wrap && elem_wrap.dom && elem_wrap.dom.id == 'clear_button') {
      modeling_sequence = true;
    }
    if(modeling_sequence) {
      buttonTracker.appState.toggle_modeling_if_possible();
      event.preventDefault();
      buttonTracker.ignoreUp = true;
      return;
    }
    if(buttonTracker.drag || !buttonTracker.buttonDown || buttonTracker.ignoreUp) {
      // when dragging or nothing selected, do nothing
      event.preventDefault();
      buttonTracker.ignoreUp = false;
    } else if(editManager.finding_target()) {
      event.preventDefault();
      // if looking for a target and one is found, hit it
      if(((elem_wrap && elem_wrap.dom && elem_wrap.dom.className) || "").match(/button/)) {
        buttonTracker.button_release(elem_wrap, event);
      }
      // TODO: clear finding_target when selecting anywhere else, leaving edit mode, etc.
    } else if(buttonTracker.ignored_region(event) || buttonTracker.ignored_region(buttonTracker.startEvent)) {
      // if it's an ignored region, do nothing
    } else if(!buttonTracker.appState.get('edit_mode')) {
      // when not editing, use user's preferred selection logic for identifying and
      // selecting a button
      event.preventDefault();
      var frame_event = event;
      var swipe_direction = null;
      var ts = (new Date()).getTime();

      if(event.type != 'gazelinger' && !event.dwell_linger) {
        // Use start, end or average pointer location for selection
        buttonTracker.activation_location = buttonTracker.activation_location || (window.user_preferences && window.user_preferences.any_user && window.user_preferences.any_user.activation_location);
        if(buttonTracker.activation_location == 'start') {
          elem_wrap = buttonTracker.initialTarget;
          frame_event = buttonTracker.initialEvent;
        } else if(buttonTracker.activation_location == 'swipe' && buttonTracker.initialTarget && buttonTracker.initialEvent) {
          swipe_direction = buttonTracker.swipe_direction(buttonTracker.initialTarget.dom, event, buttonTracker.initialEvent.drag_locations || []);
          if(swipe_direction == 'initial') {
            elem_wrap = buttonTracker.initialTarget;
            frame_event = buttonTracker.initialEvent;      
            swipe_direction = null;
          } else if(swipe_direction == 'final') {
            swipe_direction = null;
          } else if(swipe_direction) {
            console.log("SWIPE!", swipe_direction);
            elem_wrap = buttonTracker.initialTarget;
            frame_event = buttonTracker.initialEvent;
          }
        } else if(buttonTracker.activation_location == 'average') {
          // TODO: implement weighted average. Sample pointer location
          // from start to release and find the most likely target, ideally
          // taking into account distance from center of each potential target.
        } else {
          if($(event.target).closest('.advanced_selection') === 0) {
            return;
          }
        }
        // ignore presses that are too short
        if(buttonTracker.check('minimum_press') && buttonTracker.initialTarget && (ts - buttonTracker.initialTarget.timestamp) < buttonTracker.minimum_press) {
          elem_wrap = null;
        } else if(buttonTracker.clear_on_wiggle && !swipe_direction && buttonTracker.initialTarget) {
          swipe_direction = buttonTracker.swipe_direction(buttonTracker.initialTarget.dom, event, buttonTracker.initialEvent.drag_locations || []);
          if(swipe_direction != 'clear') { swipe_direction = null; }
        }
      }
      if(swipe_direction == 'clear' && buttonTracker.clear_on_wiggle) {
        event.preventDefault();
        buttonTracker.appState.controller.send('clear');
        return;
      }
      buttonTracker.frame_event(frame_event, 'select');

      buttonTracker.multi_touch = buttonTracker.multi_touch || {total: 0, multis: 0};
      buttonTracker.multi_touch.total++;
      if(event.type != 'gazelinger' && event.total_touches && event.total_touches > 1) {
        buttonTracker.multi_touch.multis++;
      }

      // logic to prevent quick double-tap, seems like this was a fix for iOS problems
      // but it may no longer be necessary
      if(elem_wrap && elem_wrap.dom && buttonTracker.lastSelect != elem_wrap.dom) {
        event.preventDefault();
        if(elem_wrap.dom.id != 'clear_button' && elem_wrap.dom.id != 'home_button') {
          buttonTracker.lastSelect = elem_wrap.dom;
          if(elem_wrap.dom.id != 'clear_button') {
            buttonTracker.clear_hits = 0;
          }
          if(elem_wrap.dom.id != 'home_button') {
            buttonTracker.home_hits = 0;
          }
          runLater(function() {
            if(buttonTracker.lastSelect == elem_wrap.dom) {
              buttonTracker.lastSelect = null;
            }
          }, 300);
        }
        var event_type = 'mouse';
        if(event.type && event.type.match(/touch/)) { event_type = 'touch'; }
        if(event.dwell_linger || (event.type && event.type.match(/gaze/))) { event_type = 'dwell'; }
        var track = buttonTracker.track_selection({
          event_type: event.type,
          selection_type: event_type,
          event: event,
          total_events: buttonTracker.multi_touch.total,
          multi_touch_events: buttonTracker.multi_touch.multis
        });

        // selection events can be prevented by a debounce setting
        if(track.proceed) {
          if(capabilities.system == 'iOS' && capabilities.installed_app && window.Hammer && window.Hammer.time) {
            // iOS's old webview struggles with touch-action so we
            // use hammer-time, but it causes problems with dropdowns.
            // This can go away when hammer-time is not necessary
            $(".dropdown-menu").each(function() {
              this.style['touch-action'] = 'auto';
            });
          }
          if(elem_wrap.dom.id == 'highlight_box') {
            var found = false;
            // special case to make sure you can always hit the identity box,
            // even if scanning
            document.elementsFromPoint(event.clientX, event.clientY).forEach(function(e) {
              if(e.id == 'identity_button') {
                modal.close(null, 'highlight');
                modal.close(null, 'highlight-secondary');
                elem_wrap = {dom: e, wait: true};
              }
            });
          }
          // different elements have different selection styles
          if(elem_wrap.dom.id == 'speak_options' && swipe_direction && buttonTracker.activation_location == 'swipe' && ['n', 's', 'e', 'w'].indexOf(swipe_direction) != -1) {
            event.preventDefault();
            if(swipe_direction == 'w') {
              // comma
              utterance.add_button({label: ",", vocalization: "+,"});
            } else if(swipe_direction == 'e' || swipe_direction == 'n') {
              // question
              buttonTracker.appState.activate_button({vocalization: '+?'}, {
                label: '?',
                vocalization: '+?',
                prevent_return: true,
                button_id: null,
                source: 'speak_menu',
                board: {id: 'speak_menu', key: 'core/speak_menu'},
                type: 'speak'
              });
            } else if(swipe_direction == 's') {
              // period
              buttonTracker.appState.activate_button({vocalization: '+.'}, {
                label: '.',
                vocalization: '+.',
                prevent_return: true,
                button_id: null,
                source: 'speak_menu',
                board: {id: 'speak_menu', key: 'core/speak_menu'},
                type: 'speak'
              });
            }

          } else if(elem_wrap.dom.id == 'backspace_button' && swipe_direction && buttonTracker.activation_location == 'swipe' && ['w'].indexOf(swipe_direction) != -1) {
            var contraction = utterance.contraction();
            if(contraction) {
              utterance.apply_contraction(contraction);
            }
          } else if(elem_wrap.dom.id == 'identity' || elem_wrap.dom.id == 'identity_button') {
            event.preventDefault();
            // click events are eaten by our listener above, unless you
            // explicitly tell it to pass them through
            var e = $.Event( "click" );
            e.clientX = event.clientX;
            e.clientY = event.clientY;
            e.pass_through = true;
      
            if(elem_wrap.wait) {
              runLater(function() {
                if($("#identity .dropdown-menu:visible").length == 0) {
                  $(elem_wrap.dom).trigger(e);
                }
              }, 500);
            }
            $(elem_wrap.dom).trigger(e);
          } else if(elem_wrap.dom.id == 'button_list') {
            event.preventDefault();
            var $elem = $(elem_wrap.dom);
            $elem.addClass('focus');
            runLater(function() {
              $elem.removeClass('focus');
            }, 500);
            $elem.trigger('select');
          } else if(elem_wrap.dom.tagName == 'A' && $(elem_wrap.dom).closest('#pin').length > 0) {
            event.preventDefault();
            $(elem_wrap.dom).trigger('select');
          } else if(elem_wrap.dom.classList.contains('speak_menu_button')) {
            var e = $.Event( 'speakmenuselect' );
            e.button_id = elem_wrap.dom.id;
            e.swipe_direction = swipe_direction;
            $(elem_wrap.dom).trigger(e);
          } else if((elem_wrap.dom.className || "").match(/button/) || elem_wrap.virtual_button) {
            event.swipe_direction = swipe_direction;
            buttonTracker.button_release(elem_wrap, event, event_source);
          } else if(elem_wrap.dom.classList.contains('integration_target')) {
            frame_listener.trigger_target(elem_wrap.dom);
          } else if(elem_wrap.dom.id == 'sidebar_tease' || elem_wrap.dom.id == 'sidebar_close') {
            var stashes = buttonTracker.stashes;
            if(stashes && stashes.get) {
              var hiddenAt = stashes.get('sidebar_hidden_at');
              if(hiddenAt && (Date.now() - hiddenAt) < 400) {
                stashes.set('sidebar_hidden_at', null);
              } else {
                stashes.persist('sidebarEnabled', !stashes.get('sidebarEnabled'));
              }
            }
            buttonTracker.ignoreUp = true;
            buttonTracker.buttonDown = false;
          } else {
            event.preventDefault();
            // click events are eaten by our listener above, unless you
            // explicitly tell it to pass them through
            var e = $.Event( "click" );
            e.clientX = event.clientX;
            e.clientY = event.clientY;
            e.pass_through = true;
            $(elem_wrap.dom).trigger(e);
          }
        }

        // clear multi-touch for modeling can ignore debounces
        if((elem_wrap.dom.id == 'clear_button') && event.type != 'gazelinger') {
          buttonTracker.clear_hits = (buttonTracker.clear_hits || 0) + 1;
          runCancel(buttonTracker.clear_hits_timeout);
          buttonTracker.clear_hits_timeout = runLater(function() {
            buttonTracker.clear_hits = 0;
          }, 1500);
          if(buttonTracker.clear_hits >= 3) {
            buttonTracker.clear_hits = 0;
            var e = $.Event('tripleclick');
            e.clientX = event.clientX;
            e.clientY = event.clientY;
            e.pass_through = true;
            $(elem_wrap.dom).trigger(e);
          }
        }
        if((elem_wrap.dom.id == 'home_button') && event.type != 'gazelinger') {
          buttonTracker.home_hits = (buttonTracker.home_hits || 0) + 1;
          runCancel(buttonTracker.home_hits_timeout);
          buttonTracker.home_hits_timeout = runLater(function() {
            buttonTracker.home_hits = 0;
          }, 1500);
          if(buttonTracker.home_hits >= 3) {
            buttonTracker.home_hits = 0;
            var e = $.Event('tripleclick');
            e.clientX = event.clientX;
            e.clientY = event.clientY;
            e.pass_through = true;
            $(elem_wrap.dom).trigger(e);
          }
        }
      }
    } else if(buttonTracker.appState.get('edit_mode') && editManager.paint_mode) {
      var isButton = (elem_wrap && elem_wrap.dom) && (
        ((elem_wrap.dom.className || "").match(/button/)) ||
        ($(elem_wrap.dom).closest('.board').length && $(elem_wrap.dom).attr('data-id'))
      );
      if(isButton) {
        event.preventDefault();
        var id = elem_wrap.id != null ? elem_wrap.id : $(elem_wrap.dom).attr('data-id');
        if(id && editManager.controller) {
          editManager.controller.send('buttonPaint', id);
        }
      }
    } else if(buttonTracker.appState.get('edit_mode') && !editManager.paint_mode) {
      var isButton = (elem_wrap && elem_wrap.dom) && (
        ((elem_wrap.dom.className || "").match(/button/)) ||
        ($(elem_wrap.dom).closest('.board').length && $(elem_wrap.dom).attr('data-id'))
      );
      if(isButton) {
        buttonTracker.button_release(elem_wrap, event);
      }
    }

    // without this, applying a button from the stash causes the selected
    // button to be put in drag mode
    buttonTracker.buttonDown = false;
    buttonTracker.multi_touch = null;
  },
  button_release: function(elem_wrap, event, source) {
    // buttons have a slightly-more advanced logic, because of all the selection
    // targets available in edit mode (image, action button, etc.) and the option
    // of applying stashed buttons/swapping buttons
    var $target = $(event.target);
    if(editManager.finding_target()) {
      buttonTracker.button_select(elem_wrap, null, source);
    } else if(!buttonTracker.appState.get('edit_mode')) {
      buttonTracker.button_select(elem_wrap, {clientX: event.clientX, clientY: event.clientY, swipe_direction: event.swipe_direction}, source);
    } else if(buttonTracker.appState.get('edit_mode') && !editManager.paint_mode) {
      event.preventDefault();
      if($target.closest('.action').length > 0) {
        elem_wrap.trigger('actionselect');
      } else if($target.closest('.symbol').length > 0) {
        elem_wrap.trigger('symbolselect');
      } else {
        buttonTracker.button_select(elem_wrap);
      }
    }
  },
  update_gamepads: function() {
    var gamepads = navigator.getGamepads ? navigator.getGamepads() : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads : []);
    buttonTracker.gamepads = {};
    for (var i = 0; i < gamepads.length; i++) {
      var gp = gamepads[i];
      if (gp) {
        buttonTracker.gamepads[gp.id] = gp;
      }
    }
  },
  swipe_direction: function(dom, event, targets) {
    var final = [event.clientX, event.clientY];
    if(!dom || (targets || []).length == 0) { return 'final'; }
    var rect;
    if(dom && typeof dom.getBoundingClientRect === 'function') {
      rect = dom.getBoundingClientRect();
    } else {
      // Virtual button: dom is button id. Get dimensions from board_virtual_dom.
      var boardDom = buttonTracker.appState && buttonTracker.appState.get('board_virtual_dom');
      var vb = boardDom && boardDom.button_from_id && boardDom.button_from_id(dom);
      if(vb && vb.width !== undefined && vb.height !== undefined) {
        rect = { width: vb.width, height: vb.height };
      } else {
        return 'final';
      }
    }
    var non_event_cutoff = 15;
    // max diff is the largest distance between the intial target and all subsequent targets
    var max_x_diff = Math.max.apply(null, targets.map(function(t) { return Math.abs(targets[0][0] - t[0]); }).concat([Math.abs(targets[0][0] - final[0])]));
    var max_y_diff = Math.max.apply(null, targets.map(function(t) { return Math.abs(targets[0][1] - t[1]); }).concat([Math.abs(targets[0][1] - final[1])]));

    if(max_x_diff < non_event_cutoff && max_y_diff < non_event_cutoff) {
      // they never strayed far from the beginning, use the starting element
      return 'initial';
    } else if(max_x_diff < Math.min(rect.width * 0.45, window.innerWidth * 0.1) && max_y_diff < Math.min(rect.height * 0.45, window.innerHeight * 0.1)) {
      // farthest distance should be at least 45% of 
      // the button size or 10% of the screen size (for big buttons)
      // TODO: angles shouldn't require as strict a threshold
      return 'final';
    } else {
      var ptr = [buttonTracker.initialEvent.clientX, buttonTracker.initialEvent.clientY];
      var segments = [], segment = {count: 0};
      var ns = null, ew = null, jitter = null;
      var new_segment = function() {
        // console.log("segment!");
        var vert = null, horiz = null;
        jitter = null;
        ns = null;
        ew = null;
        if(segment.count > 0) {
          if(segment.n && (!segment.s || segment.n > (segment.s * 10))) {
            vert = segment.n;
          } else if(segment.s && (!segment.n || segment.s > (segment.n * 10))) {
            vert = -1 * segment.s;
          }
          if(segment.e && (!segment.w || segment.e > (segment.w * 10))) {
            horiz = segment.e;
          } else if(segment.w && (!segment.e || segment.w > (segment.e * 10))) {
            horiz = -1 * segment.w;
          }
          if(vert || horiz) {
            var ratio = vert / horiz;
            if(vert && horiz && ratio > 0.8 && ratio < 1.2) {
              if(vert > 0) {
                segment.direction = 'ne';
                segment.mag = Math.pow(segment.n, 2) + Math.pow(segment.e, 2);
              } else {
                segment.direction = 'sw';
                segment.max = Math.pow(segment.s, 2) + Math.pow(segment.e, 2);
              }
            } else if(vert && horiz && ratio < -0.8 && ratio > -1.2) {
              if(vert > 0) {
                segment.direction = 'nw';
              } else {
                segment.direction = 'se';
              }
            } else if(vert && Math.abs(vert) > Math.abs(horiz || 0)) {
              segment.direction = vert > 0 ? 'n' : 's';
              segment.mag = Math.pow(segment[segment.direction], 2);
            } else if(horiz) {
              segment.direction = horiz > 0 ? 'e' : 'w';
              segment.mag = Math.pow(segment[segment.direction], 2);
            } else {
              segment.direction = '?';
              segment.mag = Math.pow(Math.max.call(null, segment.n, segment.s, segment.e, segment.w), 2);
            }
          }
        
          segments.push(segment);
        }
        var prior = segment.es && segment.es[segment.es.length - 1];
        segment = {count: 0, mag: 0, n: 0, s: 0, e: 0, w: 0, es: []};
        if(prior) {
          segment.es.push(prior);
        }
      };
      new_segment();
      for(var idx = 0; idx < targets.length; idx++) {
        segment.count++;
        var curr = targets[idx];
        if(curr[1] < ptr[1]) {
          if(ns == 's') {
            if(!jitter && segment.n == 0 && segment.s > (segment.e + segment.w) * 5) {
              jitter = 'ew';
            }
            if(jitter == 'ew') {
              new_segment();
            } else {
              jitter = 'ns';
            }
          }
          segment.n = (segment.n || 0) + ptr[1] - curr[1];
          ns = 'n';
        } else if(curr[1] > ptr[1]) {
          if(ns == 'n') {
            if(!jitter && segment.s == 0 && segment.n > (segment.e + segment.w) * 5) {
              jitter = 'ew';
            }
            if(jitter == 'ew') {
              new_segment();
            } else {
              jitter = 'ns';
            }
          }
          segment.s = (segment.s || 0) + curr[1] - ptr[1];
          ns = 's';
        }
        if(curr[0] < ptr[0]) {
          if(ew == 'e') {
            if(!jitter && segment.w == 0 && segment.e > (segment.n + segment.s) * 5) {
              jitter = 'ns';
            }
            if(jitter == 'ns') {
              new_segment();
            } else {
              jitter = 'ew';
            }
          }
          segment.w = (segment.w || 0) + ptr[0] - curr[0];
          ew = 'w';
        } else if(curr[0] > ptr[0]) {
          if(ew == 'w') {
            if(!jitter && segment.e == 0 && segment.w > (segment.n + segment.s) * 5) {
              jitter = 'ns';
            }
            if(jitter == 'ns') {
              new_segment();
            } else {
              jitter = 'ew';
            }
          }
          segment.e = (segment.e || 0) + curr[0] - ptr[0];
          ew = 'e';
        }
        segment.es.push(curr);
        ptr = curr;
      }
      new_segment();
      var directions = {n: 0, s: 0, e: 0, w: 0, nw: 0, ne: 0, sw: 0, se: 0, '?': 0};
      segments.forEach(function(segment) {
        if(segment.direction) { directions[segment.direction] = directions[segment.direction] + segment.mag; }
      });
      var max_key = null, max_total = 0;
      Object.keys(directions).forEach(function(dir) {
        if(directions[dir] >= max_total) {
          max_key = dir;
          max_total = directions[dir];
        }
      });
      var max_segment = Math.max.apply(null, segments.filter(function(s) { return s.direction == max_key; }).map(function(s) { return s.mag; }));
      var big_segments = segments.filter(function(segment) { return segment.mag > (max_segment / 25)});
      var directions = [];
      big_segments.forEach(function(segment) {
        if(!directions.length || directions[directions.length - 1] != segment.direction) {
          directions.push(segment.direction);
        }
      });
      var sorted = directions.sort().join('');
      if(directions.length == 1) {
        return directions[0]
      } else if(directions.length == 2 && (sorted == 'ew' || sorted == 'ns')) {
        return 'c';
      } else if(directions.length >= 4 && (sorted.match(/^e+w+$/) || sorted.match(/^n+s+$/) || sorted.match(/^(nw)+(se)+$/) || sorted.match(/^(ne)+(sw)+$/)) && buttonTracker.clear_on_wiggle) {
        return 'clear';
      } else {
        return 'final';
      }
    }
  },
  direction_event: function(event) {
    buttonTracker.direction_keys = buttonTracker.direction_keys || {};
    buttonTracker.gamepad_down_buttons = buttonTracker.gamepad_down_buttons || {};
    if(event.type == 'keydown' && (event.keyCode || event.code)) {
      buttonTracker.direction_keys[event.keyCode || event.code] = (new Date()).getTime();
    } else if(event.type == 'keyup' && (event.keyCode || event.code)) {
      buttonTracker.direction_keys[event.keyCode || event.code] = false;
    }
    if(event.type == 'headtilt' && (buttonTracker.check('head_tracking') || buttonTracker.gamepadupdate)) {
      buttonTracker.head_tilt = {
        up: event.vertical <= 0 ? (event.vertical * -1 / 1) : 0,
        down: event.vertical >= 0 ? (event.vertical / 1) : 0,
        left: event.horizontal <= 0 ? (event.horizontal * -1 / 1) : 0,
        right: event.horizontal >= 0 ? (event.horizontal / 1) : 0,
      };
      buttonTracker.head_tilt.uses = buttonTracker.head_tilt.uses || 0;
      // console.log("u" + buttonTracker.head_tilt.up + " d" + buttonTracker.head_tilt.down + " l" + buttonTracker.head_tilt.left + " r" + buttonTracker.head_tilt.right);
    }
    if(buttonTracker.check('dwell_type') != 'arrow_dwell' && buttonTracker.check('dwell_type') != 'head' && !buttonTracker.gamepadupdate) {
      return;
    }
    if(!buttonTracker.handle_direction) {
      // workaround for cordova plugin using older version of button api
      var pressed = function(button) {
        if(button && (typeof button['value'] !== 'undefined')) {
          return button.value == 1.0;
        } else {
          return button == 1.0;
        }
      };
      buttonTracker.handle_direction = function() {
        // up:    key 38, buttons[12], axes[1] == -1, axes[3] == -1
        // down:  key 40, buttons[13], axes[1] == 1, axes[3] == 1
        // left:  key 37, buttons[14], axes[0] == -1, axes[2] == -1
        // right: key 39, buttons[15], axes[0] == 1, axes[2] == 1
        // select: buttons[0-3] (abxy), buttons[4,6] (L), buttons[5,7] (R), buttons[9] (start), buttons[10,11] (joysticks)
        var x = buttonTracker.direction_x >= 0 ? buttonTracker.direction_x : (window.innerWidth / 2);
        var y = buttonTracker.direction_y >= 0 ? buttonTracker.direction_y : (window.innerHeight / 2);
        var update = false;
        var pad_actions = {};
        if (!('ongamepadconnected' in window)) {
          buttonTracker.update_gamepads();
        }
        var gamepads = buttonTracker.gamepads || {};
        var type = 'unknown';
        var codes = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11];
        for(var id in gamepads) {
          var pad = gamepads[id];
          if(pad.connected) {
            if(pad.axes[0] > 0.9 || pad.axes[2] > 0.9 || pressed(pad.buttons[15])) {
              pad_actions.right = 2.0;
            } else if(pad.axes[0] > 0.7 || pad.axes[2] > 0.7) {
              pad_actions.right = 1.0;
            } else if(pad.axes[0] > 0.5 || pad.axes[2] > 0.5) {
              pad_actions.right = 0.5;
            }
            if(pad.axes[0] < -0.9 || pad.axes[2] < -0.9 || pressed(pad.buttons[14])) {
              pad_actions.left = 2.0;
            } else if(pad.axes[0] < -0.7 || pad.axes[2] < -0.7) {
              pad_actions.left = 1.0;
            } else if(pad.axes[0] < -0.5 || pad.axes[2] < -0.5) {
              pad_actions.left = 0.5;
            }
            var up_axis_2 = (pad.axes.length > 4) ? 5 : 3;
            if(pad.axes[1] < -0.9 || pad.axes[up_axis_2] < -0.9 || pressed(pad.buttons[12])) {
              pad_actions.up = 2.0;
            } else if(pad.axes[1] < -0.7 || pad.axes[up_axis_2] < -0.7) {
              pad_actions.up = 1.0;
            } else if(pad.axes[1] < -0.5 || pad.axes[up_axis_2] < -0.5) {
              pad_actions.up = 0.5;
            }
            if(pad.axes[1] > 0.9 || pad.axes[up_axis_2] > 0.9 || pressed(pad.buttons[13])) {
              pad_actions.down = 2.0;
            } else if(pad.axes[1] > 0.7 || pad.axes[up_axis_2] > 0.7) {
              pad_actions.down = 1.0;
            } else if(pad.axes[1] > 0.5 || pad.axes[up_axis_2] > 0.5) {
              pad_actions.down = 0.5;
            }
            for(var idx = 0; idx < codes.length; idx++) {
              var code = codes[idx];
              var ref = pad.id.toString() + ":" + code;
              if(pressed(pad.buttons[code])) {
                if(!buttonTracker.gamepad_down_buttons[ref]) {
                  buttonTracker.gamepad_down_buttons[ref] = true;
                  pad_actions.select = true;
                }
              } else {
                buttonTracker.gamepad_down_buttons[ref] = false;
              }

            }
          }
          type = 'gamepad';  // trigger_source
        }
        if(buttonTracker.head_tilt && buttonTracker.head_tilt.uses < 10) {
          pad_actions.left = buttonTracker.head_tilt.left;
          pad_actions.right = buttonTracker.head_tilt.right;
          pad_actions.up = buttonTracker.head_tilt.up;
          pad_actions.down = buttonTracker.head_tilt.down;
          buttonTracker.head_tilt.uses++;
          type = 'headtilt';
        }
        var rate = 2.5;
        var arrow_speed = (buttonTracker.gamepadupdate || {}).speed || buttonTracker.dwell_arrow_speed;
        if(arrow_speed == 'moderate') {
          rate = 2.5;
        } else if(arrow_speed == 'quick') {
          rate = 4.0;
        } else if(arrow_speed == 'speedy') {
          rate = 6.0;
        } else if(arrow_speed == 'really_slow') {
          rate = 0.5;
        } else if(arrow_speed == 'slow') {
          rate = 1.0;
        }

        var last_left = Math.max(buttonTracker.direction_keys[37] || 0, buttonTracker.direction_keys['ArrowLeft'] || 0);
        var last_right = Math.max(buttonTracker.direction_keys[39] || 0, buttonTracker.direction_keys['ArrowRight'] || 0);
        var last_up = Math.max(buttonTracker.direction_keys[38] || 0, buttonTracker.direction_keys['ArrowUp'] || 0);
        var last_down = Math.max(buttonTracker.direction_keys[40] || 0, buttonTracker.direction_keys['ArrowDown'] || 0);
        // update the coordinates, and check if oppossing 
        // arrows are both being held down
        if(last_left || pad_actions.left) {
          if(!pad_actions.left && last_right && last_right > last_left) {
            // if right was pressed more recently than left, ignore left
          } else if(x > 0) {
            x = x - ((pad_actions.left || 2.0) * rate);
            update = true;
          }
          type = type || 'keyboard';
        }
        if(last_right || pad_actions.right) {
          if(!pad_actions.right && last_left && last_left > last_right) {
            // if left was pressed more recently than right, ignore right
          } else if(x < window.innerWidth) {
            x = x + ((pad_actions.right || 2.0) * rate);
            update = true;
          }
          type = type || 'keyboard';
        }
        if(last_up || pad_actions.up) {
          if(!pad_actions.up && last_down && last_down > last_up) {
            // if down was pressed more recently than up, ignore up
          } else if(y > 0) {
            y = y - ((pad_actions.up || 2.0) * rate);
            update = true;
          }
          type = type || 'keyboard';
        }
        if(last_down || pad_actions.down) {
          if(!pad_actions.down && last_up && last_up > last_down) {
            // if up was pressed more recently than down, ignore down
          } else if(y < window.innerHeight) {
            y = y + ((pad_actions.down || 2.0) * rate);
            update = true;
          }
          type = type || 'keyboard';
        }
        if(pad_actions.select) {
          // Only if this is a new button pressed (and one that happened after
          // a directional movement of some kind) should we count it as a selection
          if(buttonTracker.direction_x !== undefined && buttonTracker.direction_y !== undefined) {
            // trigger a select action
            if(buttonTracker.last_dwell_linger && buttonTracker.last_dwell_linger.events) {
              var events = buttonTracker.last_dwell_linger.events;
              var e = events[events.length - 1];
              buttonTracker.element_release(buttonTracker.last_dwell_linger, e, type == 'keyboard' ? 'keyboard_control' : type); // trigger_source
              if(buttonTracker.gamepadupdate) {
                buttonTracker.gamepadupdate('select', e);
              }
            }
          }
        }
        x = Math.min(Math.max(0, x), window.innerWidth);
        y = Math.min(Math.max(0, y), window.innerHeight);
        if(update) {
          buttonTracker.direction_x = x;
          buttonTracker.direction_y = y;
          var e = $.Event( 'gazelinger' );
          e.activation = type;
          e.cursor_move = true;
          e.clientX = x;
          e.clientY = y;
          $(document).trigger(e);
          if(buttonTracker.gamepadupdate) {
            buttonTracker.gamepadupdate('move', e);
          }
        }
        if(Object.keys(gamepads).length > 0 || Object.keys(buttonTracker.direction_keys).length > 0 || buttonTracker.check('head_tracking') || buttonTracker.gamepadupdate) {
          window.requestAnimationFrame(buttonTracker.handle_direction);
        } else {
          buttonTracker.handle_direction = null;
        }
      };
      window.requestAnimationFrame(buttonTracker.handle_direction);
    }
  },
  dwell_linger: function(event) {
    // debounce, waiting for clearance
    if(buttonTracker.dwell_wait) { console.log("linger waiting for dwell timeout"); return; }
    // touch events get blocked because mousemove gets triggered by 
    // finger taps and would create a dwell element directly under 
    // the finger, essentially eating all touches
    if(buttonTracker.triggerEvent && buttonTracker.triggerEvent.type == 'touchstart') { console.log("linger ignored for touch event"); return; }

    var dwell_selection = buttonTracker.dwell_selection != 'button' && buttonTracker.dwell_selection != 'expression';
    // cursor-based trackers can throw the cursor up against the edges of the screen causing
    // inaccurate lingers for the buttons along the edges
    if(event.type == 'mousemove' && (event.clientX === 0 || event.clientY === 0 || event.clientX >= (window.innerWidth - 1) || event.clientY >= (window.innerHeight - 1))) {
      console.log("linger waiting because on a screen edge", event.clientX, event.clientY);
      return;
    }
    if(buttonTracker.last_triggering_dwell_event && dwell_selection) {
      // after a selection, require a little bit of movement before recognizing input
      var last = buttonTracker.last_triggering_dwell_event;
      var needed_distance = buttonTracker.check('dwell_release_distance') || 30;
      var diffX = Math.abs(event.clientX - last.clientX);
      var diffY = Math.abs(event.clientY - last.clientY);
      if(diffX < needed_distance && diffY < needed_distance) {
        console.log("linger waiting because selected recently");
        return;
      }
    } else if(buttonTracker.debounce) {
      // ignore linger events until the debounce has passed
      if(buttonTracker.last_selection && buttonTracker.last_selection.ts) {
        var now = (new Date()).getTime();
        if(now - buttonTracker.last_selection.ts < buttonTracker.debounce) {
          console.log("linger waiting because of debounce after selection");
          return;
        }
      }
    }
    buttonTracker.last_triggering_dwell_event = null;
    // - find the nearest selectable, with some liberal tolerance
    // - if we're already lingering
    //   - if we're outside the tolerance, start a new linger
    //   - otherwise average the linger's history and decide on the best candidate
    // - persist the current linger, record the starting timestamp
    // - if we've been lingering on the element for more than the cutoff, call element_release
    var elem_wrap = buttonTracker.find_selectable_under_event(event, true, false);
    if(elem_wrap && buttonTracker.dwell_ignore == elem_wrap.dom) {
      buttonTracker.dwell_ignore = null;
      console.log("linger waiting because on an ignored elem");
      return;
    }
    var arrow_or_head_cursor = buttonTracker.check('dwell_type') == 'arrow_dwell' || buttonTracker.check('dwell_type') == 'head';
    var cursor_expected = arrow_or_head_cursor || buttonTracker.check('dwell_icon');
    $(".touched").removeClass('touched');
    if(elem_wrap) { 
      elem_wrap.addClass('touched'); 
    }
    if(!buttonTracker.dwell_elem) {
      var elem = document.createElement('div');
      elem.style.pointerEvents = 'none';
      elem.id = 'linger';
      document.body.appendChild(elem);
      var spinner = document.createElement('div');
      spinner.className = 'spinner pie';
      elem.appendChild(spinner);
      var filler = document.createElement('div');
      filler.className = 'filler pie';
      elem.appendChild(filler);
      var mask = document.createElement('div');
      mask.className = 'mask';
      elem.appendChild(mask);
      buttonTracker.dwell_elem = elem;
      if(!dwell_selection && cursor_expected) {
        // Don't show the dwell animation elem 
        // when not planning to use it
        buttonTracker.dwell_elem.classList.add('cursor');
        buttonTracker.dwell_elem.style.visibility = 'hidden';
      }
    }


    if(!buttonTracker.dwell_icon_elem) {
      var icon = document.createElement('div');
      icon.id = 'dwell_icon';
      icon.className = 'dwell_icon';
      icon.style.pointerEvents = 'none';
      if(arrow_or_head_cursor && !buttonTracker.check('dwell_icon')) {
        icon.classList.add('big');
      } else if(buttonTracker.check('dwell_icon')) {
        if(buttonTracker.check('dwell_icon') == 'arrow') {
          icon.classList.add('arrow');
        } else if(buttonTracker.check('dwell_icon') == 'circle') {
          icon.classList.add('circle');          
        } else if(buttonTracker.check('dwell_icon') == 'ball') {
          icon.classList.add('ball');          
        } else if(buttonTracker.check('dwell_icon') == 'red_circle') {
          icon.classList.add('red_circle');          
        } else if(buttonTracker.check('dwell_icon') == 'dot') {
          icon.classList.add('dot');          
        }
      }  

      document.body.appendChild(icon);
      buttonTracker.dwell_icon_elem = icon;
    }
    var source = 'cursor';
    if(event.type == 'gazelinger') {
      if(event.cursor_move) {
        source = event.activation;
      } else {
        if(event.pointer) {
          source = 'head';
        } else {
          source = 'eyegaze';
        }
      }
    }

    if(buttonTracker.dwell_icon_elem) {
      if(source == 'head' || source == 'eyegaze' || source == 'eyegaze_external') {
        buttonTracker.dwell_icon_elem.classList.add('with_transition');
      } else {
        buttonTracker.dwell_icon_elem.classList.remove('with_transition');
      }  
    }

    // TODO: consider updating these coords more often, free of the overhead
    // of all the other linger calculations (maybe in gazelinger/electron-listener.js)
    // Or, use a CSS animation to smooth them out more
    if(buttonTracker.check('dwell_cursor') || arrow_or_head_cursor || !dwell_selection) {
      buttonTracker.dwell_icon_elem.style.left = (event.clientX - 5) + "px";
      buttonTracker.dwell_icon_elem.style.top = (event.clientY - 5) + "px";
    }

    runCancel(buttonTracker.linger_clear_later);
    runCancel(buttonTracker.linger_close_enough_later);
    buttonTracker.dwell_timeout = buttonTracker.dwell_timeout || 1000;
    buttonTracker.dwell_animation = buttonTracker.dwell_animation || 'pie';
    var allowed_delay_between_events = Math.max(300, buttonTracker.dwell_timeout / 4);
    var allowed_delay_between_identical_events = 300;
    var minimum_interaction_window = 50;
    if(event.type == 'mousemove' && buttonTracker.dwell_no_cutoff) {
      allowed_delay_between_events = buttonTracker.dwell_timeout - minimum_interaction_window;
    }
    if(!buttonTracker.dwell_delay && buttonTracker.dwell_delay !== 0) {
      buttonTracker.dwell_delay = 100;
    }
    buttonTracker.linger_clear_later = runLater(function() {
      // clear the dwell icon if not dwell activity for a period of time
      if(!buttonTracker.dwell_no_cutoff && dwell_selection) {
        console.log("linger cleared because linger timed out");
        buttonTracker.clear_dwell(elem_wrap && elem_wrap.dom);  
      }
    }, allowed_delay_between_events);

    var now = (new Date()).getTime();
    var duration = event.duration || 50;

    // Current target logic:
    // If already tracking, clear the current progress if
    //   - too long in total time
    //   - too long since a valid linger event
    //   - outside the tracked element's loose bounds
    // If we're still tracking
    //   - keep tracking if still on the same element
    //   - start over on a new element if lingering over a new element and
    //     still within the original tracked element's loosed bounds, but
    //     with more dwell gravity towards the new element
    //   - start over if on a new element
    if(buttonTracker.last_dwell_linger) {
      var last_event = buttonTracker.last_dwell_linger.events[buttonTracker.last_dwell_linger.events.length - 1];
      // check if we're outside the screen bounds, or the timestamp bounds.
      // if so clear the object, also check for repeat robot events
      if(now - buttonTracker.last_dwell_linger.started > buttonTracker.dwell_timeout + 1000 - duration) {
        // if it's been too long since starting to track the dwell, start over
        console.log("linger cleared because linger took too long");
        buttonTracker.last_dwell_linger = null;
      } else if(!buttonTracker.dwell_no_cutoff && now - buttonTracker.last_dwell_linger.updated > allowed_delay_between_events - duration) {
        // if it's been too long since the last dwell event, start over
        console.log("linger cleared because too long a gap");
        buttonTracker.last_dwell_linger = null;
      } else if(!buttonTracker.dwell_no_cutoff && event.type == 'mousemove' && last_event && event.clientX == last_event.clientX && event.clientY == last_event.clientY && (now - buttonTracker.last_dwell_linger.updated) > allowed_delay_between_identical_events) {
        // if it's on the exact same location as the last mouse event
        // and it's been more than 300ms, this sounds suspiciously like
        // an artifical event, which should restart the dwell timer
        console.log("linger timer reset because exact same location");
        buttonTracker.last_dwell_linger.events = [];
        buttonTracker.last_dwell_linger.started = null;
        buttonTracker.last_dwell_linger.updated = null;
      } else {
        // if it's outside the loose bounds to the last target, start over
        var bounds = buttonTracker.last_dwell_linger.loose_bounds();
        if(event.clientX < bounds.left || event.clientX > bounds.left + bounds.width ||
              event.clientY < bounds.top || event.clientY > bounds.top + bounds.height) {
          console.log("linger cleared because out of bounds", event.clientX, event.clientY);
          buttonTracker.last_dwell_linger = null;
        }
      }
    } else if(event.type == 'mousemove' && buttonTracker.last_dwell_event && event.clientX == buttonTracker.last_dwell_event.clientX && event.clientY == buttonTracker.last_dwell_event.clientY && (now - buttonTracker.last_dwell_event.ts) > allowed_delay_between_identical_events) {
      // if the linger has timed out and the next mouse event is exactly
      // the same location as the last event, this sounds like
      // an artificial event, which should be ignored
      buttonTracker.last_dwell_linger = null;
      elem_wrap = null;
    }
    if(elem_wrap && buttonTracker.last_dwell_linger && elem_wrap.dom == buttonTracker.last_dwell_linger.dom) {
      // if still lingering on the same element, we're rockin'
      buttonTracker.buttonDown = true;
    } else if(dwell_selection && buttonTracker.dwell_gravity && elem_wrap && buttonTracker.last_dwell_linger && elem_wrap.dom != buttonTracker.last_dwell_linger.dom) {
      // if there's a valid existing linger for a different element, decide between it and the new linger
      var old_bounds = buttonTracker.last_dwell_linger.loose_bounds();
      var new_bounds = elem_wrap.loose_bounds();
      var avg_x = event.clientX * 3, avg_y = event.clientY * 3;
      var tally = 3;
      buttonTracker.last_dwell_linger.events.forEach(function(e, idx, list) {
        var weight = 1.0;
        // weight later events slightly more, otherwise it gets impossible to break out
        if(idx > (list.length / 2)) { weight = 2.0; }
        if(idx > (list.length * 2 / 3)) { weight = 3.0; }
        if(idx > (list.length * 4 / 5)) { weight = 5.0; }
        avg_x = avg_x + (e.clientX * weight);
        avg_y = avg_y + (e.clientY * weight);
        tally = tally + (1 * weight);
      });
      avg_x = avg_x / tally;
      avg_y = avg_y / tally;
      // cheap but less-accurate comparison
      var old_dist = (Math.abs(old_bounds.left + (old_bounds.width / 2) - avg_x) + Math.abs(old_bounds.top + (old_bounds.height / 2) - avg_y)) / 2;
      var new_dist = (Math.abs(new_bounds.left + (new_bounds.width / 2) - avg_x) + Math.abs(new_bounds.top + (new_bounds.height / 2) - avg_y)) / 2;
      if(new_dist < old_dist) {
        console.log("linger switched to new target", event.clientX, event.clientY, elem_wrap.dom);
        buttonTracker.last_dwell_linger = elem_wrap;
      }
    } else if(elem_wrap) {
      console.log("linger started for new target", event.clientX, event.clientY, elem_wrap.dom);
      buttonTracker.last_dwell_linger = elem_wrap;
    }

    if(buttonTracker.last_dwell_linger) {
      // place the dwell icon in the center of the current linger
      if(dwell_selection && !buttonTracker.last_dwell_linger.started) {
        // restart the excited doing-something animation
        buttonTracker.last_dwell_linger.started = now;
        var bounds = buttonTracker.last_dwell_linger.loose_bounds();
        buttonTracker.dwell_elem.style.left = (bounds.left + (bounds.width / 2) - 25) + "px";
        buttonTracker.dwell_elem.style.top = (bounds.top + (bounds.height / 2) - 25) + "px";
        // restart the animation
        var clone = buttonTracker.dwell_elem.cloneNode(true);
        clone.style.animationDuration = buttonTracker.dwell_timeout + 'ms';
        clone.style.webkitAnimationDuration = buttonTracker.dwell_timeout + 'ms';
        buttonTracker.dwell_elem.style.left = '-1000px';
        buttonTracker.dwell_elem.parentNode.replaceChild(clone, buttonTracker.dwell_elem);
        clone.classList.add('targeting');
        clone.classList.add(buttonTracker.dwell_animation);
        buttonTracker.dwell_elem = clone;
      }

      buttonTracker.last_dwell_linger.updated = now;
      buttonTracker.last_dwell_linger.events = buttonTracker.last_dwell_linger.events || [];
      buttonTracker.last_dwell_linger.events.push(event);
      buttonTracker.last_dwell_event = event;
      buttonTracker.last_dwell_event.ts = now;
      if(dwell_selection) {
        // trigger selection if dwell has been for long enough
        if(now - buttonTracker.last_dwell_linger.started > buttonTracker.dwell_timeout) {
          event.dwell_linger = true;
          buttonTracker.element_release(buttonTracker.last_dwell_linger, event, 'dwell'); // trigger_source
          buttonTracker.last_triggering_dwell_event = event;
          buttonTracker.last_dwell_linger = null;
          if(buttonTracker.dwell_delay) {
            buttonTracker.dwell_wait = true;
            runLater(function() {
              buttonTracker.dwell_wait = false;
            }, buttonTracker.dwell_delay);
          }
        } else {
          // if we're getting close to the dwell timeout, schedule a listener to trigger
          // it in case we don't get a follow-on event in time
          var will_trigger_at = buttonTracker.last_dwell_linger.started + buttonTracker.dwell_timeout;
          var ms_since_start = now - buttonTracker.last_dwell_linger.started;
          var ms_until_trigger = will_trigger_at - now;
          if((event.type == 'mousemove' && buttonTracker.dwell_no_cutoff && ms_since_start > minimum_interaction_window) || (ms_until_trigger < allowed_delay_between_events * 3 / 4)) {
            buttonTracker.linger_close_enough_later = runLater(function() {
              buttonTracker.dwell_linger(event);
            }, ms_until_trigger - 50);
          } else if(event.type == 'gazelinger' && buttonTracker.dwell_no_cutoff) {
            buttonTracker.linger_close_enough_later = runLater(function() {
              console.log("FORCE SELECT");
              buttonTracker.dwell_linger(event);
            }, ms_until_trigger - 50);
          }
        }
      } else {
        buttonTracker.dwell_elem.classList.remove('targeting');
        buttonTracker.dwell_elem.style.left = (event.clientX - 25) + "px";
        buttonTracker.dwell_elem.style.top = (event.clientY - 25) + "px";
      }
    } else {
      // stick the dwell icon wherever it goes, with a sad nothing-here styling
      buttonTracker.dwell_elem.classList.remove('targeting');
      buttonTracker.dwell_elem.style.left = (event.clientX - 25) + "px";
      buttonTracker.dwell_elem.style.top = (event.clientY - 25) + "px";
    }
  },
  find_selectable_under_event: function(event, loose, allow_dwell) {
    event = buttonTracker.normalize_event(event);
    if(event.clientX === undefined || event.clientY === undefined) { return null; }
    if(event.clientX === 0 && event.clientY === 0 && event.target && event.target.getBoundingClientRect) {
      // edge case where simulated click events don't send correct coords
      var bounds = event.target.getBoundingClientRect();
      if(bounds.x > 0 && bounds.y > 0 && bounds.height > 0 && bounds.width > 0) {
        event.clientX = bounds.x + (bounds.width / 2);
        event.clientY = bounds.y + (bounds.height / 2);
      }
    }
    var left = 0;
    var icon_left = 0;
    if(buttonTracker.dwell_elem) {
      var left = buttonTracker.dwell_elem.style.left;
      buttonTracker.dwell_elem.style.left = '-1000px';
    }
    if(buttonTracker.dwell_icon_elem) {
      var icon_left = buttonTracker.dwell_icon_elem.style.left;
      buttonTracker.dwell_icon_elem.style.left = '-1000px';
    }
    var $dropdown = $(".dropdown-backdrop")
    var $open_identity_dropdown = $("#identity .dropdown.open");
    if($dropdown.length > 0 && $open_identity_dropdown.length > 0) {
      $dropdown.hide();
    }
    var $target = $(document.elementFromPoint(event.clientX, event.clientY));
    var $target_dropdown = $target.closest('.dropdown.open');
    if($dropdown.length > 0 && $open_identity_dropdown.length > 0) {
      $dropdown.show();      
    }
    // If any dropdown is open and the user taps somewhere 
    // else on the screen, close the open dropdown
    if($target_dropdown.length == 0 && $dropdown.length > 0) {
      if($target.closest('.dropdown.open ul').length == 0 && $open_identity_dropdown.length > 0) {
        // I suppose it's possible that this tries to pass to a target 
        // that doesn't exist, so check for that
        var $new_target = $(".dropdown.open > a");
        if($new_target.length > 0) { $target = $new_target; }
      }
      // This is a shot in the dark, but something is interrupting
      // interactions and it's possible it's because it's ignoring
      // inputs because the dropdown is open. This won't close the 
      // dropdown, just get rid of the nasty overlay.
      runLater(function() {
        $dropdown.remove();
      }, 300);
    }
    if(buttonTracker.dwell_elem) {
      buttonTracker.dwell_elem.style.left = left;
    }
    if(buttonTracker.dwell_icon_elem) {
      buttonTracker.dwell_icon_elem.style.left = icon_left;
    }
    var region = $target.closest(".advanced_selection")[0];
    if(!region && loose) {
      // TODO: check the loose bounds of all the selectable elements, see if
      // you're close to anything selectable
    }
    if(region) {
      if(event.type == 'touchstart' || event.type == 'mousedown') {
        buttonTracker.shortPressEvent = event;
      }
      // buttonTracker.longPressEvent = null;
      if(allow_dwell === false && $target.closest('.undwellable').length > 0) {
        return null;
      }
      if(region.id == 'pin') {
        return buttonTracker.element_wrap($target.closest("a")[0]);
      } else if(region.id == 'word_suggestions') {
        return buttonTracker.element_wrap($target.closest("a")[0]);
      } else if(region.id == 'identity') {
        if($target.closest('a').length > 0) {
          return buttonTracker.element_wrap($target.closest('a')[0]);
        } else {
          return buttonTracker.element_wrap($(region).find(".dropdown > a"));
        }
      } else if(region.id == 'sidebar_tease') {
        return buttonTracker.element_wrap(region);
      } else if(region.id == 'sidebar') {
        return buttonTracker.element_wrap($target.closest(".btn,a")[0]);
      } else if(region.id == 'speak_menu') {
        return buttonTracker.element_wrap($target.closest("a,.speak_menu_button")[0]);
      } else if(region.tagName == 'HEADER') {
        var $elem = $target.closest(".btn:not(.pass_through),#button_list,.extra-btn")
        if($elem.hasClass('pass_to_btn_list') && allow_dwell === false) {
          $elem = $("#button_list");
        }
        return buttonTracker.element_wrap($elem[0]);
      } else if((region.className || "").match(/board/) || region.id == 'board_canvas') {
        return buttonTracker.button_from_point(event.clientX, event.clientY);
      } else if(region.classList.contains('modal_targets')) {
        return buttonTracker.element_wrap($target.closest(".btn,a").filter(":not([disabled])").filter(":not(.unselectable)")[0]);
      } else if(region.id == 'integration_overlay') {
        return buttonTracker.element_wrap($target.closest(".integration_target")[0]);
      } else if(region.id == 'highlight_box') {
        return buttonTracker.element_wrap(region);
      }
    }
    return null;
  },
  button_from_point: function(x, y) {
    // TODO: support virtual board dom
    var elem_left = null;
    var icon_left = null;
    if(buttonTracker.dwell_elem) {
      elem_left = buttonTracker.dwell_elem.style.left;
      buttonTracker.dwell_elem.style.left = '-1000px';
    }
    if(buttonTracker.dwell_icon_elem) {
      icon_left = buttonTracker.dwell_icon_elem.style.left;
      buttonTracker.dwell_icon_elem.style.left = '-1000px';
    }
    var elem = document.elementFromPoint(x, y);
    if(buttonTracker.dwell_elem) {
      buttonTracker.dwell_elem.style.left = elem_left;
    }
    if(buttonTracker.dwell_icon_elem) {
      buttonTracker.dwell_icon_elem.style.left = icon_left;
    }

    var $target = $(elem).closest('.button');
    // If the target is hidden, but the empty grid is showing (not a hint,
    // and not Show Hidden Buttons)
    if($target.hasClass('hidden_button')) {
      if($target.closest('.board.show_all_buttons').length == 0) {
        if($target.closest('.board.speak.grid_hidden_buttons').length > 0) {
          $target = $target.filter("none");
        }
      }
    }
    if($target.length > 0) {
      return buttonTracker.element_wrap($target[0]);
    } else if(buttonTracker.appState.get('speak_mode')) {
      // used for finding via the virtual dom
      var $board = $(".board");
      if($board.length === 0) { return null; }
      var offset = $board.offset() || {};
      var top = offset.top;
      if(top) {
        var button = buttonTracker.appState.get('board_virtual_dom').button_from_point(x, y - top - 3);
        return buttonTracker.element_wrap(button);
      }
    }
  },
  element_wrap: function(elem) {
    if(!elem) { return null; }
    var res = null;
    var loose_distance = 5;
    if(buttonTracker.dwell_gravity) {
      loose_distance = 50;
    }
    if(elem.button) {
      res = {
        id: elem.id,
        dom: elem.id,
        index: elem.index,
        virtual_button: true,
        addClass: function(str) {
          buttonTracker.appState.get('board_virtual_dom').add_state(str, elem.id);
        },
        trigger: function(event, source) {
          buttonTracker.appState.get('board_virtual_dom').trigger(event, elem.id);
        },
        trigger_special: function(event, args, source) {
          buttonTracker.appState.get('board_virtual_dom').trigger(event, elem.id, args);
        },
        loose_bounds: function() {
          return {
            width: elem.width + (loose_distance * 2),
            height: elem.height + (loose_distance * 2),
            top: elem.top - loose_distance,
            left: elem.left - loose_distance
          };
        },
        data: function(attr, val) {
          if(arguments.length == 2) {
            emberSet(elem, attr, val);
          } else {
            return emberGet(elem, attr);
          }
        }
      };
    } else {
      var $e = $(elem);
      res = {
        id: $e.attr('data-id'),
        dom: elem,
        addClass: function(str) {
          $e.addClass(str);
        },
        trigger: function(event, source) {
          var e = $.Event( event );
          e.trigger_source = source;
          $e.trigger(e);
        },
        trigger_special: function(event, args, source) {
          var e = $.Event( event );
          e.trigger_source = source;
          for(var idx in args) {
            e[idx] = args[idx];
          }
          $e.trigger(e);
        },
        loose_bounds: function() {
          if(res.cached_loose_bounds) { return res.cached_loose_bounds; }
          var offset = {};
          if($e.length > 0) { offset = $e.offset() || {}; }
          res.cached_loose_bounds = {
            width: $e.outerWidth() + (loose_distance * 2),
            height: $e.outerHeight() + (loose_distance * 2),
            top: offset.top - loose_distance,
            left: offset.left - loose_distance
          };
          return res.cached_loose_bounds;
        },
        data: function(attr, val) {
          return $e.data(attr, val);
        }
      };
    }
    return res;
  },
  button_select: function(elem, args, source) {
    var dom = elem.dom || elem;
    // INFLECTIONS OVERLAY: Overlay buttons have select_callback set by editManager.overlay_grid.
    if(dom && dom.classList && dom.classList.contains('overlay_button')) {
      if(dom.select_callback) {
        var event = args || {};
        event.overlay_target = dom;
        dom.select_callback(event);
      }
    } else if(elem.dom && elem.trigger) {
      var id = elem.id != null ? elem.id : (dom && $(dom).attr && $(dom).attr('data-id'));
      // In edit mode or speak mode send directly to board controller so modal/activation works (custom event may not bubble with fast_html)
      if(id && editManager.controller && typeof editManager.controller.send === 'function') {
        if(buttonTracker.appState.get('edit_mode')) {
          editManager.controller.send('buttonSelect', id, null);
          return;
        }
        if(buttonTracker.appState.get('speak_mode')) {
          editManager.controller.send('buttonSelect', id, args || null);
          return;
        }
      }
      args ? elem.trigger_special('buttonselect', args, source) : elem.trigger('buttonselect', source);
    } else {
      $(elem).trigger('buttonselect');
    }
  },
  find_button_under_event: function(event, no_side_effects) {
    if(buttonTracker.drag) {
      buttonTracker.drag.hide();
    }
    // TODO: Don't just use the pointer location, use the middle of the button...
    // right now if you grab an edge and drag it feels weird when most of your button is over a
    // different button but it's not switching because your cursor hasn't gotten there yet.
    var x = event.clientX + (this.measureAdjustX || 0);
    var y = event.clientY + (this.measureAdjustY || 0);
    var result_wrap = buttonTracker.button_from_point(x, y);
    if(buttonTracker.drag && result_wrap && result_wrap.dom == buttonTracker.drag.data('overClone')) {
      result_wrap = buttonTracker.element_wrap(buttonTracker.drag.data('elem'));
    }
    if(!no_side_effects) {
      if(buttonTracker.drag) {
        buttonTracker.drag.show();
      }
    }
    return result_wrap;
  },
  locate_button_on_board: function(id, event) {
    var x = null, y = null, travel = null;
    if(event && event.clientX !== undefined && event.clientY !== undefined) {
      x = event.clientX;
      y = event.clientY;
    } else {
      var $button = $(".button[data-id='" + id + "']");
      if($button[0]) {
        var offset = $button.offset();
        x = offset.left + ($button.outerWidth() / 2);
        y = offset.top + ($button.outerHeight() / 2);
      } else {
        var button = buttonTracker.appState.get('board_virtual_dom').button_from_id(id);
        if(button) {
          x = button.left + (button.width / 2);
          y = button.top + (button.height / 2);
        }
      }
    }

    if(x && y) {
      var $board = $(".board");
      if($board.length) {
        var left = $board.offset().left;
        var top = $board.offset().top;
        var $sidebar = $("#sidebar");
        var sidebar_width = 0;
        if($sidebar.length > 0) {
          sidebar_width = $sidebar.outerWidth() || 0;
        }
        var width = $board.width() + left + sidebar_width;
        var height = $board.height() + top;
        var pct_x = Math.round((x - left) / width * 1000) / 1000;
        var pct_y = Math.round((y - top) / height * 1000) / 1000;
        var prior = buttonTracker.hit_spots[buttonTracker.hit_spots.length - 2];
        if(prior) {
          prior.pct_x = Math.round((prior.x - left) / width * 1000) / 1000;
          prior.pct_y = Math.round((prior.y - left) / height * 1000) / 1000;
        }
        if(buttonTracker.hit_spots && buttonTracker.hit_spots.length > 0 && buttonTracker.hit_spots[buttonTracker.hit_spots.length - 1].distance != null) {
          var distance = buttonTracker.hit_spots[buttonTracker.hit_spots.length - 1].distance;
          travel = Math.round((distance.x / width) + (distance.y / height) * 1000) / 1000;
        } else if(prior) {
          // find based on the last location
          var prior = buttonTracker.hit_spots[buttonTracker.hit_spots.length - 2];
          var a = Math.abs(pct_x - ((prior.x - left) / width));
          var b = Math.abs(pct_y - ((prior.y - top) / height));
          travel = Math.round(Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2)) * 1000) / 1000;
        } else {
          // otherwise find the closest edge and use that
          travel = Math.max(0, Math.min(pct_x, pct_y, 1.0 - pct_x, 1.0 - pct_y));
        }
        prior = prior || {};

        return {percent_x: pct_x, percent_y: pct_y, prior_percent_x: prior.pct_x, prior_percent_y: prior.pct_y, percent_travel: travel};
      }
    }
    return null;
  },
  track_drag: function(event) {
    this.startEvent = this.startEvent || event;
    var diffX = event.pageX - this.startEvent.pageX;
    var diffY = event.pageY - this.startEvent.pageY;
    var elem_wrap = null;

    if(Math.abs(event.pageX - this.startEvent.pageX) < this.drag_distance && Math.abs(event.pageY - this.startEvent.pageY) < this.drag_distance) {
      return;
    } else if(this.ignored_region(this.startEvent)) {
      return;
    }
    if(!buttonTracker.drag) {
      elem_wrap = this.find_button_under_event(this.startEvent);
      if(elem_wrap && elem_wrap.dom && buttonTracker.appState.get('edit_mode')) {
        var $elem = $(elem_wrap.dom);
        this.start_dragging($elem, this.startEvent);
        $elem.css('opacity', 0.0);
      }
    } else {
      elem_wrap = this.find_button_under_event(event);
    }
    return elem_wrap;
  },
  clear_dwell: function(elem) {
    if(buttonTracker.dwell_elem) {
      if(elem) {
        buttonTracker.dwell_ignore = elem;
        runLater(function() {
          if(buttonTracker.dwell_ignore == elem) {
            buttonTracker.dwell_ignore = null;
          }
        }, 500);
      }

      buttonTracker.dwell_elem.parentNode.removeChild(buttonTracker.dwell_elem);
      buttonTracker.dwell_elem = document.getElementById('linger');
      buttonTracker.dwell_icon_elem.parentNode.removeChild(buttonTracker.dwell_icon_elem);
      buttonTracker.dwell_icon_elem = document.getElementById('dwell_icon');
      if(buttonTracker.check('dwell_selection') == 'button') {
        if(buttonTracker.last_dwell_linger && buttonTracker.last_dwell_linger.events && buttonTracker.last_dwell_linger.events.length) {
          var events = buttonTracker.last_dwell_linger.events;
          buttonTracker.last_dwell_linger.events = [events[events.length - 1]];
        }
      } else {
        buttonTracker.last_dwell_linger = null;
      }
    }
    if(buttonTracker.dwell_icon_elem) {
      buttonTracker.dwell_icon_elem.style.left = '-1000px';
    }
  },
  start_dragging: function($elem, event) {
    // create drag element
    var width = $elem.outerWidth();
    var height = $elem.height();
    buttonTracker.drag = $elem.clone().addClass('clone');
    buttonTracker.drag.css({width: width, height: height, zIndex: 2});
    // buttonTracker.drag.find('.button').css('background', '#fff');
    buttonTracker.drag.data('elem', $elem[0]);
    $('body').append(buttonTracker.drag);

    editManager.set_drag_mode(true);
    var offset = $elem.offset();
    this.initialButtonX = offset.left;
    this.initialButtonY = offset.top;
    this.buttonAdjustX = this.initialButtonX - event.pageX;
    this.buttonAdjustY = this.initialButtonY - event.pageY;
    this.measureAdjustX = (this.initialButtonX + (width / 2)) - event.pageX;
    this.measureAdjustY = (this.initialButtonY + (height / 2)) - event.pageY;
  },
  stop_dragging: function() {
    editManager.set_drag_mode(false);
    this.startEvent = null;
    this.initialButtonX = 0;
    this.initialButtonY = 0;
    this.buttonAdjustX = 0;
    this.buttonAdjustY = 0;
    this.measureAdjustX = 0;
    this.measureAdjustY = 0;
    this.set('buttons', []);
    this.longPressEvent = null;
  },
  normalize_event: function(event) {
    var ref_event = event.originalEvent || event;
    if(ref_event && ref_event.touches && ref_event.touches[0]) {
      event.pageX = ref_event.touches[0].pageX;
      event.pageY = ref_event.touches[0].pageY;
      event.clientX = ref_event.touches[0].clientX;
      event.clientY = ref_event.touches[0].clientY;
      event.total_touches = ref_event.touches.length;
    }
    if(ref_event && ref_event.changedTouches && ref_event.changedTouches[0]) {
      event.pageX = ref_event.changedTouches[0].pageX;
      event.pageY = ref_event.changedTouches[0].pageY;
      event.clientX = ref_event.changedTouches[0].clientX;
      event.clientY = ref_event.changedTouches[0].clientY;
      event.total_touches = ref_event.touches.length;
    }
    return event;
  },
  ignored_region: function(event) {
    var target = event && event.target;
    var result = !!(target && (
                      target.tagName == 'INPUT' ||
                      target.tagName == 'SELECT' ||
                      target.tagName == 'LABEL' ||
//                      target.className == 'dropdown-backdrop' ||
                      target.className == 'modal' ||
                      target.className == 'modal-dialog'
                    ));
    return result;
  },
  long_press_delay: 1500,
  /**
   * Fired after long_press_delay when user holds on a button. In Speak Mode with
   * inflections_overlay, triggers the inflection options overlay. See docs/INFLECTIONS_LONG_PRESS_OVERLAY.md.
   */
  track_long_press: function(event) {
    this.track_long_press.later = null;
    if(this.longPressEvent) {
      var button_wrap = this.find_button_under_event(this.longPressEvent);
      var $radial = $(this.longPressEvent.target).closest(".radial");
      if(button_wrap || $radial[0]) {
        var handled = editManager.long_press_mode({
          button_id: button_wrap.id,
          radial_id: $radial.attr('id'),
          radial_dom: $radial[0],
          clientX: this.longPressEvent.clientX,
          clientY: this.longPressEvent.clientY
        });
        if(handled) {
          this.ignoreUp = true;
        }
        this.longPressEvent = null;
      }
    }
  },
  track_short_press: function(event) {
    this.track_short_press.later = null;
    if(this.shortPressEvent) {
      var selectable_wrap = this.find_selectable_under_event(this.shortPressEvent, true);
      if(selectable_wrap && this.shortPressEvent) {
        var target = this.shortPressEvent.originalTarget || (this.shortPressEvent.originalEvent || this.shortPressEvent).target;
        var event = $.Event('touchend', target);
        event.target = target;
        event.clientX = (this.shortPressEvent.originalEvent || this.shortPressEvent).clientX;
        event.clientY = (this.shortPressEvent.originalEvent || this.shortPressEvent).clientY;
        buttonTracker.element_release(selectable_wrap, event, 'longpress'); // trigger_source
        this.ignoreUp = true;
      }
    }
  },
  track_selection: function(opts) {
    if(buttonTracker.last_selection && buttonTracker.last_selection.ts) {
      var now = (new Date()).getTime();
      if(buttonTracker.debounce && now - buttonTracker.last_selection.ts < buttonTracker.debounce) {
        return { proceed: false, debounced: true};
      }
    }
    var ls = {
      event_type: opts.event_type,
      selection_type: opts.selection_type,
      total_events: opts.total_events || 1,
      multi_touch_events: opts.multi_touch_events || 0,
      ts: (new Date()).getTime()
    };
    buttonTracker.hit_spots = (buttonTracker.hit_spots || []).slice(-3);
    var hit = {};
    if(opts.selection_type == 'scanner') {
      if(opts.distance) {
        hit.distance = opts.distance;
        buttonTracker.hit_spots.push({distance: opts.distance});
      }
    }
    if(opts.event) {
      hit.x = opts.event.clientX;
      hit.y = opts.event.clientY;
    } else if(opts.elem) {
      var bounds = scanner.measure(opts.elem.dom);
      hit.x = bounds.left + (bounds.width / 2);
      hit.y = bounds.top + (bounds.height / 2);
    }
    if(hit.x != null) {
      buttonTracker.hit_spots.push(hit);
    }

    if(ls.selection_type == 'touch' && ls.total_events > 0 && ls.multi_touch_events > 0 && (ls.multi_touch_events / (ls.total_events - 1)) >= 0.4) {
      ls.multi_touch = true;
    } 
    if(ls.multi_touch && buttonTracker.check('multi_touch_modeling')) {
      ls.modeling = true;
    } else if(ls.selection_type != 'dwell' && buttonTracker.check('dwell_modeling')) {
      ls.modeling = true;
    } else if((ls.selection_type == 'touch' || ls.selection_type == 'mouse') && buttonTracker.check('scan_modeling')) {
      ls.modeling = true;
    }
    if(buttonTracker.stashes) {
      buttonTracker.stashes.last_selection = ls;
    }
    buttonTracker.last_selection = ls;
    return { proceed: true };
  },
  frame_event: function(event, event_type) {
    if(!event || event.triggered_for == event_type) {
      return;
    }
    var raw_event_type = event.type;
    // TODO: once aac_shim is updated, this manual change should be unnecessary
    if(event_type == 'select' && (event.type == 'mouseup' || event.type == 'mousedown' || event.type == 'touchstart' || event.type == 'touchend')) {
      raw_event_type = 'click';
    }
    event.triggered_for = event_type;
    if($(event.target).closest("#integration_overlay").length > 0) {
      event.preventDefault();
      frame_listener.raw_event({
        type: raw_event_type,
        aac_type: event_type,
        clientX: event.clientX,
        clientY: event.clientY
      });
    }
  },
  focus_tab: function(from_start) {
    if(!buttonTracker.focus_wrap) {
      var b = buttonTracker.appState.get('board_virtual_dom').button_from_index(from_start ? 0 : -2);
      buttonTracker.focus_wrap = buttonTracker.element_wrap(b);
    }
    buttonTracker.focus_wrap.addClass('touched');
    // set focus for the current button, set current button to zero if none set
    // if shift_key is held down then we're coming in backwards, which is important to know
  },
  select_tab: function() {
    // trigger buttonselect for the current button
    buttonTracker.button_select(buttonTracker.focus_wrap);
  },
  move_tab: function(forward) {
    // progress forward or backward to the adjacent button
    // return true if there is an adjacent button, if not then
    // clear the tab and return false
    if(buttonTracker.focus_wrap) {
      var b = buttonTracker.appState.get('board_virtual_dom').button_from_index(buttonTracker.focus_wrap.index + (forward ? 1 : -1));
      buttonTracker.focus_wrap = buttonTracker.element_wrap(b);
    }
    if(buttonTracker.focus_wrap) {
      buttonTracker.focus_wrap.addClass('touched');
    } else {
      buttonTracker.clear_tab();
    }
    return !!buttonTracker.focus_wrap;
  },
  clear_tab: function() {
    buttonTracker.appState.get('board_virtual_dom').clear_touched();
    buttonTracker.focus_wrap = null;
    // remove the current button state
  },
  drag_distance: 20,
  buttons: []
}).create();

window.addEventListener('gamepadconnected', function(e) {
  buttonTracker.gamepads = buttonTracker.gamepads || {};
  var pad = e.gamepad;
  var buttons = [];
  if(pad.buttons) {
    for(var idx = 0; idx < pad.buttons.length; idx++) {
      if(pad.buttons[idx].value !== undefined) {
        buttons.push(pad.buttons[idx].value);
      } else {
        buttons.push(pad.buttons[idx].pressed ? 1.0 : 0.0);
      }
      buttons.push(pad.buttons[idx]);
    }
  }
  var axes = [];
  if(pad.axes) {
    for(var idx = 0; idx < pad.axes.length; idx++) {
      axes.push(pad.axes[idx]);
    }
  }
  buttonTracker.gamepads[e.gamepad.id] = pad;
  buttonTracker.direction_event('gamepads');
});
window.addEventListener('gamepaddisconnected', function(e) {
  buttonTracker.gamepads = buttonTracker.gamepads || {};
  delete buttonTracker.gamepads[e.gamepad.id];
});
if (!('ongamepadconnected' in window)) {
  // No gamepad events available, poll instead.
  buttonTracker.gamepad_check_interval = setInterval(function() {
    if(buttonTracker.appState.get('speak_mode') && buttonTracker.check('dwell_type')) {
      buttonTracker.update_gamepads();
      if(Object.keys(buttonTracker.gamepads).length > 0) {
        buttonTracker.direction_event('gamepads');
      }
    }
  }, 10000);
}

document.addEventListener('selectionchange', function(event) {
  // clear errant selections when they happen while in speak mode
  if(buttonTracker.appState && buttonTracker.appState.get('speak_mode')) {
    var sel = window.getSelection();
    if(sel && sel.type == 'Range' && sel.empty) {
      if(sel.anchorNode && sel.anchorNode.tagName == 'INPUT') {
      } else if(sel.anchorNode && sel.anchorNode.tagName == 'TEXTAREA') {
      } else if(sel.anchorNode && sel.anchorNode.childNodes && sel.anchorNode.childNodes[sel.anchorOffset] && sel.anchorNode.childNodes[sel.anchorOffset].tagName == 'INPUT') {
      } else if(sel.anchorNode && sel.anchorNode.childNodes && sel.anchorNode.childNodes[sel.anchorOffset] && sel.anchorNode.childNodes[sel.anchorOffset].tagName == 'TEXTAREA') {
        if(sel.empty) {
          sel.empty();
        }
        if(sel.removeAllRanges) {
          sel.removeAllRanges();
        }
      }
    }
  }
});

window.buttons = buttonTracker;

export default buttonTracker;

/* Swipe targets
    backspace: 
      w - apply contraction
    speak menu: 
      w - comma
      e - question mark
      s - period
    keyboard button: 
      w - comma
      nw - exclamation
      n - question mark
      e - period
      s - period
    speak menu period: 
      w - comma
      n - question mark
      e - exclamation
      s - period
    repairs menu button: 
      w - quieter
      e - louder
      n - flip text
      s - share big button
*/
