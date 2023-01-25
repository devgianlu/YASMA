import React from 'react'
import ReactDOM from 'react-dom/client'
import Router from './router'
import 'bootstrap/dist/css/bootstrap.min.css'
import {deinit} from './p2p'
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
})

window.addEventListener('unload', () => {
	deinit()
})
