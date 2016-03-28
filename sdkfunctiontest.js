// Function testing the SDK

// Starting out by requiring all dependancies
var test = require('tape');
var Ibc1 = require('ibm-blockchain-js');

// Then define new instances.
var ibc = new Ibc1();
var chaincode = {};

// Define the cb_ready (call back when ready) function
var cb_ready = function cb_ready(err, cc) {};

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
ibc.load_chaincode(options, cb_ready);

// Write a test to check if the load function was successful
test('Was the load_chaincode sucessful', function (t) {
	var actual = err;
	var expected = '';
	t.equal(actual, expected, 'should pass if there are no errors');
	t.end();
 });