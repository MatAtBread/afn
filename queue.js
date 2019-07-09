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
    if (!(this instanceof AsyncQueue))
        return new AsyncQueue() ;
    this._items = [];
    this._pending = [];
}

function deferred() {
    var resolve, reject, p = new Promise(function(_resolve, _reject){
        resolve = _resolve;
        reject = _reject;
    });
    return Object.defineProperties(p,{
        resolve:{
            value:resolve,
            enumerable:false
        },
        reject:{
            value:reject,
            enumerable:false
        }
    })
}

function iterator() {
    var self = this;
    return {
        next: function () {
            var value ;
            if (self._items.length)
                value = Promise.resolve(self._items.shift()) ;
            else {
                value = deferred() ;
                self._pending.push(value);
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
    if (item && typeof item.then === "function") {
        item.then(this.add.bind(this));
        return;
    }
    if (this._pending.length) {
        this._pending.shift().resolve(item);
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
