"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var express = require("express");
var bodyParser = require("body-parser");
var multer = require("multer");
var path = require("path");
var jszip = require("jszip");
var fse = require('fs-extra');
var Imap = require("./Imap");
var LocalServer = /** @class */ (function () {
    function LocalServer(PORT) {
        var _this = this;
        if (PORT === void 0) { PORT = 3000; }
        this.PORT = PORT;
        this.appsPath = path.normalize(__dirname + '/../apps/');
        this.server = null;
        this.unzipApplication = function (buffer) { return __awaiter(_this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, jszip
                        .loadAsync(buffer)
                        .then(function (zip) {
                        zip.forEach(function (relativePath, file) { return __awaiter(_this, void 0, void 0, function () {
                            var dirPath, err_1;
                            var _this = this;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!file.dir) return [3 /*break*/, 5];
                                        dirPath = path.normalize(this.appsPath + relativePath);
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        return [4 /*yield*/, fse.mkdir(dirPath)];
                                    case 2:
                                        _a.sent();
                                        return [3 /*break*/, 4];
                                    case 3:
                                        err_1 = _a.sent();
                                        return [2 /*return*/];
                                    case 4: return [3 /*break*/, 6];
                                    case 5:
                                        file.async('nodebuffer').then(function (data) { return __awaiter(_this, void 0, void 0, function () {
                                            var filePath;
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0:
                                                        filePath = path.normalize(this.appsPath + relativePath);
                                                        return [4 /*yield*/, fse.writeFile(filePath, data)];
                                                    case 1:
                                                        _a.sent();
                                                        return [2 /*return*/];
                                                }
                                            });
                                        }); });
                                        _a.label = 6;
                                    case 6: return [2 /*return*/];
                                }
                            });
                        }); });
                    })["catch"](function (err) {
                        throw err;
                    })];
            });
        }); };
        this.close = function () {
            var _a;
            (_a = _this.server) === null || _a === void 0 ? void 0 : _a.close();
        };
        this.initialize = function () { return __awaiter(_this, void 0, void 0, function () {
            var upload, app, _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, fse.ensureDir(this.appsPath)];
                    case 1:
                        _b.sent();
                        upload = multer();
                        app = express();
                        // TESTING PURPOSES
                        // app.use((req, res, next) => {
                        // 	// Website you wish to allow to connect
                        // 	res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5000');
                        // 	// Request methods you wish to allow
                        // 	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
                        // 	// Request headers you wish to allow
                        // 	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
                        // 	// Set to true if you need the website to include cookies in the requests sent
                        // 	// to the API (e.g. in case you use sessions)
                        // 	res.setHeader('Access-Control-Allow-Credentials', true);
                        // 	// Pass to next layer of middleware
                        // 	next();
                        // })
                        app.use(bodyParser.json());
                        app.use(express.static('static'));
                        app.use('/', express.static(path.join(__dirname, '../apps')));
                        app.once('error', function (err) {
                            return process.exit(1);
                        });
                        app.get('/', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                            var launcherHTMLPath, hasLauncher;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        launcherHTMLPath = path.join(this.appsPath + 'launcher' + 'index.html');
                                        return [4 /*yield*/, fse.pathExists(launcherHTMLPath)];
                                    case 1:
                                        hasLauncher = _a.sent();
                                        if (hasLauncher) {
                                            return [2 /*return*/, res.status(200).sendFile(launcherHTMLPath)];
                                        }
                                        return [2 /*return*/, res.status(200).send("<p style='font-family: Arial, Helvetica, sans-serif;'>Oh no! You don't have the Kloak Platform Launcher!</p>")];
                                }
                            });
                        }); });
                        // app.post('/request', (req: express.Request, res: express.Response) => {
                        // 	const { requestUuid } = req.body
                        // })
                        app.post('/update', upload.single('app_data'), function (req, res) {
                            var app_id = req.body.app_id;
                            var file = req.file;
                            if (file.mimetype !== 'application/zip') {
                                res.sendStatus(400);
                                return res.end();
                            }
                            var rootFolder = path.normalize(_this.appsPath + app_id);
                            fse.remove(rootFolder, function (err) {
                                if (err) {
                                    return res.sendStatus(400);
                                }
                                _this.unzipApplication(file.buffer)
                                    .then(function () {
                                    res.sendStatus(200);
                                })["catch"](function (err) {
                                    res.sendStatus(400);
                                });
                            });
                        });
                        app.post('/testImap', function (req, res) {
                            var body = req.body;
                            if (!body.imapServer ||
                                !body.imapUserName ||
                                !body.imapUserPassword ||
                                !body.imapPortNumber) {
                                res.sendStatus(400);
                                return res.end();
                            }
                            return Imap.imapAccountTest(body, function (err) {
                                if (err) {
                                    res.sendStatus(400);
                                    return res.end();
                                }
                                res.sendStatus(200);
                                return res.end();
                            });
                        });
                        _a = this;
                        return [4 /*yield*/, app.listen(this.PORT, function () {
                                console.table([
                                    { 'Kloak Local Server': "http://localhost:" + _this.PORT }
                                ]);
                            })];
                    case 2:
                        _a.server = _b.sent();
                        return [2 /*return*/];
                }
            });
        }); };
        this.initialize();
    }
    return LocalServer;
}());
exports["default"] = LocalServer;
