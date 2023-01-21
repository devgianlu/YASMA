import React, {FunctionComponent, useContext, useEffect, useState} from 'react'
import {Badge, ListGroup} from 'react-bootstrap'
import {HomepageContext} from '../pages/homapage/context'
import {ChatItem} from '../types'
import db from '../p2p/db'
import AddContactModal from './AddContactModal'

const ChatList: FunctionComponent = () => {
	const ctx = useContext(HomepageContext)
	const [addContactShow, setAddContactShow] = useState(false)
	const [chats, setChats] = useState<ChatItem[]>([])

	useEffect(() => {
		db.getChats().then(setChats)
	}, [])

	return (<>
		<AddContactModal show={addContactShow} onHide={() => setAddContactShow(false)}/>
		<ListGroup as="ol" variant="flush">
			{chats.map(x => (
				<ListGroup.Item
					as="li" action key={x.peer}
					className="d-flex justify-content-between align-items-start"
					style={{cursor: 'pointer'}}
					active={x === ctx.current}
					onClick={() => {
						if (x === ctx.current) ctx.setCurrent(undefined)
						else ctx.setCurrent(x)
					}}
				>
					<div className="ms-2 me-auto">
						<div className="fw-bold">{x.username}</div>
						{x.lastMessage ? x.lastMessage : <i>no messages</i>}
					</div>
					{x.unreadMessages > 0 && (
						<Badge bg="primary" pill>{x.unreadMessages}</Badge>
					)}
				</ListGroup.Item>
			))}
			<ListGroup.Item
				as="li" action key="__add__"
				className="text-center"
				style={{cursor: 'pointer'}}
				onClick={() => setAddContactShow(true)}
			>
				Add contact
			</ListGroup.Item>
		</ListGroup>
	</>)
}

export default ChatList