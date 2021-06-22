"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.imapPeer = exports.seneMessageToFolder = void 0;
const events_1 = require("events");
const Imap_1 = require("./Imap");
const async_1 = require("async");
const uuid_1 = require("uuid");
const util_1 = require("util");
const resetConnectTimeLength = 1000 * 60 * 10;
const pingPongTimeOut = 1000 * 10;
const debug = true;
const seneMessageToFolder = (IMapConnect, writeFolder, message, subject, createFolder, CallBack) => {
    const wImap = new Imap_1.qtGateImap(IMapConnect, null, false, writeFolder, debug, null, true);
    let _callback = false;
    //console.log ( `seneMessageToFolder !!! ${ subject }`)
    wImap.once('error', err => {
        wImap.destroyAll(err);
        if (!_callback) {
            CallBack(err);
            return _callback = true;
        }
    });
    wImap.once('ready', () => {
        async_1.series([
            next => {
                if (!createFolder) {
                    return next();
                }
                return wImap.imapStream.createBox(false, writeFolder, next);
            },
            next => wImap.imapStream.appendStreamV4(message, subject, writeFolder, next),
            next => wImap.imapStream._logoutWithoutCheck(next)
        ], err => {
            _callback = true;
            if (err) {
                wImap.destroyAll(err);
            }
            return CallBack(err);
        });
    });
};
exports.seneMessageToFolder = seneMessageToFolder;
class imapPeer extends events_1.EventEmitter {
    constructor(imapData, listenBox, writeBox, newMail, exit) {
        super();
        this.imapData = imapData;
        this.listenBox = listenBox;
        this.writeBox = writeBox;
        this.newMail = newMail;
        this.exit = exit;
        this.domainName = '';
        this.waitingReplyTimeOut = null;
        this.pingUuid = null;
        this.doingDestroy = false;
        this.peerReady = false;
        this.makeRImap = false;
        this.needPingTimeOut = null;
        this.pinging = false;
        this.connected = false;
        this.rImap_restart = false;
        this.checkSocketConnectTime = null;
        this.serialID = uuid_1.v4();
        this.imapEnd = false;
        this.rImap = null;
        this.domainName = this.imapData.imapUserName.split('@')[1];
        debug ? Imap_1.saveLog(`doing peer account [${imapData.imapUserName}] listen with[${listenBox}], write with [${writeBox}] `) : null;
        console.dir(`newMail = ${typeof newMail}`);
        this.newReadImap();
    }
    restart_rImap() {
        console.dir('restart_rImap');
        if (this.rImap_restart) {
            return console.log(`already restart_rImap STOP!`);
        }
        this.rImap_restart = true;
        return this.destroy(null);
    }
    checklastAccessTime() {
        clearTimeout(this.checkSocketConnectTime);
        return this.checkSocketConnectTime = setTimeout(() => {
            return this.restart_rImap();
        }, resetConnectTimeLength);
    }
    mail(email) {
        console.log(`imapPeer new mail:\n\n${email.toString()} this.pingUuid = [${this.pingUuid}]`);
        const subject = Imap_1.getMailSubject(email);
        const attr = Imap_1.getMailAttached(email);
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
        if (attr.length < 1) {
            return console.log(util_1.inspect({ "skip old ping": subject }, false, 3, true));
        }
        if (attr.length < 100) {
            const _attr = attr.split(/\r?\n/)[0];
            if (!this.connected && !this.pinging) {
                //this.Ping ( false )
            }
            console.log(`\n\nthis.replyPing [${_attr}]\n\n this.ping.uuid = [${this.pingUuid}]`);
            return this.replyPing(subject);
        }
        /**
         * 			ignore old mail
         */
        // if ( ! this.connected ) {
        //     return
        // }
        return this.newMail(attr, subject);
    }
    replyPing(uuid) {
        console.log(`\n\nreplyPing = [${uuid}]\n\n`);
        return this.AppendWImap1(uuid, uuid, err => {
            if (err) {
                debug ? Imap_1.saveLog(`reply Ping ERROR! [${err.message ? err.message : null}]`) : null;
            }
        });
    }
    AppendWImap1(mail, uuid, CallBack) {
        const sendData = mail ? Buffer.from(mail).toString('base64') : '';
        return exports.seneMessageToFolder(this.imapData, this.writeBox, sendData, uuid, true, CallBack);
    }
    setTimeOutOfPing(sendMail) {
        console.trace(`setTimeOutOfPing [${this.pingUuid}]`);
        clearTimeout(this.waitingReplyTimeOut);
        clearTimeout(this.needPingTimeOut);
        debug ? Imap_1.saveLog(`Make Time Out for a Ping, ping ID = [${this.pingUuid}]`, true) : null;
        return this.waitingReplyTimeOut = setTimeout(() => {
            debug ? Imap_1.saveLog(`ON setTimeOutOfPing this.emit ( 'pingTimeOut' ) pingID = [${this.pingUuid}] `, true) : null;
            this.pingUuid = null;
            this.connected = false;
            this.pinging = false;
            return this.emit('pingTimeOut');
        }, pingPongTimeOut);
    }
    Ping(sendMail) {
        if (this.pinging) {
            return console.trace('Ping stopd! pinging = true !');
        }
        this.pinging = true;
        this.emit('ping');
        this.pingUuid = uuid_1.v4();
        debug ? Imap_1.saveLog(`doing ping test! this.pingUuid = [${this.pingUuid}], sendMail = [${sendMail}]`) : null;
        return this.AppendWImap1(null, this.pingUuid, err => {
            if (err) {
                this.pinging = false;
                this.pingUuid = null;
                console.dir(`PING this.AppendWImap1 Error [${err.message}]`);
                return this.Ping(sendMail);
            }
            return this.setTimeOutOfPing(sendMail);
        });
    }
    newReadImap() {
        if (this.imapEnd || this.makeRImap || this.rImap && this.rImap.imapStream && this.rImap.imapStream.readable) {
            return debug ? Imap_1.saveLog(`newReadImap have rImap.imapStream.readable = true, stop!`, true) : null;
        }
        this.rImap_restart = false;
        this.makeRImap = true;
        console.log(util_1.inspect({ newReadImap: new Error('newReadImap') }, false, 3, true));
        this.rImap = new Imap_1.qtGateImapRead(this.imapData, this.listenBox, debug, email => {
            this.mail(email);
        });
        this.rImap.once('ready', () => {
            this.emit('ready');
            this.makeRImap = this.rImap_restart = false;
            //debug ? saveLog ( `this.rImap.once on ready `): null
            this.Ping(false);
            this.checklastAccessTime();
        });
        this.rImap.on('error', err => {
            this.makeRImap = false;
            debug ? Imap_1.saveLog(`rImap on Error [${err.message}]`, true) : null;
            if (err && err.message && /auth|login|log in|Too many simultaneous|UNAVAILABLE/i.test(err.message)) {
                return this.destroy(null);
            }
            if (this.rImap && this.rImap.destroyAll && typeof this.rImap.destroyAll === 'function') {
                this.rImap.destroyAll(null);
                return this.destroy(null);
            }
        });
        this.rImap.on('end', err => {
            console.log(util_1.inspect({ "this.rImap.on ( 'end' )": err }, false, 3, true));
        });
    }
    closePeer(CallBack) {
        this.imapEnd = true;
        this.AppendWImap1('', 'Close.', err => {
            if (typeof this.rImap?.logout === 'function') {
                return this.rImap.logout(CallBack);
            }
            return CallBack();
        });
    }
    cleanupImap(err) {
        this.rImap.removeAllListeners();
        this.rImap = null;
        this.doingDestroy = false;
        if (this.restart_rImap) {
            return this.newReadImap();
        }
        if (err && typeof this.exit === 'function') {
            this.exit(err);
            return this.exit = null;
        }
        console.log(util_1.inspect({ restart_rImap: `restart listenIMAP with restart_rImap false!` }, false, 3, true));
        this.newReadImap();
    }
    destroy(err) {
        clearTimeout(this.waitingReplyTimeOut);
        clearTimeout(this.needPingTimeOut);
        clearTimeout(this.checkSocketConnectTime);
        console.log(util_1.inspect({ destroy: new Error() }, false, 3, true));
        if (this.doingDestroy) {
            return console.log(`destroy but this.doingDestroy = ture`);
        }
        this.doingDestroy = true;
        this.peerReady = false;
        if (typeof this.rImap?.imapStream?.loginoutWithCheck) {
            console.log(util_1.inspect({ destroy: `imapStream?.loginoutWithCheck()` }));
            return this.rImap?.imapStream?.loginoutWithCheck(() => {
                return this.cleanupImap(err);
            });
        }
        return this.cleanupImap(err);
    }
    sendDataToANewUuidFolder(data, writeBox, subject, CallBack) {
        return exports.seneMessageToFolder(this.imapData, writeBox, data, subject, !this.connected, CallBack);
    }
}
exports.imapPeer = imapPeer;
