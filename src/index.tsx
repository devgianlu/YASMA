import React from 'react'
import ReactDOM from 'react-dom/client'
import Router from './Router'

import 'bootstrap/dist/css/bootstrap.min.css'
import {deinit, init, initEncryption} from './p2p'
import {initNotifications} from './p2p/notification'
import db from './p2p/db'

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

	const {username, key, id} = initEncryption()
	db.setKey(key)

	init(id, username).catch(err => console.error(`failed initializing: ${err.message}`))
})

window.addEventListener('unload', () => {
	deinit()
})
