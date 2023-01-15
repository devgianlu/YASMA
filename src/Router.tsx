import React, {FunctionComponent} from 'react';
import {Routes} from 'react-router';
import {BrowserRouter, Route} from 'react-router-dom';

import Homepage from './pages/Homepage';
import {Container} from 'react-bootstrap';

const Router: FunctionComponent = () => {
	return (
		<Container>
			<BrowserRouter>
				<Routes>
					<Route path="/" element={<Homepage/>}/>
				</Routes>
			</BrowserRouter>
		</Container>
	);
};

export default Router;