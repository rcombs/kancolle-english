var request = require('request'),
    crc32 = require('buffer-crc32'),
    fs = require('fs'),
    path = require('path'),
    extend = require('extend');

var proxy = module.exports = function(state){
    this.state = state;
    this.state.jsonPath = path.join(this.state.dataPath, 'state.json');
};

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
    }
    fetchJSON: function(cb){
        var self = this;
        request(state.jsonURI, function(err, res, body){
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
    middleware: function(req, res, next){
        // Proxy!
        next();
    }
};
