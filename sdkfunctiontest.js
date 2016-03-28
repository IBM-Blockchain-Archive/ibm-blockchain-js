// Function testing the SDK

// Starting out by requiring all dependancies
var test = require('tape');
var Ibc1 = require('ibm-blockchain-js');

// Then define new instances.
var ibc = new Ibc1();
var chaincode = {};

// Define options for ibc.load_chancode
// In this case, this is just defining where to get the blockchain code
var options = {
	zip_url: 'https://github.com/ibm-blockchain/marbles-chaincode/archive/master.zip',
	unzip_dir: 'marbles-chaincode-master/part2', 
	git_url: 'https://github.com/ibm-blockchain/marbles-chaincode/part2', 
	deployed_name: null 
};

// Call the actual function of interest
// ibc.load_chaincode inputs options just spcified, outputs callbackready function
ibc.load_chaincode(options, function cb_ready(err, cc) {
	test('Was the load_chaincode sucessful', function (t) {
		t.error(err, 'There were no errors');
		t.end();
	}); //end test
});  //end load chaincode
