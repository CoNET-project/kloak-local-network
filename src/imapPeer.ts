import { EventEmitter } from 'events'
import { getMailSubject, getMailAttached, saveLog, qtGateImap, qtGateImapRead } from './Imap'
import { waterfall, series, eachSeries } from 'async'
import { v4 } from 'uuid'

const resetConnectTimeLength = 1000 * 60 * 15
const pingPongTimeOut = 1000 * 15
const debug = true

export const sendMessageToFolder = ( IMapConnect: imapConnect, writeFolder: string, message: string, subject: string, createFolder: boolean, callback ) => {
    const wImap = new qtGateImap ( IMapConnect, null, false, writeFolder, debug, null )
    let _callback = false
    //console.log ( `seneMessageToFolder !!! ${ subject }`)
    wImap.once ( 'error', err => {
        wImap.destroyAll ( err )
        if ( !_callback ) {
            callback ( err )
            return _callback = true
        }
    })

    wImap.once ( 'ready', () => {
        series ([
            next => {
                if ( !createFolder ) {
                    return next ()
                }
                return wImap.imapStream.createBox ( false, writeFolder, next )
            },
            next => wImap.imapStream.appendStreamV4 ( message, subject, writeFolder, next ),
            next => wImap.imapStream._logoutWithoutCheck ( next )
        ], err => {
            _callback = true
            if ( err ) {
                wImap.destroyAll ( err )

            }
            return callback ( err )
        })
    })

}


export class imapPeer extends EventEmitter {

    public domainName = this.imapData.imapUserName.split('@')[1]
    private waitingReplyTimeOut: NodeJS.Timer = null
    public pingUuid = null
    private doingDestroy = false

    public peerReady = false
    private makeRImap = false
    public needPingTimeOut = null

    public pinging = false
    public connected = false
    public rImap_restart = false
    public checkSocketConnectTime = null
    public serialID = v4()

    private restart_rImap () {

        console.dir ( 'restart_rImap' )
        if ( this.rImap_restart ) {
            return console.log (`already restart_rImap STOP!`)
        }

        this.rImap_restart = true

        if ( typeof this.rImap?.imapStream?.loginoutWithCheck === 'function') {
            return this.rImap.imapStream.loginoutWithCheck (() => {
                if ( typeof this.exit === 'function') {
                    this.exit (0)
                }
            })
        }
        if ( typeof this.exit === 'function') {
            this.exit (0)
        }


    }

    public checklastAccessTime () {
        clearTimeout ( this.checkSocketConnectTime )
        return this.checkSocketConnectTime = setTimeout (() => {
            return this.restart_rImap ()
        }, resetConnectTimeLength )
    }

    private mail ( email: Buffer ) {

        console.log (`imapPeer new mail:\n\n${ email.toString()} this.pingUuid = [${ this.pingUuid  }]`)
        const subject = getMailSubject ( email )
        const attr = getMailAttached ( email )



        /**
         * 			PING get PONG
         */
        if ( subject === this.pingUuid ) {
            this.pingUuid = null

            this.connected = true
            this.pinging = false
            clearTimeout ( this.waitingReplyTimeOut )
            return this.emit ('CoNETConnected', attr )
        }


        console.log ( ` subject = [${Buffer.from (subject).toString ('base64')}] this.pingUuid = [${ this.pingUuid }] base64 = [${ Buffer.from (this.pingUuid ).toString ('base64')}]`)
        if ( subject ) {

            /**
             *
             *
             *
             */


            if ( attr.length < 40 ) {
                console.log (`new attr\n${ attr }\n`)
                const _attr = attr.split (/\r?\n/)[0]

                if ( !this.connected && !this.pinging ) {
                    this.Ping ( false )
                }

                if ( subject === _attr ) {
                    console.log (`\n\nthis.replyPing [${_attr }]\n\n this.ping.uuid = [${ this.pingUuid }]`)

                    return this.replyPing ( subject )
                }
                console.log ( `this.pingUuid = [${ this.pingUuid  }] subject [${ subject }]`)
                return console.log (`new attr\n${ _attr }\n _attr [${ Buffer.from (_attr).toString ('hex') }] subject [${ Buffer.from ( subject ).toString ('hex') }]]!== attr 【${ JSON.stringify ( _attr )}】`)
            }





            /**
             * 			ignore old mail
             */
            if ( !this.connected ) {
                return
            }

            return this.newMail ( attr, subject )

        }
        console.log (`get mail have not subject\n\n`, email.toString() )

    }


    private replyPing ( uuid ) {
        console.log (`\n\nreplyPing = [${ uuid }]\n\n`)
        return this.AppendWImap1 ( uuid, uuid, err => {
            if ( err ) {
                debug ? saveLog (`reply Ping ERROR! [${ err.message ? err.message : null }]`): null
            }
        })

    }

    public AppendWImap1 ( mail: string, uuid: string, callback ) {

        return sendMessageToFolder ( this.imapData, this.writeBox, mail, uuid, true, callback )

    }

