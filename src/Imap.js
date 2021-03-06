"use strict";
/*!
 * Copyright 2018 CoNET Technology Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
exports.imapPeer = exports.imapGetMediaFile = exports.imapAccountTest = exports.getMailAttachedBase64 = exports.getMailSubject = exports.getMailAttached = exports.qtGateImapRead = exports.seneMessageToFolder = exports.qtGateImap = exports.saveLog = void 0;
var Tls = require("tls");
var Stream = require("stream");
var Event = require("events");
var Uuid = require("uuid");
var Async = require("async");
var Crypto = require("crypto");
var buffer_1 = require("buffer");
var Util = require("util");
var MAX_INT = 9007199254740992;
var debug = true;
var NoopLoopWaitingTime = 1000 * 1;
var saveLog = function (log, _console) {
    if (_console === void 0) { _console = true; }
    var data = new Date().toUTCString() + ": " + log + "\r\n";
    _console ? console.log(data) : null;
};
exports.saveLog = saveLog;
var debugOut = function (text, isIn, serialID) {
    var log = "\u3010" + new Date().toISOString() + "\u3011\u3010" + serialID + "\u3011" + (isIn ? '<=' : '=>') + " \u3010" + text + "\u3011";
    console.log(log);
};
var idleInterval = 1000 * 60 * 15; // 5 mins
var ImapServerSwitchStream = /** @class */ (function (_super) {
    __extends(ImapServerSwitchStream, _super);
    function ImapServerSwitchStream(imapServer, exitWithDeleteBox, debug) {
        var _this = _super.call(this) || this;
        _this.imapServer = imapServer;
        _this.exitWithDeleteBox = exitWithDeleteBox;
        _this.debug = debug;
        _this._buffer = buffer_1.Buffer.alloc(0);
        _this.Tag = null;
        _this.cmd = null;
        _this.callback = false;
        _this.doCommandCallback = null;
        _this._login = false;
        _this.first = true;
        _this.waitLogoutCallBack = null;
        _this.idleResponsrTime = null;
        _this.ready = false;
        _this.appendWaitResponsrTimeOut = null;
        _this.runningCommand = null;
        //private nextRead = true
        _this.idleNextStop = null;
        _this.reNewCount = 0;
        _this.isImapUserLoginSuccess = false;
        _this.newSwitchRet = false;
        _this.doingIdle = false;
        _this.needLoginout = null;
        return _this;
    }
    ImapServerSwitchStream.prototype.commandProcess = function (text, cmdArray, next, callback) { };
    ImapServerSwitchStream.prototype.serverCommandError = function (err, CallBack) {
        this.imapServer.emit('error', err);
        if (CallBack) {
            CallBack(err);
        }
    };
    ImapServerSwitchStream.prototype.idleDoingDown = function () {
        if (!this.doingIdle || this.runningCommand !== 'idle') {
            return; //console.dir (`idleDoingDown stop because this.doingIdle === false!`)
        }
        this.doingIdle = false;
        clearTimeout(this.idleNextStop);
        if (this.writable) {
            this.debug ? debugOut("DONE", false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
            console.log('');
            return this.push("DONE\r\n");
        }
        /**
         *
         */
        return this.imapServer.destroyAll(null);
    };
    ImapServerSwitchStream.prototype.doCapability = function (capability) {
        this.imapServer.serverSupportTag = capability;
        this.imapServer.idleSupport = /IDLE/i.test(capability);
        this.imapServer.condStoreSupport = /CONDSTORE/i.test(capability);
        this.imapServer.literalPlus = /LITERAL\+/i.test(capability);
        var ii = /X\-GM\-EXT\-1/i.test(capability);
        var ii1 = /CONDSTORE/i.test(capability);
        return this.imapServer.fetchAddCom = "(" + (ii ? 'X-GM-THRID X-GM-MSGID X-GM-LABELS ' : '') + (ii1 ? 'MODSEQ ' : '') + "BODY[])";
    };
    ImapServerSwitchStream.prototype.preProcessCommane = function (commandLine, _next, callback) {
        commandLine = commandLine.replace(/^ +/g, '').replace(/^IDLE\*/, '*');
        var cmdArray = commandLine.split(' ');
        this.debug ? debugOut("" + commandLine, true, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this._login) {
            switch (commandLine[0]) {
                case '+': /////       +
                case '*': { /////       *
                    return this.commandProcess(commandLine, cmdArray, _next, callback);
                }
                case 'I': //  IDLE
                case 'D': //  NODE
                case 'N': //  NOOP
                case 'O': //	OK
                case 'A': { /////       A
                    clearTimeout(this.appendWaitResponsrTimeOut);
                    clearTimeout(this.idleResponsrTime);
                    this.runningCommand = false;
                    if (/^ok$/i.test(cmdArray[1]) || /^ok$/i.test(cmdArray[0])) {
                        this.doCommandCallback(null, commandLine);
                        return callback();
                    }
                    if (this.Tag !== cmdArray[0]) {
                        return this.serverCommandError(new Error("this.Tag[" + this.Tag + "] !== cmdArray[0] [" + cmdArray[0] + "]\ncommandLine[" + commandLine + "]"), callback);
                    }
                    //console.log (`IMAP preProcessCommane on NO Tag!`, commandLine )
                    var errs = cmdArray.slice(2).join(' ');
                    this.doCommandCallback(new Error(errs));
                    return callback();
                }
                default:
                    return this.serverCommandError(new Error("_commandPreProcess got switch default error!"), callback);
            }
        }
        return this.login(commandLine, cmdArray, _next, callback);
    };
    ImapServerSwitchStream.prototype.checkFetchEnd = function () {
        if (this._buffer.length <= this.imapServer.fetching) {
            return null;
        }
        var body = this._buffer.slice(0, this.imapServer.fetching);
        var uu = this._buffer.slice(this.imapServer.fetching);
        var index1 = uu.indexOf('\r\n* ');
        var index = uu.indexOf('\r\nA');
        index = index < 0 || index1 > 0 && index > index1 ? index1 : index;
        if (index < 0)
            return null;
        this._buffer = uu.slice(index + 2);
        this.imapServer.fetching = null;
        return body;
    };
    ImapServerSwitchStream.prototype._transform = function (chunk, encoding, next) {
        var _this = this;
        this.callback = false;
        //console.log ('************************************** ImapServerSwitchStream _transform chunk **************************************')
        //console.log ( chunk.toString ())
        //console.log ('************************************** ImapServerSwitchStream _transform chunk **************************************')
        this._buffer = buffer_1.Buffer.concat([this._buffer, chunk]);
        var doLine = function () {
            var __CallBack = function () {
                var index = -1;
                if (!_this._buffer.length || (index = _this._buffer.indexOf('\r\n')) < 0) {
                    if (!_this.callback) {
                        //      this is for IDLE do DONE command
                        //this.emit ( 'hold' )
                        _this.callback = true;
                        return next();
                    }
                    //      did next with other function
                    return;
                }
                var _buf = _this._buffer.slice(0, index);
                if (_buf.length) {
                    return _this.preProcessCommane(_buf.toString(), next, function () {
                        _this._buffer = _this._buffer.slice(index + 2);
                        return doLine();
                    });
                }
                if (!_this.callback) {
                    _this.callback = true;
                    return next();
                }
                return;
            };
            if (_this.imapServer.fetching) {
                //console.log ('************************************** ImapServerSwitchStream _transform chunk **************************************')
                //console.log ( this._buffer.toString ())
                //console.log ('************************************** ImapServerSwitchStream _transform chunk **************************************')
                var _buf1 = _this.checkFetchEnd();
                //  have no fill body get next chunk
                if (!_buf1) {
                    if (!_this.callback) {
                        _this.callback = true;
                        return next();
                    }
                    return;
                }
                /*
                console.log ('************************************** ImapServerSwitchStream _transform chunk **************************************')
                console.log ( _buf1.length )
                console.log ( _buf1.toString ())
                */
                _this.imapServer.newMail(_buf1);
            }
            return __CallBack();
        };
        return doLine();
    };
    ImapServerSwitchStream.prototype.capability = function () {
        var _this = this;
        this.doCommandCallback = function (err) {
            if (_this.imapServer.listenFolder) {
                return _this.createBox(true, _this.imapServer.listenFolder, function (err, newMail, UID) {
                    if (err) {
                        console.log("========================= [" + (_this.imapServer.listenFolder || _this.imapServer.imapSerialID) + "] openBox Error do this.end ()", err);
                        return _this.imapServer.destroyAll(err);
                    }
                    /*
                    if ( this.isWaitLogout ) {
                        console.log (`capability this.waitLogout = true doing logout_process ()`)
                        return this.logout_process ( this.waitLogoutCallBack )
                    }
                    */
                    if (/^inbox$/i.test(_this.imapServer.listenFolder)) {
                        console.log("capability open inbox !");
                        _this.ready = true;
                        return _this.imapServer.emit('ready');
                    }
                    if (_this.imapServer.skipOldMail) {
                        return _this.skipAllUnreadMail();
                    }
                    if (newMail && typeof _this.imapServer.newMail === 'function') {
                        //this.imapServer.emit ( 'ready' )
                        //console.log (`[${ this.imapServer.imapSerialID }]capability doing newMail = true`)
                        return _this.doNewMail(UID);
                    }
                    if (typeof _this.imapServer.newMail === 'function') {
                        _this.idleNoop();
                    }
                    _this.ready = true;
                    _this.imapServer.emit('ready');
                });
            }
            _this.ready = true;
            _this.imapServer.emit('ready');
        };
        this.commandProcess = function (text, cmdArray, next, callback) {
            switch (cmdArray[0]) {
                case '*': { /////       *
                    //          check imap server is login ok
                    if (/^CAPABILITY$/i.test(cmdArray[1]) && cmdArray.length > 2) {
                        var kkk = cmdArray.slice(2).join(' ');
                        _this.doCapability(kkk);
                    }
                    return callback();
                }
                default:
                    return callback();
            }
        };
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " CAPABILITY";
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this.writable) {
            return this.push(this.cmd + '\r\n');
        }
        return this.imapServer.destroyAll(null);
    };
    ImapServerSwitchStream.prototype.skipAllUnreadMail = function () {
        var _this = this;
        return this.seachUnseen(function (err, newMailIds, havemore) {
            if (newMailIds) {
                return Async.series([
                    function (next) { return _this.flagsDeleted(newMailIds, next); },
                    function (next) { return _this.expunge(next); }
                ], function (err) {
                    _this.runningCommand = null;
                    _this.imapServer.emit('ready');
                    return _this.idleNoop();
                });
                /*
                return Async.eachSeries ( uids, ( n: string , next ) => {
                    
                    if ( n && n.length ) {
                        return this.flagsDeleted ( n, next )
                    }
                    return next ( false )
                }, err => {
                    return this.expunge ( err => {
                        this.runningCommand = null
                        this.imapServer.emit ( 'ready' )
                        return this.idleNoop()
                    })
                })
                */
            }
            _this.runningCommand = null;
            _this.imapServer.emit('ready');
            return _this.idleNoop();
        });
    };
    ImapServerSwitchStream.prototype.doNewMail = function (UID) {
        var _this = this;
        if (UID === void 0) { UID = ''; }
        this.reNewCount--;
        this.runningCommand = 'doNewMail';
        return this.seachUnseen(function (err, newMailIds, havemore) {
            if (err) {
                console.log("===============> seachUnseen got error. destore imap connect!", err);
                _this.runningCommand = null;
                return _this.imapServer.destroyAll(err);
            }
            var haveMoreNewMail = false;
            var getNewMail = function (_fatchID, CallBack) {
                return Async.waterfall([
                    function (next) { return _this.fetch(_fatchID, next); },
                    function (_moreNew, next) {
                        haveMoreNewMail = _moreNew;
                        return _this.flagsDeleted(_fatchID, next);
                    },
                    function (next) {
                        return _this.expunge(next);
                    }
                ], CallBack);
            };
            if (newMailIds || (newMailIds = UID)) {
                var uids = newMailIds.split(',');
                return Async.eachSeries(uids, function (n, next) {
                    var _uid = parseInt(n);
                    if (_uid > 0) {
                        return getNewMail(_uid, next);
                    }
                    return next();
                }, function (err) {
                    console.log("doNewMail Async.eachSeries getNewMail callback!");
                    _this.runningCommand = null;
                    if (err) {
                        console.log("doNewMail Async.eachSeries getNewMail error", err);
                        debug ? exports.saveLog("ImapServerSwitchStream [" + (_this.imapServer.listenFolder || _this.imapServer.imapSerialID) + "] doNewMail ERROR! [" + err + "]") : null;
                        return _this.imapServer.destroyAll(err);
                    }
                    if (_this.needLoginout) {
                        console.log("this.needLoginout === true!");
                        return _this.idleNoop();
                    }
                    if (haveMoreNewMail || havemore || _this.newSwitchRet) {
                        return _this.doNewMail();
                    }
                    return _this.idleNoop();
                });
            }
            _this.runningCommand = null;
            _this.imapServer.emit('ready');
            return _this.idleNoop();
        });
    };
    ImapServerSwitchStream.prototype.idleNoop = function () {
        var _this = this;
        if (this.needLoginout) {
            return this._logoutWithoutCheck(function () {
            });
        }
        this.newSwitchRet = false;
        this.doingIdle = true;
        this.runningCommand = 'idle';
        if (!this.ready) {
            this.ready = true;
            this.imapServer.emit('ready');
        }
        this.doCommandCallback = (function (err) {
            if (err) {
                console.log("IDLE doCommandCallback! error", err);
                return _this.imapServer.destroyAll(err);
            }
            _this.runningCommand = null;
            if (_this.needLoginout) {
                return _this._logoutWithoutCheck(function () {
                    _this.needLoginout();
                });
            }
            //console.log(`IDLE DONE newSwitchRet = [${newSwitchRet}] nextRead = [${this.nextRead}]`)
            if (_this.newSwitchRet || _this.reNewCount > 0) {
                return _this.doNewMail();
            }
            if (_this.imapServer.idleSupport) {
                return _this.idleNoop();
            }
            /**
             * NOOP support
             */
            setTimeout(function () {
                if (!_this.runningCommand) {
                    return _this.idleNoop();
                }
            }, NoopLoopWaitingTime);
        });
        this.commandProcess = function (text, cmdArray, next, callback) {
            //console.log (`idleNoop commandProcess coming ${ text }\n${ cmdArray }`)
            switch (cmdArray[0]) {
                case _this.Tag + "*":
                case '+':
                case '*': {
                    clearTimeout(_this.idleResponsrTime);
                    if (/^RECENT$|^EXISTS$/i.test(cmdArray[2])) {
                        _this.newSwitchRet = true;
                        if (_this.imapServer.idleSupport) {
                            _this.idleDoingDown();
                        }
                    }
                    return callback();
                }
                default:
                    return callback();
            }
        };
        var name = this.Tag = this.imapServer.idleSupport ? 'IDLE' : 'NOOP';
        this.cmd = this.Tag + " " + name;
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this.writable) {
            this.idleNextStop = this.imapServer.idleSupport
                ? setTimeout(function () {
                    _this.idleDoingDown();
                }, idleInterval)
                : null;
            return this.push(this.cmd + '\r\n');
        }
        this.doingIdle = false;
        return this.imapServer.destroyAll(null);
    };
    ImapServerSwitchStream.prototype.loginoutWithCheck = function (CallBack) {
        if (this.needLoginout) {
            return CallBack();
        }
        this.needLoginout = CallBack;
        if (this.runningCommand === 'doNewMail') {
            return;
        }
        if (this.doingIdle) {
            return this.idleDoingDown();
        }
    };
    ImapServerSwitchStream.prototype.login = function (text, cmdArray, next, _callback) {
        var _this = this;
        this.doCommandCallback = function (err) {
            if (!err) {
                _this.isImapUserLoginSuccess = true;
                return _this.capability();
            }
            console.log("ImapServerSwitchStream class login error ", err);
            return _this.imapServer.destroyAll(err);
        };
        this.commandProcess = function (text, cmdArray, next, callback) {
            switch (cmdArray[0]) {
                case '+':
                case '*': {
                    return callback();
                }
                default:
                    return callback();
            }
        };
        switch (cmdArray[0]) {
            case '*': { /////       *
                //          check imap server is login ok
                if (/^ok$/i.test(cmdArray[1]) && this.first) {
                    this.first = false;
                    this.Tag = "A" + this.imapServer.TagCount1();
                    this.cmd = this.Tag + " LOGIN \"" + this.imapServer.IMapConnect.imapUserName + "\" \"" + this.imapServer.IMapConnect.imapUserPassword + "\"";
                    this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
                    this.callback = this._login = true;
                    if (this.writable) {
                        return next(null, this.cmd + '\r\n');
                    }
                    this.imapServer.destroyAll(null);
                }
                //
                return _callback();
            }
            default:
                return this.serverCommandError(new Error("login switch default ERROR!"), _callback);
        }
    };
    ImapServerSwitchStream.prototype.createBox = function (openBox, folderName, CallBack) {
        var _this = this;
        this.doCommandCallback = function (err) {
            if (err) {
                if (err.message && !/exists/i.test(err.message)) {
                    return CallBack(err);
                }
            }
            if (openBox) {
                return _this.openBox(CallBack);
            }
            return CallBack();
        };
        this.commandProcess = function (text, cmdArray, next, callback) {
            return callback();
        };
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " CREATE \"" + folderName + "\"";
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this.writable) {
            return this.push(this.cmd + '\r\n');
        }
        return this.imapServer.destroyAll(null);
    };
    ImapServerSwitchStream.prototype.openBox = function (CallBack) {
        var _this = this;
        this.newSwitchRet = false;
        var UID = 0;
        this.doCommandCallback = function (err) {
            if (err) {
                return _this.createBox(true, _this.imapServer.listenFolder, CallBack);
            }
            CallBack(null, _this.newSwitchRet, UID);
        };
        this.commandProcess = function (text, cmdArray, next, _callback) {
            switch (cmdArray[0]) {
                case '*': {
                    if (/^EXISTS$|^UIDNEXT$|UNSEEN/i.test(cmdArray[2])) {
                        var _num = text.split('UNSEEN ')[1];
                        if (_num) {
                            UID = parseInt(_num.split(']')[0]);
                        }
                        _this.newSwitchRet = true;
                    }
                    return _callback();
                }
                default:
                    return _callback();
            }
        };
        var conText = this.imapServer.condStoreSupport ? ' (CONDSTORE)' : '';
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " SELECT \"" + this.imapServer.listenFolder + "\"" + conText;
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this.writable)
            return this.push(this.cmd + '\r\n');
        this.imapServer.destroyAll(null);
    };
    ImapServerSwitchStream.prototype.openBoxV1 = function (folder, CallBack) {
        var _this = this;
        this.newSwitchRet = false;
        var UID = 0;
        this.doCommandCallback = function (err) {
            if (err) {
                return CallBack(err);
            }
            CallBack(null, _this.newSwitchRet, UID);
        };
        this.commandProcess = function (text, cmdArray, next, _callback) {
            switch (cmdArray[0]) {
                case '*': {
                    if (/^EXISTS$|^UIDNEXT$|UNSEEN/i.test(cmdArray[2])) {
                        var _num = text.split('UNSEEN ')[1];
                        if (_num) {
                            UID = parseInt(_num.split(']')[0]);
                        }
                        _this.newSwitchRet = true;
                    }
                    return _callback();
                }
                default:
                    return _callback();
            }
        };
        var conText = this.imapServer.condStoreSupport ? ' (CONDSTORE)' : '';
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " SELECT \"" + folder + "\"" + conText;
        this.debug ? debugOut(this.cmd, false, folder || this.imapServer.imapSerialID) : null;
        if (this.writable)
            return this.push(this.cmd + '\r\n');
        this.imapServer.destroyAll(new Error('imapServer un-writeable'));
    };
    ImapServerSwitchStream.prototype._logoutWithoutCheck = function (CallBack) {
        var _this = this;
        //console.trace (`doing _logout typeof CallBack = [${ typeof CallBack }]`)
        if (!this.isImapUserLoginSuccess) {
            return CallBack();
        }
        this.doCommandCallback = function (err, info) {
            return CallBack(err);
        };
        clearTimeout(this.idleResponsrTime);
        this.commandProcess = function (text, cmdArray, next, _callback) {
            //console.log (`_logout doing this.commandProcess `)
            _this.isImapUserLoginSuccess = false;
            return _callback();
        };
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " LOGOUT";
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this.writable) {
            this.appendWaitResponsrTimeOut = setTimeout(function () {
                return CallBack();
            }, 1000 * 30);
            return this.push(this.cmd + '\r\n');
        }
        if (CallBack && typeof CallBack === 'function') {
            return CallBack();
        }
    };
    ImapServerSwitchStream.prototype.append = function (text, subject, CallBack) {
        var _this = this;
        //console.log (`[${ this.imapServer.imapSerialID }] ImapServerSwitchStream append => [${ text.length }]`)
        if (typeof subject === 'function') {
            CallBack = subject;
            subject = null;
        }
        this.doCommandCallback = function (err, info) {
            if (err && /TRYCREATE|Mailbox/i.test(err.message)) {
                return _this.createBox(false, _this.imapServer.writeFolder, function (err1) {
                    if (err1) {
                        return CallBack(err1);
                    }
                    return _this.append(text, subject, CallBack);
                });
            }
            console.log("[" + (_this.imapServer.listenFolder || _this.imapServer.imapSerialID) + "] append doCommandCallback ", err);
            return CallBack(err, info);
        };
        var out = "Date: " + new Date().toUTCString() + "\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment\r\nMessage-ID:<" + Uuid.v4() + "@>" + this.imapServer.domainName + "\r\n" + (subject ? 'Subject: ' + subject + '\r\n' : '') + "Content-Transfer-Encoding: base64\r\nMIME-Version: 1.0\r\n\r\n" + text;
        this.commandProcess = function (text1, cmdArray, next, _callback) {
            switch (cmdArray[0]) {
                case '*':
                case '+': {
                    if (!_this.imapServer.literalPlus && out.length && !_this.callback) {
                        console.log("====> append ! this.imapServer.literalPlus && out.length && ! this.callback = [" + (!_this.imapServer.literalPlus && out.length && !_this.callback) + "]");
                        _this.debug ? debugOut(out, false, _this.imapServer.listenFolder || _this.imapServer.imapSerialID) : null;
                        _this.callback = true;
                        next(null, out + '\r\n');
                    }
                    return _callback();
                }
                default:
                    return _callback();
            }
        };
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = "APPEND \"" + this.imapServer.writeFolder + "\" {" + out.length + (this.imapServer.literalPlus ? '+' : '') + "}";
        this.cmd = this.Tag + " " + this.cmd;
        var time = out.length + 30000;
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (!this.writable) {
            //console.log (`[${ this.imapServer.imapSerialID }] ImapServerSwitchStream append !this.writable doing imapServer.socket.end ()`)
            return this.imapServer.socket.end();
        }
        this.push(this.cmd + '\r\n');
        this.appendWaitResponsrTimeOut = setTimeout(function () {
            return _this.doCommandCallback(new Error("IMAP append TIMEOUT"));
        }, time);
        //console.log (`*************************************  append time = [${ time }] `)
        if (this.imapServer.literalPlus) {
            this.debug ? debugOut(out, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
            this.push(out + '\r\n');
        }
    };
    ImapServerSwitchStream.prototype.appendStreamV4 = function (Base64Data, subject, folderName, CallBack) {
        var _this = this;
        if (Base64Data === void 0) { Base64Data = ''; }
        if (subject === void 0) { subject = null; }
        if (!Base64Data) {
            Base64Data = '';
        }
        console.log("appendStreamV4 Base64Data = [" + Base64Data + "]");
        this.doCommandCallback = function (err, response) {
            //this.debug ? saveLog (`appendStreamV2 doing this.doCommandCallback`) : null
            clearTimeout(_this.appendWaitResponsrTimeOut);
            if (err) {
                if (/TRYCREATE/i.test(err.message)) {
                    return _this.createBox(false, _this.imapServer.writeFolder, function (err1) {
                        if (err1) {
                            return CallBack(err1);
                        }
                        return _this.appendStreamV4(Base64Data, subject, folderName, CallBack);
                    });
                }
                return CallBack(err);
            }
            var code = response && response.length ? response.split('[')[1] : null;
            if (code) {
                code = code.split(' ')[2];
                //console.log ( `this.doCommandCallback\n\n code = ${ code } code.length = ${ code.length }\n\n` )
                if (code) {
                    return CallBack(null, parseInt(code));
                }
            }
            CallBack();
        };
        var out = "Date: " + new Date().toUTCString() + "\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment\r\nMessage-ID:<" + Uuid.v4() + "@>" + this.imapServer.domainName + "\r\n" + (subject ? 'Subject: ' + subject + '\r\n' : '') + "Content-Transfer-Encoding: base64\r\nMIME-Version: 1.0\r\n\r\n";
        this.commandProcess = function (text1, cmdArray, next, _callback) {
            switch (cmdArray[0]) {
                case '*':
                case '+': {
                    if (!_this.imapServer.literalPlus && out.length && !_this.callback) {
                        _this.callback = true;
                        //this.debug ? debugOut ( out, false, this.imapServer.IMapConnect.imapUserName ) : null
                        next(null, out + Base64Data + '\r\n');
                    }
                    return _callback();
                }
                default:
                    return _callback();
            }
        };
        var _length = out.length + Base64Data.length;
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = "APPEND \"" + folderName + "\" {" + _length + (this.imapServer.literalPlus ? '+' : '') + "}";
        this.cmd = this.Tag + " " + this.cmd;
        var _time = _length + 1000 * 60;
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (!this.writable) {
            return this.doCommandCallback(new Error('! imap.writable '));
        }
        this.push(this.cmd + '\r\n');
        this.appendWaitResponsrTimeOut = setTimeout(function () {
            return _this.doCommandCallback(new Error('appendStreamV3 mail serrver write timeout!'));
        }, _time);
        //console.log (`*************************************  append time = [${ time }] `)
        if (this.imapServer.literalPlus) {
            //this.debug ? debugOut ( out + Base64Data + '\r\n', false, this.imapServer.listenFolder || this.imapServer.imapSerialID ) : null
            this.push(out);
            this.push(Base64Data + '\r\n');
        }
    };
    ImapServerSwitchStream.prototype.seachUnseen = function (callabck) {
        var _this = this;
        var newSwitchRet = null;
        var moreNew = false;
        this.doCommandCallback = function (err) {
            if (err)
                return callabck(err);
            return callabck(null, newSwitchRet, moreNew);
        };
        this.commandProcess = function (text, cmdArray, next, _callback) {
            switch (cmdArray[0]) {
                case '*': {
                    if (/^SEARCH$/i.test(cmdArray[1])) {
                        var uu1 = cmdArray[2] && cmdArray[2].length > 0 ? parseInt(cmdArray[2]) : 0;
                        if (cmdArray.length > 2 && uu1) {
                            if (!cmdArray[cmdArray.length - 1].length)
                                cmdArray.pop();
                            var uu = cmdArray.slice(2).join(',');
                            if (/\,/.test(uu[uu.length - 1]))
                                uu.substr(0, uu.length - 1);
                            newSwitchRet = uu;
                            moreNew = cmdArray.length > 3;
                        }
                        return _callback();
                    }
                    if (/^EXISTS$/i.test(cmdArray[2])) {
                        _this.imapServer.emit('SEARCH_HAVE_EXISTS');
                    }
                    return _callback();
                }
                default:
                    return _callback();
            }
        };
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " UID SEARCH ALL";
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this.writable) {
            return this.push(this.cmd + '\r\n');
        }
        return this.imapServer.destroyAll(null);
    };
    ImapServerSwitchStream.prototype.fetch = function (fetchNum, callback) {
        var _this = this;
        this.doCommandCallback = function (err) {
            console.log("ImapServerSwitchStream doing doCommandCallback [" + _this.newSwitchRet + "], err [" + err + "]");
            return callback(err, _this.newSwitchRet);
        };
        this.newSwitchRet = false;
        this.commandProcess = function (text1, cmdArray, next, _callback) {
            switch (cmdArray[0]) {
                case '*': {
                    if (/^FETCH$/i.test(cmdArray[2])) {
                        if (/\{\d+\}/.test(text1)) {
                            _this.imapServer.fetching = parseInt(text1.split('{')[1].split('}')[0]);
                        }
                        //this.debug ? console.log ( `${ text1 } doing length [${ this.imapServer.fetching }]` ) : null
                    }
                    if (/^RECENT$/i.test(cmdArray[2]) && parseInt(cmdArray[1]) > 0) {
                        _this.newSwitchRet = true;
                    }
                    return _callback();
                }
                default:
                    return _callback();
            }
        };
        //console.log (`ImapServerSwitchStream doing UID FETCH `)
        this.cmd = "UID FETCH " + fetchNum + " " + this.imapServer.fetchAddCom;
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " " + this.cmd;
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        this.appendWaitResponsrTimeOut = setTimeout(function () {
            //this.imapServer.emit ( 'error', new Error (`${ this.cmd } timeout!`))
            return _this.doCommandCallback(new Error(_this.cmd + " timeout!"));
        }, this.imapServer.fetching + 1000 * 120);
        if (this.writable) {
            return this.push(this.cmd + '\r\n');
        }
        return this.imapServer.destroyAll(null);
    };
    ImapServerSwitchStream.prototype.deleteBox = function (CallBack) {
        this.doCommandCallback = CallBack;
        this.commandProcess = function (text1, cmdArray, next, _callback) {
            return _callback();
        };
        this.cmd = "DELETE \"" + this.imapServer.listenFolder + "\"";
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " " + this.cmd;
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this.writable)
            return this.push(this.cmd + '\r\n');
        return this.imapServer.destroyAll(null);
    };
    ImapServerSwitchStream.prototype.deleteAMailBox = function (boxName, CallBack) {
        this.doCommandCallback = function (err) {
            return CallBack(err);
        };
        this.commandProcess = function (text1, cmdArray, next, _callback) {
            return _callback();
        };
        this.cmd = "DELETE \"" + boxName + "\"";
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " " + this.cmd;
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this.writable)
            return this.push(this.cmd + '\r\n');
        return this.imapServer.destroyAll(null);
    };
    ImapServerSwitchStream.prototype.flagsDeleted = function (num, CallBack) {
        var _this = this;
        this.doCommandCallback = function (err) {
            //saveLog ( `ImapServerSwitchStream this.flagsDeleted [${ this.imapServer.listenFolder }] doing flagsDeleted success! typeof CallBack = [${ typeof CallBack }]`)
            return CallBack(err);
        };
        this.commandProcess = function (text1, cmdArray, next, _callback) {
            switch (cmdArray[0]) {
                case '*': {
                    if (/^FETCH$/i.test(cmdArray[2])) {
                        if (/\{\d+\}/.test(text1)) {
                            _this.imapServer.fetching = parseInt(text1.split('{')[1].split('}')[0]);
                        }
                        _this.debug ? console.log(text1 + " doing length [" + _this.imapServer.fetching + "]") : null;
                    }
                    if (/^EXISTS$/i.test(cmdArray[2]) && parseInt(cmdArray[1]) > 0) {
                        _this.newSwitchRet = true;
                    }
                    return _callback();
                }
                default:
                    return _callback();
            }
        };
        this.cmd = "UID STORE " + num + " FLAGS.SILENT (\\Deleted)";
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " " + this.cmd;
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this.writable) {
            return this.push(this.cmd + '\r\n');
        }
        return this.imapServer.destroyAll(null);
    };
    ImapServerSwitchStream.prototype.expunge = function (CallBack) {
        var _this = this;
        this.doCommandCallback = function (err) {
            return CallBack(err, _this.newSwitchRet);
        };
        this.commandProcess = function (text, cmdArray, next, _callback) {
            switch (cmdArray[0]) {
                case '*': {
                    if (/^RECENT$|^EXPUNGE$|^EXISTS$/i.test(cmdArray[2]) && parseInt(cmdArray[1]) > 0) {
                        //console.log (`\n\nexpunge this.newSwitchRet = true\n\n`)
                        _this.newSwitchRet = true;
                    }
                    return _callback();
                }
                default:
                    return _callback();
            }
        };
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " EXPUNGE";
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this.writable) {
            return this.push(this.cmd + '\r\n');
        }
        return this.imapServer.destroyAll(null);
    };
    ImapServerSwitchStream.prototype.listAllMailBox = function (CallBack) {
        var boxes = [];
        this.doCommandCallback = function (err) {
            if (err)
                return CallBack(err);
            return CallBack(null, boxes);
        };
        this.commandProcess = function (text, cmdArray, next, _callback) {
            switch (cmdArray[0]) {
                case '*': {
                    debug ? exports.saveLog("IMAP listAllMailBox this.commandProcess text = [" + text + "]") : null;
                    if (/^LIST/i.test(cmdArray[1])) {
                        boxes.push(cmdArray[2] + ',' + cmdArray[4]);
                    }
                    return _callback();
                }
                default:
                    return _callback();
            }
        };
        this.Tag = "A" + this.imapServer.TagCount1();
        this.cmd = this.Tag + " LIST \"\" \"*\"";
        this.debug ? debugOut(this.cmd, false, this.imapServer.listenFolder || this.imapServer.imapSerialID) : null;
        if (this.writable)
            return this.push(this.cmd + '\r\n');
        return this.imapServer.destroyAll(null);
    };
    return ImapServerSwitchStream;
}(Stream.Transform));
var connectTimeOut = 10 * 1000;
var qtGateImap = /** @class */ (function (_super) {
    __extends(qtGateImap, _super);
    function qtGateImap(IMapConnect, listenFolder, deleteBoxWhenEnd, writeFolder, debug, newMail, skipOldMail) {
        if (skipOldMail === void 0) { skipOldMail = true; }
        var _this = _super.call(this) || this;
        _this.IMapConnect = IMapConnect;
        _this.listenFolder = listenFolder;
        _this.deleteBoxWhenEnd = deleteBoxWhenEnd;
        _this.writeFolder = writeFolder;
        _this.debug = debug;
        _this.newMail = newMail;
        _this.skipOldMail = skipOldMail;
        _this.imapStream = new ImapServerSwitchStream(_this, _this.deleteBoxWhenEnd, _this.debug);
        _this.newSwitchRet = null;
        _this.newSwitchError = null;
        _this.fetching = null;
        _this.tagcount = 0;
        _this.domainName = _this.IMapConnect.imapUserName.split('@')[1];
        _this.serverSupportTag = null;
        _this.idleSupport = null;
        _this.condStoreSupport = null;
        _this.literalPlus = null;
        _this.fetchAddCom = '';
        _this.imapEnd = false;
        _this.imapSerialID = Crypto.createHash('md5').update(JSON.stringify(_this.IMapConnect)).digest('hex').toUpperCase();
        _this.port = typeof _this.IMapConnect.imapPortNumber === 'object' ? _this.IMapConnect.imapPortNumber[0] : _this.IMapConnect.imapPortNumber;
        _this.connect();
        _this.once("error", function (err) {
            debug ? exports.saveLog("[" + _this.imapSerialID + "] this.on error " + (err && err.message ? err.message : null)) : null;
            _this.imapEnd = true;
            return _this.destroyAll(err);
        });
        return _this;
    }
    qtGateImap.prototype.TagCount1 = function () {
        return ++this.tagcount;
    };
    qtGateImap.prototype.connect = function () {
        var _this = this;
        var _connect = function () {
            clearTimeout(timeout);
            console.log(Util.inspect({ ConnectTo_Imap_Server: true, servername: _this.IMapConnect.imapServer, IPaddress: _this.socket.remoteAddress }, false, 2, true));
            _this.socket.setKeepAlive(true);
            _this.socket.pipe(_this.imapStream).pipe(_this.socket).once('error', function (err) {
                return _this.destroyAll(err);
            }).once('end', function () {
                return _this.destroyAll(null);
            });
        };
        //console.log ( `qtGateImap connect mail server [${ this.IMapConnect.imapServer }: ${ this.port }] setTimeout [${ connectTimeOut /1000 }] !`)
        var timeout = setTimeout(function () {
            return _this.socket.destroy(new Error('connect time out!'));
        }, connectTimeOut);
        this.socket = Tls.connect({ host: this.IMapConnect.imapServer, port: this.port }, _connect);
        return this.socket.on('error', function (err) {
            return _this.destroyAll(err);
        });
    };
    qtGateImap.prototype.destroyAll = function (err) {
        //console.trace (`class qtGateImap on destroyAll`, err )
        this.imapEnd = true;
        if (this.socket && typeof this.socket.end === 'function') {
            this.socket.end();
        }
        return this.emit('end', err);
    };
    qtGateImap.prototype.logout = function (CallBack) {
        var _this = this;
        if (CallBack === void 0) { CallBack = null; }
        console.log("IMAP logout");
        var _end = function () {
            if (typeof CallBack === 'function') {
                return CallBack();
            }
        };
        if (this.imapEnd) {
            console.log("this.imapEnd");
            return _end();
        }
        this.imapEnd = true;
        console.log("this.imapStream.loginoutWithCheck");
        return this.imapStream.loginoutWithCheck(function () {
            if (_this.socket && typeof _this.socket.end === 'function') {
                _this.socket.end();
            }
            _this.emit('end');
            return _end();
        });
    };
    return qtGateImap;
}(Event.EventEmitter));
exports.qtGateImap = qtGateImap;
var seneMessageToFolder = function (IMapConnect, writeFolder, message, subject, createFolder, CallBack) {
    var wImap = new qtGateImap(IMapConnect, null, false, writeFolder, debug, null);
    var _callback = false;
    //console.log ( `seneMessageToFolder !!! ${ subject }`)
    wImap.once('error', function (err) {
        wImap.destroyAll(err);
        if (!_callback) {
            CallBack(err);
            return _callback = true;
        }
    });
    wImap.once('ready', function () {
        Async.series([
            function (next) {
                if (!createFolder) {
                    return next();
                }
                return wImap.imapStream.createBox(false, writeFolder, next);
            },
            function (next) { return wImap.imapStream.appendStreamV4(message, subject, writeFolder, next); },
            function (next) { return wImap.imapStream._logoutWithoutCheck(next); }
        ], function (err) {
            _callback = true;
            if (err) {
                wImap.destroyAll(err);
            }
            return CallBack(err);
        });
    });
};
exports.seneMessageToFolder = seneMessageToFolder;
var qtGateImapRead = /** @class */ (function (_super) {
    __extends(qtGateImapRead, _super);
    function qtGateImapRead(IMapConnect, listenFolder, deleteBoxWhenEnd, newMail, skipOldMail) {
        if (skipOldMail === void 0) { skipOldMail = false; }
        var _this = _super.call(this, IMapConnect, listenFolder, deleteBoxWhenEnd, null, debug, newMail, skipOldMail) || this;
        _this.openBox = false;
        _this.once('ready', function () {
            _this.openBox = true;
        });
        return _this;
    }
    return qtGateImapRead;
}(qtGateImap));
exports.qtGateImapRead = qtGateImapRead;
var getMailAttached = function (email) {
    var attachmentStart = email.indexOf('\r\n\r\n');
    if (attachmentStart < 0) {
        console.log("getMailAttached error! can't faind mail attahced start!\n" + email.toString());
        return '';
    }
    var attachment = email.slice(attachmentStart + 4);
    return attachment.toString();
};
exports.getMailAttached = getMailAttached;
var getMailSubject = function (email) {
    var ret = email.toString().split('\r\n\r\n')[0].split('\r\n');
    var yy = ret.find(function (n) {
        return /^subject\: /i.test(n);
    });
    if (!yy || !yy.length) {
        debug ? exports.saveLog("\n\n" + ret + " \n") : null;
        return '';
    }
    return yy.split(/^subject\: +/i)[1];
};
exports.getMailSubject = getMailSubject;
var getMailAttachedBase64 = function (email) {
    var attachmentStart = email.indexOf('\r\n\r\n');
    if (attachmentStart < 0) {
        console.log("getMailAttached error! can't faind mail attahced start!");
        return null;
    }
    var attachment = email.slice(attachmentStart + 4);
    return attachment.toString();
};
exports.getMailAttachedBase64 = getMailAttachedBase64;
var imapAccountTest = function (IMapConnect, CallBack) {
    debug ? exports.saveLog("start test imap [" + IMapConnect.imapUserName + "]", true) : null;
    var callbackCall = false;
    var listenFolder = Uuid.v4();
    var ramdomText = Crypto.randomBytes(20);
    var timeout = null;
    var doCallBack = function (err, ret) {
        if (!callbackCall) {
            exports.saveLog("imapAccountTest doing callback err [" + (err && err.message ? err.message : "undefine ") + "] ret [" + (ret ? ret : 'undefine') + "]");
            callbackCall = true;
            clearTimeout(timeout);
            return CallBack(err, ret);
        }
    };
    var rImap = new qtGateImapRead(IMapConnect, listenFolder, debug, function (mail) {
        rImap.logout();
    });
    rImap.once('ready', function () {
        rImap.logout();
    });
    rImap.once('end', function (err) {
        console.log("imapAccountTest on end err = ", err);
        doCallBack(err);
    });
    rImap.once('error', function (err) {
        debug ? exports.saveLog("rImap.once ( 'error' ) [" + err.message + "]", true) : null;
    });
};
exports.imapAccountTest = imapAccountTest;
var imapGetMediaFile = function (IMapConnect, fileName, CallBack) {
    var rImap = new qtGateImapRead(IMapConnect, fileName, debug, function (mail) {
        rImap.logout();
        var retText = exports.getMailAttachedBase64(mail);
        return CallBack(null, retText);
    });
};
exports.imapGetMediaFile = imapGetMediaFile;
var pingPongTimeOut = 1000 * 15;
var resetConnectTimeLength = 1000 * 60 * 30;
var imapPeer = /** @class */ (function (_super) {
    __extends(imapPeer, _super);
    function imapPeer(imapData, listenBox, writeBox, newMail, exit) {
        var _this = _super.call(this) || this;
        _this.imapData = imapData;
        _this.listenBox = listenBox;
        _this.writeBox = writeBox;
        _this.newMail = newMail;
        _this.exit = exit;
        _this.domainName = _this.imapData.imapUserName.split('@')[1];
        _this.waitingReplyTimeOut = null;
        _this.pingUuid = null;
        _this.doingDestroy = false;
        _this.peerReady = false;
        _this.makeRImap = false;
        _this.needPingTimeOut = null;
        _this.pinging = false;
        _this.connected = false;
        _this.rImap_restart = false;
        _this.checkSocketConnectTime = null;
        _this.rImap = null;
        debug ? exports.saveLog("doing peer account [" + imapData.imapUserName + "] listen with[" + listenBox + "], write with [" + writeBox + "] ") : null;
        console.dir("newMail = " + typeof newMail);
        _this.newReadImap();
        return _this;
    }
    imapPeer.prototype.restart_rImap = function () {
        var _this = this;
        var _a, _b;
        console.dir('restart_rImap');
        if (this.rImap_restart) {
            return console.log("already restart_rImap STOP!");
        }
        this.rImap_restart = true;
        if (typeof ((_b = (_a = this.rImap) === null || _a === void 0 ? void 0 : _a.imapStream) === null || _b === void 0 ? void 0 : _b.loginoutWithCheck) === 'function') {
            return this.rImap.imapStream.loginoutWithCheck(function () {
                if (typeof _this.exit === 'function') {
                    _this.exit(0);
                }
            });
        }
        if (typeof this.exit === 'function') {
            this.exit(0);
        }
    };
    imapPeer.prototype.checklastAccessTime = function () {
        var _this = this;
        clearTimeout(this.checkSocketConnectTime);
        return this.checkSocketConnectTime = setTimeout(function () {
            return _this.restart_rImap();
        }, resetConnectTimeLength);
    };
    imapPeer.prototype.mail = function (email) {
        //console.log (`imapPeer new mail:\n\n${ email.toString()} this.pingUuid = [${ this.pingUuid  }]`)
        var subject = exports.getMailSubject(email);
        var attr = exports.getMailAttached(email);
        console.log(email.toString());
        /**
         * 			PING get PONG
         */
        if (subject === this.pingUuid) {
            this.pingUuid = null;
            this.connected = true;
            this.pinging = false;
            clearTimeout(this.waitingReplyTimeOut);
            return this.emit('CoNETConnected', attr);
        }
        if (subject) {
            /**
             *
             *
             *
             */
            if (attr.length < 40) {
                console.log("new attr\n" + attr + "\n");
                var _attr = attr.split(/\r?\n/)[0];
                if (!this.connected && !this.pinging) {
                    this.Ping(false);
                }
                if (subject === _attr) {
                    console.log("\n\nthis.replyPing [" + _attr + "]\n\n this.ping.uuid = [" + this.pingUuid + "]");
                    return this.replyPing(subject);
                }
                console.log("this.pingUuid = [" + this.pingUuid + "] subject [" + subject + "]");
                return console.log("new attr\n" + _attr + "\n _attr [" + buffer_1.Buffer.from(_attr).toString('hex') + "] subject [" + buffer_1.Buffer.from(subject).toString('hex') + "]]!== attr \u3010" + JSON.stringify(_attr) + "\u3011");
            }
            /**
             * 			ignore old mail
             */
            if (!this.connected) {
                return;
            }
            return this.newMail(attr, subject);
        }
        console.log("get mail have not subject\n\n", email.toString());
    };
    imapPeer.prototype.replyPing = function (uuid) {
        console.log("\n\nreplyPing = [" + uuid + "]\n\n");
        return this.AppendWImap1(uuid, uuid, function (err) {
            if (err) {
                debug ? exports.saveLog("reply Ping ERROR! [" + (err.message ? err.message : null) + "]") : null;
            }
        });
    };
    imapPeer.prototype.AppendWImap1 = function (mail, uuid, CallBack) {
        return exports.seneMessageToFolder(this.imapData, this.writeBox, mail, uuid, false, CallBack);
    };
    imapPeer.prototype.setTimeOutOfPing = function (sendMail) {
        var _this = this;
        console.trace("setTimeOutOfPing [" + this.pingUuid + "]");
        clearTimeout(this.waitingReplyTimeOut);
        clearTimeout(this.needPingTimeOut);
        debug ? exports.saveLog("Make Time Out for a Ping, ping ID = [" + this.pingUuid + "]", true) : null;
        return this.waitingReplyTimeOut = setTimeout(function () {
            debug ? exports.saveLog("ON setTimeOutOfPing this.emit ( 'pingTimeOut' ) pingID = [" + _this.pingUuid + "] ", true) : null;
            _this.pingUuid = null;
            _this.connected = false;
            _this.pinging = false;
            return _this.emit('pingTimeOut');
        }, sendMail ? pingPongTimeOut * 8 : pingPongTimeOut);
    };
    imapPeer.prototype.Ping = function (sendMail) {
        var _this = this;
        if (this.pinging) {
            return console.trace('Ping stopd! pinging = true !');
        }
        this.pinging = true;
        this.emit('ping');
        this.pingUuid = Uuid.v4();
        debug ? exports.saveLog("doing ping test! this.pingUuid = [" + this.pingUuid + "], sendMail = [" + sendMail + "]") : null;
        return this.AppendWImap1(null, this.pingUuid, function (err) {
            if (err) {
                _this.pinging = false;
                _this.pingUuid = null;
                console.dir("PING this.AppendWImap1 Error [" + err.message + "]");
                return _this.Ping(sendMail);
            }
            return _this.setTimeOutOfPing(sendMail);
        });
    };
    imapPeer.prototype.newReadImap = function () {
        var _this = this;
        if (this.makeRImap || this.rImap && this.rImap.imapStream && this.rImap.imapStream.readable) {
            return debug ? exports.saveLog("newReadImap have rImap.imapStream.readable = true, stop!", true) : null;
        }
        this.makeRImap = true;
        //saveLog ( `=====> newReadImap!`, true )
        this.rImap = new qtGateImapRead(this.imapData, this.listenBox, debug, function (email) {
            _this.mail(email);
        }, true);
        this.rImap.once('ready', function () {
            _this.emit('ready');
            _this.makeRImap = _this.rImap_restart = false;
            //debug ? saveLog ( `this.rImap.once on ready `): null
            _this.Ping(false);
            _this.checklastAccessTime();
        });
        this.rImap.on('error', function (err) {
            _this.makeRImap = false;
            debug ? exports.saveLog("rImap on Error [" + err.message + "]", true) : null;
            if (err && err.message && /auth|login|log in|Too many simultaneous|UNAVAILABLE/i.test(err.message)) {
                return _this.destroy(1);
            }
            if (_this.rImap && _this.rImap.destroyAll && typeof _this.rImap.destroyAll === 'function') {
                return _this.rImap.destroyAll(null);
            }
        });
        this.rImap.on('end', function (err) {
            _this.rImap.removeAllListeners();
            _this.rImap = null;
            _this.makeRImap = false;
            clearTimeout(_this.waitingReplyTimeOut);
            if (_this.rImap_restart) {
                console.dir("rImap.on ( 'end' ) this.rImap_restart = TRUE", err);
            }
            if (typeof _this.exit === 'function') {
                debug ? exports.saveLog("imapPeer rImap on END!") : null;
                _this.exit(err);
                return _this.exit = null;
            }
            debug ? exports.saveLog("imapPeer rImap on END! but this.exit have not a function ") : null;
        });
    };
    imapPeer.prototype.destroy = function (err) {
        var _this = this;
        clearTimeout(this.waitingReplyTimeOut);
        clearTimeout(this.needPingTimeOut);
        clearTimeout(this.checkSocketConnectTime);
        console.log("destroy IMAP!");
        console.trace();
        if (this.doingDestroy) {
            return console.log("destroy but this.doingDestroy = ture");
        }
        this.doingDestroy = true;
        this.peerReady = false;
        if (this.rImap) {
            return this.rImap.imapStream.loginoutWithCheck(function () {
                if (typeof _this.exit === 'function') {
                    _this.exit(err);
                    _this.exit = null;
                }
            });
        }
        if (this.exit && typeof this.exit === 'function') {
            this.exit(err);
            this.exit = null;
        }
    };
    imapPeer.prototype.sendDataToANewUuidFolder = function (data, writeBox, subject, CallBack) {
        return exports.seneMessageToFolder(this.imapData, writeBox, data, subject, !this.connected, CallBack);
    };
    return imapPeer;
}(Event.EventEmitter));
exports.imapPeer = imapPeer;
