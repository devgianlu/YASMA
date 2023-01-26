import React, {FunctionComponent, useMemo, useState} from 'react'
import {Navigate, Routes} from 'react-router'
import {BrowserRouter, Route} from 'react-router-dom'
import Homepage from './pages/homapage'
import Auth, {AuthContext} from './pages/auth'
import {setupRequired} from './p2p'
import Init from './pages/init'

const Router: FunctionComponent = () => {
	const [auth, setAuth] = useState(false)

	const routes = useMemo(() => {
		if (setupRequired()) {
			return [
				<Route key="home" path="/" element={<Navigate to="/init"/>}/>,
				<Route key="auth" path="/auth" element={<Navigate to="/init"/>}/>,
				<Route key="init" path="/init" element={<Init/>}/>
			]
		} else if (auth) {
			return [
				<Route key="home" path="/" element={<Homepage/>}/>,
				<Route key="auth" path="/auth" element={<Navigate to="/"/>}/>,
				<Route key="init" path="/init" element={<Navigate to="/"/>}/>
			]
		} else {
			return [
				<Route key="home" path="/" element={<Navigate to="/auth"/>}/>,
				<Route key="auth" path="/auth" element={<Auth/>}/>,
				<Route key="init" path="/init" element={<Navigate to="/auth"/>}/>
			]
		}
	}, [auth])

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	const publicPath: string = __publicPath__

	return (
		<AuthContext.Provider value={{setAuth}}>
			<BrowserRouter basename={publicPath}>
				<Routes>{routes}</Routes>
			</BrowserRouter>
		</AuthContext.Provider>
	)
}

export default Router