import React from 'react'
import ReactDOM from 'react-dom/client'
import Router from './Router'

import 'bootstrap/dist/css/bootstrap.min.css'
import {deinit, init, initEncryption} from './p2p'
import {initNotifications} from './p2p/notification'
import db from './p2p/db'
import enc from './p2p/enc'

const root = ReactDOM.createRoot(
	document.getElementById('root') as HTMLElement
)
root.render(
	<React.StrictMode>
		<Router/>
	</React.StrictMode>
)

window.addEventListener('load', () => {
	initNotifications()

	initEncryption()
		.then(async ({username, key, id, masterKey}) => {
			db.setKey(key)
			await enc.setMasterKey(masterKey)
			await init(id, username)
		})
		.catch(err => console.error(`failed initializing: ${err.message}`))
})

window.addEventListener('unload', () => {
	deinit()
})
