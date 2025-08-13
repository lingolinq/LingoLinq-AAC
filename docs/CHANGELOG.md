# App Changelog

## Master
### 2020-09-30
- Head and gaze tracking in ARKit/ARCore
- Switch to WKWebView for iOS app
- Updated billing, premium supporters and evals
- Support for IAP subscriptions
- Remote modeling support (feature flag)
- Enable evals for premium accounts

### 2019-11-25
- High-contrast symbols settings
- Drag action to toggle modeling
- Translation improvements
- Track "travel" as level of work for hitting buttons
- Background images for boards
- Evaluations (feature flag)


### 2019-10-08
- Updated sentence dropdown
- Search supports locale-based lookups
- Inflections management tool for admins
- Long-press for inflections menu on buttons
- Swipe-based inflections on buttons
- Repairs allows adding words mid-sentence
- Native keyboard support
- Ask about trusted sessions on all devices at login
- In-App Purchases support for iOS
- Find-a-button allows searching for whole phrases
- Normalize speech rate across engines
- Better recovery from partial data loss on mobile devices
- Cleaner Preferences page

### 2019-05-09
- In-app error tracking 
- Local storage optimizations
- More sentence dropdown improvements
- Find-a-button optimizations
- Allow searching premium symbols for authorized supervisees
- LAM file improvements
- Preliminary support for native keyboards
- Option to highlight buttons on selection
- Better support for premium symbols in pdf/obf
- Additional button actions

### 2019-03-27
- Improved sentence box dropdown (feature flag)
- Switch access improvements
- Native TTS (SAPI) support on Windows
- Performance optimizations for database
- Backend system upgrades
- Updated premium voice lists
- Preliminary support for NFC tags
- Improved message sharing, including support for replies
- IFTTT integration support

### 2018-10-01
- full modeling ideas support
- fixes for TTS rate for mobile defaults
- simplified navigation in button settings
- multiple actions on a single button
- PCS symbols support
- highlighting support for log entries
- board display/hide levels (feature flag)
- new board selection helper (feature flag)
- ask for reason when unsubscribing
- global admins can't edit boards

### 2018-06-01
- modeling ideas (feature flag)
- improvements to scanning and alternative access
- clean up new index layout
- improved board selection tool
- minimize user tracking without opt-in
- simplified badge and goal creation
- improvements to admin interface

### 2017-12-05
- optional simpler dashboard
- fixes issues with scanning
- fixes issues with pdf printing non-Roman characters
- stricter expired user policies
- setting as home defaults to making a new copy of the board set
- improved support for renaming users and boards
- better mechanism for tracking user connections/links
- improved organization room interface

### 2017-10-11
- fixes for media playback in speak mode
- support for CDNs for cached images
- global trends interface
- better support for native text-to-speech
- better support for "login via LingoLinq-AAC"

### 2017-09-01
- optional clicking sound when selecting unspoken buttons
- more robust support for OBF, pdf-generation
- auto-exit speak mode for unpaid supervisors
- faster board rendering on mobile
- 'unlisted' setting for boards to be public but not searchable
- better support for media playback on mobile
- better error handling for media transcoding

### 2017-06-30
- Tarheel Reader integration
- option for clear background on button symbols
- additional eye tracking support and troubleshooting
- option to delete linked boards when deleting a board
- cache optimizations for syncing
- change speak mode options to include modeling mode
- modeling filter for stats
- timeout on speak mode sessions for non-premium-affiliated supervisors
- more robust file handling for local storage sync

### 2017-05-04
- message banking tools (feature flag)
- fixes for switch-based scanning
- admin interface for managing gifts/bulk purchases
- support for lessonpix symbols
- eye-tracking status utility

### 2017-03-15
- core word reports (feature flag)
- faster board load times
- more efficient syncing
- improved support for eye trackers
- option to show simpler folder indicate (on by default for new users)
- better support for subscription updating from emails
- quick-switch between languages on translated boards (feature flag)

### 2017-02-07
- support for searching Pixabay for images
- fixed syncing to be less eager, more effective
- faster startup on mobile apps due to better syncing
- options for what to do with hidden buttons
- additional modifiers (":clear", ":home", etc.) on buttons
- option to create word art for button images
- option to externally track user signups

### 2017-01-27
- fixes for goals/badges browsing and selection interfaces
- option to faintly show hidden buttons in speak mode
- interface to swap images in batch (feature flag)
- backend support for batch translations (feature flag)
- fix issue with logs not going to supervisees correctly

### 2017-01-13
- show badge completion requirements for all badge popups
- fixes for race conditions when updating users and boards
- sound effects for badges
- support for frame-rendered integrations, with callbacks via aac_shim

### 2016-12-21
- fixed region-based scanning, added button-based scanning option
- optional alternate voice for scanning audio prompts
- support for generic place-based triggers on sidebar boards
- track limited daily use for all users, even when logging is disabled
- fix edited svgs not rendering correctly
- upgrade ember, rails and related libraries
- allow text-on-top for pdfs

### 2016-11-28
- improved goals, including badge generation (feature flag)
- got rid of "subscription" wording most places
- support for modeling actions that don't affect user logs (feature flag)
- location-based sidebar updates (feature flag)
- filter profanity on keyboard word suggestions

### 2016-10-27
- improved goal management interface
- room-level usage stats page
- support for pasting images onto buttons
- option to make boards public when copying
- option to translate boards when copying (feature flag)

### 2016-10-12
- fix dwell-based selection issues
- fix recurring notification scheduling
- more details on sync results
- more reliable syncing based on updates
- enable video recording for log messages
- introduction walkthrough for new users
- improve goals interface (feature flag)
- html sanitization for some fields
- support multiple image repositories for symbol search

### 2016-09-03
- support for Windows-based electron install
- more configuration options for dwell tracking
- support for searching multiple symbol/image libraries

### 2016-08-15
- user-level integrations that can be triggered by board button presses (feature flag)
- setting to block emails from future registrations
- fixed dwell tracking to work regardless of touch/click settings
- show board hierarchy on "Board Details" modal
- better consistency for subscription notifications
- enable snapshots, side-by-side reports for all users

### 2016-06-30
- lower volume for auditory scanning read-aloud
- user preference for text-above-images on buttons
- fix button stash, including new "add to stash" button in default mode
- new goals report in organization dashboard
- regular email updates on user usage reports, including goal tracking
- organizations can organize users into "rooms"
- extensions for Window-based acapela support (pending)
- new option to save report views as "snapshots" for side-by-side comparison (feature flag)

### 2016-06-06
- fix external links to open in default browser in the mobile app
- inline video player wouldn't close if the video failed to load
- more fine-grained options for copying and sharing boards
- fix lost/gained words user report
- framework for regular email notifications of usage summaries
- user-defined goals and progress tracking (feature flag)
- optimizations for board loading while syncing on mobile apps
- support for native sharing options on mobile apps
- additional sensor tracking added to usage logs
- video recording support added for log notes
- auto-transcoding of audio and video files (using SNS and elastic transcoder)
- more consistent syncing when reconnecting

### 2016-04-26
- first changelog entry
- move cached file contents out of the db to local file storage
- placeholder support for transcoding audio and videos
- improved caching support
- fixed bug that expired caches after 2 weeks without an update
- support for embedding boards via iframe
