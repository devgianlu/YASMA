import React from 'react'
import ReactDOM from 'react-dom/client'
import Router from './Router'

import 'bootstrap/dist/css/bootstrap.min.css'
import {deinit, init} from './p2p'
import {initNotifications} from './p2p/notification'

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
	init().catch(err => console.error(`failed initializing: ${err.message}`))
})

window.addEventListener('unload', () => {
	deinit()
})
