import React, {FunctionComponent, useCallback, useState} from 'react'
import {Button, Col, Form, Row, Stack} from 'react-bootstrap'
import {firstSetup} from '../p2p'


const Init: FunctionComponent = () => {
	const [username, setUsername] = useState('')
	const [passphrase, setPassphrase] = useState('')
	const [failed, setFailed] = useState(false)

	const doInit = useCallback(() => {
		firstSetup(username, passphrase)
			.then(() => window.location.reload())
			.catch(err => {
				console.error(`first setup failed: ${err.message}`)
				setFailed(true)
			})
	}, [username, passphrase])

	return (
		<Row className="h-100 align-items-center justify-content-center mx-0">
			<Col xs={11} md={5}>
				<Stack gap={2} className="text-center">
					<h1>YASMA</h1>
					<Form.Control
						type="text"
						placeholder="Username"
						value={username}
						minLength={3}
						onChange={ev => setUsername(ev.target.value)}
					/>
					<Form.Control
						type="password"
						placeholder="Passphrase"
						value={passphrase}
						minLength={3}
						onChange={ev => setPassphrase(ev.target.value)}
					/>
					{failed && (
						<h4 className="text-danger">First setup failed</h4>
					)}
					<Button variant="primary" onClick={() => doInit()}>Enter</Button>
				</Stack>
			</Col>
		</Row>
	)
}

export default Init