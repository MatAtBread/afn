"use strict";

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
    this._items = [];
}

function iterator() {
    var self = this;
    return {
        next: function () {
            var value ;
            if (self._items.length)
                value = Promise.resolve(self._items.shift()) ;
            else {
                if (!self._ready) {
                    var resolve ;
                    self._ready = new Promise(function(r){
                        self._resolve = r ;
                    }) ;
                }
                value = self._ready ;
            }
            return {
                done: false,
                value: value
            };
        }
    };
}

if (typeof Symbol !== "undefined") {
    AsyncQueue.prototype[Symbol.iterator] = iterator;
} else {
    AsyncQueue.prototype.iterator = iterator;
}

AsyncQueue.prototype.add = function (item) {
    if (!this._items.length && this._ready) {
        var p = this._resolve ;
        delete this._ready ;
        delete this._resolve ;
        p(item) ;
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
