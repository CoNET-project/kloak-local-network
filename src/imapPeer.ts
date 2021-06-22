import { EventEmitter } from 'events'
import { getMailSubject, getMailAttached, saveLog, qtGateImap, qtGateImapRead } from './Imap'
import { waterfall, series, eachSeries } from 'async'
import { v4 } from 'uuid'
import { inspect } from 'util'

const resetConnectTimeLength = 1000 * 60 * 10
const pingPongTimeOut = 1000 * 10
const debug = true

export const seneMessageToFolder = ( IMapConnect: imapConnect, writeFolder: string, message: string, subject: string, createFolder: boolean, CallBack ) => {
    const wImap = new qtGateImap ( IMapConnect, null, false, writeFolder, debug, null, true  )
    let _callback = false
    //console.log ( `seneMessageToFolder !!! ${ subject }`)
    wImap.once ( 'error', err => {
        wImap.destroyAll ( err )
        if ( !_callback ) {
            CallBack ( err )
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
            return CallBack ( err )
        })
    })

}


export class imapPeer extends EventEmitter {

    public domainName = ''
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
    public imapEnd = false

    private restart_rImap () {

        console.dir ( 'restart_rImap' )
        if ( this.rImap_restart ) {
            return console.log (`already restart_rImap STOP!`)
        }

        this.rImap_restart = true

        return this.destroy ( null )

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

        if ( attr.length < 1 ) {
            return console.log ( inspect ({ "skip old ping": subject }, false, 3, true ))
        }


        if ( attr.length < 100 ) {

            const _attr = attr.split (/\r?\n/)[0]

            if ( !this.connected && !this.pinging ) {
                //this.Ping ( false )
            }


            console.log (`\n\nthis.replyPing [${_attr }]\n\n this.ping.uuid = [${ this.pingUuid }]`)

            return this.replyPing ( subject )

        }


        /**
         * 			ignore old mail
         */
        // if ( ! this.connected ) {
        //     return
        // }

        return this.newMail ( attr, subject )

    }


    private replyPing ( uuid ) {
        console.log (`\n\nreplyPing = [${ uuid }]\n\n`)
        return this.AppendWImap1 ( uuid, uuid, err => {
            if ( err ) {
                debug ? saveLog (`reply Ping ERROR! [${ err.message ? err.message : null }]`): null
            }
        })

    }

    public AppendWImap1 ( mail: string, uuid: string, CallBack ) {
        const sendData = mail ? Buffer.from (mail).toString ( 'base64' ) : ''
        return seneMessageToFolder ( this.imapData, this.writeBox, sendData , uuid, true, CallBack )

    }

    private setTimeOutOfPing ( sendMail: boolean ) {
        console.trace (`setTimeOutOfPing [${ this.pingUuid }]`)
        clearTimeout ( this.waitingReplyTimeOut )
        clearTimeout ( this.needPingTimeOut )
        debug ? saveLog ( `Make Time Out for a Ping, ping ID = [${ this.pingUuid }]`, true ): null

        return this.waitingReplyTimeOut = setTimeout (() => {
            debug ? saveLog ( `ON setTimeOutOfPing this.emit ( 'pingTimeOut' ) pingID = [${ this.pingUuid }] `, true ): null
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

        if ( this.imapEnd || this.makeRImap || this.rImap && this.rImap.imapStream && this.rImap.imapStream.readable  ) {
            return debug ? saveLog (`newReadImap have rImap.imapStream.readable = true, stop!`, true ): null
        }

        this.rImap_restart = false
        this.makeRImap = true
        console.log ( inspect ({ newReadImap: new Error ('newReadImap')}, false, 3, true ) )


        this.rImap = new qtGateImapRead ( this.imapData, this.listenBox, debug, email => {
            this.mail ( email )
        })

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
                return this.destroy ( null )
            }

            if ( this.rImap && this.rImap.destroyAll && typeof this.rImap.destroyAll === 'function') {

                this.rImap.destroyAll ( null )
                return this.destroy ( null )
            }

        })

        this.rImap.on ( 'end', err => {

            console.log ( inspect ( { "this.rImap.on ( 'end' )": err }, false, 3, true ))

        })
    }

    constructor ( public imapData: imapConnect, private listenBox: string, private writeBox: string, public newMail, public exit: ( err?: number ) => void ) {
        super ()
        this.domainName = this.imapData.imapUserName.split('@')[1]
        debug ? saveLog ( `doing peer account [${ imapData.imapUserName }] listen with[${ listenBox }], write with [${ writeBox }] `): null
        console.dir ( `newMail = ${ typeof newMail }` )
        this.newReadImap ()

    }

    public closePeer ( CallBack ) {
        this.imapEnd = true
        this.AppendWImap1 ( '', 'Close.', err => {
            if ( typeof this.rImap?.logout === 'function') {
                return this.rImap.logout ( CallBack )
            }
            return CallBack ()
        })

    }

    private cleanupImap ( err ) {
        this.rImap.removeAllListeners ()
        this.rImap = null
        this.doingDestroy = false
        if ( this.restart_rImap ) {
            return this.newReadImap ()
        }
        if ( err && typeof this.exit === 'function' ) {
            this.exit ( err )
            return this.exit = null
        }
        console.log ( inspect ({ restart_rImap: `restart listenIMAP with restart_rImap false!`}, false, 3, true ))
        this.newReadImap ()
    }

    public destroy ( err? ) {

        clearTimeout ( this.waitingReplyTimeOut )
        clearTimeout ( this.needPingTimeOut )
        clearTimeout ( this.checkSocketConnectTime )
        console.log ( inspect ({ destroy: new Error ()}, false, 3, true ))

        if ( this.doingDestroy ) {
            return console.log (`destroy but this.doingDestroy = ture`)
        }

        this.doingDestroy = true
        this.peerReady = false

        if ( typeof this.rImap?.imapStream?.loginoutWithCheck ) {
            console.log ( inspect ({ destroy: `imapStream?.loginoutWithCheck()`}))
            return this.rImap?.imapStream?.loginoutWithCheck (() => {


                return this.cleanupImap ( err )

            })
        }

        return this.cleanupImap ( err )
    }

    public sendDataToANewUuidFolder ( data: string, writeBox: string, subject: string, CallBack ) {

        return seneMessageToFolder ( this.imapData, writeBox, data, subject, !this.connected, CallBack )
    }

}
