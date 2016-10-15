/* create an queue with async consumption, e.g.

  var q = new AsyncQueue();

  // Handle the AsyncQueue _items asynchronously
  for (var next of q) {
      // Get the next item, waiting if the AsyncQueue is empty
      var obj = await next ;
      // Process the object
  }


  // Add _items, for example on event driven things like http requests or mouse moves
  q.add(object) ;
*/

function AsyncQueue() {
    "use strict";
    this._items = [];
}

AsyncQueue.prototype._setReady = function () {
    var self = this;
    function defer(resolve) {
        self._ready = resolve;
    }

    return new Promise(defer);
};
function iterator() {
    var self = this;
    return {
        next: function () {
            return {
                done: false,
                value: self.value()
            };
        }
    };
}

if (typeof Symbol !== "undefined") {
    AsyncQueue.prototype[Symbol.iterator] = iterator;
} else {
    AsyncQueue.prototype.iterator = iterator;
}
AsyncQueue.prototype.value = function () {
    return this._items.length ? Promise.resolve(this._items.shift()) : this._setReady();
};
AsyncQueue.prototype.add = function (item) {
    if (!this._items.length && this._ready) {
        var resolve = this._ready;
        this._ready = null;
        resolve(item);
    } else {
        this._items.push(item);
    }
};
AsyncQueue.prototype.length = function () {
    return this._items.length;
};
AsyncQueue.prototype.clear = function () {
    this._items = [];
};
module.exports = function(config) {
  return AsyncQueue ;
}
