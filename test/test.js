(function(){

	var async = require('async')
	var assert = require('assert')
	var _ = require('underscore')
	var Taxer = require('../taxer')

	var dbCreds = {
	    client: 'mysql',
	    connection: {
			host: 'localhost',
			user: 'root',
			password: 'root',
			database: 'taxer',
			port:  8889
	    }
	}

	var knex = require('knex')(dbCreds)

	var test = {};
	var taxer;

	test.runTest = function(callbackIn){
		taxer = new Taxer({
			knex: knex,
			tableName: 'test_category',
			useCache: true
		}, function(err){
			if(err){ callbackIn(err); }
			else{ test.runTests(callbackIn) }
		})

	}

	test.runTests = function(callbackIn){

		async.series([
			// empty test table
			function(callback){
				knex('test_category').truncate()
					.then(function(){ callback(); })
					.catch(callback)
			},

			// add top level node
			function(callback){ taxer.add(1, null, callback) },

			// add child of top level node
			function(callback){ taxer.add(2, 1, callback) },

			// add second child
			function(callback){ taxer.add(3, 1, callback) },

			// add sub-child
			function(callback){ taxer.add(4, 2, callback) },

			function(callback){
				taxer.getChildren(1, -1, function(err, children){
					if(err){ callback(err); }
					else{
						assert((children.length === 3), 'Incorrect number of children returned.')
						_.each([2, 3, 4], function(num){
							assert(_.contains(children, num), 'Unexpected children returned')
						})
						console.log(children);
					}

				})
			},

		], callbackIn);
	}

	test.callTest = function(){
		test.runTest(function(err){
			if(err){
				console.log( 'An error occurred: ')
				console.log(err)
			} else {
				console.log('success')
			}
		})
	}

	test.callTest();

	module.exports = test

}())