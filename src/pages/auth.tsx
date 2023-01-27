import React, {createContext, FunctionComponent, useCallback, useContext, useState} from 'react'
import {Button, Col, Form, Row, Stack} from 'react-bootstrap'
import {init, initEncryption} from '../p2p'
import db from '../p2p/db'
import enc from '../p2p/enc'
import {useNavigate} from 'react-router'

export const AuthContext = createContext<{ setAuth: (ok: boolean) => void }>({
	setAuth() {
		// stub
	}
})

const Auth: FunctionComponent = () => {
	const navigate = useNavigate()
	const {setAuth} = useContext(AuthContext)
	const [passphrase, setPassphrase] = useState('')
	const [error, setError] = useState('')

	const doAuth = useCallback(() => {
		initEncryption(passphrase)
			.then(async ({username, encKey, id, masterKey}) => {
				db.setSymmetricKey(encKey)
				
				try {
					await enc.setMasterKey(masterKey)
					await init(id, username)
				} catch (err) {
					setError('Failed initializing P2P')
					return
				}

				setAuth(true)
				navigate('/', {replace: true})
			})
			.catch(err => {
				console.error(`failed initializing: ${err.message}`)
				setError('The provided passphrase is invalid')
				setAuth(false)
			})
	}, [passphrase, navigate])

	return (
		<Row className="h-100 align-items-center justify-content-center mx-0">
			<Col xs={11} md={5}>
				<Stack gap={2} className="text-center">
					<h1>YASMA</h1>
					<Form.Control
						type="password"
						placeholder="Passphrase"
						value={passphrase}
						onChange={ev => {
							setError('')
							setPassphrase(ev.target.value)
						}}
						onKeyDown={ev => {
							if (ev.key === 'Enter') doAuth()
						}}/>
					{error && (
						<h4 className="text-danger">{error}</h4>
					)}
					<Button variant="primary" onClick={() => doAuth()}>Enter</Button>
				</Stack>
			</Col>
		</Row>
	)
}

export default Auth