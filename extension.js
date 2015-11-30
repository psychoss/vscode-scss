// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');
var ass = require("node-sass");
var fs = require("fs");

function css_beautify(source_text, options) {
    options = options || {};
    source_text = source_text || '';
    // HACK: newline parsing inconsistent. This brute force normalizes the input.
    source_text = source_text.replace(/\r\n|[\r\u2028\u2029]/g, '\n')

    var indentSize = options.indent_size || 4;
    var indentCharacter = options.indent_char || ' ';
    var selectorSeparatorNewline = (options.selector_separator_newline === undefined) ? true : options.selector_separator_newline;
    var end_with_newline = (options.end_with_newline === undefined) ? false : options.end_with_newline;
    var newline_between_rules = (options.newline_between_rules === undefined) ? true : options.newline_between_rules;
    var eol = options.eol ? options.eol : '\n';

    // compatibility
    if (typeof indentSize === "string") {
        indentSize = parseInt(indentSize, 10);
    }

    if (options.indent_with_tabs) {
        indentCharacter = '\t';
        indentSize = 1;
    }

    eol = eol.replace(/\\r/, '\r').replace(/\\n/, '\n')


    // tokenizer
    var whiteRe = /^\s+$/;
    var wordRe = /[\w$\-_]/;

    var pos = -1,
        ch;
    var parenLevel = 0;

    function next() {
        ch = source_text.charAt(++pos);
        return ch || '';
    }

    function peek(skipWhitespace) {
        var result = '';
        var prev_pos = pos;
        if (skipWhitespace) {
            eatWhitespace();
        }
        result = source_text.charAt(pos + 1) || '';
        pos = prev_pos - 1;
        next();
        return result;
    }

    function eatString(endChars) {
        var start = pos;
        while (next()) {
            if (ch === "\\") {
                next();
            } else if (endChars.indexOf(ch) !== -1) {
                break;
            } else if (ch === "\n") {
                break;
            }
        }
        return source_text.substring(start, pos + 1);
    }

    function peekString(endChar) {
        var prev_pos = pos;
        var str = eatString(endChar);
        pos = prev_pos - 1;
        next();
        return str;
    }

    function eatWhitespace() {
        var result = '';
        while (whiteRe.test(peek())) {
            next();
            result += ch;
        }
        return result;
    }

    function skipWhitespace() {
        var result = '';
        if (ch && whiteRe.test(ch)) {
            result = ch;
        }
        while (whiteRe.test(next())) {
            result += ch;
        }
        return result;
    }

    function eatComment(singleLine) {
        var start = pos;
        singleLine = peek() === "/";
        next();
        while (next()) {
            if (!singleLine && ch === "*" && peek() === "/") {
                next();
                break;
            } else if (singleLine && ch === "\n") {
                return source_text.substring(start, pos);
            }
        }

        return source_text.substring(start, pos) + ch;
    }


    function lookBack(str) {
        return source_text.substring(pos - str.length, pos).toLowerCase() ===
            str;
    }

    // Nested pseudo-class if we are insideRule
    // and the next special character found opens
    // a new block
    function foundNestedPseudoClass() {
        var openParen = 0;
        for (var i = pos + 1; i < source_text.length; i++) {
            var ch = source_text.charAt(i);
            if (ch === "{") {
                return true;
            } else if (ch === '(') {
                // pseudoclasses can contain ()
                openParen += 1;
            } else if (ch === ')') {
                if (openParen == 0) {
                    return false;
                }
                openParen -= 1;
            } else if (ch === ";" || ch === "}") {
                return false;
            }
        }
        return false;
    }

    // printer
    var basebaseIndentString = source_text.match(/^[\t ]*/)[0];
    var singleIndent = new Array(indentSize + 1).join(indentCharacter);
    var indentLevel = 0;
    var nestedLevel = 0;

    function indent() {
        indentLevel++;
        basebaseIndentString += singleIndent;
    }

    function outdent() {
        indentLevel--;
        basebaseIndentString = basebaseIndentString.slice(0, -indentSize);
    }

    var print = {};
    print["{"] = function(ch) {
        print.singleSpace();
        output.push(ch);
        print.newLine();
    };
    print["}"] = function(ch) {
        print.newLine();
        output.push(ch);
        print.newLine();
    };

    print._lastCharWhitespace = function() {
        return whiteRe.test(output[output.length - 1]);
    };

    print.newLine = function(keepWhitespace) {
        if (output.length) {
            if (!keepWhitespace && output[output.length - 1] !== '\n') {
                print.trim();
            }

            output.push('\n');

            if (basebaseIndentString) {
                output.push(basebaseIndentString);
            }
        }
    };
    print.singleSpace = function() {
        if (output.length && !print._lastCharWhitespace()) {
            output.push(' ');
        }
    };

    print.preserveSingleSpace = function() {
        if (isAfterSpace) {
            print.singleSpace();
        }
    };

    print.trim = function() {
        while (print._lastCharWhitespace()) {
            output.pop();
        }
    };


    var output = [];
    /*_____________________--------------------_____________________*/

    var insideRule = false;
    var insidePropertyValue = false;
    var enteringConditionalGroup = false;
    var top_ch = '';
    var last_top_ch = '';

    while (true) {
        var whitespace = skipWhitespace();
        var isAfterSpace = whitespace !== '';
        var isAfterNewline = whitespace.indexOf('\n') !== -1;
        last_top_ch = top_ch;
        top_ch = ch;

        if (!ch) {
            break;
        } else if (ch === '/' && peek() === '*') { /* css comment */
            var header = indentLevel === 0;

            if (isAfterNewline || header) {
                print.newLine();
            }

            output.push(eatComment());
            print.newLine();
            if (header) {
                print.newLine(true);
            }
        } else if (ch === '/' && peek() === '/') { // single line comment
            if (!isAfterNewline && last_top_ch !== '{') {
                print.trim();
            }
            print.singleSpace();
            output.push(eatComment());
            print.newLine();
        } else if (ch === '@') {
            print.preserveSingleSpace();
            output.push(ch);

            // strip trailing space, if present, for hash property checks
            var variableOrRule = peekString(": ,;{}()[]/='\"");

            if (variableOrRule.match(/[ :]$/)) {
                // we have a variable or pseudo-class, add it and insert one space before continuing
                next();
                variableOrRule = eatString(": ").replace(/\s$/, '');
                output.push(variableOrRule);
                print.singleSpace();
            }

            variableOrRule = variableOrRule.replace(/\s$/, '')

            // might be a nesting at-rule
            if (variableOrRule in css_beautify.NESTED_AT_RULE) {
                nestedLevel += 1;
                if (variableOrRule in css_beautify.CONDITIONAL_GROUP_RULE) {
                    enteringConditionalGroup = true;
                }
            }
        } else if (ch === '#' && peek() === '{') {
            print.preserveSingleSpace();
            output.push(eatString('}'));
        } else if (ch === '{') {
            if (peek(true) === '}') {
                eatWhitespace();
                next();
                print.singleSpace();
                output.push("{}");
                print.newLine();
                if (newline_between_rules && indentLevel === 0) {
                    print.newLine(true);
                }
            } else {
                indent();
                print["{"](ch);
                // when entering conditional groups, only rulesets are allowed
                if (enteringConditionalGroup) {
                    enteringConditionalGroup = false;
                    insideRule = (indentLevel > nestedLevel);
                } else {
                    // otherwise, declarations are also allowed
                    insideRule = (indentLevel >= nestedLevel);
                }
            }
        } else if (ch === '}') {
            outdent();
            print["}"](ch);
            insideRule = false;
            insidePropertyValue = false;
            if (nestedLevel) {
                nestedLevel--;
            }
            if (newline_between_rules && indentLevel === 0) {
                print.newLine(true);
            }
        } else if (ch === ":") {
            eatWhitespace();
            if ((insideRule || enteringConditionalGroup) &&
                !(lookBack("&") || foundNestedPseudoClass())) {
                // 'property: value' delimiter
                // which could be in a conditional group query
                insidePropertyValue = true;
                output.push(':');
                print.singleSpace();
            } else {
                // sass/less parent reference don't use a space
                // sass nested pseudo-class don't use a space
                if (peek() === ":") {
                    // pseudo-element
                    next();
                    output.push("::");
                } else {
                    // pseudo-class
                    output.push(':');
                }
            }
        } else if (ch === '"' || ch === '\'') {
            print.preserveSingleSpace();
            output.push(eatString(ch));
        } else if (ch === ';') {
            insidePropertyValue = false;
            output.push(ch);
            print.newLine();
        } else if (ch === '(') { // may be a url
            if (lookBack("url")) {
                output.push(ch);
                eatWhitespace();
                if (next()) {
                    if (ch !== ')' && ch !== '"' && ch !== '\'') {
                        output.push(eatString(')'));
                    } else {
                        pos--;
                    }
                }
            } else {
                parenLevel++;
                print.preserveSingleSpace();
                output.push(ch);
                eatWhitespace();
            }
        } else if (ch === ')') {
            output.push(ch);
            parenLevel--;
        } else if (ch === ',') {
            output.push(ch);
            eatWhitespace();
            if (selectorSeparatorNewline && !insidePropertyValue && parenLevel < 1) {
                print.newLine();
            } else {
                print.singleSpace();
            }
        } else if (ch === ']') {
            output.push(ch);
        } else if (ch === '[') {
            print.preserveSingleSpace();
            output.push(ch);
        } else if (ch === '=') { // no whitespace before or after
            eatWhitespace()
            ch = '=';
            output.push(ch);
        } else {
            print.preserveSingleSpace();
            output.push(ch);
        }
    }


    var sweetCode = '';
    if (basebaseIndentString) {
        sweetCode += basebaseIndentString;
    }

    sweetCode += output.join('').replace(/[\r\n\t ]+$/, '');

    // establish end_with_newline
    if (end_with_newline) {
        sweetCode += '\n';
    }

    if (eol != '\n') {
        sweetCode = sweetCode.replace(/[\n]/g, eol);
    }

    return sweetCode;
}

