import * as React from 'react'
import {FunctionComponent, useCallback, useEffect, useState} from 'react'
import {Button, Modal, ModalProps, Form, Spinner} from 'react-bootstrap'
import {startChat} from '../p2p'

const AddContactModal: FunctionComponent<ModalProps> = (props) => {
	const [state, setState] = useState<'PENDING' | 'CONNECTING' | 'ERROR' | 'SUCCESS'>('PENDING')
	const [uuid, setUuid] = useState('')
	const [username, setUsername] = useState('')

	useEffect(() => {
		if (!props.show)
			return

		setState('PENDING')
		setUuid('')
		setUsername('')
	}, [props.show])

	const addContact = useCallback(() => {
		if (!uuid.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/))
			return

		setState('CONNECTING')
		startChat(`yasma_${uuid}`)
			.then(chat => {
				setUsername(chat.username)
				setState('SUCCESS')
			})
			.catch(err => {
				console.error(`Failed connecting to peer ${uuid}`, err)
				setState('ERROR')
			})
	}, [uuid, props.onHide])

	return (<Modal {...props} size="lg" centered>
		<Modal.Header closeButton={state !== 'CONNECTING'}>
			<Modal.Title id="contained-modal-title-vcenter">
				Add Contact
			</Modal.Title>
		</Modal.Header>
		<Modal.Body>
			{(state === 'PENDING' || state === 'CONNECTING') && <>
				<span>Insert your contact UUID to connect:</span>
				<Form.Control disabled={state === 'CONNECTING'} type="text"
											placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" minLength={36} maxLength={36}
											value={uuid} onChange={e => setUuid(e.target.value.toLowerCase())}
				/>
				<p className="text-danger text-opacity-75">The other user must be online in order for the connection to
					work!</p>
			</>}
			{state === 'SUCCESS' && <p className="text-success">Connected successfully to <code>{username}</code>!</p>}
			{state === 'ERROR' && <p className="text-danger">Failed connecting to user!</p>}
		</Modal.Body>
		{(state === 'PENDING' || state === 'CONNECTING') && <Modal.Footer>
			<Button onClick={addContact} disabled={state === 'CONNECTING'}>
				{state === 'CONNECTING' && <Spinner as="span" animation="border" size="sm" role="status"/>}
				Add
			</Button>
		</Modal.Footer>}
	</Modal>)
}

export default AddContactModal