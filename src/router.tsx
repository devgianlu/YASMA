import React, { FunctionComponent, useMemo, useState} from 'react'
import {Navigate, Routes} from 'react-router'
import {BrowserRouter, Route} from 'react-router-dom'
import Homepage from './pages/homapage'
import Auth, {AuthContext} from './pages/auth'

const Router: FunctionComponent = () => {
	const [auth, setAuth] = useState(false)

	const routes = useMemo(() => {
		if (auth) {
			return [
				<Route key="home" path="/" element={<Homepage/>}/>,
				<Route key="auth" path="/auth" element={<Navigate to="/"/>}/>
			]
		} else {
			return [
				<Route key="home" path="/" element={<Navigate to="/auth"/>}/>,
				<Route key="auth" path="/auth" element={<Auth/>}/>
			]
		}
	}, [auth])

	return (
		<AuthContext.Provider value={{setAuth}}>
			<BrowserRouter>
				<Routes>{routes}</Routes>
			</BrowserRouter>
		</AuthContext.Provider>
	)
}

export default Router