    private setTimeOutOfPing ( sendMail: boolean ) {
        console.trace (`setTimeOutOfPing [${ this.pingUuid }]`)
        clearTimeout ( this.waitingReplyTimeOut )
        clearTimeout ( this.needPingTimeOut )
        debug ? saveLog ( `Make Time Out for a Ping, ping ID = [${ this.pingUuid }]`, true ): null

        return this.waitingReplyTimeOut = setTimeout (() => {
            //debug ? saveLog ( `ON setTimeOutOfPing this.emit ( 'pingTimeOut' ) pingID = [${ this.pingUuid }] `, true ): null
            this.pingUuid = null
            this.connected = false
            this.pinging = false
            return this.emit ( 'pingTimeOut' )
        }, pingPongTimeOut )
    }

    public Ping ( sendMail: boolean ) {

        if ( this.pinging ) {
            return console.trace ('Ping stopd! pinging = true !')
        }
        this.pinging = true

        this.emit ( 'ping' )

        this.pingUuid = v4 ()
        debug ? saveLog ( `doing ping test! this.pingUuid = [${ this.pingUuid }], sendMail = [${ sendMail }]`, ): null

        return this.AppendWImap1 ( null, this.pingUuid, err => {

            if ( err ) {
                this.pinging = false
                this.pingUuid = null
                console.dir ( `PING this.AppendWImap1 Error [${ err.message }]`)
                return this.Ping ( sendMail )
            }
            return this.setTimeOutOfPing ( sendMail )
        })
    }

    public rImap: qtGateImapRead = null

    public newReadImap() {

        if ( this.makeRImap || this.rImap && this.rImap.imapStream && this.rImap.imapStream.readable ) {
            return debug ? saveLog (`newReadImap have rImap.imapStream.readable = true, stop!`, true ): null
        }
        this.makeRImap = true
        //saveLog ( `=====> newReadImap!`, true )


        this.rImap = new qtGateImapRead ( this.imapData, this.listenBox, debug, email => {
            this.mail ( email )
        }, true )

        this.rImap.once ( 'ready', () => {
            this.emit ( 'ready' )
            this.makeRImap = this.rImap_restart = false
            //debug ? saveLog ( `this.rImap.once on ready `): null
            this.Ping ( false )
            this.checklastAccessTime ()
        })

        this.rImap.on ( 'error', err => {
            this.makeRImap = false
            debug ? saveLog ( `rImap on Error [${ err.message }]`, true ): null
            if ( err && err.message && /auth|login|log in|Too many simultaneous|UNAVAILABLE/i.test ( err.message )) {
                return this.destroy (1)
            }
            if ( this.rImap && this.rImap.destroyAll && typeof this.rImap.destroyAll === 'function') {
                return this.rImap.destroyAll ( null )
            }


        })

        this.rImap.on ( 'end', err => {
            this.rImap.removeAllListeners ()
            this.rImap = null
            this.makeRImap = false
            clearTimeout ( this.waitingReplyTimeOut )
            if ( this.rImap_restart ) {
                console.dir (`rImap.on ( 'end' ) this.rImap_restart = TRUE`, err )
            }


            if ( typeof this.exit === 'function') {
                debug ? saveLog (`imapPeer rImap on END!`): null

                this.exit ( err )
                return this.exit = null
            }
            debug ? saveLog (`imapPeer rImap on END! but this.exit have not a function `): null
        })
    }

    constructor ( public imapData: imapConnect, private listenBox: string, private writeBox: string, public newMail, public exit: ( err?: number ) => void ) {
        super ()
        debug ? saveLog ( `doing peer account [${ imapData.imapUserName }] listen with[${ listenBox }], write with [${ writeBox }] `): null
        console.dir ( `newMail = ${typeof newMail}` )
        this.newReadImap ()

    }

    public closePeer ( callback ) {
        return  series ([
            next => this.AppendWImap1 ('', 'Close.', next ),
            next => this.rImap.logout ( next )
        ], callback )

    }

    public destroy ( err? ) {

        clearTimeout ( this.waitingReplyTimeOut )
        clearTimeout ( this.needPingTimeOut )
        clearTimeout ( this.checkSocketConnectTime )
        console.log (`destroy IMAP!`)
        console.trace ()
        if ( this.doingDestroy ) {
            return console.log (`destroy but this.doingDestroy = ture`)
        }

        this.doingDestroy = true
        this.peerReady = false

        if ( this.rImap ) {
            return this.rImap.imapStream.loginoutWithCheck (() => {
                if ( typeof this.exit === 'function' ) {
                    this.exit ( err )
                    this.exit = null
                }

            })
        }

        if  ( this.exit && typeof this.exit === 'function' ) {
            this.exit ( err )
            this.exit = null
        }
    }

    public sendDataToANewUuidFolder ( data: string, writeBox: string, subject: string, CallBack ) {

        return sendMessageToFolder ( this.imapData, writeBox, data, subject, !this.connected, CallBack )
    }

}
