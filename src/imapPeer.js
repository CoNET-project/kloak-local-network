"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.imapPeer = exports.seneMessageToFolder = void 0;
const events_1 = require("events");
const Imap_1 = require("./Imap");
const async_1 = require("async");
const uuid_1 = require("uuid");
const resetConnectTimeLength = 1000 * 60 * 15;
const pingPongTimeOut = 1000 * 15;
const debug = true;
const seneMessageToFolder = (IMapConnect, writeFolder, message, subject, createFolder, CallBack) => {
    const wImap = new Imap_1.qtGateImap(IMapConnect, null, false, writeFolder, debug, null);
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
        this.domainName = this.imapData.imapUserName.split('@')[1];
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
        this.rImap = null;
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
        if (typeof this.rImap?.imapStream?.loginoutWithCheck === 'function') {
            return this.rImap.imapStream.loginoutWithCheck(() => {
                if (typeof this.exit === 'function') {
                    this.exit(0);
                }
            });
        }
        if (typeof this.exit === 'function') {
            this.exit(0);
        }
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
        if (attr.length < 40) {
            const _attr = attr.split(/\r?\n/)[0];
            if (!this.connected && !this.pinging) {
                this.Ping(false);
            }
            if (subject === _attr) {
                console.log(`\n\nthis.replyPing [${_attr}]\n\n this.ping.uuid = [${this.pingUuid}]`);
                return this.replyPing(subject);
            }
            return console.log(`new attr\n${_attr}\n _attr [${Buffer.from(_attr).toString('hex')}] subject [${Buffer.from(subject).toString('hex')}]]!== attr 【${JSON.stringify(_attr)}】`);
        }
        /**
         * 			ignore old mail
         */
        if (!this.connected) {
            return;
        }
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
        if (this.makeRImap || this.rImap && this.rImap.imapStream && this.rImap.imapStream.readable) {
            return debug ? Imap_1.saveLog(`newReadImap have rImap.imapStream.readable = true, stop!`, true) : null;
        }
        this.makeRImap = true;
        //saveLog ( `=====> newReadImap!`, true )
        this.rImap = new Imap_1.qtGateImapRead(this.imapData, this.listenBox, debug, email => {
            this.mail(email);
        }, true);
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
                return this.destroy(1);
            }
            if (this.rImap && this.rImap.destroyAll && typeof this.rImap.destroyAll === 'function') {
                return this.rImap.destroyAll(null);
            }
        });
        this.rImap.on('end', err => {
            this.rImap.removeAllListeners();
            this.rImap = null;
            this.makeRImap = false;
            clearTimeout(this.waitingReplyTimeOut);
            if (this.rImap_restart) {
                console.dir(`rImap.on ( 'end' ) this.rImap_restart = TRUE`, err);
            }
            if (typeof this.exit === 'function') {
                debug ? Imap_1.saveLog(`imapPeer rImap on END!`) : null;
                this.exit(err);
                return this.exit = null;
            }
            debug ? Imap_1.saveLog(`imapPeer rImap on END! but this.exit have not a function `) : null;
        });
    }
    closePeer(CallBack) {
        return async_1.series([
            next => this.AppendWImap1('', 'Close.', next),
            next => this.rImap.logout(next)
        ], CallBack);
    }
    destroy(err) {
        clearTimeout(this.waitingReplyTimeOut);
        clearTimeout(this.needPingTimeOut);
        clearTimeout(this.checkSocketConnectTime);
        console.log(`destroy IMAP!`);
        console.trace();
        if (this.doingDestroy) {
            return console.log(`destroy but this.doingDestroy = ture`);
        }
        this.doingDestroy = true;
        this.peerReady = false;
        if (this.rImap) {
            return this.rImap.imapStream.loginoutWithCheck(() => {
                if (typeof this.exit === 'function') {
                    this.exit(err);
                    this.exit = null;
                }
            });
        }
        if (this.exit && typeof this.exit === 'function') {
            this.exit(err);
            this.exit = null;
        }
    }
    sendDataToANewUuidFolder(data, writeBox, subject, CallBack) {
        return exports.seneMessageToFolder(this.imapData, writeBox, data, subject, !this.connected, CallBack);
    }
}
exports.imapPeer = imapPeer;
