interface imapConnect {
	imapServer: string
	imapUserName: string
	imapUserPassword: string
	imapPortNumber: number | number[]
	imapSsl: boolean
	imapIgnoreCertificate?: boolean
}


interface imap_setup {
	imap_username: string
	imap_user_password: string
	imap_port_number: number
	imap_server: string
}

interface next_time_connect {
	imap_account: imap_setup
	server_folder: string
}

interface connect_imap_reqponse {
	imap_account: imap_setup
	server_folder: string
	client_folder: string
}

interface connectRequest {
	kloak_account_armor: string
	device_armor: string
	client_folder_name: string
	use_kloak_shared_imap_account: boolean
	imap_account?: imap_setup
	next_time_connect?: next_time_connect
	error?: string
	server_folder?: string
	encrypted_response?: string
	encrypted_request?: string
	connect_info?: connect_imap_reqponse
}

interface postData {
	connectUUID: string
	encryptedMessage: string
}


/**
 * 		for test
 */
interface connectRequest_test extends connectRequest {
	kloak_private?: string
	device_private?: string
	reponseJson?: connectRequest
}


