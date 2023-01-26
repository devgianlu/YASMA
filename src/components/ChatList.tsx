import React, {FunctionComponent, useContext, useEffect, useState} from 'react'
import {Badge, ListGroup} from 'react-bootstrap'
import {HomepageContext} from '../pages/homapage/context'
import {ChatItem, ChatMessage} from '../types'
import db, {ChatEvent} from '../p2p/db'
import AddContactModal from './AddContactModal'
import manager, {PeerEvent} from '../p2p/peer'
import enc from '../p2p/enc'

const ChatListItem: FunctionComponent<{ item: ChatItem, online: boolean }> = ({item, online}) => {
	const ctx = useContext(HomepageContext)
	const [lastMessage, setLastMessage] = useState<ChatMessage>()
	const [unreadMessages, setUnreadMessages] = useState<number>(0)

	useEffect(() => {
		const onChat = ({peer}: ChatEvent) => {
			if (peer !== item.peer)
				return

			db.getLastMessage(peer).then(setLastMessage)
			db.getUnreadMessagesCount(peer).then(setUnreadMessages)
		}
		db.on('chat', onChat)

		db.getLastMessage(item.peer).then(setLastMessage)
		db.getUnreadMessagesCount(item.peer).then(setUnreadMessages)

		return () => db.off('chat', onChat)
	}, [item.peer])

	return (<ListGroup.Item
		as="li" action key={item.peer}
		className={'d-flex justify-content-between align-items-start' + (item === ctx.current ? ' bg-dark bg-opacity-25' : '')}
		style={{cursor: 'pointer'}}
		onClick={() => {
			if (item === ctx.current) ctx.setCurrent(undefined)
			else ctx.setCurrent(item)
		}}
	>
		<div className="ms-2 me-auto text-truncate">
			<div className={'fw-bold ' + (online ? 'text-success' : 'text-danger')}>{item.username}</div>
			{lastMessage ?
				(lastMessage.file ? lastMessage.content.split('\x00')[0] : lastMessage.content)
				: <i>no messages</i>
			}
		</div>
		{unreadMessages > 0 && (
			<Badge bg="danger" pill>{unreadMessages}</Badge>
		)}
	</ListGroup.Item>)
}

const ChatList: FunctionComponent = () => {
	const [chats, setChats] = useState<ChatItem[]>([])
	const [publicFp, setPublicFp] = useState('')
	const [online, setOnline] = useState<{ [key: string]: boolean }>({})
	const [addContactShow, setAddContactShow] = useState(false)

	useEffect(() => {
		enc.publicFingerprint()
			.then(setPublicFp)
			.catch(err => {
				console.error(`failed getting public key fingerprint: ${err.message}`)
				setPublicFp('error')
			})
	}, [])

	useEffect(() => {
		const onChats = () => {
			db.getChats().then(setChats)
		}
		db.on('chats', onChats)

		// Trigger initial update
		onChats()

		return () => db.off('chats', onChats)
	}, [])

	useEffect(() => {
		const onPeer = ({peer, online: peerOnline}: PeerEvent) => setOnline({...online, [peer]: peerOnline})
		manager.on('peer', onPeer)
		return () => manager.off('peer', onPeer)
	}, [online])

	return (<div className="d-flex flex-column h-100">
		<AddContactModal show={addContactShow} onHide={() => setAddContactShow(false)}/>
		<ListGroup as="ol" variant="flush" className="flex-grow-1 overflow-auto" style={{height: 0}}>
			{chats.map(x => <ChatListItem key={x.peer} online={!!online[x.peer]} item={x}/>)}
			<ListGroup.Item
				as="li" action key="__add__"
				className="text-center"
				style={{cursor: 'pointer'}}
				onClick={() => setAddContactShow(true)}
			>
				Add contact
			</ListGroup.Item>
		</ListGroup>
		<div className="bg-dark text-white p-2 text-center d-grid">
			<small className="fw-bold">{manager.username}</small>
			<small>{manager.peerId.replace('yasma_', '')}</small>
			<small>{publicFp}</small>
		</div>
	</div>)
}

export default ChatList