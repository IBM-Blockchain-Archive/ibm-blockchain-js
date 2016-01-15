var fs = require('fs');
var rest = require(__dirname + "/lib/rest");
var unzip = require("unzip2");

//Globalish
var contract = 	{
		cc: {
			read: null,
			write: null,
			remove: null,
			deploy: null,
			readNames: null,
			details:{
						host: "",
						port: 80,
						path: "",
						url: "",
						name: {},
						func: [],
						vars: []
			}
		}
	};

module.exports = {
  load: function() {
	  var keep_looking = true;
		var temp_dest = __dirname + '/temp';										//	./temp
		var dest = __dirname + '/temp/file.zip';									//	./temp/file.zip
		var unzip_dest = temp_dest + '/unzip';										//	./temp/unzip
		var unzip_cc_dest = unzip_dest + '/' + dir;									//	./temp/unzip/DIRECTORY
		var https = require('https');
		contract.cc.details.url = url;
		contract.cc.details.dir = dir;
		
		// Preflight checklist
		try{fs.mkdirSync(temp_dest);}
		catch(e){}
		fs.access(unzip_cc_dest, cb_file_exists);									//does this shit exist yet?
		function cb_file_exists(e){
			if(e != null){
				download_it();														//nope
			}
			else{
				fs.readdir(unzip_cc_dest, cb_got_names);							//yeppers
			}
		}

		// Step 0.
		function download_it(){
			console.log('[obc-js] downloading zip');
			var file = fs.createWriteStream(dest);
			https.get(url, function(response) {
				response.pipe(file);
				file.on('finish', function() {
					file.close(cb_downloaded);  									//close() is async
				});
			}).on('error', function(err) {
				console.log('[obc-js] error');
				fs.unlink(dest); 													//delete the file async
				if (cb) cb(eFmt('fs error', 500, err.message), contract);
			});
			
			function cb_downloaded(){
				console.log('[obc-js] unzipping zip');
				
				// Step 1.
				//fs.createReadStream(dest).pipe(unzip.Extract({ path: 'temp/unzip' }, fs.readdir(unzip_cc_dest, cb_got_names)));function(){ fixURLbar(item); }
				fs.createReadStream(dest).pipe(unzip.Extract({ path: unzip_dest }, setTimeout(function(){ fs.readdir(unzip_cc_dest, cb_got_names); }, 5000)));	//this sucks, dsh replace
			}
		}
		
		// Step 2.
		function cb_got_names(err, obj){
			console.log('[obc-js] scanning files');
			if(err != null) console.log('[obc-js] Error', err);
			else{
				for(var i in obj){
					//console.log(i, obj[i]);
					
					//GO FILES
					if(obj[i].indexOf('.go') >= 0){
						if(keep_looking){
							fs.readFile(unzip_cc_dest + '/' + obj[i], 'utf8', cb_read_go_file);
						}
					}
				}
			}
		}
		
		function cb_read_go_file(err, str){
			if(err != null) console.log('[obc-js] Error', err);
			else{
				
				// Step 2a.
				var regex = /func\s+\((\w+)\s+\*SimpleChaincode\)\s+Run/i;					//find the variable name that Run is using for simplechaincode pointer
				var res = str.match(regex);
				if(res[1] == null){
					console.log('[obc-js] error did not find variable name in chaincode');
				}
				else{
					keep_looking = false;
					
					// Step 2b.
					var re = new RegExp('\\s' + res[1] + '\\.(\\w+)\\(', "gi");
					res = str.match(re);
					if(res[1] == null){
						console.log('[obc-js] error did not find function names in chaincode');
					}
					else{
						
						// Step 2c.
						for(var i in res){
							var pos = res[i].indexOf('.');
							var temp = res[i].substring(pos + 1, res[i].length - 1);
							console.log('[obc-js] Found func: ', temp);
							populate_go_contract(temp);
						}
						
						// Step 3.
						module.exports.save();
						if(cb) cb(null, contract);
					}
				}
			}
		}
  },
  hello: function() {
	  return "Hi!";
  },
  network: function(arrayPeers){
		if(arrayPeers.constructor !== Array){
			console.log('[obc-js] Error - network arg should be array of peer objects');
		}
		else{
			for(var i in arrayPeers){
				var pos = arrayPeers[i].id.indexOf('_') + 1;
				arrayPeers[i].name = arrayPeers[i].id.substring(pos) + '-' + arrayPeers[i].api_host + ':' + arrayPeers[i].api_port;
				console.log(arrayPeers[i].name);
			}
			var ssl = true;
			contract.cc.details.host = arrayPeers[0].api_host;
			contract.cc.details.port = arrayPeers[0].api_port;
			contract.cc.details.peers = arrayPeers;
			if(arrayPeers[0].api_url.indexOf('https') == -1) ssl = false;				//not https, no tls
			
			rest.init({																	//load default values for rest call to peer
						host: contract.cc.details.host,
						port: contract.cc.details.port,
						headers: {
									"Content-Type": "application/json",
									"Accept": "application/json",
								},
						ssl: ssl,
						quiet: true
			});
		}
	}
}