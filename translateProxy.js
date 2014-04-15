var request = require('request'),
    crc32 = require('buffer-crc32'),
    fs = require('fs'),
    path = require('path'),
    extend = require('extend'),
    http = require('http'),
    gnosis = require('gnosis')(),
    url = require('url');

var proxy = module.exports = function(state){
    this.state = state;
    this.state.jsonPath = path.join(this.state.dataPath, 'state.json');
    if(!this.state.translations){
        this.state.translations = {};
    }
};

function zeroPad(str, len){
    while(str.length < len){
        str = '0' + str;
    }
    return str;
}

proxy.prototype = {
    loadState: function(cb){
        var self = this;
        fs.readFile(this.state.jsonPath, function(err, data){
            if(err){
                return cb(err);
            }
            var parsed;
            try{
                parsed = JSON.parse(data);
            }catch(e){
                return cb(e);
            }
            extend(self.state, parsed);
            return cb();
        });
    },
    saveState: function(cb){
        var self = this,
            state = this.state;
        var data = JSON.stringify({
            translations: state.translations,
            domain: state.domain,
            token: state.token,
            starttime: state.starttime,
            port: state.port
        });
        fs.writeFile(this.state.jsonPath, data, cb);
    },
    fetchJSON: function(cb){
        var self = this;
        request(this.state.jsonURI, function(err, res, body){
            if(err){
                return cb(err);
            }
            var parsed;
            try{
                parsed = JSON.parse(body);
            }catch(e){
                return cb(e);
            }
            self.state.translations = parsed;
            self.saveState(cb);
        });
    },
    isFilterableJSON: function(method, res){
        return res.headers['content-type'] === 'text/plain' &&
               this.state.methods[method];
    },
    middleware: function(){
        var self = this;
        return function(req, res, next){
            if(!self.state.configured){
                return next();
            }
            var path = req.url;
            if(path.indexOf('/kcs/undefined') == 0){
                path = '/kcsapi/' + path.substring(14);
            }
            var proxyReq = http.request({
                hostname: self.state.hostname,
                port: 80,
                method: req.method,
                path: path,
                headers: req.headers
            }, function(proxyRes){
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                var exploded = url.parse(req.url).pathname.split('/');
                var method = exploded[exploded.length - 1];
                if(self.isFilterableJSON(method, proxyRes)){
                    var keys = self.state.methods[method];
                    var databuf = '';
                    proxyRes.on('data', function(data){
                        databuf += data.toString();
                    });
                    proxyRes.on('end', function(){
                        if(databuf.substring(0,7) !== 'svdata='){
                            return res.end(databuf);
                        }
                        var decoded;
                        try{
                            decoded = JSON.parse(databuf.substring(7));
                        }catch(e){
                            return res.end(databuf);
                        }
                        console.log(databuf);
                        gnosis.traverse(decoded, function(target, key, val, meta, root){
                            if(typeof val !== 'string' || keys.indexOf(key) === -1)
                                return;
                            var crc = crc32.signed(val).toString(10);
                            if(self.state.translations[crc]){
                                console.log('"%s" (%s->%s) -> "%s"', val, method, key, self.state.translations[crc]);
                                target[key] = self.state.translations[crc];
                            }
                        });
                        var outData = 'svdata=' + JSON.stringify(decoded);
                        outData = outData.replace(/[^\x20-\x7F]/g, function(c){
                            return '\\u' + zeroPad(c.charCodeAt().toString(16), 4);
                        });
                        console.log(outData);
                        res.end(outData);
                    });
                }else{
                    proxyRes.pipe(res);
                }
            });
            req.pipe(proxyReq);
        };
    }
};
