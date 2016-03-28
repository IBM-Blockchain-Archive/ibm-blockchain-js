var test = require('tape');
var Ibc1 = require('ibm-blockchain-js');
var ibc = new Ibc1();
var chaincode = {};

var options = {
	zip_url: 'https://github.com/ibm-blockchain/marbles-chaincode/archive/master.zip',
	unzip_dir: 'marbles-chaincode-master/part2', 
	git_url: 'https://github.com/ibm-blockchain/marbles-chaincode/part2', 
	deployed_name: null 
};

ibc.load_chaincode(options, cb_ready);

test('Was the load_chaincode sucessful', function (t) {
	var actual = cb_ready;
	var expected = '';
	t.equal(actual, expected, 'should pass if cb_ready is empty string');
	t.end();
});