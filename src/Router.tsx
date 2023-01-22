import React, {FunctionComponent} from 'react'
import {Routes} from 'react-router'
import {BrowserRouter, Route} from 'react-router-dom'

import Homepage from './pages/homapage'

const Router: FunctionComponent = () => {
	return (
			<BrowserRouter>
				<Routes>
					<Route path="/" element={<Homepage/>}/>
				</Routes>
			</BrowserRouter>
	)
}

export default Router