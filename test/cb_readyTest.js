// Function testing the SDK
// This file contains the most recent tests still being developed.
console.log("Now starting cb_readyTeats.js");

// Starting out by requiring all dependancies
var test = require('tape');
var Ibc1 = require('..');

// Then define new instances that will be needed
var ibc = new Ibc1();
var chaincode = {};

// configure ibc-js sdk by defining options
var options = {

	// Set existant network credentials
	// Create a network on Bluemix Experimental BlockChain offering
	// Service Credentials are found under the Blockchain instance tab.
	
	network:{ peers: [{
		"api_host": "3f3fa6c3-a8b4-48b2-95bc-63b5058fa333_vp1-api.blockchain.ibm.com",
		"api_port": "80",
		"id": "3f3fa6c3-a8b4-48b2-95bc-63b5058fa333_vp1", 
		"api_url": "http://3f3fa6c3-a8b4-48b2-95bc-63b5058fa333_vp1-api.blockchain.ibm.com:80"
	}],

	// For simplicity, I chose the first user on the list provided.
	users: [{
		"username": "user_type0_52737ec3c6",
		"secret": "4841d68d27",
		"enrollId":"user_type0_52737ec3c6",
		"enrollSecret":"4841d68d27"		
	}] }, 

	// The chaincode version being tested here is the one deployed in Marbles2.
	chaincode:{
		zip_url: 'https://github.com/ibm-blockchain/marbles-chaincode/archive/master.zip', 
		unzip_dir: 'marbles-chaincode-master/part2',
		git_url: 'https://github.com/ibm-blockchain/marbles-chaincode/part2'
    } 
};

test('Was the load_chaincode sucessful', function (t) {
// Load the Marbles2 chaincode, with defined options, and return call-back-when-ready function.
	ibc.load(options, cb_ready);

	// Define the call-back-when-ready function returned above
	// call-back-when-ready function has err
	function cb_ready(err, cc){
	//response has chaincode functions
	
		t.error(err, 'There were no errors');

	// if the deployed name is blank, then chaincode has not been deployed
		if(cc.details.deployed_name === ""){ 
        	cc.deploy('init', ['99'], './cc_summaries', cb_deployed);
        	function cb_deployed(err){
				t.error(err, 'There were no errors');
				console.log('sdk has deployed code and waited');
			};	
  		} 
  		else{
  			console.log('chaincode summary file indicates chaincode has been previously deployed');	
		};
	}
	t.end();
});
