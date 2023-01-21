import React, {FunctionComponent} from 'react'
import {Routes} from 'react-router'
import {BrowserRouter, Route} from 'react-router-dom'

import Homepage from './pages/homapage'
import {Container} from 'react-bootstrap'

const Router: FunctionComponent = () => {
	return (
		<Container className="h-100" fluid>
			<BrowserRouter>
				<Routes>
					<Route path="/" element={<Homepage/>}/>
				</Routes>
			</BrowserRouter>
		</Container>
	)
}

export default Router