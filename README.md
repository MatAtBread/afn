# afn

`async function` utilities 

Installation:

	npm i --save afn
	
Inclusion:

	var afn = require('afn')(options) ;
	
Specific calls can be required individually:

	var map = require('afn/map')(mapOptions) ;
	var memo = require('afn/memo')(memoOptions) ;

Contents
--------
  * [map](#map)
  * [memo](#memo)

map
===

"map" works like an aynchronous, parallel object/array mapper, similar to Array.prototype.map() or Promsie.all(). The map function takes three parameters:

* the entity to iterate over,
* optionally an object in which to place the results (they are returned from the async map in any case),
* the async function to call on each iteration.

The function completes when all the aync-iteration function calls have completed (via a return or exception). The order of execution of each async function is not guarenteed. When complete, the async-return is a complementary object or array containing the mapped values as returned asynchronously. If present, the return values are placed into the optional second parameter. If omitted, a new object or array is created to hold the results. The initial argument (the entity to iterate over) can be either:

* An Object - each field is passed to the async-iterator function
* An Array - each element is passed to the async-iterator function
* A single Number - the async function is invoked with the integer values 0 to Number-1
* An array or Object of async functions - each function in the array is invoked asynchronously. In this case the third parameter must be omitted.

### Example: mapping an object

	var map = require('afn/map')() ;

	// Asynchronously map every key in "myObject" by adding 1 to the value of the key
	mapped = await map(myObject,async function(key){
		// This can be async without issues
		return myObject[key]+1 ;
	}) ;
	// All done - mapped contains the new object with all the elements "incremeneted"


### Example: map an array of URLs to their content

	var map = require('afn/map')() ;
	var http = require('async-http-lib') ; // A third party module that does HTTP as async functions

	mapped = await map(['www.google.com','www.bbc.co.uk'],async function(value,index){
		// Get the URL body asynchronously.
		return await http.getBody("http://"+value) ;
	}) ;
	// All done - mapped is the new array containing the bodies

### Example: iterate through a set of integer values and do something asynchronous with each one

	// Use nodent.map & http
	var map = require('afn/map')() ;
	var http = require('async-http-lib') ; // A third party module that does HTTP as async functions

	mapped = await map(3,async function(i){
		// Get the URL body asynchronously.
		return await http.getBody("http://example.com/cgi?test="+i) ;
	}) ;
	// All done - mapped is the new array containing the bodies

### Example: execute arbitrary async functions in parallel and return when they are all complete, just like Promise.all()

	var map = require('afn/map')() ;

	mapped = await map([asyncFn("abc"),asyncFn2("def")]) ;

	// All done - mapped is an new array containing the async-returns

### Example: execute arbitrary labelled async functions in parallel and return when they are all complete

	var map = require('afn/map')() ;

	mapped = await map({for:asyncFn("abc"),bar:asyncFn2("def")}) ;
	console.log(mapped.foo, mapped.bar) ;

	// All done - mapped is an new object containing the async-returns in each named member

In the latter two cases, where there is only an single parameter, the async return value from `map` is a corresponding array or object to the parameter where each member has been resolved if a Promise, or passed through unchanged if not.

The order of execution is not guaranteed (as with all calls to map), but the completion routine will only be called when all async functions have finished either via a return or exception. There is no programmatic limit to the number of async functions that can be passed in the array. Note that the functions have no useful parameters (use a closure or wrap the function if necessary).

Exceptions in mapped functions
------------------------------
By default, in the event of an error or exception in the async-mapping function, the error value is substitued in the mapped object or array. This works well since all the exceptions will be instances of the JavaScript Error() type, and so they can be easily tested for in the mapped object after completion.

Alternatively, if instantiated with the option `throwOnError`, if any of the async invocations throw an exception, `map()` will throw a MapError() when all the functions have completed, with a member called `results` containing the other results. To use this option:

	var map = require('afn/map')({throwOnError:true}) ;

Instances of 'map' are independent of each other - you can require() both the throwing and non-throwing version in different modules, or the same module as different variables.

memo
====
	
	const memoizedFunction = afn.memo(_asyncFunction_, {
		ttl:0,					/* Maximum time in milliseconds to memoize the result */
		key:function(self,		/* The 'this' value passed to the asyncFunction */
			args,				/* The 'arguments' option passed to the asyncFunction */
			asyncFunction) {	/* The original 'afn' value */
				/* Return an object that disambigutes between calls. The default implementation is all 
				enumerable values within self and args. Returning 'undefined' means don't cache */
				return {args:args,self:self} ;
			}  
	}) ;


The returned memoizedFunction is an `async function` with the same signature as `_asyncFunction_`. It also has the an additional member function (not async) that clears the cache for subsequent calls:

	// Clear the cache for a specific function
	memoizedFunction.clearCache() ;
	// This will always call the underlying _asyncFunction_
	await memoizedFunction(...)


### Example

	// An expensive function that retrieves user details from a database
	async function fetchAndDisplayUserInfo(userid,element) { ... }
	
	// Memoize it based only on the userid - the destination HTML element doesn't matter
	const displayUserInfo = afn.memo(fetchAndDisplayUserInfo,{
		ttl:10*60*1000,	// Cache for 10 minutes
		key(self,args,fn){
			return args[0] ; // Don't care about 'element', or the value of 'this'
		}
	})
	
		...
		
	await displayUserInfo(id,document.getElementById("user-info"))
	// Subsequent calls to displayUserInfo with the same id within 10 minutes will produce the same result

