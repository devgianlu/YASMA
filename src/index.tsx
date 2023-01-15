import React from 'react'
import ReactDOM from 'react-dom/client'
import Router from './Router'

import 'bootstrap/dist/css/bootstrap.min.css'
import {init} from './p2p'

const root = ReactDOM.createRoot(
	document.getElementById('root') as HTMLElement
)
root.render(
	<React.StrictMode>
		<Router/>
	</React.StrictMode>
)

window.addEventListener('load', () => {
	void init()
})
