// Function testing the SDK
// Logging statement to terminal to indicate which test is running.
console.log("Now starting LoadTest.js");

// Starting out by requiring all dependancies
var test = require('tape');
var Ibc1 = require('..');

// Then define new instances.
var ibc = new Ibc1();
var chaincode = {};

// Define a flag which determines whether to use Valid or Invalid Options for the test.
// V = Valid, I = Invalid
var Flag = "I";

// Define options for ibc.load_chancode, where to get the blockchain code
// Made this an if/then flagged option to decide which option set to use.
if (Flag == "V") {
	var options = {
		zip_url: 'https://github.com/ibm-blockchain/marbles-chaincode/archive/master.zip',
		unzip_dir: 'marbles-chaincode-master/part2', 
		git_url: 'https://github.com/ibm-blockchain/marbles-chaincode/part2', 
		deployed_name: null 
	};
} 
else {
// Define some options with a bad zip_url to see how the sdk catches it.
	var options = {
		zip_url: 'https://github.com/ibm-lockchain/marbles-chaincode/archive/master.zip',
		unzip_dir: 'marbles-chaincode-master/part2', 
		git_url: 'https://github.com/ibm-blockchain/marbles-chaincode/part2', 
		deployed_name: null 
	};
}

// I need to create just one test, and run ibc.load inside of it.
// I put the tests into an if/then with the Flag for options.
test('Was the load_chaincode sucessful', function (t) {
	if (Flag == "V") {
		ibc.load_chaincode(options, function cb_ready(err, cc) {
			t.error(err, 'There were no errors');
		});  // End of the Valid Load Test
	}
	else {
        ibc.load_chaincode(options, function cb_ready(err, cc) {
            t.equal(err, 'Invalid or unsupported zip format. No END header found', 'The error message was unexpected.')
        })        
    }
	t.end();  //End Testing
});