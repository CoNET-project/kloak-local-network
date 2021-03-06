const supertest = require('supertest')
import LocalServer from '../LocalServer'
const PORT = 3000
const url = `http://localhost:${PORT}`
const testServer = new LocalServer(PORT)
const request = supertest(url)
console.log = () => {}

describe("API Endpoints", () => {

	it("Should successfully connect to root launcher.", async (done) => {
		const response = await request.get("/")
		expect(response['status']).toBe(200)
		done()
	})

	it("Should pass IMAP test.", async (done) => {
		const response = await request.post('/testImap').send({
			imapUserName: "qtgate_test29@icloud.com",
			imapUserPassword: "tslh-ujpp-gbqj-wejo",
			imapPortNumber: "993",
			imapServer: "imap.mail.me.com"
		})
		expect(response['status']).toBe(200)
		done()
	})

	it("Should fail IMAP test. ", async (done) => {
		const response = await request.post('/testImap').send({
			imapUserName: "qtgate_test29@icloud.com",
			imapUserPassword: "123",
			imapPortNumber: "993",
			imapServer: "imap.mail.me.com"
		})
		expect(response['status']).toBe(400)
		testServer.close()
		done()
	})
})

