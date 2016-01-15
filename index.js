var fs = require('fs');
var rest = require(__dirname + "/lib/rest");
var unzip = require("unzip2");

//Globalish
var contract = 	{
		cc: {
			read: read,
			write: write,
			remove: remove,
			deploy: deploy,
			readNames: readNames,
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
  hello: function() {
	  return "Hi!";
  },
  network = function(arrayPeers){
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