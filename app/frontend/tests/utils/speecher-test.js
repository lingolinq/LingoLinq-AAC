import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { fakeAudio } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import stashes from '../../utils/_stashes';
import capabilities from '../../utils/capabilities';
import speecher from '../../utils/speecher';
import app_state from '../../utils/app_state';
import persistence from '../../utils/persistence';
import { run as emberRun } from '@ember/runloop';

describe('speecher', function() {
  beforeEach(function() {
    speecher.audio = {};
    speecher.scope = window;
  });

  afterEach(function() {
    speecher.scope = window;
  });

  describe("speak_text", function() {
    it("should not error unexpectedly on bad input", function() {
      var spoken = false;
      stub(window.speechSynthesis, 'speak', function() { spoken = true; });
      window.speechSynthesis.bacon = 'asdf';
      expect(function() { speecher.speak_text(null); }).not.toThrow();
      expect(spoken).toEqual(false);
      expect(function() { speecher.speak_text(1234); }).not.toThrow();
      waitsFor(function() { return spoken; });
      runs();
    });

    it("should trigger speech synthesis", function() {
      var spoken = null;
      stub(window.speechSynthesis, 'speak', function(u) { spoken = u.text; });
      expect(function() { speecher.speak_text("hippo"); }).not.toThrow();
      waitsFor(function() { return spoken; });
      runs(function() {
        expect(spoken).toEqual("hippo");
      });
    });

    it("should cancel any existing text utterances", function() {
      var utterance = null;
      var cancelled = false;
      stub(window.speechSynthesis, 'speak', function(u) { utterance = u; });
      stub(window.speechSynthesis, 'cancel', function() { cancelled = true; });
      stub(speecher.scope, 'SpeechSynthesisUtterance', function() { });

      speecher.set('voices', [{'default': true, lang: 'asdf'}]);
      speecher.speak_text("hippo");
      waitsFor(function() { return cancelled && utterance; });
      runs(function() {
        expect(cancelled).toEqual(true);
        expect(utterance.text).toEqual("hippo");
        expect(utterance.voice).toNotEqual(null);
        expect(utterance.lang).toEqual('asdf');
      });
    });
    it("should not set a voiceURI or voice or lang for force_default voice", function() {
      var cancelled = false;
      var utterance = null;
      stub(window.speechSynthesis, 'speak', function(u) { utterance = u; });
      stub(window.speechSynthesis, 'cancel', function() { cancelled = true; });
      speecher.speak_text("hippo", 'asdf', {voiceURI: 'force_default'});
      waitsFor(function() { return cancelled && utterance; });
      runs(function() {
        expect(cancelled).toEqual(true);
        expect(utterance.voice).toEqual(null);
        expect(utterance.lang).toEqual('');
        expect(utterance.text).toEqual("hippo");
      });
    });

    it("should speak using alternate voice settings if specified", function() {
      var cancelled = false;
      var utterance = null;
      speecher.alternate_volume = 0.5;
      speecher.alternate_pitch = 2.0;
      speecher.alternate_voiceURI = 'bacon';

      stub(window.speechSynthesis, 'speak', function(u) { utterance = u; });
      stub(window.speechSynthesis, 'cancel', function() { cancelled = true; });
      speecher.speak_text("hippo", 'asdf', {alternate_voice: true});
      waitsFor(function() { return cancelled && utterance; });
      runs(function() {
        expect(cancelled).toEqual(true);
        expect(utterance.voiceURI).toEqual('bacon');
        expect(utterance.volume).toEqual(0.5);
        expect(utterance.pitch).toEqual(2.0);
        expect(utterance.text).toEqual("hippo");
      });
    });
    it('should switch to a locale-appropriate voice if default state has been overridden', function() {
      var cancelled = false;
      var utterance = null;
      app_state.set('vocalization_locale', 'fr');
      speecher.set('voices', [
        {lang: 'fr', voiceURI: 'french1'},
        {lang: 'en', voiceURI: 'english1'},
        {lang: 'fr-US', vouceURI: 'french2'},
        {land: 'en-US', voiceURI: 'english2'}
      ]);
      speecher.volume = 0.5;
      speecher.pitch = 2.0;
      speecher.alternate_voiceURI = 'bacon';

      stub(window.speecher.scope, 'SpeechSynthesisUtterance', Object);
      stub(window.speechSynthesis, 'speak', function(u) { utterance = u; });
      stub(window.speechSynthesis, 'cancel', function() { cancelled = true; });
      speecher.speak_text("hippo", 'asdf');
      waitsFor(function() { return cancelled && utterance; });
      runs(function() {
        expect(cancelled).toEqual(true);
        expect(utterance.voiceURI).toEqual('french1');
        expect(utterance.volume).toEqual(0.5);
        expect(utterance.pitch).toEqual(2.0);
        expect(utterance.text).toEqual("hippo");
      });
    });

    it('should switch to a locale-appropriate alternate voice if default state has been overridden', function() {
      var cancelled = false;
      var utterance = null;
      app_state.set('vocalization_locale', 'fr');
      speecher.set('voices', [
        {lang: 'fr', voiceURI: 'french1'},
        {lang: 'en', voiceURI: 'english1'},
        {lang: 'fr-US', vouceURI: 'french2'},
        {land: 'en-US', voiceURI: 'english2'}
      ]);
      speecher.alternate_volume = 0.5;
      speecher.alternate_pitch = 2.0;
      speecher.alternate_voiceURI = 'bacon';

      stub(window.speechSynthesis, 'speak', function(u) { utterance = u; });
      stub(window.speechSynthesis, 'cancel', function() { cancelled = true; });
      speecher.speak_text("hippo", 'asdf', {alternate_voice: true});
      waitsFor(function() { return cancelled && utterance; });
      runs(function() {
        expect(cancelled).toEqual(true);
        expect(utterance.voiceURI).toEqual('french1');
        expect(utterance.volume).toEqual(0.5);
        expect(utterance.pitch).toEqual(2.0);
        expect(utterance.text).toEqual("hippo");
      });
    });
  });

  describe("adjusted_rate", function() {
    it("should have reasonable default rates based on device", function() {
      var orig_s = capabilities.system;
      var orig_b = capabilities.browser;
      var orig_v = capabilities.system_version;

      capabilities.system = 'Android';
      expect(speecher.adjusted_rate()).toEqual(1.0);
      capabilities.browser = 'Safari';
      expect(speecher.adjusted_rate()).toEqual(1.0);
      capabilities.system_version = 6;
      expect(speecher.adjusted_rate()).toEqual(1.0);
      capabilities.system = 'iOS';
      expect(speecher.adjusted_rate()).toEqual(0.2);
      capabilities.system_version = 9.1;
      expect(speecher.adjusted_rate()).toEqual(1.0);
      capabilities.system_version = 8.0;
      expect(speecher.adjusted_rate()).toEqual(0.2);
      capabilities.browser = 'Web Browser';
      expect(speecher.adjusted_rate()).toEqual(1.0);
      capabilities.system = 'iOS';
      expect(speecher.adjusted_rate('tts:bacon')).toEqual(1.0);

      capabilities.system = orig_s;
      capabilities.browser = orig_b;
      capabilities.system_version = orig_v;
    });
  });

  describe("set_voice", function() {
    it("should not error if set_voice has not been called", function() {
      stub(window.speechSynthesis, 'speak', function() { });
      expect(function() { speecher.speak_text("hippo"); }).not.toThrow();
    });
    it("should set pitch and volume based on settings", function() {
      speecher.set_voice({volume: 0.5, pitch: 2.0});
      expect(speecher.volume).toEqual(0.5);
      expect(speecher.pitch).toEqual(2.0);
    });
    it("should set alternate pitch and volume based on settings", function() {
      speecher.set_voice({volume: 0.5, pitch: 2.0}, {volume: 0.2, pitch: 1.0});
      expect(speecher.volume).toEqual(0.5);
      expect(speecher.pitch).toEqual(2.0);
      expect(speecher.alternate_volume).toEqual(0.5);
      expect(speecher.alternate_pitch).toEqual(2.0);
    });
  });

  describe("speak_audio", function() {
    var audio = null;
    beforeEach(function() {
      audio = fakeAudio();
      speecher.speaking_from_collection = null;
      stub(speecher, 'find_or_create_element', function() {
        return [audio];
      });
    });
    it("should not error unexpectedly on bad input", function() {
      speecher.speak_audio(null);
      expect(speecher.audio.text).toEqual(audio);
      expect(audio.listenersAdded).toEqual(true);
      expect(audio.listenersRemoved).not.toEqual(true);
    });
    it("should trigger audio", function() {
      speecher.speak_audio("http://sound.com/boom.mp3");
      waitsFor(function() { return audio.playCalled; });
      runs(function() {
        expect(speecher.audio.text).toEqual(audio);
        expect(audio.pauseCalled).toEqual(true);
        expect(audio.playCalled).toEqual(true);
        expect(audio.listenersAdded).toEqual(true);
        expect(audio.listenersRemoved).not.toEqual(true);
      });
    });
    it("should not error unexpectedly when it can't find the sound element on the page", function() {
      stub(speecher, 'find_or_create_element', function() {
        return [];
      });
      expect(function() { speecher.speak_audio("http://sound.com/thank_you.mp3"); }).not.toThrow();
      expect(speecher.audio.text).toEqual(undefined);
    });
    it("should rewind sound in case re-playing the same sound again", function() {
      expect(audio.currentTime).not.toEqual(0);
      speecher.speak_audio("http://sound.com/boom.mp3");
      waitsFor(function() { return audio.playCalled; });
      runs(function() {
        expect(speecher.audio.text).toEqual(audio);
        expect(audio.pauseCalled).toEqual(true);
        expect(audio.playCalled).toEqual(true);
        expect(audio.currentTime).toEqual(0);
        expect(audio.listenersAdded).toEqual(true);
        expect(audio.listenersRemoved).not.toEqual(true);
      });
    });
    it("should cancel any existing text or foreground audio", function() {
      var audio2 = fakeAudio();
      var audio3 = fakeAudio();
      var cancelled = false;
      speecher.audio.text = audio2;
      speecher.audio.background = audio3;
      stub(window.speechSynthesis, 'cancel', function() { cancelled = true; });
      speecher.speak_audio("http://sound.com/laugh.mp3");
      expect(audio.listenersAdded).toEqual(true);
      expect(audio.listenersRemoved).not.toEqual(true);
      expect(audio2.pauseCalled).toEqual(true);
      expect(audio2.listenersRemoved).toEqual(true);
      expect(cancelled).toEqual(true);
      expect(audio3.pauseCalled).not.toEqual(true);
      expect(audio3.listenersRemoved).not.toEqual(true);
    });
  });

  describe("speak_background_audio", function() {
    var audio = null;
    beforeEach(function() {
      audio = fakeAudio();
      stub(speecher, 'find_or_create_element', function() {
        return [audio];
      });
    });
    it("should not error unexpectedly on bad input", function() {
      speecher.speak_background_audio(null);
      expect(speecher.audio.background).toEqual(audio);
      expect(audio.listenersAdded).toEqual(true);
      expect(audio.listenersRemoved).not.toEqual(true);
    });
    it("should trigger audio", function() {
      speecher.speak_background_audio("http://sound.com/boom.mp3");
      waitsFor(function() { return audio.playCalled; });
      runs(function() {
        expect(speecher.audio.background).toEqual(audio);
        expect(audio.pauseCalled).toEqual(true);
        expect(audio.playCalled).toEqual(true);
        expect(audio.listenersAdded).toEqual(true);
        expect(audio.listenersRemoved).not.toEqual(true);
      });
    });
    it("should cancel any existing background audio", function() {
      var audio2 = fakeAudio();
      speecher.audio.background = audio2;
      speecher.speak_background_audio("http://sound.com/laugh.mp3");
      expect(audio.listenersAdded).toEqual(true);
      expect(audio.listenersRemoved).not.toEqual(true);
      expect(audio2.pauseCalled).toEqual(true);
      expect(audio2.listenersRemoved).toEqual(true);
    });

    it("should not cancel text or foreground audio", function() {
      var audio2 = fakeAudio();
      var audio3 = fakeAudio();
      var cancelled = false;
      speecher.audio.text = audio2;
      speecher.audio.background = audio3;
      stub(window.speechSynthesis, 'cancel', function() { cancelled = true; });
      speecher.speak_background_audio("http://sound.com/laugh.mp3");
      expect(audio.listenersAdded).toEqual(true);
      expect(audio.listenersRemoved).not.toEqual(true);
      expect(audio2.pauseCalled).not.toEqual(true);
      expect(audio2.listenersRemoved).not.toEqual(true);
      expect(cancelled).toEqual(false);
      expect(audio3.pauseCalled).toEqual(true);
      expect(audio3.listenersRemoved).toEqual(true);
    });
  });

  describe("speak_collection", function() {
    it("should queue list of foreground audio or text events", function() {
      var called = false;
      stub(speecher, 'next_speak', function() { called = true; });
      speecher.speak_collection([{}, {}]);
      expect(speecher.speaks).not.toEqual(null);
      expect(speecher.speaks.length).toEqual(2);
      expect(called).toEqual(true);
    });
    it("should cancel any foreground audio or text, but not background", function() {
      var fg = fakeAudio();
      var bg = fakeAudio();
      speecher.audio.text = fg;
      speecher.audio.background = bg;
      var called = false;
      stub(speecher, 'next_speak', function() { called = true; });
      speecher.speak_collection([]);
      expect(speecher.audio.text).toEqual(null);
      expect(speecher.audio.background).not.toEqual(null);
      expect(fg.listenersRemoved).toEqual(true);
      expect(bg.listenersRemoved).not.toEqual(true);
    });

    it("should run through the full list of speaks", function() {
      var audio = fakeAudio();
      stub(speecher, 'find_or_create_element', function() {
        return [audio];
      });

      var words = [];
      var scope = {};
      window.polyfillSpeechSynthesis(scope);
      speecher.scope = scope;
      stub(scope.speechSynthesis, 'speak', function(u) {
        words.push(u.text);
        u.trigger('end');
      });
      speecher.speak_collection([{text: "halo"}, {sound: "http://sounds.com/cookie.mp3"}, {text: "snow"}]);
      waitsFor(function() { return audio.playCalled; });
      runs(function() {
        expect(words[0]).toEqual('halo');
        expect(speecher.audio.text).toEqual(audio);
        expect(audio.playCalled).toEqual(true);
      });
      waitsFor(function() { return words.length == 2; });
      runs(function() {
        expect(words).toEqual(['halo', 'snow']);
        expect(speecher.speaks.length).toEqual(0);
      });
    });
  });
  describe("load_beep", function() {
    it("should reject if no beep found", function() {
      var failed = false;
      stub(speecher, 'beep_url', null);
      speecher.load_beep().then(function() { }, function() {
        failed = true;
      });
      waitsFor(function() { return failed; });
      runs();
    });

    it("should perform a lookup if the beep element is found", function() {
      stub(speecher, 'beep_url', 'http://www.pic.com/pic.png');
      stub(persistence, 'find_url', function(url) {
        if(url === 'http://www.pic.com/pic.png') {
          return RSVP.resolve("abc");
        } else {
          return RSVP.reject();
        }
      });
      var resolved = false;
      speecher.load_beep().then(function() {
        resolved = true;
      });
      waitsFor(function() { return resolved; });
      runs(function() {
        expect(speecher.beep_url).toEqual('abc');
      });
    });

  });

  describe('text_direction', function() {
    it('should return the correct value', function() {
      speecher.voiceURI = null;
      speecher.set('voices', [{voiceURI: 'saar', lang: 'ar-SA'}, {voiceURI: 'enus', lang:'en-US'}]);
      expect(speecher.text_direction()).toEqual('ltr');
      speecher.voiceURI = 'saar';
      expect(speecher.text_direction()).toEqual('rtl');
      speecher.voiceURI = 'enus';
      expect(speecher.text_direction()).toEqual('ltr');
    });
  });

  describe("voiceList", function() {
    it('should update based on the list of voices', function() {
      speecher.set('voices', []);
      expect(speecher.get('voiceList')).toEqual([]);
      speecher.set('voices', [
        {lang: 'en_US', voiceURI: 'asdf', name: 'A'},
        {lang: 'en-US', voiceURI: 'qwer', name: 'B'}
      ]);
      expect(speecher.get('voiceList')).toEqual([
        {id: 'asdf', name: 'A (en_US)', locale: 'en_us', lang: 'en', index: 0},
        {id: 'qwer', name: 'B (en-US)', locale: 'en_us', lang: 'en', index: 1}
      ]);
    });

    it('should sort results by matching locale, then lange', function() {
      speecher.set('voices', []);
      expect(speecher.get('voiceList')).toEqual([]);
      stub(window.navigator, 'language', 'en-US');
      speecher.set('voices', [
        {lang: 'en_UK', voiceURI: 'asdf', name: 'A'},
        {lang: 'en-US', voiceURI: 'qwer', name: 'B'},
        {lang: 'es-US', voiceURI: 'zxcv', name: 'C'},
        {lang: 'en-AU', voiceURI: 'sdfg', name: 'D'}
      ]);
      expect(speecher.get('voiceList')).toEqual([
        {id: 'qwer', name: 'B (en-US)', locale: 'en_us', lang: 'en', index: 1},
        {id: 'asdf', name: 'A (en_UK)', locale: 'en_uk', lang: 'en', index: 0},
        {id: 'sdfg', name: 'D (en-AU)', locale: 'en_au', lang: 'en', index: 3},
        {id: 'zxcv', name: 'C (es-US)', locale: 'es_us', lang: 'es', index: 2},
      ]);
    });
  });

  describe("play_audio", function() {
    var audio_elem = null;
    var make_elem = function() {
      var res = document.createElement('div');
      res.src = 'http://www.example.com/sound.mp3';
      res.cloneNode = function() {
        res.cloned = true;
        return make_elem();
      };
      res.pause = function() {
        res.paused = true;
      };
      res.play = function() {
        res.played = true;
      };
      res.duration = 10;
      res.currentTime = 0;
      return res;
    };
    beforeEach(function() {
      audio_elem = make_elem();
    });
    it('should clone the element if currently playing', function() {
      audio_elem.lastListener = true;
      speecher.play_audio(audio_elem);
      expect(audio_elem.cloned).toEqual(true);
    });

    it('should progress on end event', function() {
      speecher.play_audio(audio_elem);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        ended = true;
      });
      waitsFor(function() { return audio_elem.played; });
      runs(function() {
        audio_elem.dispatchEvent(new window.Event('ended'));
      });
      waitsFor(function() { return ended; });
      runs();
    });

    it('should progress on pause event', function() {
      speecher.play_audio(audio_elem);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        ended = true;
      });
      waitsFor(function() { return audio_elem.played; });
      runs(function() {
        audio_elem.dispatchEvent(new window.Event('pause'));
      });
      waitsFor(function() { return ended; });
      runs();
    });

    it('should progress on abort event', function() {
      speecher.play_audio(audio_elem);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        ended = true;
      });
      waitsFor(function() { return audio_elem.played; });
      runs(function() {
        audio_elem.dispatchEvent(new window.Event('abort'));
      });
      waitsFor(function() { return ended; });
      runs();
    });

    it('should progress on error event', function() {
      speecher.play_audio(audio_elem);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        ended = true;
      });
      waitsFor(function() { return audio_elem.played; });
      runs(function() {
        audio_elem.dispatchEvent(new window.Event('error'));
      });
      waitsFor(function() { return ended; });
      runs();
    });

    it('should progress on failed promise from .play()', function() {
      audio_elem.play = function() {
        audio_elem.played = true;
        return RSVP.reject({});
      };
      speecher.play_audio(audio_elem);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        ended = true;
      });
      waitsFor(function() { return audio_elem.played; });
      runs();
      waitsFor(function() { return ended; });
      runs();
    });

    it('should progress on no events, if playback does started but then got stuck', function() {
      speecher.play_audio(audio_elem);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        ended = true;
      });
      waitsFor(function() { return audio_elem.played; });
      runs(function() {
        audio_elem.currentTime = 1;
      });
      waitsFor(function() { return ended; });
      runs();
    });

    it('should progress on no events if playback takes longer than three times the length of the file', function() {
      audio_elem.duration = 0.1;
      speecher.play_audio(audio_elem);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        ended = true;
      });
      stub(window, 'keep_going', true);
      waitsFor(function() { return audio_elem.played; });
      runs(function() {
        var go_again = function() {
          if(window.keep_going) {
            audio_elem.currentTime++;
            emberRun.later(function() {
              go_again();
            }, 25);
          }
        };
        audio_elem.currentTime = 1;
        go_again();
      });
      waitsFor(function() { return ended; });
      runs();
    });

    it('should only progress once, even with repeated events', function() {
      audio_elem.play = function() {
        audio_elem.played = true;
        return RSVP.reject();
      };
      speecher.play_audio(audio_elem);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        expect(ended).toEqual(false);
        ended = true;
      });
      waitsFor(function() { return audio_elem.played; });
      runs(function() {
        audio_elem.dispatchEvent(new window.Event('abort'));
      });
      waitsFor(function() { return ended; });
      runs();
    });

    it('should work with mobile plugin playback mechanism', function() {
      var media = null;
      stub(capabilities, 'installed_app', true);
      stub(capabilities, 'mobile', true);
      stub(window, 'Media', function(url, success, error, status) {
        var _this = this;
        media = _this;
        this.play = function() {
          _this.played = true;
        };
        this.pause = function() {
          _this.paused = true;
        };
        if(!window.Media.MEDIA_PAUSED) { window.Media.MEDIA_PAUSED = 'pause'; }
        if(!window.Media.MEDIA_STOPPED) { window.Media.MEDIA_STOPPED = 'stop'; }
        this.success = success;
        this.error = error;
        this.status = status;
        this.getDuration = function() {
          return 10;
        };
        this.getCurrentPosition = function(success, error) {
          success(1);
        };
      });
      speecher.play_audio(audio_elem);
      expect(media).toNotEqual(null);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        ended = true;
      });
      waitsFor(function() { return media && media.played; });
      runs(function() {
        media.status(window.Media.MEDIA_STOPPED);
      });
      waitsFor(function() { return ended; });
      runs();
    });

    it('should progress on success event from mobile plugin', function() {
      var media = null;
      stub(capabilities, 'installed_app', true);
      stub(capabilities, 'mobile', true);
      stub(window, 'Media', function(url, success, error, status) {
        var _this = this;
        media = _this;
        this.play = function() {
          _this.played = true;
        };
        this.pause = function() {
          _this.paused = true;
        };
        if(!window.Media.MEDIA_PAUSED) { window.Media.MEDIA_PAUSED = 'pause'; }
        if(!window.Media.MEDIA_STOPPED) { window.Media.MEDIA_STOPPED = 'stop'; }
        this.success = success;
        this.error = error;
        this.status = status;
        this.getDuration = function() {
          return 10;
        };
        this.getCurrentPosition = function(success, error) {
          success(1);
        };
      });
      speecher.play_audio(audio_elem);
      expect(media).toNotEqual(null);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        ended = true;
      });
      waitsFor(function() { return media && media.played; });
      runs(function() {
        media.status(window.Media.MEDIA_STOPPED);
      });
      waitsFor(function() { return ended; });
      runs();
    });

    it('should progress on error event from mobile plugin', function() {
      var media = null;
      stub(capabilities, 'installed_app', true);
      stub(capabilities, 'mobile', true);
      stub(window, 'Media', function(url, success, error, status) {
        var _this = this;
        media = _this;
        this.play = function() {
          _this.played = true;
        };
        this.pause = function() {
          _this.paused = true;
        };
        if(!window.Media.MEDIA_PAUSED) { window.Media.MEDIA_PAUSED = 'pause'; }
        if(!window.Media.MEDIA_STOPPED) { window.Media.MEDIA_STOPPED = 'stop'; }
        this.success = success;
        this.error = error;
        this.status = status;
        this.getDuration = function() {
          return 10;
        };
        this.getCurrentPosition = function(success, error) {
          success(1);
        };
      });
      speecher.play_audio(audio_elem);
      expect(media).toNotEqual(null);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        ended = true;
      });
      waitsFor(function() { return media && media.played; });
      runs(function() {
        media.error();
      });
      waitsFor(function() { return ended; });
      runs();
    });

    it('should not progress from audio even when started via mobile plugin', function() {
      var media = null;
      stub(capabilities, 'installed_app', true);
      stub(capabilities, 'mobile', true);
      stub(window, 'Media', function(url, success, error, status) {
        var _this = this;
        media = _this;
        this.play = function() {
          _this.played = true;
        };
        this.pause = function() {
          _this.paused = true;
        };
        if(!window.Media.MEDIA_PAUSED) { window.Media.MEDIA_PAUSED = 'pause'; }
        if(!window.Media.MEDIA_STOPPED) { window.Media.MEDIA_STOPPED = 'stop'; }
        this.success = success;
        this.error = error;
        this.status = status;
        this.getDuration = function() {
          return 10;
        };
        this.getCurrentPosition = function(success, error) {
          success(1);
        };
      });
      speecher.play_audio(audio_elem);
      expect(media).toNotEqual(null);
      var ended = false;
      stub(speecher, 'speak_end_handler', function() {
        ended = true;
      });
      waitsFor(function() { return media && media.played; });
      runs(function() {
        audio_elem.dispatchEvent(new window.Event('abort'));
      });
      var not_ended = false;
      emberRun.later(function() {
        if(!ended) { not_ended = true; }
      }, 500);
      waitsFor(function() { return not_ended; });
      runs();
    });
  });
});
