// The delayed-save queue behind persistence.store_eventually (issue #1221).
//
// A record fetched from the server is saved to the device a moment later. Loading the same record twice
// in quick succession used to queue two saves, and both were written. A save for a record already
// waiting now takes the waiting one's place, with the newer copy, so the record is written once.
//
// The same record means the same store, record id and key. Fetched records are queued with key null (every
// board) or 'self' (the signed-in user, whose save also records which user is "self"), so the key alone
// would merge different boards. A board's images and sounds are saved as their own records when it is
// written, so an entry carrying them is never replaced, and a record with no id and no key never matches.
function identity(store, obj, key) {
  if(!obj || obj.images || obj.sounds) { return null; }
  var raw = obj[store] || obj;
  var id = raw && raw.id;
  if(!id && !key) { return null; }
  return [store, id, key];
}

export function queue_eventual_store(list, store, obj, key) {
  var mine = identity(store, obj, key);
  if(mine) {
    for(var idx = 0; idx < list.length; idx++) {
      var entry = list[idx];
      var theirs = entry && identity(entry[0], entry[1], entry[2]);
      if(theirs && theirs[0] === mine[0] && theirs[1] === mine[1] && theirs[2] === mine[2]) {
        list[idx] = [store, obj, key, true];
        return;
      }
    }
  }
  list.push([store, obj, key, true]);
}

export default { queue: queue_eventual_store };
