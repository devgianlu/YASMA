import React from 'react';
import ReactDOM from 'react-dom/client';
import Router from './Router';
import {registerServiceWorker} from './workbox';

import 'bootstrap/dist/css/bootstrap.min.css';

const root = ReactDOM.createRoot(
	document.getElementById('root') as HTMLElement
);
root.render(
	<React.StrictMode>
		<Router/>
	</React.StrictMode>
);

void registerServiceWorker()