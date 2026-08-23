import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { run, scheduleOnce } from '@ember/runloop';
import RSVP from 'rsvp';
import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { display_name_for } from '../utils/display_name';

export default Component.extend({
  tagName: '',

  appState: service('app-state'),
  persistence: service('persistence'),
  router: service('router'),

  feedback_type: '',
  reaction: '',
  general_feedback: '',
  workflow_context: '',
  device_context: '',
  name: '',
  email: '',
  requestVirtualMeeting: false,
  screenshotData: null,
  screenshotDragActive: false,
  recordingSupported: false,
  recordingConsent: false,
  recordingConsentAcceptedAt: null,
  isRecording: false,
  recordingUploading: false,
  recordingUploadId: null,
  recordingUploadToken: null,
  recordingBlob: null,
  recordingUrl: null,
  recordingSize: 0,
  recordingMimeType: '',
  recordingError: '',
  recordingBrowserSoundHint: '',

  errors: null,

  init() {
    this._super(...arguments);
    this.clearAllErrors();
    this.set('recordingSupported', this._screenRecordingSupported());
    const u = this.get('appState.sessionUser');
    if (u) {
      this.setProperties({
        name: display_name_for(u),
        email: u.get('email')
      });
    }
    var self = this;
    var send = function(action) {
      var args = Array.prototype.slice.call(arguments, 1);
      self.send.apply(self, [action].concat(args));
    };
    this.onSubmitFeedback = function(event) {
      if (event && event.preventDefault) { event.preventDefault(); }
      send('submit_feedback');
    };
    this.onScreenshotPaste = function(event) { send('screenshotPaste', event); };
    this.onChooseReaction = function(id) { send('chooseReaction', id); };
    this.onToggleFeedbackTypeDropdown = function() { send('toggleFeedbackTypeDropdown'); };
    this.onSelectFeedbackType = function(id) { send('selectFeedbackType', id); };
    this.onClearFieldErrorDetails = function() { send('clearFieldError', 'details'); };
    this.onAttachmentDragEnter = function(event) { send('attachmentDragEnter', event); };
    this.onAttachmentDragOver = function(event) { send('attachmentDragOver', event); };
    this.onAttachmentDragLeave = function(event) { send('attachmentDragLeave', event); };
    this.onAttachmentDrop = function(event) { send('attachmentDrop', event); };
    this.onAttachmentsChanged = function(event) { send('attachmentsChanged', event); };
    this.onClearScreenshot = function() { send('clearScreenshot'); };
    this.onClearRecording = function() { send('clearRecording'); };
    this.onToggleRecordingConsent = function(event) { send('toggleRecordingConsent', event); };
    this.onStopRecording = function() { send('stopRecording'); };
    this.onStartRecording = function() { send('startRecording'); };
  },

  clearAllErrors() {
    this.set('errors', {
      reaction: false,
      details: false,
      recording: false
    });
  },

  markError(field) {
    this.set('errors', Object.assign({}, this.get('errors') || {}, { [field]: true }));
  },

  clearError(field) {
    this.set('errors', Object.assign({}, this.get('errors') || {}, { [field]: false }));
  },

  hasAnyError: computed('errors', function() {
    const e = this.get('errors');
    if (!e) {
      return false;
    }
    return !!(e.reaction || e.details || e.recording);
  }),

  prompt_user: computed('appState.sessionUser', function() {
    return !this.get('appState.sessionUser');
  }),

  reactionOptions: computed(function() {
    return [
      { id: 'great', label: i18n.t('beta_feedback_reaction_great', "Great"), face: 'smile', tone: 'green' },
      { id: 'okay', label: i18n.t('beta_feedback_reaction_okay', "Okay"), face: 'neutral', tone: 'yellow' },
      { id: 'frustrating', label: i18n.t('beta_feedback_reaction_frustrating', "Frustrating"), face: 'frown', tone: 'red' }
    ];
  }),

  feedbackTypeOptions: computed(function() {
    return [
      { id: '', name: i18n.t('beta_feedback_area_prompt', "Choose an area (optional)") },
      { id: 'boards', name: i18n.t('beta_feedback_type_boards_short', "Boards") },
      { id: 'speak_mode', name: i18n.t('beta_feedback_type_speak_mode_short', "Speak Mode") },
      { id: 'editing', name: i18n.t('beta_feedback_type_editing', "Editing") },
      { id: 'sync', name: i18n.t('beta_feedback_type_sync_short', "Sync or offline") },
      { id: 'account', name: i18n.t('beta_feedback_type_account_short', "Login or account") },
      { id: 'performance', name: i18n.t('beta_feedback_type_performance_short', "Performance") },
      { id: 'other', name: i18n.t('beta_feedback_type_other', "Other") }
    ];
  }),

  recordingSizeLabel: computed('recordingSize', function() {
    var size = this.get('recordingSize') || 0;
    if (size < 1024) {
      return i18n.t('beta_feedback_recording_size_bytes', "%{size} bytes", { size: size });
    }
    if (size < 1024 * 1024) {
      return i18n.t('beta_feedback_recording_size_kb', "%{size} KB", { size: Math.round(size / 1024) });
    }
    return i18n.t('beta_feedback_recording_size_mb', "%{size} MB", { size: Math.round(size / 1024 / 1024) });
  }),

  recordingStartDisabled: computed('disabled', 'recordingUploading', 'recordingConsent', function() {
    return !!this.get('disabled') || !!this.get('recordingUploading') || !this.get('recordingConsent');
  }),

  feedbackTypeOpen: false,
  selectedFeedbackTypeLabel: computed('feedback_type', 'feedbackTypeOptions', function() {
    var id = this.get('feedback_type') || '';
    var opts = this.get('feedbackTypeOptions') || [];
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].id === id) { return opts[i].name; }
    }
    return opts[0] ? opts[0].name : '';
  }),

  _screenRecordingSupported() {
    return typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function' &&
      typeof window !== 'undefined' &&
      typeof window.MediaRecorder !== 'undefined';
  },

  _preferredRecordingMimeType() {
    if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined' || !window.MediaRecorder.isTypeSupported) {
      return 'video/webm';
    }
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (let i = 0; i < types.length; i++) {
      if (window.MediaRecorder.isTypeSupported(types[i])) {
        return types[i];
      }
    }
    return '';
  },

  _recordingUploadContentType() {
    var contentType = this.get('recordingMimeType') || 'video/webm';
    return contentType.split(';')[0] || 'video/webm';
  },

  _screenCaptureOptions() {
    return {
      video: {
        displaySurface: 'browser'
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false
      },
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'include',
      systemAudio: 'include',
      windowAudio: 'system'
    };
  },

  _getDisplayMediaWithCurrentTabHint() {
    const _this = this;
    return navigator.mediaDevices.getDisplayMedia(this._screenCaptureOptions()).catch(function(err) {
      if (err && err.name === 'TypeError') {
        return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      }
      return RSVP.reject(err);
    });
  },

  _stopRecordingStream() {
    this._setCapturableSpeechRecording(false);
    const stream = this.get('recordingStream');
    if (stream && stream.getTracks) {
      stream.getTracks().forEach(function(track) {
        track.stop();
      });
    }
    const displayStream = this.get('recordingDisplayStream');
    if (displayStream && displayStream !== stream && displayStream.getTracks) {
      displayStream.getTracks().forEach(function(track) {
        track.stop();
      });
    }
    const audioStream = this.get('recordingAudioStream');
    if (audioStream && audioStream.getTracks) {
      audioStream.getTracks().forEach(function(track) {
        track.stop();
      });
    }
    const audioContext = this.get('recordingAudioContext');
    if (audioContext && audioContext.close) {
      audioContext.close();
    }
    this.set('recordingStream', null);
    this.set('recordingDisplayStream', null);
    this.set('recordingAudioStream', null);
    this.set('recordingAudioContext', null);
    this.set('recordingAudioSources', null);
  },

  _clearRecordingObjectUrl() {
    const url = this.get('recordingUrl');
    if (url && typeof window !== 'undefined' && window.URL && window.URL.revokeObjectURL) {
      window.URL.revokeObjectURL(url);
    }
  },

  _setCapturableSpeechRecording(active) {
    if (typeof window !== 'undefined') {
      window.LingoLinqBetaFeedbackRecordingActive = !!active;
    }
  },

  _getMicrophoneAudioStream() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      return RSVP.resolve(null);
    }
    return navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    }).catch(function() {
      return null;
    });
  },

  _recordingStreamWithAudio(displayStream) {
    const _this = this;
    return this._getMicrophoneAudioStream().then(function(audioStream) {
      var videoTracks = displayStream && displayStream.getVideoTracks ? displayStream.getVideoTracks() : [];
      var displayAudioTracks = displayStream && displayStream.getAudioTracks ? displayStream.getAudioTracks() : [];
      var micAudioTracks = audioStream && audioStream.getAudioTracks ? audioStream.getAudioTracks() : [];
      var audioTracks = displayAudioTracks.concat(micAudioTracks);
      _this.set('recordingDisplayStream', displayStream);
      _this.set('recordingAudioStream', audioStream);
      _this.set('recordingAudioContext', null);
      _this.set('recordingAudioSources', null);
      if (displayAudioTracks.length === 0) {
        _this.set('recordingBrowserSoundHint', i18n.t('beta_feedback_recording_no_tab_audio_with_mic', "Browser sound was not shared. To include Speak Mode audio, choose a browser tab and enable Share tab audio. Microphone audio will be included if you allow it."));
      } else {
        _this.set('recordingBrowserSoundHint', '');
      }
      if (audioTracks.length === 0) {
        return displayStream;
      }
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext || !window.MediaStream) {
        return new MediaStream(videoTracks.concat(audioTracks));
      }
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      const sources = [];
      audioTracks.forEach(function(track) {
        try {
          var source = audioContext.createMediaStreamSource(new MediaStream([track]));
          source.connect(destination);
          sources.push(source);
        } catch(e) { }
      });
      if (sources.length === 0) {
        audioContext.close();
        return new MediaStream(videoTracks.concat(audioTracks));
      }
      if (audioContext.state === 'suspended' && audioContext.resume) {
        audioContext.resume();
      }
      _this.set('recordingAudioContext', audioContext);
      _this.set('recordingAudioSources', sources);
      return new MediaStream(videoTracks.concat(destination.stream.getAudioTracks()));
    });
  },

  _severityForReaction(reaction) {
    if (reaction === 'frustrating') {
      return 'major';
    }
    if (reaction === 'great') {
      return 'suggestion';
    }
    return 'minor';
  },

  _subjectFromFeedback(text) {
    var s = (text || '').trim().replace(/\s+/g, ' ');
    if (!s) {
      return i18n.t('beta_feedback_default_subject', "Beta feedback");
    }
    if (s.length > 90) {
      return s.substring(0, 87) + '...';
    }
    return s;
  },

  uploadRecordingIfNeeded() {
    var blob = this.get('recordingBlob');
    if (!blob || this.get('recordingUploadId')) {
      return RSVP.resolve({
        id: this.get('recordingUploadId'),
        token: this.get('recordingUploadToken')
      });
    }
    if (blob.size > 100 * 1024 * 1024) {
      this.set('recordingError', i18n.t('beta_feedback_recording_too_large_upload', "This recording is still over 100 MB after compression. Please make a shorter recording before sending feedback."));
      return RSVP.reject({ error: 'recording too large' });
    }
    var _this = this;
    this.set('recordingUploading', true);
    const uploadViaServer = function(rec) {
      var serverFd = new FormData();
      serverFd.append('token', rec.token);
      serverFd.append('file', blob);
      return new RSVP.Promise(function(resolve, reject) {
        var serverXhr = new XMLHttpRequest();
        serverXhr.open('POST', rec.upload_url);
        serverXhr.onload = function() {
          if (serverXhr.status >= 200 && serverXhr.status < 300) {
            try {
              resolve(JSON.parse(serverXhr.responseText));
            } catch (e) {
              reject({ error: 'upload response could not be read' });
            }
          } else {
            reject({ error: 'server upload failed', responseText: serverXhr.responseText });
          }
        };
        serverXhr.onerror = function() {
          reject({ error: 'server upload failed' });
        };
        serverXhr.send(serverFd);
      });
    };
    const useServerUploadFirst = function() {
      if (typeof window === 'undefined' || !window.location) {
        return false;
      }
      return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    };
    return this.get('persistence').ajax('/api/v1/beta_feedback_recordings', {
      type: 'POST',
      contentType: 'application/json; charset=UTF-8',
      data: JSON.stringify({
        beta_feedback_recording: {
          content_type: this._recordingUploadContentType(),
          byte_size: blob.size,
          consent_accepted: this.get('recordingConsent'),
          consent_accepted_at: this.get('recordingConsentAcceptedAt')
        }
      }),
      dataType: 'json'
    }).then(function(json) {
      var rec = json && json.beta_feedback_recording;
      if (!rec || !rec.remote_upload) {
        return RSVP.reject({ error: 'missing upload parameters' });
      }
      if (useServerUploadFirst()) {
        return uploadViaServer(rec);
      }
      var fd = new FormData();
      var params = rec.remote_upload.upload_params || {};
      Object.keys(params).forEach(function(key) {
        fd.append(key, params[key]);
      });
      fd.append('file', blob);
      return new RSVP.Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        // post_url is the SigV4-signed regional S3 endpoint; upload_url stays
        // the canonical object URL other code matches self.url against.
        xhr.open('POST', rec.remote_upload.post_url || rec.remote_upload.upload_url);
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(rec);
          } else {
            reject({ error: 'upload failed' });
          }
        };
        xhr.onerror = function() {
          reject({ error: 'upload failed' });
        };
        xhr.send(fd);
      }).catch(function() {
        return uploadViaServer(rec);
      });
    }).then(function(rec) {
      if (rec && rec.beta_feedback_recording) {
        return rec;
      }
      return _this.get('persistence').ajax(rec.confirm_url, {
        type: 'POST',
        contentType: 'application/json; charset=UTF-8',
        data: JSON.stringify({ token: rec.token }),
        dataType: 'json'
      });
    }).then(function(json) {
      var rec = json && json.beta_feedback_recording;
      _this.setProperties({
        recordingUploading: false,
        recordingUploadId: rec && rec.id,
        recordingUploadToken: rec && rec.token
      });
      return rec;
    }).catch(function(err) {
      _this.set('recordingUploading', false);
      _this.set('recordingError', i18n.t('beta_feedback_recording_upload_failed', "Recording upload failed. Please remove it or try again."));
      return RSVP.reject(err);
    });
  },

  _isPasteTargetTextField(target) {
    if (!target || !target.closest) {
      return false;
    }
    if (target.closest('textarea')) {
      return true;
    }
    const inp = target.closest('input');
    if (inp && /^(text|email|search|url|tel|password|number)$/i.test(inp.type)) {
      return true;
    }
    return false;
  },

  applyScreenshotFile(file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      modal.error(i18n.t('beta_feedback_screenshot_invalid_type', "Please use a PNG, JPG, GIF, or WebP image."));
      const invalidInput = document.getElementById('beta_feedback_attachments');
      if (invalidInput) {
        invalidInput.value = '';
      }
      return;
    }
    const max = 1.5 * 1024 * 1024;
    if (file.size > max) {
      modal.error(i18n.t('beta_feedback_screenshot_too_large', "Please choose an image about 1.5 MB or smaller."));
      const largeInput = document.getElementById('beta_feedback_attachments');
      if (largeInput) {
        largeInput.value = '';
      }
      return;
    }
    const reader = new FileReader();
    const _this = this;
    reader.onload = function() {
      run(_this, function() {
        _this.set('screenshotData', reader.result);
      });
    };
    reader.readAsDataURL(file);
    const fileInput = document.getElementById('beta_feedback_attachments');
    if (fileInput) {
      fileInput.value = '';
    }
  },

  applyRecordingFile(file) {
    this._clearRecordingObjectUrl();
    if (!file || !file.type || file.type.indexOf('video/') !== 0) {
      modal.error(i18n.t('beta_feedback_recording_invalid_type', "Please use a video file for the screen recording."));
      return;
    }
    this.setProperties({
      recordingBlob: file,
      recordingUrl: window.URL.createObjectURL(file),
      recordingSize: file.size,
      recordingMimeType: file.type || 'video/webm',
      recordingUploadId: null,
      recordingUploadToken: null,
      recordingError: '',
      recordingBrowserSoundHint: ''
    });
    if (file.size > 100 * 1024 * 1024) {
      this.set('recordingError', i18n.t('beta_feedback_recording_too_large_upload', "This recording is still over 100 MB after compression. Please make a shorter recording before sending feedback."));
    }
  },

  applyAttachmentFiles(files) {
    if (!files || !files.length) {
      return;
    }
    var handled = false;
    for (let i = 0; i < files.length; i++) {
      var file = files[i];
      if (!file || !file.type) {
        continue;
      }
      if (file.type.indexOf('image/') === 0) {
        this.applyScreenshotFile(file);
        handled = true;
      } else if (file.type.indexOf('video/') === 0) {
        this.applyRecordingFile(file);
        handled = true;
      }
    }
    if (!handled) {
      modal.error(i18n.t('beta_feedback_attachment_invalid_type', "Please attach an image or video file."));
    }
    const fileInput = document.getElementById('beta_feedback_attachments');
    if (fileInput) {
      fileInput.value = '';
    }
  },

  _buildAutoDeviceContextSummary() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return '';
    }
    var router = this.get('router');
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    var tz = '';
    try {
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      }
    } catch (e) {
      /* ignore */
    }
    var route = router && router.get('currentRouteName') ? String(router.get('currentRouteName')) : '';
    var path = window.location.pathname || '';
    if (window.location.search) {
      path += window.location.search;
    }
    var online = navigator.onLine;
    var onlineStr = online
      ? i18n.t('beta_feedback_context_online_yes', 'yes')
      : i18n.t('beta_feedback_context_online_no', 'no');
    var na = i18n.t('beta_feedback_auto_context_na', '—');
    var lines = [
      i18n.t('beta_feedback_auto_context_header', '--- Auto (submission) ---'),
      i18n.t('beta_feedback_auto_context_viewport', 'Viewport: %{w}×%{h} (%{dpr} dppx)', { w: vw, h: vh, dpr: dpr }),
      i18n.t('beta_feedback_auto_context_timezone', 'Time zone: %{tz}', { tz: tz || na }),
      i18n.t('beta_feedback_auto_context_route', 'Route: %{route}', { route: route || na }),
      i18n.t('beta_feedback_auto_context_path', 'Path: %{path}', { path: path || na }),
      i18n.t('beta_feedback_auto_context_online', 'Online: %{online}', { online: onlineStr })
    ];
    return lines.join('\n');
  },

  _combineDeviceContextForSubmit(userText, autoBlock) {
    var maxLen = 2000;
    var sep = '\n\n';
    var u = (userText || '').trim();
    var auto = autoBlock || '';
    if (!auto) {
      return u.length <= maxLen ? u : u.substring(0, maxLen);
    }
    if (auto.length >= maxLen) {
      return auto.substring(0, maxLen);
    }
    if (!u) {
      return auto;
    }
    var combined = u + sep + auto;
    if (combined.length <= maxLen) {
      return combined;
    }
    var reserve = sep.length + auto.length;
    var userBudget = maxLen - reserve;
    if (userBudget <= 0) {
      return auto.length <= maxLen ? auto : auto.substring(0, maxLen);
    }
    if (u.length <= userBudget) {
      return combined;
    }
    var ellipsis = i18n.t('beta_feedback_auto_context_truncation_ellipsis', '…');
    if (userBudget <= ellipsis.length) {
      return u.substring(0, userBudget) + sep + auto;
    }
    return u.substring(0, userBudget - ellipsis.length) + ellipsis + sep + auto;
  },

  willDestroy() {
    this._super(...arguments);
    const recorder = this.get('mediaRecorder');
    if (recorder && recorder.state === 'recording') {
      try { recorder.stop(); } catch (e) { /* ignore */ }
    }
    this._stopRecordingStream();
    this._clearRecordingObjectUrl();
  },

  actions: {
    clearFieldError(field) {
      this.clearError(field);
    },
    updateFeedbackType(id) {
      this.set('feedback_type', id);
    },
    toggleFeedbackTypeDropdown() {
      this.toggleProperty('feedbackTypeOpen');
    },
    selectFeedbackType(id) {
      this.set('feedback_type', id);
      this.set('feedbackTypeOpen', false);
    },
    chooseReaction(id) {
      this.set('reaction', id);
      this.clearError('reaction');
    },
    toggleRecordingConsent(event) {
      var checked = !!(event && event.target && event.target.checked);
      this.set('recordingConsent', checked);
      this.set('recordingConsentAcceptedAt', checked ? new Date().toISOString() : null);
      this.clearError('recording');
    },
    startRecording() {
      if (!this.get('recordingSupported')) {
        modal.error(i18n.t('beta_feedback_recording_not_supported', "Screen recording is not supported in this browser."));
        return;
      }
      if (!this.get('recordingConsent')) {
        this.markError('recording');
        modal.error(i18n.t('beta_feedback_recording_consent_required', "Please confirm the privacy and consent statement before recording."));
        return;
      }
      const _this = this;
      const mimeType = this._preferredRecordingMimeType();
      this.set('recordingBrowserSoundHint', '');
      this._getDisplayMediaWithCurrentTabHint().then(function(displayStream) {
        return _this._recordingStreamWithAudio(displayStream);
      }).then(function(stream) {
        const opts = {
          videoBitsPerSecond: 1400000,
          audioBitsPerSecond: 64000
        };
        if (mimeType) {
          opts.mimeType = mimeType;
        }
        const recorder = new window.MediaRecorder(stream, opts);
        const chunks = [];
        let total = 0;
        recorder.ondataavailable = function(event) {
          if (event.data && event.data.size) {
            chunks.push(event.data);
            total += event.data.size;
            run(_this, function() {
              _this.set('recordingSize', total);
            });
          }
        };
        recorder.onstop = function() {
          run(_this, function() {
            _this._stopRecordingStream();
            _this._clearRecordingObjectUrl();
            const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
            _this.setProperties({
              isRecording: false,
              recordingBlob: blob,
              recordingUrl: window.URL.createObjectURL(blob),
              recordingSize: blob.size,
              recordingMimeType: blob.type || mimeType || 'video/webm',
              recordingUploadId: null,
              recordingUploadToken: null,
              recordingError: ''
            });
            if (blob.size > 100 * 1024 * 1024) {
              _this.set('recordingError', i18n.t('beta_feedback_recording_too_large_upload', "This recording is still over 100 MB after compression. Please make a shorter recording before sending feedback."));
            } else {
              modal.success(i18n.t('beta_feedback_recording_attached', "Recording attached. It will upload when you send feedback."));
            }
          });
        };
        stream.getVideoTracks().forEach(function(track) {
          track.onended = function() {
            if (recorder.state === 'recording') {
              recorder.stop();
            }
          };
        });
        _this.setProperties({
          recordingStream: stream,
          mediaRecorder: recorder,
          isRecording: true,
          recordingBlob: null,
          recordingSize: 0,
          recordingError: ''
        });
        _this._setCapturableSpeechRecording(true);
        recorder.start(1000);
      }).catch(function() {
        run(_this, function() {
          _this.set('isRecording', false);
          _this._setCapturableSpeechRecording(false);
        });
      });
    },
    stopRecording() {
      const recorder = this.get('mediaRecorder');
      if (recorder && recorder.state === 'recording') {
        recorder.stop();
      }
    },
    clearRecording() {
      this._stopRecordingStream();
      this._clearRecordingObjectUrl();
      this.setProperties({
        isRecording: false,
        recordingUploading: false,
        recordingUploadId: null,
        recordingUploadToken: null,
        recordingBlob: null,
        recordingUrl: null,
        recordingSize: 0,
        recordingMimeType: '',
        recordingError: '',
        recordingBrowserSoundHint: ''
      });
      const el = document.getElementById('beta_feedback_attachments');
      if (el) {
        el.value = '';
      }
    },
    attachmentsChanged(event) {
      const input = event.target;
      const files = input.files;
      if (!files || files.length === 0) {
        return;
      }
      this.applyAttachmentFiles(files);
    },
    screenshotPaste(event) {
      const items = event.clipboardData && event.clipboardData.items;
      if (!items || !items.length) {
        return;
      }
      let imageFile = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
          imageFile = items[i].getAsFile();
          if (imageFile) {
            break;
          }
        }
      }
      if (!imageFile) {
        return;
      }
      if (this._isPasteTargetTextField(event.target)) {
        return;
      }
      event.preventDefault();
      this.applyScreenshotFile(imageFile);
    },
    attachmentDragEnter(event) {
      event.preventDefault();
      event.stopPropagation();
      this.set('screenshotDragActive', true);
    },
    attachmentDragOver(event) {
      event.preventDefault();
      event.stopPropagation();
      this.set('screenshotDragActive', true);
    },
    attachmentDragLeave(event) {
      event.preventDefault();
      if (!event.currentTarget.contains(event.relatedTarget)) {
        this.set('screenshotDragActive', false);
      }
    },
    attachmentDrop(event) {
      event.preventDefault();
      event.stopPropagation();
      this.set('screenshotDragActive', false);
      const files = event.dataTransfer && event.dataTransfer.files;
      this.applyAttachmentFiles(files);
    },
    clearScreenshot() {
      this.setProperties({ screenshotData: null, screenshotDragActive: false });
      const el = document.getElementById('beta_feedback_attachments');
      if (el) {
        el.value = '';
      }
    },

    submit_feedback() {
      this.clearAllErrors();
      this.set('error', false);
      this.set('recordingError', '');

      let firstFieldId = null;
      const mark = (field, id) => {
        this.markError(field);
        if (!firstFieldId) {
          firstFieldId = id;
        }
      };

      if (!this.get('reaction')) {
        mark('reaction', 'beta_reaction');
      }
      const detail = (this.get('general_feedback') || '').trim();
      if (detail.length < 10) {
        mark('details', 'beta_general');
      }
      if (this.get('recordingBlob') && !this.get('recordingConsent')) {
        mark('recording', 'beta_recording_consent');
      }

      if (this.get('hasAnyError')) {
        modal.error(i18n.t('beta_feedback_validation_banner', "Please review the highlighted fields below and fix any issues before sending."));
        scheduleOnce('afterRender', this, function() {
          const el = firstFieldId && document.getElementById(firstFieldId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (el.focus && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
              try {
                el.focus({ preventScroll: true });
              } catch (e) {
                el.focus();
              }
            }
          }
        });
        return;
      }
      var autoCtx = this._buildAutoDeviceContextSummary();
      var deviceContext = this._combineDeviceContextForSubmit('', autoCtx);
      var reaction = this.get('reaction');
      var feedbackText = this.get('general_feedback');
      const message = {
        name: this.get('name'),
        email: this.get('email'),
        recipient: 'beta_feedback',
        subject: this._subjectFromFeedback(feedbackText),
        locale: i18n.langs.preferred,
        message: '',
        feedback_type: this.get('feedback_type') || 'other',
        severity: this._severityForReaction(reaction),
        reaction: reaction,
        workflow_context: this.get('workflow_context'),
        general_feedback: feedbackText,
        request_virtual_meeting: this.get('requestVirtualMeeting'),
        device_context: deviceContext,
        screenshot_data: this.get('screenshotData'),
        recording_id: this.get('recordingUploadId'),
        recording_token: this.get('recordingUploadToken'),
        recording_consent: this.get('recordingConsent'),
        recording_consent_accepted_at: this.get('recordingConsentAcceptedAt')
      };
      const _this = this;
      this.set('disabled', true);
      this.set('error', false);
      modal.success(i18n.t('beta_feedback_sending', "Sending beta feedback..."));
      this.uploadRecordingIfNeeded().then(function(rec) {
        if (rec && rec.id) {
          message.recording_id = rec.id;
          message.recording_token = rec.token;
        }
        return _this.get('persistence').ajax('/api/v1/messages', {
          type: 'POST',
          contentType: 'application/json; charset=UTF-8',
          data: JSON.stringify({ message: message }),
          dataType: 'json'
        });
      }).then(function() {
        _this.set('disabled', false);
        _this.clearAllErrors();
        _this._clearRecordingObjectUrl();
        _this.setProperties({
          general_feedback: '',
          workflow_context: '',
          feedback_type: '',
          reaction: '',
          requestVirtualMeeting: false,
          screenshotData: null,
          screenshotDragActive: false,
          recordingConsent: false,
          recordingConsentAcceptedAt: null,
          recordingUploadId: null,
          recordingUploadToken: null,
          recordingBlob: null,
          recordingUrl: null,
          recordingSize: 0,
          recordingMimeType: '',
          recordingError: ''
        });
        const el = document.getElementById('beta_feedback_attachments');
        if (el) {
          el.value = '';
        }
        modal.success(i18n.t('beta_feedback_sent', "Thank you! Your beta feedback was sent."));
        const onSuccess = _this.get('onSubmitSuccess');
        if (onSuccess) {
          onSuccess();
        }
      }, function(xhr) {
        _this.set('error', true);
        _this.set('disabled', false);
        let detail = '';
        try {
          const json = xhr.responseJSON || (xhr.responseText && JSON.parse(xhr.responseText));
          if (json && json.errors && json.errors.length) {
            detail = json.errors.join(' ');
          } else if (json && json.error) {
            detail = json.error;
          }
        } catch (e) { /* ignore parse errors */ }
        if (!detail && xhr && xhr.error) {
          detail = xhr.error;
        }
        if (!detail) {
          detail = _this.get('recordingError') || i18n.t('beta_feedback_send_failed_detail', "Beta feedback could not be sent. Please try again.");
        }
        modal.error(detail);
      });
    }
  }
});