// https://developer.mozilla.org/en-US/docs/Web/CSS/At-rule
css_beautify.NESTED_AT_RULE = {
    "@page": true,
    "@font-face": true,
    "@keyframes": true,
    // also in CONDITIONAL_GROUP_RULE below
    "@media": true,
    "@supports": true,
    "@document": true
};
css_beautify.CONDITIONAL_GROUP_RULE = {
    "@media": true,
    "@supports": true,
    "@document": true
};


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    var beautifulScss = function(text) {
        return css_beautify(text, {
            'indent_size': 1,
            'indent_char': '\t',
            'selector_separator': ' ',
            'end_with_newline': false,
            'newline_between_rules': true
        });
    };
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    var formatSCSS = vscode.commands.registerCommand('extension.formatscss', function() {
        var editor = vscode.window.activeTextEditor;
        if (!editor) {
            return; // No open text editor
        }
        if (editor.document.languageId === 'sass') {
            var text = editor.document.getText();
            var length = text.length;
            if (text) {
                text = beautifulScss(text);
                var start = editor.document.positionAt(0);
                var end = editor.document.positionAt(length);
                editor.edit(function(e) {
                    e.replace(new vscode.Range(start, end), text);
                });
            }
        }
    });
    var compileSCSS = vscode.commands.registerCommand('extension.compilescss', function() {
        var editor = vscode.window.activeTextEditor;
        if (!editor) {
            return; // No open text editor
        }


        if (editor.document.languageId !== 'sass')
            return;
        var filename = "/home/psycho/RESOURCE/归档/web/static/scss/index.scss";


        ass.render({
            file: filename,
            outputStyle: "compact"
        }, function(err, result) {
            if (err) {
                vscode.window.showInformationMessage("Error: " + err);
                return;
            }
            var pos = filename.lastIndexOf('.');
            fs.writeFile(filename.substr(0, pos) + '.css', result.css);
        });
    });
    context.subscriptions.push(formatSCSS);
    context.subscriptions.push(compileSCSS);
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map
