import express = require('express');
import http = require('http');
import bodyParser = require('body-parser');
import multer = require('multer');
import path = require('path');
import jszip = require('jszip');
const fse = require('fs-extra');
import * as Imap from './Imap';

class LocalServer {
    private appsPath = path.normalize(__dirname + '/../apps/');
    private server: http.Server | null = null;
    constructor(private PORT = 3000) {
        this.initialize();
    }

    private unzipApplication = async (buffer: Buffer) => {
        return jszip
            .loadAsync(buffer)
            .then((zip) => {
                zip.forEach(async (relativePath, file) => {
                    if (file.dir) {
                        const dirPath = path.normalize(
                            this.appsPath + relativePath
                        );
                        try {
                            await fse.mkdir(dirPath);
                        } catch (err) {
                            return;
                        }
                    } else {
                        file.async('nodebuffer').then(async (data) => {
                            const filePath = path.normalize(
                                this.appsPath + relativePath
                            );
                            await fse.writeFile(filePath, data);
                        });
                    }
                });
            })
            .catch((err) => {
                throw err;
            });
    };

    public close = () => {
        this.server?.close();
    };

    private initialize = async () => {
        await fse.ensureDir(this.appsPath);
        const upload = multer();
        const app = express();

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

        app.once('error', (err: any) => {
            return process.exit(1);
        });

        app.get('/', async (req: express.Request, res: express.Response) => {
            const launcherHTMLPath = path.join(
                this.appsPath + 'launcher' + 'index.html'
            );
            const hasLauncher = await fse.pathExists(launcherHTMLPath);
            if (hasLauncher) {
                return res.sendFile(launcherHTMLPath);
            }
			return res.status(200).send("<p style='font-family: Arial, Helvetica, sans-serif;'>Oh no! You don't have the Kloak Platform Launcher!</p>")
        });

        // app.post('/request', (req: express.Request, res: express.Response) => {
        // 	const { requestUuid } = req.body

        // })

        app.post(
            '/update',
            upload.single('app_data'),
            (req: express.Request, res: express.Response) => {
                const { app_id } = req.body;
                const { file } = req;
                if (file.mimetype !== 'application/zip') {
                    res.sendStatus(400);
                    return res.end();
                }
                const rootFolder = path.normalize(this.appsPath + app_id);
                fse.remove(rootFolder, (err: any) => {
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
            }
        );

        app.post('/testImap', (req: express.Request, res: express.Response) => {
            let { body } = req;
            if (
                !body.imapServer ||
                !body.imapUserName ||
                !body.imapUserPassword ||
                !body.imapPortNumber
            ) {
                res.sendStatus(400);
                return res.end();
            }
            return Imap.imapAccountTest(body, (err: any) => {
                if (err) {
                    res.sendStatus(400);
                    return res.end();
                }
                res.sendStatus(200);
                return res.end();
            });
        });

        this.server = app.listen(this.PORT, () => {
            console.table([
                { 'Kloak Local Server': `http://localhost:${this.PORT}` }
            ]);
        });
    };
}

export default LocalServer;