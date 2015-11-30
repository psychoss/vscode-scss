var ass = require("node-sass");
var fs=require('fs')
        var filename = "/home/psycho/RESOURCE/归档/web/static/scss/index.scss";
            

        ass.render({
            file: filename,
            outputStyle: "compact"
        }, function (err, result) {
            if (err) {
console.log(err)
                return;
            }
console.log(filename.substr(0, pos))
            var pos = filename.lastIndexOf('.');
            fs.writeFile(filename.substr(0, pos) + '.css', result.css);
        });
