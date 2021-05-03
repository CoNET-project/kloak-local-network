"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInformationFromSeguro = exports.buildConnect = exports.testImapServer = void 0;
const tls_1 = require("tls");
const async_1 = require("async");
const Imap_1 = require("./Imap");
const imapPeer_1 = require("./imapPeer");
const connerver = (imapServer, callback) => {
    let err = null;
    let time;
    const _connect = () => {
        time = new Date().getTime() - startTime;
        conn.end();
        return callback(null, time);
    };
    const startTime = new Date().getTime();
    const conn = tls_1.connect({ host: imapServer, servername: imapServer, port: 993 }, _connect);
    conn.once('error', _err => {
        err = _err;
        if (typeof conn.destroy === 'function') {
            conn.destroy();
        }
        callback(err);
    });
    conn.once('timeout', () => {
        err = new Error('timeout');
        if (typeof conn.destroy === 'function') {
            conn.destroy();
        }
        callback(err);
    });
};
/**
 * Test network online
 * @param CallBack
 * Test results Array for 'imap.gmail.com', 'imap.mail.yahoo.com','imap.mail.me.com','outlook.office365.com','imap.zoho.com'
 * test connecting with tls 993 port
 * {
 * 		name: server name
 * 		err: Error | null if have not error
 * 		time: connected time | null if have error
 * }
 */
const testImapServer = (callback) => {
    const imapServers = ['imap.gmail.com', 'imap.mail.yahoo.com', 'imap.mail.me.com', 'outlook.office365.com', 'imap.zoho.com'];
    const ret = [];
    async_1.each(imapServers, (n, next) => {
        return connerver(n, (err, data) => {
            ret.push({ name: n, err: err, time: data });
            next();
        });
    }, () => {
        return callback(null, ret);
    });
};
exports.testImapServer = testImapServer;
const buildConnectGetImap = (requestObj, callback) => {
    const imapData = {
        imapPortNumber: requestObj.imap_account.imap_port_number,
        imapUserName: requestObj.imap_account.imap_username,
        imapUserPassword: requestObj.imap_account.imap_user_password,
        imapSsl: true,
        imapServer: requestObj.imap_account.imap_server
    };
    let appendCount = 0;
    const newMail = mail => {
        requestObj.encrypted_response = Imap_1.getMailAttached(mail);
        return cleanUp();
    };
    const cleanUp = () => {
        return rImap.logout(() => {
            callback(null, requestObj);
        });
    };
    const sendMessage = () => {
        return imapPeer_1.sendMessageToFolder(imapData, requestObj.server_folder, Buffer.from(requestObj.encrypted_request).toString('base64'), '', false, err => {
            if (err) {
                console.log(err);
                if (++appendCount > 3) {
                    requestObj.error = `imap append error [${err.message}]`;
                    return cleanUp();
                }
                return sendMessage();
            }
        });
    };
    const rImap = new Imap_1.qtGateImapRead(imapData, requestObj.client_folder_name, false, newMail, false);
    rImap.once('ready', () => {
        return sendMessage();
    });
};
const buildConnect = (responseJson, callback) => {
    if (!responseJson) {
        return callback(new Error('Data format error!'));
    }
    const imapData = {
        imapPortNumber: responseJson.imap_account.imap_port_number,
        imapServer: responseJson.imap_account.imap_server,
        imapSsl: true,
        imapUserName: responseJson.imap_account.imap_username,
        imapUserPassword: responseJson.imap_account.imap_user_password
    };
    const newMessage = message => {
        console.log(`buildConnect newMessage`, newMessage.toString());
        callback(null, { encryptedMessage: message });
    };
    const exit = err => {
        callback(null, { status: 'End.' });
    };
    const _imapPeer = new imapPeer_1.imapPeer(imapData, responseJson.client_folder, responseJson.server_folder, newMessage, exit);
    _imapPeer.on('CoNETConnected', () => {
        callback(null, { status: 'Connected to Seguro network.', connectUUID: _imapPeer.serialID });
    });
    _imapPeer.on('ready', () => {
        callback(null, { status: 'Connect to email server, waiting Seguro response.', connectUUID: _imapPeer.serialID });
    });
    return _imapPeer;
};
exports.buildConnect = buildConnect;
/**
 *
 * @param requestObj: connectRequest, request object
 * @param encryptedMessage: string, Encrypted with Seguro public key and sign by device key
 * @param CallBack: ( err: Error, response: connectRequest ), response from Seguro | Error
 */
const getInformationFromSeguro = (requestObj, CallBack) => {
    return buildConnectGetImap(requestObj, CallBack);
};
exports.getInformationFromSeguro = getInformationFromSeguro;