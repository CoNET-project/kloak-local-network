"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const ws_1 = require("ws");
const openpgp_1 = require("openpgp");
const path_1 = require("path");
const jszip = require("jszip");
const fse = require("fs-extra");
const Imap_1 = require("./Imap");
const util_1 = require("util");
const network_1 = require("./network");
const upload = require('multer')();
const cors = require('cors');
const getEncryptedMessagePublicKeyID = async (encryptedMessage, CallBack) => {
    const encryptObj = await openpgp_1.readMessage({ armoredMessage: encryptedMessage });
    return CallBack(null, encryptObj.getEncryptionKeyIds().map(n => n.toHex().toUpperCase()));
};
class LocalServer {
    constructor(PORT = 3000, appsPath = path_1.join(__dirname, 'apps')) {
        this.PORT = PORT;
        this.appsPath = appsPath;
        this.localserver = null;
        this.connect_peer_pool = [];
        this.unzipApplication = async (buffer) => {
            return jszip
                .loadAsync(buffer)
                .then((zip) => {
                return zip.forEach(async (relativePath, file) => {
                    if (file.dir) {
                        const dirPath = path_1.normalize(this.appsPath + relativePath);
                        try {
                            return await fse.mkdir(dirPath);
                        }
                        catch (err) {
                            return;
                        }
                    }
                    return file.async('nodebuffer').then(async (data) => {
                        const filePath = path_1.normalize(this.appsPath + relativePath);
                        await fse.writeFile(filePath, data);
                    });
                });
            })
                .catch(err => {
                throw err;
            });
        };
        this.initialize = async () => {
            const app = express();
            const wsServer = new ws_1.Server({ noServer: true });
            const wsServerConnect = new ws_1.Server({ noServer: true });
            app.use(express.static('static'));
            const folder = path_1.join(this.appsPath, 'launcher');
            app.use('/', express.static(folder));
            app.use(express.json());
            app.use(cors());
            app.once('error', (err) => {
                console.log(err);
                return process.exit(1);
            });
            app.get('/', async (req, res) => {
                // res.sendStatus(200)
                console.log(this.appsPath);
                const launcherHTMLPath = path_1.join(this.appsPath + '/launcher' + '/index.html');
                const hasLauncher = await fse.pathExists(launcherHTMLPath);
                console.log(launcherHTMLPath);
                if (hasLauncher) {
                    return res.status(200).sendFile(launcherHTMLPath);
                }
                return res.status(200).send("<p style='font-family: Arial, Helvetica, sans-serif;'>Oh no! You don't have the Kloak Platform Launcher!</p>");
            });
            app.post('/update', upload.single('app_data'), (req, res) => {
                const { app_id } = req.body;
                const { file } = req;
                if (file.mimetype !== 'application/zip') {
                    res.sendStatus(400);
                    return res.end();
                }
                const rootFolder = path_1.normalize(this.appsPath + '/' + app_id);
                fse.remove(rootFolder, (err) => {
                    if (err) {
                        return res.sendStatus(400);
                    }
                    this.unzipApplication(file.buffer)
                        .then(() => {
                        res.sendStatus(200);
                    })
                        .catch((err) => {
                        res.sendStatus(400);
                    });
                });
            });
            app.post('/testImap', (req, res) => {
                const { body } = req;
                if (!body.imapServer ||
                    !body.imapUserName ||
                    !body.imapUserPassword ||
                    !body.imapPortNumber) {
                    res.sendStatus(400);
                    return res.end();
                }
                return Imap_1.imapAccountTest(body, (err) => {
                    if (err) {
                        res.sendStatus(400);
                        return res.end();
                    }
                    res.sendStatus(200);
                    return res.end();
                });
            });
            /**
             * Test network online
             *
             * Test results Array for imap.gmail.com, imap.mail.yahoo.com, imap.mail.me.com, outlook.office365.com,imap.zoho.com
             * test connecting with tls 993 port
             * {
             * 		name: server name
             * 		err: Error | null if have not error
             * 		time: connected time | null if have error
             * }
             */
            app.get('/testNetwork', (req, res) => {
                return network_1.testImapServer((_err, data) => {
                    return res.json({ data: data });
                });
            });
            /**
             * 			Get IMAP account
             */
            app.post('/getInformationFromSeguro', (req, res) => {
                const requestObj = req.body;
                return network_1.getInformationFromSeguro(requestObj, (err, data) => {
                    if (err) {
                        res.sendStatus(400);
                        return res.end();
                    }
                    return res.json(data);
                });
            });
            /**
             *
             */
            app.post('/postMessage', (req, res) => {
                const post_data = req.body;
                console.log(util_1.inspect({ 'localhost:3000/postMessage': post_data }, false, 2, true));
                if (post_data.connectUUID) {
                    if (!post_data.encryptedMessage) {
                        console.log(util_1.inspect({ postMessage_ERROR_Have_not_encryptedMessage: post_data }, false, 3, true));
                        res.sendStatus(404);
                        return res.end();
                    }
                    const index = this.connect_peer_pool.findIndex(n => n.serialID === post_data.connectUUID);
                    if (index < 0) {
                        console.log(util_1.inspect({ postMessage_ERROR_Have_not_connectUUID: post_data }, false, 3, true));
                        res.sendStatus(404);
                        return res.end();
                    }
                    const ws = this.connect_peer_pool[index];
                    console.log(util_1.inspect({ 'localhost:3000/postMessage post to Seguro network!': post_data.encryptedMessage }, false, 2, true));
                    return ws.AppendWImap1(post_data.encryptedMessage, '', err => {
                        if (err) {
                            res.sendStatus(500);
                            return res.end();
                        }
                        res.end();
                    });
                }
                if (post_data.encryptedMessage) {
                    return getEncryptedMessagePublicKeyID(post_data.encryptedMessage, (err, keys) => {
                        if (!keys || !keys.length) {
                            console.log(util_1.inspect({ postMessage_ERROR_have_not_device_key_infomation: post_data }, false, 3, true));
                            res.sendStatus(500);
                            return res.end();
                        }
                        console.log(util_1.inspect({ getEncryptedMessagePublicKeyID: keys }, false, 3, true));
                        keys.forEach(n => {
                            this.postMessageToLocalDevice(n, post_data.encryptedMessage);
                        });
                        res.end();
                    });
                }
                /**
                 * 			unknow type of ws
                 */
                console.log(util_1.inspect(post_data, false, 3, true));
                console.log(`unknow type of ${post_data}`);
                res.sendStatus(404);
                return res.end();
            });
            wsServerConnect.on('connection', ws => {
                ws.on('message', message => {
                    let kk = null;
                    try {
                        kk = JSON.parse(message);
                    }
                    catch (ex) {
                        ws.send(JSON.stringify({ status: `Data format error! [${message}]` }));
                        return ws.close();
                    }
                    let peer = network_1.buildConnect(kk, (err, data) => {
                        if (err) {
                            ws.send(JSON.stringify({ status: err.message }));
                            return ws.close();
                        }
                        return ws.send(JSON.stringify(data));
                    });
                    const serialID = peer.serialID;
                    this.connect_peer_pool.push(peer);
                    ws.once('close', () => {
                        return peer.closePeer(() => {
                            const index = this.connect_peer_pool.findIndex(n => n.serialID === serialID);
                            if (index > -1) {
                                this.connect_peer_pool.splice(index, 1);
                            }
                            peer = null;
                            console.log(`WS [${serialID}] on close`);
                        });
                    });
                });
            });
            wsServerConnect.on('peerToPeerConnecting', ws => {
                console.log(`wsServerConnect on peerToPeerConnecting`);
                return ws.on('message', async (message) => {
                    let kk = null;
                    try {
                        kk = JSON.parse(message);
                    }
                    catch (ex) {
                        ws.send(JSON.stringify({ status: `Data format error! [${message}]` }));
                        return ws.close();
                    }
                    const key = await openpgp_1.readKey({ armoredKey: kk.device_armor });
                    const device = key.getKeyIds()[1].toHex().toUpperCase();
                    if (!device) {
                        const sendData = { status: `Error: device_armor have not subkey!`, key_ids: `${key.getKeyIds().map(n => n.toHex().toUpperCase())}` };
                        ws.send(JSON.stringify(sendData));
                        console.log(util_1.inspect(sendData, false, 3, true));
                        return ws.close();
                    }
                    ws.publicKeyID = device;
                    this.connect_peer_pool.push(ws);
                    const sendData = { key_ids: `${key.getKeyIds().map(n => n.toHex().toUpperCase())}` };
                    ws.send(JSON.stringify(sendData));
                    console.log(util_1.inspect(sendData, false, 3, true));
                    ws.once('close', () => {
                        const index = this.connect_peer_pool.findIndex(n => n.publicKeyID === device);
                        if (index > -1) {
                            this.connect_peer_pool.splice(index, 1);
                        }
                        console.log(`WS [${device}] on close`);
                    });
                });
            });
            this.localserver = app.listen(this.PORT, () => {
                return console.table([
                    { 'Kloak Local Server': `http://localhost:${this.PORT}, local-path = [${folder}]` }
                ]);
            });
            this.localserver.on('upgrade', (request, socket, head) => {
                if (/\/connectToSeguro/.test(request.url)) {
                    return wsServerConnect.handleUpgrade(request, socket, head, ws => {
                        return wsServerConnect.emit('connection', ws, request);
                    });
                }
                if (/\/peerToPeerConnecting/.test(request.url)) {
                    return wsServerConnect.handleUpgrade(request, socket, head, ws => {
                        return wsServerConnect.emit('peerToPeerConnecting', ws, request);
                    });
                }
                console.log(`unallowed ${request.url} `);
                return socket.destroy();
            });
        };
        this.initialize();
    }
    end() {
        this.localserver.close();
    }
    postMessageToLocalDevice(device, encryptedMessage) {
        const index = this.connect_peer_pool.findIndex(n => n.publicKeyID === device);
        if (index < 0) {
            return console.log(util_1.inspect({ postMessageToLocalDeviceError: `this.connect_peer_pool have no publicKeyID [${device}]` }, false, 3, true));
        }
        const ws = this.connect_peer_pool[index];
        const sendData = { encryptedMessage: encryptedMessage };
        console.log(util_1.inspect({ ws_send: sendData }, false, 3, true));
        return ws.send(JSON.stringify(sendData));
    }
}
exports.default = LocalServer;
