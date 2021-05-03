const request = require('supertest');
const PORT = 3000;
const url = `http://localhost:${PORT}`;
console.log = () => { };
describe('API Endpoints', () => {
    it('Should successfully connect to root launcher.', async (done) => {
        const response = await request(url).get('/');
        expect(response['status']).toBe(200 || 304);
        done();
    });
    it("Should pass IMAP test.", async (done) => {
        const response = await request(url).post('/testImap').send({
            imapUserName: "qtgate_test29@icloud.com",
            imapUserPassword: "tslh-ujpp-gbqj-wejo",
            imapPortNumber: "993",
            imapServer: "imap.mail.me.com"
        });
        expect(response['status']).toBe(200);
        done();
    });
    it("Should fail IMAP test. ", async (done) => {
        const response = await request(url).post('/testImap').send({
            imapUserName: "qtgate_test29@icloud.com",
            imapUserPassword: "123",
            imapPortNumber: "993",
            imapServer: "imap.mail.me.com"
        });
        expect(response['status']).toBe(400);
        done();
    });
});
