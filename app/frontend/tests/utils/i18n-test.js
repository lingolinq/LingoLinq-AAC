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
import { easyPromise, db_wait } from 'frontend/tests/helpers/ember_helper';
import i18n from '../../utils/i18n';
import templateHelpers from '../../utils/template_helpers';
import EmberObject from '@ember/object';


describe("i18n", function() {
  describe("pluralize", function() {
    it("should pluralize correctly", function() {
      expect(i18n.pluralize).not.toEqual(null);
      expect(i18n.pluralize("cat")).toEqual("cats");
      expect(i18n.pluralize("sky")).toEqual("skies");
      expect(i18n.pluralize("cow")).toEqual("cows");
      expect(i18n.pluralize("wish")).toEqual("wishes");
      expect(i18n.pluralize("box")).toEqual("boxes");
      expect(i18n.pluralize("day")).toEqual("days");
      expect(i18n.pluralize("goose")).toEqual("geese");
      expect(i18n.pluralize("mouse")).toEqual("mice");
      expect(i18n.pluralize("elf")).toEqual("elves");
      expect(i18n.pluralize("shelf")).toEqual("shelves");
      expect(i18n.pluralize("wolf")).toEqual("wolves");
      expect(i18n.pluralize("man")).toEqual("men");
      expect(i18n.pluralize("person")).toEqual("people");
      expect(i18n.pluralize("foot")).toEqual("feet");
      expect(i18n.pluralize("tooth")).toEqual("teeth");
      expect(i18n.pluralize("woman")).toEqual("women");
      expect(i18n.pluralize("leaf")).toEqual("leaves");
      expect(i18n.pluralize("boy")).toEqual("boys");
      expect(i18n.pluralize("toy")).toEqual("toys");
      expect(i18n.pluralize("day")).toEqual("days");
      expect(i18n.pluralize("play")).toEqual("plays");
      expect(i18n.pluralize("stay")).toEqual("stays");
      expect(i18n.pluralize("ray")).toEqual("rays");
      expect(i18n.pluralize("clay")).toEqual("clays");
      expect(i18n.pluralize("pray")).toEqual("prays");
      expect(i18n.pluralize("sheep")).toEqual("sheep");
      expect(i18n.pluralize("deer")).toEqual("deer");

      expect(i18n.pluralize("berry")).toEqual("berries");
      expect(i18n.pluralize("activity")).toEqual("activities");
      expect(i18n.pluralize("daisy")).toEqual("daisies");
      expect(i18n.pluralize("church")).toEqual("churches");
      expect(i18n.pluralize("bus")).toEqual("buses");
      expect(i18n.pluralize("fox")).toEqual("foxes");
      expect(i18n.pluralize("stomach")).toEqual("stomachs");
      expect(i18n.pluralize("epoch")).toEqual("epochs");
      expect(i18n.pluralize("knife")).toEqual("knives");
      expect(i18n.pluralize("half")).toEqual("halves");
      expect(i18n.pluralize("scarf")).toEqual("scarves");
      expect(i18n.pluralize("chief")).toEqual("chiefs");
      expect(i18n.pluralize("spoof")).toEqual("spoofs");
      expect(i18n.pluralize("solo")).toEqual("solos");
      expect(i18n.pluralize("zero")).toEqual("zeros");
      expect(i18n.pluralize("avocado")).toEqual("avocados");
      expect(i18n.pluralize("studio")).toEqual("studios");
      expect(i18n.pluralize("zoo")).toEqual("zoos");
      expect(i18n.pluralize("embryo")).toEqual("embryos");
      expect(i18n.pluralize("buffalo")).toEqual("buffaloes");
      expect(i18n.pluralize("domino")).toEqual("dominoes");
      expect(i18n.pluralize("echo")).toEqual("echoes");
      expect(i18n.pluralize("embargo")).toEqual("embargoes");
      expect(i18n.pluralize("hero")).toEqual("heroes");
      expect(i18n.pluralize("mosquito")).toEqual("mosquitoes");
      expect(i18n.pluralize("potato")).toEqual("potatoes");
      expect(i18n.pluralize("tomato")).toEqual("tomatoes");
      expect(i18n.pluralize("torpedo")).toEqual("torpedoes");
      expect(i18n.pluralize("veto")).toEqual("vetoes");
      expect(i18n.pluralize("banjo")).toEqual("banjos");
      expect(i18n.pluralize("cargo")).toEqual("cargos");
      expect(i18n.pluralize("flamingo")).toEqual("flamingos");
      expect(i18n.pluralize("fresco")).toEqual("frescos");
      expect(i18n.pluralize("ghetto")).toEqual("ghettos");
      expect(i18n.pluralize("halo")).toEqual("halos");
      expect(i18n.pluralize("mango")).toEqual("mangos");
      expect(i18n.pluralize("memento")).toEqual("mementos");
      expect(i18n.pluralize("motto")).toEqual("mottos");
      expect(i18n.pluralize("tornado")).toEqual("tornados");
      expect(i18n.pluralize("tuxedo")).toEqual("tuxedos");
      expect(i18n.pluralize("volcano")).toEqual("volcanos");
      expect(i18n.pluralize("antenna")).toEqual("antennas");
      expect(i18n.pluralize("appendix")).toEqual("appendixes");
      expect(i18n.pluralize("cactus")).toEqual("cactuses");
      expect(i18n.pluralize("curriculum")).toEqual("curriculums");
      expect(i18n.pluralize("formula")).toEqual("formulas");
      expect(i18n.pluralize("index")).toEqual("indexes");
      expect(i18n.pluralize("millenium")).toEqual("milleniums");
      expect(i18n.pluralize("referendum")).toEqual("referendums");
      expect(i18n.pluralize("stadium")).toEqual("stadiums");
      expect(i18n.pluralize("terminus")).toEqual("terminuses");
      expect(i18n.pluralize("thesaurus")).toEqual("thesauruses");
      expect(i18n.pluralize("vortex")).toEqual("vortexes");
      expect(i18n.pluralize("alga")).toEqual("algae");
      expect(i18n.pluralize("alumnus")).toEqual("alumni");
      expect(i18n.pluralize("larva")).toEqual("larvae");
      expect(i18n.pluralize("crisis")).toEqual("crises");
      expect(i18n.pluralize("analysis")).toEqual("analyses");
      expect(i18n.pluralize("neurosis")).toEqual("neuroses");
    });
  });

  describe("ordinal", function() {
    it("should format numbers", function() {
      expect(i18n.ordinal("1")).toEqual("1st");
      expect(i18n.ordinal("2")).toEqual("2nd");
      expect(i18n.ordinal("3")).toEqual("3rd");
      expect(i18n.ordinal("4")).toEqual("4th");
      expect(i18n.ordinal("5")).toEqual("5th");
      expect(i18n.ordinal("6")).toEqual("6th");
      expect(i18n.ordinal("7")).toEqual("7th");
      expect(i18n.ordinal("8")).toEqual("8th");
      expect(i18n.ordinal("9")).toEqual("9th");
      expect(i18n.ordinal("10")).toEqual("10th");
      expect(i18n.ordinal("24")).toEqual("24th");
      expect(i18n.ordinal("23")).toEqual("23rd");
      expect(i18n.ordinal("235322")).toEqual("235322nd");
      expect(i18n.ordinal("q398q")).toEqual("398th");
      expect(i18n.ordinal("4qn5783n1")).toEqual("457831st");
      expect(i18n.ordinal("4q893yo8")).toEqual("48938th");
      expect(i18n.ordinal("000004")).toEqual("000004th");
      expect(i18n.ordinal("345234")).toEqual("345234th");
      expect(i18n.ordinal("2345wert")).toEqual("2345th");
      expect(i18n.ordinal("235.1")).toEqual("235.1st");
    });
  });

  describe("handlebars_helpers", function() {
    it("should format dates", function() {
      var str = templateHelpers.date();
      expect(str).toMatch(/\w+ \w+ \d+, \d+:\d+ \w+/);
      str = templateHelpers.date({});
      expect(str).toMatch(/\w+ \w+ \d+, \d+:\d+ \w+/);

      var date = new Date(0 + ((new Date()).getTimezoneOffset() * 1000 * 60));
      var date_string = window.moment(date).format("MMMM Do YYYY, h:mm a");
      expect(templateHelpers.date(date, {})).toEqual(date_string);
    });
    it("should handle date_ago", function() {
      var date = new Date();
      var str = templateHelpers.date_ago(date);
      expect(str).toEqual("a few seconds ago");
      date = new Date((new Date()).getTime() - (1000 * 60 * 5));
      str = templateHelpers.date_ago(date);
      expect(str).toEqual("5 minutes ago");
    });

    it("should handle date helper with js and ruby timestamps", function() {
      expect('test').toEqual('todo');
    });

    it("should handle t (translation)", function() {
      var str = templateHelpers.t("happiness", {});
      expect(str.string).toEqual("happiness");

      str = templateHelpers.t("%{type} cow", {hash: {type: "happy"}, hashTypes: {}});
      expect(str.string).toEqual("happy cow");

      str = templateHelpers.t("%{num} cow", {hash: {num: 0}, hashTypes: {}});
      expect(str.string).toEqual("0 cow");
    });
    it("should not escape HTML in translation template (trusted locale strings)", function() {
      var str = templateHelpers.t("happi<b>ness</b>", {});
      expect(str.string).toEqual("happi<b>ness</b>");
    });
    it("should escape HTML in interpolated values to prevent XSS", function() {
      var str = templateHelpers.t("Hello %{name}", {hash: {name: '<script>alert(1)</script>'}, hashTypes: {}});
      expect(str.string).toEqual("Hello &lt;script&gt;alert(1)&lt;/script&gt;");
      str = templateHelpers.t("Org: %{org}", {hash: {org: '<img src=x onerror=alert(1)>'}, hashTypes: {}});
      expect(str.string).toEqual("Org: &lt;img src=x onerror=alert(1)&gt;");
    });
    it("should increment t number value if specified", function() {
      var str = templateHelpers.t("%{hat} cow", {hash: {hat: 0, increment: 'hat'}, hashTypes: {}});
      expect(str.string).toEqual("1 cow");

      str = templateHelpers.t("cow", {hash: {count: 1, increment: 'count'}, hashTypes: {}});
      expect(str.string).toEqual("2 cows");
    });

    it("should format time strings", function() {
      var str = templateHelpers.duration(null);
      expect(str).toEqual("");

      str = templateHelpers.duration(0);
      expect(str).toEqual("");

      str = templateHelpers.duration(-5);
      expect(str).toEqual("");

      str = templateHelpers.duration(5);
      expect(str).toEqual("0:05");

      str = templateHelpers.duration(23);
      expect(str).toEqual("0:23");

      str = templateHelpers.duration(90);
      expect(str).toEqual("1:30");

      str = templateHelpers.duration(3923);
      expect(str).toEqual("1:05:23");
    });

  });

  describe("t", function() {
    it("should return the entered string", function() {
      expect(i18n.t('key', "I like you")).toEqual("I like you");
      expect(i18n.t('key', "I like you a lot")).toEqual("I like you a lot");
      expect(i18n.t('key', "I like you", {})).toEqual("I like you");
    });
    it("should properly handle a count argument", function() {
      expect(i18n.t('horse', "horse", {hash: {count: 1}})).toEqual("1 horse");
      expect(i18n.t('horse', "horse", {hash: {count: 0}})).toEqual("0 horses");
      expect(i18n.t('horse', "horse", {hash: {count: 2}})).toEqual("2 horses");
    });
    it("should properly substitute variables", function() {
      expect(i18n.t('crab', "The crab is %{color}", {hash: {color: "yellow"}, hashTypes: {}})).toEqual("The crab is yellow");
      expect(i18n.t('crab', "The crab is %{color}", {hash: {color: "green"}, hashTypes: {}})).toEqual("The crab is green");
      expect(i18n.t('crab', "The crab is %{color}", {})).toEqual("The crab is %{color}");

      var context = EmberObject.create({crab_color: "white"});
      expect(i18n.t('crab', "The crab is %{color}", {hash: {color: "crab_color"}, hashTypes: {color: 'ID'}, hashContexts: {color: context}})).toEqual("The crab is white");
    });
    it("should handle multiple parameters", function() {
      expect(i18n.t('something', "This is %{n} of %{m} for me!", {n: 5, m: 'ice cream'})).toEqual("This is 5 of ice cream for me!");
    });
  });

  describe("verb negation", function() {
    it("should properly negate verbs", function() {
      expect(i18n.verb_negation('is')).toEqual("isn't");
      expect(i18n.verb_negation('am')).toEqual("am not");
      expect(i18n.verb_negation('was')).toEqual("wasn't");
      expect(i18n.verb_negation('were')).toEqual("weren't");
      expect(i18n.verb_negation('do')).toEqual("don't");
      expect(i18n.verb_negation('does')).toEqual("doesn't");
      expect(i18n.verb_negation('did')).toEqual("didn't");
      expect(i18n.verb_negation('have')).toEqual("haven't");
      expect(i18n.verb_negation('has')).toEqual("hasn't");
      expect(i18n.verb_negation('had')).toEqual("hadn't");
      expect(i18n.verb_negation('can')).toEqual("can't");
      expect(i18n.verb_negation('could')).toEqual("couldn't");
      expect(i18n.verb_negation('will')).toEqual("won't");
      expect(i18n.verb_negation('would')).toEqual("wouldn't");
      expect(i18n.verb_negation('may')).toEqual("mayn't");
      expect(i18n.verb_negation('might')).toEqual("mightn't");
      expect(i18n.verb_negation('must')).toEqual("mustn't");
      expect(i18n.verb_negation('shall')).toEqual("shan't");
      expect(i18n.verb_negation('should')).toEqual("shouldn't");
      expect(i18n.verb_negation('are')).toEqual("aren't");
      expect(i18n.verb_negation('laugh')).toEqual("not laugh");
      expect(i18n.verb_negation('jump')).toEqual("not jump");
      expect(i18n.verb_negation('be')).toEqual("not be");
      expect(i18n.verb_negation('been')).toEqual("not been");
      expect(i18n.verb_negation('being')).toEqual("not being");
    });
  });

  describe("tense", function() {
    it("should properly tensify a present-participle", function() {
      expect(i18n.tense('laugh', {present_participle: true})).toEqual("laughing");
      expect(i18n.tense('know', {present_participle: true})).toEqual("knowing");
      expect(i18n.tense('fix', {present_participle: true})).toEqual("fixing");
      expect(i18n.tense('rush', {present_participle: true})).toEqual("rushing");
      expect(i18n.tense('pass', {present_participle: true})).toEqual("passing");
      expect(i18n.tense('pit', {present_participle: true})).toEqual("pitting");
      expect(i18n.tense('begin', {present_participle: true})).toEqual("beginning");
      expect(i18n.tense('control', {present_participle: true})).toEqual("controlling");
      expect(i18n.tense('contemplate', {present_participle: true})).toEqual("contemplating");
      expect(i18n.tense('care', {present_participle: true})).toEqual("caring");
      expect(i18n.tense('bury', {present_participle: true})).toEqual("burying");
      expect(i18n.tense('hit', {present_participle: true})).toEqual("hitting");
      expect(i18n.tense('bus', {present_participle: true})).toEqual("bussing");
      expect(i18n.tense('play', {present_participle: true})).toEqual("playing");
      expect(i18n.tense('stay', {present_participle: true})).toEqual("staying");
      expect(i18n.tense('pray', {present_participle: true})).toEqual("praying");
      expect(i18n.tense('log', {present_participle: true})).toEqual("logging");

      expect(i18n.tense('become', {present_participle: true})).toEqual("becoming");
      expect(i18n.tense('begin', {present_participle: true})).toEqual("beginning");
      expect(i18n.tense('break', {present_participle: true})).toEqual("breaking");
      expect(i18n.tense('bring', {present_participle: true})).toEqual("bringing");
      expect(i18n.tense('build', {present_participle: true})).toEqual("building");
      expect(i18n.tense('buy', {present_participle: true})).toEqual("buying");
      expect(i18n.tense('catch', {present_participle: true})).toEqual("catching");
      expect(i18n.tense('choose', {present_participle: true})).toEqual("choosing");
      expect(i18n.tense('come', {present_participle: true})).toEqual("coming");
      expect(i18n.tense('cost', {present_participle: true})).toEqual("costing");
      expect(i18n.tense('do', {present_participle: true})).toEqual("doing");
      expect(i18n.tense('draw', {present_participle: true})).toEqual("drawing");
      expect(i18n.tense('drink', {present_participle: true})).toEqual("drinking");
      expect(i18n.tense('drive', {present_participle: true})).toEqual("driving");
      expect(i18n.tense('eat', {present_participle: true})).toEqual("eating");
      expect(i18n.tense('fall', {present_participle: true})).toEqual("falling");
      expect(i18n.tense('feed', {present_participle: true})).toEqual("feeding");
      expect(i18n.tense('feel', {present_participle: true})).toEqual("feeling");
      expect(i18n.tense('fight', {present_participle: true})).toEqual("fighting");
      expect(i18n.tense('find', {present_participle: true})).toEqual("finding");
      expect(i18n.tense('fly', {present_participle: true})).toEqual("flying");
      expect(i18n.tense('forget', {present_participle: true})).toEqual("forgetting");
      expect(i18n.tense('forgive', {present_participle: true})).toEqual("forgiving");
      expect(i18n.tense('get', {present_participle: true})).toEqual("getting");
      expect(i18n.tense('give', {present_participle: true})).toEqual("giving");
      expect(i18n.tense('go', {present_participle: true})).toEqual("going");
      expect(i18n.tense('grow', {present_participle: true})).toEqual("growing");
      expect(i18n.tense('have', {present_participle: true})).toEqual("having");
      expect(i18n.tense('hear', {present_participle: true})).toEqual("hearing");
      expect(i18n.tense('hide', {present_participle: true})).toEqual("hiding");
      expect(i18n.tense('hit', {present_participle: true})).toEqual("hitting");
      expect(i18n.tense('hold', {present_participle: true})).toEqual("holding");
      expect(i18n.tense('know', {present_participle: true})).toEqual("knowing");
      expect(i18n.tense('learn', {present_participle: true})).toEqual("learning");
      expect(i18n.tense('leave', {present_participle: true})).toEqual("leaving");
      expect(i18n.tense('lend', {present_participle: true})).toEqual("lending");
      expect(i18n.tense('let', {present_participle: true})).toEqual("letting");
      expect(i18n.tense('lose', {present_participle: true})).toEqual("losing");
      expect(i18n.tense('make', {present_participle: true})).toEqual("making");
      expect(i18n.tense('mean', {present_participle: true})).toEqual("meaning");
      expect(i18n.tense('meet', {present_participle: true})).toEqual("meeting");
      expect(i18n.tense('pay', {present_participle: true})).toEqual("paying");
      expect(i18n.tense('pat', {present_participle: true})).toEqual("patting");
      expect(i18n.tense('put', {present_participle: true})).toEqual("putting");
      expect(i18n.tense('read', {present_participle: true})).toEqual("reading");
      expect(i18n.tense('ride', {present_participle: true})).toEqual("riding");
      expect(i18n.tense('rise', {present_participle: true})).toEqual("rising");
      expect(i18n.tense('run', {present_participle: true})).toEqual("running");
      expect(i18n.tense('say', {present_participle: true})).toEqual("saying");
      expect(i18n.tense('see', {present_participle: true})).toEqual("seeing");
      expect(i18n.tense('sell', {present_participle: true})).toEqual("selling");
      expect(i18n.tense('send', {present_participle: true})).toEqual("sending");
      expect(i18n.tense('set', {present_participle: true})).toEqual("setting");
      expect(i18n.tense('show', {present_participle: true})).toEqual("showing");
      expect(i18n.tense('sing', {present_participle: true})).toEqual("singing");
      expect(i18n.tense('sit', {present_participle: true})).toEqual("sitting");
      expect(i18n.tense('sleep', {present_participle: true})).toEqual("sleeping");
      expect(i18n.tense('speak', {present_participle: true})).toEqual("speaking");
      expect(i18n.tense('spend', {present_participle: true})).toEqual("spending");
      expect(i18n.tense('stand', {present_participle: true})).toEqual("standing");
      expect(i18n.tense('steal', {present_participle: true})).toEqual("stealing");
      expect(i18n.tense('swim', {present_participle: true})).toEqual("swimming");
      expect(i18n.tense('take', {present_participle: true})).toEqual("taking");
      expect(i18n.tense('teach', {present_participle: true})).toEqual("teaching");
      expect(i18n.tense('tell', {present_participle: true})).toEqual("telling");
      expect(i18n.tense('think', {present_participle: true})).toEqual("thinking");
      expect(i18n.tense('throw', {present_participle: true})).toEqual("throwing");
      expect(i18n.tense('understand', {present_participle: true})).toEqual("understanding");
      expect(i18n.tense('wear', {present_participle: true})).toEqual("wearing");
      expect(i18n.tense('win', {present_participle: true})).toEqual("winning");
      expect(i18n.tense('write', {present_participle: true})).toEqual("writing");
      expect(i18n.tense('walk', {present_participle: true})).toEqual("walking");
      expect(i18n.tense('prefer', {present_participle: true})).toEqual("preferring");
      expect(i18n.tense('accept', {present_participle: true})).toEqual("accepting");
      expect(i18n.tense('right', {present_participle: true})).toEqual("righting");
      expect(i18n.tense('try', {present_participle: true})).toEqual("trying");
      expect(i18n.tense('lie', {present_participle: true})).toEqual("lying");

      expect(i18n.tense('look', {present_participle: true})).toEqual("looking");
      expect(i18n.tense('open', {present_participle: true})).toEqual("opening");
      expect(i18n.tense('need', {present_participle: true})).toEqual("needing");
    });

    it("should properly tensify a simple-past", function() {
      expect(i18n.tense('laugh', {simple_past: true})).toEqual("laughed");
      expect(i18n.tense('know', {simple_past: true})).toEqual("knew");
      expect(i18n.tense('fix', {simple_past: true})).toEqual("fixed");
      expect(i18n.tense('relax', {simple_past: true})).toEqual("relaxed");
      expect(i18n.tense('sit', {simple_past: true})).toEqual("sat");
      expect(i18n.tense('put', {simple_past: true})).toEqual("put");
      expect(i18n.tense('miss', {simple_past: true})).toEqual("missed");
      expect(i18n.tense('admit', {simple_past: true})).toEqual("admitted");
      expect(i18n.tense('like', {simple_past: true})).toEqual("liked");
      expect(i18n.tense('bury', {simple_past: true})).toEqual("buried");
      expect(i18n.tense('hurry', {simple_past: true})).toEqual("hurried");
      expect(i18n.tense('hit', {simple_past: true})).toEqual("hit");
      expect(i18n.tense('bus', {simple_past: true})).toEqual("bussed");
      expect(i18n.tense('play', {simple_past: true})).toEqual("played");
      expect(i18n.tense('stay', {simple_past: true})).toEqual("stayed");
      expect(i18n.tense('pray', {simple_past: true})).toEqual("prayed");
      expect(i18n.tense('dog', {simple_past: true})).toEqual("dogged");
      expect(i18n.tense('red', {simple_past: true})).toEqual("redded");
      expect(i18n.tense('my', {simple_past: true})).toEqual("mied");

      expect(i18n.tense('become', {simple_past: true})).toEqual("became");
      expect(i18n.tense('begin', {simple_past: true})).toEqual("began");
      expect(i18n.tense('break', {simple_past: true})).toEqual("broke");
      expect(i18n.tense('bring', {simple_past: true})).toEqual("brought");
      expect(i18n.tense('build', {simple_past: true})).toEqual("built");
      expect(i18n.tense('buy', {simple_past: true})).toEqual("bought");
      expect(i18n.tense('catch', {simple_past: true})).toEqual("caught");
      expect(i18n.tense('choose', {simple_past: true})).toEqual("chose");
      expect(i18n.tense('come', {simple_past: true})).toEqual("came");
      expect(i18n.tense('cost', {simple_past: true})).toEqual("cost");
      expect(i18n.tense('do', {simple_past: true})).toEqual("did");
      expect(i18n.tense('draw', {simple_past: true})).toEqual("drew");
      expect(i18n.tense('drink', {simple_past: true})).toEqual("drank");
      expect(i18n.tense('drive', {simple_past: true})).toEqual("drove");
      expect(i18n.tense('eat', {simple_past: true})).toEqual("ate");
      expect(i18n.tense('fall', {simple_past: true})).toEqual("fell");
      expect(i18n.tense('feed', {simple_past: true})).toEqual("fed");
      expect(i18n.tense('feel', {simple_past: true})).toEqual("felt");
      expect(i18n.tense('fight', {simple_past: true})).toEqual("fought");
      expect(i18n.tense('find', {simple_past: true})).toEqual("found");
      expect(i18n.tense('fly', {simple_past: true})).toEqual("flew");
      expect(i18n.tense('forget', {simple_past: true})).toEqual("forgot");
      expect(i18n.tense('forgive', {simple_past: true})).toEqual("forgave");
      expect(i18n.tense('get', {simple_past: true})).toEqual("got");
      expect(i18n.tense('give', {simple_past: true})).toEqual("gave");
      expect(i18n.tense('go', {simple_past: true})).toEqual("went");
      expect(i18n.tense('grow', {simple_past: true})).toEqual("grew");
      expect(i18n.tense('have', {simple_past: true})).toEqual("had");
      expect(i18n.tense('hear', {simple_past: true})).toEqual("heard");
      expect(i18n.tense('hide', {simple_past: true})).toEqual("hid");
      expect(i18n.tense('hit', {simple_past: true})).toEqual("hit");
      expect(i18n.tense('hold', {simple_past: true})).toEqual("held");
      expect(i18n.tense('know', {simple_past: true})).toEqual("knew");
      expect(i18n.tense('learn', {simple_past: true})).toEqual("learned");
      expect(i18n.tense('leave', {simple_past: true})).toEqual("left");
      expect(i18n.tense('lend', {simple_past: true})).toEqual("lent");
      expect(i18n.tense('let', {simple_past: true})).toEqual("let");
      expect(i18n.tense('lose', {simple_past: true})).toEqual("lost");
      expect(i18n.tense('make', {simple_past: true})).toEqual("made");
      expect(i18n.tense('mean', {simple_past: true})).toEqual("meant");
      expect(i18n.tense('meet', {simple_past: true})).toEqual("met");
      expect(i18n.tense('pay', {simple_past: true})).toEqual("paid");
      expect(i18n.tense('pat', {simple_past: true})).toEqual("patted");
      expect(i18n.tense('put', {simple_past: true})).toEqual("put");
      expect(i18n.tense('read', {simple_past: true})).toEqual("read");
      expect(i18n.tense('ride', {simple_past: true})).toEqual("rode");
      expect(i18n.tense('rise', {simple_past: true})).toEqual("rose");
      expect(i18n.tense('run', {simple_past: true})).toEqual("ran");
      expect(i18n.tense('say', {simple_past: true})).toEqual("said");
      expect(i18n.tense('see', {simple_past: true})).toEqual("saw");
      expect(i18n.tense('sell', {simple_past: true})).toEqual("sold");
      expect(i18n.tense('send', {simple_past: true})).toEqual("sent");
      expect(i18n.tense('set', {simple_past: true})).toEqual("set");
      expect(i18n.tense('show', {simple_past: true})).toEqual("showed");
      expect(i18n.tense('sing', {simple_past: true})).toEqual("sang");
      expect(i18n.tense('sit', {simple_past: true})).toEqual("sat");
      expect(i18n.tense('sleep', {simple_past: true})).toEqual("slept");
      expect(i18n.tense('speak', {simple_past: true})).toEqual("spoke");
      expect(i18n.tense('spend', {simple_past: true})).toEqual("spent");
      expect(i18n.tense('stand', {simple_past: true})).toEqual("stood");
      expect(i18n.tense('steal', {simple_past: true})).toEqual("stole");
      expect(i18n.tense('swim', {simple_past: true})).toEqual("swam");
      expect(i18n.tense('take', {simple_past: true})).toEqual("took");
      expect(i18n.tense('teach', {simple_past: true})).toEqual("taught");
      expect(i18n.tense('tell', {simple_past: true})).toEqual("told");
      expect(i18n.tense('think', {simple_past: true})).toEqual("thought");
      expect(i18n.tense('throw', {simple_past: true})).toEqual("threw");
      expect(i18n.tense('understand', {simple_past: true})).toEqual("understood");
      expect(i18n.tense('wear', {simple_past: true})).toEqual("wore");
      expect(i18n.tense('win', {simple_past: true})).toEqual("won");
      expect(i18n.tense('write', {simple_past: true})).toEqual("wrote");
      expect(i18n.tense('walk', {simple_past: true})).toEqual("walked");
      expect(i18n.tense('prefer', {simple_past: true})).toEqual("preferred");
      expect(i18n.tense('accept', {simple_past: true})).toEqual("accepted");
      expect(i18n.tense('right', {simple_past: true})).toEqual("righted");
      expect(i18n.tense('try', {simple_past: true})).toEqual("tried");
      expect(i18n.tense('lie', {simple_past: true})).toEqual("lied");

      expect(i18n.tense('look', {simple_past: true})).toEqual("looked");
      expect(i18n.tense('open', {simple_past: true})).toEqual("opened");
      expect(i18n.tense('need', {simple_past: true})).toEqual("needed");

    });

    it("should properly tensify a simple-present", function() {
      expect(i18n.tense('laugh', {simple_present: true})).toEqual("laughs");
      expect(i18n.tense('know', {simple_present: true})).toEqual("knows");
      expect(i18n.tense('fix', {simple_present: true})).toEqual("fixes");
      expect(i18n.tense('relax', {simple_present: true})).toEqual("relaxes");
      expect(i18n.tense('sit', {simple_present: true})).toEqual("sits");
      expect(i18n.tense('put', {simple_present: true})).toEqual("puts");
      expect(i18n.tense('miss', {simple_present: true})).toEqual("misses");
      expect(i18n.tense('admit', {simple_present: true})).toEqual("admits");
      expect(i18n.tense('like', {simple_present: true})).toEqual("likes");
      expect(i18n.tense('bury', {simple_present: true})).toEqual("buries");
      expect(i18n.tense('hurry', {simple_present: true})).toEqual("hurries");
      expect(i18n.tense('hit', {simple_present: true})).toEqual("hits");
      expect(i18n.tense('bus', {simple_present: true})).toEqual("buses");
      expect(i18n.tense('play', {simple_present: true})).toEqual("plays");
      expect(i18n.tense('stay', {simple_present: true})).toEqual("stays");
      expect(i18n.tense('pray', {simple_present: true})).toEqual("prays");
      expect(i18n.tense('cat', {simple_present: true})).toEqual("cats");

      expect(i18n.tense('become', {simple_present: true})).toEqual("becomes");
      expect(i18n.tense('begin', {simple_present: true})).toEqual("begins");
      expect(i18n.tense('break', {simple_present: true})).toEqual("breaks");
      expect(i18n.tense('bring', {simple_present: true})).toEqual("brings");
      expect(i18n.tense('build', {simple_present: true})).toEqual("builds");
      expect(i18n.tense('buy', {simple_present: true})).toEqual("buys");
      expect(i18n.tense('catch', {simple_present: true})).toEqual("catches");
      expect(i18n.tense('choose', {simple_present: true})).toEqual("chooses");
      expect(i18n.tense('come', {simple_present: true})).toEqual("comes");
      expect(i18n.tense('cost', {simple_present: true})).toEqual("costs");
      expect(i18n.tense('do', {simple_present: true})).toEqual("does");
      expect(i18n.tense('draw', {simple_present: true})).toEqual("draws");
      expect(i18n.tense('drink', {simple_present: true})).toEqual("drinks");
      expect(i18n.tense('drive', {simple_present: true})).toEqual("drives");
      expect(i18n.tense('eat', {simple_present: true})).toEqual("eats");
      expect(i18n.tense('fall', {simple_present: true})).toEqual("falls");
      expect(i18n.tense('feed', {simple_present: true})).toEqual("feeds");
      expect(i18n.tense('feel', {simple_present: true})).toEqual("feels");
      expect(i18n.tense('fight', {simple_present: true})).toEqual("fights");
      expect(i18n.tense('find', {simple_present: true})).toEqual("finds");
      expect(i18n.tense('fly', {simple_present: true})).toEqual("flies");
      expect(i18n.tense('forget', {simple_present: true})).toEqual("forgets");
      expect(i18n.tense('forgive', {simple_present: true})).toEqual("forgives");
      expect(i18n.tense('get', {simple_present: true})).toEqual("gets");
      expect(i18n.tense('give', {simple_present: true})).toEqual("gives");
      expect(i18n.tense('go', {simple_present: true})).toEqual("goes");
      expect(i18n.tense('grow', {simple_present: true})).toEqual("grows");
      expect(i18n.tense('have', {simple_present: true})).toEqual("has");
      expect(i18n.tense('hear', {simple_present: true})).toEqual("hears");
      expect(i18n.tense('hide', {simple_present: true})).toEqual("hides");
      expect(i18n.tense('hit', {simple_present: true})).toEqual("hits");
      expect(i18n.tense('hold', {simple_present: true})).toEqual("holds");
      expect(i18n.tense('know', {simple_present: true})).toEqual("knows");
      expect(i18n.tense('learn', {simple_present: true})).toEqual("learns");
      expect(i18n.tense('leave', {simple_present: true})).toEqual("leaves");
      expect(i18n.tense('lend', {simple_present: true})).toEqual("lends");
      expect(i18n.tense('let', {simple_present: true})).toEqual("lets");
      expect(i18n.tense('lose', {simple_present: true})).toEqual("loses");
      expect(i18n.tense('make', {simple_present: true})).toEqual("makes");
      expect(i18n.tense('mean', {simple_present: true})).toEqual("means");
      expect(i18n.tense('meet', {simple_present: true})).toEqual("meets");
      expect(i18n.tense('pay', {simple_present: true})).toEqual("pays");
      expect(i18n.tense('pat', {simple_present: true})).toEqual("pats");
      expect(i18n.tense('put', {simple_present: true})).toEqual("puts");
      expect(i18n.tense('read', {simple_present: true})).toEqual("reads");
      expect(i18n.tense('ride', {simple_present: true})).toEqual("rides");
      expect(i18n.tense('rise', {simple_present: true})).toEqual("rises");
      expect(i18n.tense('run', {simple_present: true})).toEqual("runs");
      expect(i18n.tense('say', {simple_present: true})).toEqual("says");
      expect(i18n.tense('see', {simple_present: true})).toEqual("sees");
      expect(i18n.tense('sell', {simple_present: true})).toEqual("sells");
      expect(i18n.tense('send', {simple_present: true})).toEqual("sends");
      expect(i18n.tense('set', {simple_present: true})).toEqual("sets");
      expect(i18n.tense('show', {simple_present: true})).toEqual("shows");
      expect(i18n.tense('sing', {simple_present: true})).toEqual("sings");
      expect(i18n.tense('sit', {simple_present: true})).toEqual("sits");
      expect(i18n.tense('sleep', {simple_present: true})).toEqual("sleeps");
      expect(i18n.tense('speak', {simple_present: true})).toEqual("speaks");
      expect(i18n.tense('spend', {simple_present: true})).toEqual("spends");
      expect(i18n.tense('stand', {simple_present: true})).toEqual("stands");
      expect(i18n.tense('steal', {simple_present: true})).toEqual("steals");
      expect(i18n.tense('swim', {simple_present: true})).toEqual("swims");
      expect(i18n.tense('take', {simple_present: true})).toEqual("takes");
      expect(i18n.tense('teach', {simple_present: true})).toEqual("teaches");
      expect(i18n.tense('tell', {simple_present: true})).toEqual("tells");
      expect(i18n.tense('think', {simple_present: true})).toEqual("thinks");
      expect(i18n.tense('throw', {simple_present: true})).toEqual("throws");
      expect(i18n.tense('understand', {simple_present: true})).toEqual("understands");
      expect(i18n.tense('wear', {simple_present: true})).toEqual("wears");
      expect(i18n.tense('win', {simple_present: true})).toEqual("wins");
      expect(i18n.tense('write', {simple_present: true})).toEqual("writes");
      expect(i18n.tense('walk', {simple_present: true})).toEqual("walks");
      expect(i18n.tense('prefer', {simple_present: true})).toEqual("prefers");
      expect(i18n.tense('accept', {simple_present: true})).toEqual("accepts");
      expect(i18n.tense('right', {simple_present: true})).toEqual("rights");
      expect(i18n.tense('try', {simple_present: true})).toEqual("tries");
      expect(i18n.tense('lie', {simple_present: true})).toEqual("lies");

      expect(i18n.tense('look', {simple_present: true})).toEqual("looks");
      expect(i18n.tense('open', {simple_present: true})).toEqual("opens");
      expect(i18n.tense('need', {simple_present: true})).toEqual("needs");
    });

    it("should properly tensify a past-participle", function() {
      expect(i18n.tense('laugh', {past_participle: true})).toEqual("laughed");
      expect(i18n.tense('know', {past_participle: true})).toEqual("known");
      expect(i18n.tense('box', {past_participle: true})).toEqual("boxed");
      expect(i18n.tense('commit', {past_participle: true})).toEqual("committed");
      expect(i18n.tense('bury', {past_participle: true})).toEqual("buried");
      expect(i18n.tense('hurry', {past_participle: true})).toEqual("hurried");
      expect(i18n.tense('hit', {past_participle: true})).toEqual("hit");
      expect(i18n.tense('bus', {past_participle: true})).toEqual("bussed");
      expect(i18n.tense('play', {past_participle: true})).toEqual("played");
      expect(i18n.tense('stay', {past_participle: true})).toEqual("stayed");
      expect(i18n.tense('pray', {past_participle: true})).toEqual("prayed");
      expect(i18n.tense('bucket', {past_participle: true})).toEqual("bucketted");
      expect(i18n.tense('cat', {past_participle: true})).toEqual("catted");
      expect(i18n.tense('I', {past_participle: true})).toEqual("Ied");

      expect(i18n.tense('become', {past_participle: true})).toEqual("become");
      expect(i18n.tense('begin', {past_participle: true})).toEqual("begun");
      expect(i18n.tense('break', {past_participle: true})).toEqual("broken");
      expect(i18n.tense('bring', {past_participle: true})).toEqual("brought");
      expect(i18n.tense('build', {past_participle: true})).toEqual("built");
      expect(i18n.tense('buy', {past_participle: true})).toEqual("bought");
      expect(i18n.tense('catch', {past_participle: true})).toEqual("caught");
      expect(i18n.tense('choose', {past_participle: true})).toEqual("chosen");
      expect(i18n.tense('come', {past_participle: true})).toEqual("come");
      expect(i18n.tense('cost', {past_participle: true})).toEqual("cost");
      expect(i18n.tense('do', {past_participle: true})).toEqual("done");
      expect(i18n.tense('draw', {past_participle: true})).toEqual("drawn");
      expect(i18n.tense('drink', {past_participle: true})).toEqual("drunk");
      expect(i18n.tense('drive', {past_participle: true})).toEqual("driven");
      expect(i18n.tense('eat', {past_participle: true})).toEqual("eaten");
      expect(i18n.tense('fall', {past_participle: true})).toEqual("fallen");
      expect(i18n.tense('feed', {past_participle: true})).toEqual("fed");
      expect(i18n.tense('feel', {past_participle: true})).toEqual("felt");
      expect(i18n.tense('fight', {past_participle: true})).toEqual("fought");
      expect(i18n.tense('find', {past_participle: true})).toEqual("found");
      expect(i18n.tense('fly', {past_participle: true})).toEqual("flown");
      expect(i18n.tense('forget', {past_participle: true})).toEqual("forgotten");
      expect(i18n.tense('forgive', {past_participle: true})).toEqual("forgiven");
      expect(i18n.tense('get', {past_participle: true})).toEqual("gotten");
      expect(i18n.tense('give', {past_participle: true})).toEqual("given");
      expect(i18n.tense('go', {past_participle: true})).toEqual("gone");
      expect(i18n.tense('grow', {past_participle: true})).toEqual("grown");
      expect(i18n.tense('have', {past_participle: true})).toEqual("had");
      expect(i18n.tense('hear', {past_participle: true})).toEqual("heard");
      expect(i18n.tense('hide', {past_participle: true})).toEqual("hidden");
      expect(i18n.tense('hit', {past_participle: true})).toEqual("hit");
      expect(i18n.tense('hold', {past_participle: true})).toEqual("held");
      expect(i18n.tense('know', {past_participle: true})).toEqual("known");
      expect(i18n.tense('learn', {past_participle: true})).toEqual("learned");
      expect(i18n.tense('leave', {past_participle: true})).toEqual("left");
      expect(i18n.tense('lend', {past_participle: true})).toEqual("lent");
      expect(i18n.tense('let', {past_participle: true})).toEqual("let");
      expect(i18n.tense('lose', {past_participle: true})).toEqual("lost");
      expect(i18n.tense('make', {past_participle: true})).toEqual("made");
      expect(i18n.tense('mean', {past_participle: true})).toEqual("meant");
      expect(i18n.tense('meet', {past_participle: true})).toEqual("met");
      expect(i18n.tense('pay', {past_participle: true})).toEqual("paid");
      expect(i18n.tense('pat', {past_participle: true})).toEqual("patted");
      expect(i18n.tense('put', {past_participle: true})).toEqual("put");
      expect(i18n.tense('read', {past_participle: true})).toEqual("read");
      expect(i18n.tense('ride', {past_participle: true})).toEqual("ridden");
      expect(i18n.tense('rise', {past_participle: true})).toEqual("risen");
      expect(i18n.tense('run', {past_participle: true})).toEqual("run");
      expect(i18n.tense('say', {past_participle: true})).toEqual("said");
      expect(i18n.tense('see', {past_participle: true})).toEqual("seen");
      expect(i18n.tense('sell', {past_participle: true})).toEqual("sold");
      expect(i18n.tense('send', {past_participle: true})).toEqual("sent");
      expect(i18n.tense('set', {past_participle: true})).toEqual("set");
      expect(i18n.tense('show', {past_participle: true})).toEqual("shown");
      expect(i18n.tense('sing', {past_participle: true})).toEqual("sung");
      expect(i18n.tense('sit', {past_participle: true})).toEqual("sat");
      expect(i18n.tense('sleep', {past_participle: true})).toEqual("slept");
      expect(i18n.tense('speak', {past_participle: true})).toEqual("spoken");
      expect(i18n.tense('spend', {past_participle: true})).toEqual("spent");
      expect(i18n.tense('stand', {past_participle: true})).toEqual("stood");
      expect(i18n.tense('steal', {past_participle: true})).toEqual("stolen");
      expect(i18n.tense('swim', {past_participle: true})).toEqual("swum");
      expect(i18n.tense('take', {past_participle: true})).toEqual("taken");
      expect(i18n.tense('teach', {past_participle: true})).toEqual("taught");
      expect(i18n.tense('tell', {past_participle: true})).toEqual("told");
      expect(i18n.tense('think', {past_participle: true})).toEqual("thought");
      expect(i18n.tense('throw', {past_participle: true})).toEqual("thrown");
      expect(i18n.tense('understand', {past_participle: true})).toEqual("understood");
      expect(i18n.tense('wear', {past_participle: true})).toEqual("worn");
      expect(i18n.tense('win', {past_participle: true})).toEqual("won");
      expect(i18n.tense('write', {past_participle: true})).toEqual("written");
      expect(i18n.tense('walk', {past_participle: true})).toEqual("walked");
      expect(i18n.tense('prefer', {past_participle: true})).toEqual("preferred");
      expect(i18n.tense('accept', {past_participle: true})).toEqual("accepted");
      expect(i18n.tense('right', {past_participle: true})).toEqual("righted");
      expect(i18n.tense('try', {past_participle: true})).toEqual("tried");
      expect(i18n.tense('lie', {past_participle: true})).toEqual("lied");

      expect(i18n.tense('look', {past_participle: true})).toEqual("looked");
      expect(i18n.tense('open', {past_participle: true})).toEqual("opened");
      expect(i18n.tense('need', {past_participle: true})).toEqual("needed");
    });
  });

  describe("seconds_ago", function() {
    it("should return correct values", function() {
      expect(templateHelpers.seconds_ago(12)).toEqual("12 seconds");
      expect(templateHelpers.seconds_ago(1)).toEqual("1 second");
      expect(templateHelpers.seconds_ago(0)).toEqual("");
      expect(templateHelpers.seconds_ago(100)).toEqual("1.7 minutes");
      expect(templateHelpers.seconds_ago(5000)).toEqual("1.4 hours");
      expect(templateHelpers.seconds_ago(12600)).toEqual("3.5 hours");
      expect(templateHelpers.seconds_ago(270000)).toEqual("75 hours");
      expect(templateHelpers.seconds_ago(345800)).toEqual("96.1 hours");
      expect(templateHelpers.seconds_ago(691800)).toEqual("192.2 hours");
      expect(templateHelpers.seconds_ago(1382990)).toEqual("384.2 hours");
      expect(templateHelpers.seconds_ago(2851200)).toEqual("792 hours");
      expect(templateHelpers.seconds_ago(8553600)).toEqual("2,376 hours");
      expect(templateHelpers.seconds_ago(17280000)).toEqual("4,800 hours");
      expect(templateHelpers.seconds_ago(3801999)).toEqual("1,056 hours");
      expect(templateHelpers.seconds_ago(3801500)).toEqual("1,056 hours");
      expect(templateHelpers.seconds_ago(86400)).toEqual("24 hours");
      expect(templateHelpers.seconds_ago(86401)).toEqual("24 hours");
      expect(templateHelpers.seconds_ago(86399)).toEqual("24 hours");
      expect(templateHelpers.seconds_ago(100, 'long')).toEqual("1.7 minutes");
      expect(templateHelpers.seconds_ago(5000, 'long')).toEqual("1.4 hours");
      expect(templateHelpers.seconds_ago(12600, 'long')).toEqual("3.5 hours");
      expect(templateHelpers.seconds_ago(270000, 'long')).toEqual("3 days");
      expect(templateHelpers.seconds_ago(345800, 'long')).toEqual("4 days");
      expect(templateHelpers.seconds_ago(691800, 'long')).toEqual("1.1 weeks");
      expect(templateHelpers.seconds_ago(1382990, 'long')).toEqual("2.3 weeks");
      expect(templateHelpers.seconds_ago(2851200, 'long')).toEqual("4.7 weeks");
      expect(templateHelpers.seconds_ago(8553600, 'long')).toEqual("3.3 months");
      expect(templateHelpers.seconds_ago(17280000, 'long')).toEqual("6.7 months");
      expect(templateHelpers.seconds_ago(3801999, 'long')).toEqual("6.3 weeks");
      expect(templateHelpers.seconds_ago(3801500, 'long')).toEqual("6.3 weeks");
      expect(templateHelpers.seconds_ago(86400, 'long')).toEqual("1 day");
      expect(templateHelpers.seconds_ago(86401, 'long')).toEqual("1 day");
      expect(templateHelpers.seconds_ago(86399, 'long')).toEqual("1 day");
    });
  });
  describe("date", function() {
    it("should return the correct value", function() {
      var d = new Date(1474326397835);
      expect(templateHelpers.date(d, 'day')).toEqual('September 19th 2016');
      expect(templateHelpers.date(d, 'short_day')).toEqual('Sep 19th 2016');
      expect(templateHelpers.date(d, 'whatever')).toEqual('September 19th 2016, 5:06 pm');
    });
  });

  describe("delimit", function() {
    it("should return correct values", function() {
      expect(templateHelpers.delimit(0.0432)).toEqual("0.0432");
      expect(templateHelpers.delimit(12.999)).toEqual("12.999");
      expect(templateHelpers.delimit(999.998)).toEqual("999.998");
      expect(templateHelpers.delimit(1024.324)).toEqual("1,024");
      expect(templateHelpers.delimit(5000.0004)).toEqual("5,000");
      expect(templateHelpers.delimit(999999.987)).toEqual("999,999");
      expect(templateHelpers.delimit(123456789)).toEqual("123,456k");
      expect(templateHelpers.delimit(123456789, 'full')).toEqual("123,456,789");
    });
  });

  describe("safe", function() {
    it("should return safe text", function() {
      var res = templateHelpers.safe('something <b>cool</b>');
      expect(res.string).toEqual('something <b>cool</b>');
    });
    it("should strip html if specified", function() {
      var res = templateHelpers.safe('something <b>cool</b>', 'stripped');
      expect(res.string).toEqual('something cool');
    });
  });

  describe("readable_language", function() {
    it("should return unknown if no locale specified", function() {
      expect(i18n.readable_language(null)).toEqual("Unknown Language");
      expect(i18n.readable_language('bacon')).toEqual('Unknown Language');
    });

    it("should match known locales", function() {
      var locales = {
        nyn_UG: "Nyankole (Uganda)",
        or_IN: "Oriya (India)",
        om_KE: "Oromo (Kenya)",
        ps_AF: "Pashto (Afghanistan)",
        fa_IR: "Persian (Iran)",
        pt_GW: "Portuguese (Guinea-Bissau)",
        pa_Arab_PK: "Punjabi (Arabic, Pakistan)",
        ro_RO: "Romanian (Romania)",
        ru_RU: "Russian (Russia)",
        ii_CN: "Sichuan Yi (China)",
        sl_SI: "Slovenian (Slovenia)",
        so_ET: "Somali (Ethiopia)",
        es_CR: "Spanish (Costa Rica)",
        es_MX: "Spanish (Mexico)",
        sw_TZ: "Swahili (Tanzania)",
        ta_IN: "Tamil (India)",
        th_TH: "Thai (Thailand)",
        to_TO: "Tonga (Tonga)"
      };
      for(var key in locales) {
        expect(i18n.readable_language(key)).toEqual(locales[key]);
      }
    });

    it("should match known languages", function() {
      var languages = {
        or: "Oriya",
        ps: "Pashto",
        pl: "Polish",
        pt: "Portuguese",
        rof: "Rombo",
        sg: "Sango",
        sn: "Shona",
        so: "Somali",
        es: "Spanish",
        te: "Telugu",
        tr: "Turkish",
        uk: "Ukrainian"
      };
      for(var key in languages) {
        expect(i18n.readable_language(key)).toEqual(languages[key]);
      }
    });

    it("should match even when case is wrong", function() {
      expect(i18n.readable_language('nYn-ug')).toEqual("Nyankole (Uganda)");
      expect(i18n.readable_language('ES')).toEqual('Spanish');
      expect(i18n.readable_language('RU-ru')).toEqual('Russian (Russia)');
      expect(i18n.readable_language('PA-ARAB-pk')).toEqual('Punjabi (Arabic, Pakistan)');
    });
  });

  describe("translatable_locales", function() {
    it("should return the correct value", function() {
      var res = i18n.get('translatable_locales');
      expect(res.en).toNotEqual(undefined);
      expect(res.en_US).toEqual(undefined);
      expect(res.zh_Hans).toNotEqual(undefined);
      expect(res.zh_Hant).toNotEqual(undefined);
      expect(res.zh).toEqual(undefined);
    });
  });

  describe("text_direction", function() {
    it("should return the correct value", function() {
      expect(i18n.text_direction()).toEqual('ltr');
      expect(i18n.text_direction('ar')).toEqual('rtl');
      expect(i18n.text_direction('ar-BH')).toEqual('rtl');
      expect(i18n.text_direction('fr')).toEqual('ltr');
      expect(i18n.text_direction('he')).toEqual('rtl');
      expect(i18n.text_direction('en-XX')).toEqual('ltr');
    });
  });
});
