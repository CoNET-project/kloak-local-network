import { connect } from 'tls'
import { each } from 'async'

import { qtGateImapRead, getMailAttached } from './Imap'
import { seneMessageToFolder, imapPeer } from './imapPeer'

import { inspect } from 'util'

const connerver = ( imapServer: string, CallBack ) => {
    let err = null
    let time

    const _connect = () => {
        time = new Date ().getTime () - startTime
        conn.end ()
        return CallBack ( null, time )
    }

    const startTime = new Date ().getTime ()
    const conn = connect ( { host: imapServer, servername: imapServer, port: 993 }, _connect )

    conn.once ( 'error', _err => {
        err = _err
        if ( typeof conn.destroy === 'function') {
            conn.destroy ()
        }
        CallBack ( err )
    })

    conn.once ( 'timeout', () => {
        err = new Error ('timeout')
        if ( typeof conn.destroy === 'function') {
            conn.destroy ()
        }
        CallBack ( err )
    })

}

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
export const testImapServer = ( CallBack ) => {
    const imapServers = ['imap.gmail.com', 'imap.mail.yahoo.com','imap.mail.me.com','outlook.office365.com','imap.zoho.com']
    const ret = []
    each ( imapServers, ( n, next ) => {
        return connerver ( n, ( err, data ) => {
            ret.push ({ name: n, err: err, time: data })
            next ()
        })
    }, () => {
        return CallBack ( null, ret )
    })
}

const buildConnectGetImap = ( requestObj: connectRequest, CallBack ) => {
    const imapData: imapConnect = {
        imapPortNumber: requestObj.imap_account.imap_port_number,
        imapUserName: requestObj.imap_account.imap_username,
        imapUserPassword: requestObj.imap_account.imap_user_password,
        imapSsl: true,
        imapServer: requestObj.imap_account.imap_server
    }

    let appendCount = 0
    let timeout = requestObj.encrypted_response = null
    console.log ( inspect ( imapData, false, 3, true ))

    requestObj.error = null

    const newMail = mail => {
        requestObj.encrypted_response = getMailAttached ( mail )
        return cleanUp ()
    }

    const cleanUp = () => {
        clearTimeout ( timeout )
        return rImap.logout (() => {
            CallBack ( null, requestObj )
        })
    }

    const sendMessage = () => {
        return seneMessageToFolder ( imapData, requestObj.server_folder, Buffer.from ( requestObj.encrypted_request ).toString ('base64'), '', false, err => {
            if ( err ) {
                console.log ( err )
                if ( ++ appendCount > 3 ) {
                    requestObj.error = `IMAP server append error!`
                    return cleanUp ()
                }
                return sendMessage ()
            }
            timeout = setTimeout (() => {
                requestObj.error = 'Listening time out!'
                return cleanUp ()
            }, 15000 )
        })
    }

    const rImap = new qtGateImapRead ( imapData, requestObj.client_folder_name, false, newMail, false )

    rImap.once ( 'ready', () => {
        return sendMessage ()
    })


}

export const buildConnect = ( reponseJson: connect_imap_reqponse, CallBack ) => {


    if ( ! reponseJson ) {
        return CallBack ( new Error ('Data format error!'))
    }
    const imapData: imapConnect = {
        imapPortNumber: reponseJson.imap_account.imap_port_number,
        imapServer: reponseJson.imap_account.imap_server,
        imapSsl: true,
        imapUserName: reponseJson.imap_account.imap_username,
        imapUserPassword: reponseJson.imap_account.imap_user_password
    }
    const newMessage = message => {
        CallBack ( null, { encryptedMessage: message })
    }

    const exit = err => {
        CallBack ( null, { status: 'End.'} )
    }

    const uu = new imapPeer ( imapData, reponseJson.client_folder, reponseJson.server_folder, newMessage, exit )

    uu.on ( 'CoNETConnected', () => {
        CallBack ( null,  { status: 'Connected to Seguro network.', connectUUID: uu.serialID })
    })

    uu.on ( 'ready', () => {
        CallBack ( null, { status: 'Connect to email server, waiting Seguro response.', connectUUID: uu.serialID })
    })

    return uu
}
/**
 *
 * @param requestObj: connectRequest, request object
 * @param encryptedMessage: string, Encrypted with Seguro public key and sign by device key
 * @param CallBack: ( err: Error, response: connectRequest ), response from Seguro | Error
 */
export const getInformationFromSeguro = ( requestObj: connectRequest, CallBack ) => {
    return buildConnectGetImap ( requestObj, CallBack )
}
