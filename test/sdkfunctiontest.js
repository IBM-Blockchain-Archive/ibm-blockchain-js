// Function testing the SDK
// This file contains the most recent tests still being developed.

// Starting out by requiring all dependancies
var test = require('tape');
var Ibc1 = require('ibm-blockchain-js');

// Then define new instances that will be needed
var ibc = new Ibc1();
var chaincode = {};

// configure ibc-js sdk by defining options
var options = {

	// Set existant network credentials
	// Create a network on Bluemix Experimental BlockChain offering
	// Service Credentials are found under the Blockchain instance tab.
	
	network:{ peers: [{
		"api_host": "169.44.63.210",
		"api_port": "45937",
		"id": "cd750ebe-60cf-493d-907f-9ddf6202d6bd_vp1", 
		"api_url": "http://169.44.63.210:45937"
	}],

	// For simplicity, I chose the first user on the list provided.
	users: [{
		"username": "user_type0_2a590b0f89",
		"secret": "c008a51fbc" 
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
			t.end();
		}; //end test
			
  	} 
  	else{
  		console.log('chaincode summary file indicates chaincode has been previously deployed');
		t.end();
		
		
	};
}
});
