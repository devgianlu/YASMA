import React, {FunctionComponent, Reducer, useContext, useEffect, useState} from 'react'
import {Badge, ListGroup} from 'react-bootstrap'
import {HomepageContext} from '../pages/homapage/context'
import {ChatItem, ChatMessage} from '../types'
import db from '../p2p/db'
import AddContactModal from './AddContactModal'
import {useReducerAsync} from 'use-reducer-async'

const ChatItem: FunctionComponent<{ item: ChatItem }> = ({item}) => {
	const ctx = useContext(HomepageContext)
	const [lastMessage, setLastMessage] = useState<ChatMessage>()
	const [unreadMessages, setUnreadMessages] = useState<number>(0)

	useEffect(() => {
		db.getLastMessage(item.peer).then(setLastMessage)
		db.getUnreadMessagesCount(item.peer).then(setUnreadMessages)
	}, [item.peer])

	return (<ListGroup.Item
		as="li" action key={item.peer}
		className="d-flex justify-content-between align-items-start"
		style={{cursor: 'pointer'}}
		active={item === ctx.current}
		onClick={() => {
			if (item === ctx.current) ctx.setCurrent(undefined)
			else ctx.setCurrent(item)
		}}
	>
		<div className="ms-2 me-auto">
			<div className="fw-bold">{item.username}</div>
			{lastMessage ? lastMessage.text : <i>no messages</i>}
		</div>
		{unreadMessages > 0 && (
			<Badge bg="danger" pill>{unreadMessages}</Badge>
		)}
	</ListGroup.Item>)
}

type State = {
	chats: ChatItem[]
}

type AsyncAction = { type: 'UPDATE_LIST' }
type Action = { type: 'FINISH_UPDATE', chats: ChatItem[] }

const reducer = (state: State, action: Action): State => {
	switch (action.type) {
		case 'FINISH_UPDATE':
			return {...state, chats: action.chats}
	}

	return {...state}
}

const ChatList: FunctionComponent = () => {
	const [addContactShow, setAddContactShow] = useState(false)
	const [state, dispatch] = useReducerAsync<Reducer<State, Action>, AsyncAction, AsyncAction>(reducer, {chats: []}, {
		UPDATE_LIST: ({dispatch}) => async () => {
			const chats = await db.getChats()
			dispatch({type: 'FINISH_UPDATE', chats})
		}
	})

	// Trigger initial update
	useEffect(() => dispatch({type: 'UPDATE_LIST'}), [])

	db.on('chats', () => dispatch({type: 'UPDATE_LIST'}))

	return (<>
		<AddContactModal show={addContactShow} onHide={() => setAddContactShow(false)}/>
		<ListGroup as="ol" variant="flush">
			{state.chats.map(x => <ChatItem key={x.peer} item={x}/>)}
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